// The app layer on Invoices (columns the Priority sync never writes): the payment the app has already seen, the open
// dispute and the one sub-status. Shared by RefreshInvoiceLayer and by every action that writes a source
// (DecideMatchProposal, ResetReceiptsDay, SeedTestFixtures), and read live by the aging report, the customer card, the
// week brief, the receipts record and Nina's matching, so they all agree. Frozen since wave 3: the old aging-note and
// payment-promise parts (latestNote*, notesCount, openPromiseId) were removed with their tables – notes live in
// CustomerNotes (shared/collections-notes.ts).
//
// Payment sources (since 26.10): ReceiptAllocations of our Receipts (receipt מוכנה = נראה תשלום, הונפקה ב-Priority
// = נקלט ב-Priority with paidPriorityDoneAt = the receipt's issuedAt). Approved / done MatchProposals still count
// when no receipt of theirs is among the sources given (legacy matches approved before receipts existed, and
// callers that pass proposals only: DecideMatchProposal keeps a proposal's allocations equal to its receipt's).
//
// effectiveOpen = remainingAmount = Priority's openAmount minus the payment the app saw that Priority does not know
// yet: an allocation of a receipt not issued yet (נראה תשלום), or issued after the invoice's last sync. When
// Priority already shows the invoice reduced after the issue, remaining = openAmount. paymentStatus: פתוחה = nothing
// allocated; שולמה = remaining ≤ 0.005; else שולמה חלקית. Only the layer columns below are ever written. Nothing is
// written to Priority.
//
// Status fields: openDisputeId = the newest open Disputes row listing the invoice; subStatus = סגורה when nothing is
// left open, else בבירור > שולמה חלקית > פתוחה (הובטחה is no longer set: commitments are per customer + due month in
// CustomerNotes, not per invoice). The amount paid stays in paidSeenAmount.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';
import { sortableTime, toIsraelDate } from './collections-dates.ts';
import { errText, mapLimit, num, numOrNull, readAll, readByIds, readWhereIn, round2, splitList, str } from './collections-data.ts';

// ---------- enums (exactly as in the table artifacts) ----------
export const PS_SEEN = 'נראה תשלום';
export const PS_IN_PRIORITY = 'נקלט ב-Priority';
const MP_APPROVED = 'אושרה – לביצוע ב-Priority';
const MP_DONE = 'בוצעה ב-Priority';
/** MatchProposals statuses that mean "this receipt pays these invoices". */
export const PAYING_PROPOSAL_STATUSES = [MP_APPROVED, MP_DONE];
/** ReceiptAllocations.status (allocations only – a receipt's own state is receiptStatus) */
export const RC_READY = 'מוכנה';
export const RC_ISSUED = 'הונפקה ב-Priority';
/** ReceiptAllocations.status values that count as paid */
export const RECEIPT_STATUSES = [RC_READY, RC_ISSUED];
/** Receipts.receiptStatus – the receipt's single status (plan r3 stage 1). Every reader of a receipt's state reads this. */
export const RS_DRAFT = 'טיוטה – ממתינה לאישור';
export const RS_APPROVED = 'אושרה – לא נשלחה';
export const RS_ISSUED = 'הונפקה ב-Priority';
export const RECEIPT_STATUSES_R3 = [RS_DRAFT, RS_APPROVED, RS_ISSUED];
/** "Approved" for every downstream consumer (aging, invoice layer, closing receipts, promise paid, credit): a draft pays nothing. */
export const RECEIPT_APPROVED_STATUSES = [RS_APPROVED, RS_ISSUED];
export const receiptStatusOf = (r: Item | null | undefined): string => str(r?.receiptStatus).trim();
/** אושרה – לא נשלחה or הונפקה ב-Priority */
export const isApprovedReceipt = (r: Item | null | undefined) => RECEIPT_APPROVED_STATUSES.includes(receiptStatusOf(r));
export const isIssuedReceipt = (r: Item | null | undefined) => receiptStatusOf(r) === RS_ISSUED;
/** approved here and not yet issued in Priority */
export const isApprovedNotIssued = (r: Item | null | undefined) => receiptStatusOf(r) === RS_APPROVED;
/** Invoices.paymentStatus */
export const PAY_OPEN = 'פתוחה';
export const PAY_PARTIAL = 'שולמה חלקית';
export const PAY_PAID = 'שולמה';

