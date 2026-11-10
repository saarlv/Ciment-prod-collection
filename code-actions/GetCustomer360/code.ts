import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf, sortableTime, toIsraelDate } from '../shared/collections-dates.ts';
import { buildOwnerMap, formatIls, num, numberSetting, numOrNull, ownerOf, readAll, readSettings, readWhereIn, round2, str } from '../shared/collections-data.ts';
import { buildWindow, computeAging, isDebtRow, isOpenCommitment, paidSeenPendingOf } from '../shared/collections-aging.ts';
import { computeInvoiceLayer, effectiveOpen, hasOpenAmount, LAYER_FIELDS, type PaymentSources } from '../shared/collections-invoice-layer.ts';
import { receiptView } from '../shared/collections-receipt-record.ts';
import { customerCoverage } from '../shared/collections-allocation.ts';
import { closingReceiptsByInvoice, invoiceClosingOf, invoicePaidOf } from '../shared/collections-closing-receipts.ts';
import { creditViewsFor, expiryAlertDaysOf, loadCreditSources, thresholdPctOf } from '../shared/collections-credit.ts';
import { isActiveNote, isCommitment, monthBalances, noteTypeLabel, OUT_OPEN } from '../shared/collections-notes.ts';

// Read only. Everything about one customer in one call, plus a merged timeline (newest first) and the
// customer's aging row from the same engine as BuildAgingReport. Every invoice carries the invoice layer
// (payment seen, open dispute, sub-status) computed live from the customer's receipts and MatchProposals with the
// shared code, so it is right even before the stored layer is refreshed; paid invoices are returned too.
// Since 26.10: the layer's payments come from our Receipts / ReceiptAllocations (approved matches without a receipt
// still count); receipts[] lists the customer's receipts (newest first) with the invoices each one closed, and
// every invoice carries paymentStatus, remainingAmount and receipts[] {receiptKey, amount (allocated to it),
// valueDate, status, priorityReceiptNumber, kind, source}.
// Since 27.10 the insurance / obligo fields are no longer on Customers: insured = the customer has a cover in
// CreditCovers (the card shows the אובליגו וביטוח tab, filled by GetCreditExposure), and kpis.insuranceUsePct is the
// dynamic use of the insured amount from the same shared code (null without a cover in תקף).
// Since 01.11 every closed invoice (isPaid) carries closingReceipts[] (ours + Priority's, the shared paid
// rule via collections-closing-receipts.ts), closedAt and closedWithoutReceipt; open invoices get [] / null / false.
// Every invoice, open or closed, also carries paidAmount + paidReceipts[] (same rule and shape) — the card's שולם column.
// Since plan 04.11 stage 2: customerNotes[] (the customer's CustomerNotes, newest first, with status / outcome /
// amountReceived / amountRemaining) and openMonths[] (per due month: openTotal and movementCount from OpenMovements,
// activeNotes) – read in the same first round, so the card stays at two rounds; the feed shows the notes too. Since
// wave 3 the old agingNotes / promises fields are gone (their tables were removed); kpis.openPromises counts the open
// commitments (CustomerNotes התחייבות לתשלום, active, not kept) and the aging row's notes are the CustomerNotes.
// Since plan 04.11 stage 6 (allocation): every receipt also carries covered[] {invoiceNumber, dueDate, amount, isPartial,
// openAfter} and stillOpen[] {invoiceNumber, dueDate, dueMonth, openAmount} + stillOpenTotal (the customer's open invoices
// it did not touch), and openInvoices[] lists the customer's open invoices now (OpenMovements minus every allocation) with
// the receipts that paid part of each – "שילמת על X, Y, Z ולא על א, ב, ג". Same rule as ProposeAllocation.
type TimelineItem = {
  at: string;
  kind: string;
  title: string;
  amount: number | null;
  status: string | null;
  relatedTable: string;
  relatedId: string;
};

