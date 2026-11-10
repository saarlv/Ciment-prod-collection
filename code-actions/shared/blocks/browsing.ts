// Browser-session setup for browsing-task code actions. Scaffolded next to index.ts by the
// Lambda bundler. index.ts owns the env-credential caching/deletion; keys arrive here as
// explicit arguments so this module stays a pure function of its inputs.

export interface BrowsingCredentials {
  browserbaseApiKey: string;
  browserbaseProjectId: string;
  // Present only when the deployer injected the platform LLM key — selects the
  // AI (Stagehand) path instead of raw Playwright.
  anthropicApiKey?: string;
  // Stagehand model ('provider/model' format). The deployer injects it together with the
  // key; the default + override live in code-action-secrets.ts (single source of truth).
  model?: string;
}

export interface BrowsingSession {
  stagehand?: any;
  browser?: any;
  page: any;
  context: any;
  sessionId?: string;
}

// Pin the Browserbase session region explicitly rather than relying on their default, so
// session latency is predictable and matches our own us-east-1 infra (used across both the
// Stagehand and raw Playwright paths below).
const DEFAULT_BROWSERBASE_REGION = 'us-east-1';

export async function startBrowsingSession(
  creds: BrowsingCredentials,
): Promise<BrowsingSession> {
  // connectOverCDP calls mkdtemp(); Lambda /tmp is writable but Browserbase handles
  // artifacts server-side, so stub it.
  const nodeFs = await import('node:fs');
  const origMkdtemp = nodeFs.promises.mkdtemp;
  nodeFs.promises.mkdtemp = (async (prefix: string) =>
    prefix + 'stub') as typeof origMkdtemp;

  return creds.anthropicApiKey
    ? startStagehandSession(creds)
    : startRawPlaywrightSession(creds);
}

// AI browsing: Stagehand v3 owns the Browserbase session (created in init()) and enables
// download capture itself (the same Browser.setDownloadBehavior CDP call the raw path
// makes). The platform LLM key is passed explicitly via model.apiKey — index.ts deleted it
// from process.env so user code can never read it. A bare stagehand.agent() inherits this
// model + key (verified on the Lambda runtime), so user code never has to (and must not)
// configure the LLM.
async function startStagehandSession(
  creds: BrowsingCredentials,
): Promise<BrowsingSession> {
  if (!creds.model) {
    // The deployer always injects STAGEHAND_MODEL alongside ANTHROPIC_API_KEY; a missing
    // model means the function's env was tampered with or built by a broken deployer —
    // fail loud rather than silently running on a wrong model.
    throw new Error(
      'STAGEHAND_MODEL is not set — it is injected together with ANTHROPIC_API_KEY at deploy time',
    );
  }
  const { Stagehand } = await import('@browserbasehq/stagehand');
  const { chromium } = await import('playwright-core');
  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: creds.browserbaseApiKey,
    projectId: creds.browserbaseProjectId,
    model: { modelName: creds.model, apiKey: creds.anthropicApiKey! },
    browserbaseSessionCreateParams: { region: DEFAULT_BROWSERBASE_REGION },
  });
  await stagehand.init();

  // Attach Playwright to the SAME Browserbase session: the pages on v3's CDP context
  // (context.pages()) have no selector API (click/fill/$$eval/locator) and no act(), but
  // generated code uses both raw-Playwright idioms and Stagehand idioms. A real Playwright
  // page keeps every pre-Stagehand browsing action working under this runtime. Verified:
  // Browserbase accepts the second CDP connection and both drivers share the tab.
  const browser = await chromium.connectOverCDP(stagehand.connectURL());
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('No browser context available after CDP connection');
  }
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // LLM-generated code frequently slips into Stagehand v2 idioms — page.act({action}),
  // stagehand.page.extract({instruction, schema}) — because v2 examples dominate its
  // training data. Delegate the AI methods onto the Playwright page (normalizing v2
  // option-object args to v3 positional form) and alias stagehand.page, so v2-style
  // code works instead of throwing "page.act is not a function".
  const v2Normalize: Record<string, (args: any[]) => any[]> = {
    act: (args) => {
      if (args[0] && typeof args[0] === 'object' && 'action' in args[0]) {
        const { action, ...rest } = args[0];
        return [action, Object.keys(rest).length ? rest : undefined];
      }
      return args;
    },
    extract: (args) => {
      if (args[0] && typeof args[0] === 'object' && 'instruction' in args[0]) {
        const { instruction, schema, ...rest } = args[0];
        return [
          instruction,
          schema,
          Object.keys(rest).length ? rest : undefined,
        ];
      }
      return args;
    },
    observe: (args) => {
      if (args[0] && typeof args[0] === 'object' && 'instruction' in args[0]) {
        const { instruction, ...rest } = args[0];
        return [instruction, Object.keys(rest).length ? rest : undefined];
      }
      return args;
    },
  };
  for (const m of ['act', 'extract', 'observe']) {
    (page as any)[m] = (...args: any[]) =>
      stagehand[m](...v2Normalize[m](args));
  }
  // v3.5.0 exposes NO stagehand.page accessor , so this alias is what makes v2-style stagehand.page.act(...)
  // work. Guard + try/catch: if a future 3.x reintroduces `page` (possibly as a getter-only
  // property where assignment throws), keep theirs rather than failing the session.
  try {
    if (!stagehand.page) {
      stagehand.page = page;
    }
  } catch {
    // read-only property on a future Stagehand — their own page wins
  }

  return {
    stagehand,
    browser,
    page,
    context,
    sessionId: stagehand.browserbaseSessionID,
  };
}