export const PAYMENT_FIELDS = [
  'paymentState',
  'paidSeenAmount',
  'paidSeenAt',
  'paidSeenBankLineIds',
  'paidPriorityDoneAt',
  'paymentStatus',
  'remainingAmount',
  'receiptKeys',
] as const;
/** Our status layer: the open dispute and the one sub-status shown. */
export const STATUS_FIELDS = ['openDisputeId', 'subStatus'] as const;
export const LAYER_FIELDS = [...PAYMENT_FIELDS, ...STATUS_FIELDS] as const;
export type LayerField = (typeof LAYER_FIELDS)[number];

const NUMBER_FIELDS = new Set<string>(['paidSeenAmount', 'remainingAmount']);
const DATETIME_FIELDS = new Set<string>(['paidSeenAt', 'paidPriorityDoneAt']);

export interface PaymentLayer {
  paymentState: string | null;
  paidSeenAmount: number | null;
  paidSeenAt: string | null;
  paidSeenBankLineIds: string | null;
  paidPriorityDoneAt: string | null;
  paymentStatus: string | null;
  remainingAmount: number | null;
  receiptKeys: string | null;
}

export interface StatusLayer {
  openDisputeId: string | null;
  subStatus: string | null;
}

export type InvoiceLayer = PaymentLayer & StatusLayer;

// ---------- sub-status (Invoices.subStatus) ----------
export const SUB_OPEN = 'פתוחה';
export const SUB_PARTIAL = 'שולמה חלקית';
export const SUB_DISPUTE = 'בבירור';
export const SUB_CLOSED = 'סגורה';
/** Priority's invoice status for a partly paid invoice. */
const PRIORITY_PARTIAL = 'שולמה חלקית';
/** Disputes.status of a closed dispute (every other status is open). */
export const DISPUTE_CLOSED = 'נסגרה';
/** The sources of the status layer: the open disputes. */
export interface StatusSources {
  disputes: Item[];
}

/** invoice number → the open Disputes rows (status not נסגרה) that list it. */
export function openDisputesByInvoice(disputes: Item[]): Map<string, Item[]> {
  const out = new Map<string, Item[]>();
  for (const d of disputes) {
    if (str(d.status).trim() === DISPUTE_CLOSED) continue;
    for (const no of new Set(splitList(d.invoiceNumbers))) {
      if (!out.has(no)) out.set(no, []);
      out.get(no)!.push(d);
    }
  }
  return out;
}

/** The open dispute of an invoice: an open Disputes row listing it (the newest), else null. */
export function openDisputeIdOf(inv: Item, disputesOfInvoice: Item[] | undefined): string | null {
  const own = (disputesOfInvoice ?? []).filter((d) => sameCustomer(d.customerCode, inv.customerCode));
  if (own.length) {
    const newest = [...own].sort((a, b) => sortableTime(b.openedAt) - sortableTime(a.openedAt) || Number(b.id ?? 0) - Number(a.id ?? 0))[0];
    return str(newest.id) || null;
  }
  return null;
}

/**
 * The one sub-status shown: סגורה when nothing is left open, else by precedence בבירור > שולמה חלקית (payment seen,
 * or Priority says partly paid) > פתוחה. The amount paid stays in paidSeenAmount.
 */
export function subStatusOf(x: { remaining: number; disputeId: string | null; paidSeen: number; priorityStatus: string }): string {
  if (Math.abs(x.remaining) <= 0.005) return SUB_CLOSED;
  if (x.disputeId) return SUB_DISPUTE;
  if (x.paidSeen > 0.005 || x.priorityStatus === PRIORITY_PARTIAL) return SUB_PARTIAL;
  return SUB_OPEN;
}

/** What the shared code computes for one invoice: the stored fields plus two live-only values. */
export interface ComputedLayer extends Partial<InvoiceLayer> {
  /**
   * The part of paidSeenAmount Priority does not reflect yet (approved matches, and done ones marked after the
   * invoice's last sync). Present only when the payments were computed.
   */
  paidPendingAmount?: number;
}

