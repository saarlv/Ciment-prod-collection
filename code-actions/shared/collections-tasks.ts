// The tasks (CollectionQueue): one row per open problem, keyed by taskKey. Pure functions only — no I/O.
//
// Every writer that opens a task builds its row here (buildTaskRow), so the 06:00 scan (BuildTasks) and the later
// scoped writers produce identical rows. The I/O half — load the existing rows,
// diff, write, read back — is collections-task-upsert.ts (kept apart so this module never imports it).
//
// Keys (kind:id) and what opens them, per source:
//   דוח גיול  aging-overdue:<invoiceNumber>  open invoice overdue > taskOverdueMinDays, no open dispute, and no active
//                                            CustomerNotes commitment (התחייבות לתשלום, outcome פתוחה) or בירור note
//                                            (אחר, customTypeLabel "בירור – …") on its due month
//             dispute-followup:<disputeId>   open Disputes row whose nextReminderAt has passed
//             note-followup:<noteId>         retired with the old aging notes (wave 3): never opened, an open one is closed
//             docs-missing:<invoiceNumber>   open invoice with delivery notes missing
//   הבטחות    promise-broken:<promiseId>     retired with the old payment promises (wave 3): never opened, an open one
//                                            is closed (commitments open the grouped notes:promise:… task instead)
//   פניות     inbox:<emailId>                handlingState לא טופל (or a promise proposal awaiting approval, not טופל), not לא
//                                            רלוונטי (none while the sender awaits verification); title "לאשר הבטחה מהמייל" for a proposal
//             verify-sender:<emailId>        a data request (כרטסת / חובות פתוחים) from a sender not מאומת, or an unknown
//                                            sender whose signature suggests a customer (title "זה הלקוח X?"); not after
//                                            ConfirmSender rejected the sender
//             (inbox:<id> is not opened when every category of the email is carried by a manual:… task)
//             draft:<approvalId>             Approvals ממתין
//   תקבולים   receipt-customer:<bankLineId>   payer not identified, no receipt (לא זוהה)
//             (the identify / debt-check / zero-close / allocation tasks – identify:, debt-check:, debt-zero:, allocate: –
//             are written by IdentifyCustomers / IssueReceipt / CheckDebt / ProposeAllocation themselves; the old match,
//             detail-request and manager-approval receipt tasks were removed on 08.11)
//             receipt-bounced:cheque:<bankAccount>:<chequeNumber>  one task per returned cheque however many lines / uploads
//                                             show it (relatedId = the earliest line); receipt-bounced:<bankLineId> when no
//                                             cheque number can be read. An open task under the old line key is re-keyed.
//   (unmanaged) bank-missing:<date>           written by SyncPriorityBankLines only; parseTaskKey returns null for it, so
//                                             the scan never opens, refreshes or closes it
//   (unmanaged) day-pull-failed:<date>        written by RunDaySchedule only (the 06:00 phase failed); same rule
// Every row sets isAlert (CollectionQueue has no column defaults): false for every task built here.
// A key whose prefix is not one of these (manual:…, rows without a key) is never managed.
import type { Item } from './blocks/blocks-client.ts';
import { diffDays, formatDateHe, israelDateOfInstant, israelLocalToUtcIso, nextBusinessDay, sortableTime, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, formatIls, isTestCode, num, numberSetting, numOrNull, ownerOf, round2, splitList, str } from './collections-data.ts';
import { countDocuments } from './collections-documents.ts';
import { categoriesOf, pendingPromiseOf, readQuotes, senderRejected, signatureLines, storedSignatureOf, TITLE_PROMISE_APPROVAL } from './collections-inbox.ts';
import { effectiveOpen, hasOpenAmount, openDisputesByInvoice } from './collections-invoice-layer.ts';
import { DATA_CATEGORIES } from './collections-mail.ts';
import { computeSeverity, SEV_CRITICAL, SEV_HIGH, SEV_MEDIUM, type Severity, type SeverityConfig, severityConfigFrom } from './collections-severity.ts';

// ---------- enums (exactly as in the CollectionQueue artifact) ----------
export const TS_OPEN = 'ממתין';
export const TS_WORKING = 'בטיפול';
export const TS_DONE = 'טופל';
export const TS_REJECTED = 'נדחה';
export const TS_AUTO_CLOSED = 'נסגר אוטומטית';
export const OPEN_TASK_STATUSES = [TS_OPEN, TS_WORKING];
export const PERSON_CLOSED_STATUSES = [TS_DONE, TS_REJECTED];

export const SRC_AGING = 'דוח גיול';
export const SRC_PROMISES = 'הבטחות';
export const SRC_INBOX = 'פניות';
export const SRC_RECEIPTS = 'תקבולים';
/** The sources the task scan reads (CollectionQueue.source also has ביטוח, which the scan never manages). */
export const SCAN_SOURCES = [SRC_AGING, SRC_PROMISES, SRC_INBOX, SRC_RECEIPTS];

export const TT_COLLECT = 'לגבות מהלקוח';
export const TT_DISPUTE_PRICE = 'מעקב בירור – מחיר';
export const TT_DISPUTE_DOC = 'מעקב בירור – תעודה חסרה';
export const TT_DISPUTE_OTHER = 'מעקב בירור – אחר';
export const TT_DOCS = 'תעודות משלוח חסרות';
export const TT_PROMISE = 'הבטחה הופרה';
export const TT_INBOX = 'מייל לטיפול';
export const TT_VERIFY = 'לאמת שולח';
export const TT_DRAFT = 'טיוטה לאישור';
/** receipt first (r3): the unknown-payer task type */
export const TT_RC_CUSTOMER = 'לא זוהה';
export const TT_RC_BOUNCED = 'צ׳ק חוזר';
/** plan r3 stage 2: the bank lines of a business day were not pulled by receiptsReadyBy (old type, kept for old rows) */
export const TT_BANK_MISSING = 'דפי בנק לא נטענו';
/** plan 04.11 stage 2: the urgent task when the bank statement is not in Priority by bankRecheckAt (key bank-missing:<date>) */
export const TT_BANK_NOT_IN_PRIORITY = 'דף הבנק לא עלה לפריוריטי';
/** plan 04.11 part A: the 06:00 phase of the work day (morning pull from Priority) failed */
export const TT_DAY_PULL_FAILED = 'משיכת הבוקר נכשלה';

