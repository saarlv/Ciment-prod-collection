import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { ClientProvider, ReactClientSdk } from '@blocksdiy/blocks-client-sdk/reactSdk';
import Root from '@/root';
import CollectionsLayout from '@/routes/collections/layout';
import TodayPage from '@/routes/collections/index';
import ReceiptsPage from '@/routes/collections/receipts';

/*
 * The receipts screen (08.11: one flow) over the real SDK hooks and an in-memory client. On Tuesday 27.10.2026 the
 * bank lines were pulled from Priority at 08:10 with three transfers: one with its receipt approved, debt-checked and
 * allocated, one identified with low confidence, one no identification run has reached yet (it waits with "זהה").
 * Nothing runs on load. A row opens the one record panel (?line= / ?receipt=) with the four steps זיהוי → קבלה →
 * בדיקת חוב → פיזור. Today shows one link row into receipts. "זיהוי וקבלה" below covers approve-all, one-by-one
 * approval, the allocation editor, agent cheques and file mode.
 */

vi.mock('@blocksdiy/blocks-client-api/websocketService', () => ({
  useWebsockets: () => undefined,
  useWebsocketsAppSubscribe: () => undefined,
  websocketsService: { listen: () => undefined, unlisten: () => undefined },
}));
vi.mock('@/components/ui/agent-chat', () => ({ AgentChatSimple: () => null }));
vi.mock('@/components/ui/pdf-viewer', () => ({ PdfViewer: () => null }));
vi.mock('@/components/ui/floating-agent-chat', () => ({
  FloatingAgentChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const DAY = '2026-10-27';
const PULLED_AT = '2026-10-27T06:10:00.000Z';
const BATCH = {
  id: 'B1',
  kind: 'שורות דפי בנק – Priority',
  fileName: 'Priority – שורות דפי בנק 27.10.2026 08:10',
  uploadedBy: 'SyncPriorityBankLines',
  uploadedAt: PULLED_AT,
  dataDate: DAY,
  workDay: DAY,
  rowsRead: 3,
  rowsWritten: 3,
  status: 'נכתב',
  checkStatus: 'בבדיקה',
  isTestFixture: true,
};
const PL = { source: 'priority-mock', syncedAt: PULLED_AT };
const PRIORITY_MODE = { id: 'S1', settingKey: 'bankLinesSource', value: 'שורות פריוריטי', valueType: 'טקסט', basis: 'הוגדר במסך' };
const LINES = [
  { id: '1', bankLineId: 'L1', importBatchId: 'B1', lineNo: 1, valueDate: '2026-10-26', amount: 9000, payerName: 'בדיקה – ראשון', reference: 'REF-1', lineType: 'העברה', status: 'קבלה הונפקה', receiptKey: 'RCPT-L1', lastCheckRunId: 'identify-L1-1', priorityLineId: 'TEST-PL-1', ...PL },
  { id: '2', bankLineId: 'L2', importBatchId: 'B1', lineNo: 2, valueDate: '2026-10-26', amount: 17_424, payerName: 'אבי ובניו', lineType: 'העברה', status: 'חדשה', lastCheckRunId: 'identify-L2-1', priorityLineId: 'TEST-PL-2', ...PL },
  { id: '3', bankLineId: 'L3', importBatchId: 'B1', lineNo: 3, valueDate: '2026-10-26', amount: 12_000, payerName: 'בדיקה – שלישי', lineType: 'העברה', status: 'חדשה', priorityLineId: 'TEST-PL-3', ...PL },
];
const AVI = 'בדיקה – אבי ובניו בע״מ';
const RECEIPTS = [
  {
    id: 'r1', receiptKey: 'RCPT-L1', bankLineId: 'L1', customerCode: 'TEST-001', customerName: AVI, amount: 9000, valueDate: '2026-10-26', payerName: 'בדיקה – ראשון', reference: 'REF-1',
    receiptStatus: 'אושרה – לא נשלחה', identifyStatus: 'אושר', identifyConfidence: 100, matchStatus: 'מפוזרת', allocatedAmount: 9000, unallocatedAmount: 0,
    debtCheckResult: 'נסגר לאפס – מצטבר', debtCheckMonths: '2026-08,2026-09', sendStatus: 'טיוטה – בדיקה', sentToEmail: 'ap@avi.example.com', matchProposalId: 'P1', receiptSource: 'דף בנק',
  },
  { id: 'r2', receiptKey: 'RCPT-L2', bankLineId: 'L2', customerCode: 'TEST-001', customerName: AVI, amount: 0, receiptStatus: 'טיוטה – ממתינה לאישור', identifyStatus: 'לא ודאי', identifyConfidence: 60, receiptSource: 'דף בנק' },
];
const STEPS = [
  {
    id: 's1', bankLineId: 'L1', importBatchId: 'B1', checkRunId: 'identify-L1-1', stepNo: 1, stage: 'זיהוי לקוח', result: 'נמצא', detail: 'הח״פ של הלקוח מופיע באסמכתא',
    evidence: { confidence: 100, method: 'ח״פ', identifyStatus: 'ודאי', candidates: [] }, actor: 'מערכת', at: '2026-10-27T06:11:00.000Z',
  },
  {
    id: 's2', bankLineId: 'L2', importBatchId: 'B1', checkRunId: 'identify-L2-1', stepNo: 1, stage: 'זיהוי לקוח', result: 'נמצא', detail: 'השם דומה לשני לקוחות',
    evidence: {
      confidence: 60, method: 'שם דומה', identifyStatus: 'לא ודאי',
      candidates: [
        { customerCode: 'TEST-001', customerName: AVI, confidence: 60, method: 'שם דומה' },
        { customerCode: 'TEST-009', customerName: 'בדיקה – אבי שיווק', confidence: 40, method: 'שם חלקי' },
      ],
    },
    actor: 'מערכת', at: '2026-10-27T06:11:01.000Z',
  },
];
const ALLOCATIONS = [
  { id: 'a1', receiptKey: 'RCPT-L1', invoiceNumber: 'TEST-INV-1', dueDate: '2026-08-31', amount: 5000, openBefore: 5000, openAfter: 0, kind: 'מלאה' },
  { id: 'a2', receiptKey: 'RCPT-L1', invoiceNumber: 'TEST-INV-2', dueDate: '2026-09-30', amount: 4000, openBefore: 6000, openAfter: 2000, kind: 'חלקית' },
];
const MOVEMENTS = [
  { id: 'm1', customerCode: 'TEST-001', docType: 'חשבונית', docNumber: 'TEST-INV-1', dueMonth: '2026-08', amount: 5000 },
  { id: 'm2', customerCode: 'TEST-001', docType: 'חשבונית', docNumber: 'TEST-INV-2', dueMonth: '2026-09', amount: 4000 },
  { id: 'm3', customerCode: 'TEST-001', docType: 'חשבונית', docNumber: 'TEST-INV-5', dueMonth: '2026-10', amount: 2500 },
];

const WEEK_DAYS = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'].map((date, i) => ({
  date,
  weekday: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][i],
  isToday: date === DAY,
  isPast: date < DAY,
  itemCount: 0,
  amount: 0,
}));
const WEEK_BRIEF = {
  asOfDate: DAY,
  dataAsOf: '2026-10-27T04:00:00.000Z',
  week: { start: '2026-10-25', end: '2026-10-31', label: '25.10–31.10', days: WEEK_DAYS },
  aging: {
    headline: 'הבטחה אחת הופרה, ו־12,000 ₪ נכנסים לפירעון היום.',
    conclusions: ['השבוע נכנסים לפירעון 2 חשבוניות של 2 לקוחות.', 'לקוח אחד טוען ששילם ועוד לא ראינו בבנק.'],
    kpis: { dueThisWeekAmount: 20_000, dueThisWeekCount: 2, dueThisWeekCustomers: 2, promisedThisWeekAmount: 8000, promisedThisWeekCount: 1, claimedPaidOpenAmount: 5000, claimedPaidOpenCount: 1, overdueNoNoteAmount: 30_000, overdueNoNoteCustomers: 1 },
    items: [
      { id: 'broken|p1', date: '2026-10-26', kind: 'הבטחה שהופרה', customerCode: 'TEST-004', customerName: 'בדיקה – רמות בנייה', amount: 8000, status: 'הופרה', noteText: 'הבטיח להעביר ביום שני' },
      { id: 'due|TEST-001|2026-10-27', date: '2026-10-27', kind: 'פירעון', customerCode: 'TEST-001', customerName: 'בדיקה – אבי ובניו בע״מ', amount: 12_000, status: 'פתוחה' },
      { id: 'claim|n1', date: null, kind: 'שולם לטענת הלקוח', customerCode: 'TEST-002', customerName: 'בדיקה – אלון יזמות', amount: 5000, status: 'לא נראה בבנק', noteText: 'טוען שהעביר בשבוע שעבר' },
    ],
    overdueNoNote: [{ customerCode: 'TEST-007', customerName: 'בדיקה – דקל קבלנות', overdueAmount: 30_000, oldestDueDate: '2026-08-10', lastNoteAt: null }],
  },
  receipts: {
    workDay: DAY,
    files: [{ id: 'B1', fileName: 'test-bank-2026-10-27.pdf', extractionStatus: 'אומת', checkStatus: 'בבדיקה' }],
    pulled: 3,
    pulledAmount: 41_424,
    matched: 1,
    matchedAmount: 12_000,
    waitingDecision: 1,
    toMatch: 2,
    toMatchAmount: 29_424,
    unidentified: 0,
    notChecked: 1,
    bounced: 0,
    summary: 'נמשכו 3 העברות. אחת כבר תואמה, ואחת מחכה להחלטה שלך.',
  },
};
let weekBrief: Record<string, unknown> = WEEK_BRIEF;
let syncOut: Record<string, unknown> = {};
let proposeOut: Record<string, unknown> = {};
let applyOut: Record<string, unknown> = {};
let pullOut: Record<string, unknown> = {};