const EMPTY_PAYMENT: PaymentLayer = {
  paymentState: null,
  paidSeenAmount: null,
  paidSeenAt: null,
  paidSeenBankLineIds: null,
  paidPriorityDoneAt: null,
  paymentStatus: null,
  remainingAmount: null,
  receiptKeys: null,
};
const EMPTY_STATUS: StatusLayer = { openDisputeId: null, subStatus: null };
const textOrNull = (v: unknown): string | null => str(v).trim() || null;
/**
 * Whether Priority's open amount is known for the invoice. openAmount is filled only from open-movement data; while it
 * is null the invoice is NOT open and NOT closed – it is unknown: the layer writes null for paymentStatus,
 * remainingAmount and subStatus, and no reader counts it as open debt or scores it.
 */
export const hasOpenAmount = (inv: Item | null | undefined): boolean => numOrNull(inv?.openAmount) !== null;
const sameCustomer = (a: unknown, b: unknown) => !str(a) || !str(b) || str(a) === str(b);
const isoOrNull = (ms: number): string | null => (ms > 0 ? new Date(ms).toISOString() : null);

function allocationLines(p: Item): Item[] {
  let raw: unknown = p?.allocations;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (Array.isArray(raw)) return raw;
  const lines = (raw as Item | null)?.lines;
  return Array.isArray(lines) ? lines : [];
}

/**
 * How much of a match goes to each invoice: its allocations when present, else the match amount split over
 * its invoiceNumbers by open amount, oldest due date first (the last invoice takes any remainder).
 */
export function proposalAllocations(p: Item, invoiceByNo: Map<string, Item>): { invoiceNumber: string; amount: number }[] {
  const lines = allocationLines(p)
    .map((l) => ({ invoiceNumber: str(l?.invoiceNumber).trim(), amount: round2(num(l?.amount)) }))
    .filter((l) => l.invoiceNumber && Math.abs(l.amount) >= 0.005);
  if (lines.length) return lines;
  const nos = [...new Set(splitList(p?.invoiceNumbers))];
  if (!nos.length) return [];
  const due = (no: string) => toIsraelDate(invoiceByNo.get(no)?.dueDate) ?? '9999-12-31';
  nos.sort((a, b) => due(a).localeCompare(due(b)) || a.localeCompare(b, undefined, { numeric: true }));
  let left = round2(Math.abs(num(p?.amount)));
  const out: { invoiceNumber: string; amount: number }[] = [];
  nos.forEach((no, i) => {
    if (left <= 0.005) return;
    const inv = invoiceByNo.get(no);
    const cap = num(inv?.openAmount) > 0 ? num(inv?.openAmount) : Math.max(0, num(inv?.amount));
    const take = i === nos.length - 1 ? left : round2(Math.min(left, cap));
    if (take <= 0.005) return;
    out.push({ invoiceNumber: no, amount: take });
    left = round2(left - take);
  });
  return out;
}


/**
 * The payment sources of the layer: our receipts and their allocations, plus MatchProposals (approved / done ones
 * pay invoices when none of the given receipts is theirs). A bare array is MatchProposals only.
 */
export interface PaymentSources {
  proposals: Item[];
  receipts?: Item[];
  allocations?: Item[];
}
export type PaymentInput = Item[] | PaymentSources | null | undefined;

export function toPaymentSources(src: PaymentInput): PaymentSources | null {
  if (!src) return null;
  if (Array.isArray(src)) return { proposals: src, receipts: [], allocations: [] };
  return { proposals: src.proposals ?? [], receipts: src.receipts ?? [], allocations: src.allocations ?? [] };
}

/** One payment of one invoice, from a receipt allocation or from a legacy match. */
export interface PaymentEntry {
  invoiceNumber: string;
  customerCode: string;
  amount: number;
  /** issued in Priority (receipt הונפקה ב-Priority / match בוצעה ב-Priority) */
  done: boolean;
  /** when it was marked issued / done (0 = unknown) */
  doneMs: number;
  /** when the person approved it */
  seenMs: number;
  bankLineId: string;
  /** Receipts.receiptKey, or null for a legacy match */
  receiptKey: string | null;
}

/**
 * Every payment entry of the sources: one per allocation of a receipt מוכנה / הונפקה ב-Priority (status from the
 * receipt row when given, else the allocation's own), then the approved / done matches whose receiptKey is not
 * among the given receipts / allocations (legacy matches; callers that loaded proposals only).
 */
