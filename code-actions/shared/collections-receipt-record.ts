// The receipts record helpers shared by IssueReceipt / the receipt PDF, ApplyAllocation, DecideMatchProposal (marking a
// receipt issued in Priority), GetReceiptRecord and GetCustomer360: the receipt key, the allocation kinds and sources,
// the customer's accounts-payable contact, the receipt view with its allocations and the text to copy into Priority.
// Nothing here writes; nothing is sent; nothing goes to Priority.
import type { Item } from './blocks/blocks-client.ts';
import { formatDateHe, toIsraelDate } from './collections-dates.ts';
import { formatIls, num, round2, str } from './collections-data.ts';
import { RC_ISSUED, RC_READY, RECEIPT_APPROVED_STATUSES, RS_APPROVED, RS_DRAFT, RS_ISSUED } from './collections-invoice-layer.ts';
import { naturalCompare } from './collections-aging.ts';

// ---------- enums (exactly as in the table artifacts) ----------
export { RC_ISSUED, RC_READY, RECEIPT_APPROVED_STATUSES, RS_APPROVED, RS_DRAFT, RS_ISSUED };

/** ReceiptAllocations.kind */
export const KIND_FULL = 'מלאה';
export const KIND_PARTIAL = 'חלקית';

/** ReceiptAllocations.source: סכום = ProposeAllocation (oldest first after the debt check), ידני = the allocation editor */
export const SRC_AMOUNT = 'סכום';
export const SRC_MANUAL = 'ידני';
export const ALLOCATION_SOURCES = [SRC_AMOUNT, SRC_MANUAL];

const EPS = 0.01;

/** One receipt per transfer. */
export const receiptKeyOf = (bankLineId: unknown) => `RCPT-${str(bankLineId).trim()}`;

// ---------- the AP contact ----------
export interface ApContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  /** isApContact = CustomerContacts row flagged isApContact; customer card = Customers.apContact* */
  source: 'isApContact' | 'customer card';
}

const isTrue = (v: unknown) => v === true || v === 'true';
const textOrNull = (v: unknown) => str(v).trim() || null;

/**
 * The customer's accounts-payable contact: the first CustomerContacts row of the customer
 * flagged isApContact (by contactKey), else Customers.apContactName / apContactEmail / apContactPhone; null when
 * neither has a name, email or phone.
 */
export function apContactOf(customer: Item | undefined | null, contacts: Item[]): ApContact | null {
  const code = str(customer?.customerCode);
  const flagged = contacts
    .filter((c) => (!code || str(c.customerCode) === code) && isTrue(c.isApContact))
    .filter((c) => textOrNull(c.contactName) || textOrNull(c.email) || textOrNull(c.phone))
    .sort((a, b) => naturalCompare(str(a.contactKey), str(b.contactKey)));
  const c = flagged[0];
  if (c) return { name: textOrNull(c.contactName), email: textOrNull(c.email), phone: textOrNull(c.phone), source: 'isApContact' };
  const name = textOrNull(customer?.apContactName);
  const email = textOrNull(customer?.apContactEmail);
  const phone = textOrNull(customer?.apContactPhone);
  if (name || email || phone) return { name, email, phone, source: 'customer card' };
  return null;
}

/** מלאה when the amount closes the invoice (≥ its open amount − 0.01), else חלקית. */
export const kindOf = (amount: number, openBefore: number) => (amount >= openBefore - EPS ? KIND_FULL : KIND_PARTIAL);

// ---------- receipts ----------
export interface ReceiptView {
  receiptKey: string;
  bankLineId: string;
  customerCode: string;
  customerName: string;
  payerName: string | null;
  reference: string | null;
  valueDate: string | null;
  amount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  receiptStatus: string;
  matchStatus: string;
  priorityReceiptNumber: string | null;
  preparedBy: string | null;
  preparedAt: string | null;
  issuedBy: string | null;
  issuedAt: string | null;
  matchProposalId: string | null;
  allocations: Item[];
}

/** A Receipts row with its allocations (sorted by due date), as every output shows it. */
export function receiptView(r: Item, allocations: Item[]): ReceiptView {
  const key = str(r.receiptKey);
  const own = allocations
    .filter((a) => str(a.receiptKey) === key)
    .sort((a, b) => str(toIsraelDate(a.dueDate)).localeCompare(str(toIsraelDate(b.dueDate))) || naturalCompare(str(a.invoiceNumber), str(b.invoiceNumber)))
    .map((a) => ({
      id: a.id ?? null,
      invoiceNumber: str(a.invoiceNumber),
      dueDate: toIsraelDate(a.dueDate),
      amount: round2(num(a.amount)),
      openBefore: round2(num(a.openBefore)),
      remainingAfter: round2(Math.max(0, num(a.openBefore) - num(a.amount))),
      kind: str(a.kind),
      source: str(a.source),
      sourceRef: str(a.sourceRef) || null,
      status: str(a.status),
    }));
  return {
    receiptKey: key,
    bankLineId: str(r.bankLineId),
    customerCode: str(r.customerCode),
    customerName: str(r.customerName),
    payerName: textOrNull(r.payerName),
    reference: textOrNull(r.reference),
    valueDate: toIsraelDate(r.valueDate),
    amount: round2(num(r.amount)),
    allocatedAmount: round2(num(r.allocatedAmount)),
    unallocatedAmount: round2(num(r.unallocatedAmount)),
    receiptStatus: str(r.receiptStatus),
    matchStatus: str(r.matchStatus),
    priorityReceiptNumber: textOrNull(r.priorityReceiptNumber),
    preparedBy: textOrNull(r.preparedBy),
    preparedAt: textOrNull(r.preparedAt),
    issuedBy: textOrNull(r.issuedBy),
    issuedAt: textOrNull(r.issuedAt),
    matchProposalId: textOrNull(r.matchProposalId),
    allocations: own,
  };
}

const ils = (n: number) => `₪${formatIls(n)}`;

/**
 * The text to copy into Priority for one receipt (Hebrew, one item per line):
 *   לקוח: <code> <name>
 *   סכום הקבלה: ₪<amount>
 *   תאריך ערך: dd.mm.yyyy
 *   אסמכתא: <reference>
 *   שם המעביר: <payer>
 *   חשבונית <no> – ₪<amount> (מלאה|חלקית, נשאר ₪<remaining>)   ← one line per invoice, by due date
 *   על חשבון ₪<unallocated>                                     ← only when part of the transfer is unallocated
 */
export function priorityInstructionOf(view: ReceiptView): string {
  const vd = view.valueDate;
  const lines = [
    `לקוח: ${[view.customerCode, view.customerName].filter(Boolean).join(' ')}`,
    `סכום הקבלה: ${ils(view.amount)}`,
    `תאריך ערך: ${vd ? formatDateHe(vd) : '—'}`,
    `אסמכתא: ${view.reference ?? '—'}`,
    `שם המעביר: ${view.payerName ?? '—'}`,
    ...view.allocations.map((a: Item) => `חשבונית ${str(a.invoiceNumber)} – ${ils(num(a.amount))} (${str(a.kind) || kindOf(num(a.amount), num(a.openBefore))}, נשאר ${ils(num(a.remainingAfter))})`),
  ];
  const left = round2(view.unallocatedAmount);
  if (left > 0.005) lines.push(`על חשבון ${ils(left)}`);
  return lines.join('\n');
}
