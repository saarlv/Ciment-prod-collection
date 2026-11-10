import { randomUUID } from 'node:crypto';
import { format } from 'node:util';

import {
  type BrowsingSession,
  closeBrowsingSession,
  readStagehandMetrics,
  startBrowsingSession,
} from './browsing.ts';

// Platform-owned credentials: cache at module load then DELETE from process.env so
// user-authored code can never read them.
//
// This only holds because the action is loaded LAZILY (see core()). A static
// `import { invoke } from './ai-generated-code.ts'` here would evaluate the user
// module BEFORE this module body — that is plain ESM order, and esbuild's CJS bundle
// preserves it — so user/AI-authored top-level code would observe every value below
// before a single `delete` ran. Never import the action statically from this file.
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
// Platform LLM key + model for AI (Stagehand) browsing. Present only when the
// deployer injected them; the key's presence selects the Stagehand path. The model
// comes from the 'anthropic-stagehand' secret's optional `model` field
// (browsing.ts falls back to its default when absent).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const STAGEHAND_MODEL = process.env.STAGEHAND_MODEL;
// The shared invoke secret is platform-owned too: it authenticates every call into this
// function, so user code must not be able to read (or leak) it either.
const SECRET_KEY = process.env.BLOCKS_SECRET_KEY;
delete process.env.BROWSERBASE_API_KEY;
delete process.env.BROWSERBASE_PROJECT_ID;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.STAGEHAND_MODEL;
delete process.env.BLOCKS_SECRET_KEY;

const isBrowsingTask = !!BROWSERBASE_API_KEY;

// Run logs: when the invoke asks for them (event.captureLogs), the action's console output also
// comes back with its result, so the app's activity log — and the builder chat reading it — can
// show what the run printed. It still goes to CloudWatch as before. The TAIL is kept: a failed
// run's last lines are the ones that explain it. wf-actions caps it again; this cap only bounds
// the memory one chatty action can hold here.
const RUN_LOGS_MAX_CHARS = 32_000;
// Marks the reply as { result, logs } rather than the action's own result. Only sent back to a
// caller that asked with captureLogs, so a caller that never asks still gets the result as is.
const RUN_ENVELOPE_KEY = '__blocksRunEnvelope';

class RunLogBuffer {
  private text = '';
  private droppedChars = 0;

  append(level: string, args: unknown[]): void {
    this.text += `${new Date().toISOString()} ${level} ${format(...args)}\n`;
    // Trim in batches, not per line, so a log-heavy action doesn't re-copy the buffer each call.
    if (this.text.length > RUN_LOGS_MAX_CHARS * 2) {
      const cut = this.text.length - RUN_LOGS_MAX_CHARS;
      this.droppedChars += cut;
      this.text = this.text.slice(cut);
    }
  }

  toString(): string {
    const over = Math.max(0, this.text.length - RUN_LOGS_MAX_CHARS);
    const dropped = this.droppedChars + over;
    const tail = this.text.slice(over);
    return dropped > 0
      ? `[${dropped} earlier characters truncated]\n${tail}`
      : tail;
  }
}

// User secrets are resolved by wf-actions on every invocation and arrive on the event, so a
// rotated secret takes effect without a redeploy. They are never in the Lambda env, and user code
// never sees the raw env (which holds the execution-role AWS credentials).
function buildUserSecrets(eventSecrets: unknown): Record<string, string> {
  return eventSecrets && typeof eventSecrets === 'object'
    ? (eventSecrets as Record<string, string>)
    : {};
}