const byNewest = (field: string) => (a: Item, b: Item) => sortableTime(b[field]) - sortableTime(a[field]);

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const customerCode = str(input?.customerCode).trim();
  if (!customerCode) return { error: 'חסר קוד לקוח (customerCode)', customer: null };
  const asOfDate = resolveAsOf(input?.asOfDate);

  const byCode = { column: 'customerCode', value: customerCode };
  // the credit view's reads (covers, adjustment sources, then exposure + the awaiting lines' proposals) run beside
  // round trips 1 and 2 and are awaited after them, so the card stays at two round trips
  const creditPromise = loadCreditSources(client, [customerCode]);
  // the customer may not exist: the credit reads then finish unobserved, never as an unhandled rejection
  creditPromise.catch(() => undefined);
  // round trip 1: every read keyed by the customer code, in parallel (existence is checked afterwards)
  const [
    customerRows,
    owners,
    dnByCode,
    contacts,
    invoices,
    payments,
    bankLines,
    matchProposals,
    disputes,
    approvals,
    creditRequests,
    inboundEmails,
    interactions,
    settings,
    receipts,
    receiptAllocations,
    customerNotes,
    openMovements,
  ] = await Promise.all([
    readAll(client, 'Customers', byCode),
    readAll(client, 'CustomerOwners', byCode),
    readAll(client, 'DeliveryNotes', byCode),
    readAll(client, 'CustomerContacts', byCode),
    readAll(client, 'Invoices', byCode),
    readAll(client, 'Payments', byCode),
    readAll(client, 'BankLines', byCode),
    readAll(client, 'MatchProposals', byCode),
    readAll(client, 'Disputes', byCode),
    readAll(client, 'Approvals', byCode),
    readAll(client, 'CreditLimitRequests', byCode),
    readAll(client, 'InboundEmails', byCode),
    readAll(client, 'Interactions', byCode),
    readSettings(client),
    readAll(client, 'Receipts', byCode),
    readAll(client, 'ReceiptAllocations', byCode),
    readAll(client, 'CustomerNotes', byCode),
    readAll(client, 'OpenMovements', byCode),
  ]);

  const customer = customerRows[0];
  if (!customer) return { error: `לקוח ${customerCode} לא נמצא`, customer: null };

  // round trip 2: delivery notes by the customer's invoice numbers (chunks in parallel), merged with
  // the ones carrying the customer code
  const invoiceNumbers = invoices.map((i) => str(i.invoiceNumber)).filter(Boolean);
  const dnById = new Map<string, Item>();
  for (const r of await readWhereIn(client, 'DeliveryNotes', 'invoiceNumber', invoiceNumbers)) dnById.set(str(r.id), r);
  for (const r of dnByCode) dnById.set(str(r.id), r);
  const deliveryNotes = [...dnById.values()];
  const creditSources = await creditPromise;

  const ownerMap = buildOwnerMap(owners);
  const bookkeeperName = ownerOf(customerCode, customer, ownerMap);

  // the invoice layer, live: payment seen (our receipts' allocations, approved / done matches)
  const paymentSources: PaymentSources = { proposals: matchProposals, receipts, allocations: receiptAllocations };
  const layers = computeInvoiceLayer(invoices, paymentSources);
  const receiptByKey = new Map(receipts.map((r) => [str(r.receiptKey), r]));
  const receiptsOfInvoice = (no: string) =>
    receiptAllocations
      .filter((a) => str(a.invoiceNumber).trim() === no && receiptByKey.has(str(a.receiptKey)))
      .map((a) => {
        const r = receiptByKey.get(str(a.receiptKey))!;
        return {
          receiptKey: str(a.receiptKey),
          amount: round2(num(a.amount)),
          valueDate: toIsraelDate(r.valueDate),
          receiptStatus: str(r.receiptStatus),
          matchStatus: str(r.matchStatus),
          priorityReceiptNumber: str(r.priorityReceiptNumber) || null,
          kind: str(a.kind) || null,
          source: str(a.source) || null,
        };
      })
      .sort((x, y) => sortableTime(y.valueDate) - sortableTime(x.valueDate));
  // the receipts that closed each invoice: the shared paid rule (ours + Priority's, a Priority copy counted once)
  const closingByInvoice = closingReceiptsByInvoice(customerCode, { receipts, allocations: receiptAllocations, payments, invoices }, asOfDate);
  const layered = invoices.map((inv): Item => {
    const l: Item = layers.get(str(inv.invoiceNumber).trim()) ?? {};
    const row: Item = { ...inv };
    for (const f of LAYER_FIELDS) if (f in l) row[f] = l[f];
    if (typeof l.paidPendingAmount === 'number') row.paidPendingAmount = l.paidPendingAmount;
    // openAmount null = no open-movement data: the invoice is neither open nor paid (openAmountKnown false,
    // remainingAmount / effectiveOpenAmount null) – it is never listed or scored as open debt
    const openAmountKnown = hasOpenAmount(inv);
    const effectiveOpenAmount = openAmountKnown ? effectiveOpen(row) : null;
    // paid in Priority, or paid by a match the app saw (the card shows שולם)
    const isPaid = str(inv.status) === 'שולמה' || (!!row.paymentState && effectiveOpenAmount !== null && effectiveOpenAmount <= 0.005);
    const isOpen = !isPaid && openAmountKnown;
    const no = str(inv.invoiceNumber).trim();
    const applied = closingByInvoice.get(no) ?? [];
    const closing = invoiceClosingOf(inv, isPaid, applied);
    const remainingAmount = openAmountKnown ? (row.remainingAmount ?? effectiveOpenAmount) : null;
    return { ...row, effectiveOpenAmount, remainingAmount, openAmountKnown, isOpen, isPaid, receipts: receiptsOfInvoice(no), ...invoicePaidOf(applied), ...closing };
  });

  const invoicesOut = layered
    .map((inv): Item => {
      const notes = deliveryNotes.filter((n) => str(n.invoiceNumber) === str(inv.invoiceNumber));
      const hasRows = notes.length > 0;
      const expected = numOrNull(inv.deliveryNotesExpected) ?? (hasRows ? notes.length : null);
      const scannedCount = hasRows ? notes.filter((n) => n.scanned === true).length : numOrNull(inv.deliveryNotesAttached);
      const dueDate = toIsraelDate(inv.dueDate);
      return {
        ...inv,
        scannedCount,
        expected,
        deliveryNotes: notes.sort((a, b) => str(a.noteNumber).localeCompare(str(b.noteNumber))),
        missingNoteNumbers: notes.filter((n) => n.scanned !== true).map((n) => str(n.noteNumber)),
        daysOverdue: dueDate && num(inv.effectiveOpenAmount) > 0 && dueDate < asOfDate
          ? Math.round((Date.parse(`${asOfDate}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000)
          : 0,
      };
    })
    .sort((a, b) => sortableTime(b.invoiceDate) - sortableTime(a.invoiceDate));

  // aging row (same rules as BuildAgingReport)
  const window = buildWindow(asOfDate, numberSetting(settings, 'agingMonthsBack', 3), 0);
  const aging =
    computeAging({
      window,
      customers: [customer],
      invoices,
      notes: customerNotes,
      contacts,
      matchProposals: paymentSources,
      receipts,
      ownerMap,
      customerCodes: [customerCode],
      includeZero: true,
    }).customers[0] ?? null;

  // KPIs (open amounts net of payments the app already saw; Priority's ledger still includes those)
  const debtRows = layered.filter(isDebtRow);
  const unknownOpenCount = layered.filter((i) => !i.openAmountKnown && !i.isPaid).length;
  const openSum = round2(debtRows.reduce((s, i) => s + effectiveOpen(i), 0));
  const overdue = round2(
    debtRows
      .filter((i) => effectiveOpen(i) > 0 && (toIsraelDate(i.dueDate) ?? '9999') < asOfDate)
      .reduce((s, i) => s + effectiveOpen(i), 0),
  );
  const paidSeenPending = round2(layered.reduce((s, i) => s + paidSeenPendingOf(i), 0));
  const ledgerRaw = numOrNull(customer.ledgerBalance);
  const ledger = ledgerRaw === null ? null : round2(ledgerRaw - paidSeenPending);
  const credit = creditViewsFor(creditSources, [customerCode], asOfDate, thresholdPctOf(settings), expiryAlertDaysOf(settings)).get(customerCode)!;
  const receiptDates = payments.map((p) => toIsraelDate(p.paymentDate)).filter(Boolean) as string[];
  const lastPaymentDate =
    toIsraelDate(customer.lastPaymentDate) ?? (receiptDates.length ? receiptDates.sort().at(-1)! : null);
  const kpis = {
    openBalance: ledger ?? openSum,
    overdue,
    /** open commitments: CustomerNotes התחייבות לתשלום, active, not kept yet */
    openPromises: customerNotes.filter(isOpenCommitment).length,
    insuranceUsePct: credit.cover?.status === 'תקף' ? credit.use.dynamic.pct : null,
    lastPaymentDate,
    /** payments the app saw (approved matches) that Priority's balance does not show yet */
    paidSeenPending,
    /** invoices without open-movement data (openAmount null): not open, not paid – not counted anywhere */
    unknownOpenCount,
    /** active commitments (CustomerNotes) not checked yet (outcome פתוחה) */
    openCommitments: customerNotes.filter((n) => isActiveNote(n) && isCommitment(n) && (str(n.outcome).trim() || OUT_OPEN) === OUT_OPEN).length,
  };

  // the customer's open months (OpenMovements) with the active notes of each
  const balances = monthBalances(openMovements);
  const months = new Set<string>([...balances.keys()].map((k) => k.split('|')[1]));
  for (const n of customerNotes) if (isActiveNote(n) && str(n.dueMonth).trim()) months.add(str(n.dueMonth).trim());
  const openMonths = [...months]
    .sort()
    .map((dueMonth) => {
      const b = balances.get(`${customerCode}|${dueMonth}`);
      return {
        dueMonth,
        openTotal: round2(b?.total ?? 0),
        movementCount: b?.count ?? 0,
        activeNotes: customerNotes.filter((n) => isActiveNote(n) && str(n.dueMonth).trim() === dueMonth).length,
      };
    });

  // stage 6: what each receipt covered and what is still open (OpenMovements invoices minus every allocation on them)
  const coverage = customerCoverage({ movements: openMovements, allocations: receiptAllocations, invoices });

  // timeline
  const tl: TimelineItem[] = [];
  const push = (at: unknown, kind: string, title: string, amount: unknown, status: unknown, relatedTable: string, id: unknown) => {
    if (!at) return;
    tl.push({
      at: String(at),
      kind,
      title,
      amount: numOrNull(amount),
      status: status === undefined || status === null ? null : String(status),
      relatedTable,
      relatedId: str(id),
    });
  };
  for (const i of invoices) {
    const credit = str(i.documentType) === 'חשבונית זיכוי';
    push(i.invoiceDate, 'חשבונית', `${credit ? 'חשבונית זיכוי' : 'חשבונית'} ${str(i.invoiceNumber)}`, i.amount, i.status, 'Invoices', i.id);
  }
  for (const p of payments) {
    push(p.paymentDate, 'קבלה', `קבלה ${str(p.receiptNumber) || str(p.paymentRef)} (${str(p.method)})`, p.amount, p.matchStatus, 'Payments', p.id);
  }
  for (const n of customerNotes) {
    const text = str(n.noteText).trim();
    push(n.noteCreatedAt, 'הערה', `הערה (${str(n.dueMonth)}) · ${noteTypeLabel(n)}${text ? `: ${text}` : ''}`, n.amount, str(n.outcome).trim() || n.status, 'CustomerNotes', n.id);
  }
  for (const x of interactions) {
    push(x.occurredAt, 'אינטראקציה', `${str(x.type)}: ${str(x.summary)}`, null, x.direction, 'Interactions', x.id);
  }
  for (const m of inboundEmails) {
    push(m.receivedAt, 'פנייה', `דואל נכנס: ${str(m.subject)}`, null, m.status, 'InboundEmails', m.id);
  }
  for (const d of disputes) {
    push(d.openedAt, 'מקרה', `${str(d.disputeType) || 'מקרה'} ${str(d.disputeNumber)}`.trim(), d.disputedAmount, d.status, 'Disputes', d.id);
  }
  for (const a of approvals) {
    push(a.draftedAt, 'אישור', `${str(a.kind)}: ${str(a.subject)}`, null, a.status, 'Approvals', a.id);
  }
  for (const c of creditRequests) {
    push(c.requestCreatedAt, 'ביטוח', `בקשת הגדלת מסגרת ל-${formatIls(num(c.requestedLimit))} ש״ח`, c.requestedLimit, c.status, 'CreditLimitRequests', c.id);
  }
  for (const r of receipts) {
    push(r.preparedAt ?? r.valueDate, 'קבלה', `קבלה ${str(r.receiptKey)}${str(r.priorityReceiptNumber) ? ` (Priority ${str(r.priorityReceiptNumber)})` : ''}`, r.amount, r.receiptStatus, 'Receipts', r.id);
  }
  for (const b of bankLines) {
    push(b.valueDate, 'שורת בנק', `${str(b.lineType) || 'שורת בנק'} ${str(b.bankLineId)} – ${str(b.payerName)}`, b.amount, b.status, 'BankLines', b.id);
  }
  tl.sort((a, b) => sortableTime(b.at) - sortableTime(a.at));

  return {
    customer,
    insured: credit.insured,
    bookkeeperName,
    contacts,
    invoices: invoicesOut,
    payments: payments.sort(byNewest('paymentDate')),
    receipts: receipts
      .map((r) => ({ ...receiptView(r, receiptAllocations), ...coverage.coverageOf(str(r.receiptKey)) }))
      .sort((a, b) => sortableTime(b.valueDate) - sortableTime(a.valueDate) || sortableTime(b.preparedAt) - sortableTime(a.preparedAt)),
    bankLines: bankLines.sort(byNewest('valueDate')),
    matchProposals: matchProposals.sort(byNewest('valueDate')),
    customerNotes: customerNotes.sort((a, b) => sortableTime(b.noteCreatedAt) - sortableTime(a.noteCreatedAt) || Number(b.id ?? 0) - Number(a.id ?? 0)),
    openMonths,
    openInvoices: coverage.openInvoices,
    disputes: disputes.sort(byNewest('openedAt')),
    approvals: approvals.sort(byNewest('draftedAt')),
    creditRequests: creditRequests.sort(byNewest('requestCreatedAt')),
    inboundEmails: inboundEmails.sort(byNewest('receivedAt')),
    interactions: interactions.sort(byNewest('occurredAt')),
    aging,
    kpis,
    timeline: tl,
    asOfDate,
  };
};