export function paymentEntries(sources: PaymentSources, invoiceByNo: Map<string, Item>): PaymentEntry[] {
  const receipts = sources.receipts ?? [];
  const allocations = sources.allocations ?? [];
  const receiptByKey = new Map(receipts.map((r) => [str(r.receiptKey).trim(), r]));
  const covered = new Set([...receiptByKey.keys(), ...allocations.map((a) => str(a.receiptKey).trim())].filter(Boolean));
  const out: PaymentEntry[] = [];
  for (const a of allocations) {
    const key = str(a.receiptKey).trim();
    const r = receiptByKey.get(key);
    // the receipt row decides (receiptStatus: a draft pays nothing); an allocation without its receipt row uses its own status
    if (r ? !isApprovedReceipt(r) : !RECEIPT_STATUSES.includes(str(a.status))) continue;
    const no = str(a.invoiceNumber).trim();
    const amount = round2(num(a.amount));
    if (!no || Math.abs(amount) < 0.005) continue;
    const done = r ? isIssuedReceipt(r) : str(a.status) === RC_ISSUED;
    out.push({
      invoiceNumber: no,
      customerCode: str(a.customerCode) || str(r?.customerCode),
      amount,
      done,
      doneMs: done ? sortableTime(r?.issuedAt) : 0,
      seenMs: sortableTime(r?.preparedAt) || sortableTime(a.at),
      bankLineId: str(a.bankLineId) || str(r?.bankLineId),
      receiptKey: key || null,
    });
  }
  for (const p of sources.proposals) {
    if (!PAYING_PROPOSAL_STATUSES.includes(str(p.status))) continue;
    const key = str(p.receiptKey).trim();
    if (key && covered.has(key)) continue;
    const done = str(p.status) === MP_DONE;
    const pDone = sortableTime(p.priorityDoneAt);
    for (const a of proposalAllocations(p, invoiceByNo)) {
      out.push({
        invoiceNumber: a.invoiceNumber,
        customerCode: str(p.customerCode),
        amount: a.amount,
        done,
        doneMs: done ? pDone : 0,
        seenMs: sortableTime(p.decidedAt) || pDone || sortableTime(p.proposedAt),
        bankLineId: str(p.bankLineId),
        receiptKey: null,
      });
    }
  }
  return out;
}

/** paymentStatus from Priority's open amount, what is still open after our allocations, and whether any exist. */
export function paymentStatusOf(open: number, remaining: number, paid: number): string {
  if (open < -0.005) return PAY_OPEN; // a credit note still open
  if (remaining <= 0.005) return PAY_PAID;
  return paid > 0.005 ? PAY_PARTIAL : PAY_OPEN;
}

/**
 * The layer of every invoice, keyed by invoice number. `payments` null → payment fields not computed (so a caller
 * that loaded no payments never blanks them). `payments` is MatchProposals (array) or PaymentSources (receipts +
 * allocations + proposals). Matches and receipts of other statuses are ignored; payments of another customer never
 * count. `status` null → the status fields (openDisputeId, subStatus) are not computed; when given they use the
 * payment fields computed here, or the row's stored ones when payments were not computed.
 */
