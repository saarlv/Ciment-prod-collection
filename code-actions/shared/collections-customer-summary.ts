// The daily customer summaries (CustomerSummaryRun): facts per customer, the line Iris reads, the action rules she
// follows ("איך בוחרים צעד") and the code fallback summary. Pure functions: PrepareCustomerSummaries reads the rows
// and calls computeCustomerFact / buildSummaryPrompt; WriteCustomerSummaries parses Iris's answer and falls back to
// fallbackSummary / chooseAction for every customer she missed.
import type { Item } from './blocks/blocks-client.ts';
import { diffDays, formatDayMonth, sortableTime, toIsraelDate } from './collections-dates.ts';
import { formatIls, isFixtureCustomer, num, round2, str } from './collections-data.ts';
import { isDebtRow, naturalCompare } from './collections-aging.ts';
import { effectiveOpen } from './collections-invoice-layer.ts';
import { computeSeverity, DEFAULT_SEVERITY_CONFIG, SEV_LOW, type SeverityConfig } from './collections-severity.ts';
import { pendingPromiseOf, TITLE_PROMISE_APPROVAL } from './collections-inbox.ts';
import { isActiveNote, isCommitment, noteTypeLabel, OUT_NOT_KEPT, OUT_OPEN, OUT_PARTLY, promisedOf } from './collections-notes.ts';

export const TASK_PREFIX = 'משימה: סיכום יומי ללקוחות';
/** Customers sent to Iris in one message; the rest (smallest overdue first to drop) get the code summary. */
export const MAX_AGENT_CUSTOMERS = 120;
export const MAX_PROMPT_TASKS = 3;
export const MAX_BASIS_TASKS = 10;

export const OPEN_TASK_STATUSES = ['ממתין', 'בטיפול'];
export const DISPUTE_CLOSED_STATUS = 'נסגרה';
const RECEIPT_TASK_SOURCE = 'תקבולים';
const DISPUTE_TASK_PREFIX = 'מעקב בירור';
const CONTACT_CHANNELS = ['דואל', 'WhatsApp', 'שיחה', 'ישיבה'];
const INTERNAL_DIRECTION = 'פנימי';

export const A_CALL = 'להתקשר';
export const A_REMIND = 'לשלוח תזכורת';
export const A_DISPUTE = 'לבדוק בירור';
export const A_APPROVE = 'לאשר הבטחה';
export const A_RECEIPT = 'לטפל בתקבול';
export const A_WAIT = 'לחכות למועד';
export const A_NONE = 'אין צורך בפעולה';
export const ACTION_TYPES = [A_CALL, A_REMIND, A_DISPUTE, A_APPROVE, A_RECEIPT, A_WAIT, A_NONE];

export const BY_AGENT = 'סוכן';
export const BY_FALLBACK = 'קוד (גיבוי)';

/** CustomerDailySummaries.basis: what the summary was written from (shown on the card as evidence). */
export interface SummaryBasis {
  openBalance: number;
  overdueAmount: number;
  oldestOverdueDays: number;
  /** "20,000 ₪ עד 05.11"; null when there is no open promise */
  openPromise: string | null;
  brokenPromises: number;
  openDisputes: number;
  openTasks: string[];
  /** "08.10 התחייבות לתשלום"; null when the customer has no note */
  latestNote: string | null;
  /** active CustomerNotes of the customer (plan 04.11 stage 2) */
  activeNotes?: number;
  /** "08.10 שיחה"; null when no contact is recorded */
  lastContact: string | null;
}

/** Extra facts the line and the action rules need (not stored in basis). */
export interface SummarySignals {
  /** "15.10, 20,000 ₪, נכנסו …" per commitment not kept (לא קוימה / קוימה חלקית), newest first */
  brokenDetails: string[];
  openPromiseDate: string | null;
  pendingPromiseProposals: number;
  receiptTasks: number;
  disputeDue: boolean;
  /** overdue severity above נמוכה (same weights as the task severity) */
  overdueLarge: boolean;
}

export interface CustomerFact {
  customerCode: string;
  customerName: string;
  isTestFixture: boolean;
  basis: SummaryBasis;
  signals: SummarySignals;
  /** false when the customer was left out of Iris's message (over MAX_AGENT_CUSTOMERS) */
  inPrompt?: boolean;
}

export interface CustomerRows {
  customerCode: string;
  customer?: Item;
  invoices: Item[];
  tasks: Item[];
  disputes: Item[];
  interactions: Item[];
  emails: Item[];
  /** the customer's CustomerNotes: commitments with their outcome, and every other note */
  customerNotes: Item[];
}

