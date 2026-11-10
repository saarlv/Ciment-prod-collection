/**
 * Start (or reuse) the standalone Vite dev server so a browser can load the app.
 *
 * Why this exists rather than the agent running `pnpm dev &` itself:
 *
 * - **The port is pinned.** The browser's seeded auth is per-ORIGIN storage state keyed on
 *   http://localhost:5173. A Vite that silently fell back to 5174 would serve the app at an
 *   origin the token does not cover, and the agent would meet a login screen with no clue why.
 *   `--strictPort` turns that into a loud failure instead.
 * - **Readiness is not "the command returned".** Vite prints its banner before the first
 *   request can be served; navigating too early yields a connection error the agent then
 *   misreads as a broken app.
 * - **Reuse.** A turn typically visits several pages. Booting a server per visit would add
 *   ~10-20s each time.
 *
 * Usage: node scripts/dev-server.mjs
 * Prints the URL on success; exits non-zero with the server log tail on failure.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The app root, resolved from this file rather than cwd so the script runs from anywhere. */
const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const PORT = 5173;
const ORIGIN = `http://localhost:${PORT}`;
const READY_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;
/** Outside the workspace: anything written inside it syncs back to the app as code. */
const LOG_DIR = '/tmp/blocks-dev-server';
const LOG_FILE = path.join(LOG_DIR, 'dev-server.log');

async function isUp() {
  try {
    // Any HTTP answer means the server is accepting connections; a 404 on `/` would still
    // prove liveness, so the status code is deliberately not checked.
    await fetch(ORIGIN, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

async function logTail() {
  try {
    const log = await readFile(LOG_FILE, 'utf-8');
    return log.split('\n').slice(-40).join('\n');
  } catch {
    return '(no server log)';
  }
}

async function main() {
  if (await isUp()) {
    process.stdout.write(`${ORIGIN}\n`);
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true });
  if (!existsSync(path.join(APP_DIR, 'node_modules'))) {
    process.stderr.write(
      'node_modules is missing — run `pnpm install` before starting the dev server.\n',
    );
    process.exit(1);
  }

  // Detached + piped to a file so the server outlives this process and its output stays
  // readable afterwards (the agent needs the log tail when a start fails).
  const out = openSync(LOG_FILE, 'a');
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--port',
      String(PORT),
      '--strictPort',
      '--configLoader',
      'runner',
    ],
    {
      cwd: APP_DIR,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env, VITE_BUILD_STANDALONE: '1' },
    },
  );
  child.unref();

  if (await waitUntilReady()) {
    process.stdout.write(`${ORIGIN}\n`);
    return;
  }

  process.stderr.write(
    `Dev server did not become ready on ${ORIGIN} within ${READY_TIMEOUT_MS / 1000}s.\n` +
      `Last log lines:\n${await logTail()}\n`,
  );
  process.exit(1);
}

await main();
