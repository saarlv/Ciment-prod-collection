import type { ApprovalsEntity, CollectionQueueEntity, InboundEmailsEntity } from '@/product-types';

export type InboundEmail = (typeof InboundEmailsEntity)['instanceType'] & { id: string };
export type Approval = (typeof ApprovalsEntity)['instanceType'] & { id: string };
export type QueueTask = (typeof CollectionQueueEntity)['instanceType'] & { id: string };

export const APPROVED_NOT_SENT = 'אושר – לא נשלח';
export const IRRELEVANT_CATEGORY = 'לא רלוונטי';
export const IRRELEVANT_STATUS = 'לא רלוונטית';

const DAY_MS = 24 * 3_600_000;
const WARN_MS = 6 * 3_600_000;

export const NOT_HANDLED = 'לא טופל';
export const WAITING = 'ממתין';
export const HANDLED = 'טופל';
export const HANDLING_STATES = [NOT_HANDLED, WAITING, HANDLED] as const;
export type HandlingState = (typeof HANDLING_STATES)[number];

export type SlaTone = 'done' | 'ok' | 'warning' | 'critical' | 'none';

export interface SlaState {
  tone: SlaTone;
  /** 0..1 — how much of the reply window has passed. */
  elapsed: number;
  /** Milliseconds left until dueAt (negative when overdue). */
  leftMs: number;
  label: string;
}

export function isIrrelevant(e: Pick<InboundEmail, 'category' | 'status'>) {
  return e.category === IRRELEVANT_CATEGORY || e.status === IRRELEVANT_STATUS;
}

