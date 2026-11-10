// What was PAID on a set of invoices since a moment (a promise's recordedAt): receipts only, never credit notes or
// any other drop in Priority's open amount. Used by the customer card's closing receipts (collections-closing-receipts.ts);
// the module name is historical (the old payment-promise engine that first used it was removed in wave 3).
//
// Two kinds of receipt count:
// - ours: ReceiptAllocations of our Receipts (מוכנה or הונפקה ב-Priority) on the invoice, written since the moment.
//   A receipt מוכנה is money the bookkeeper saw in the bank and split, not yet issued in Priority ("ready").
// - Priority's: Payments mirror rows dated since the moment whose matchedInvoiceNumbers include the invoice. One
//   receipt covering several invoices is spread over them oldest due date first, each up to its open amount (the
//   amount at promise time when known, else Priority's open amount, else the invoice amount); a receipt naming one
//   invoice goes to it in full. A Payments row that is the Priority copy of one of our receipts (its receiptNumber
//   is our Receipts.priorityReceiptNumber, or same bankLineId) is skipped, so it counts once.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { sortableTime, toIsraelDate } from './collections-dates.ts';
import { num, readWhereIn, round2, splitList, str } from './collections-data.ts';
import { isApprovedReceipt, isIssuedReceipt, RC_ISSUED, RC_READY } from './collections-invoice-layer.ts';

export interface PaidSources {
  /** the customers' Receipts (any status: also used to recognise Priority copies) */
  receipts: Item[];
  /** the customers' ReceiptAllocations */
  allocations: Item[];
  /** the customers' Payments mirror rows */
  payments: Item[];
  /** the customers' Invoices (due dates and open amounts for spreading) */
  invoices: Item[];
}

export interface PaidRequest {
  customerCode: string;
  invoiceNumbers: string[];
  /** ISO time (or date) from which payments count, e.g. the promise's recordedAt; null = every payment */
  since: string | null;
  /** payments dated after this day are ignored (the engine's clock); null = no limit */
  asOfDate?: string | null;
  /** invoice → its open amount at the moment (caps the spreading) */
  openAtPromise?: Map<string, number>;
}

export interface PaidEntry {
  invoiceNumber: string;
  amount: number;
  /** receiptKey for ours, P:<paymentRef> for a Priority receipt */
  ref: string;
  kind: 'ours' | 'priority';
  /** our receipt not yet issued in Priority (מוכנה) */
  ready: boolean;
  date: string | null;
  bankLineId: string | null;
  matchProposalId: string | null;
  /** our receipt's key (ours only) */
  receiptKey?: string | null;
  /** the Payments mirror row (Priority only) */
  paymentId?: string | null;
  paymentRef?: string | null;
  /** Priority's receipt number: Payments.receiptNumber, or our Receipts.priorityReceiptNumber once issued */
  priorityReceiptNumber?: string | null;
  method?: string | null;
  /** a Priority receipt naming several invoices, spread oldest due date first (the split is an estimate) */
  spread?: boolean;
}