const ils = (n: number) => `${formatIls(n)} ₪`;
const dm = (d: string | null) => (d ? formatDayMonth(d) : '');

/** One customer's facts as of asOfDate, from that customer's rows only. */
export function computeCustomerFact(asOfDate: string, rows: CustomerRows, severity: SeverityConfig = DEFAULT_SEVERITY_CONFIG): CustomerFact {
  const code = rows.customerCode;
  const onOrBefore = (d: string | null) => !!d && d <= asOfDate;

  // balance and overdue: open amounts net of payments the app already saw (the invoice layer, as in the aging report)
  const debt = rows.invoices.filter(isDebtRow);
  const openBalance = round2(debt.reduce((s, i) => s + effectiveOpen(i), 0));
  let overdueAmount = 0;
  let oldestOverdueDays = 0;
  for (const inv of debt) {
    const open = effectiveOpen(inv);
    const due = toIsraelDate(inv.dueDate);
    if (open <= 0.005 || !due || due >= asOfDate) continue;
    overdueAmount += open;
    oldestOverdueDays = Math.max(oldestOverdueDays, diffDays(asOfDate, due));
  }
  overdueAmount = round2(overdueAmount);

  // CustomerNotes: active commitments – open ones (outcome פתוחה) and the ones not kept / partly kept
  const cNotes = rows.customerNotes ?? [];
  const activeCommitments = cNotes.filter((n) => isActiveNote(n) && isCommitment(n) && onOrBefore(toIsraelDate(n.noteCreatedAt) ?? toIsraelDate(n.createdAt) ?? asOfDate));
  const openCommitments = activeCommitments
    .filter((n) => (str(n.outcome).trim() || OUT_OPEN) === OUT_OPEN)
    .sort((a, b) => str(toIsraelDate(a.actionDate)).localeCompare(str(toIsraelDate(b.actionDate))));
  const notKept = activeCommitments
    .filter((n) => [OUT_NOT_KEPT, OUT_PARTLY].includes(str(n.outcome).trim()))
    .sort((a, b) => str(toIsraelDate(b.actionDate)).localeCompare(str(toIsraelDate(a.actionDate))));
  const commitmentText = (n: Item) => {
    const d = toIsraelDate(n.actionDate);
    return `${ils(promisedOf(n))}${d ? ` עד ${dm(d)}` : ''} (חודש ${str(n.dueMonth)})`;
  };
  const notKeptDetails = notKept.map((n) => {
    const d = toIsraelDate(n.actionDate);
    const head = [dm(d), ils(promisedOf(n))].filter(Boolean).join(', ');
    return str(n.outcome).trim() === OUT_PARTLY
      ? `${head}, קוימה חלקית: נכנסו ${ils(num(n.amountReceived))}, נשארו ${ils(num(n.amountRemaining))}`
      : `${head}, נכנסו ${ils(num(n.amountReceived))}`;
  });

  // disputes: open Disputes rows plus the open dispute ids on the customer's invoices (the invoice layer)
  const disputeIds = new Set<string>();
  for (const d of rows.disputes) if (str(d.status) !== DISPUTE_CLOSED_STATUS) disputeIds.add(`d:${str(d.id)}`);
  for (const inv of debt) {
    const id = str(inv.openDisputeId).trim();
    if (id && !rows.disputes.some((d) => str(d.id) === id)) disputeIds.add(`n:${id}`);
  }

  // open tasks (CollectionQueue ממתין / בטיפול, receipt tasks included) and Maya's pending promise proposals
  const tasks = rows.tasks
    .filter((t) => OPEN_TASK_STATUSES.includes(str(t.status)))
    .sort((a, b) => num(b.priorityScore) - num(a.priorityScore) || sortableTime(a.openedAt) - sortableTime(b.openedAt));
  const pending = rows.emails.filter((e) => !!pendingPromiseOf(e));
  const titles: string[] = [];
  const addTitle = (t: string) => {
    const s = t.trim();
    if (s && !titles.includes(s)) titles.push(s);
  };
  if (pending.length) addTitle(TITLE_PROMISE_APPROVAL);
  for (const t of tasks) addTitle(str(t.title) || str(t.taskType) || str(t.reasons));
  const receiptTasks = tasks.filter((t) => str(t.source) === RECEIPT_TASK_SOURCE).length;
  const disputeDue = tasks.some((t) => {
    if (!str(t.taskType).startsWith(DISPUTE_TASK_PREFIX)) return false;
    const due = toIsraelDate(t.dueAt);
    return !due || due <= asOfDate;
  });

  // latest note: the newest CustomerNotes row
  const latestNew = cNotes
    .filter((n) => onOrBefore(toIsraelDate(n.noteCreatedAt)))
    .sort((a, b) => sortableTime(b.noteCreatedAt) - sortableTime(a.noteCreatedAt) || Number(b.id ?? 0) - Number(a.id ?? 0))[0];
  const latestNote = latestNew ? `${dm(toIsraelDate(latestNew.noteCreatedAt))} ${noteTypeLabel(latestNew)}`.trim() : null;
  const activeNotes = cNotes.filter(isActiveNote).length;

  // last contact: calls / emails / WhatsApp in Interactions, inbound mail
  const contacts: { at: number; date: string; channel: string }[] = [];
  const addContact = (v: unknown, channel: string) => {
    const date = toIsraelDate(v);
    if (date && date <= asOfDate && channel) contacts.push({ at: sortableTime(v), date, channel });
  };
  for (const x of rows.interactions) {
    if (CONTACT_CHANNELS.includes(str(x.type)) && str(x.direction) !== INTERNAL_DIRECTION) addContact(x.occurredAt, str(x.type));
  }
  for (const e of rows.emails) addContact(e.receivedAt, 'דואל');
  contacts.sort((a, b) => b.at - a.at);
  const lastContact = contacts[0] ? `${dm(contacts[0].date)} ${contacts[0].channel}` : null;

  const sev = computeSeverity({ amount: overdueAmount, daysOverdue: oldestOverdueDays }, severity);
  const customerName = str(rows.customer?.customerName) || str(rows.invoices.find((i) => str(i.customerName))?.customerName) || code;

  return {
    customerCode: code,
    customerName,
    isTestFixture: isFixtureCustomer(rows.customer, code),
    basis: {
      openBalance,
      overdueAmount,
      oldestOverdueDays,
      openPromise: openCommitments[0] ? commitmentText(openCommitments[0]) : null,
      brokenPromises: notKept.length,
      openDisputes: disputeIds.size,
      openTasks: titles.slice(0, MAX_BASIS_TASKS),
      latestNote,
      activeNotes,
      lastContact,
    },
    signals: {
      brokenDetails: notKeptDetails,
      openPromiseDate: openCommitments[0] ? toIsraelDate(openCommitments[0].actionDate) : null,
      pendingPromiseProposals: pending.length,
      receiptTasks,
      disputeDue,
      overdueLarge: overdueAmount > 0.005 && sev.level !== SEV_LOW,
    },
  };
}