export const A_REMIND = 'לשלוח תזכורת';
export const A_WHATSAPP = 'לשלוח WhatsApp';
export const A_CALL = 'להתקשר';
export const A_DISPUTE = 'לטפל במחלוקת';
export const A_PROMISE = 'לבדוק הבטחה';
export const A_AGENT = 'לדבר עם הסוכן';
export const A_LOGISTICS = 'לפנות ללוגיסטיקה';
export const A_MAIL = 'לטפל במייל';
export const A_DRAFT = 'לאשר טיוטה';
export const A_RECEIPT = 'להתאים תקבול';

// ---------- keys ----------
export type TaskKind =
  | 'aging-overdue'
  | 'dispute-followup'
  | 'note-followup'
  | 'docs-missing'
  | 'promise-broken'
  | 'inbox'
  | 'verify-sender'
  | 'draft'
  | 'receipt-customer'
  | 'receipt-bounced';

/** Which id list of a scoped run limits a kind: aging + promise only by customer / source. */
export type ScopeGroup = 'aging' | 'promise' | 'inbox' | 'draft' | 'receipt';

export const TASK_KINDS: Record<TaskKind, { source: string; group: ScopeGroup }> = {
  'aging-overdue': { source: SRC_AGING, group: 'aging' },
  'dispute-followup': { source: SRC_AGING, group: 'aging' },
  'note-followup': { source: SRC_AGING, group: 'aging' },
  'docs-missing': { source: SRC_AGING, group: 'aging' },
  'promise-broken': { source: SRC_PROMISES, group: 'promise' },
  inbox: { source: SRC_INBOX, group: 'inbox' },
  'verify-sender': { source: SRC_INBOX, group: 'inbox' },
  draft: { source: SRC_INBOX, group: 'draft' },
  'receipt-customer': { source: SRC_RECEIPTS, group: 'receipt' },
  'receipt-bounced': { source: SRC_RECEIPTS, group: 'receipt' },
};
export const RECEIPT_KINDS: TaskKind[] = ['receipt-customer', 'receipt-bounced'];

/** Kinds built with buildTaskRow but never managed by the scan (not in TASK_KINDS, so parseTaskKey ignores them). */
export type UnmanagedKind = 'bank-missing' | 'day-pull-failed' | 'manual' | 'notes';
export const UNMANAGED_KINDS: Record<UnmanagedKind, { source: string }> = {
  'bank-missing': { source: SRC_RECEIPTS },
  // plan 04.11 part C: manual:<what>:<id> – one-off tasks for a person (shared/collections-sender.ts ensureManualTask);
  // the writer sets the row's source, this is only the default
  manual: { source: SRC_INBOX },
  // plan 04.11: written by RunDaySchedule only (shared/collections-day-schedule.ts)
  'day-pull-failed': { source: SRC_AGING },
  // plan 04.11 stage 2: the grouped note tasks notes:<type>:<date>:<bookkeeper>, written by shared/collections-note-tasks.ts
  // only – parseTaskKey does not know the kind, so the per-problem scan never opens, refreshes or closes them
  notes: { source: SRC_AGING },
};
const sourceOfKind = (kind: TaskKind | UnmanagedKind): string =>
  Object.prototype.hasOwnProperty.call(TASK_KINDS, kind) ? TASK_KINDS[kind as TaskKind].source : UNMANAGED_KINDS[kind as UnmanagedKind].source;

export const taskKeyOf = (kind: TaskKind | UnmanagedKind, id: unknown) => `${kind}:${str(id).trim()}`;
export const bankMissingKey = (date: unknown) => taskKeyOf('bank-missing', date);
export const dayPullFailedKey = (date: unknown) => taskKeyOf('day-pull-failed', date);
export const agingOverdueKey = (invoiceNumber: unknown) => taskKeyOf('aging-overdue', invoiceNumber);
export const disputeFollowupKey = (disputeId: unknown) => taskKeyOf('dispute-followup', disputeId);
export const noteFollowupKey = (noteId: unknown) => taskKeyOf('note-followup', noteId);
export const docsMissingKey = (invoiceNumber: unknown) => taskKeyOf('docs-missing', invoiceNumber);
export const promiseBrokenKey = (promiseId: unknown) => taskKeyOf('promise-broken', promiseId);
export const inboxKey = (emailId: unknown) => taskKeyOf('inbox', emailId);
export const verifySenderKey = (emailId: unknown) => taskKeyOf('verify-sender', emailId);
export const draftKey = (approvalId: unknown) => taskKeyOf('draft', approvalId);

/** kind + id of a managed key; null for a manual / unknown key (never touched). */
export function parseTaskKey(key: unknown): { kind: TaskKind; id: string } | null {
  const s = str(key).trim();
  const i = s.indexOf(':');
  if (i <= 0) return null;
  const kind = s.slice(0, i) as TaskKind;
  const id = s.slice(i + 1).trim();
  if (!id || !Object.prototype.hasOwnProperty.call(TASK_KINDS, kind)) return null;
  return { kind, id };
}

export const sourceOfKey = (key: unknown): string | null => {
  const p = parseTaskKey(key);
  return p ? TASK_KINDS[p.kind].source : null;
};

// ---------- the row ----------
export interface TaskRowSpec {
  kind: TaskKind | UnmanagedKind;
  id: string;
  taskType: string;
  title: string;
  reasons: string;
  recommendedAction: string;
  severity: Severity;
  customerCode: string | null;
  customerName: string | null;
  owner: string | null;
  amount: number | null;
  invoiceNumbers: string[];
  relatedTable: string;
  relatedId: string;
  dueAt: string;
  asOfDate: string;
  nowIso: string;
  isTestFixture: boolean;
  /** CollectionQueue.needsManagerApproval (false unless given) */
  needsManagerApproval?: boolean;
  /** CollectionQueue.isAlert (false unless given): an alert has nothing to do, a task does */
  isAlert?: boolean;
}

/** A complete CollectionQueue row (every column set — no column defaults) for a new open task. */
export function buildTaskRow(s: TaskRowSpec): Item {
  return {
    queueDate: s.asOfDate,
    customerCode: s.customerCode || null,
    customerName: s.customerName || null,
    assignedBookkeeperName: s.owner || null,
    priorityScore: s.severity.score,
    reasons: s.reasons,
    recommendedAction: s.recommendedAction,
    status: TS_OPEN,
    handledBy: null,
    handledAt: null,
    taskType: s.taskType,
    needsManagerApproval: s.needsManagerApproval === true,
    isAlert: s.isAlert === true,
    relatedTable: s.relatedTable,
    relatedId: s.relatedId,
    dueAt: s.dueAt,
    taskKey: taskKeyOf(s.kind, s.id),
    title: s.title,
    severity: s.severity.level,
    severityScore: s.severity.score,
    source: sourceOfKind(s.kind),
    invoiceNumbers: s.invoiceNumbers.join(',') || null,
    amount: s.amount === null ? null : round2(s.amount),
    openedAt: s.nowIso,
    lastCheckedAt: s.nowIso,
    resolvedAt: null,
    resolvedReason: null,
    isTestFixture: s.isTestFixture,
  };
}