let tables: Record<string, Record<string, unknown>[]> = {};
const calls: Record<string, number> = {};
const inputs: Record<string, unknown> = {};

type Clause = { column?: string; operator?: string; value?: unknown; and?: Clause[]; or?: Clause[]; not?: boolean; expression?: string };

function holds(row: Record<string, unknown>, c?: Clause): boolean {
  if (!c) return true;
  let r: boolean;
  if (c.and) r = c.and.every((x) => holds(row, x));
  else if (c.or) r = c.or.some((x) => holds(row, x));
  else if (!c.column) r = true;
  else {
    const v = row[c.column] as string | number | null | undefined;
    const w = c.value as string | number;
    switch (c.operator ?? '=') {
      case '=': r = v === w; break;
      case '!=': r = v !== w; break;
      case 'in': r = Array.isArray(c.value) && c.value.includes(v); break;
      case 'not in': r = !(Array.isArray(c.value) && c.value.includes(v)); break;
      case '>': r = v != null && v > w; break;
      case '>=': r = v != null && v >= w; break;
      case '<': r = v != null && v < w; break;
      case '<=': r = v != null && v <= w; break;
      case 'is null': r = v == null; break;
      case 'is not null': r = v != null; break;
      default: r = true;
    }
  }
  return c.not ? !r : r;
}

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
    const rows = () => tables[config.tableBlockId] ?? [];
    const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 5));
    return {
      findMany: (q?: { where?: Clause }) => delay(rows().filter((r) => holds(r, q?.where))),
      findPage: (q?: { where?: Clause }) => delay({ rows: rows().filter((r) => holds(r, q?.where)), nextCursor: null }),
      findOne: (f: { id?: unknown }) => delay(rows().find((r) => String(r.id) === String(f.id)) ?? null),
    } as unknown as ReturnType<ReactClientSdk['entity']>;
  }
  action(config: { actionBlockId: string }) {
    return {
      execute: (input?: unknown) => {
        calls[config.actionBlockId] = (calls[config.actionBlockId] ?? 0) + 1;
        inputs[config.actionBlockId] = input;
        const out =
          config.actionBlockId === 'GetWeekBrief'
            ? weekBrief
            : config.actionBlockId === 'SyncPriorityBankLines'
            ? syncOut
            : config.actionBlockId === 'ProposeAllocation'
            ? proposeOut
            : config.actionBlockId === 'ApplyAllocation'
            ? applyOut
            : config.actionBlockId === 'PullAgentReceipts'
            ? pullOut
            : config.actionBlockId === 'GetMorningChecklist'
            ? {
                asOfDate: DAY,
                previousBusinessDay: '2026-10-26',
                allDone: false,
                tasks: [
                  { kind: 'קובץ בנק', label: 'העלאת קובץ הבנק', done: false },
                  { kind: 'חשבוניות פתוחות', label: 'העלאת קובץ החשבוניות הפתוחות', done: false },
                ],
              }
            : {};
        return new Promise((r) => setTimeout(() => r(out), 50));
      },
    } as unknown as ReturnType<ReactClientSdk['action']>;
  }
}