export function computeInvoiceLayer(
  invoices: Item[],
  payments: PaymentInput,
  status: StatusSources | null = null,
): Map<string, ComputedLayer> {
  const byNo = new Map<string, Item>();
  for (const inv of invoices) {
    const no = str(inv.invoiceNumber).trim();
    if (no && !byNo.has(no)) byNo.set(no, inv);
  }
  const out = new Map<string, ComputedLayer>();
  for (const no of byNo.keys()) out.set(no, {});

  const sources = toPaymentSources(payments);
  if (sources) {
    const pays = new Map<string, PaymentEntry[]>();
    for (const e of paymentEntries(sources, byNo)) {
      const inv = byNo.get(e.invoiceNumber);
      if (!inv || !sameCustomer(e.customerCode, inv.customerCode)) continue;
      if (!pays.has(e.invoiceNumber)) pays.set(e.invoiceNumber, []);
      pays.get(e.invoiceNumber)!.push(e);
    }
    for (const [no, inv] of byNo) {
      const list = pays.get(no) ?? [];
      const layer = out.get(no)!;
      const open = round2(num(inv.openAmount));
      const known = hasOpenAmount(inv);
      if (!list.length) {
        if (!known) {
          // no open-movement data: nothing is known to be open or paid
          Object.assign(layer, EMPTY_PAYMENT, { paidPendingAmount: 0 });
          continue;
        }
        Object.assign(layer, EMPTY_PAYMENT, { paymentStatus: paymentStatusOf(open, open, 0), remainingAmount: open, paidPendingAmount: 0 });
        continue;
      }
      const synced = sortableTime(inv.syncedAt);
      let paid = 0;
      let pending = 0;
      let seenMs = 0;
      let doneMs = 0;
      let allDone = true;
      const lineIds: string[] = [];
      const keys: string[] = [];
      for (const e of list) {
        paid += e.amount;
        if (e.done) doneMs = Math.max(doneMs, e.doneMs);
        else allDone = false;
        // applied while Priority has not caught up: not issued yet, or issued after the invoice's last sync
        if (!e.done || !synced || (e.doneMs > 0 && synced < e.doneMs)) pending += e.amount;
        seenMs = Math.max(seenMs, e.seenMs || e.doneMs);
        if (e.bankLineId && !lineIds.includes(e.bankLineId)) lineIds.push(e.bankLineId);
        if (e.receiptKey && !keys.includes(e.receiptKey)) keys.push(e.receiptKey);
      }
      pending = round2(pending);
      const remaining = open > 0 ? round2(Math.max(0, open - (pending > 0.005 ? pending : 0))) : open;
      Object.assign(layer, {
        paymentState: allDone ? PS_IN_PRIORITY : PS_SEEN,
        paidSeenAmount: round2(paid),
        paidSeenAt: isoOrNull(seenMs),
        paidSeenBankLineIds: lineIds.join(',') || null,
        paidPriorityDoneAt: isoOrNull(doneMs),
        // the payment seen is a fact; what is left open is unknown without Priority's open amount
        paymentStatus: known ? paymentStatusOf(open, remaining, paid) : null,
        remainingAmount: known ? remaining : null,
        receiptKeys: keys.join(',') || null,
        paidPendingAmount: pending,
      });
    }
  }

  if (status) {
    const disputesOf = openDisputesByInvoice(status.disputes);
    for (const [no, inv] of byNo) {
      const layer = out.get(no)!;
      const merged: Item = { ...inv, ...layer };
      const openDisputeId = openDisputeIdOf(inv, disputesOf.get(no));
      if (!hasOpenAmount(inv)) {
        // unknown open amount → no sub-status (never פתוחה / סגורה by default)
        Object.assign(layer, { openDisputeId, subStatus: null });
        continue;
      }
      const remaining = numOrNull(merged.remainingAmount) ?? effectiveOpen(merged);
      Object.assign(layer, {
        openDisputeId,
        subStatus: subStatusOf({ remaining, disputeId: openDisputeId, paidSeen: num(merged.paidSeenAmount), priorityStatus: str(inv.status).trim() }),
      });
    }
  }
  return out;
}

/** Payment the app saw that Priority does not reflect yet, from the stored layer columns of one row. */
function storedPending(inv: Item): number {
  const paid = num(inv.paidSeenAmount);
  if (paid <= 0) return 0;
  const state = str(inv.paymentState);
  if (state === PS_SEEN) return paid;
  if (state === PS_IN_PRIORITY) {
    const synced = sortableTime(inv.syncedAt);
    const done = sortableTime(inv.paidPriorityDoneAt);
    return !synced || (done > 0 && synced < done) ? paid : 0;
  }
  return 0;
}

/**
 * Open amount net of the payment the app already saw. Credit notes and zero rows are returned as they are;
 * a positive invoice is floored at 0. Uses the live paidPendingAmount when the row carries one (withLayer),
 * else the stored layer columns.
 */
export function effectiveOpen(inv: Item): number {
  const open = round2(num(inv?.openAmount));
  if (open <= 0) return open;
  const pending = typeof inv.paidPendingAmount === 'number' ? inv.paidPendingAmount : storedPending(inv);
  return pending > 0.005 ? round2(Math.max(0, open - pending)) : open;
}

/** The invoice row with its computed layer merged in (only the parts that were computed) and effectiveOpenAmount. */
export function withLayer(inv: Item, layer: ComputedLayer | undefined): Item {
  const merged: Item = { ...inv };
  if (layer) {
    for (const f of LAYER_FIELDS) if (f in layer) merged[f] = (layer as Item)[f];
    if (typeof layer.paidPendingAmount === 'number') merged.paidPendingAmount = layer.paidPendingAmount;
  }
  merged.effectiveOpenAmount = effectiveOpen(merged);
  return merged;
}