/** Columns a refresh of an open task rewrites (status, openedAt, queueDate, dueAt and handledBy/At stay). */
export const REFRESH_FIELDS = [
  'customerCode',
  'customerName',
  'assignedBookkeeperName',
  'priorityScore',
  'reasons',
  'recommendedAction',
  'taskType',
  'needsManagerApproval',
  'isAlert',
  'relatedTable',
  'relatedId',
  'title',
  'severity',
  'severityScore',
  'source',
  'invoiceNumbers',
  'amount',
  'lastCheckedAt',
  'isTestFixture',
];

// ---------- context ----------
export const OVERDUE_MIN_DAYS_SETTING = 'taskOverdueMinDays';
export const DEFAULT_OVERDUE_MIN_DAYS = 7;
/** The inbox reply SLA (IngestEmail sets InboundEmails.dueAt = receivedAt + replySlaHours). */
export const INBOX_SLA_SETTING = 'replySlaHours';
export const DEFAULT_INBOX_SLA_HOURS = 24;
export const DRAFT_MAX_HOURS = 24;

export interface TaskContext {
  asOfDate: string;
  /** real time of the run: openedAt / lastCheckedAt / resolvedAt */
  nowIso: string;
  /** the clock problems are judged by: nowIso on today's date, else the end of asOfDate in Israel (demo clock) */
  clockMs: number;
  severity: SeverityConfig;
  overdueMinDays: number;
  inboxSlaHours: number;
  customersByCode: Map<string, Item>;
  ownerMap: Map<string, string>;
}

export function taskContext(x: { asOfDate: string; nowIso: string; settings: Map<string, string>; customers: Item[]; owners: Item[] }): TaskContext {
  const today = israelDateOfInstant(new Date(x.nowIso));
  const min = numberSetting(x.settings, OVERDUE_MIN_DAYS_SETTING, DEFAULT_OVERDUE_MIN_DAYS);
  const sla = numberSetting(x.settings, INBOX_SLA_SETTING, DEFAULT_INBOX_SLA_HOURS);
  return {
    asOfDate: x.asOfDate,
    nowIso: x.nowIso,
    clockMs: x.asOfDate === today ? Date.parse(x.nowIso) : Date.parse(israelLocalToUtcIso(x.asOfDate, 23, 59)),
    severity: severityConfigFrom(x.settings),
    overdueMinDays: min >= 0 ? min : DEFAULT_OVERDUE_MIN_DAYS,
    inboxSlaHours: sla > 0 ? sla : DEFAULT_INBOX_SLA_HOURS,
    customersByCode: new Map(x.customers.map((c) => [str(c.customerCode).trim(), c])),
    ownerMap: buildOwnerMap(x.owners),
  };
}

/** Customer name and owning bookkeeper from the data (CustomerOwners first, else Customers — as CreateTask). */
export function customerOf(ctx: TaskContext, code: unknown, fallback: { name?: unknown; owner?: unknown } = {}) {
  const customerCode = str(code).trim();
  const customer = customerCode ? ctx.customersByCode.get(customerCode) : undefined;
  return {
    customerCode: customerCode || null,
    customerName: str(customer?.customerName).trim() || str(fallback.name).trim() || customerCode || null,
    owner: (customerCode ? ownerOf(customerCode, customer, ctx.ownerMap) : '') || str(fallback.owner).trim() || null,
  };
}

const isTrue = (v: unknown) => v === true || v === 'true';
const fixture = (_code: unknown, _row?: Item) => false;
const nextNoonIso = (asOfDate: string) => israelLocalToUtcIso(nextBusinessDay(asOfDate), 12, 0);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const ils = (n: number) => `${formatIls(n)} ש״ח`;
const dateHe = (v: unknown) => {
  const d = toIsraelDate(v);
  return d ? formatDateHe(d) : '';
};
const fixedSeverity = (level: string, cfg: SeverityConfig): Severity => {
  const score = level === SEV_CRITICAL ? cfg.scoreCritical : level === SEV_HIGH ? cfg.scoreHigh : level === SEV_MEDIUM ? cfg.scoreMedium : 0;
  return { score: Math.round(score), level };
};

// ---------- desired tasks ----------
export interface DesiredTask {
  key: string;
  kind: TaskKind;
  /** the full row for a create / reopen (refresh takes REFRESH_FIELDS from it); only customerCode for refreshOnly */
  row: Item;
  /** keep / close only: never created or reopened by this writer, a refresh only stamps lastCheckedAt */
  refreshOnly?: boolean;
  /** another key that, while its task is open, replaces this one (inbox → verify-sender) */
  suppressedBy?: string;
  /** resolvedReason when this task closes because the suppressing task is open */
  suppressedReason?: string;
  /**
   * Older keys of the same problem (a returned cheque's receipt-bounced:<bankLineId> keys): an open row under one is
   * re-keyed to `key` when `key` has no row yet (status / openedAt / handledBy kept), the other open ones close as
   * duplicates, and a closed one is never reopened.
   */
  aliasKeys?: string[];
  /** resolvedReason prefix of an alias row closed as a duplicate */
  aliasReason?: string;
}

export interface SourceTasks {
  source: string;
  tasks: DesiredTask[];
  /** Hebrew resolvedReason for a key of this source whose problem is gone */
  closeReason: (key: string) => string;
}

// ---------- invoices ----------
const CREDIT_NOTE = 'חשבונית זיכוי';
/** The open amount after our allocations: the layer's remainingAmount, else Priority's open amount less pending. */
export const remainingOf = (inv: Item): number => {
  const r = numOrNull(inv.remainingAmount);
  return round2(r !== null ? r : effectiveOpen(inv));
};
export const isOpenInvoice = (inv: Item) => str(inv.documentType) !== CREDIT_NOTE && hasOpenAmount(inv) && remainingOf(inv) > 0.005;
export const daysOverdueOf = (inv: Item | undefined, asOfDate: string): number => {
  const due = toIsraelDate(inv?.dueDate);
  return due ? diffDays(asOfDate, due) : 0;
};

