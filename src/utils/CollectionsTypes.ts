import type { ApprovalsEntity, CustomerNotesEntity, DisputesEntity, InboundEmailsEntity, InteractionsEntity } from '@/product-types';
import type { ReceiptView } from '@/utils/ReceiptRecord';

/** A raw table row as an action returns it: the generated row plus its id. */
export type FeedRow<E extends { instanceType: object }> = E['instanceType'] & { id?: string };

/**
 * Typed shapes of the collections code actions' outputs. The generated product-types leave the nested
 * objects open (`{}`), so the screens read the action results through these interfaces instead.
 * Every field stays optional: the UI never assumes a value the action might omit.
 */

/** A CustomerNotes row as the aging report's cells carry it (notes are per customer and due month, never per invoice). */
export interface AgingNote {
  id?: string;
  monthKey?: string;
  monthLabel?: string;
  noteText?: string;
  authorName?: string;
  writtenAt?: string;
  noteSource?: string;
  /** Always null: a note is about the whole month. */
  invoiceNumber?: string | null;
  coveredInvoiceNumbers?: string[];
  /** CustomerNotes.noteType. */
  noteType?: string;
  actionDate?: string | null;
  noteAmount?: number | null;
  invoiceClosed?: boolean;
}

/** One open invoice of an aging cell, numbered 1..n by due date then invoice number. */
export interface AgingInvoice {
  index?: number;
  id?: string;
  /** "קבלה לא מותאמת" for the unallocated part of a receipt (a negative entry); else the document kind. */
  kind?: string | null;
  /** Invoice layer: what is left after our receipts' allocations. */
  remainingAmount?: number | null;
  /** Invoice layer: פתוחה / שולמה חלקית / שולמה. */
  paymentStatus?: string | null;
  receiptKeys?: string | null;
  /** On a "קבלה לא מותאמת" entry: the receipt it comes from. */
  receipt?: ReceiptView | null;
  invoiceNumber?: string;
  documentType?: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  amount?: number | null;
  /** Open amount net of the payments the app already saw (Priority's open minus paidSeenAmount). */
  openAmount?: number;
  /** The open amount as Priority has it. */
  priorityOpenAmount?: number | null;
  /** Invoice layer: נראה תשלום / נקלט ב-Priority; empty = no payment seen by the app. */
  paymentState?: string | null;
  /** Invoice layer: ILS of this invoice paid by approved receipt matches. */
  paidSeenAmount?: number | null;
  status?: string | null;
  sourceDocUrl?: string | null;
}

/** The customer's contact for collections (CustomerContacts, הנהלת חשבונות first, else Customers.apContact*). */
export interface AgingContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
}

/** An open commitment (CustomerNotes התחייבות לתשלום, active, not kept) as the aging cells carry it. */
export interface AgingPromise {
  id?: string;
  promisedAmount?: number;
  promisedDate?: string;
  checkOn?: string;
  status?: string;
  method?: string;
  invoiceNumbers?: string;
  recordedBy?: string;
  recordedAt?: string;
  closedAt?: string | null;
}

export interface AgingCell {
  monthKey?: string;
  label?: string;
  amount?: number;
  notes?: AgingNote[];
  promises?: AgingPromise[];
  invoiceNumbers?: string[];
  /** The cell's open invoices, numbered. */
  invoices?: AgingInvoice[];
  /** Whole-cell notes plus notes on invoices no longer open (invoiceClosed), newest first. */
  cellNotes?: AgingNote[];
}

export interface AgingLaterDebt extends AgingCell {
  byMonth?: AgingCell[];
}

export interface AgingCustomer {
  customerCode?: string;
  customerName?: string;
  /** Customers.priorityStatus (סטטוס): פעיל / זמני / חסום. */
  priorityStatus?: string | null;
  /** Customers.collectionNote (הערה לגבייה), e.g. "30 לחודש". */
  collectionNote?: string | null;
  /** Customers.paymentMethod (אמצעי תשלום). */
  paymentMethod?: string | null;
  /** Customers.paymentTermsLabel (תנאי תשלום), e.g. שוטף + 60. */
  paymentTermsLabel?: string | null;
  /** The unallocated parts of the customer's receipts, shown as negative entries. */
  unallocatedReceipts?: number | null;
  unallocatedPending?: number | null;
  contact?: AgingContact | null;
  bookkeeperName?: string;
  salesAgentName?: string;
  priorDebt?: AgingCell;
  months?: AgingCell[];
  laterDebt?: AgingLaterDebt;
  total?: number;
  ledgerBalance?: number;
  balanceDiff?: number;
  balanceMatches?: boolean;
  creditBalance?: boolean;
  /** Payments seen by approved matches that Priority has not recorded yet. */
  paidSeenPending?: number;
  openPromises?: AgingPromise[];
  isTestFixture?: boolean;
}