function setup(initial: string) {
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
              { path: 'receipts', element: <ReceiptsPage /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  render(
    <ClientProvider client={new FakeClient()}>
      <RouterProvider router={router} />
    </ClientProvider>,
  );
  return router;
}

const settle = (ms = 300) => act(() => new Promise((r) => setTimeout(r, ms)));
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
  Element.prototype.scrollIntoView ??= () => undefined;
  // jsdom has no PointerEvent; Base UI's checkbox dispatches one on click.
  const w = window as unknown as { PointerEvent?: typeof MouseEvent };
  w.PointerEvent ??= class PointerEvent extends MouseEvent {};
});

let clock = Date.parse('2026-10-27T08:00:00.000Z');

beforeEach(() => {
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(clock);
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(inputs)) delete inputs[k];
  tables = {
    AgentSettings: [PRIORITY_MODE],
    Receipts: RECEIPTS,
    ImportBatches: [BATCH],
    BankLines: LINES,
    ReceiptCheckSteps: STEPS,
    ReceiptAllocations: [],
    MatchProposals: [],
    AgentFeedbackStats: [],
    AgentFeedback: [],
    Approvals: [],
    BankAliases: [],
    Invoices: [],
    InvoiceLines: [],
    Customers: [],
    CustomerContacts: [],
    CustomerNotes: [],
    OpenMovements: [],
    CollectionQueue: [],
  };
  weekBrief = WEEK_BRIEF;
  syncOut = {};
  proposeOut = {};
  applyOut = {};
  pullOut = {};
  window.localStorage.clear();
  const keep = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (!/not wrapped in act|Lit is in dev/.test(text)) keep(...args);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('receipts screen', () => {
  it('lists every line of the day by need — a line no run reached waits with "זהה" — and runs nothing on load', async () => {
    setup('/collections/receipts');
    const section = await screen.findByRole('region', { name: 'זיהוי לקוחות' }, { timeout: 4000 });
    await settle();
    expect(crashed()).toBe(false);
    expect(screen.getByRole('region', { name: 'משיכה מפריוריטי' }).textContent).toContain('נמשך מפריוריטי ב-08:10');
    const rows = within(section).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('td button')?.textContent)).toEqual(['בדיקה – שלישי', 'אבי ובניו', 'בדיקה – ראשון']);
    expect(within(rows[0]).getByText('ממתינה לזיהוי')).toBeTruthy();
    // nothing of the old record-by-record check is left
    expect(screen.queryByRole('region', { name: 'נכנסות לבדיקה' })).toBeNull();
    expect(screen.queryByText(/עצור בדיקות/)).toBeNull();
    expect(calls.IdentifyCustomers ?? 0).toBe(0);
    await act(async () => {
      fireEvent.click(within(rows[0]).getByRole('button', { name: /^זהה$/ }));
    });
    await settle(150);
    expect(calls.IdentifyCustomers).toBe(1);
    expect(inputs.IdentifyCustomers).toEqual({ dryRun: false, bankLineIds: ['L3'], checkedBy: 'בודקת' });
    expect(crashed()).toBe(false);
  }, 20_000);

  it('waits for today\'s pull, and pulls only from the button with the chosen test day', async () => {
    tables.ImportBatches = [];
    tables.BankLines = [];
    syncOut = { ok: true, dryRun: false, linesFromSource: 0, created: 0, adopted: 0, alreadyThere: 0, checked: [], bankMissingTask: { action: 'none' }, configError: 'bank-settings-missing', errors: [] };
    setup('/collections/receipts');
    expect(await screen.findByText('עוד לא נמשכו שורות של היום מפריוריטי', {}, { timeout: 4000 })).toBeTruthy();
    await settle();
    expect(calls.SyncPriorityBankLines ?? 0).toBe(0);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'יום ריק' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /משוך עכשיו מפריוריטי/ }));
    });
    expect(await screen.findByText('חסרות הגדרות שעות דפי הבנק')).toBeTruthy();
    expect(screen.getByText('פריוריטי לא החזיר שורות להיום.')).toBeTruthy();
    expect(calls.SyncPriorityBankLines).toBe(1);
    expect(inputs.SyncPriorityBankLines).toEqual({ dryRun: false, mockScenario: 'יום ריק' });
    expect(crashed()).toBe(false);
  }, 20_000);

  it('shows cheque clearings and other lines apart, without actions, and old file lines only when opened', async () => {
    tables.BankLines = [
      ...LINES,
      { id: '4', bankLineId: 'PL-TEST-PL-CHQ-1', lineNo: 4, valueDate: DAY, amount: 7000, payerName: 'פירעון צ׳ק', reference: 'פירעון צ׳ק 001187', lineType: 'פירעון צ׳ק', priorityLineId: 'TEST-PL-CHQ-1', importBatchId: 'B1', ...PL },
      { id: '5', bankLineId: 'OLD-1', lineNo: 1, valueDate: '2026-10-20', amount: 3300, payerName: 'בדיקה – ישן מקובץ', lineType: 'העברה', checkStage: 'אושרה', importBatchId: 'B0' },
    ];
    setup('/collections/receipts');
    await screen.findByRole('region', { name: 'זיהוי לקוחות' }, { timeout: 4000 });
    const unhandled = screen.getByRole('region', { name: 'לא מטופלות' });
    expect(within(unhandled).getByText('מוצג בלבד – לא נכנס לזרימת התקבולים')).toBeTruthy();
    expect(within(unhandled).getByText('פירעון צ׳ק', { selector: 'td' })).toBeTruthy();
    expect(within(unhandled).queryByRole('button')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'זיהוי לקוחות' })).queryByText('פירעון צ׳ק 001187')).toBeNull();
    expect(screen.queryByText('בדיקה – ישן מקובץ')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /שורות ישנות מקובץ/ }));
    });
    expect(await screen.findByText('בדיקה – ישן מקובץ')).toBeTruthy();
    expect(crashed()).toBe(false);
  }, 20_000);
});