/** True when the customer belongs in the daily run: an open balance, an open task or an open promise. */
export const needsSummary = (f: CustomerFact) =>
  Math.abs(f.basis.openBalance) > 0.005 || f.basis.openTasks.length > 0 || !!f.basis.openPromise;

/** The line Iris reads for one customer. */
export function factLine(f: CustomerFact): string {
  const b = f.basis;
  const s = f.signals;
  const overdue = b.overdueAmount > 0.005 ? `בפיגור ${ils(b.overdueAmount)} (הוותיקה ${b.oldestOverdueDays} ימים)` : 'בפיגור 0 ₪';
  const broken = b.brokenPromises ? `${b.brokenPromises} (${s.brokenDetails.join('; ')})` : '0';
  const tasks = b.openTasks.length ? b.openTasks.slice(0, MAX_PROMPT_TASKS).join(', ') : 'אין';
  return [
    `לקוח ${f.customerCode}`,
    f.customerName,
    `יתרה ${ils(b.openBalance)}`,
    overdue,
    `התחייבויות פתוחות: ${b.openPromise ?? 'אין'}`,
    `לא קוימו: ${broken}`,
    `הערות פעילות: ${b.activeNotes ?? 0}`,
    `בירורים פתוחים: ${b.openDisputes}`,
    `משימות פתוחות: ${tasks}`,
    `הערה אחרונה: ${b.latestNote ?? 'אין'}`,
    `קשר אחרון: ${b.lastContact ?? 'אין'}`,
  ].join(' | ');
}

export function buildSummaryPrompt(asOfDate: string, facts: CustomerFact[]): string {
  return [TASK_PREFIX, `תאריך: ${asOfDate}`, ...facts.map(factLine)].join('\n');
}

/** Order for the run: largest overdue first, then balance, then code. */
export const factOrder = (a: CustomerFact, b: CustomerFact) =>
  b.basis.overdueAmount - a.basis.overdueAmount || b.basis.openBalance - a.basis.openBalance || naturalCompare(a.customerCode, b.customerCode);

// ---------- the action rules and the code fallback ----------

