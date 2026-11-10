// Aging engine (pure). Shared by BuildAgingReport, GetCustomer360 and SeedTestFixtures' self-check,
// so every surface buckets debt and notes by the same rules. Notes are CustomerNotes rows (one customer + one due month,
// shared/collections-notes.ts); the old per-invoice aging notes and payment promises were removed in wave 3.
import type { Item } from './blocks/blocks-client.ts';
import { hebrewMonthLabel, isMonthKey, monthKeyOf, monthOffset, sortableTime, toIsraelDate } from './collections-dates.ts';
import { num, numOrNull, ownerOf, round2, str } from './collections-data.ts';
import { applyLiveLayer, effectiveOpen, hasOpenAmount, isApprovedNotIssued, isApprovedReceipt, type PaymentInput } from './collections-invoice-layer.ts';

export const PRIOR_KEY = 'חוב קודם';
export const LATER_KEY = 'חוב מאוחר';
export const DEBT_DOC_TYPES = new Set(['חשבונית', 'חשבונית זיכוי', '']);
// CustomerNotes enums (as in the artifact; kept local – collections-notes.ts imports this module through the pulls)
const NT_COMMITMENT = 'התחייבות לתשלום';
const NT_OTHER = 'אחר';
const ST_ACTIVE = 'פעילה';
const OUT_KEPT = 'קוימה';

export interface AgingWindow {
  asOfDate: string;
  monthsBack: number;
  monthsForward: number;
  monthKeys: string[];
  firstMonth: string;
  lastMonth: string;
}

export function buildWindow(asOfDate: string, monthsBack: number, monthsForward: number): AgingWindow {
  const back = Math.max(0, Math.floor(monthsBack));
  const fwd = Math.max(0, Math.floor(monthsForward));
  const monthKeys: string[] = [];
  for (let k = -back; k <= fwd; k++) monthKeys.push(monthOffset(asOfDate, k));
  return {
    asOfDate,
    monthsBack: back,
    monthsForward: fwd,
    monthKeys,
    firstMonth: monthKeys[0],
    lastMonth: monthKeys[monthKeys.length - 1],
  };
}

/** An invoice or credit note (empty documentType counts as an invoice). */
export const isDebtDoc = (inv: Item) => DEBT_DOC_TYPES.has(str(inv.documentType).trim());

/** Invoices and credit notes with a non-zero open amount in Priority (before payments the app already saw). */
export const isPriorityDebtRow = (inv: Item) => isDebtDoc(inv) && Math.abs(num(inv.openAmount)) >= 0.005;

/**
 * Invoices and credit notes still open net of the payment the app already saw (invoice layer): an invoice an
 * approved match pays in full is no longer a debt row.
 */
/** openAmount null (no open-movement data) is never debt: excluded, not counted as 0. */
export const isDebtRow = (inv: Item) => isDebtDoc(inv) && hasOpenAmount(inv) && Math.abs(effectiveOpen(inv)) >= 0.005;

/** Of a Priority-open debt row: the payment the app saw that Priority does not show yet (0 for credit notes). */
export const paidSeenPendingOf = (inv: Item) => (isPriorityDebtRow(inv) ? round2(Math.max(0, num(inv.openAmount) - effectiveOpen(inv))) : 0);

/** Month key used for bucketing a debt row: dueDate, else dueMonth, else invoiceDate. */
export function debtMonthOf(inv: Item): string | null {
  const due = toIsraelDate(inv.dueDate);
  if (due) return monthKeyOf(due);
  if (isMonthKey(str(inv.dueMonth))) return str(inv.dueMonth);
  const invDate = toIsraelDate(inv.invoiceDate);
  return invDate ? monthKeyOf(invDate) : null;
}

export type Bucket = { kind: 'prior' } | { kind: 'later'; monthKey: string | null } | { kind: 'month'; monthKey: string };