describe('Today', () => {
  it('shows the week from one GetWeekBrief call — headline, conclusions, the board by day — and Nina’s receipts in short', async () => {
    setup('/collections');
    const week = await screen.findByRole('region', { name: 'מה צופן השבוע' }, { timeout: 4000 });
    expect(await within(week).findByText('הבטחה אחת הופרה, ו־12,000 ₪ נכנסים לפירעון היום.', {}, { timeout: 4000 })).toBeTruthy();
    expect(within(week).getByText('השבוע · 25.10–31.10')).toBeTruthy();
    expect(within(week).getByText('לקוח אחד טוען ששילם ועוד לא ראינו בבנק.')).toBeTruthy();

    // today is lit, and its item opens the aging report on that customer
    const today = within(week).getByRole('region', { name: /27\.10/ });
    expect(within(today).getByText('היום')).toBeTruthy();
    expect(within(today).getByText('בדיקה – אבי ובניו בע״מ')).toBeTruthy();
    expect(within(today).getByRole('link', { name: /פתיחה בדוח הגיול/ }).getAttribute('href')).toBe('/collections/aging?customer=TEST-001');
    // the broken promise sits on Monday, with its note
    const monday = within(week).getByRole('region', { name: /26\.10/ });
    expect(within(monday).getByText('הבטחה שהופרה')).toBeTruthy();
    expect(within(monday).getByText(/הבטיח להעביר ביום שני/)).toBeTruthy();
    // a claim with no date has its own group
    const undated = within(week).getByRole('region', { name: 'בלי תאריך' });
    expect(within(undated).getByText('בדיקה – אלון יזמות')).toBeTruthy();
    expect(within(week).getByRole('region', { name: 'בפיגור בלי הערה' })).toBeTruthy();
    expect(within(week).getByText('בדיקה – דקל קבלנות')).toBeTruthy();

    const receipts = screen.getByRole('region', { name: 'התקבולים של היום' });
    expect(within(receipts).getByText('נמשכו היום')).toBeTruthy();
    expect(within(receipts).getByText('נשארו לטפל')).toBeTruthy();
    expect(within(receipts).getByText('1 מחכות להחלטה')).toBeTruthy();
    expect(within(receipts).getByText('נמשכו 3 העברות. אחת כבר תואמה, ואחת מחכה להחלטה שלך.')).toBeTruthy();
    expect(within(receipts).getByRole('button', { name: /למסך התקבולים/ }).getAttribute('href')).toBe('/collections/receipts');

    await settle();
    expect(calls.GetWeekBrief).toBe(1);
    expect(calls.GetMorningChecklist).toBeUndefined();
    expect(screen.queryByText('העלאת קובץ החשבוניות הפתוחות')).toBeNull();
    expect(crashed()).toBe(false);
  }, 20_000);

  it('says so when no bank file was uploaded today, and an empty week stays calm', async () => {
    weekBrief = {
      ...WEEK_BRIEF,
      aging: { headline: 'שבוע שקט: אין פירעונות, הבטחות או בירורים.', conclusions: [], kpis: {}, items: [], overdueNoNote: [] },
      receipts: { workDay: DAY, files: [], pulled: 0, matched: 0, toMatch: 0, summary: 'עוד לא הועלה קובץ בנק ליום הזה.' },
    };
    setup('/collections');
    expect(await screen.findByText('עוד לא נמשכו שורות של היום מפריוריטי', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('שבוע שקט: אין פירעונות, הבטחות או בירורים.')).toBeTruthy();
    expect(screen.getByText('אין השבוע פירעונות, הבטחות או בירורים. המסך יתעדכן כשיופיע משהו.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /למסך התקבולים/ }).getAttribute('href')).toBe('/collections/receipts');
    expect(crashed()).toBe(false);
  }, 20_000);
});

describe('the record panel', () => {
  it('opens a line from its row with the four steps, and approves an uncertain customer in step 1', async () => {
    const router = setup('/collections/receipts');
    const section = await screen.findByRole('region', { name: 'זיהוי לקוחות' }, { timeout: 4000 });
    const row = within(section).getAllByRole('row').find((r) => r.textContent?.includes('אבי ובניו')) as HTMLElement;
    await act(async () => {
      fireEvent.click(row.querySelectorAll('td')[2]);
    });
    const panel = await screen.findByRole('dialog', {}, { timeout: 3000 });
    expect(router.state.location.search).toBe('?line=L2');
    const identify = await within(panel).findByRole('region', { name: 'זיהוי' }, { timeout: 3000 });
    for (const step of ['קבלה', 'בדיקת חוב', 'פיזור']) expect(within(panel).getByRole('region', { name: step })).toBeTruthy();
    expect(await within(identify).findByText('בדיקה – אבי שיווק')).toBeTruthy();
    expect(within(identify).getByText('שם דומה', { selector: 'dd' })).toBeTruthy();
    expect(within(panel).getByText('מחכה לאישור הלקוח')).toBeTruthy();
    expect(within(panel).getAllByText('מחכה להוצאת הקבלה')).toHaveLength(2);
    await act(async () => {
      fireEvent.click(within(identify).getByRole('button', { name: /אשר לקוח והוצא קבלה/ }));
    });
    await settle(150);
    expect(inputs.IssueReceipt).toEqual({ mode: 'one', bankLineIds: ['L2'], customerCode: 'TEST-001', approvedBy: 'בודקת', dryRun: false });
    expect(crashed()).toBe(false);
  }, 20_000);

  it('shows an approved receipt: the Priority copy text, "הונפקה ב-Priority" with its number, the debt by month and the allocation', async () => {
    tables.ReceiptAllocations = ALLOCATIONS;
    tables.OpenMovements = MOVEMENTS;
    tables.Customers = [{ id: 'c1', customerCode: 'TEST-001', customerName: AVI, paymentTermsLabel: 'שוטף + 60', paymentMethod: 'העברה בנקאית', collectionNote: 'משלמים ב-30 לחודש' }];
    tables.CustomerContacts = [{ id: 'k1', customerCode: 'TEST-001', contactName: 'רונית', email: 'ap@avi.example.com', isApContact: true }];
    tables.CustomerNotes = [{ id: 'n1', customerCode: 'TEST-001', dueMonth: '2026-10', noteType: 'התחייבות לתשלום', noteText: 'הבטיח להעביר עד סוף החודש', actionDate: '2026-10-30', amount: 2500, status: 'פעילה' }];
    tables.Approvals = [{ id: 'ap1', relatedTable: 'Receipts', relatedId: 'RCPT-L1', draftedAt: '2026-10-27T06:20:00.000Z', status: 'ממתין' }];
    setup('/collections/receipts?line=L1');
    const panel = await screen.findByRole('dialog', {}, { timeout: 4000 });
    const receipt = await within(panel).findByRole('region', { name: 'קבלה' }, { timeout: 3000 });
    expect(await within(receipt).findByText(/חשבונית TEST-INV-2 – .* \(חלקית\)/, {}, { timeout: 3000 })).toBeTruthy();
    expect(within(receipt).getByText(/אסמכתא: REF-1/)).toBeTruthy();
    expect(within(receipt).getByRole('link', { name: /ממתינה לאישור בדואר יוצא/ }).getAttribute('href')).toBe('/collections/inbox?tab=outbox&status=all&draft=ap1');
    const issue = within(receipt).getByRole('button', { name: /הונפקה ב-Priority/ });
    expect((issue as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.change(within(receipt).getByLabelText('מספר הקבלה ב-Priority'), { target: { value: 'RC123' } });
    });
    await act(async () => {
      fireEvent.click(issue);
    });
    await settle(150);
    expect(inputs.DecideMatchProposal).toEqual({ decision: 'priorityDone', receiptId: 'r1', priorityReceiptNumber: 'RC123', decidedBy: 'בודקת', dryRun: false });

    const debt = within(panel).getByRole('region', { name: 'בדיקת חוב' });
    expect(within(debt).getByText('נסגר לאפס – מצטבר')).toBeTruthy();
    expect(await within(debt).findAllByText('נסגר בבדיקה')).toHaveLength(2);
    const allocation = within(panel).getByRole('region', { name: 'פיזור' });
    expect(within(allocation).getByRole('button', { name: 'TEST-INV-2' })).toBeTruthy();
    expect(within(allocation).getByRole('button', { name: /עריכת הפיזור/ })).toBeTruthy();
    const side = within(panel).getByRole('complementary', { name: 'הלקוח' });
    expect(await within(side).findByText('משלמים ב-30 לחודש')).toBeTruthy();
    expect(within(side).getByText('רונית')).toBeTruthy();
    expect(within(side).getByText('הבטיח להעביר עד סוף החודש')).toBeTruthy();
    expect(calls.GetReceiptRecord ?? 0).toBe(0);
    expect(crashed()).toBe(false);
  }, 20_000);

  it('opens an agent cheque from its row at the debt check, and marks it issued in Priority by its receipt id', async () => {
    tables.Receipts = [
      {
        id: 'ag1', receiptKey: 'RCPT-AGT-P1', receiptSource: 'צ׳ק סוכן', customerCode: 'TEST-004', customerName: 'בדיקה – רמות בנייה', amount: 4000, valueDate: '2026-10-25',
        preparedBy: 'יוסי', receiptStatus: 'אושרה – לא נשלחה', matchStatus: 'על חשבון – צריך פיזור', debtCheckResult: 'לברר מול הלקוח', identifyStatus: 'אושר',
      },
    ];
    const router = setup('/collections/receipts');
    const section = await screen.findByRole('region', { name: 'צ׳קים של סוכנים' }, { timeout: 4000 });
    await act(async () => {
      fireEvent.click(await within(section).findByRole('button', { name: /פתיחת הרשומה של/ }, { timeout: 2000 }));
    });
    const panel = await screen.findByRole('dialog', {}, { timeout: 3000 });
    expect(router.state.location.search).toBe('?receipt=RCPT-AGT-P1');
    expect(await within(panel).findByText(/צ׳ק סוכן – בלי זיהוי/)).toBeTruthy();
    const receipt = within(panel).getByRole('region', { name: 'קבלה' });
    const issue = await within(receipt).findByRole('button', { name: /הונפקה ב-Priority/ }, { timeout: 3000 });
    await act(async () => {
      fireEvent.change(within(receipt).getByLabelText('מספר הקבלה ב-Priority'), { target: { value: 'RC-77' } });
    });
    await act(async () => {
      fireEvent.click(issue);
    });
    await settle(150);
    expect(inputs.DecideMatchProposal).toEqual({ decision: 'priorityDone', receiptId: 'ag1', priorityReceiptNumber: 'RC-77', decidedBy: 'בודקת', dryRun: false });
    expect(within(within(panel).getByRole('region', { name: 'בדיקת חוב' })).getByText('לברר מול הלקוח')).toBeTruthy();
    expect(crashed()).toBe(false);
  }, 20_000);
});

describe('זיהוי וקבלה (stage 4)', () => {
  const at = '2026-10-27T06:12:00.000Z';
  const line = (n: number, payerName: string, amount: number) => ({
    id: `n${n}`, bankLineId: `N${n}`, importBatchId: 'B1', lineNo: n, valueDate: '2026-10-26', amount, payerName, lineType: 'העברה',
    checkStage: 'ממתינה לאישור', status: 'חדשה', lastCheckRunId: `identify-N${n}-1`, priorityLineId: `TEST-PL-N${n}`, ...PL,
  });
  const draft = (n: number, customerCode: string, customerName: string, identifyStatus: string, identifyConfidence: number, extra: Record<string, unknown> = {}) => ({
    id: `r${n}`, receiptKey: `RCPT-N${n}`, bankLineId: `N${n}`, customerCode, customerName, amount: 0, receiptStatus: 'טיוטה – ממתינה לאישור', identifyStatus, identifyConfidence, receiptSource: 'דף בנק', ...extra,
  });
  const step = (n: number, identifyStatus: string, confidence: number, method: string, detail: string, candidates: Record<string, unknown>[] = []) => ({
    id: `st${n}`, bankLineId: `N${n}`, importBatchId: 'B1', checkRunId: `identify-N${n}-1`, stepNo: 1, stage: 'זיהוי לקוח', rung: 'כרטיס לקוח', result: 'נמצא', detail,
    evidence: { confidence, method, identifyStatus, candidates }, actor: 'מערכת', at,
  });

  function identifiedDay() {
    tables.BankLines = [line(1, 'אבי ובניו', 12_000), line(2, 'ש. כהן', 8_500), line(3, 'מעביר זר', 3_000), line(4, 'רמות בנייה בע״מ', 5_000), line(5, 'דקל קבלנות', 9_000)];
    tables.Receipts = [
      draft(1, 'TEST-001', 'בדיקה – אבי ובניו בע״מ', 'ודאי', 100),
      draft(2, 'TEST-002', 'בדיקה – אלון יזמות', 'לא ודאי', 50),
      draft(4, 'TEST-004', 'בדיקה – רמות בנייה', 'ודאי', 95),
      draft(5, 'TEST-007', 'בדיקה – דקל קבלנות', 'אושר', 95, {
        receiptStatus: 'אושרה – לא נשלחה', matchStatus: 'פיזור מוצע – לאישור', sendStatus: 'חסר איש קשר', amount: 9000, allocatedAmount: 0, unallocatedAmount: 9000,
        debtCheckResult: 'נסגר לאפס – חודש אחד', debtCheckMonths: '2026-09', allocationConfidence: 100,
      }),
    ];
    tables.ReceiptCheckSteps = [
      step(1, 'ודאי', 100, 'ח״פ', 'הח״פ של הלקוח מופיע באסמכתא'),
      step(2, 'לא ודאי', 50, 'דו-משמעי', 'שני לקוחות מתאימים לשם', [
        { customerCode: 'TEST-002', customerName: 'בדיקה – אלון יזמות', confidence: 50, method: 'שם חלקי' },
        { customerCode: 'TEST-003', customerName: 'בדיקה – אלון בנייה', confidence: 50, method: 'שם חלקי' },
      ]),
      step(3, 'לא זוהה', 0, 'לא זוהה', 'אין לקוח שמתאים לשם המעביר'),
      step(4, 'ודאי', 95, 'כינוי', 'כינוי מאושר'),
      step(5, 'ודאי', 95, 'שם זהה', 'השם זהה לשם הלקוח'),
    ];
  }

  it('lists the day by need — unknown, uncertain, certain, approved — and approves all certain lines after a confirm', async () => {
    identifiedDay();
    setup('/collections/receipts');
    const section = await screen.findByRole('region', { name: 'זיהוי לקוחות' }, { timeout: 4000 });
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toContain('השורות הגיעו ב-08:10 · 5 שורות · 2 ודאיות');
    const payers = within(section).getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent ?? '');
    expect(payers.map((t) => t.split(/\s/)[0])).toEqual(['מעביר', 'ש.', 'רמות', 'אבי', 'דקל']);
    // nothing of Nina's old record-by-record check for identified lines
    expect(screen.queryByRole('region', { name: 'נכנסות לבדיקה' })).toBeNull();
    // the approved one: its receipt, and the missing accounts-payable contact links to the customer card
    expect(within(section).getByText('פיזור מוצע – לאישור')).toBeTruthy();
    expect(within(section).getByRole('link', { name: /חסר איש קשר הנהלת חשבונות/ }).getAttribute('href')).toBe('/collections/customers/TEST-007');
    // the debt check and the allocation editor replace the old "next phase" placeholder
    expect(within(section).getByText('נסגר לאפס – חודש אחד')).toBeTruthy();
    expect(within(section).getByRole('button', { name: /פיזור לחשבוניות/ })).toBeTruthy();
    expect(within(section).queryByText(/בשלב הבא/)).toBeNull();
    // the pull yields: approve-all is the one primary action now
    const approveAll = within(section).getByRole('button', { name: /אשר את כל הוודאיים \(2\)/ });
    await act(async () => {
      fireEvent.click(approveAll);
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/לאשר 2 קבלות בסך/)).toBeTruthy();
    expect(calls.IssueReceipt ?? 0).toBe(0);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /אישור והוצאת 2 קבלות/ }));
    });
    await settle(150);
    expect(calls.IssueReceipt).toBe(1);
    expect(inputs.IssueReceipt).toEqual({ mode: 'certain', bankLineIds: ['N4', 'N1'], approvedBy: 'בודקת', dryRun: false });
    expect(crashed()).toBe(false);
  }, 20_000);

  it('approves an uncertain line one by one with its first candidate, and re-identifies only the open lines', async () => {
    identifiedDay();
    setup('/collections/receipts');
    const section = await screen.findByRole('region', { name: 'זיהוי לקוחות' }, { timeout: 4000 });
    const row = within(section).getAllByRole('row').find((r) => r.textContent?.includes('ש. כהן'));
    expect(row?.textContent).toContain('ש. כהן');
    await act(async () => {
      fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /אשר לקוח והוצא קבלה/ }));
    });
    await settle(150);
    expect(inputs.IssueReceipt).toEqual({ mode: 'one', bankLineIds: ['N2'], customerCode: 'TEST-002', approvedBy: 'בודקת', dryRun: false });
    await act(async () => {
      fireEvent.click(within(section).getByRole('button', { name: /זהה מחדש/ }));
    });
    await settle(150);
    expect(inputs.IdentifyCustomers).toEqual({ dryRun: false, bankLineIds: ['N3', 'N2', 'N4', 'N1'], checkedBy: 'בודקת' });
    expect(crashed()).toBe(false);
  }, 20_000);

  it('allocates an approved receipt in the editor: proposal by month, partial mark, surplus, refusal shown, then one click', async () => {
    identifiedDay();
    proposeOut = {
      ok: true, receiptKey: 'RCPT-N5', amount: 9000, debtCheckResult: 'נסגר לאפס – חודש אחד', closedMonths: ['2026-09'], allocationConfidence: 100, alreadyAllocated: false, current: [], errors: [],
      months: [
        { dueMonth: '2026-09', monthLabel: 'ספטמבר 2026', closedByDebtCheck: true, openTotal: 9000, invoices: [
          { invoiceNumber: 'TEST-INV-7', dueDate: '2026-09-30', invoiceAmount: 6000, openBefore: 6000, proposed: 6000, isPartial: false, current: 0, otherReceipts: [] },
          { invoiceNumber: 'TEST-INV-8', dueDate: '2026-09-30', invoiceAmount: 3000, openBefore: 3000, proposed: 3000, isPartial: false, current: 0, otherReceipts: [] },
        ] },
        { dueMonth: '2026-10', monthLabel: 'אוקטובר 2026', closedByDebtCheck: false, openTotal: 4000, invoices: [
          { invoiceNumber: 'TEST-INV-9', dueDate: '2026-10-31', invoiceAmount: 4000, openBefore: 4000, proposed: 0, isPartial: false, current: 0, otherReceipts: [] },
        ] },
      ],
    };
    applyOut = { ok: false, errors: ['חשבונית TEST-INV-8 אינה פתוחה אצל הלקוח'] };
    setup('/collections/receipts');
    const section = await screen.findByRole('region', { name: 'זיהוי לקוחות' }, { timeout: 4000 });
    await act(async () => {
      fireEvent.click(within(section).getByRole('button', { name: /פיזור לחשבוניות/ }));
    });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByLabelText('הסכום לחשבונית TEST-INV-7', undefined, { timeout: 2000 });
    expect(inputs.ProposeAllocation).toEqual({ receiptKey: 'RCPT-N5', dryRun: true });
    expect(within(sheet).getByText('נסגר בבדיקת החוב')).toBeTruthy();
    expect(within(sheet).getByText('אוקטובר 2026')).toBeTruthy();
    expect((within(sheet).getByLabelText('הסכום לחשבונית TEST-INV-7') as HTMLInputElement).value).toBe('6000');
    expect((within(sheet).getByLabelText('הסכום לחשבונית TEST-INV-9') as HTMLInputElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.change(within(sheet).getByLabelText('הסכום לחשבונית TEST-INV-8'), { target: { value: '2000' } });
    });
    expect(within(sheet).getByText('חלקית')).toBeTruthy();
    expect(within(sheet).getByText('יישאר זכות על חשבון').nextElementSibling?.textContent).toContain('1,000');
    const approve = within(sheet).getByRole('button', { name: /אשר פיזור/ });
    await act(async () => {
      fireEvent.click(approve);
    });
    await settle(150);
    expect(inputs.ApplyAllocation).toEqual({
      receiptKey: 'RCPT-N5',
      allocations: [{ invoiceNumber: 'TEST-INV-7', amount: 6000 }, { invoiceNumber: 'TEST-INV-8', amount: 2000 }],
      approvedBy: 'בודקת',
      dryRun: false,
    });
    expect(within(sheet).getByText('חשבונית TEST-INV-8 אינה פתוחה אצל הלקוח')).toBeTruthy();
    applyOut = { ok: true, allocated: 8000, unallocated: 1000, matchStatus: 'מפוזרת – עודף על חשבון', errors: [] };
    await act(async () => {
      fireEvent.click(approve);
    });
    await settle(300);
    expect(calls.ApplyAllocation).toBe(2);
    expect(await screen.findByText('הפיזור נשמר')).toBeTruthy();
    expect(crashed()).toBe(false);
  }, 20_000);

  it('lists the field agents’ cheques with the debt check and pulls them from one button', async () => {
    tables.Receipts = [
      {
        id: 'ag1', receiptKey: 'RCPT-AGT-P1', receiptSource: 'צ׳ק סוכן', customerCode: 'TEST-004', customerName: 'בדיקה – רמות בנייה', amount: 4000, valueDate: '2026-10-25',
        preparedBy: 'יוסי', priorityReceiptNumber: 'RC-77', receiptStatus: 'אושרה – לא נשלחה', matchStatus: 'על חשבון – צריך פיזור', debtCheckResult: 'לברר מול הלקוח', identifyStatus: 'אושר',
      },
    ];
    pullOut = { ok: true, created: 1, summary: 'נקלט צ׳ק אחד של סוכן', errors: ['תשלום P9: הלקוח לא קיים'] };
    setup('/collections/receipts');
    const section = await screen.findByRole('region', { name: 'צ׳קים של סוכנים' }, { timeout: 4000 });
    await within(section).findByText('לברר מול הלקוח', undefined, { timeout: 2000 });
    expect(within(section).getByText('RC-77')).toBeTruthy();
    expect(within(section).getByRole('button', { name: /פיזור לחשבוניות/ })).toBeTruthy();
    expect(calls.PullAgentReceipts ?? 0).toBe(0);
    await act(async () => {
      fireEvent.click(within(section).getByRole('button', { name: /משוך צ׳קים של סוכנים/ }));
    });
    await settle(150);
    expect(inputs.PullAgentReceipts).toEqual({});
    expect(within(section).getByText('תשלום P9: הלקוח לא קיים')).toBeTruthy();
    expect(await screen.findByText('נקלט צ׳ק אחד של סוכן')).toBeTruthy();
    expect(crashed()).toBe(false);
  }, 20_000);

  it('opens on the file upload when no source is set, and names the source in the header', async () => {
    tables.AgentSettings = [];
    tables.ImportBatches = [];
    tables.BankLines = [];
    setup('/collections/receipts');
    expect(await screen.findByRole('region', { name: 'העלאת קובץ הבנק' }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole('link', { name: /מקור השורות: קובץ דף בנק/ }).getAttribute('href')).toBe('/collections/settings');
    expect(screen.queryByRole('region', { name: 'משיכה מפריוריטי' })).toBeNull();
    expect(screen.getByRole('button', { name: /בחירת קובץ/ })).toBeTruthy();
    expect(crashed()).toBe(false);
  }, 20_000);
});