/**
 * Run vitest for one (or all) code actions under code-actions/.
 * Usage: pnpm test:action [ActionName]
 *
 * Resolves the action folder case-insensitively. With no arg, runs every
 * code-actions/<Name>/*.spec.ts. Specs are offline (mocked BlocksClient) -
 * they never deploy and are separate from `pnpm bundle:action`.
 */
import { spawn } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const codeActionsDir = join(root, 'code-actions');

async function listActionDirs() {
  try {
    const entries = await readdir(codeActionsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== 'shared')
      .map((e) => e.name);
  } catch {
    return [];
  }
}

async function resolveAction(requested) {
  const dirs = await listActionDirs();
  if (!requested) {
    return null;
  }
  const match = dirs.find(
    (name) => name.toLowerCase() === requested.toLowerCase(),
  );
  if (!match) {
    console.error(
      `No code action folder "${requested}" under code-actions/. Available: ${dirs.join(', ') || 'none'}.`,
    );
    process.exitCode = 1;
    return undefined;
  }
  return match;
}

async function resolveVitestBin() {
  const candidates = [
    join(root, 'node_modules', 'vitest', 'vitest.mjs'),
    join(root, 'node_modules', '.bin', 'vitest'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    'vitest not found under node_modules. Run pnpm install in the project root.',
  );
}

async function main() {
  const requested = process.argv[2]?.trim() || undefined;
  const actionName = await resolveAction(requested);
  if (actionName === undefined) {
    return;
  }

  const dirs = await listActionDirs();
  if (dirs.length === 0) {
    console.log('No code actions to test.');
    return;
  }

  const vitestBin = await resolveVitestBin();
  const args = [
    'run',
    '--no-color',
    '--config',
    'vitest.code-actions.config.ts',
    '--configLoader',
    'runner',
  ];
  if (actionName) {
    args.push(`code-actions/${actionName}`);
  }

  const child = spawn(process.execPath, [vitestBin, ...args], {
    cwd: root,
    stdio: 'inherit',
  });

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