export function bucketOfMonth(monthKey: string | null, w: AgingWindow): Bucket {
  if (!monthKey) return { kind: 'prior' };
  if (monthKey < w.firstMonth) return { kind: 'prior' };
  if (monthKey > w.lastMonth) return { kind: 'later', monthKey };
  return { kind: 'month', monthKey };
}

export function bucketOfNote(monthKeyRaw: unknown, w: AgingWindow): Bucket {
  const key = str(monthKeyRaw).trim();
  if (key === PRIOR_KEY) return { kind: 'prior' };
  if (key === LATER_KEY) return { kind: 'later', monthKey: null };
  if (isMonthKey(key)) return bucketOfMonth(key, w);
  return { kind: 'prior' };
}

export const noteLabel = (monthKey: string) =>
  isMonthKey(monthKey) ? hebrewMonthLabel(monthKey) : monthKey || PRIOR_KEY;

/** kind of an aging entry that is not an invoice: the unallocated part of one of our receipts (על חשבון) */
export const UNALLOCATED_RECEIPT_KIND = 'קבלה לא מותאמת';
export const AP_ROLE = 'הנהלת חשבונות';

const textOrNull = (v: unknown): string | null => {
  const s = str(v).trim();
  return s || null;
};

/** Natural order for invoice numbers / contact keys (INV-2 before INV-10). */
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/**
 * A CustomerNotes row as every aging surface shows it. The old field names stay for the screens (monthKey = dueMonth,
 * writtenAt = noteCreatedAt, noteAmount = amount); a note is about the whole month, so invoiceNumber is always null.
 */
export const noteView = (n: Item) => {
  const type = str(n.noteType).trim() || NT_OTHER;
  const custom = textOrNull(n.customTypeLabel);
  return {
    id: n.id ?? null,
    monthKey: str(n.dueMonth),
    monthLabel: noteLabel(str(n.dueMonth)),
    dueMonth: str(n.dueMonth),
    noteText: str(n.noteText),
    authorName: str(n.authorName),
    writtenAt: n.noteCreatedAt ?? null,
    noteSource: n.noteSource ?? null,
    invoiceNumber: null,
    coveredInvoiceNumbers: [] as string[],
    noteType: type,
    customTypeLabel: custom,
    typeLabel: type === NT_OTHER && custom ? custom : type,
    actionDate: toIsraelDate(n.actionDate),
    reminderDate: toIsraelDate(n.reminderDate),
    noteAmount: numOrNull(n.amount),
    balanceAtNote: numOrNull(n.balanceAtNote),
    status: textOrNull(n.status),
    outcome: textOrNull(n.outcome),
    amountReceived: numOrNull(n.amountReceived),
    amountRemaining: numOrNull(n.amountRemaining),
    invoiceClosed: false,
  };
};

/** An active commitment that is not kept yet (התחייבות לתשלום, פעילה, outcome ≠ קוימה): what the cells mark as open. */
export const isOpenCommitment = (n: Item) => str(n.noteType).trim() === NT_COMMITMENT && str(n.status).trim() === ST_ACTIVE && str(n.outcome).trim() !== OUT_KEPT;

/** An open commitment as the cells and openPromises show it (the old promise fields, from the note). */
export const commitmentView = (n: Item) => {
  const amount = numOrNull(n.amount);
  return {
    id: n.id ?? null,
    noteId: n.id ?? null,
    promisedAmount: round2(amount !== null ? amount : Math.max(0, num(n.balanceAtNote))),
    promisedDate: toIsraelDate(n.actionDate),
    checkOn: toIsraelDate(n.actionDate),
    status: str(n.outcome).trim() || 'פתוחה',
    dueMonth: str(n.dueMonth),
    amountReceived: numOrNull(n.amountReceived),
    amountRemaining: numOrNull(n.amountRemaining),
    method: null,
    invoiceNumbers: '',
    recordedBy: str(n.authorName),
    recordedAt: n.noteCreatedAt ?? null,
  };
};

