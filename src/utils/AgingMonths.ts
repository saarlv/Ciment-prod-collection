/**
 * The aging report built from the open movements (plan 04.11 r2, part A · Design 02 section 7): AgingByMonth rows
 * (customer × due month) become one row per customer with a short window of months, "חוב קודם" before it and
 * "חוב מאוחר" after it, so the row total is the account balance. CustomerNotes sit on customer + due month.
 * Everything here is pure — the page reads the entities and hands the rows in.
 */
import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import type {
  AgentSettingsEntity,
  CustomerContactsEntity,
  CustomerNotesEntity,
  CustomerNotesEntityNoteTypeEnum,
  CustomersEntity,
} from '@/product-types';
import type { AgingView, FilterKey } from '@/utils/AgingPanel';
import type { AgingCellKey, AgingContact, AgingCustomer } from '@/utils/CollectionsTypes';
import { addDays, addMonths, formatDayMonth, formatMonth, formatTime, round2 } from '@/utils/Format';
import { NOT_CONNECTED_REASON, NOT_CONNECTED_TEXT } from '@/utils/ReceiptsDay';

export type CustomerRow = EntityType<typeof CustomersEntity>;
export type ContactRow = EntityType<typeof CustomerContactsEntity>;
export type CustomerNote = EntityType<typeof CustomerNotesEntity>;
export type SettingRow = EntityType<typeof AgentSettingsEntity>;
export type NoteType = CustomerNotesEntityNoteTypeEnum;

/* ------------------------------------------------------------------------------------------------ */
/* AgingByMonth rows                                                                                  */
/* ------------------------------------------------------------------------------------------------ */