export interface AgingTotals {
  priorDebt?: number;
  months?: AgingCell[];
  laterDebt?: number;
  total?: number;
  openDebtTotal?: number;
  customers?: number;
  balanceMismatches?: number;
  creditBalanceCustomers?: number;
  paidSeenPending?: number;
  unallocatedReceipts?: number;
}

export interface AgingReport {
  asOfDate?: string;
  /** When the invoices were last pulled from Priority (newest Invoices.syncedAt, ISO); null when unknown. */
  dataAsOf?: string | null;
  window?: {
    monthsBack?: number;
    monthsForward?: number;
    monthKeys?: string[];
    firstMonth?: string;
    lastMonth?: string;
  };
  customers?: AgingCustomer[];
  totals?: AgingTotals;
}

export interface Customer360Card {
  customerCode?: string;
  customerName?: string;
  customerType?: string;
  priorityStatus?: string;
  paymentTermsLabel?: string;
  creditLimit?: number;
  salesAgentName?: string;
  salesAgentPhone?: string;
  collectionStage?: string;
  doNotContact?: boolean;
  ledgerBalance?: number;
  internalNotes?: string;
  paymentMethod?: string | null;
  collectionNote?: string | null;
}

export interface Customer360Contact {
  contactName?: string;
  email?: string;
  phone?: string;
  roleFlags?: string | string[];
}

export interface Customer360Invoice {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  openAmount?: number;
  status?: string;
  scannedCount?: number;
  expected?: number;
  missingNoteNumbers?: string[] | string;
  daysOverdue?: number;
  /** Invoice layer (computed live by GetCustomer360). */
  paymentState?: string | null;
  paidSeenAmount?: number | null;
  paidSeenAt?: string | null;
  paidSeenBankLineIds?: string | null;
  paidPriorityDoneAt?: string | null;
  /** Open amount net of payments seen. */
  effectiveOpenAmount?: number | null;
  /** Paid: by Priority, or by approved matches covering the whole open amount. */
  isPaid?: boolean;
  /** Open by Priority's open movements; absent on old payloads. */
  isOpen?: boolean;
  /** false while Priority has sent no open movement for the invoice (remainingAmount/effectiveOpenAmount are then null). */
  openAmountKnown?: boolean;
  paidPendingAmount?: number | null;
  /** Invoice layer: פתוחה / שולמה חלקית / שולמה, and what is left after our receipts. */
  paymentStatus?: string | null;
  remainingAmount?: number | null;
  /** Our layer (Design 05): one sub-status by precedence בבירור > שולמה חלקית > פתוחה; סגורה when nothing is open. */
  subStatus?: string | null;
  /** Our layer: the open dispute on the invoice (Disputes.id). */
  openDisputeId?: string | null;
  /** The receipts matched to this invoice; amount = the part allocated to it. */
  receipts?: Customer360InvoiceReceipt[];
  /** Closed invoices: the receipts that closed it, newest first (receipts only). */
  closingReceipts?: ClosingReceipt[];
  closingReceiptsTotal?: number | null;
  /** Every invoice, open or closed: ILS applied to it by receipts (ours and Priority's, the same rule as closingReceipts). */
  paidAmount?: number | null;
  /** Every invoice: the receipts that paid it, same shape as closingReceipts. */
  paidReceipts?: ClosingReceipt[];
  /** YYYY-MM-DD: the last closing receipt, else when Priority marked it paid; null when open. */
  closedAt?: string | null;
  /** Closed with less receipts than its amount (a credit note or a write-off). */
  closedWithoutReceipt?: boolean;
}