/** invoiceNumber → open invoice (first of a number; a number shared by two customers is keyed per customer too). */
export function openInvoiceIndex(invoices: Item[]) {
  const byNo = new Map<string, Item>();
  const byCodeNo = new Map<string, Item>();
  for (const inv of invoices) {
    if (!isOpenInvoice(inv)) continue;
    const no = str(inv.invoiceNumber).trim();
    if (!no) continue;
    if (!byNo.has(no)) byNo.set(no, inv);
    byCodeNo.set(`${str(inv.customerCode).trim()}|${no}`, inv);
  }
  const get = (no: string, code?: string | null) => (code ? byCodeNo.get(`${code}|${no}`) : undefined) ?? byNo.get(no);
  return { byNo, get, list: [...byCodeNo.values()] };
}

const DISPUTE_CLOSED = 'נסגרה';
const DOC_DISPUTE = 'תעודת משלוח חסרה';
const PRICE_DISPUTE = 'מחיר';

const sameCustomer = (a: unknown, b: unknown) => !str(a).trim() || !str(b).trim() || str(a).trim() === str(b).trim();

const NOTE_COMMITMENT = 'התחייבות לתשלום';
const NOTE_OTHER = 'אחר';
const NOTE_DISPUTE_PREFIX = 'בירור – ';
const NOTE_ACTIVE = 'פעילה';
const OUTCOME_OPEN = 'פתוחה';
/** the CustomerNotes types the aging scan reads (commitments, and אחר for the בירור notes) */
export const AGING_NOTE_TYPES = [NOTE_COMMITMENT, NOTE_OTHER];
/** The due month (YYYY-MM) of an invoice: its dueDate, else its dueMonth. */
const invoiceMonthOf = (inv: Item): string => {
  const due = toIsraelDate(inv.dueDate);
  if (due) return due.slice(0, 7);
  const m = str(inv.dueMonth).trim();
  return /^\d{4}-\d{2}$/.test(m) ? m : '';
};
/**
 * customerCode|dueMonth → why the month is handled: an active commitment still open (CustomerNotes התחייבות לתשלום,
 * פעילה, outcome פתוחה) or an active בירור note (אחר, customTypeLabel "בירור – …").
 */
export function notedMonths(notes: Item[]): Map<string, 'commitment' | 'dispute'> {
  const out = new Map<string, 'commitment' | 'dispute'>();
  for (const n of notes) {
    if (str(n.status).trim() !== NOTE_ACTIVE) continue;
    const key = `${str(n.customerCode).trim()}|${str(n.dueMonth).trim()}`;
    const type = str(n.noteType).trim();
    if (type === NOTE_COMMITMENT) {
      const outcome = str(n.outcome).trim();
      if (!outcome || outcome === OUTCOME_OPEN) out.set(key, 'commitment');
    } else if (type === NOTE_OTHER && str(n.customTypeLabel).trim().startsWith(NOTE_DISPUTE_PREFIX) && !out.has(key)) out.set(key, 'dispute');
  }
  return out;
}