/** Every invoice with the live layer applied (see computeInvoiceLayer for the null rules). */
export function applyLiveLayer(invoices: Item[], payments: PaymentInput): Item[] {
  if (!payments) return invoices.map((i) => withLayer(i, undefined));
  const layers = computeInvoiceLayer(invoices, payments);
  return invoices.map((i) => withLayer(i, layers.get(str(i.invoiceNumber).trim())));
}

/** How far back done-in-Priority matches are read for a live layer: older ones are in Priority's own open amount. */
export const DONE_MATCH_LOOKBACK_DAYS = 45;

/**
 * The matches that pay invoices, for a live layer: every approved one, and the ones marked done in the last
 * DONE_MATCH_LOOKBACK_DAYS days (Priority may not show those yet). `where` narrows both (e.g. by customer).
 */
export async function readPayingProposals(client: BlocksClient, where?: WhereClause): Promise<Item[]> {
  const since = new Date(Date.now() - DONE_MATCH_LOOKBACK_DAYS * 86_400_000).toISOString();
  const scoped = (c: WhereClause): WhereClause => (where ? { and: [c, where] } : c);
  const [approved, done] = await Promise.all([
    readAll(client, 'MatchProposals', scoped({ column: 'status', value: MP_APPROVED })),
    readAll(client, 'MatchProposals', scoped({ and: [{ column: 'status', value: MP_DONE }, { column: 'priorityDoneAt', operator: '>=', value: since }] })),
  ]);
  return [...approved, ...done];
}

/** How far back the allocations of issued receipts are read for a live layer (they are written at approval). */
const ISSUED_ALLOCATION_LOOKBACK_DAYS = DONE_MATCH_LOOKBACK_DAYS + 180;

/**
 * Everything that pays invoices, for a live layer, in ONE round trip (all reads in parallel): the paying matches
 * (readPayingProposals), every receipt אושרה – לא נשלחה and the ones issued in the last DONE_MATCH_LOOKBACK_DAYS days, and
 * their allocations (מוכנה, and הונפקה written in the last ISSUED_ALLOCATION_LOOKBACK_DAYS days; an allocation
 * whose receipt is not among the receipts read is used with its own status). `where` narrows every read (e.g.
 * by customerCode; Receipts and ReceiptAllocations carry customerCode too).
 */
export async function readPaymentSources(client: BlocksClient, where?: WhereClause): Promise<PaymentSources> {
  const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const scoped = (c: WhereClause): WhereClause => (where ? { and: [c, where] } : c);
  const [proposals, ready, issued, readyAllocs, issuedAllocs] = await Promise.all([
    readPayingProposals(client, where),
    readAll(client, 'Receipts', scoped({ column: 'receiptStatus', value: RS_APPROVED })),
    readAll(client, 'Receipts', scoped({ and: [{ column: 'receiptStatus', value: RS_ISSUED }, { column: 'issuedAt', operator: '>=', value: since(DONE_MATCH_LOOKBACK_DAYS) }] })),
    readAll(client, 'ReceiptAllocations', scoped({ column: 'status', value: RC_READY })),
    readAll(client, 'ReceiptAllocations', scoped({ and: [{ column: 'status', value: RC_ISSUED }, { column: 'at', operator: '>=', value: since(ISSUED_ALLOCATION_LOOKBACK_DAYS) }] })),
  ]);
  const receipts = [...ready, ...issued];
  const keys = new Set(receipts.map((r) => str(r.receiptKey)));
  // an old issued receipt (outside the lookback) is in Priority's own open amount: its allocations are dropped
  const allocations = [...readyAllocs, ...issuedAllocs.filter((a) => keys.has(str(a.receiptKey)))];
  return { proposals, receipts, allocations };
}

/** The status sources of the given customers (null = every customer): their open disputes. */
export async function readStatusSources(client: BlocksClient, customerCodes: string[] | null): Promise<StatusSources> {
  if (customerCodes && !customerCodes.length) return { disputes: [] };
  const scoped = (c: WhereClause): WhereClause => (customerCodes ? { and: [c, { column: 'customerCode', operator: 'in', value: customerCodes }] } : c);
  const disputes = await readAll(client, 'Disputes', scoped({ column: 'status', operator: '!=', value: DISPUTE_CLOSED }));
  return { disputes };
}