export interface MonthRow {
  customerCode: string;
  customerName: string;
  /** YYYY-MM; empty when the movement has no due date (counted in חוב קודם). */
  dueMonth: string;
  openTotal: number;
  movementCount: number;
  syncedAt: string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The view's rows, read defensively (the generated type of a view carries no columns). */
export function toMonthRows(rows: readonly unknown[] | undefined): MonthRow[] {
  return (rows ?? []).flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    const customerCode = text(o.customerCode);
    if (!customerCode) return [];
    return [
      {
        customerCode,
        customerName: text(o.customerName),
        dueMonth: text(o.dueMonth).slice(0, 7),
        openTotal: round2(num(o.openTotal)),
        movementCount: num(o.movementCount),
        syncedAt: text(o.syncedAt) || null,
      },
    ];
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* The window and its buckets                                                                         */
/* ------------------------------------------------------------------------------------------------ */

export const DEFAULT_MONTHS_BACK = 3;

/** The window's month keys: `back` months before the current month up to `forward` months after it. */
export function windowKeys(today: string, back: number, forward: number): string[] {
  const current = today.slice(0, 7);
  const keys: string[] = [];
  for (let i = -back; i <= forward; i++) keys.push(addMonths(current, i));
  return keys;
}

/** Which bucket a due month falls in: 'prior' before the window (and no due month), 'later' after it, else the month. */
function bucketOfMonth(month: string, keys: string[]): AgingCellKey {
  if (!month || month < keys[0]) return 'prior';
  if (month > keys[keys.length - 1]) return 'later';
  return month;
}

/** The due months of one customer that fall in a bucket, oldest first ('' = no due month). */
export function monthsInBucket(balances: Map<string, number> | undefined, key: AgingCellKey, keys: string[]): string[] {
  if (key !== 'prior' && key !== 'later') return [key];
  return [...(balances?.keys() ?? [])].filter((m) => bucketOfMonth(m, keys) === key).sort();
}

/* ------------------------------------------------------------------------------------------------ */
/* Customers                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

const AP_ROLE = 'הנהלת חשבונות';

/** The customer's accounts-payable contact: the AP flag, then the הנהלת חשבונות role, then the first contact, then the card. */
function contactOf(customer: CustomerRow | undefined, contacts: ContactRow[]): AgingContact | null {
  const pick = contacts.find((c) => c.isApContact) ?? contacts.find((c) => (c.roleFlags ?? '').includes(AP_ROLE)) ?? contacts[0];
  if (pick) return { name: pick.contactName ?? null, phone: pick.phone ?? null, email: pick.email ?? null, role: pick.roleFlags ?? null };
  if (customer?.apContactName || customer?.apContactPhone || customer?.apContactEmail) {
    return { name: customer.apContactName ?? null, phone: customer.apContactPhone ?? null, email: customer.apContactEmail ?? null, role: AP_ROLE };
  }
  return null;
}

export interface AgingData {
  customers: AgingCustomer[];
  /** customerCode → due month → open balance, every month of the customer (inside and outside the window). */
  balances: Map<string, Map<string, number>>;
  /** customerCode → the Customers row id (the CustomerNotes reference). */
  customerIds: Map<string, string>;
}

/**
 * One AgingCustomer per customer with open movements: the window months, חוב קודם and חוב מאוחר, the total
 * (= the sum of all the customer's open movements) and the check against Customers.ledgerBalance.
 */
export function buildAging(rows: MonthRow[], customers: CustomerRow[], contacts: ContactRow[], keys: string[]): AgingData {
  const byCode = new Map(customers.filter((c) => !!c.customerCode).map((c) => [c.customerCode as string, c]));
  const contactsBy = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    if (!c.customerCode) continue;
    contactsBy.set(c.customerCode, [...(contactsBy.get(c.customerCode) ?? []), c]);
  }
  const balances = new Map<string, Map<string, number>>();
  const names = new Map<string, string>();
  for (const r of rows) {
    const months = balances.get(r.customerCode) ?? new Map<string, number>();
    months.set(r.dueMonth, round2((months.get(r.dueMonth) ?? 0) + r.openTotal));
    balances.set(r.customerCode, months);
    if (r.customerName && !names.has(r.customerCode)) names.set(r.customerCode, r.customerName);
  }

  const out: AgingCustomer[] = [];
  for (const [code, months] of balances) {
    if (![...months.values()].some((v) => v !== 0)) continue;
    let prior = 0;
    let later = 0;
    const inWindow = new Map<string, number>();
    for (const [m, v] of months) {
      const b = bucketOfMonth(m, keys);
      if (b === 'prior') prior += v;
      else if (b === 'later') later += v;
      else inWindow.set(m, (inWindow.get(m) ?? 0) + v);
    }
    const total = round2([...months.values()].reduce((s, v) => s + v, 0));
    const c = byCode.get(code);
    const ledger = typeof c?.ledgerBalance === 'number' && Number.isFinite(c.ledgerBalance) ? c.ledgerBalance : undefined;
    const diff = ledger === undefined ? undefined : round2(ledger - total);
    out.push({
      customerCode: code,
      customerName: c?.customerName || names.get(code) || code,
      priorityStatus: c?.priorityStatus ?? null,
      collectionNote: c?.collectionNote ?? null,
      paymentMethod: c?.paymentMethod ?? null,
      paymentTermsLabel: c?.paymentTermsLabel ?? null,
      salesAgentName: c?.salesAgentName,
      bookkeeperName: c?.assignedBookkeeperName,
      contact: contactOf(c, contactsBy.get(code) ?? []),
      priorDebt: { amount: round2(prior) },
      months: keys.map((k) => ({ monthKey: k, label: formatMonth(k), amount: round2(inWindow.get(k) ?? 0) })),
      laterDebt: { amount: round2(later) },
      total,
      ledgerBalance: ledger,
      balanceDiff: diff,
      balanceMatches: diff === undefined ? undefined : Math.abs(diff) < 0.01,
      creditBalance: total < 0,
    });
  }
  const customerIds = new Map(customers.filter((c) => !!c.customerCode).map((c) => [c.customerCode as string, c.id]));
  return { customers: out, balances, customerIds };
}

/* ------------------------------------------------------------------------------------------------ */
/* Notes                                                                                              */
/* ------------------------------------------------------------------------------------------------ */

export const PROMISE: NoteType = 'התחייבות לתשלום';
export const OTHER: NoteType = 'אחר';
/** The four types that open a task (date required); אחר is free. */
const ACTIVE_TYPES: NoteType[] = ['התחייבות לתשלום', 'תשלום באשראי', 'צ׳ק אצל סוכן', 'חזור אליי'];
export const NOTE_TYPES: NoteType[] = [...ACTIVE_TYPES, OTHER];

export const ACTIVE_STATUS = 'פעילה';
export const CLOSED_MANUALLY = 'נסגרה ידנית';

export const isActiveType = (t?: string | null): boolean => !!t && (ACTIVE_TYPES as string[]).includes(t);
export const isActiveNote = (n: CustomerNote): boolean => n.status === ACTIVE_STATUS;

/** An active note whose date arrived: an active type's actionDate, or any reminderDate, on or before today. */
export function isNoteDue(n: CustomerNote, today: string): boolean {
  if (!isActiveNote(n)) return false;
  if (isActiveType(n.noteType) && !!n.actionDate && n.actionDate.slice(0, 10) <= today) return true;
  return !!n.reminderDate && n.reminderDate.slice(0, 10) <= today;
}

/** The note's type as shown: the free label for אחר. */
export function noteTypeLabel(n: Pick<CustomerNote, 'noteType' | 'customTypeLabel'>): string {
  if (n.noteType === OTHER) return n.customTypeLabel?.trim() || OTHER;
  return n.noteType ?? 'הערה';
}

/** customerCode → that customer's notes, newest first. */
export function indexNotes(notes: CustomerNote[]): Map<string, CustomerNote[]> {
  const out = new Map<string, CustomerNote[]>();
  const sorted = [...notes].sort((a, b) => (b.noteCreatedAt ?? b.createdAt ?? '').localeCompare(a.noteCreatedAt ?? a.createdAt ?? ''));
  for (const n of sorted) {
    if (!n.customerCode || n.isTestFixture) continue;
    out.set(n.customerCode, [...(out.get(n.customerCode) ?? []), n]);
  }
  return out;
}

/** The notes of one bucket (a window month, or every month of חוב קודם / חוב מאוחר). */
export function notesInBucket(notes: CustomerNote[] | undefined, key: AgingCellKey, keys: string[]): CustomerNote[] {
  return (notes ?? []).filter((n) => bucketOfMonth((n.dueMonth ?? '').slice(0, 7), keys) === key);
}

/** What a cell's chip shows: the active notes and whether one of them is due. */
export function chipFacts(notes: CustomerNote[], today: string): { count: number; due: boolean } {
  const active = notes.filter(isActiveNote);
  return { count: active.length, due: active.some((n) => isNoteDue(n, today)) };
}

/** The free type labels already written, most used first — the suggestions under "אחר". */
export function customLabels(notes: CustomerNote[]): string[] {
  const counts = new Map<string, number>();
  for (const n of notes) {
    const l = n.noteType === OTHER ? n.customTypeLabel?.trim() : '';
    if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he')).map(([l]) => l);
}

/** "נכנסו 15,000 ₪, נשארו 5,000 ₪" for a checked commitment, else null. */
export function commitmentProgress(n: Pick<CustomerNote, 'noteType' | 'amountReceived' | 'amountRemaining'>, ils: (v?: number | null) => string): string | null {
  if (n.noteType !== PROMISE) return null;
  const parts: string[] = [];
  if (typeof n.amountReceived === 'number') parts.push(`נכנסו ${ils(n.amountReceived)}`);
  if (typeof n.amountRemaining === 'number') parts.push(`נשארו ${ils(n.amountRemaining)}`);
  return parts.length ? parts.join(', ') : null;
}

/* ------------------------------------------------------------------------------------------------ */
/* The filters, sort and summary                                                                      */
/* ------------------------------------------------------------------------------------------------ */

export interface CustomerFlags {
  hasNotes: boolean;
  /** Past months (before the current month) with a balance and no active note. */
  overdueUnnoted: number;
  overdueAmount: number;
  openCommitments: number;
  brokenCommitments: number;
  dueNotes: number;
}

export function customerFlags(balances: Map<string, number> | undefined, notes: CustomerNote[] | undefined, today: string): CustomerFlags {
  const current = today.slice(0, 7);
  const active = (notes ?? []).filter(isActiveNote);
  const noted = new Set(active.map((n) => (n.dueMonth ?? '').slice(0, 7)));
  let overdueUnnoted = 0;
  let overdueAmount = 0;
  for (const [m, v] of balances ?? []) {
    if (v > 0 && (!m || m < current)) {
      overdueAmount += v;
      if (!noted.has(m)) overdueUnnoted += 1;
    }
  }
  const promises = active.filter((n) => n.noteType === PROMISE);
  return {
    hasNotes: active.length > 0,
    overdueUnnoted,
    overdueAmount: round2(overdueAmount),
    openCommitments: promises.filter((n) => !n.outcome || n.outcome === 'פתוחה').length,
    brokenCommitments: promises.filter((n) => n.outcome === 'לא קוימה' || n.outcome === 'קוימה חלקית').length,
    dueNotes: active.filter((n) => isNoteDue(n, today)).length,
  };
}

function matches(f: FilterKey, flags: CustomerFlags): boolean {
  switch (f) {
    case 'withNotes':
      return flags.hasNotes;
    case 'unnotedPast':
      return flags.overdueUnnoted > 0;
    case 'openPromises':
      return flags.openCommitments > 0;
    case 'broken':
      return flags.brokenCommitments > 0;
  }
}

export interface ViewContext {
  balances: Map<string, Map<string, number>>;
  notes: Map<string, CustomerNote[]>;
  today: string;
}

/** The rows shown: picked customers, the search, the filters (any of them) and the sort. */
export function applyMonthView(customers: AgingCustomer[], ctx: ViewContext, view: AgingView, search: string): AgingCustomer[] {
  const picked = new Set(view.customers);
  const q = search.trim().toLowerCase();
  const rows = customers
    .filter((c) => picked.size === 0 || picked.has(c.customerCode ?? ''))
    .filter((c) => !q || `${c.customerName ?? ''} ${c.customerCode ?? ''} ${c.contact?.name ?? ''}`.toLowerCase().includes(q))
    .map((c) => ({ c, flags: customerFlags(ctx.balances.get(c.customerCode ?? ''), ctx.notes.get(c.customerCode ?? ''), ctx.today) }))
    .filter(({ flags }) => view.filters.length === 0 || view.filters.some((f) => matches(f, flags)));
  const key = (r: { c: AgingCustomer; flags: CustomerFlags }) =>
    view.sort === 'prior' ? (r.c.priorDebt?.amount ?? 0) : view.sort === 'overdue' ? r.flags.overdueAmount : (r.c.total ?? 0);
  rows.sort((a, b) => (view.sort === 'name' ? (a.c.customerName ?? '').localeCompare(b.c.customerName ?? '', 'he') : key(b) - key(a)));
  return rows.map((r) => r.c);
}

export interface ReportFacts {
  overdueUnnoted: number;
  brokenCommitments: number;
  dueNotes: number;
}

export function reportFacts(customers: AgingCustomer[], ctx: ViewContext): ReportFacts {
  const out: ReportFacts = { overdueUnnoted: 0, brokenCommitments: 0, dueNotes: 0 };
  for (const c of customers) {
    const f = customerFlags(ctx.balances.get(c.customerCode ?? ''), ctx.notes.get(c.customerCode ?? ''), ctx.today);
    out.overdueUnnoted += f.overdueUnnoted;
    out.brokenCommitments += f.brokenCommitments;
    out.dueNotes += f.dueNotes;
  }
  return out;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** What needs attention, most actionable first; zeros are left out. */
export function reportSentences(f: ReportFacts): string[] {
  const parts: string[] = [];
  if (f.overdueUnnoted > 0) parts.push(`${plural(f.overdueUnnoted, 'חודש אחד', 'חודשים')} בפיגור עדיין בלי הערה`);
  if (f.brokenCommitments > 0) parts.push(plural(f.brokenCommitments, 'התחייבות אחת לא קוימה במלואה', 'התחייבויות לא קוימו במלואן'));
  if (f.dueNotes > 0) parts.push(`${plural(f.dueNotes, 'הערה אחת הגיעה', 'הערות הגיעו')} למועד`);
  return parts;
}

/* ------------------------------------------------------------------------------------------------ */
/* Settings: note type → task → when                                                                  */
/* ------------------------------------------------------------------------------------------------ */

export type SettingsMap = Map<string, string>;

export function settingsMap(rows: SettingRow[] | undefined): SettingsMap {
  const out: SettingsMap = new Map();
  for (const r of rows ?? []) if (r.settingKey && !r.isTestFixture) out.set(r.settingKey, (r.value ?? '').trim());
  return out;
}

export function settingNumber(settings: SettingsMap, key: string, fallback: number): number {
  const raw = settings.get(key);
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export type NoteTaskKey = 'promise' | 'creditCard' | 'agentCheque' | 'callBack' | 'reminder';

interface TaskDefault {
  name: string;
  taskType: string;
  /** a number of days, or the key of a number setting */
  offset: number | string;
  fallbackDays: number;
}

/** The plan's defaults (code-actions/shared/plan-settings.ts), used until the noteTask.* rows exist. */
const TASK_DEFAULTS: Record<NoteTaskKey, TaskDefault> = {
  promise: { name: 'התחייבות לתשלום', taskType: 'התחייבויות שלא קוימו', offset: 1, fallbackDays: 1 },
  creditCard: { name: 'תשלום באשראי', taskType: 'להתקשר לפרטי אשראי', offset: 0, fallbackDays: 0 },
  agentCheque: { name: 'צ׳ק אצל סוכן', taskType: 'צ׳ק אצל סוכן – אין קבלה', offset: 'agentChequeDays', fallbackDays: 2 },
  callBack: { name: 'חזור אליי', taskType: 'לחזור ללקוח', offset: 0, fallbackDays: 0 },
  reminder: { name: 'תאריך תזכורת (כל סוג)', taskType: 'תזכורות', offset: 0, fallbackDays: 0 },
};
export const NOTE_TASK_KEYS: NoteTaskKey[] = ['promise', 'creditCard', 'agentCheque', 'callBack', 'reminder'];

const TYPE_TASK: Partial<Record<NoteType, NoteTaskKey>> = {
  'התחייבות לתשלום': 'promise',
  'תשלום באשראי': 'creditCard',
  'צ׳ק אצל סוכן': 'agentCheque',
  'חזור אליי': 'callBack',
};

export const noteTaskSetting = (k: NoteTaskKey, field: 'taskType' | 'offsetDays' | 'runAt') => `noteTask.${k}.${field}`;

/** Days after the date: noteTask.<k>.offsetDays as a number, or as the key of a number setting; else the plan default. */
export function taskOffset(k: NoteTaskKey, settings: SettingsMap): number {
  const d = TASK_DEFAULTS[k];
  const raw = settings.get(noteTaskSetting(k, 'offsetDays')) || (typeof d.offset === 'string' ? d.offset : String(d.offset));
  const direct = Number(raw);
  if (raw !== '' && Number.isFinite(direct)) return direct;
  return settingNumber(settings, raw, d.fallbackDays);
}

export function taskTypeOf(k: NoteTaskKey, settings: SettingsMap): string {
  return settings.get(noteTaskSetting(k, 'taskType')) || TASK_DEFAULTS[k].taskType;
}

export function taskName(k: NoteTaskKey): string {
  return TASK_DEFAULTS[k].name;
}

export interface TaskPreview {
  taskType: string;
  date: string;
}

/** The grouped tasks a note will open if its month does not reach zero, with their dates. */
export function taskPreviews(type: NoteType | '', actionDate: string, reminderDate: string, settings: SettingsMap): TaskPreview[] {
  const out: TaskPreview[] = [];
  const k = type ? TYPE_TASK[type] : undefined;
  if (k && actionDate) out.push({ taskType: taskTypeOf(k, settings), date: addDays(actionDate, taskOffset(k, settings)) });
  if (reminderDate) out.push({ taskType: taskTypeOf('reminder', settings), date: addDays(reminderDate, taskOffset('reminder', settings)) });
  return out;
}

/** "תיפתח משימה "לחזור ללקוח" ב-12.11 אם החודש לא יתאפס" */
export function taskPreviewLine(p: TaskPreview): string {
  return `תיפתח משימה ״${p.taskType}״ ב-${formatDayMonth(p.date)} אם החודש לא יתאפס`;
}

/** "ביום עצמו" / "יום אחרי התאריך" / "2 ימים אחרי התאריך" (reminder: of the reminder date). */
export function offsetLabel(k: NoteTaskKey, days: number): string {
  const of = k === 'reminder' ? 'תאריך התזכורת' : 'התאריך';
  if (days === 0) return k === 'reminder' ? 'בתאריך התזכורת' : 'ביום עצמו';
  if (days === 1) return `יום אחרי ${of}`;
  return `${days} ימים אחרי ${of}`;
}

/* ------------------------------------------------------------------------------------------------ */
/* The work-day hours                                                                                 */
/* ------------------------------------------------------------------------------------------------ */

export interface DayHour {
  settingKey: string;
  label: string;
  defaultValue: string;
  description: string;
}

/** The three hours of the work day (labels and defaults from the plan's settings list). */
export const DAY_HOURS: DayHour[] = [
  {
    settingKey: 'morningPullAt',
    label: 'משיכת בוקר מפריוריטי',
    defaultValue: '06:00',
    description: 'מושכים מפריוריטי לקוחות, תנועות פתוחות והזמנות פתוחות, ואחר כך בונים את המשימות.',
  },
  {
    settingKey: 'bankCheckAt',
    label: 'בדיקת דף הבנק',
    defaultValue: '09:00',
    description: 'בודקים אם דף הבנק עלה לפריוריטי; אם כן רצים התקבולים, משיכה חוזרת של התנועות ומשימות ההתחייבות.',
  },
  {
    settingKey: 'bankRecheckAt',
    label: 'בדיקה חוזרת של דף הבנק',
    defaultValue: '10:00',
    description: 'אם דף הבנק לא עלה בבדיקה הראשונה בודקים שוב; אם עדיין לא עלה נפתחת משימה דחופה ומשימות ההתחייבות לא נוצרות באותו יום.',
  },
];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "6:30" → "06:30"; anything that is not a clock time → null. */
export function normalizeHour(v: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`;
  return HHMM.test(hhmm) ? hhmm : null;
}

/** The round hour the hourly run picks it up at: 09:30 → 10:00, 09:00 → 09:00. */
export function runHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = m > 0 ? h + 1 : h;
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Whether the hourly run (every round hour 06:00–12:00) reaches this time at all. */
export function inRunWindow(hhmm: string): boolean {
  const r = runHour(hhmm);
  return r >= '06:00' && r <= '12:00';
}

/* ------------------------------------------------------------------------------------------------ */
/* The pull button's result                                                                          */
/* ------------------------------------------------------------------------------------------------ */

export interface PullStep {
  step: string;
  ok: boolean;
  rowsRead: number;
  rowsWritten: number;
  note: string;
  error: string;
}

const STEP_LABEL: Record<string, string> = {
  PullPriorityCustomers: 'משיכת הלקוחות',
  PullOpenMovements: 'משיכת התנועות הפתוחות',
  PullOpenOrders: 'משיכת ההזמנות הפתוחות',
  CloseSettledNotes: 'סגירת הערות של חודשים שהתאפסו',
  CheckCommitments: 'בדיקת ההתחייבויות',
  RefreshInvoiceLayer: 'עדכון החשבוניות',
  BuildTasks: 'סריקת המשימות',
};

function toStep(s: unknown): PullStep | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  return { step: text(o.step), ok: o.ok === true, rowsRead: num(o.rowsRead), rowsWritten: num(o.rowsWritten), note: text(o.note), error: text(o.error) };
}

/** One line for the screen from RunDaySchedule's output. */
export function pullResultLine(out: unknown): { ok: boolean; notice?: boolean; text: string } {
  const o = (out && typeof out === 'object' ? out : {}) as Record<string, unknown>;
  const ran = Array.isArray(o.ran) ? (o.ran as Record<string, unknown>[]) : [];
  const steps = ran.flatMap((r) => (Array.isArray(r?.steps) ? r.steps : [])).map(toStep).filter((s): s is PullStep => !!s);
  const errors = Array.isArray(o.errors) ? o.errors.map(String).filter(Boolean) : [];
  const failedTask = (o.failedTask && typeof o.failedTask === 'object' ? o.failedTask : {}) as Record<string, unknown>;
  const pulledAt = text(o.pulledAt);
  const ok = o.ok !== false && ran.length > 0 && ran.every((r) => r?.ok === true);

  if (ok) {
    const read = (name: string) => steps.find((s) => s.step === name)?.rowsRead;
    const parts: string[] = [];
    const customers = read('PullPriorityCustomers');
    const movements = read('PullOpenMovements');
    if (customers !== undefined) parts.push(`${customers.toLocaleString('he-IL')} לקוחות`);
    if (movements !== undefined) parts.push(`${movements.toLocaleString('he-IL')} תנועות פתוחות`);
    const tasks = steps.find((s) => s.step === 'BuildTasks');
    const tail = tasks ? ` · ${tasks.note || 'המשימות נסרקו'}` : '';
    return { ok: true, text: `נמשך מפריוריטי ב-${pulledAt ? formatTime(pulledAt) : 'עכשיו'}${parts.length ? `: ${parts.join(' ו-')}` : ''}${tail}.` };
  }
  const notConnected = errors.some((e) => e.includes(NOT_CONNECTED_REASON)) || steps.some((s) => !s.ok && (s.error ?? '').includes(NOT_CONNECTED_REASON));
  if (notConnected) return { ok: true, notice: true, text: `${NOT_CONNECTED_TEXT}, ולכן לא נמשכו נתונים. שום דבר לא נמחק.` };
  const failed = steps.find((s) => !s.ok);
  const reason = failed ? `${STEP_LABEL[failed.step] ?? failed.step} נכשלה${failed.error ? `: ${failed.error}` : ''}` : errors[0] || 'שלב הבוקר לא רץ';
  const task = failedTask.action === 'open' ? ' נפתחה משימה ״משיכת הבוקר נכשלה״, ושום דבר לא נמחק.' : ' שום דבר לא נמחק.';
  return { ok: false, text: `המשיכה לא הושלמה – ${reason}.${task}` };
}