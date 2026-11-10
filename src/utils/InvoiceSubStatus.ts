/**
 * The one sub-status shown on an open invoice, by precedence בבירור > שולמה חלקית > פתוחה (Design 05, §6).
 * The invoice layer stores it in Invoices.subStatus; until a row has been recomputed (empty subStatus) the screen derives
 * it here by the same precedence. The paid amount is never part of it: it always shows on its own. Commitments are
 * CustomerNotes per customer and due month, not an invoice sub-status.
 */

export const INVOICE_SUB_STATUSES = ['בבירור', 'שולמה חלקית', 'פתוחה'] as const;
export type InvoiceSubStatus = (typeof INVOICE_SUB_STATUSES)[number];

export interface SubStatusInvoice {
  subStatus?: string | null;
  openDisputeId?: string | null;
  paidSeenAmount?: number | null;
}

export interface SubStatusContext {
  /** An open dispute (Disputes, not נסגרה) names the invoice. */
  hasOpenDispute?: boolean;
}

export function invoiceSubStatusOf(inv: SubStatusInvoice, ctx: SubStatusContext = {}): InvoiceSubStatus {
  const stored = (inv.subStatus ?? '').trim();
  if ((INVOICE_SUB_STATUSES as readonly string[]).includes(stored)) return stored as InvoiceSubStatus;
  if (inv.openDisputeId || ctx.hasOpenDispute) return 'בבירור';
  if ((inv.paidSeenAmount ?? 0) > 0) return 'שולמה חלקית';
  return 'פתוחה';
}

/** Comma-separated invoice numbers as a trimmed list. */
export function invoiceNumbersOf(list?: string | null): string[] {
  return (list ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
export interface OpenStateInvoice {
  isPaid?: boolean;
  isOpen?: boolean;
  openAmountKnown?: boolean;
  openAmount?: number | null;
}

/** Whether Priority's open movements gave the invoice an open amount (old payloads: openAmount present). */
export function openAmountKnownOf(inv: OpenStateInvoice): boolean {
  if (inv.openAmountKnown === false) return false;
  return inv.openAmount !== null && inv.openAmount !== undefined;
}

/** Open: GetCustomer360's isOpen when present, else not paid; never when the open amount is unknown. */
export function isInvoiceOpen(inv: OpenStateInvoice): boolean {
  if (!openAmountKnownOf(inv)) return false;
  return inv.isOpen !== undefined ? inv.isOpen === true : !inv.isPaid;
}

/** Closed: known open amount and not open. */
export function isInvoiceClosed(inv: OpenStateInvoice): boolean {
  return openAmountKnownOf(inv) && !isInvoiceOpen(inv);
}