/** aging source: overdue invoices, dispute follow-ups and missing delivery notes. */
export function agingTasks(ctx: TaskContext, data: { invoices: Item[]; disputes: Item[]; deliveryNotes: Item[]; customerNotes?: Item[] }): SourceTasks {
  const { asOfDate, nowIso } = ctx;
  const open = openInvoiceIndex(data.invoices);
  const openDisputes = data.disputes.filter((d) => str(d.status).trim() !== DISPUTE_CLOSED);
  const disputesOf = openDisputesByInvoice(openDisputes);
  const disputesById = new Map(openDisputes.map((d) => [str(d.id), d]));
  const hasOwnDispute = (inv: Item) => (disputesOf.get(str(inv.invoiceNumber).trim()) ?? []).some((d) => sameCustomer(d.customerCode, inv.customerCode));
  const noted = notedMonths(data.customerNotes ?? []);
  const notedAs = (inv: Item) => noted.get(`${str(inv.customerCode).trim()}|${invoiceMonthOf(inv)}`);
  const tasks: DesiredTask[] = [];
  const push = (kind: TaskKind, id: string, spec: Omit<TaskRowSpec, 'kind' | 'id' | 'asOfDate' | 'nowIso'>) =>
    tasks.push({ key: taskKeyOf(kind, id), kind, row: buildTaskRow({ ...spec, kind, id, asOfDate, nowIso }) });

  // aging-overdue
  for (const inv of open.list) {
    const no = str(inv.invoiceNumber).trim();
    const days = daysOverdueOf(inv, asOfDate);
    if (days <= ctx.overdueMinDays) continue;
    if (notedAs(inv) || str(inv.openDisputeId).trim() || hasOwnDispute(inv)) continue;
    const rem = remainingOf(inv);
    const who = customerOf(ctx, inv.customerCode, { name: inv.customerName });
    const customer = who.customerCode ? ctx.customersByCode.get(who.customerCode) : undefined;
    const channel = str(customer?.preferredChannel);
    const action = days >= 30 || channel === 'טלפון' ? A_CALL : channel === 'WhatsApp' ? A_WHATSAPP : A_REMIND;
    push('aging-overdue', no, {
      taskType: TT_COLLECT,
      title: `לגבות – ${who.customerName}: חשבונית ${no}, ${ils(rem)}, ${days} ימים בפיגור`,
      reasons: `חשבונית ${no} לפירעון ${dateHe(inv.dueDate)}, יתרה ${ils(rem)}, ${days} ימים בפיגור. אין התחייבות לתשלום פתוחה או הערת בירור על החודש ואין בירור פתוח`,
      recommendedAction: action,
      severity: computeSeverity({ amount: rem, daysOverdue: days }, ctx.severity),
      ...who,
      amount: rem,
      invoiceNumbers: [no],
      relatedTable: 'Invoices',
      relatedId: str(inv.id) || no,
      dueAt: nextNoonIso(asOfDate),
      isTestFixture: fixture(who.customerCode, inv),
    });
  }

  // dispute-followup
  for (const d of openDisputes) {
    const next = str(d.nextReminderAt).trim();
    if (!next || sortableTime(next) > ctx.clockMs) continue;
    const id = str(d.id);
    const type = str(d.disputeType).trim();
    const nos = splitList(d.invoiceNumbers);
    const invs = nos.map((no) => open.get(no, str(d.customerCode).trim())).filter((x): x is Item => !!x);
    const amount = num(d.disputedAmount) > 0.005 ? round2(num(d.disputedAmount)) : round2(invs.reduce((s, i) => s + remainingOf(i), 0));
    const days = Math.max(0, ...invs.map((i) => daysOverdueOf(i, asOfDate)));
    const who = customerOf(ctx, d.customerCode, { name: d.customerName, owner: d.ownerBookkeeperName });
    const [taskType, action] = type === PRICE_DISPUTE ? [TT_DISPUTE_PRICE, A_AGENT] : type === DOC_DISPUTE ? [TT_DISPUTE_DOC, A_LOGISTICS] : [TT_DISPUTE_OTHER, A_DISPUTE];
    const label = str(d.disputeNumber).trim() || id;
    push('dispute-followup', id, {
      taskType,
      title: `מעקב בירור ${label} – ${who.customerName}: ${type || 'אחר'}${nos.length ? `, ${plural(nos.length, 'חשבונית', 'חשבוניות')} ${nos.join(', ')}` : ''}`,
      reasons: [
        `בירור ${label} (${type || 'אחר'})${nos.length ? ` על ${plural(nos.length, 'חשבונית', 'חשבוניות')} ${nos.join(', ')}` : ''}, סטטוס ${str(d.status) || 'פתוחה'}`,
        str(d.ballWith).trim() ? `הכדור אצל ${str(d.ballWith).trim()}` : '',
        `מועד המעקב ${dateHe(next)} הגיע${num(d.reminderCount) > 0 ? ` (נשלחו ${num(d.reminderCount)} תזכורות)` : ''}`,
        str(d.description).trim(),
      ]
        .filter(Boolean)
        .join('. '),
      recommendedAction: action,
      severity: computeSeverity({ amount, daysOverdue: days }, ctx.severity),
      ...who,
      amount,
      invoiceNumbers: nos,
      relatedTable: 'Disputes',
      relatedId: id,
      dueAt: nextNoonIso(asOfDate),
      isTestFixture: fixture(who.customerCode, d),
    });
  }

  // docs-missing
  const notesByInvoice = new Map<string, Item[]>();
  for (const n of data.deliveryNotes) {
    const no = str(n.invoiceNumber).trim();
    if (!notesByInvoice.has(no)) notesByInvoice.set(no, []);
    notesByInvoice.get(no)!.push(n);
  }
  const docGaps = new Map<string, ReturnType<typeof countDocuments>>();
  for (const inv of open.list) {
    if (!docCandidate(inv)) continue;
    const no = str(inv.invoiceNumber).trim();
    const count = countDocuments(inv, no, notesByInvoice.get(no) ?? []);
    if (count.allScanned) continue;
    docGaps.set(no, count);
    const rem = remainingOf(inv);
    const days = daysOverdueOf(inv, asOfDate);
    const who = customerOf(ctx, inv.customerCode, { name: inv.customerName });
    const missing = count.missingNoteNumbers.length + count.missingUnknown;
    const listed = count.missingNoteNumbers.length ? `: ${count.missingNoteNumbers.join(', ')}` : '';
    push('docs-missing', no, {
      taskType: TT_DOCS,
      title: `תעודות משלוח חסרות – ${who.customerName}: חשבונית ${no} (${missing} ${plural(missing, 'חסרה', 'חסרות')})`,
      reasons: `חשבונית ${no}: נסרקו ${count.scanned} מתוך ${count.expected} תעודות משלוח, ${plural(missing, 'חסרה', 'חסרות')} ${missing}${listed}${count.missingUnknown && count.missingNoteNumbers.length ? ` ועוד ${count.missingUnknown} שלא נקלטו` : ''}. יתרה ${ils(rem)}`,
      recommendedAction: A_LOGISTICS,
      severity: computeSeverity({ amount: rem, daysOverdue: Math.max(0, days) }, ctx.severity),
      ...who,
      amount: rem,
      invoiceNumbers: [no],
      relatedTable: 'Invoices',
      relatedId: str(inv.id) || no,
      dueAt: nextNoonIso(asOfDate),
      isTestFixture: fixture(who.customerCode, inv),
    });
  }

  const closeReason = (key: string) => {
    const p = parseTaskKey(key);
    if (!p) return 'הבעיה נפתרה';
    if (p.kind === 'aging-overdue') {
      const inv = open.byNo.get(p.id);
      if (!inv) return 'החשבונית שולמה';
      const why = notedAs(inv);
      if (why === 'commitment') return 'נרשמה התחייבות לתשלום על החודש';
      if (why === 'dispute') return 'נרשמה הערת בירור על החודש';
      if (str(inv.openDisputeId).trim() || hasOwnDispute(inv)) return 'נפתח בירור על החשבונית';
      return `החשבונית אינה בפיגור של יותר מ-${ctx.overdueMinDays} ימים`;
    }
    if (p.kind === 'dispute-followup') {
      const d = disputesById.get(p.id);
      return d ? `מועד המעקב נדחה ל-${dateHe(d.nextReminderAt)}` : 'הבירור נסגר';
    }
    if (p.kind === 'note-followup') return NOTES_RETIRED;
    if (p.kind === 'docs-missing') return open.byNo.has(p.id) ? 'התעודות נסרקו' : 'החשבונית שולמה';
    return 'הבעיה נפתרה';
  };
  return { source: SRC_AGING, tasks, closeReason };
}

/** An open invoice that may lack delivery notes (flag, or fewer attached than expected); countDocuments decides. */
export const docCandidate = (inv: Item) => isOpenInvoice(inv) && (isTrue(inv.missingDeliveryNotes) || num(inv.deliveryNotesExpected) > num(inv.deliveryNotesAttached));

// ---------- promises (retired) ----------
/** Why a leftover note-followup / promise-broken task is closed: the old aging notes / payment promises are gone. */
export const NOTES_RETIRED = 'הערות הגיול וההבטחות הישנות הוחלפו בהערות לקוח – המשימה נסגרה';

/**
 * promise source: the old payment promises were removed (wave 3), so nothing opens here any more; the scan closes any
 * promise-broken task still open (commitments open the grouped notes:promise:… task, shared/collections-note-tasks.ts).
 */
export function promiseTasks(): SourceTasks {
  return { source: SRC_PROMISES, tasks: [], closeReason: () => NOTES_RETIRED };
}

// ---------- inbox ----------
export const HS_OPEN = 'לא טופל';
export const HS_WAITING = 'ממתין';
export const HS_DONE = 'טופל';
const IRRELEVANT = 'לא רלוונטי';
const AWAITING_VERIFICATION = ['לא מאומת', 'לבדיקה'];
const APPROVAL_PENDING = 'ממתין';

const irrelevant = (e: Item) => str(e.category).trim() === IRRELEVANT || str(e.status).trim() === 'לא רלוונטית';
/** The customer the signature of an unknown sender suggests (InboundEmails.suggestedCustomerCode), or ''. */
export const suggestedCodeOf = (e: Item) => str(e.suggestedCustomerCode).trim();