const byNewest = (a: Item, b: Item) => sortableTime(b.writtenAt) - sortableTime(a.writtenAt);

export interface AgingContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
}

/**
 * The customer's contact person for collections: a CustomerContacts row whose roleFlags contain
 * הנהלת חשבונות, else the first contact (by contactKey); else Customers.apContactName / Phone / Email;
 * else null. Contacts with no name, phone or email are skipped.
 */
export function contactFor(customer: Item | undefined, contacts: Item[]): AgingContact | null {
  const usable = contacts
    .filter((c) => textOrNull(c.contactName) || textOrNull(c.phone) || textOrNull(c.email))
    .sort((a, b) => naturalCompare(str(a.contactKey), str(b.contactKey)));
  const pick = usable.find((c) => str(c.roleFlags).includes(AP_ROLE)) ?? usable[0];
  if (pick) {
    return {
      name: textOrNull(pick.contactName),
      phone: textOrNull(pick.phone),
      email: textOrNull(pick.email),
      role: textOrNull(pick.roleFlags),
    };
  }
  const name = textOrNull(customer?.apContactName);
  const phone = textOrNull(customer?.apContactPhone);
  const email = textOrNull(customer?.apContactEmail);
  if (name || phone || email) return { name, phone, email, role: AP_ROLE };
  return null;
}

/** Latest syncedAt of the rows as an ISO datetime, or null when none carries one. */
export function latestSyncedAt(rows: Item[]): string | null {
  let best = 0;
  for (const r of rows) best = Math.max(best, sortableTime(r.syncedAt));
  return best > 0 ? new Date(best).toISOString() : null;
}

export interface AgingInvoice {
  index: number;
  /** the invoice number; for a קבלה לא מותאמת entry the receiptKey */
  invoiceNumber: string;
  /** stable id of the entry: the invoice number, or the receiptKey */
  id: string;
  /** חשבונית / חשבונית זיכוי / קבלה לא מותאמת */
  kind: string;
  documentType: string;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number | null;
  /** open amount net of the payment the app already saw */
  openAmount: number;
  /** Priority's own open amount */
  priorityOpenAmount: number;
  /** invoice layer: נראה תשלום / נקלט ב-Priority, or null */
  paymentState: string | null;
  paidSeenAmount: number | null;
  /** invoice layer: what is still open after our receipt allocations (= openAmount) */
  remainingAmount: number;
  /** invoice layer: פתוחה / שולמה חלקית / שולמה (a partly paid invoice stays in the report with its remainder) */
  paymentStatus: string | null;
  /** comma-separated Receipts.receiptKey allocated to it */
  receiptKeys: string | null;
  /** קבלה לא מותאמת only: the receipt behind the entry */
  receipt: Item | null;
  status: string | null;
  sourceDocUrl: string | null;
  /** always empty / null since wave 3: notes are per due month (the cell's notes / cellNotes), not per invoice */
  notes: Item[];
  latestNote: Item | null;
  promise: Item | null;
}

export interface AgingCellBody {
  amount: number;
  notes: Item[];
  promises: Item[];
  invoiceNumbers: string[];
  invoices: AgingInvoice[];
  cellNotes: Item[];
}

export interface AgingCell extends AgingCellBody {
  monthKey: string;
  label: string;
}

