// The receipts that closed each invoice (customer card, tab סגורות — since 01.11). Built on the promise engine's
// paid rule (collections-promise-paid.ts → paidOnInvoices), so the card and the engine count the same money:
// - ours: ReceiptAllocations of our Receipts (מוכנה / הונפקה ב-Priority) on the invoice;
// - Priority's: Payments mirror rows whose matchedInvoiceNumbers include the invoice; one receipt naming several
//   invoices is spread over them oldest due date first, each up to the invoice amount (isEstimate = true);
// - a Payments row that is the Priority copy of one of our receipts (receiptNumber = our priorityReceiptNumber, or
//   the same bankLineId) counts once, as ours.
// Receipts only: a credit note or a write-off never shows here. closedWithoutReceipt flags a closed invoice whose
// receipts do not cover its amount. Pure; reads nothing.
import type { Item } from './blocks/blocks-client.ts';
import { sortableTime, toIsraelDate } from './collections-dates.ts';
import { num, round2, str } from './collections-data.ts';
import { RS_APPROVED, RS_ISSUED } from './collections-invoice-layer.ts';
import { paidOnInvoices, type PaidSources } from './collections-promise-paid.ts';

export const SOURCE_OURS = 'שלנו';
export const SOURCE_PRIORITY = 'Priority';
/** Our receipts are one per bank transfer. */
const OUR_METHOD = 'העברה בנקאית';
const EPS = 0.01;

export interface ClosingReceipt {
  source: typeof SOURCE_OURS | typeof SOURCE_PRIORITY;
  /** our Receipts.receiptKey; null for a Priority receipt */
  receiptKey: string | null;
  priorityReceiptNumber: string | null;
  /** Priority only: Payments.paymentRef and the Payments row id */
  paymentRef: string | null;
  paymentId: string | null;
  bankLineId: string | null;
  /** the receipt's date: our Receipts.valueDate (else the allocation date); Priority's paymentDate */
  date: string | null;
  method: string | null;
  /** the part of the receipt applied to this invoice */
  amount: number;
  /** ours: the receipt's receiptStatus (אושרה – לא נשלחה / הונפקה ב-Priority); Priority's: הונפקה ב-Priority */
  status: string;
  /** ours: Receipts.receiptStatus (אושרה – לא נשלחה / הונפקה ב-Priority); null for a Priority receipt */
  receiptStatus?: string | null;
  /** a Priority receipt covering several invoices, spread oldest due date first */
  isEstimate: boolean;
}

export interface InvoiceClosing {
  closingReceipts: ClosingReceipt[];
  /** sum of closingReceipts.amount */
  closingReceiptsTotal: number;
  /** date of the last closing receipt, else the date Priority marked it done, else null */
  closedAt: string | null;
  /** closed, and the receipts do not cover its amount (credit note / write-off) */
  closedWithoutReceipt: boolean;
}

/** invoice number → the receipts that paid it (every invoice of the customer that has any). */
export function closingReceiptsByInvoice(customerCode: string, src: PaidSources, asOfDate: string | null): Map<string, ClosingReceipt[]> {
  const invoices = src.invoices.filter((i) => !str(i.customerCode) || str(i.customerCode) === customerCode);
  const numbers = [...new Set(invoices.map((i) => str(i.invoiceNumber).trim()).filter(Boolean))];
  // spread a Priority receipt up to the invoice AMOUNT (a closed invoice's open amount is 0)
  const cap = new Map<string, number>();
  for (const i of invoices) {
    const no = str(i.invoiceNumber).trim();
    if (no && num(i.amount) > 0) cap.set(no, round2(num(i.amount)));
  }
  const paid = paidOnInvoices({ customerCode, invoiceNumbers: numbers, since: null, asOfDate, openAtPromise: cap }, src);
  const receiptByKey = new Map(src.receipts.map((r) => [str(r.receiptKey).trim(), r]));

  const out = new Map<string, Map<string, ClosingReceipt>>();
  for (const e of paid.entries) {
    const ours = e.kind === 'ours';
    const r = ours ? receiptByKey.get(str(e.receiptKey)) : undefined;
    const row: ClosingReceipt = {
      source: ours ? SOURCE_OURS : SOURCE_PRIORITY,
      receiptKey: ours ? e.receiptKey ?? null : null,
      priorityReceiptNumber: e.priorityReceiptNumber ?? null,
      paymentRef: ours ? null : e.paymentRef ?? null,
      paymentId: ours ? null : e.paymentId ?? null,
      bankLineId: e.bankLineId,
      date: (ours ? toIsraelDate(r?.valueDate) : null) ?? e.date,
      method: ours ? OUR_METHOD : e.method ?? null,
      amount: e.amount,
      // ours: receiptStatus (a receipt outside the sources falls back to its allocation's state); Priority's: issued
      status: ours ? str(r?.receiptStatus) || (e.ready ? RS_APPROVED : RS_ISSUED) : RS_ISSUED,
      receiptStatus: ours ? str(r?.receiptStatus) || null : null,
      isEstimate: !!e.spread,
    };
    if (!out.has(e.invoiceNumber)) out.set(e.invoiceNumber, new Map());
    const perInvoice = out.get(e.invoiceNumber)!;
    // one row per receipt on an invoice (two allocations of one receipt to one invoice add up)
    const prev = perInvoice.get(e.ref);
    if (prev) prev.amount = round2(prev.amount + row.amount);
    else perInvoice.set(e.ref, row);
  }
  const result = new Map<string, ClosingReceipt[]>();
  for (const [no, m] of out) {
    result.set(no, [...m.values()].sort((a, b) => sortableTime(b.date) - sortableTime(a.date)));
  }
  return result;
}

/** The closing view of one invoice; isPaid = the card's closed flag. */
export function invoiceClosingOf(inv: Item, isPaid: boolean, receipts: ClosingReceipt[]): InvoiceClosing {
  const closingReceipts = isPaid ? receipts : [];
  const closingReceiptsTotal = round2(closingReceipts.reduce((s, r) => s + r.amount, 0));
  const dates = closingReceipts.map((r) => r.date).filter(Boolean) as string[];
  const closedAt = !isPaid ? null : dates.length ? dates.sort().at(-1)! : toIsraelDate(inv.paidPriorityDoneAt);
  const amount = round2(num(inv.amount));
  return {
    closingReceipts,
    closingReceiptsTotal,
    closedAt,
    closedWithoutReceipt: isPaid && amount > 0 && closingReceiptsTotal < amount - EPS,
  };
}

/** What was paid on one invoice, open or closed (the card's שולם column): the same receipts as closingReceipts. */
export function invoicePaidOf(receipts: ClosingReceipt[]): { paidAmount: number; paidReceipts: ClosingReceipt[] } {
  return { paidAmount: round2(receipts.reduce((s, r) => s + r.amount, 0)), paidReceipts: receipts };
}