// ---------- stored layer: diff, write, verify ----------
function norm(field: string, v: unknown): string | number | null {
  if (NUMBER_FIELDS.has(field)) {
    const n = numOrNull(v);
    return n === null ? null : round2(n);
  }
  if (DATETIME_FIELDS.has(field)) return sortableTime(v) || null;
  return textOrNull(v);
}

/** The stored layer columns of the row that differ from the computed layer: field → [stored, computed]. */
export function layerDiff(row: Item, layer: InvoiceLayer): Record<string, [unknown, unknown]> {
  const d: Record<string, [unknown, unknown]> = {};
  for (const f of LAYER_FIELDS) {
    if (norm(f, row[f]) !== norm(f, (layer as Item)[f])) d[f] = [row[f] ?? null, (layer as Item)[f] ?? null];
  }
  return d;
}

export interface RefreshOptions {
  invoiceNumbers?: string[] | null;
  customerCodes?: string[] | null;
  dryRun?: boolean;
  nowIso?: string;
}

export interface RefreshResult {
  dryRun: boolean;
  invoicesChecked: number;
  invoicesChanged: number;
  changes: Item[];
  writeVerified: boolean;
  errors: string[];
}

const cleanList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x).trim()).filter(Boolean))] : typeof v === 'string' ? [...new Set(splitList(v))] : [];

/**
 * Recomputes the stored layer for the selected invoices (both lists given → invoices in both; none → every
 * invoice), writes only the rows whose layer values change (plus layerUpdatedAt) and reads them back.
 * Payments and disputes are read for the selected invoices' customers only.
 */