export interface AgingRow {
  customerCode: string;
  customerName: string;
  /** Customers.priorityStatus (סטטוס) */
  priorityStatus: string | null;
  /** Customers.collectionNote (הערה לגבייה) */
  collectionNote: string | null;
  /** Customers.paymentMethod (אמצעי תשלום) */
  paymentMethod: string | null;
  /** Customers.paymentTermsLabel (תנאי תשלום) */
  paymentTermsLabel: string | null;
  contact: AgingContact | null;
  bookkeeperName: string;
  salesAgentName: string;
  priorDebt: AgingCellBody;
  months: AgingCell[];
  laterDebt: AgingCellBody & { byMonth: AgingCell[] };
  total: number;
  ledgerBalance: number | null;
  balanceDiff: number | null;
  balanceMatches: boolean | null;
  creditBalance: boolean;
  /** payments seen by the app (approved matches) still netted out of the open amounts; Priority's ledger still includes them */
  paidSeenPending: number;
  /** unallocated parts of our receipts shown as negative entries (על חשבון), total as a positive number */
  unallocatedReceipts: number;
  /** of those, the part Priority's ledger does not show yet (receipt מוכנה, or issued after the last sync) */
  unallocatedPending: number;
  openPromises: Item[];
  isTestFixture: boolean;
}

export interface AgingInput {
  window: AgingWindow;
  customers: Item[];
  invoices: Item[];
  /**
   * CustomerNotes rows of the customers (any status): each sits in its dueMonth cell (a closed one only when the
   * customer is in the report anyway); open commitments also mark the cell (promises) and the customer (openPromises).
   */
  notes: Item[];
  /**
   * MatchProposals (approved / done) for the live invoice layer. When given, the payment the app saw is computed
   * from them; when omitted, the stored layer columns on the Invoices rows are used.
   */
  matchProposals?: PaymentInput;
  /**
   * Receipts (any status): those מוכנה / הונפקה ב-Priority with unallocatedAmount > 0 add a negative entry of kind
   * קבלה לא מותאמת at their valueDate month (never netted away).
   */
  receipts?: Item[];
  ownerMap: Map<string, string>;
  /** CustomerContacts rows (optional; without them the contact comes from Customers.apContact*). */
  contacts?: Item[];
  customerCodes?: string[];
  bookkeeperName?: string;
  includeZero?: boolean;
}