/** A fact passed back by the workflow (plain JSON), normalised; null without a customerCode. */
export function normaliseFact(raw: any): CustomerFact | null {
  if (!raw || typeof raw !== 'object') return null;
  const code = str(raw.customerCode).trim();
  if (!code) return null;
  const b = raw.basis && typeof raw.basis === 'object' ? raw.basis : {};
  const s = raw.signals && typeof raw.signals === 'object' ? raw.signals : {};
  const text = (v: unknown) => str(v).trim() || null;
  const basis: SummaryBasis = {
    openBalance: round2(num(b.openBalance)),
    overdueAmount: round2(num(b.overdueAmount)),
    oldestOverdueDays: Math.max(0, Math.round(num(b.oldestOverdueDays))),
    openPromise: text(b.openPromise),
    brokenPromises: Math.max(0, Math.round(num(b.brokenPromises))),
    openDisputes: Math.max(0, Math.round(num(b.openDisputes))),
    openTasks: Array.isArray(b.openTasks) ? b.openTasks.map((t: unknown) => str(t).trim()).filter(Boolean) : [],
    latestNote: text(b.latestNote),
    activeNotes: Math.max(0, Math.round(num(b.activeNotes))),
    lastContact: text(b.lastContact),
  };
  const sev = computeSeverity({ amount: basis.overdueAmount, daysOverdue: basis.oldestOverdueDays });
  return {
    customerCode: code,
    customerName: str(raw.customerName).trim() || code,
    isTestFixture: raw.isTestFixture === true || raw.isTestFixture === 'true' || isFixtureCustomer(undefined, code),
    basis,
    signals: {
      brokenDetails: Array.isArray(s.brokenDetails) ? s.brokenDetails.map(str) : [],
      openPromiseDate: text(s.openPromiseDate),
      pendingPromiseProposals: Math.max(0, num(s.pendingPromiseProposals)) || (basis.openTasks.includes(TITLE_PROMISE_APPROVAL) ? 1 : 0),
      receiptTasks: Math.max(0, num(s.receiptTasks)),
      disputeDue: s.disputeDue === true,
      overdueLarge: typeof s.overdueLarge === 'boolean' ? s.overdueLarge : basis.overdueAmount > 0.005 && sev.level !== SEV_LOW,
    },
  };
}

/**
 * The single next step, by Iris's rules. Order: a pending email promise to approve, a receipt waiting for
 * identification or remittance, a broken promise or large overdue without an open promise (call), a dispute whose
 * follow-up is due, an open promise (wait for its date), small overdue (reminder), no overdue (nothing).
 */
export function chooseAction(f: CustomerFact): string {
  const b = f.basis;
  const s = f.signals;
  if (s.pendingPromiseProposals > 0) return A_APPROVE;
  if (s.receiptTasks > 0) return A_RECEIPT;
  if (!b.openPromise && (b.brokenPromises > 0 || (b.overdueAmount > 0.005 && s.overdueLarge))) return A_CALL;
  if (s.disputeDue) return A_DISPUTE;
  if (b.openPromise) return A_WAIT;
  if (b.overdueAmount > 0.005) return A_REMIND;
  return A_NONE;
}

const ACTION_SENTENCE: Record<string, (f: CustomerFact) => string> = {
  [A_CALL]: (f) =>
    f.basis.brokenPromises > 0
      ? 'להתקשר ללקוח לגבי ההתחייבות שלא קוימה ולקבל מועד תשלום חדש.'
      : `להתקשר ללקוח לגבי ${ils(f.basis.overdueAmount)} בפיגור ולקבל התחייבות לתשלום.`,
  [A_REMIND]: (f) => `לשלוח ללקוח תזכורת על ${ils(f.basis.overdueAmount)} בפיגור.`,
  [A_DISPUTE]: () => 'לבדוק את הבירור הפתוח שהגיע מועדו ולעדכן את הלקוח.',
  [A_APPROVE]: () => 'לאשר את הצעת ההבטחה מהמייל בדואר הנכנס.',
  [A_RECEIPT]: () => 'לטפל בתקבול של הלקוח שממתין לזיהוי או לפירוט.',
  [A_WAIT]: (f) => `לחכות למועד ההתחייבות (${f.basis.openPromise}) ולבדוק שהתשלום נכנס.`,
  [A_NONE]: () => 'אין צורך בפעולה היום.',
};