/**
 * The sender is not מאומת and a person has to say who it is: a data request (כרטסת / חובות פתוחים – nothing is sent
 * before a person verifies), or an unknown sender whose signature suggests a customer ("זה הלקוח X?", plan 04.11
 * part C). Never after a person rejected the sender (ConfirmSender mode reject).
 */
export const awaitsVerification = (e: Item) =>
  !irrelevant(e) &&
  str(e.handlingState).trim() !== HS_DONE &&
  AWAITING_VERIFICATION.includes(str(e.senderVerification).trim()) &&
  !senderRejected(e) &&
  (categoriesOf(e).some((c) => DATA_CATEGORIES.includes(c)) || !!suggestedCodeOf(e));

/** Category types that only open a manual task (plan 04.11 part C): the email's own inbox task is not needed for them. */
const MANUAL_ONLY_CATEGORIES = ['תעודות וחשבוניות חסרות', 'הפרש מחיר', 'אישור ביטוח אשראי'];
/** Every category of the email is carried by a manual task stored on it (classificationQuotes.manualTasks). */
export const carriedByManualTasks = (e: Item) => {
  const list = readQuotes(e.classificationQuotes).manualTasks;
  const cats = categoriesOf(e);
  return Array.isArray(list) && list.length > 0 && cats.length > 0 && cats.every((c) => MANUAL_ONLY_CATEGORIES.includes(c));
};

const sender = (e: Item) => str(e.fromName).trim() || str(e.fromAddress).trim() || 'שולח לא ידוע';
const subjectOf = (e: Item) => str(e.subject).trim() || '(ללא נושא)';

/** inbox source: unhandled mails, senders awaiting verification, drafts awaiting approval. */
export function inboxTasks(ctx: TaskContext, data: { emails: Item[]; approvals: Item[] }): SourceTasks {
  const { asOfDate, nowIso } = ctx;
  const tasks: DesiredTask[] = [];
  const emailsById = new Map(data.emails.map((e) => [str(e.id), e]));
  const level = (late: boolean) => fixedSeverity(late ? SEV_HIGH : SEV_MEDIUM, ctx.severity);

  for (const e of data.emails) {
    if (irrelevant(e)) continue;
    const id = str(e.id);
    const who = customerOf(ctx, e.customerCode, { name: e.customerName, owner: e.assignedBookkeeperName });
    const received = str(e.receivedAt) || str(e.createdAt);
    const dueMs = str(e.dueAt) ? sortableTime(e.dueAt) : sortableTime(received) + ctx.inboxSlaHours * 3_600_000;
    const dueAt = dueMs > 0 ? new Date(dueMs).toISOString() : nextNoonIso(asOfDate);
    const late = dueMs > 0 && ctx.clockMs > dueMs;
    const cats = categoriesOf(e);
    const catText = cats.length ? cats.join(', ') : str(e.category) || 'לא מסווג';
    const fixtureRow = fixture(who.customerCode, e);
    const verify = awaitsVerification(e);
    if (verify) {
      const suggested = suggestedCodeOf(e);
      const sig = storedSignatureOf(e);
      const suggestedName = suggested ? customerOf(ctx, suggested, { name: (sig?.suggestion as Item | null | undefined)?.customerName }).customerName || suggested : '';
      const dataCats = cats.filter((c) => DATA_CATEGORIES.includes(c));
      tasks.push({
        key: verifySenderKey(id),
        kind: 'verify-sender',
        row: buildTaskRow({
          kind: 'verify-sender',
          id,
          taskType: TT_VERIFY,
          title: suggested ? `זה הלקוח ${suggestedName}?` : `לאמת שולח – ${sender(e)}: ${subjectOf(e)}`,
          reasons: suggested
            ? [
                `שולח לא מוכר ${str(e.fromAddress).trim() || sender(e)} (${catText}). לפי החתימה זה ${suggestedName} (${suggested})`,
                ...signatureLines(sig),
                str(e.verificationBasis).trim() ? `אימות: ${str(e.senderVerification).trim()} – ${str(e.verificationBasis).trim()}` : '',
                'לאשר ולשמור את הכתובת כאיש קשר בהנהלת חשבונות, או לבחור לקוח אחר',
              ]
                .filter(Boolean)
                .join('. ')
            : `בקשת ${dataCats.join(', ')} מ-${str(e.fromAddress).trim() || sender(e)}, השולח ${str(e.senderVerification).trim()}${str(e.verificationBasis).trim() ? ` (${str(e.verificationBasis).trim()})` : ''}. לאמת בטלפון לפני ששולחים נתונים`,
          recommendedAction: A_CALL,
          severity: level(late),
          ...who,
          amount: null,
          invoiceNumbers: splitList(e.mentionedInvoiceNumbers),
          relatedTable: 'InboundEmails',
          relatedId: id,
          dueAt,
          asOfDate,
          nowIso,
          isTestFixture: fixtureRow,
        }),
      });
    }
    // a promise proposal waiting for approval keeps the task open even when another type made the email ממתין
    const proposal = pendingPromiseOf(e);
    const hs = str(e.handlingState).trim();
    if (hs !== HS_OPEN && !(proposal && hs !== HS_DONE)) continue;
    // documents / price / an unlinked insurer answer: the manual task on the email is the task (no second one)
    if (!proposal && carriedByManualTasks(e)) continue;
    const proposalText = proposal
      ? `מאיה מצאה הבטחת תשלום: ${ils(num(proposal.amount))} עד ${dateHe(str(proposal.date))}${Array.isArray(proposal.invoiceNumbers) && proposal.invoiceNumbers.length ? ` (${proposal.invoiceNumbers.join(', ')})` : ''} – לאשר או לתקן בחלון המייל`
      : '';
    tasks.push({
      key: inboxKey(id),
      kind: 'inbox',
      ...(verify ? { suppressedBy: verifySenderKey(id), suppressedReason: 'ממתין לאימות השולח' } : {}),
      row: buildTaskRow({
        kind: 'inbox',
        id,
        taskType: TT_INBOX,
        title: `${proposal ? TITLE_PROMISE_APPROVAL : 'מייל לטיפול'} – ${sender(e)}: ${subjectOf(e)}`,
        reasons: [
          `מייל מ-${sender(e)}${who.customerCode ? ` (${who.customerName})` : ''} התקבל ${dateHe(received)}, ${catText}`,
          proposalText,
          late ? `עבר זמן המענה (${dateHe(new Date(dueMs).toISOString())})` : `לענות עד ${dateHe(new Date(dueMs).toISOString())}`,
          str(e.agentSummary).trim(),
        ]
          .filter(Boolean)
          .join('. '),
        recommendedAction: A_MAIL,
        severity: level(late),
        ...who,
        amount: null,
        invoiceNumbers: splitList(e.mentionedInvoiceNumbers),
        relatedTable: 'InboundEmails',
        relatedId: id,
        dueAt,
        asOfDate,
        nowIso,
        isTestFixture: fixtureRow,
      }),
    });
  }

  const approvalsById = new Map(data.approvals.map((a) => [str(a.id), a]));
  for (const a of data.approvals) {
    if (str(a.status).trim() !== APPROVAL_PENDING) continue;
    const id = str(a.id);
    const drafted = str(a.draftedAt) || str(a.createdAt);
    const draftedMs = sortableTime(drafted);
    const dueMs = draftedMs > 0 ? draftedMs + DRAFT_MAX_HOURS * 3_600_000 : 0;
    const late = dueMs > 0 && ctx.clockMs > dueMs;
    const who = customerOf(ctx, a.customerCode, { name: a.customerName });
    const kind = str(a.kind).trim() || 'טיוטה';
    const to = str(a.recipientName).trim();
    tasks.push({
      key: draftKey(id),
      kind: 'draft',
      row: buildTaskRow({
        kind: 'draft',
        id,
        taskType: TT_DRAFT,
        title: `טיוטה לאישור – ${kind}${to ? ` ל${to}` : ''}: ${str(a.subject).trim() || who.customerName || ''}`.replace(/: $/, ''),
        reasons: [
          `${str(a.draftedBy).trim() || 'הסוכן'} הכין/ה טיוטת ${kind}${to ? ` ל${to}` : ''}${drafted ? ` ב-${dateHe(drafted)}` : ''}${late ? `, ממתינה יותר מ-${DRAFT_MAX_HOURS} שעות` : ''}`,
          str(a.reason).trim(),
        ]
          .filter(Boolean)
          .join('. '),
        recommendedAction: A_DRAFT,
        severity: level(late),
        ...who,
        amount: null,
        invoiceNumbers: [],
        relatedTable: 'Approvals',
        relatedId: id,
        dueAt: dueMs > 0 ? new Date(dueMs).toISOString() : nextNoonIso(asOfDate),
        asOfDate,
        nowIso,
        isTestFixture: fixture(who.customerCode, a),
      }),
    });
  }

  const closeReason = (key: string) => {
    const p = parseTaskKey(key);
    if (!p) return 'הבעיה נפתרה';
    if (p.kind === 'draft') {
      const a = approvalsById.get(p.id);
      return a ? `הטיוטה טופלה (${str(a.status)})` : 'הטיוטה טופלה';
    }
    const e = emailsById.get(p.id);
    if (!e) return 'המייל טופל';
    if (irrelevant(e)) return 'המייל סומן כלא רלוונטי';
    if (p.kind === 'verify-sender') return str(e.senderVerification).trim() === 'מאומת' ? 'השולח אומת' : 'המייל אינו דורש אימות שולח';
    if (str(e.handlingState).trim() === HS_WAITING) return 'המייל הועבר להמתנה';
    return 'המייל טופל';
  };
  return { source: SRC_INBOX, tasks, closeReason };
}