export function computeAging(input: AgingInput) {
  const { window: w, ownerMap } = input;
  const invoices = input.matchProposals ? applyLiveLayer(input.invoices, input.matchProposals) : input.invoices;
  const customersByCode = new Map<string, Item>();
  for (const c of input.customers) if (c.customerCode) customersByCode.set(str(c.customerCode), c);

  const codeFilter = input.customerCodes?.length ? new Set(input.customerCodes.map(String)) : null;
  const bkFilter = str(input.bookkeeperName).trim() || null;
  const inScope = (code: string) => !!code && (!codeFilter || codeFilter.has(code));

  type InvEntry = { inv: Item; no: string; sortKey: string; receipt?: Item };
  type Cell = { amount: number; notes: Item[]; promises: Item[]; invoiceNumbers: string[]; invoices: InvEntry[]; cellNotes: Item[] };
  const emptyCell = (): Cell => ({ amount: 0, notes: [], promises: [], invoiceNumbers: [], invoices: [], cellNotes: [] });
  type Acc = {
    code: string;
    name: string;
    salesAgent: string;
    prior: Cell;
    months: Map<string, Cell>;
    later: Cell;
    laterByMonth: Map<string, Cell>;
    hasDebt: boolean;
    hasNotes: boolean;
    paidSeenPending: number;
    unallocated: number;
    unallocatedPending: number;
    openPromises: Item[];
  };
  const accs = new Map<string, Acc>();
  const accOf = (code: string, fallbackName?: string, fallbackAgent?: string): Acc => {
    let a = accs.get(code);
    if (!a) {
      const c = customersByCode.get(code);
      a = {
        code,
        name: str(c?.customerName) || str(fallbackName),
        salesAgent: str(c?.salesAgentName) || str(fallbackAgent),
        prior: emptyCell(),
        months: new Map(w.monthKeys.map((k) => [k, emptyCell()])),
        later: emptyCell(),
        laterByMonth: new Map(),
        hasDebt: false,
        hasNotes: false,
        paidSeenPending: 0,
        unallocated: 0,
        unallocatedPending: 0,
        openPromises: [],
      };
      accs.set(code, a);
    }
    return a;
  };
  const cellOf = (a: Acc, b: Bucket): Cell => {
    if (b.kind === 'prior') return a.prior;
    if (b.kind === 'month') return a.months.get(b.monthKey)!;
    return a.later;
  };
  const laterMonthCell = (a: Acc, monthKey: string): Cell => {
    let c = a.laterByMonth.get(monthKey);
    if (!c) {
      c = emptyCell();
      a.laterByMonth.set(monthKey, c);
    }
    return c;
  };
  /** The bucket's cell plus, for a dated later bucket, its חוב מאוחר month cell. */
  const cellsOf = (a: Acc, b: Bucket): Cell[] =>
    b.kind === 'later' && b.monthKey ? [a.later, laterMonthCell(a, b.monthKey)] : [cellOf(a, b)];

  const lastSyncByCode = new Map<string, number>();
  for (const inv of invoices) {
    const code = str(inv.customerCode);
    if (!inScope(code)) continue;
    lastSyncByCode.set(code, Math.max(lastSyncByCode.get(code) ?? 0, sortableTime(inv.syncedAt)));
    // Priority's ledger still carries a payment the app saw first: remembered for the balance check
    const pending = paidSeenPendingOf(inv);
    if (pending > 0) {
      const acc = accOf(code, inv.customerName, inv.salesAgentName);
      acc.paidSeenPending = round2(acc.paidSeenPending + pending);
    }
    if (!isDebtRow(inv)) continue;
    const a = accOf(code, inv.customerName, inv.salesAgentName);
    const amt = effectiveOpen(inv);
    const month = debtMonthOf(inv);
    const b = bucketOfMonth(month, w);
    const no = str(inv.invoiceNumber).trim();
    const entry: InvEntry = { inv, no, sortKey: toIsraelDate(inv.dueDate) ?? month ?? '' };
    for (const cell of cellsOf(a, b)) {
      cell.amount += amt;
      cell.invoiceNumbers.push(str(inv.invoiceNumber));
      cell.invoices.push(entry);
    }
    a.hasDebt = true;
  }

  // the unallocated part of our receipts: a negative entry at the receipt's value date month (על חשבון). Priority's
  // ledger shows it only once the receipt is issued there and synced; until then it is "pending" for the check.
  for (const r of input.receipts ?? []) {
    const code = str(r.customerCode);
    const left = round2(num(r.unallocatedAmount));
    if (!inScope(code) || left <= 0.005 || !isApprovedReceipt(r)) continue;
    const a = accOf(code, r.customerName);
    const vd = toIsraelDate(r.valueDate) ?? toIsraelDate(r.preparedAt);
    const b = bucketOfMonth(vd ? monthKeyOf(vd) : null, w);
    const key = str(r.receiptKey);
    const entry: InvEntry = { inv: r, no: key, sortKey: vd ?? '', receipt: r };
    for (const cell of cellsOf(a, b)) {
      cell.amount -= left;
      cell.invoices.push(entry);
    }
    a.unallocated = round2(a.unallocated + left);
    const synced = lastSyncByCode.get(code) ?? 0;
    const issued = sortableTime(r.issuedAt);
    if (isApprovedNotIssued(r) || !synced || (issued > 0 && synced < issued)) a.unallocatedPending = round2(a.unallocatedPending + left);
    a.hasDebt = true;
  }

  // notes: every CustomerNotes row sits in the cell of its dueMonth (a note is about the whole month). A closed note
  // shows only where the customer is in the report anyway; an active one brings the customer in.
  for (const n of input.notes) {
    const code = str(n.customerCode);
    if (!inScope(code)) continue;
    const active = str(n.status).trim() === ST_ACTIVE;
    if (!active && !accs.has(code)) continue;
    const a = accOf(code, n.customerName);
    const b = bucketOfNote(n.dueMonth, w);
    const view = noteView(n);
    for (const cell of cellsOf(a, b)) {
      cell.notes.push(view);
      cell.cellNotes.push(view);
    }
    if (isOpenCommitment(n)) {
      const cv = commitmentView(n);
      for (const cell of cellsOf(a, b)) cell.promises.push(cv);
      a.openPromises.push(cv);
    }
    if (active) a.hasNotes = true;
  }

  if (input.includeZero) {
    for (const c of input.customers) {
      const code = str(c.customerCode);
      if (!code || (codeFilter && !codeFilter.has(code))) continue;
      accOf(code);
    }
  }

  const contactsByCode = new Map<string, Item[]>();
  for (const c of input.contacts ?? []) {
    const code = str(c.customerCode);
    if (!code) continue;
    if (!contactsByCode.has(code)) contactsByCode.set(code, []);
    contactsByCode.get(code)!.push(c);
  }

  const invoiceViews = (entries: InvEntry[]): AgingInvoice[] =>
    [...entries]
      .sort((x, y) => x.sortKey.localeCompare(y.sortKey) || naturalCompare(x.no, y.no))
      .map((e, i): AgingInvoice => {
        if (e.receipt) {
          const r = e.receipt;
          const left = -round2(num(r.unallocatedAmount));
          const vd = toIsraelDate(r.valueDate);
          return {
            index: i + 1,
            invoiceNumber: e.no,
            id: e.no,
            kind: UNALLOCATED_RECEIPT_KIND,
            documentType: UNALLOCATED_RECEIPT_KIND,
            invoiceDate: vd,
            dueDate: vd,
            amount: left,
            openAmount: left,
            priorityOpenAmount: 0,
            paymentState: null,
            paidSeenAmount: null,
            remainingAmount: left,
            paymentStatus: null,
            receiptKeys: e.no || null,
            receipt: {
              receiptKey: e.no,
              bankLineId: str(r.bankLineId) || null,
              amount: round2(num(r.amount)),
              allocatedAmount: round2(num(r.allocatedAmount)),
              unallocatedAmount: round2(num(r.unallocatedAmount)),
              receiptStatus: str(r.receiptStatus),
              matchStatus: str(r.matchStatus),
              valueDate: vd,
              payerName: textOrNull(r.payerName),
              reference: textOrNull(r.reference),
              priorityReceiptNumber: textOrNull(r.priorityReceiptNumber),
            },
            status: str(r.receiptStatus) || null,
            sourceDocUrl: null,
            notes: [],
            latestNote: null,
            promise: null,
          };
        }
        const open = round2(effectiveOpen(e.inv));
        const docType = str(e.inv.documentType).trim() || 'חשבונית';
        return {
          index: i + 1,
          invoiceNumber: str(e.inv.invoiceNumber),
          id: str(e.inv.invoiceNumber),
          kind: docType,
          documentType: docType,
          invoiceDate: toIsraelDate(e.inv.invoiceDate),
          dueDate: toIsraelDate(e.inv.dueDate),
          amount: numOrNull(e.inv.amount),
          openAmount: open,
          priorityOpenAmount: round2(num(e.inv.openAmount)),
          paymentState: textOrNull(e.inv.paymentState),
          paidSeenAmount: numOrNull(e.inv.paidSeenAmount),
          remainingAmount: open,
          paymentStatus: textOrNull(e.inv.paymentStatus),
          receiptKeys: textOrNull(e.inv.receiptKeys),
          receipt: null,
          status: textOrNull(e.inv.status),
          sourceDocUrl: textOrNull(e.inv.sourceDocUrl),
          notes: [],
          latestNote: null,
          promise: null,
        };
      });

  const rows: AgingRow[] = [];
  for (const a of accs.values()) {
    if (!input.includeZero && !a.hasDebt && !a.hasNotes) continue;
    const customer = customersByCode.get(a.code);
    const bookkeeperName = ownerOf(a.code, customer, ownerMap);
    if (bkFilter && bookkeeperName !== bkFilter) continue;

    const body = (c: Cell): AgingCellBody => {
      c.notes.sort(byNewest);
      c.cellNotes.sort(byNewest);
      c.promises.sort((x, y) => str(x.promisedDate).localeCompare(str(y.promisedDate)));
      return {
        amount: round2(c.amount),
        notes: c.notes,
        promises: c.promises,
        invoiceNumbers: c.invoiceNumbers,
        invoices: invoiceViews(c.invoices),
        cellNotes: c.cellNotes,
      };
    };
    const monthCell = (k: string, c: Cell): AgingCell => {
      const b = body(c);
      return {
        monthKey: k,
        label: hebrewMonthLabel(k),
        amount: b.amount,
        notes: b.notes,
        promises: b.promises,
        invoiceNumbers: b.invoiceNumbers,
        invoices: b.invoices,
        cellNotes: b.cellNotes,
      };
    };

    const months = w.monthKeys.map((k) => monthCell(k, a.months.get(k)!));
    const byMonth = [...a.laterByMonth.entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([k, c]) => monthCell(k, c));
    const priorDebt = body(a.prior);
    const laterDebt = { ...body(a.later), byMonth };

    const prior = priorDebt.amount;
    const later = laterDebt.amount;
    const total = round2(prior + months.reduce((s, m) => s + m.amount, 0) + later);
    const ledgerBalance = numOrNull(customer?.ledgerBalance);
    // Priority's ledger still includes payments the app saw first (net of them), and does not yet show the
    // unallocated part of a receipt not issued / not synced yet (net of that too)
    const balanceDiff = ledgerBalance === null ? null : round2(total - (ledgerBalance - a.paidSeenPending - a.unallocatedPending));
    rows.push({
      customerCode: a.code,
      customerName: a.name,
      priorityStatus: textOrNull(customer?.priorityStatus),
      collectionNote: textOrNull(customer?.collectionNote),
      paymentMethod: textOrNull(customer?.paymentMethod),
      paymentTermsLabel: textOrNull(customer?.paymentTermsLabel),
      contact: contactFor(customer, contactsByCode.get(a.code) ?? []),
      bookkeeperName,
      salesAgentName: a.salesAgent,
      priorDebt,
      months,
      laterDebt,
      total,
      ledgerBalance,
      balanceDiff,
      balanceMatches: balanceDiff === null ? null : Math.abs(balanceDiff) < 0.01,
      creditBalance: total < 0,
      paidSeenPending: a.paidSeenPending,
      unallocatedReceipts: a.unallocated,
      unallocatedPending: a.unallocatedPending,
      openPromises: a.openPromises,
      isTestFixture: false,
    });
  }

  rows.sort((x, y) => y.total - x.total || x.customerCode.localeCompare(y.customerCode));

  const totals = {
    priorDebt: round2(rows.reduce((s, r) => s + r.priorDebt.amount, 0)),
    months: w.monthKeys.map((k, i) => ({
      monthKey: k,
      label: hebrewMonthLabel(k),
      amount: round2(rows.reduce((s, r) => s + r.months[i].amount, 0)),
    })),
    laterDebt: round2(rows.reduce((s, r) => s + r.laterDebt.amount, 0)),
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
    // customers in credit balance are excluded from the open-debt figure
    openDebtTotal: round2(rows.filter((r) => !r.creditBalance).reduce((s, r) => s + r.total, 0)),
    customers: rows.length,
    paidSeenPending: round2(rows.reduce((s, r) => s + r.paidSeenPending, 0)),
    unallocatedReceipts: round2(rows.reduce((s, r) => s + r.unallocatedReceipts, 0)),
    balanceMismatches: rows.filter((r) => r.balanceMatches === false).length,
    creditBalanceCustomers: rows.filter((r) => r.creditBalance).length,
  };

  return { customers: rows, totals, dataAsOf: latestSyncedAt(invoices) };
}