/** Plain two-sentence Hebrew summary from the facts, with the action the rules pick. */
export function fallbackSummary(f: CustomerFact): { summary: string; suggestedAction: string; actionType: string } {
  const b = f.basis;
  const s = f.signals;
  const first =
    Math.abs(b.openBalance) <= 0.005 && b.overdueAmount <= 0.005
      ? 'אין יתרה פתוחה.'
      : `יתרה פתוחה ${ils(b.openBalance)}${b.overdueAmount > 0.005 ? `, מתוכה ${ils(b.overdueAmount)} בפיגור (הוותיקה ${b.oldestOverdueDays} ימים).` : ', ואין חוב בפיגור.'}`;
  const points: string[] = [];
  if (b.brokenPromises) points.push(`${b.brokenPromises === 1 ? 'התחייבות לא קוימה' : `${b.brokenPromises} התחייבויות לא קוימו`}${s.brokenDetails.length ? ` (${s.brokenDetails.join('; ')})` : ''}`);
  if (b.openPromise) points.push(`התחייבות פתוחה: ${b.openPromise}`);
  if (s.pendingPromiseProposals) points.push('הצעת הבטחה ממייל ממתינה לאישור');
  if (b.openDisputes) points.push(`בירורים פתוחים: ${b.openDisputes}`);
  if (b.openTasks.length && points.length < 2) points.push(`משימות פתוחות: ${b.openTasks.slice(0, MAX_PROMPT_TASKS).join(', ')}`);
  if (points.length < 2) points.push(b.lastContact ? `קשר אחרון: ${b.lastContact}` : 'אין קשר מתועד');
  const second = `${points.slice(0, 2).join('; ')}.`;
  const actionType = chooseAction(f);
  return { summary: `${first} ${second}`, suggestedAction: ACTION_SENTENCE[actionType](f), actionType };
}

// ---------- Iris's structured answer ----------

export interface AgentSummary {
  customerCode: string;
  summary: string;
  suggestedAction: string;
  actionType: string;
}

const WRAPPER_KEYS = ['structuredOutput', 'structured_output', 'output', 'result', 'answer', 'data', 'response', 'message', 'content', 'text', 'value', 'json'];

function parseJsonLoose(s: string): unknown {
  let t = s.trim();
  if (!t || t === 'undefined' || t === 'null' || !/[{[]/.test(t)) return null;
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const z = t.lastIndexOf('}');
    if (a >= 0 && z > a) {
      try {
        return JSON.parse(t.slice(a, z + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * The summaries array from whatever the workflow passed: {summaries}, a bare array, a (fenced / double-encoded)
 * JSON string, or any of those inside a wrapper ({output | result | structuredOutput | …}). null when none is found.
 */
export function parseAgentSummaries(raw: unknown, depth = 0): unknown[] | null {
  if (depth > 6 || raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return parseAgentSummaries(parseJsonLoose(raw), depth + 1);
  if (Array.isArray(raw)) return raw.length && raw.every((x) => x && typeof x === 'object' && 'customerCode' in x) ? raw : null;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.summaries)) return o.summaries;
  if (typeof o.summaries === 'string') {
    const inner = parseAgentSummaries(o.summaries, depth + 1);
    if (inner) return inner;
  }
  for (const k of WRAPPER_KEYS) {
    if (o[k] !== undefined && o[k] !== null) {
      const inner = parseAgentSummaries(o[k], depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

/** Iris's entries checked against the facts: kept by customerCode, and the reasons for each dropped one. */
export function validateAgentSummaries(list: unknown[] | null, codes: Set<string>): { kept: Map<string, AgentSummary>; rejected: string[] } {
  const kept = new Map<string, AgentSummary>();
  const rejected: string[] = [];
  for (const [i, e] of (list ?? []).entries()) {
    const x: any = e && typeof e === 'object' ? e : {};
    const code = str(x.customerCode).trim();
    const label = code || `#${i + 1}`;
    const summary = str(x.summary).trim();
    const suggestedAction = str(x.suggestedAction).trim();
    const actionType = str(x.actionType).trim();
    if (!code) rejected.push(`${label}: חסר קוד לקוח`);
    else if (!codes.has(code)) rejected.push(`${label}: הלקוח לא ברשימה`);
    else if (kept.has(code)) rejected.push(`${label}: הלקוח הופיע פעמיים (נשמרה הרשומה הראשונה)`);
    else if (!ACTION_TYPES.includes(actionType)) rejected.push(`${label}: סוג פעולה לא מוכר "${actionType}"`);
    else if (!summary) rejected.push(`${label}: סיכום ריק`);
    else if (!suggestedAction) rejected.push(`${label}: הצעה לפעולה ריקה`);
    else kept.set(code, { customerCode: code, summary, suggestedAction, actionType });
  }
  return { kept, rejected };
}