export interface PaidResult {
  /** total paid on the invoices */
  total: number;
  /** invoice → paid on it */
  byInvoice: Map<string, number>;
  /** every receipt that counted, in date order */
  refs: string[];
  entries: PaidEntry[];
  /** the part from our receipts not yet issued in Priority */
  readyAmount: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const priorityRefOf = (p: Item) => `P:${str(p.paymentRef).trim() || str(p.receiptNumber).trim() || str(p.id)}`;

/** Paid on the requested invoices (pure). Rows of other customers are ignored. */
export function paidOnInvoices(req: PaidRequest, src: PaidSources): PaidResult {
  const code = str(req.customerCode);
  const wanted = new Set(req.invoiceNumbers.map((n) => str(n).trim()).filter(Boolean));
  const sinceRaw = str(req.since).trim();
  const sinceMs = sinceRaw && !DATE_RE.test(sinceRaw) ? sortableTime(sinceRaw) : 0;
  const sinceDate = sinceRaw ? toIsraelDate(sinceRaw) : null;
  const asOf = req.asOfDate ? str(req.asOfDate).slice(0, 10) : null;
  const sameCode = (r: Item) => !str(r.customerCode) || str(r.customerCode) === code;
  const notAfter = (d: string | null) => !asOf || !d || d <= asOf;

  const ourReceipts = src.receipts.filter(sameCode);
  const receiptByKey = new Map(ourReceipts.map((r) => [str(r.receiptKey).trim(), r]));
  const ourPriorityNumbers = new Set(ourReceipts.map((r) => str(r.priorityReceiptNumber).trim()).filter(Boolean));
  const ourBankLines = new Set(ourReceipts.map((r) => str(r.bankLineId).trim()).filter(Boolean));
  const invoiceByNo = new Map(src.invoices.filter(sameCode).map((i) => [str(i.invoiceNumber).trim(), i]));

  const entries: PaidEntry[] = [];

  // ours: allocations of receipts מוכנה / הונפקה ב-Priority
  for (const a of src.allocations) {
    if (!sameCode(a)) continue;
    const no = str(a.invoiceNumber).trim();
    if (!wanted.has(no)) continue;
    const key = str(a.receiptKey).trim();
    const r = receiptByKey.get(key);
    // the receipt's receiptStatus decides (a draft pays nothing); an allocation without its receipt row uses its own status
    if (r ? !isApprovedReceipt(r) : str(a.status) !== RC_READY && str(a.status) !== RC_ISSUED) continue;
    const ready = r ? !isIssuedReceipt(r) : str(a.status) === RC_READY;
    const amount = round2(num(a.amount));
    if (amount <= 0.005) continue;
    const ms = sortableTime(a.at) || sortableTime(r?.preparedAt);
    const date = toIsraelDate(a.at) ?? toIsraelDate(r?.preparedAt) ?? toIsraelDate(r?.valueDate);
    if (sinceMs && ms) {
      if (ms < sinceMs) continue;
    } else if (sinceDate && date && date < sinceDate) continue;
    if (!notAfter(date)) continue;
    entries.push({
      invoiceNumber: no,
      amount,
      ref: key || `RA:${str(a.id)}`,
      kind: 'ours',
      ready,
      date,
      bankLineId: str(a.bankLineId) || str(r?.bankLineId) || null,
      matchProposalId: str(r?.matchProposalId) || null,
      receiptKey: key || null,
      priorityReceiptNumber: str(r?.priorityReceiptNumber).trim() || null,
      method: null,
      spread: false,
    });
  }

  // Priority's: Payments mirror rows, spread oldest due date first
  const capLeft = new Map<string, number>();
  const capOf = (no: string) => {
    if (!capLeft.has(no)) {
      const atPromise = req.openAtPromise?.get(no);
      const inv = invoiceByNo.get(no);
      const cap =
        atPromise !== undefined && atPromise > 0.005
          ? atPromise
          : num(inv?.openAmount) > 0.005
            ? num(inv?.openAmount)
            : Math.max(0, num(inv?.amount));
      capLeft.set(no, round2(cap));
    }
    return capLeft.get(no)!;
  };
  const due = (no: string) => toIsraelDate(invoiceByNo.get(no)?.dueDate) ?? '9999-12-31';
  const payments = src.payments
    .filter(sameCode)
    .filter((p) => num(p.amount) > 0.005)
    .filter((p) => !(str(p.receiptNumber).trim() && ourPriorityNumbers.has(str(p.receiptNumber).trim())))
    .filter((p) => !(str(p.bankLineId).trim() && ourBankLines.has(str(p.bankLineId).trim())))
    .map((p) => ({ p, date: toIsraelDate(p.paymentDate) }))
    .filter((x) => (!sinceDate || (x.date !== null && x.date >= sinceDate)) && notAfter(x.date))
    .sort((a, b) => str(a.date).localeCompare(str(b.date)) || Number(a.p.id ?? 0) - Number(b.p.id ?? 0));
  for (const { p, date } of payments) {
    const matched = [...new Set(splitList(p.matchedInvoiceNumbers))];
    if (!matched.some((n) => wanted.has(n))) continue;
    const ref = priorityRefOf(p);
    const base = {
      ref,
      kind: 'priority' as const,
      ready: false,
      date,
      bankLineId: str(p.bankLineId) || null,
      matchProposalId: null,
      receiptKey: null,
      paymentId: str(p.id) || null,
      paymentRef: str(p.paymentRef).trim() || null,
      priorityReceiptNumber: str(p.receiptNumber).trim() || null,
      method: str(p.method) || null,
      spread: matched.length > 1,
    };
    if (matched.length === 1) {
      entries.push({ ...base, invoiceNumber: matched[0], amount: round2(num(p.amount)) });
      continue;
    }
    matched.sort((a, b) => due(a).localeCompare(due(b)) || a.localeCompare(b, undefined, { numeric: true }));
    let left = round2(num(p.amount));
    for (const no of matched) {
      if (left <= 0.005) break;
      const take = round2(Math.min(left, capOf(no)));
      if (take <= 0.005) continue;
      capLeft.set(no, round2(capOf(no) - take));
      left = round2(left - take);
      if (wanted.has(no)) entries.push({ ...base, invoiceNumber: no, amount: take });
    }
  }

  entries.sort((a, b) => str(a.date).localeCompare(str(b.date)));
  const byInvoice = new Map<string, number>();
  for (const no of wanted) byInvoice.set(no, 0);
  for (const e of entries) byInvoice.set(e.invoiceNumber, round2((byInvoice.get(e.invoiceNumber) ?? 0) + e.amount));
  return {
    total: round2(entries.reduce((s, e) => s + e.amount, 0)),
    byInvoice,
    refs: [...new Set(entries.map((e) => e.ref))],
    entries,
    readyAmount: round2(entries.filter((e) => e.ready).reduce((s, e) => s + e.amount, 0)),
  };
}

/** The paid sources of the given customers, in one round trip. */
export async function readPaidSources(client: BlocksClient, customerCodes: string[]): Promise<PaidSources> {
  const codes = [...new Set(customerCodes.filter(Boolean))];
  if (!codes.length) return { receipts: [], allocations: [], payments: [], invoices: [] };
  const [receipts, allocations, payments, invoices] = await Promise.all([
    readWhereIn(client, 'Receipts', 'customerCode', codes),
    readWhereIn(client, 'ReceiptAllocations', 'customerCode', codes),
    readWhereIn(client, 'Payments', 'customerCode', codes),
    readWhereIn(client, 'Invoices', 'customerCode', codes),
  ]);
  return { receipts, allocations, payments, invoices };
}

/** Reads the customer's sources and returns what was paid on the invoices since `since` (receipts only). */
export async function readPaidOnInvoices(client: BlocksClient, req: PaidRequest): Promise<PaidResult> {
  return paidOnInvoices(req, await readPaidSources(client, [req.customerCode]));
}