/** Hours:minutes for a duration, e.g. "5:12". */
function hhmm(ms: number) {
  const total = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * The 24-hour reply ring (dueAt = received + 24h). Since component 04 it follows the handling state:
 * טופל stops it (green); rows from before the handling state keep the old answered rule.
 */
export function slaOf(
  e: Pick<InboundEmail, 'receivedAt' | 'dueAt' | 'answeredAt' | 'category' | 'status'> & { handlingState?: string | null },
  now: number,
): SlaState {
  if (e.handlingState === HANDLED) return { tone: 'done', elapsed: 1, leftMs: 0, label: HANDLED };
  if (!e.handlingState && (e.answeredAt || e.status === 'נענתה')) return { tone: 'done', elapsed: 1, leftMs: 0, label: 'נענתה' };
  if (isIrrelevant(e)) return { tone: 'done', elapsed: 1, leftMs: 0, label: 'לא רלוונטית' };
  const received = e.receivedAt ? new Date(e.receivedAt).getTime() : NaN;
  const due = e.dueAt ? new Date(e.dueAt).getTime() : Number.isNaN(received) ? NaN : received + DAY_MS;
  if (Number.isNaN(due)) return { tone: 'none', elapsed: 0, leftMs: 0, label: 'אין מועד' };
  const total = Number.isNaN(received) ? DAY_MS : Math.max(due - received, 60_000);
  const leftMs = due - now;
  const elapsed = Math.min(1, Math.max(0, 1 - leftMs / total));
  if (leftMs <= 0) return { tone: 'critical', elapsed: 1, leftMs, label: `חריגה ${hhmm(leftMs)}` };
  return { tone: leftMs < WARN_MS ? 'warning' : 'ok', elapsed, leftMs, label: `נותרו ${hhmm(leftMs)}` };
}

/** Attachment links are stored one per line. */
export function splitUrls(value?: string | null): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Comma-separated invoice numbers → a clean list. */
export function splitList(value?: string | null): string[] {
  return (value ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ink tone of a verification chip. */
export function verificationTone(v?: string | null): 'done' | 'critical' | 'warning' | 'neutral' {
  if (v === 'מאומת') return 'done';
  if (v === 'לא מאומת') return 'critical';
  if (v === 'לבדיקה') return 'warning';
  return 'neutral';
}

/** Chip tone of an InboundEmails status. */
export function emailStatusTone(s?: string | null): 'active' | 'info' | 'warning' | 'done' | 'neutral' {
  switch (s) {
    case 'חדשה':
      return 'active';
    case 'בטיפול מאיה':
      return 'info';
    case 'טיוטה מוכנה':
    case 'ממתינה לגורם פנימי':
      return 'warning';
    case 'נענתה':
      return 'done';
    default:
      return 'neutral';
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Component 04 · פניות: folders, handling state, Maya's evidence, the outbox                      */
/* ---------------------------------------------------------------------------------------------- */

export type FolderKey = 'all' | '1' | '2' | '3' | '4' | '5' | '6' | 'other';

/** The folder strip, in order. A mail lives in the folder of its first type (1→5) and also shows in its other types' folders. */
export const FOLDERS: { key: FolderKey; label: string; short: string }[] = [
  { key: 'all', label: 'הכול', short: 'הכול' },
  { key: '1', label: 'כרטסת', short: '1' },
  { key: '2', label: 'חובות פתוחים', short: '2' },
  { key: '3', label: 'תעודות וחשבוניות חסרות', short: '3' },
  { key: '4', label: 'הפרש מחיר', short: '4' },
  { key: '5', label: 'פירוט תשלום', short: '5' },
  { key: '6', label: 'אישור ביטוח אשראי', short: '6' },
  { key: 'other', label: 'אחר', short: 'אחר' },
];

export const CAT_LEDGER = 'כרטסת';
export const CAT_OPEN_DEBTS = 'חובות פתוחים';
export const CAT_DOCUMENTS = 'תעודות וחשבוניות חסרות';
export const CAT_PRICE = 'הפרש מחיר';
export const CAT_REMITTANCE = 'פירוט תשלום';

const FOLDER_OF_TYPE: Record<string, FolderKey> = {
  [CAT_LEDGER]: '1',
  [CAT_OPEN_DEBTS]: '2',
  [CAT_DOCUMENTS]: '3',
  [CAT_PRICE]: '4',
  [CAT_REMITTANCE]: '5',
  'אישור ביטוח אשראי': '6',
};

export function isFolderKey(v: string | null): v is FolderKey {
  return !!v && FOLDERS.some((f) => f.key === v);
}

/** Every type Maya found, in folder order (categories; older rows only have category). */
export function typesOf(e: Pick<InboundEmail, 'categories' | 'category'>): string[] {
  const list = splitList(e.categories);
  if (list.length) return list;
  return e.category ? [e.category] : [];
}

export function folderOfType(type: string): FolderKey {
  return FOLDER_OF_TYPE[type] ?? 'other';
}

/** The folders a mail shows in (its first one is where it lives). */
export function foldersOf(e: Pick<InboundEmail, 'categories' | 'category'>): FolderKey[] {
  const keys = typesOf(e).map(folderOfType);
  const order = FOLDERS.map((f) => f.key);
  const unique = [...new Set(keys.length ? keys : (['other'] as FolderKey[]))];
  return unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Handling state, with rows from before component 04 read as לא טופל (irrelevant ones as טופל). */
export function handlingOf(e: Pick<InboundEmail, 'handlingState' | 'category' | 'status'>): HandlingState {
  if (e.handlingState) return e.handlingState;
  return isIrrelevant(e) ? HANDLED : NOT_HANDLED;
}

export function handlingTone(state: string): 'warning' | 'done' | 'active' {
  if (state === HANDLED) return 'done';
  if (state === WAITING) return 'warning';
  return 'active';
}

export interface QuoteType {
  type?: string;
  quote?: string;
  verified?: boolean;
}
export interface QuoteInvoice {
  invoiceNumber?: string;
  quote?: string;
  verified?: boolean;
  belongsToCustomer?: boolean;
}
export interface QuoteRejected {
  field?: string;
  value?: string;
  reason?: string;
}
export interface QuoteCandidate {
  customerCode?: string;
  customerName?: string;
  method?: string;
}
export interface ClassificationQuotes {
  types: QuoteType[];
  invoices: QuoteInvoice[];
  rejected: QuoteRejected[];
  candidates: QuoteCandidate[];
}

function arrayOf<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
}

/** InboundEmails.classificationQuotes, read defensively (the code may store it as a JSON string). */
export function quotesOf(raw: unknown): ClassificationQuotes {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return {
    types: arrayOf<QuoteType>(o.types),
    invoices: arrayOf<QuoteInvoice>(o.invoices),
    rejected: arrayOf<QuoteRejected>(o.rejected),
    candidates: arrayOf<QuoteCandidate>(o.candidates),
  };
}

/** The outbox reference: CIM-<id>, also for rows written before referenceCode existed. */
export function referenceOf(a: Pick<Approval, 'referenceCode' | 'id'>): string {
  return a.referenceCode || `CIM-${a.id}`;
}

export const OUTBOX_COMPONENTS = ['פניות', 'תקבולים', 'תעודות', 'מחירים', 'מנה חודשית', 'ביטוח'] as const;
export const OUTBOX_STATUSES = ['ממתין', APPROVED_NOT_SENT, 'אושר – לביצוע ב-Priority', 'אושר', 'בוצע', 'נשלח', 'נדחה'] as const;

/** Every outbox draft that belongs to an inbound mail: its own replies, and the drafts of the cases it opened. */
export function draftsOfEmail(rows: Approval[], email: Pick<InboundEmail, 'id' | 'messageId'>, disputeIds: string[]): Approval[] {
  return rows
    .filter(
      (a) =>
        (a.relatedTable === 'InboundEmails' && a.relatedId === email.id) ||
        (!!email.messageId && a.inboundEmailId === email.messageId) ||
        (a.relatedTable === 'Disputes' && !!a.relatedId && disputeIds.includes(a.relatedId)),
    )
    .sort((x, y) => (y.draftedAt ?? '').localeCompare(x.draftedAt ?? ''));
}
/* ---------------------------------------------------------------------------------------------- */
/* Promise proposals and disputes from email (component 05, step 3.4)                              */
/* ---------------------------------------------------------------------------------------------- */

export const PROPOSAL_PENDING = 'ממתינה לאישור';
export const PROPOSAL_APPROVED = 'אושרה';

/** Maya's promise proposal on a mail, awaiting a person's approval in the mail panel. */
export interface PromiseProposal {
  amount?: number;
  date?: string;
  method?: string;
  quote?: string;
  verified?: boolean;
  invoiceNumbers: string[];
  status?: string;
  approvedPromiseId?: string;
  approvedBy?: string;
  approvedAt?: string;
}

/** A conditional payment or a claim the invoice is wrong: a dispute, never a promise. */
export interface MailDispute {
  reason?: string;
  quote?: string;
  verified?: boolean;
  invoiceNumbers: string[];
  noteIds: string[];
}

function objectOf(raw: unknown, key: string): Record<string, unknown> | null {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const inner = (v as Record<string, unknown>)[key];
  return inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : null;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function promiseOf(raw: unknown): PromiseProposal | null {
  const o = objectOf(raw, 'promise');
  if (!o) return null;
  const amount = typeof o.amount === 'number' ? o.amount : Number(o.amount);
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    date: str(o.date),
    method: str(o.method),
    quote: str(o.quote),
    verified: typeof o.verified === 'boolean' ? o.verified : undefined,
    invoiceNumbers: strings(o.invoiceNumbers),
    status: str(o.status),
    approvedPromiseId: str(o.approvedPromiseId),
    approvedBy: str(o.approvedBy),
    approvedAt: str(o.approvedAt),
  };
}

export function disputeOf(raw: unknown): MailDispute | null {
  const o = objectOf(raw, 'dispute');
  if (!o) return null;
  return {
    reason: str(o.reason),
    quote: str(o.quote),
    verified: typeof o.verified === 'boolean' ? o.verified : undefined,
    invoiceNumbers: strings(o.invoiceNumbers),
    noteIds: strings(o.noteIds),
  };
}
/* ---------------------------------------------------------------------------------------------- */
/* Part C (plan 04.11): unknown sender, insurance approvals, manual sorting                       */
/* ---------------------------------------------------------------------------------------------- */

export const CAT_INSURANCE = 'אישור ביטוח אשראי';
export const VERIFIED = 'מאומת';

export interface SignatureSuggestion {
  customerCode?: string;
  customerName?: string;
  matchedOn?: string;
  value?: string;
  how?: string;
}
export interface MailSignature {
  companyName?: string;
  personName?: string;
  title?: string;
  logoText?: string;
  quote?: string;
  verified?: boolean;
  suggestion: SignatureSuggestion | null;
}
export interface SenderDecision {
  mode?: string;
  customerCode?: string;
  customerName?: string;
  contactId?: string;
  contactKey?: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}
export interface MailInsurance {
  requestId?: string;
  customerCode?: string;
  customerName?: string;
  status?: string;
  requestedLimit?: number;
  companyId?: string;
  matchedBy?: string;
  fromInsurerSender?: boolean;
}
export interface ManualTaskRef {
  taskKey?: string;
  taskId?: string;
  taskType?: string;
}

const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

export function signatureOf(raw: unknown): MailSignature | null {
  const o = objectOf(raw, 'signature');
  if (!o) return null;
  const s = o.suggestion && typeof o.suggestion === 'object' && !Array.isArray(o.suggestion) ? (o.suggestion as Record<string, unknown>) : null;
  return {
    companyName: str(o.companyName),
    personName: str(o.personName),
    title: str(o.title),
    logoText: str(o.logoText),
    quote: str(o.quote),
    verified: bool(o.verified),
    suggestion: s
      ? { customerCode: str(s.customerCode), customerName: str(s.customerName), matchedOn: str(s.matchedOn), value: str(s.value), how: str(s.how) }
      : null,
  };
}

export function senderDecisionOf(raw: unknown): SenderDecision | null {
  const o = objectOf(raw, 'senderDecision');
  if (!o) return null;
  return {
    mode: str(o.mode),
    customerCode: str(o.customerCode),
    customerName: str(o.customerName),
    contactId: str(o.contactId),
    contactKey: str(o.contactKey),
    decidedBy: str(o.decidedBy),
    decidedAt: str(o.decidedAt),
    note: str(o.note),
  };
}

export function insuranceOf(raw: unknown): MailInsurance | null {
  const o = objectOf(raw, 'insurance');
  if (!o) return null;
  const limit = typeof o.requestedLimit === 'number' ? o.requestedLimit : Number(o.requestedLimit);
  return {
    requestId: str(o.requestId),
    customerCode: str(o.customerCode),
    customerName: str(o.customerName),
    status: str(o.status),
    requestedLimit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    companyId: str(o.companyId),
    matchedBy: str(o.matchedBy),
    fromInsurerSender: bool(o.fromInsurerSender),
  };
}

export function manualTasksOf(raw: unknown): ManualTaskRef[] {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return arrayOf<Record<string, unknown>>((v as Record<string, unknown>).manualTasks).map((t) => ({
    taskKey: str(t.taskKey),
    taskId: str(t.taskId),
    taskType: str(t.taskType),
  }));
}

/** The "זה הלקוח X?" card shows for a mail that is not verified and has a signature or a suggested customer. */
export function needsSenderCard(e: Pick<InboundEmail, 'senderVerification' | 'suggestedCustomerCode' | 'classificationQuotes'>): boolean {
  if (senderDecisionOf(e.classificationQuotes)) return true;
  if (e.senderVerification === VERIFIED) return false;
  return !!signatureOf(e.classificationQuotes) || !!e.suggestedCustomerCode;
}