/** One receipt that closed an invoice; amount = the part applied to this invoice. */
export interface ClosingReceipt {
  source?: 'שלנו' | 'Priority' | string;
  /** Our receipt's key; null for a Priority receipt. */
  receiptKey?: string | null;
  priorityReceiptNumber?: string | null;
  paymentRef?: string | null;
  paymentId?: string | null;
  bankLineId?: string | null;
  date?: string | null;
  method?: string | null;
  amount?: number | null;
  /** Ours: the receipt's receiptStatus (and match state when sent), read through ReceiptStatusBadges. */
  receiptStatus?: string | null;
  matchStatus?: string | null;
  /** Ours: the same receiptStatus; Priority's: הונפקה ב-Priority. */
  status?: string | null;
  /** A Priority receipt over several invoices, spread oldest to newest. */
  isEstimate?: boolean;
}

export interface Customer360InvoiceReceipt {
  receiptKey?: string;
  amount?: number | null;
  valueDate?: string | null;
  /** Since r3 (cleanup): the receipt's two states; the old status is gone. */
  receiptStatus?: string | null;
  matchStatus?: string | null;
  priorityReceiptNumber?: string | null;
  kind?: string | null;
  source?: string | null;
}

export interface TimelineItem {
  at?: string;
  kind?: string;
  title?: string;
  amount?: number;
  status?: string;
  relatedTable?: string;
  relatedId?: string;
}

export interface Customer360Month {
  /** YYYY-MM */
  dueMonth?: string;
  openTotal?: number;
  movementCount?: number;
  activeNotes?: number;
}

export interface Customer360 {
  customer?: Customer360Card;
  /** The customer has a cover in CreditCovers: the card shows the אובליגו וביטוח tab. */
  insured?: boolean;
  bookkeeperName?: string;
  contacts?: Customer360Contact[];
  invoices?: Customer360Invoice[];
  aging?: AgingCustomer;
  kpis?: {
    openBalance?: number;
    overdue?: number;
    /** Invoices whose open amount is still unknown (no open movement from Priority). */
    unknownOpenCount?: number;
    /** The same count as openCommitments (kept for older readers). */
    openPromises?: number;
    /** Dynamic use of the insured amount (%), null without a cover in תקף. */
    insuranceUsePct?: number | null;
    lastPaymentDate?: string;
    paidSeenPending?: number;
    /** Active commitments (CustomerNotes) not checked yet (outcome פתוחה). */
    openCommitments?: number;
  };
  timeline?: TimelineItem[];
  /** The customer's CustomerNotes, newest first (plan 04.11): the feed, the commitments strip and the headline read these. */
  customerNotes?: FeedRow<typeof CustomerNotesEntity>[];
  /** Per due month: the open total and movement count (OpenMovements) and the active notes — the card's months table. */
  openMonths?: Customer360Month[];
  /** Raw rows behind the timeline, each newest first — the card's conversation feed reads these. */
  inboundEmails?: FeedRow<typeof InboundEmailsEntity>[];
  approvals?: FeedRow<typeof ApprovalsEntity>[];
  interactions?: FeedRow<typeof InteractionsEntity>[];
  disputes?: FeedRow<typeof DisputesEntity>[];
  /** The customer's receipts, newest first, each with the invoices it covered and what is still open. */
  receipts?: Customer360Receipt[];
  /** Design 01 §2ד: the open invoices (open movements), with what our allocations already took from each. */
  openInvoices?: Customer360OpenInvoice[];
  asOfDate?: string;
}

/** One invoice a receipt paid (its ReceiptAllocations row); openAfter = what is left on it after all allocations. */
export interface ReceiptCoveredInvoice {
  invoiceNumber?: string;
  dueDate?: string | null;
  amount?: number | null;
  isPartial?: boolean;
  openAfter?: number | null;
}

/** An invoice of the customer still open after the receipt's allocations. */
export interface ReceiptStillOpenInvoice {
  invoiceNumber?: string;
  dueDate?: string | null;
  dueMonth?: string | null;
  openAmount?: number | null;
}

/** A receipt on the customer card: "שילם על" (covered) and "לא שולם" (stillOpen). */
export interface Customer360Receipt extends ReceiptView {
  covered?: ReceiptCoveredInvoice[];
  stillOpen?: ReceiptStillOpenInvoice[];
  stillOpenTotal?: number | null;
}

