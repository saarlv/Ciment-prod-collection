import type { CollectionQueueEntity } from '@/product-types';
import { daysOverdue, israelDateOf } from '@/utils/Format';

export type Task = (typeof CollectionQueueEntity)['instanceType'] & { id: string };

export type TaskTab = 'all' | 'collect' | 'promises' | 'disputes' | 'inbox' | 'receipts';

export const TASK_TABS: { key: TaskTab; label: string }[] = [
  { key: 'all', label: 'הכול' },
  { key: 'collect', label: 'גבייה' },
  { key: 'promises', label: 'הבטחות' },
  { key: 'disputes', label: 'בירורים' },
  { key: 'inbox', label: 'פניות' },
  { key: 'receipts', label: 'תקבולים' },
];

export function isTaskTab(v: string | null): v is TaskTab {
  return TASK_TABS.some((t) => t.key === v);
}

export const OPEN_STATUSES = ['ממתין', 'בטיפול'] as const;
export const CLOSED_STATUSES = ['טופל', 'נדחה', 'נסגר אוטומטית'] as const;

export function isOpenTask(t: Task): boolean {
  return t.status === 'ממתין' || t.status === 'בטיפול';
}

/** The task engine's key prefixes (code-actions/shared/collections-tasks.ts) → the page's tabs. */
const TAB_BY_KIND: Record<string, Exclude<TaskTab, 'all'>> = {
  'aging-overdue': 'collect',
  'docs-missing': 'collect',
  'promise-broken': 'promises',
  'dispute-followup': 'disputes',
  'note-followup': 'disputes',
  inbox: 'inbox',
  manual: 'inbox',
  'verify-sender': 'inbox',
  draft: 'inbox',
  'receipt-customer': 'receipts',
  'receipt-bounced': 'receipts',
  'bank-missing': 'receipts',
  identify: 'receipts',
  'missing-ap': 'receipts',
  allocate: 'receipts',
  'debt-check': 'receipts',
  'debt-zero': 'receipts',
};

const TAB_BY_TYPE: Record<string, Exclude<TaskTab, 'all'>> = {
  'לגבות מהלקוח': 'collect',
  'תעודות משלוח חסרות': 'collect',
  'ביטוח 80%': 'collect',
  'הבטחה הופרה': 'promises',
  'מעקב בירור – מחיר': 'disputes',
  'מעקב בירור – תעודה חסרה': 'disputes',
  'מעקב בירור – אחר': 'disputes',
  'מייל לטיפול': 'inbox',
  'טיוטה לאישור': 'inbox',
  'לאמת שולח': 'inbox',
  'להוסיף איש קשר בפריוריטי': 'inbox',
  'תעודות / חשבוניות חסרות – טיפול ידני': 'inbox',
  'זיכוי / הפרש מחיר – טיפול ידני': 'inbox',
  'צ׳ק חוזר': 'receipts',
  'לא זוהה': 'receipts',
  'דפי בנק לא נטענו': 'receipts',
  'זיהוי לקוח – לאישור': 'receipts',
  'חסר איש קשר הנהלת חשבונות': 'receipts',
  'קבלה – צריך פיזור': 'receipts',
  'לברר מול הלקוח – סכום לא סוגר חודש': 'receipts',
  'נסגר לאפס': 'receipts',
};

const TAB_BY_SOURCE: Record<string, Exclude<TaskTab, 'all'>> = {
  'דוח גיול': 'collect',
  ביטוח: 'collect',
  הבטחות: 'promises',
  פניות: 'inbox',
  תקבולים: 'receipts',
};

/** The tab of a task: its key prefix when the engine wrote it, else (manual rows) its type, else its source. */
export function tabOf(t: Task): Exclude<TaskTab, 'all'> {
  const kind = (t.taskKey ?? '').split(':')[0];
  return TAB_BY_KIND[kind] ?? TAB_BY_TYPE[t.taskType ?? ''] ?? TAB_BY_SOURCE[t.source ?? ''] ?? 'collect';
}

const SEVERITY_RANK: Record<string, number> = { קריטית: 0, גבוהה: 1, בינונית: 2, נמוכה: 3 };

export const BANK_NOT_IN_PRIORITY = 'דף הבנק לא עלה לפריוריטי';

/** "דף הבנק לא עלה לפריוריטי" (bank-missing:<date>, the bank check): urgent, always first in the list. */
export function isUrgentBankTask(t: Pick<Task, 'taskType' | 'taskKey'>): boolean {
  return t.taskType === BANK_NOT_IN_PRIORITY || (t.taskKey ?? '').startsWith('bank-missing:');
}

/** A notice with nothing to do (isAlert): shown only under the התראות filter, without a handle button. */
export const isAlertTask = (t: Pick<Task, 'isAlert'>): boolean => t.isAlert === true;

/** The urgent bank task first; then severity, then the score (higher first), then the oldest. */
export function compareTasks(a: Task, b: Task): number {
  const u = Number(isUrgentBankTask(b)) - Number(isUrgentBankTask(a));
  if (u) return u;
  const r = (SEVERITY_RANK[a.severity ?? ''] ?? 4) - (SEVERITY_RANK[b.severity ?? ''] ?? 4);
  if (r) return r;
  const s = (b.severityScore ?? b.priorityScore ?? 0) - (a.severityScore ?? a.priorityScore ?? 0);
  if (s) return s;
  return (a.openedAt ?? a.queueDate ?? '').localeCompare(b.openedAt ?? b.queueDate ?? '');
}

