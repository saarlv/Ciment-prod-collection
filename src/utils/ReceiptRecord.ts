/**
 * A receipt's two states, read the same way everywhere a receipt is shown: its status (טיוטה / אושרה – לא נשלחה /
 * הונפקה ב-Priority) and its allocation state (פיזור מוצע – לאישור / על חשבון – צריך פיזור / מפוזרת / מפוזרת – עודף
 * על חשבון). Since 08.11 the receipt flow is one line: identification → receipt → debt check → allocation; any
 * other allocation value an older row may still carry reads as "על חשבון – צריך פיזור".
 */
import type { ReceiptsEntityMatchStatusEnum, ReceiptsEntityReceiptStatusEnum } from '@/product-types';

export interface ReceiptAllocationView {
  id?: string;
  invoiceNumber?: string;
  dueDate?: string | null;
  amount?: number | null;
  openBefore?: number | null;
  remainingAfter?: number | null;
  kind?: string | null;
  source?: string | null;
  sourceRef?: string | null;
  status?: string | null;
}

/** A receipt as the customer card (GetCustomer360) and the aging report hand it over. Every field optional. */
export interface ReceiptView {
  receiptKey?: string;
  bankLineId?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  payerName?: string | null;
  reference?: string | null;
  valueDate?: string | null;
  amount?: number | null;
  allocatedAmount?: number | null;
  unallocatedAmount?: number | null;
  /** Read through receiptStatusOf. */
  receiptStatus?: string | null;
  /** Read through matchStatusOf. */
  matchStatus?: string | null;
  priorityReceiptNumber?: string | null;
  preparedBy?: string | null;
  preparedAt?: string | null;
  issuedBy?: string | null;
  issuedAt?: string | null;
  matchProposalId?: string | null;
  allocations?: ReceiptAllocationView[];
}

export type ReceiptStatus = ReceiptsEntityReceiptStatusEnum;
export type MatchStatus = ReceiptsEntityMatchStatusEnum;

export const RECEIPT_DRAFT: ReceiptStatus = 'טיוטה – ממתינה לאישור';
export const RECEIPT_APPROVED: ReceiptStatus = 'אושרה – לא נשלחה';
export const RECEIPT_ISSUED: ReceiptStatus = 'הונפקה ב-Priority';

export const MATCH_PROPOSED_ALLOCATION: MatchStatus = 'פיזור מוצע – לאישור';
export const MATCH_NEEDS_ALLOCATION: MatchStatus = 'על חשבון – צריך פיזור';
export const MATCH_ALLOCATED: MatchStatus = 'מפוזרת';
export const MATCH_ALLOCATED_SURPLUS: MatchStatus = 'מפוזרת – עודף על חשבון';

const RECEIPT_STATUSES: string[] = [RECEIPT_DRAFT, RECEIPT_APPROVED, RECEIPT_ISSUED];
/** The allocation states of the new flow — the only ones the screens show. */
export const MATCH_STATUSES: MatchStatus[] = [MATCH_PROPOSED_ALLOCATION, MATCH_NEEDS_ALLOCATION, MATCH_ALLOCATED, MATCH_ALLOCATED_SURPLUS];

/** Anything that carries a receipt's statuses: a Receipts row, a Customer360 receipt. */
export interface ReceiptStatusSource {
  receiptStatus?: string | null;
  matchStatus?: string | null;
}

/** THE receipt status: receiptStatus when it is one of the three, else null. */
export function receiptStatusOf(r?: ReceiptStatusSource | null): ReceiptStatus | null {
  return r?.receiptStatus && RECEIPT_STATUSES.includes(r.receiptStatus) ? (r.receiptStatus as ReceiptStatus) : null;
}

/** The allocation state: one of the four; any other value an older row carries reads as "על חשבון – צריך פיזור". */
export function matchStatusOf(r?: ReceiptStatusSource | null): MatchStatus | null {
  const v = r?.matchStatus?.trim();
  if (!v) return null;
  return (MATCH_STATUSES as string[]).includes(v) ? (v as MatchStatus) : MATCH_NEEDS_ALLOCATION;
}

/** True once the receipt is approved (or issued in Priority). */
export function isApprovedReceipt(r?: ReceiptStatusSource | null): boolean {
  const s = receiptStatusOf(r);
  return s === RECEIPT_APPROVED || s === RECEIPT_ISSUED;
}