async function core(
  event: any,
  runLogs: RunLogBuffer | undefined,
): Promise<{ result: any; authorized: boolean }> {
  // Fail closed: a missing/empty BLOCKS_SECRET_KEY must reject, never accept-all.
  if (!SECRET_KEY || event?.secretKey !== SECRET_KEY) {
    return {
      result: { success: false, error: 'Unauthorized' },
      authorized: false,
    };
  }

  const requestId = event?.requestId || randomUUID();
  const data = event?.payload ?? {};
  const context = event?.context ?? {};
  context.secrets = buildUserSecrets(event?.secrets);

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  const originalWarn = console.warn;
  const originalError = console.error;
  const wrap =
    (original: (...args: unknown[]) => void, level: string) =>
    (...args: unknown[]) => {
      original(`[${requestId}]`, ...args);
      runLogs?.append(level, args);
    };
  console.log = wrap(originalLog, 'INFO');
  console.info = wrap(originalInfo, 'INFO');
  console.debug = wrap(originalDebug, 'DEBUG');
  console.warn = wrap(originalWarn, 'WARN');
  console.error = wrap(originalError, 'ERROR');

  let browsingSession: BrowsingSession | undefined;
  let browsingArtifacts:
    | {
        sessionId: string;
        durationMs?: number;
        stagehandMetrics?: {
          promptTokens: number;
          completionTokens: number;
          model: string;
        };
      }
    | undefined;

  let sessionStartedAt = 0;

  try {
    // Loaded here, not at module scope: the platform credentials above are already out of
    // process.env by the time the user module's top-level code runs. esbuild's module
    // registry caches the initializer, so this costs one lookup per invocation.
    const { invoke } = await import('./ai-generated-code.ts');

    let result: any;
    if (isBrowsingTask) {
      sessionStartedAt = Date.now();
      browsingSession = await startBrowsingSession({
        browserbaseApiKey: BROWSERBASE_API_KEY!,
        browserbaseProjectId: BROWSERBASE_PROJECT_ID!,
        anthropicApiKey: ANTHROPIC_API_KEY,
        model: STAGEHAND_MODEL,
      });
      if (browsingSession.sessionId) {
        browsingArtifacts = { sessionId: browsingSession.sessionId };
      }

      result = await invoke(data, context, {
        stagehand: browsingSession.stagehand,
        browser: browsingSession.browser,
        page: browsingSession.page,
        context: browsingSession.context,
      });
      await new Promise((r) => setTimeout(r, 2000));
      // Attach by reference — finally populates durationMs/stagehandMetrics on this object.
      result = { ...result, _browsingArtifacts: browsingArtifacts };
    } else {
      result = await invoke(data, context, {});
    }
    return { result, authorized: true };
  } catch (error) {
    return {
      result: {
        success: false,
        error: String(error),
        stack: (error as Error).stack,
        ...(browsingArtifacts ? { _browsingArtifacts: browsingArtifacts } : {}),
      },
      authorized: true,
    };
  } finally {
    if (browsingArtifacts) {
      try {
        browsingArtifacts.durationMs = Date.now() - sessionStartedAt;
        // Stagehand (AI path) reports cumulative LLM token usage; undefined on the raw
        // Playwright path. STAGEHAND_MODEL is what those tokens were billed against.
        const metrics = await readStagehandMetrics(browsingSession);
        if (metrics && STAGEHAND_MODEL) {
          browsingArtifacts.stagehandMetrics = {
            ...metrics,
            model: STAGEHAND_MODEL,
          };
        }
      } catch (metricsError) {
        console.warn(
          'failed to capture browsing metrics for billing:',
          String(metricsError),
        );
      }
    }
    await closeBrowsingSession(browsingSession);
    console.log = originalLog;
    console.info = originalInfo;
    console.debug = originalDebug;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

// Buffered handler for direct Invoke (LocalStack + non-streaming). Phase 2 wraps core()
// with awslambda.streamifyResponse for the prod streaming transport.
export const handler = async (event: any) => {
  const runLogs = event?.captureLogs === true ? new RunLogBuffer() : undefined;
  const { result, authorized } = await core(event, runLogs);
  // Read after core() returns, so lines its finally block wrote are in.
  if (!runLogs || !authorized) {
    return result;
  }
  return { [RUN_ENVELOPE_KEY]: 1, result, logs: runLogs.toString() };
};
