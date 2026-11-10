import type { ApprovalsEntity, DeliveryNotesEntity, DisputesEntity, InvoicesEntity } from '@/product-types';
import { splitList } from '@/utils/Inbox';

export type Dispute = (typeof DisputesEntity)['instanceType'] & { id: string };
export type DeliveryNote = (typeof DeliveryNotesEntity)['instanceType'] & { id: string };
export type InvoiceRow = (typeof InvoicesEntity)['instanceType'] & { id: string };
export type CaseDraft = (typeof ApprovalsEntity)['instanceType'] & { id: string };

export const DOC_TYPE = 'תעודת משלוח חסרה';
export const PRICE_TYPE = 'מחיר';
export const CLOSED = 'נסגרה';
export const ESCALATED = 'הוסלמה';
export const ST_WAIT_SCAN = 'ממתינה לסריקה';
export const ST_REMINDER = 'תזכורת בטיוטה';
export const ST_READY = 'מוכנה לשליחה ללקוח';
export const ST_AGENT = 'ממתינה לאישור סוכן';
export const ST_MANAGER = 'ממתינה לאישור מנהל';
export const ST_CREDIT = 'ממתינה לזיכוי';

export const STEP_AGENT = 'סוכן אישר';
export const STEP_MANAGER = 'מנהל אישר';
export type ApprovalStep = typeof STEP_AGENT | typeof STEP_MANAGER;

export const KIND_LOGISTICS = 'פנייה ללוגיסטיקה';
export const KIND_PACKAGE = 'מענה ללקוח';
export const KIND_PRICE_REQUEST = 'בקשת אישור מחיר';

/** Inbox categories that open a case on this screen. */
export const CASE_CATEGORIES = new Set(['תעודות וחשבוניות חסרות', 'הפרש מחיר']);

type DisputeTab = 'docs' | 'prices';

/** The פניות folder that lists a case's mails: 3 = documents, 4 = prices (the old cases list moved there). */
export function casesFolderUrl(tab?: DisputeTab) {
  return `/collections/inbox?tab=inbox&folder=${tab === 'prices' ? '4' : '3'}`;
}

export const isTestCustomer = (code?: string | null) => !!code && code.trim().toUpperCase().startsWith('TEST-');
export const isTestDispute = (d: Pick<Dispute, 'isTestFixture' | 'customerCode'>) => !!d.isTestFixture || isTestCustomer(d.customerCode);

/** Chip tone for a case status. */
export function disputeTone(status?: string | null): 'critical' | 'warning' | 'active' | 'done' | 'neutral' | 'info' {
  switch (status) {
    case ESCALATED:
      return 'critical';
    case ST_WAIT_SCAN:
    case ST_AGENT:
    case ST_MANAGER:
      return 'active';
    case ST_REMINDER:
    case ST_CREDIT:
      return 'warning';
    case ST_READY:
      return 'info';
    case CLOSED:
      return 'done';
    default:
      return 'neutral';
  }
}

export interface DocCount {
  scanned: number;
  expected: number;
  /** Unscanned note numbers found in DeliveryNotes. */
  missing: string[];
  /** Notes the invoices expect that are not in DeliveryNotes at all. */
  unknown: number;
}

/** Same rule as the engine: per invoice total = max(deliveryNotesExpected, notes found); scanned = scanned notes. */
export function countDocs(invoiceNumbers: string[], invoices: InvoiceRow[], notes: DeliveryNote[]): DocCount {
  const out: DocCount = { scanned: 0, expected: 0, missing: [], unknown: 0 };
  for (const no of invoiceNumbers) {
    const own = notes.filter((n) => n.invoiceNumber === no);
    const inv = invoices.find((i) => i.invoiceNumber === no);
    const expected = Math.max(Number(inv?.deliveryNotesExpected ?? 0) || 0, own.length);
    out.expected += expected;
    out.scanned += own.filter((n) => n.scanned).length;
    out.missing.push(...own.filter((n) => !n.scanned).map((n) => n.noteNumber ?? ''));
    out.unknown += Math.max(0, expected - own.length);
  }
  out.missing = out.missing.filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return out;
}

export const invoicesOf = (d: Pick<Dispute, 'invoiceNumbers'>) => splitList(d.invoiceNumbers);

const PRICE_REASONS = ['מחירון לא עודכן', 'מחיר ידני', 'ללא חיוב'];

/** Reason tags of a price case, from the "סיבות: …" line AnalyzePriceGap writes into the description. */
export function reasonsOf(description?: string | null): string[] {
  const line = (description ?? '').split('\n').find((l) => l.trim().startsWith('סיבות:'));
  if (!line) return [];
  return line
    .replace('סיבות:', '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => PRICE_REASONS.includes(s));
}

// ---------- action results (read defensively; see code-actions/*/code.ts) ----------

export interface ScanCheckCase {
  disputeId?: string;
  disputeNumber?: string;
  scanned?: number;
  expected?: number;
  missingNoteNumbers?: string[];
  before?: string;
  after?: string;
  action?: string;
  steps?: string[];
  clockUsed?: string;
  note?: string;
  nextReminderAt?: string | null;
}

export interface CheckScansResult {
  asOf?: string | null;
  clockIsNow?: boolean;
  testClockNote?: string;
  cases?: ScanCheckCase[];
  writeVerified?: boolean;
  errors?: string[];
}

export interface PriceLine {
  lineKey?: string;
  orderNumber?: string | null;
  sku?: string;
  itemName?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  listPrice?: number | null;
  listSource?: string | null;
  priceListCode?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  currentListPrice?: number | null;
  currentValidFrom?: string | null;
  priceSource?: string;
  managerApprovalStatus?: string;
  freeText?: string | null;
  gapPerUnit?: number;
  gapTotal?: number;
  reason?: string | null;
  explanation?: string;
}

export interface PriceGapResult {
  invoiceNumber?: string;
  invoiceDate?: string | null;
  customerCode?: string;
  customerName?: string;
  siteName?: string;
  lines?: PriceLine[];
  totalGap?: number;
  underchargedTotal?: number;
  reasons?: string[];
  salesAgentName?: string;
  salesManagerName?: string;
  salesAgentFound?: boolean;
  outcome?: string;
  refused?: boolean;
  refusalReason?: string;
  errors?: string[];
}

export function isPriceGapResult(v: unknown): boolean {
  return !!v && typeof v === 'object' && Array.isArray((v as PriceGapResult).lines);
}

export interface MarkApprovalResult {
  refused?: boolean;
  reason?: string;
  writeVerified?: boolean;
  errors?: string[];
}