/** An open invoice: openBalance = openInPriority minus every allocation of ours (receipts lists them). */
export interface Customer360OpenInvoice {
  invoiceNumber?: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  dueMonth?: string | null;
  invoiceAmount?: number | null;
  openInPriority?: number | null;
  allocated?: number | null;
  openBalance?: number | null;
  receipts?: { receiptKey?: string; amount?: number | null }[];
}

/** The cell of an aging row the user opened: a window month (YYYY-MM), the prior column or the later column. */
export type AgingCellKey = 'prior' | 'later' | string;

export function cellOf(customer: AgingCustomer, key: AgingCellKey): AgingCell | undefined {
  if (key === 'prior') return customer.priorDebt;
  if (key === 'later') return customer.laterDebt;
  return customer.months?.find((m) => m.monthKey === key);
}
/* ---------------------------------------------------------------------------------------------- */
/* Iteration 5: receipts, matching, imports and briefings                                          */
/* ---------------------------------------------------------------------------------------------- */

export interface BankLineRow {
  id?: string | null;
  bankLineId?: string;
  valueDate?: string;
  amount?: number;
  payerName?: string;
  reference?: string;
  lineType?: string;
  bankAccount?: string;
}

export interface ImportBatchRow {
  id?: string;
  fileName?: string;
  kind?: string;
  dataDate?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  rowsRead?: number;
  rowsWritten?: number;
  status?: string;
  errors?: string | null;
  isTestFixture?: boolean;
}

export interface ImportResult {
  dryRun?: boolean;
  kind?: string;
  fileName?: string;
  dataDate?: string;
  isTestFile?: boolean;
  expectedColumns?: string[];
  rowsRead?: number;
  toWrite?: BankLineRow[];
  skippedExisting?: BankLineRow[];
  rowErrors?: { row?: number; error?: string }[];
  importBatch?: ImportBatchRow | null;
  writeVerified?: boolean;
  errors?: string[];
}

/* ---------------------------------------------------------------------------------------------- */
/* Shape checks for results remembered in the browser (useActionQuery `validate`)                  */
/* ---------------------------------------------------------------------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const optArray = (v: unknown) => v === undefined || v === null || Array.isArray(v);
const optObj = (v: unknown) => v === undefined || v === null || isObj(v);

/** A GetCustomer360 result. Every invoice carries a numeric paidAmount (receipts only), so an older cached card is refetched. */
export function isCustomer360(v: unknown): boolean {
  return (
    isObj(v) &&
    (!Array.isArray(v.invoices) || v.invoices.every((inv) => isObj(inv) && typeof inv.paidAmount === 'number' && Number.isFinite(inv.paidAmount))) &&
    optObj(v.customer) &&
    optArray(v.contacts) &&
    optArray(v.invoices) &&
    optArray(v.customerNotes) &&
    optArray(v.timeline) &&
    optArray(v.receipts) &&
    optObj(v.aging) &&
    optObj(v.kpis)
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Iteration 6: inbox replies and the open-debts batch                                             */
/* ---------------------------------------------------------------------------------------------- */

/** DecideApproval result. */
export interface ApprovalDecisionResult {
  dryRun?: boolean;
  updated?: Record<string, unknown>[];
  skipped?: Record<string, unknown>[];
  writeVerified?: boolean;
  errors?: string[];
}

/* ---------------------------------------------------------------------------------------------- */
/* 25.10: the week brief (Today)                                                                   */
/* ---------------------------------------------------------------------------------------------- */

/** A GetWeekBrief result: the calendar week as the aging report sees it, and today's receipts. */
export function isWeekBrief(v: unknown): boolean {
  if (!isObj(v) || !optObj(v.week) || !optObj(v.aging) || !optObj(v.receipts)) return false;
  if (isObj(v.week) && !optArray(v.week.days)) return false;
  if (isObj(v.aging) && (!optArray(v.aging.items) || !optArray(v.aging.conclusions) || !optArray(v.aging.overdueNoNote))) return false;
  if (isObj(v.receipts) && !optArray(v.receipts.files)) return false;
  return true;
}