export async function refreshInvoiceLayer(client: BlocksClient, opts: RefreshOptions = {}): Promise<RefreshResult> {
  const dryRun = opts.dryRun !== false;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const nos = cleanList(opts.invoiceNumbers);
  const codes = cleanList(opts.customerCodes);
  const errors: string[] = [];
  const result = (x: Partial<RefreshResult>): RefreshResult => ({ dryRun, invoicesChecked: 0, invoicesChanged: 0, changes: [], writeVerified: false, errors, ...x });

  const payingFilter = { column: 'status', operator: 'in' as const, value: PAYING_PROPOSAL_STATUSES };
  const receiptFilter = { column: 'receiptStatus', operator: 'in' as const, value: RECEIPT_APPROVED_STATUSES };
  const allocationFilter = { column: 'status', operator: 'in' as const, value: RECEIPT_STATUSES };
  let invoices: Item[];
  let proposals: PaymentSources;
  let status: StatusSources;
  try {
    const none = Promise.resolve([] as Item[]);
    const byCustomers = (table: string, custCodes: string[], keep: (r: Item) => boolean) =>
      custCodes.length ? readWhereIn(client, table, 'customerCode', custCodes).then((rows) => rows.filter(keep)) : none;
    const paying = (r: Item) => PAYING_PROPOSAL_STATUSES.includes(str(r.status));
    const issuedOrReadyAllocation = (a: Item) => RECEIPT_STATUSES.includes(str(a.status));
    const sourcesFor = (custCodes: string[] | null): Promise<PaymentSources> =>
      Promise.all([
        custCodes ? byCustomers('MatchProposals', custCodes, paying) : readAll(client, 'MatchProposals', payingFilter),
        custCodes ? byCustomers('Receipts', custCodes, isApprovedReceipt) : readAll(client, 'Receipts', receiptFilter),
        custCodes ? byCustomers('ReceiptAllocations', custCodes, issuedOrReadyAllocation) : readAll(client, 'ReceiptAllocations', allocationFilter),
      ]).then(([p, r, a]) => ({ proposals: p, receipts: r, allocations: a }));
    if (codes.length) {
      // the customers are known: invoices, payments and statuses in one round trip
      const [inv, p, st] = await Promise.all([
        nos.length ? readWhereIn(client, 'Invoices', 'invoiceNumber', nos) : readWhereIn(client, 'Invoices', 'customerCode', codes),
        sourcesFor(codes),
        readStatusSources(client, codes),
      ]);
      invoices = inv.filter((i) => codes.includes(str(i.customerCode)));
      proposals = p;
      status = st;
    } else if (nos.length) {
      invoices = await readWhereIn(client, 'Invoices', 'invoiceNumber', nos);
      const custCodes = [...new Set(invoices.map((i) => str(i.customerCode)).filter(Boolean))];
      [proposals, status] = await Promise.all([sourcesFor(custCodes), readStatusSources(client, custCodes)]);
    } else {
      [invoices, proposals, status] = await Promise.all([readAll(client, 'Invoices'), sourcesFor(null), readStatusSources(client, null)]);
    }
  } catch (e) {
    errors.push(`קריאת הנתונים לשכבת החשבוניות נכשלה: ${errText(e)}`);
    return result({});
  }

  const layers = computeInvoiceLayer(invoices, proposals, status);
  const planned: { row: Item; fields: Item; previous: Item }[] = [];
  for (const row of invoices) {
    if (row.id === undefined || row.id === null) continue;
    const computed = layers.get(str(row.invoiceNumber).trim());
    if (!computed) continue;
    const layer = { ...EMPTY_PAYMENT, ...EMPTY_STATUS, ...computed } as InvoiceLayer;
    const diff = layerDiff(row, layer);
    if (!Object.keys(diff).length) continue;
    const fields: Item = {};
    for (const f of LAYER_FIELDS) fields[f] = (layer as Item)[f] ?? null;
    planned.push({ row, fields, previous: Object.fromEntries(Object.entries(diff).map(([k, [from]]) => [k, from])) });
  }
  const changes = planned.map((x) => ({
    id: str(x.row.id),
    invoiceNumber: str(x.row.invoiceNumber),
    customerCode: str(x.row.customerCode),
    fields: Object.fromEntries(Object.keys(x.previous).map((k) => [k, x.fields[k]])),
    previous: x.previous,
  }));
  const base = { invoicesChecked: invoices.length, invoicesChanged: planned.length, changes };
  if (dryRun) return result({ ...base, writeVerified: false });
  if (!planned.length) return result({ ...base, writeVerified: true });

  // write: batches of rows (the layer columns + layerUpdatedAt only), one by one if a batch is rejected
  const payload = planned.map((x) => ({ id: str(x.row.id), ...x.fields, layerUpdatedAt: nowIso }));
  // 4 batches in flight: a full refresh after a first sync can touch tens of thousands of rows
  const chunks: Item[][] = [];
  for (let i = 0; i < payload.length; i += 100) chunks.push(payload.slice(i, i + 100));
  await mapLimit(chunks, 4, async (chunk) => {
    try {
      await client.updateItems('Invoices', chunk);
    } catch {
      await mapLimit(chunk, 8, async (item) => {
        const { id, ...fields } = item;
        try {
          await client.updateItem('Invoices', id, fields);
        } catch (e) {
          errors.push(`Invoices ${id}: ${errText(e)}`);
        }
      });
    }
  });

  // read back every written row
  let back: Item[] = [];
  try {
    back = await readByIds(
      client,
      'Invoices',
      planned.map((x) => str(x.row.id)),
    );
  } catch (e) {
    errors.push(`Invoices: קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  const backById = new Map(back.map((r) => [str(r.id), r]));
  const problems: string[] = [];
  for (const x of planned) {
    const r = backById.get(str(x.row.id));
    if (!r) {
      problems.push(`${str(x.row.invoiceNumber)}: לא נקראה בחזרה`);
      continue;
    }
    const still = Object.keys(layerDiff(r, x.fields as InvoiceLayer));
    if (still.length) problems.push(`${str(x.row.invoiceNumber)}: ${still.join(', ')} לא נשמרו`);
  }
  errors.push(...problems.map((p) => `שכבת החשבוניות: ${p}`));
  return result({ ...base, writeVerified: errors.length === 0 });
}

/** A short summary of a refresh for other actions' outputs. */
export const layerSummary = (r: RefreshResult) => ({
  dryRun: r.dryRun,
  invoicesChecked: r.invoicesChecked,
  invoicesChanged: r.invoicesChanged,
  changes: r.changes.map((c) => ({ invoiceNumber: c.invoiceNumber, fields: c.fields })),
  writeVerified: r.writeVerified,
  errors: r.errors,
});
