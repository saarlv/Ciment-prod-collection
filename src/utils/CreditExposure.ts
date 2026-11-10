/**
 * The shape GetCreditExposure returns (the generated output types are empty objects), and the pure helpers
 * the customer card's אובליגו וביטוח tab and the היום alerts share. Read only: nothing here writes.
 */

export type UseLevel = 'תקין' | 'גבוה';

export interface CreditCover {
  id?: string;
  insurer?: string | null;
  coverNo?: string | null;
  insuredAmount?: number | null;
  validUntil?: string | null;
  status?: string | null;
  coverSource?: string | null;
  syncedAt?: string | null;
  daysToExpiry?: number | null;
  expiringSoon?: boolean;
  expired?: boolean;
}

export interface CreditUse {
  pct?: number | null;
  amount?: number | null;
  headroom?: number | null;
  level?: UseLevel | string | null;
}

export interface CreditAdjustment {
  kind?: string;
  amount?: number | null;
  bankLineId?: string | null;
  receiptKey?: string | null;
  matchProposalId?: string | null;
  valueDate?: string | null;
  payerName?: string | null;
  status?: string | null;
  reason?: string | null;
}

export interface ExposureRow {
  id?: string;
  reference?: string | null;
  amount?: number | null;
  docDate?: string | null;
  dueDate?: string | null;
}

export interface ExposureGroup {
  itemType?: string;
  count?: number;
  total?: number;
  items?: ExposureRow[];
}

export interface OpenCreditRequest {
  id?: string;
  status?: string | null;
  currentLimit?: number | null;
  requestedLimit?: number | null;
  obligoPct?: number | null;
  justification?: string | null;
  requestCreatedAt?: string | null;
  proposedBy?: string | null;
}

export interface CreditAlert {
  kind?: string;
  customerCode?: string;
  customerName?: string;
  bookkeeperName?: string | null;
  insurer?: string | null;
  coverNo?: string | null;
  insuredAmount?: number | null;
  staticAmount?: number | null;
  dynamicAmount?: number | null;
  staticPct?: number | null;
  dynamicPct?: number | null;
  thresholdPct?: number | null;
  validUntil?: string | null;
  daysToExpiry?: number | null;
}

export interface CreditExposure {
  customer?: { customerCode?: string | null; customerName?: string | null } | null;
  insured?: boolean;
  cover?: CreditCover | null;
  staticObligo?: { amount?: number | null; asOf?: string | null; syncedAt?: string | null } | null;
  dynamicObligo?: {
    amount?: number | null;
    staticAmount?: number | null;
    adjustmentsTotal?: number | null;
    adjustments?: CreditAdjustment[];
    undepositedCheques?: ExposureRow[];
    chequesTotal?: number | null;
    afterDeposit?: number | null;
  } | null;
  use?: {
    thresholdPct?: number | null;
    expiryAlertDays?: number | null;
    insuredCustomers?: number | null;
    insuredAmount?: number | null;
    /** What the use is measured against: the insured amount, or (no cover) Priority's credit limit. */
    basis?: 'ביטוח אשראי' | 'מסגרת אשראי' | string | null;
    basisAmount?: number | null;
    creditLimit?: number | null;
    static?: CreditUse | null;
    dynamic?: CreditUse | null;
    afterDeposit?: CreditUse | null;
  } | null;
  breakdown?: ExposureGroup[];
  openRequest?: OpenCreditRequest | null;
  alerts?: CreditAlert[];
  asOfDate?: string;
  errors?: string[];
}

export const HIGH_USE_KIND = 'ניצול גבוה';
export const EXPIRY_KIND = 'פקיעה';
export const TRANSFER_KIND = 'העברה בבירור';
export const CHEQUE_TYPE = 'צ׳ק שלא הופקד';

/** The fixed order of the breakdown groups (the action already returns them in it). */
export const EXPOSURE_TYPES = ['חשבונית פתוחה', 'תעודת משלוח שלא חויבה', 'צ׳ק שלא הופקד', 'הזמנה פתוחה'] as const;

/** use.basis when the customer has no cover: the use is measured against Priority's credit limit. */
export const CREDIT_LIMIT_BASIS = 'מסגרת אשראי';

/** The אובליגו tab's search value, so היום links straight to it: /collections/customers/<code>?tab=credit. */
export const CREDIT_TAB = 'credit';

export function creditTabUrl(code: string): string {
  return `/collections/customers/${encodeURIComponent(code)}?tab=${CREDIT_TAB}`;
}

/** A percent with one decimal, as the action computes it ("87.5%"). */
export function formatPct1(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${(Math.round(value * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 })}%`;
}

export function isHigh(use?: CreditUse | null, threshold = 80): boolean {
  if (!use) return false;
  if (use.level) return use.level === 'גבוה';
  return (use.pct ?? 0) >= threshold;
}

/** "בעוד 14 ימים" / "היום" / "פג לפני 3 ימים". */
export function daysToExpiryLabel(days?: number | null): string {
  if (days === undefined || days === null) return '—';
  if (days === 0) return 'פוקע היום';
  if (days < 0) return `פג לפני ${Math.abs(days)} ימים`;
  return days === 1 ? 'בעוד יום אחד' : `בעוד ${days} ימים`;
}

export function isCreditExposure(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}