async function startRawPlaywrightSession(
  creds: BrowsingCredentials,
): Promise<BrowsingSession> {
  const { default: Browserbase } = await import('@browserbasehq/sdk');
  const { chromium } = await import('playwright-core');

  const bb = new Browserbase({ apiKey: creds.browserbaseApiKey });
  const session = await bb.sessions.create({
    projectId: creds.browserbaseProjectId,
    region: DEFAULT_BROWSERBASE_REGION,
  });

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('No browser context available after CDP connection');
  }
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  try {
    const cdpClient = await context.newCDPSession(page);
    await cdpClient.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: 'downloads',
      eventsEnabled: true,
    });
  } catch (e) {
    console.warn('Failed to enable download behavior:', String(e));
  }

  return { browser, page, context, sessionId: session.id };
}

// Stagehand v3's `metrics` is an ASYNC getter (Promise<StagehandMetrics>): in Browserbase (API)
// mode it fetches + merges server-side replay metrics and .catch()es back to local counters, so it
// never rejects; in local mode it resolves the local counters. It MUST be awaited — reading it
// synchronously yields a Promise whose token fields are undefined (→ 0 → the STAGEHAND_CALL event
// is silently dropped). Absent on the raw-Playwright path (no stagehand). Returns undefined when no
// AI calls ran. The model these tokens were billed against is added by the caller (STAGEHAND_MODEL).
export async function readStagehandMetrics(
  session: BrowsingSession | undefined,
): Promise<{ promptTokens: number; completionTokens: number } | undefined> {
  const metrics = await session?.stagehand?.metrics;
  if (!metrics) {
    return undefined;
  }
  const promptTokens = metrics.totalPromptTokens ?? 0;
  const completionTokens = metrics.totalCompletionTokens ?? 0;
  if (promptTokens + completionTokens === 0) {
    return undefined;
  }
  return { promptTokens, completionTokens };
}

export async function closeBrowsingSession(
  session: BrowsingSession | undefined,
): Promise<void> {
  if (!session) {
    return;
  }
  if (session.browser) {
    // In AI mode this only disconnects the Playwright CDP client; the session itself
    // is owned (and torn down) by stagehand.close() below. In raw mode it's the
    // session teardown.
    await session.browser.close().catch(() => {});
  }
  if (session.stagehand) {
    // stagehand.close() tears down the browser AND the Browserbase session
    await session.stagehand.close().catch(() => {});
  }
}