// ---------- receipts ----------
const LINE_ISSUED = 'קבלה הונפקה';
const LINE_UNIDENTIFIED = 'לא מזוהה';
const CS_APPROVED = 'אושרה';
const CS_UNIDENTIFIED = 'לא מזוהה';
const BOUNCED = 'צ׳ק חוזר';
/** BankLines filters (current enum values only) for the lines that may carry a receipt task. */
export const RECEIPT_TASK_LINE_STATUSES = [LINE_UNIDENTIFIED];
export const RECEIPT_TASK_CHECK_STAGES = [CS_UNIDENTIFIED];
export const BOUNCED_LINE_TYPE = BOUNCED;

// ---------- returned cheques ----------
/** The digits after צ׳ק / שיק / המחאה (optionally "חוזר" / "מס׳" between), leading zeros kept; null when none. */
const CHEQUE_NO = /(?:צ[׳'’`]?ק|שיק|המחאה)(?:\s+(?:חוזר|חזר))?\s*(?:מס(?:פר|[׳'’.])?|no\.?|#)?\s*[:\-–]?\s*(\d+)/i;
export function chequeNumberIn(text: unknown): string | null {
  const m = CHEQUE_NO.exec(str(text).normalize('NFC'));
  return m ? m[1] : null;
}
/** A returned-cheque line's cheque number: from the reference, else from the raw line text. */
export const chequeNumberOf = (line: Item): string | null => chequeNumberIn(line.reference) ?? chequeNumberIn(line.rawText);

/**
 * The id of a returned-cheque task: cheque:<bankAccount>:<chequeNumber> (one task per cheque, however many lines or
 * uploads show it), else the bankLineId (no cheque number or no account on the line).
 */
export function bouncedTaskId(line: Item): string {
  const no = chequeNumberOf(line);
  const account = str(line.bankAccount).trim();
  return no && account ? `cheque:${account}:${no}` : str(line.bankLineId).trim();
}
export const bouncedTaskKey = (line: Item) => taskKeyOf('receipt-bounced', bouncedTaskId(line));
export const isChequeTaskId = (id: unknown) => str(id).startsWith('cheque:');

/** Earliest first: valueDate, then row id, then bankLineId (the line a cheque task points to). */
export const earliestLineFirst = (a: Item, b: Item) => {
  const da = toIsraelDate(a.valueDate) ?? '9999-12-31';
  const db = toIsraelDate(b.valueDate) ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  const ia = Number(a.id ?? Number.MAX_SAFE_INTEGER);
  const ib = Number(b.id ?? Number.MAX_SAFE_INTEGER);
  if (ia !== ib && Number.isFinite(ia) && Number.isFinite(ib)) return ia - ib;
  return str(a.bankLineId).localeCompare(str(b.bankLineId));
};

/**
 * The receipt task the scan manages for a bank line, or null: a returned cheque → receipt-bounced; an unknown payer with
 * no receipt (status / checkStage לא מזוהה) → receipt-customer. Everything after identification (identify, receipt,
 * debt check, allocation) has its own tasks written by the actions of that step, never by the scan.
 */
