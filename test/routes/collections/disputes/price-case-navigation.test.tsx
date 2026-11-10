import { Profiler, StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { ClientProvider, ReactClientSdk } from '@blocksdiy/blocks-client-sdk/reactSdk';
import Root from '@/root';
import CollectionsLayout from '@/routes/collections/layout';
import TodayPage from '@/routes/collections/index';
import DisputesPage from '@/routes/collections/disputes/index';
import DisputeCasePage from '@/routes/collections/disputes/[disputeId]';
import AgingPage from '@/routes/collections/aging';
import PromisesPage from '@/routes/collections/promises';
import InboxPage from '@/routes/collections/inbox/index';

/*
 * Regression for the price-case / navigation freeze (22.10). The real SDK provider and hooks run over an
 * in-memory client, with the live rows of TEST-DSP-20261022-2. Every screen that runs an action on load
 * (the price case: AnalyzePriceGap; Today: GetMorningChecklist) used to execute it again on every mount.
 * The SDK allows 5 identical executions per 20 s per tab and then throws a FatalAppError from
 * useExecuteAction during render, so the 6th open (4th under StrictMode) crashed the route, and a host
 * that remounts after a crash re-fired the action on every remount: a crash-remount loop.
 *
 * Since the disputes list moved into פניות (folder 4 = מחירים, /collections/disputes?tab=prices redirects there), the
 * case is opened by its own URL /collections/disputes/:id and left for that folder, 8 times: the same remounts.
 */

// No sockets in jsdom: live sync is irrelevant to rendering.
vi.mock('@blocksdiy/blocks-client-api/websocketService', () => ({
  useWebsockets: () => undefined,
  useWebsocketsAppSubscribe: () => undefined,
  websocketsService: { listen: () => undefined, unlisten: () => undefined },
}));
// Surfaces these flows never open; their runtimes (streamdown CSS, react-live, pdf.js) do not load in jsdom.
vi.mock('@/components/ui/agent-chat', () => ({ AgentChatSimple: () => null }));
vi.mock('@/components/ui/pdf-viewer', () => ({ PdfViewer: () => null }));
vi.mock('@/components/ui/floating-agent-chat', () => ({
  FloatingAgentChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------- the live rows of TEST-DSP-20261022-2 (id 6044257) ----------
const PRICE_CASE = {
  id: '6044257',
  disputeNumber: 'TEST-DSP-20261022-2',
  customerCode: 'TEST-004',
  customerName: 'בדיקה – רמות בנייה ופיתוח',
  disputeType: 'מחיר',
  invoiceNumbers: 'TEST-INV-004-2',
  disputedAmount: 1350,
  description: 'ניתוח פער מחיר – חשבונית TEST-INV-004-2 מ-10.06.2026\n\nסה״כ פער לזיכוי: 1,350 ₪\nסיבות: מחירון לא עודכן, מחיר ידני',
  ballWith: 'סוכן מכירות',
  ownerBookkeeperName: 'בדיקה – אחראית א',
  status: 'ממתינה לאישור סוכן',
  openedAt: '2026-10-22T09:45:59.670Z',
  inboundEmailId: '1a163005c9a50abc',
  salesAgentName: 'בדיקה – סוכן מרכז',
  salesManagerName: 'בדיקה – מנהל מכירות',
  salesAgentApprovedAt: null,
  salesManagerApprovedAt: null,
  creditDraftNote: null,
  isTestFixture: true,
};
const DOC_CASE = {
  id: '6044255',
  disputeNumber: 'TEST-DSP-20261022-1',
  customerCode: 'TEST-003',
  customerName: 'בדיקה – לקוח תעודות',
  disputeType: 'תעודת משלוח חסרה',
  invoiceNumbers: 'TEST-INV-003-1',
  status: 'ממתינה לסריקה',
  openedAt: '2026-10-22T09:40:00.000Z',
  isTestFixture: true,
};
const DRAFT = { id: '6044258', kind: 'בקשת אישור מחיר', status: 'ממתין', relatedTable: 'Disputes', relatedId: '6044257', draftedAt: '2026-10-22T09:46:00.000Z', subject: 'בקשת אישור מחיר', body: 'שלום' };
const EMAILS = [
  { id: 'e1', messageId: '1a163005c9a50abc', customerCode: 'TEST-004', subject: 'הפרש מחיר בחשבונית TEST-INV-004-2', fromName: 'שער', fromAddress: 'saarlevi14@gmail.com', receivedAt: '2026-10-22T09:40:00.000Z', bodyText: 'שלום, המחיר בחשבונית גבוה מהמחירון.' },
  { id: 'e2', messageId: 'm2', customerCode: 'TEST-004', subject: 'אישור מחיר', fromName: 'סוכן', fromAddress: 'agent@example.com', receivedAt: '2026-10-21T09:40:00.000Z', bodyText: 'מאשר 45 ₪ לבלוק' },
];
const PRICE_GAP = {
  dryRun: true,
  invoiceNumber: 'TEST-INV-004-2',
  customerCode: 'TEST-004',
  siteName: 'בדיקה – אתר רמות מודיעין',
  lines: [
    { lineKey: 'TEST-INV-004-2-1', sku: 'TEST-SKU-BLK20', itemName: 'בלוק 20 ס״מ', quantity: 250, unitPrice: 45, lineTotal: 11250, listPrice: 42, listSource: 'לקוח', priceListCode: 'TEST-PL-004', validFrom: '2025-10-01', validTo: null, currentListPrice: 42, currentValidFrom: '2025-10-01', priceSource: 'ידני', managerApprovalStatus: 'לא אושר', freeText: 'לפי סיכום טלפוני עם הסוכן – 45 ₪ לבלוק', gapPerUnit: 3, gapTotal: 750, reason: 'מחיר ידני' },
    { lineKey: 'TEST-INV-004-2-2', sku: 'TEST-SKU-CEM50', itemName: 'מלט 50 ק״ג', quantity: 150, unitPrice: 40, listPrice: 36, listSource: 'אתר', priceListCode: 'TEST-PL-SITE-004', validFrom: '2026-06-01', validTo: null, currentListPrice: 36, priceSource: 'מחירון', managerApprovalStatus: 'לא נדרש', freeText: null, gapPerUnit: 4, gapTotal: 600, reason: 'מחירון לא עודכן' },
    { lineKey: 'TEST-INV-004-2-3', sku: 'TEST-SKU-SAND', itemName: 'חול מחצבה (קוב)', quantity: 50, unitPrice: 30, listPrice: 30, gapPerUnit: 0, gapTotal: 0, reason: null },
  ],
  totalGap: 1350,
  reasons: ['מחירון לא עודכן', 'מחיר ידני'],
  salesAgentName: 'בדיקה – סוכן מרכז',
  salesManagerName: 'בדיקה – מנהל מכירות',
  disputeId: '6044257',
  approvalId: null,
  outcome: 'מקרה מחיר עודכן',
  refused: false,
  refusalReason: '',
  writeVerified: false,
  errors: [],
  invoiceDate: '2026-06-10',
  underchargedTotal: 0,
  salesAgentFound: true,
  analysisText: 'ניתוח',
  isTestFixture: true,
  disputeNumber: 'TEST-DSP-20261022-2',
  caseStatus: 'ממתינה לאישור סוכן',
};

type Where = { column?: string; value?: unknown; and?: Where[] };
type Query = { where?: Where; page?: { size: number } } | undefined;

function conds(w?: Where): { column?: string; value?: unknown }[] {
  if (!w) return [];
  return w.and ? w.and.flatMap(conds) : [w];
}
function matches(row: Record<string, unknown>, q: Query) {
  return conds(q?.where).every((c) => !c.column || (Array.isArray(c.value) ? c.value.includes(row[c.column]) : row[c.column] === c.value));
}

const TABLES: Record<string, Record<string, unknown>[]> = {
  Disputes: [PRICE_CASE, DOC_CASE],
  Approvals: [DRAFT],
  InboundEmails: EMAILS,
};

const calls = { actions: 0, reads: 0 };

/** The real SDK provider and hooks over an in-memory client (the network is the only thing faked). */
class FakeClient extends ReactClientSdk {
  constructor() {
    super({ appId: 'test-app' });
  }
  getUser() {
    return { id: 'u1', email: 'bookkeeper@example.com', name: 'בודקת', isAuthenticated: true } as ReturnType<ReactClientSdk['getUser']>;
  }
  loadIntegrations() {
    return Promise.resolve({});
  }
  entity(config: { tableBlockId: string }) {
    const rows = TABLES[config.tableBlockId] ?? [];
    const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 5));
    return {
      findMany: (q: Query) => {
        calls.reads++;
        return delay(rows.filter((r) => matches(r, q)));
      },
      findPage: (q: Query) => {
        calls.reads++;
        return delay({ rows: rows.filter((r) => matches(r, q)), nextCursor: null });
      },
      findOne: (f: { id?: unknown }) => {
        calls.reads++;
        return delay(rows.find((r) => String(r.id) === String(f.id)) ?? null);
      },
    } as unknown as ReturnType<ReactClientSdk['entity']>;
  }
  action(config: { actionBlockId: string }) {
    return {
      execute: () => {
        calls.actions++;
        return new Promise((r) => setTimeout(() => r(config.actionBlockId === 'AnalyzePriceGap' ? structuredClone(PRICE_GAP) : {}), 20));
      },
    } as unknown as ReturnType<ReactClientSdk['action']>;
  }
}

let commits = 0;
const fatal: string[] = [];

function setup(initial: string, strict = false) {
  const router = createMemoryRouter(
    [
      {
        element: <Root />,
        children: [
          {
            path: 'collections',
            element: <CollectionsLayout />,
            children: [
              { index: true, element: <TodayPage /> },
              { path: 'disputes', element: <DisputesPage /> },
              { path: 'disputes/:disputeId', element: <DisputeCasePage /> },
              { path: 'aging', element: <AgingPage /> },
              { path: 'promises', element: <PromisesPage /> },
              { path: 'inbox', element: <InboxPage /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  const tree = (
    <Profiler id="app" onRender={() => commits++}>
      <ClientProvider client={new FakeClient()}>
        <RouterProvider router={router} />
      </ClientProvider>
    </Profiler>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return router;
}

/** Commits during `ms` of idle time — a settled page commits (close to) nothing. */
async function idleCommits(ms = 500) {
  const before = commits;
  await act(() => new Promise((r) => setTimeout(r, ms)));
  return commits - before;
}

const crashed = () => !!screen.queryByText('Unexpected Application Error!');

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

let clock = Date.now();

beforeEach(() => {
  // Each test starts in a "new minute": results the tab shares between mounts (30 s) and the SDK's
  // 20 s repeat window from the previous test are behind it. Only Date is faked; timers stay real.
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(clock);
  commits = 0;
  calls.actions = 0;
  calls.reads = 0;
  fatal.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  const keep = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (/too many times|Maximum update depth|Too many re-renders/.test(text)) fatal.push(text.slice(0, 200));
    else if (!/not wrapped in act|Lit is in dev/.test(text)) keep(...args);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const PRICES_FOLDER = '/collections/inbox?tab=inbox&folder=4';

async function openPriceCaseRepeatedly(router: ReturnType<typeof setup>, times: number) {
  const perOpen: { commits: number; idle: number }[] = [];
  for (let i = 0; i < times; i++) {
    await screen.findByRole('heading', { name: 'פניות' }, { timeout: 3000 });
    const start = commits;
    await act(async () => {
      await router.navigate('/collections/disputes/6044257');
    });
    await screen.findByText('בלוק 20 ס״מ', {}, { timeout: 3000 });
    perOpen.push({ commits: commits - start, idle: await idleCommits() });
    expect(crashed()).toBe(false);
    await act(async () => {
      await router.navigate(PRICES_FOLDER);
    });
  }
  return perOpen;
}

describe('price case TEST-DSP-20261022-2 and /collections navigation', () => {
  it('opens the price case 8 times in a row from the prices folder without crashing or re-running the analysis each time', async () => {
    const router = setup(PRICES_FOLDER);
    const perOpen = await openPriceCaseRepeatedly(router, 8);
    process.stdout.write(`\n[harness] 8 opens: ${JSON.stringify(perOpen)} AnalyzePriceGap calls: ${calls.actions} total commits: ${commits}\n`);
    expect(fatal).toEqual([]);
    for (const o of perOpen) expect(o.idle).toBeLessThanOrEqual(2);
    expect(Math.max(...perOpen.map((o) => o.commits))).toBeLessThan(40);
    expect(calls.actions).toBeGreaterThanOrEqual(1);
    expect(calls.actions).toBeLessThanOrEqual(4);
  }, 40_000);

  it('survives the same 8 opens under StrictMode (double-mounted effects)', async () => {
    const router = setup(PRICES_FOLDER, true);
    await openPriceCaseRepeatedly(router, 8);
    process.stdout.write(`\n[harness] strict 8 opens: AnalyzePriceGap calls: ${calls.actions} total commits: ${commits}\n`);
    expect(fatal).toEqual([]);
    expect(calls.actions).toBeGreaterThanOrEqual(1);
    expect(calls.actions).toBeLessThanOrEqual(4);
  }, 40_000);

  it('navigates 10 times between /collections pages (Today included) in the same tab and settles', async () => {
    const router = setup('/collections');
    const path = ['/collections/disputes/6044257', '/collections', '/collections/aging', '/collections', '/collections/disputes?tab=prices', '/collections', '/collections/promises', '/collections', '/collections/disputes/6044255', '/collections'];
    const perNav: number[] = [];
    for (const to of path) {
      await act(async () => {
        await router.navigate(to);
      });
      await act(() => new Promise((r) => setTimeout(r, 150)));
      perNav.push(await idleCommits(400));
      expect(crashed()).toBe(false);
    }
    process.stdout.write(`\n[harness] idle commits per navigation: ${JSON.stringify(perNav)} action calls: ${calls.actions} total commits: ${commits}\n`);
    expect(fatal).toEqual([]);
    for (const n of perNav) expect(n).toBeLessThanOrEqual(2);
  }, 40_000);
});