/** Whole days the task has been open (Israel calendar days since openedAt). */
export function daysOpen(t: Task): number | null {
  const opened = israelDateOf(t.openedAt) ?? t.queueDate ?? null;
  const d = daysOverdue(opened);
  return d === null ? null : Math.max(0, d);
}

export function daysOpenLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'נפתחה היום';
  if (days === 1) return 'יום אחד';
  if (days === 2) return 'יומיים';
  return `${days} ימים`;
}

export function invoiceListOf(t: Task): string[] {
  return (t.invoiceNumbers ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SourceKind = 'invoice' | 'email' | 'draft' | 'receipt' | 'bankDay' | 'dispute' | 'customer' | 'contact';

/** "דפי בנק לא נטענו" (bank-missing:<date>, written by SyncPriorityBankLines): today's bank lines never arrived. */
export function isBankMissingTask(t: Task): boolean {
  return (t.taskKey ?? '').startsWith('bank-missing:') || t.taskType === 'דפי בנק לא נטענו';
}

/** "חסר איש קשר הנהלת חשבונות" (missing-ap:<customerCode>, stage 4): the fix is on the customer card, not the receipt. */
export function isMissingApTask(t: Task): boolean {
  return (t.taskKey ?? '').startsWith('missing-ap:') || t.taskType === 'חסר איש קשר הנהלת חשבונות';
}

/**
 * Where "open the source" leads, from the task's related record (written by every task writer). identify:<bankLineId>
 * (relatedTable BankLines) opens its line on the receipts screen; missing-ap opens the customer card.
 */
export function sourceKindOf(t: Task): SourceKind {
  if (isBankMissingTask(t)) return 'bankDay';
  if (isMissingApTask(t)) return 'customer';
  switch (t.relatedTable) {
    case 'InboundEmails':
      return 'email';
    case 'Approvals':
      return 'draft';
    case 'BankLines':
    case 'Receipts':
      return 'receipt';
    case 'Disputes':
      return 'dispute';
    case 'CustomerContacts':
      return 'contact';
    default:
      return invoiceListOf(t).length > 0 ? 'invoice' : 'customer';
  }
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  invoice: 'חלון החשבונית',
  email: 'פאנל המייל',
  draft: 'הטיוטה',
  receipt: 'רשומת התקבול',
  bankDay: 'מסך התקבולים',
  dispute: 'תיק הבירור',
  customer: 'כרטיס הלקוח',
  contact: 'אנשי הקשר של הלקוח',
};
/**
 * The receipt tasks that open the record panel (08.11 flow): identify:<bankLineId> "זיהוי לקוח – לאישור",
 * receipt-customer:<bankLineId> "לא זוהה", allocate:<receiptKey> "קבלה – צריך פיזור", debt-check:<receiptKey> "לברר מול
 * הלקוח – סכום לא סוגר חודש" and the debt-zero:<receiptKey> "נסגר לאפס" alert.
 */
export type ReceiptTaskKind = 'identify' | 'customer' | 'allocate' | 'debt-check' | 'debt-zero';

const KIND_BY_PREFIX: Record<string, ReceiptTaskKind> = {
  identify: 'identify',
  'receipt-customer': 'customer',
  allocate: 'allocate',
  'debt-check': 'debt-check',
  'debt-zero': 'debt-zero',
};

const KIND_BY_TYPE: Record<string, ReceiptTaskKind> = {
  'זיהוי לקוח – לאישור': 'identify',
  'לא זוהה': 'customer',
  'קבלה – צריך פיזור': 'allocate',
  'לברר מול הלקוח – סכום לא סוגר חודש': 'debt-check',
  'נסגר לאפס': 'debt-zero',
};

/** The receipt task of a row: by its key prefix, else its type. */
export function receiptTaskKind(t: Task): ReceiptTaskKind | null {
  return KIND_BY_PREFIX[(t.taskKey ?? '').split(':')[0]] ?? KIND_BY_TYPE[t.taskType ?? ''] ?? null;
}

const afterColon = (key: string) => {
  const i = key.indexOf(':');
  return i > 0 && key.slice(i + 1) ? key.slice(i + 1) : null;
};

/**
 * The bank line of a receipts task: a BankLines relatedId first (every returned-cheque task — its key
 * receipt-bounced:cheque:<account>:<number> holds no line id; relatedId is the cheque's earliest line); else the part
 * of an identify:<bankLineId> / receipt-customer:<bankLineId> key after the colon.
 */
export function receiptLineIdOf(t: Task): string | null {
  if (t.relatedTable === 'BankLines' && t.relatedId) return t.relatedId;
  const key = t.taskKey ?? '';
  if (key.startsWith('identify:') || key.startsWith('receipt-customer:')) return afterColon(key);
  return null;
}

/** The receipt of a receipts task: a Receipts relatedId, else the receiptKey of an allocate / debt-check / debt-zero key. */
export function receiptKeyOf(t: Task): string | null {
  if (t.relatedTable === 'Receipts' && t.relatedId) return t.relatedId;
  const key = t.taskKey ?? '';
  if (key.startsWith('allocate:') || key.startsWith('debt-check:') || key.startsWith('debt-zero:')) return afterColon(key);
  return null;
}

/** Where a receipts task opens on the receipts screen: its record (?receipt= / ?line=), else the screen. */
export function receiptRecordHref(t: Task): string | null {
  const key = receiptKeyOf(t);
  if (key) return `/collections/receipts?${new URLSearchParams({ receipt: key }).toString()}`;
  return null;
}