export function receiptKindOf(line: Item, receipt?: Item | null): TaskKind | null {
  const status = str(line.status).trim();
  const stage = str(line.checkStage).trim();
  if (status === LINE_ISSUED || stage === CS_APPROVED) return null;
  if (str(line.lineType).trim() === BOUNCED) return 'receipt-bounced';
  if (receipt) return null;
  if (status === LINE_UNIDENTIFIED || stage === CS_UNIDENTIFIED) return 'receipt-customer';
  return null;
}

const RECEIPT_LABEL: Record<string, string> = {
  'receipt-customer': 'לקוח לא זוהה',
  'receipt-bounced': 'צ׳ק חוזר',
};

export interface ReceiptTaskData {
  lines: Item[];
  /** the lines' Receipts rows (receiptKey RCPT-<bankLineId>): a line with a receipt has no receipt-customer task */
  receipts?: Item[];
}

/** receipts source: one task per unknown payer, one per returned cheque. */
export function receiptTasks(ctx: TaskContext, data: ReceiptTaskData): SourceTasks {
  const { asOfDate, nowIso } = ctx;
  const tasks: DesiredTask[] = [];
  const lineById = new Map<string, Item>();
  const receiptByLine = new Map<string, Item>();
  for (const r of data.receipts ?? []) {
    const id = str(r.bankLineId).trim() || str(r.receiptKey).replace(/^RCPT-/, '').trim();
    if (id && (!receiptByLine.has(id) || Number(r.id ?? 0) < Number(receiptByLine.get(id)!.id ?? 0))) receiptByLine.set(id, r);
  }
  // one entry per task: a line's own task, or one per returned cheque (all its lines, the earliest as relatedId)
  const entries: { line: Item; kind: TaskKind; id: string; group?: Item[] }[] = [];
  const cheques = new Map<string, Item[]>();
  const chequeAnchor = new Map<string, Item>();
  for (const line of data.lines) {
    const lineId = str(line.bankLineId).trim();
    if (!lineId) continue;
    lineById.set(lineId, line);
    const kind = receiptKindOf(line, receiptByLine.get(lineId) ?? null);
    if (!kind) continue;
    if (kind !== 'receipt-bounced') {
      entries.push({ line, kind, id: lineId });
      continue;
    }
    const tid = bouncedTaskId(line);
    if (!cheques.has(tid)) cheques.set(tid, []);
    if (!cheques.get(tid)!.some((l) => str(l.bankLineId).trim() === lineId)) cheques.get(tid)!.push(line);
  }
  for (const [tid, ls] of cheques) {
    const group = [...ls].sort(earliestLineFirst);
    chequeAnchor.set(tid, group[0]);
    entries.push({ line: group[0], kind: 'receipt-bounced', id: tid, group });
  }
  for (const { line, kind, id: taskId, group } of entries) {
    const id = str(line.bankLineId).trim();
    const receipt = receiptByLine.get(id) ?? null;
    const amount = round2(Math.abs(num(receipt?.amount ?? line.amount)));
    const vd = toIsraelDate(line.valueDate);
    const days = vd ? Math.max(0, diffDays(asOfDate, vd)) : 0;
    const who = customerOf(ctx, receipt?.customerCode || line.customerCode, { name: receipt?.customerName || line.customerName });
    const payer = str(line.payerName).replace(/\s+/g, ' ').trim() || 'מעביר לא ידוע';
    const ref = str(line.reference).trim();
    const party = who.customerCode ? who.customerName : payer;
    const base = `${str(line.lineType).trim() || 'העברה'} של ${ils(amount)}${vd ? ` מ-${formatDateHe(vd)}` : ''}${ref ? `, אסמכתא ${ref}` : ''}, המעביר '${payer}'`;
    let sev = computeSeverity({ amount, daysOverdue: days }, ctx.severity);
    let taskType = TT_RC_CUSTOMER;
    let title = '';
    let reasons = '';
    let action = A_RECEIPT;
    let dueAt = nextNoonIso(asOfDate);
    if (kind === 'receipt-bounced') {
      sev = { score: Math.max(sev.score, Math.round(ctx.severity.scoreCritical)), level: SEV_CRITICAL };
      taskType = TT_RC_BOUNCED;
      title = `צ׳ק חוזר – ${party}: ${ils(amount)}`;
      const seen = group && group.length > 1 ? ` מופיע ב-${group.length} שורות בנק (${group.map((l) => str(l.bankLineId).trim()).join(', ')}).` : '';
      reasons = `${ref ? (ref.includes('חזר') ? ref : `צ׳ק ${ref} חזר`) : 'צ׳ק חזר'}, ${ils(amount)}${vd ? ` (${formatDateHe(vd)})` : ''}${who.customerCode ? '' : ` – המעביר '${payer}' לא זוהה`}.${seen} זו לא קבלה – לברר עם הלקוח`;
      action = A_CALL;
      dueAt = israelLocalToUtcIso(asOfDate, 12, 0);
    } else {
      title = `תקבול לא זוהה – ${payer}: ${ils(amount)}`;
      reasons = `${base}: הלקוח לא זוהה – אין קבלה. לזהות את הלקוח (הכינוי יישמר לפעם הבאה), ואז הקבלה, בדיקת החוב והפיזור`;
    }
    const chequeNo = isChequeTaskId(taskId) ? taskId.slice(taskId.lastIndexOf(':') + 1) : null;
    const aliasKeys = chequeNo ? (group ?? [line]).map((l) => taskKeyOf('receipt-bounced', str(l.bankLineId).trim())) : undefined;
    tasks.push({
      key: taskKeyOf(kind, taskId),
      kind,
      ...(aliasKeys ? { aliasKeys, aliasReason: `כפילות: צ׳ק ${chequeNo} חוזר (${str(line.bankAccount).trim()})` } : {}),
      row: buildTaskRow({
        kind,
        id: taskId,
        taskType,
        title,
        reasons,
        recommendedAction: action,
        severity: sev,
        ...who,
        amount,
        invoiceNumbers: [],
        relatedTable: 'BankLines',
        relatedId: id,
        dueAt,
        asOfDate,
        nowIso,
        isTestFixture: false,
      }),
    });
  }
  const closeReason = (key: string) => {
    const p = parseTaskKey(key);
    const line = p ? (lineById.get(p.id) ?? chequeAnchor.get(p.id)) : undefined;
    if (!line) return 'התקבול נסגר';
    const now = receiptKindOf(line, receiptByLine.get(str(line.bankLineId).trim()) ?? null);
    return now ? `מצב התקבול השתנה: ${RECEIPT_LABEL[now]}` : 'התקבול נסגר';
  };
  return { source: SRC_RECEIPTS, tasks, closeReason };
}
