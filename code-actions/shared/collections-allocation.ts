// Allocation of a receipt to invoices – plan 04.11 part B, stage 6 (b/debt-allocation). A separate step after the receipt
// and the debt check; it never blocks or undoes the receipt.
//
// Source of truth for what is open: Priority's OpenMovements mirror, docType חשבונית with amount > 0 (docNumber = the
// invoice number; several movements of one invoice are summed). Invoices (frozen layer, never rebuilt here) only adds
// details: invoiceDate, the original amount, and the due date when the movement has none. The open balance of an
// invoice = its OpenMovements amount minus EVERY ReceiptAllocations row on it, across all receipts (Priority does not
// know our allocations: the app never writes to Priority). For the receipt being allocated its own rows are left out,
// because they are the ones an approval replaces.
//
// proposeAllocation (ProposeAllocation): the customer's open invoices grouped by due month, and the proposal: oldest to
// newest until the amount is used – starting with the months the debt check closed (debtCheckMonths) when it closed to
// zero – the last invoice partial, the rest credit on account (surplus). allocationConfidence 0–100:
//   100 the debt check closed to zero and the proposal uses the amount exactly on whole invoices of those months
//    80 the debt check closed to zero, but the invoices of those months do not add up to the amount exactly
//       (credits / journal entries / earlier allocations in those months): partial or surplus
//    50 no zero close; the amount ends exactly on whole open invoices
//    30 no zero close; last invoice partial or a surplus
//     0 no open invoice at all (everything stays on account)
// Writes (unless dryRun): allocationConfidence; for a zero-closed receipt with a proposal also matchStatus פיזור מוצע –
// לאישור and the task קבלה – צריך פיזור (allocate:<receiptKey>) – a לברר מול הלקוח receipt gets no proposed allocation
// (plan: "בלי פיזור מוצע"), its debt-check:<receiptKey> task carries it. allocationAutoApproveAt (AgentSettings; empty =
// OFF): when set and confidence ≥ it, the proposal is applied at once with approvedBy אושר אוטומטית. A receipt that
// already has allocations is never overwritten: the proposal is returned with alreadyAllocated.
//
// applyAllocation (ApplyAllocation): validates everything first (nothing is written on any error): the receipt is
// approved, each invoice is an open invoice of the receipt's customer, no invoice twice, amount > 0, amount ≤ the invoice's
// open balance, total ≤ the receipt amount. Then REPLACES the receipt's ReceiptAllocations rows (new rows created, old
// rows deleted) with kind מלאה / חלקית, openBefore, openAfter, isPartial, source (סכום = exactly the automatic proposal,
// ידני = changed by the person), sourceRef = approvedBy (אושר אוטומטית for the threshold), status מוכנה; then Receipts
// allocatedAmount / unallocatedAmount / matchStatus:
//   nothing left            → מפוזרת
//   surplus, no open invoice of the customer left → מפוזרת – עודף על חשבון
//   otherwise               → על חשבון – צריך פיזור
// Read back; any failure rolls back every row written. Then (never rolled back) the tasks: allocate:<receiptKey> open
// while על חשבון – צריך פיזור with open invoices left, closed automatically otherwise; once the receipt is fully allocated
// (מפוזרת / מפוזרת – עודף על חשבון) the debt check's debt-check:<receiptKey> task closes too. Never writes to Priority;
// sends nothing.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { naturalCompare } from './collections-aging.ts';
import { hebrewMonthLabel, isMonthKey, monthKeyOf, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, errText, formatIls, isFixtureCustomer, num, ownerOf, readByIds, readSettings, readWhereIn, round2, str } from './collections-data.ts';
import { debtCheckTaskKey, isZeroClose, movementMonthOf, MS_SPREAD_PROPOSED } from './collections-debt-check.ts';
import { closeTasksByKeys, MS_ON_ACCOUNT_SPREAD, nextNoonIso, stageTaskRow, WriteJournal } from './collections-receipt-flow.ts';
import { KIND_FULL, KIND_PARTIAL, RS_APPROVED, RS_ISSUED, SRC_AMOUNT, SRC_MANUAL } from './collections-receipt-record.ts';
import { computeSeverity, severityConfigFrom } from './collections-severity.ts';
import { openKeyedTask } from './collections-task-upsert.ts';
import { A_RECEIPT } from './collections-tasks.ts';
import { numberSettingOrNull } from './plan-settings.ts';

// ---------- enums (exactly as in the table artifacts) ----------
/** Receipts.matchStatus after an approved allocation */
export const MS_SPREAD = 'מפוזרת';
export const MS_SPREAD_SURPLUS = 'מפוזרת – עודף על חשבון';
export { MS_ON_ACCOUNT_SPREAD, MS_SPREAD_PROPOSED };
/** ReceiptAllocations.status */
export const RA_READY = 'מוכנה';
/** CollectionQueue.taskType */
export const TT_ALLOCATE = 'קבלה – צריך פיזור';
export const allocateTaskKey = (receiptKey: unknown) => `allocate:${str(receiptKey).trim()}`;
/** approvedBy of the automatic threshold (Receipts.identifyStatus uses the same words) */
export const AUTO_APPROVED = 'אושר אוטומטית';
export const S_ALLOCATION_AUTO_APPROVE_AT = 'allocationAutoApproveAt';
const INVOICE_DOC = 'חשבונית';
const DEFAULT_APPROVER = 'משתמש';
/** matchStatus values that mean the receipt is allocated */
export const ALLOCATED_STATUSES = [MS_SPREAD, MS_SPREAD_SURPLUS];

const EPS = 0.01 + 1e-9;
const ils = (n: number) => `${formatIls(n)} ש״ח`;
const isApproved = (r: Item | null | undefined) => [RS_APPROVED, RS_ISSUED].includes(str(r?.receiptStatus).trim());
const earliest = (rows: Item[]) => [...rows].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0] ?? null;
const monthText = (m: string) => (isMonthKey(m) ? hebrewMonthLabel(m) : 'ללא חודש פירעון');

// ---------- pure: open invoices ----------
export interface OpenInvoice {
  invoiceNumber: string;
  dueDate: string | null;
  /** YYYY-MM, '' when the invoice has no due date at all */
  dueMonth: string;
  invoiceDate: string | null;
  /** the invoice's original amount (Invoices), else its open amount in Priority */
  invoiceAmount: number;
  /** open in Priority (OpenMovements) */
  openInPriority: number;
  /** allocated to it by our receipts (other than the excluded one) */
  allocatedByOthers: number;
  /** openInPriority − allocatedByOthers */
  openBefore: number;
  otherReceipts: { receiptKey: string; amount: number }[];
}

const isInvoiceMovement = (m: Item) => str(m.docType).trim() === INVOICE_DOC && str(m.docNumber).trim() !== '';

/**
 * The customer's open invoices (open balance > 0.005), oldest due date first. movements = the customer's OpenMovements;
 * allocations = every ReceiptAllocations row on those invoices (any receipt); excludeReceiptKey = the receipt being
 * allocated (its own rows are not subtracted). Pure.
 */
export function openInvoicesOf(x: { movements: Item[]; allocations: Item[]; invoices?: Item[]; excludeReceiptKey?: string; keepClosed?: boolean }): OpenInvoice[] {
  const exclude = str(x.excludeReceiptKey).trim();
  const byNo = new Map<string, { total: number; month: string; dueDate: string | null; docDate: string | null }>();
  for (const m of x.movements) {
    if (!isInvoiceMovement(m)) continue;
    const no = str(m.docNumber).trim();
    const cur = byNo.get(no) ?? { total: 0, month: '', dueDate: null, docDate: null };
    cur.total = round2(cur.total + num(m.amount));
    cur.month ||= movementMonthOf(m) ?? '';
    cur.dueDate ||= toIsraelDate(m.dueDate);
    cur.docDate ||= toIsraelDate(m.docDate);
    byNo.set(no, cur);
  }
  const invByNo = new Map((x.invoices ?? []).map((i) => [str(i.invoiceNumber).trim(), i]));
  const out: OpenInvoice[] = [];
  for (const [no, mv] of byNo) {
    if (mv.total <= 0.005) continue;
    const inv = invByNo.get(no);
    const others = x.allocations.filter((a) => str(a.invoiceNumber).trim() === no && str(a.receiptKey).trim() !== exclude && num(a.amount) > 0);
    const perReceipt = new Map<string, number>();
    for (const a of others) perReceipt.set(str(a.receiptKey), round2((perReceipt.get(str(a.receiptKey)) ?? 0) + num(a.amount)));
    const otherReceipts = [...perReceipt].map(([receiptKey, amount]) => ({ receiptKey, amount }));
    const allocatedByOthers = round2(otherReceipts.reduce((s, r) => s + r.amount, 0));
    const openBefore = round2(Math.max(0, mv.total - allocatedByOthers));
    if (openBefore <= 0.005 && !x.keepClosed) continue;
    const dueDate = mv.dueDate ?? toIsraelDate(inv?.dueDate);
    const dueMonth = mv.month || (dueDate ? monthKeyOf(dueDate) : isMonthKey(str(inv?.dueMonth)) ? str(inv?.dueMonth) : '');
    out.push({
      invoiceNumber: no,
      dueDate,
      dueMonth,
      invoiceDate: toIsraelDate(inv?.invoiceDate) ?? mv.docDate,
      invoiceAmount: inv && num(inv.amount) > 0 ? round2(num(inv.amount)) : mv.total,
      openInPriority: mv.total,
      allocatedByOthers,
      openBefore,
      otherReceipts,
    });
  }
  return out.sort(byOldest);
}

const byOldest = (a: OpenInvoice, b: OpenInvoice) =>
  (a.dueMonth || '9999-99').localeCompare(b.dueMonth || '9999-99') || str(a.dueDate ?? '9999').localeCompare(str(b.dueDate ?? '9999')) || naturalCompare(a.invoiceNumber, b.invoiceNumber);

// ---------- pure: the proposal ----------
export interface ProposalLine {
  invoiceNumber: string;
  amount: number;
  isPartial: boolean;
}

export interface Proposal {
  lines: ProposalLine[];
  proposedTotal: number;
  surplus: number;
  /** the order the invoices were taken in */
  order: string[];
}

/** Oldest to newest until the amount is used, starting with `startMonths` (the months the debt check closed). Pure. */
export function proposeLines(amountRaw: number, open: OpenInvoice[], startMonths: string[] = []): Proposal {
  const amount = round2(Math.abs(num(amountRaw)));
  const start = new Set(startMonths);
  const sorted = [...open].sort(byOldest);
  const ordered = [...sorted.filter((i) => start.has(i.dueMonth)), ...sorted.filter((i) => !start.has(i.dueMonth))];
  let left = amount;
  const lines: ProposalLine[] = [];
  for (const inv of ordered) {
    if (left <= 0.005) break;
    const take = round2(Math.min(left, inv.openBefore));
    if (take <= 0.005) continue;
    lines.push({ invoiceNumber: inv.invoiceNumber, amount: take, isPartial: take < inv.openBefore - EPS });
    left = round2(left - take);
  }
  const proposedTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, proposedTotal, surplus: round2(Math.max(0, amount - proposedTotal)), order: ordered.map((i) => i.invoiceNumber) };
}

/** allocationConfidence 0–100 (see the header). Pure. */
export function allocationConfidenceOf(x: { zeroClose: boolean; closedMonths: string[]; proposal: Proposal; open: OpenInvoice[] }): number {
  const { proposal } = x;
  if (!proposal.lines.length) return 0;
  const exact = proposal.surplus <= 0.005 && !proposal.lines.some((l) => l.isPartial);
  if (x.zeroClose) {
    const months = new Set(x.closedMonths);
    const monthOf = new Map(x.open.map((i) => [i.invoiceNumber, i.dueMonth]));
    const inClosed = proposal.lines.every((l) => months.has(monthOf.get(l.invoiceNumber) ?? ''));
    const allOfClosed = x.open.filter((i) => months.has(i.dueMonth)).every((i) => proposal.lines.some((l) => l.invoiceNumber === i.invoiceNumber && !l.isPartial));
    return exact && inClosed && allOfClosed ? 100 : 80;
  }
  return exact ? 50 : 30;
}

/** True when the chosen lines equal the automatic proposal (same invoices, same amounts ±0.01). */
export function sameAsProposal(chosen: { invoiceNumber: string; amount: number }[], proposal: Proposal): boolean {
  if (chosen.length !== proposal.lines.length) return false;
  const p = new Map(proposal.lines.map((l) => [l.invoiceNumber, l.amount]));
  return chosen.every((c) => p.has(c.invoiceNumber) && Math.abs(num(p.get(c.invoiceNumber)) - num(c.amount)) <= EPS);
}

/** The months view of the editor: open invoices by due month, with the proposal and the receipt's current allocation. */
export function monthsView(open: OpenInvoice[], proposal: Proposal, closedMonths: string[], current: Map<string, number>): Item[] {
  const months = new Map<string, OpenInvoice[]>();
  for (const inv of [...open].sort(byOldest)) months.set(inv.dueMonth, [...(months.get(inv.dueMonth) ?? []), inv]);
  const proposed = new Map(proposal.lines.map((l) => [l.invoiceNumber, l]));
  const closed = new Set(closedMonths);
  return [...months.entries()].map(([dueMonth, invs]) => ({
    dueMonth,
    monthLabel: monthText(dueMonth),
    closedByDebtCheck: closed.has(dueMonth),
    openTotal: round2(invs.reduce((s, i) => s + i.openBefore, 0)),
    invoices: invs.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      invoiceAmount: i.invoiceAmount,
      openInPriority: i.openInPriority,
      allocatedByOthers: i.allocatedByOthers,
      otherReceipts: i.otherReceipts,
      openBefore: i.openBefore,
      proposed: proposed.get(i.invoiceNumber)?.amount ?? 0,
      isPartial: proposed.get(i.invoiceNumber)?.isPartial ?? false,
      current: current.get(i.invoiceNumber) ?? 0,
    })),
  }));
}

// ---------- I/O: the receipt's context ----------
interface AllocationContext {
  receipt: Item;
  receiptKey: string;
  customerCode: string;
  amount: number;
  customer: Item | undefined;
  owner: string;
  settings: Map<string, string>;
  open: OpenInvoice[];
  ownRows: Item[];
  zeroClose: boolean;
  closedMonths: string[];
  mirrorEmpty: boolean;
}

export interface AllocationDeps {
  nowIso?: string;
  settings?: Map<string, string>;
}

async function loadContext(client: BlocksClient, receiptKey: string, deps: AllocationDeps): Promise<{ ctx: AllocationContext | null; error: string }> {
  const receipt = earliest(await readWhereIn(client, 'Receipts', 'receiptKey', [receiptKey]));
  if (!receipt) return { ctx: null, error: `הקבלה ${receiptKey} לא נמצאה` };
  if (!isApproved(receipt)) return { ctx: null, error: `הקבלה ${receiptKey} עוד לא אושרה – מפזרים אחרי אישור הקבלה` };
  const customerCode = str(receipt.customerCode).trim();
  if (!customerCode) return { ctx: null, error: `לקבלה ${receiptKey} אין לקוח` };
  const [movements, customers, owners, settings, ownRows, anyMovement] = await Promise.all([
    readWhereIn(client, 'OpenMovements', 'customerCode', [customerCode]),
    readWhereIn(client, 'Customers', 'customerCode', [customerCode]),
    readWhereIn(client, 'CustomerOwners', 'customerCode', [customerCode]).catch(() => [] as Item[]),
    deps.settings ? Promise.resolve(deps.settings) : readSettings(client),
    readWhereIn(client, 'ReceiptAllocations', 'receiptKey', [receiptKey]),
    client.queryTable('OpenMovements', { from: { table: 'OpenMovements' }, limit: 1 }).then((r) => (r?.items ?? []).length > 0),
  ]);
  const numbers = [...new Set(movements.filter(isInvoiceMovement).map((m) => str(m.docNumber).trim()))];
  const [allocations, invoices] = numbers.length
    ? await Promise.all([readWhereIn(client, 'ReceiptAllocations', 'invoiceNumber', numbers), readWhereIn(client, 'Invoices', 'invoiceNumber', numbers)])
    : [[] as Item[], [] as Item[]];
  const customer = customers.find((c) => str(c.customerCode).trim() === customerCode);
  const zeroClose = isZeroClose(str(receipt.debtCheckResult).trim());
  return {
    ctx: {
      receipt,
      receiptKey,
      customerCode,
      amount: round2(Math.abs(num(receipt.amount))),
      customer,
      owner: ownerOf(customerCode, customer, buildOwnerMap(owners)),
      settings,
      // an invoice that belongs to another customer is never offered (Invoices.customerCode, when known)
      open: openInvoicesOf({ movements, allocations, invoices, excludeReceiptKey: receiptKey }).filter((i) => {
        const inv = invoices.find((x) => str(x.invoiceNumber).trim() === i.invoiceNumber);
        return !inv || !str(inv.customerCode).trim() || str(inv.customerCode).trim() === customerCode;
      }),
      ownRows,
      zeroClose,
      closedMonths: zeroClose ? str(receipt.debtCheckMonths).split(',').map((m) => m.trim()).filter(Boolean) : [],
      mirrorEmpty: !anyMovement,
    },
    error: '',
  };
}

function allocateTaskRow(ctx: AllocationContext, x: { unallocated: number; proposed: boolean; asOfDate: string; nowIso: string }): Item {
  const name = str(ctx.customer?.customerName) || str(ctx.receipt.customerName) || ctx.customerCode;
  const isTest = ctx.receipt.isTestFixture === true || isFixtureCustomer(ctx.customer, ctx.customerCode);
  const openTotal = round2(ctx.open.reduce((s, i) => s + i.openBefore, 0));
  return stageTaskRow(allocateTaskKey(ctx.receiptKey), {
    taskType: TT_ALLOCATE,
    title: x.proposed ? `קבלה – צריך פיזור – ${name}: פיזור מוצע לאישור (${ils(ctx.amount)})` : `קבלה – צריך פיזור – ${name}: ${ils(x.unallocated)} עוד לא פוזרו`,
    reasons: x.proposed
      ? `קבלה ${ctx.receiptKey} על ${ils(ctx.amount)}: הוצע פיזור לחשבוניות הפתוחות, מהישנה לחדשה. לאשר או לשנות בעורך הפיזור.`
      : `קבלה ${ctx.receiptKey} על ${ils(ctx.amount)}: פוזרו ${ils(round2(ctx.amount - x.unallocated))}, נשארו ${ils(x.unallocated)} על חשבון, וללקוח יש חשבוניות פתוחות ב-${ils(openTotal)}. להשלים את הפיזור בעורך הפיזור.`,
    recommendedAction: A_RECEIPT,
    severity: computeSeverity({ amount: x.unallocated, daysOverdue: 0 }, severityConfigFrom(ctx.settings)),
    customerCode: ctx.customerCode,
    customerName: name,
    owner: ctx.owner || null,
    amount: x.unallocated,
    invoiceNumbers: [],
    relatedTable: 'Receipts',
    relatedId: ctx.receiptKey,
    dueAt: nextNoonIso(x.asOfDate),
    asOfDate: x.asOfDate,
    nowIso: x.nowIso,
    isTestFixture: isTest,
  });
}

const flag = (v: unknown) => v === true || v === 'true';

// ---------- ProposeAllocation ----------
/**
 * input: { receiptKey, dryRun?, asOfDate? }. Returns { ok, dryRun, receiptKey, customerCode, customerName, amount,
 * debtCheckResult, closedMonths, months[], proposal[], proposedTotal, surplus, openTotal, allocationConfidence,
 * autoApproveAt, wouldAutoApply, autoApplied, apply, alreadyAllocated, current[], matchStatus, taskKey, writeVerified, errors }.
 */
export async function proposeAllocation(client: BlocksClient, input: Item, deps: AllocationDeps = {}): Promise<Item> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const dryRun = flag(input?.dryRun);
  const receiptKey = str(input?.receiptKey).trim();
  const errors: string[] = [];
  const out: Item = { ok: false, dryRun, receiptKey, months: [], proposal: [], proposedTotal: 0, surplus: 0, allocationConfidence: 0, autoApplied: false, writeVerified: false, errors };
  if (!receiptKey) {
    errors.push('חסרה קבלה (receiptKey)');
    return out;
  }
  let asOfDate: string;
  let ctx: AllocationContext | null;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
    const loaded = await loadContext(client, receiptKey, deps);
    if (!loaded.ctx) {
      errors.push(loaded.error);
      return out;
    }
    ctx = loaded.ctx;
  } catch (e) {
    errors.push(`קריאת הנתונים נכשלה – לא הוצע פיזור: ${errText(e)}`);
    return out;
  }
  if (ctx.mirrorEmpty) {
    errors.push('אין תנועות פתוחות בכלל (OpenMovements ריקה – משיכה שנכשלה או מקור ריק) – לא הוצע פיזור. להריץ שוב אחרי משיכת התנועות.');
    return out;
  }
  const proposal = proposeLines(ctx.amount, ctx.open, ctx.closedMonths);
  const confidence = allocationConfidenceOf({ zeroClose: ctx.zeroClose, closedMonths: ctx.closedMonths, proposal, open: ctx.open });
  const current = new Map<string, number>();
  for (const r of ctx.ownRows) current.set(str(r.invoiceNumber).trim(), round2((current.get(str(r.invoiceNumber).trim()) ?? 0) + num(r.amount)));
  const currentMatch = str(ctx.receipt.matchStatus).trim();
  const alreadyAllocated = ctx.ownRows.length > 0 || ALLOCATED_STATUSES.includes(currentMatch);
  const autoApproveAt = numberSettingOrNull(ctx.settings, S_ALLOCATION_AUTO_APPROVE_AT);
  const wouldAutoApply = autoApproveAt !== null && confidence >= autoApproveAt && proposal.lines.length > 0 && !alreadyAllocated;
  Object.assign(out, {
    customerCode: ctx.customerCode,
    customerName: str(ctx.customer?.customerName) || str(ctx.receipt.customerName) || ctx.customerCode,
    amount: ctx.amount,
    debtCheckResult: str(ctx.receipt.debtCheckResult) || null,
    closedMonths: ctx.closedMonths,
    months: monthsView(ctx.open, proposal, ctx.closedMonths, current),
    proposal: proposal.lines,
    proposedTotal: proposal.proposedTotal,
    surplus: proposal.surplus,
    openTotal: round2(ctx.open.reduce((s, i) => s + i.openBefore, 0)),
    allocationConfidence: confidence,
    autoApproveAt,
    wouldAutoApply,
    alreadyAllocated,
    current: [...current].map(([invoiceNumber, amount]) => ({ invoiceNumber, amount })),
    matchStatus: currentMatch,
    taskKey: '',
  });
  if (dryRun) {
    out.ok = true;
    return out;
  }
  if (alreadyAllocated) {
    // an allocated receipt is never overwritten by a proposal; nothing written
    out.ok = true;
    out.writeVerified = true;
    return out;
  }

  // 1. the receipt: confidence (+ the proposal state for a zero-closed receipt), read back
  const proposeState = ctx.zeroClose && proposal.lines.length > 0;
  const fields: Item = {};
  if (num(ctx.receipt.allocationConfidence) !== confidence || ctx.receipt.allocationConfidence === null || ctx.receipt.allocationConfidence === undefined) fields.allocationConfidence = confidence;
  if (proposeState && currentMatch !== MS_SPREAD_PROPOSED) fields.matchStatus = MS_SPREAD_PROPOSED;
  let verified = true;
  if (Object.keys(fields).length) {
    try {
      await client.updateItem('Receipts', str(ctx.receipt.id), fields);
      const [back] = await readByIds(client, 'Receipts', [str(ctx.receipt.id)]);
      if (!back || !Object.entries(fields).every(([k, v]) => str(back[k]) === str(v))) {
        errors.push(`Receipts ${receiptKey}: הצעת הפיזור לא נקראה בחזרה כפי שנכתבה`);
        return out;
      }
    } catch (e) {
      errors.push(`Receipts ${receiptKey}: ${errText(e)} – הצעת הפיזור לא נשמרה`);
      return out;
    }
  }
  if (fields.matchStatus) out.matchStatus = fields.matchStatus;

  // 2. the automatic threshold
  if (wouldAutoApply) {
    const applied = await applyAllocation(client, { receiptKey, allocations: proposal.lines.map((l) => ({ invoiceNumber: l.invoiceNumber, amount: l.amount })), approvedBy: AUTO_APPROVED, asOfDate }, { nowIso, settings: ctx.settings });
    out.apply = applied;
    out.autoApplied = applied.ok === true;
    out.matchStatus = applied.ok ? applied.matchStatus : out.matchStatus;
    out.taskKey = str(applied.taskKey);
    errors.push(...(applied.errors ?? []).map((e: string) => `אישור אוטומטי: ${e}`));
    out.ok = true;
    out.writeVerified = applied.writeVerified === true;
    return out;
  }

  // 3. the task קבלה – צריך פיזור while the proposal waits (zero-closed receipts only)
  if (proposeState) {
    const task = await openKeyedTask(client, { row: allocateTaskRow(ctx, { unallocated: ctx.amount, proposed: true, asOfDate, nowIso }), nowIso, asOfDate, dryRun: false });
    out.taskKey = task.taskKey;
    out.taskChange = task.change;
    if (!task.writeVerified) verified = false;
    errors.push(...task.errors);
  }
  out.ok = true;
  out.writeVerified = verified;
  return out;
}

// ---------- ApplyAllocation ----------
/**
 * input: { receiptKey, allocations: [{ invoiceNumber, amount }], approvedBy?, dryRun?, asOfDate? }. Returns { ok, dryRun,
 * receiptKey, amount, allocated, unallocated, matchStatus, source, rows[], openInvoicesLeft, taskKey, taskChange,
 * closedTasks, writeVerified, errors }. Any validation error → ok false and nothing written.
 */
export async function applyAllocation(client: BlocksClient, input: Item, deps: AllocationDeps = {}): Promise<Item> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const dryRun = flag(input?.dryRun);
  const receiptKey = str(input?.receiptKey).trim();
  const approvedBy = str(input?.approvedBy).trim() || DEFAULT_APPROVER;
  const errors: string[] = [];
  const out: Item = { ok: false, dryRun, receiptKey, allocated: 0, unallocated: 0, matchStatus: '', rows: [], taskKey: '', writeVerified: false, errors };
  if (!receiptKey) {
    errors.push('חסרה קבלה (receiptKey)');
    return out;
  }
  if (!Array.isArray(input?.allocations)) {
    errors.push('חסרה רשימת הפיזור (allocations)');
    return out;
  }
  let asOfDate: string;
  let ctx: AllocationContext | null;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
    const loaded = await loadContext(client, receiptKey, deps);
    if (!loaded.ctx) {
      errors.push(loaded.error);
      return out;
    }
    ctx = loaded.ctx;
  } catch (e) {
    errors.push(`קריאת הנתונים נכשלה – הפיזור לא נשמר: ${errText(e)}`);
    return out;
  }
  out.amount = ctx.amount;

  // ---------- validation (all of it before any write) ----------
  const chosen = (input.allocations as Item[]).map((a) => ({ invoiceNumber: str(a?.invoiceNumber).trim(), amount: round2(num(a?.amount)) }));
  const openByNo = new Map(ctx.open.map((i) => [i.invoiceNumber, i]));
  const seen = new Set<string>();
  let otherCustomer: Item[] = [];
  const unknown = chosen.filter((c) => c.invoiceNumber && !openByNo.has(c.invoiceNumber)).map((c) => c.invoiceNumber);
  if (unknown.length) {
    try {
      otherCustomer = await readWhereIn(client, 'Invoices', 'invoiceNumber', unknown);
    } catch {
      otherCustomer = [];
    }
  }
  for (const c of chosen) {
    if (!c.invoiceNumber) {
      errors.push('שורת פיזור בלי מספר חשבונית');
      continue;
    }
    if (seen.has(c.invoiceNumber)) errors.push(`חשבונית ${c.invoiceNumber} מופיעה פעמיים בפיזור`);
    seen.add(c.invoiceNumber);
    if (!(c.amount > 0.005)) errors.push(`חשבונית ${c.invoiceNumber}: הסכום חייב להיות גדול מ-0`);
    const inv = openByNo.get(c.invoiceNumber);
    if (!inv) {
      const other = otherCustomer.find((x) => str(x.invoiceNumber).trim() === c.invoiceNumber);
      const otherCode = str(other?.customerCode).trim();
      errors.push(
        otherCode && otherCode !== ctx.customerCode
          ? `חשבונית ${c.invoiceNumber} שייכת ללקוח אחר (${otherCode}) – אי אפשר לפזר אליה קבלה של ${ctx.customerCode}`
          : `חשבונית ${c.invoiceNumber} אינה חשבונית פתוחה של הלקוח ${ctx.customerCode} (לא בתנועות הפתוחות, או שכבר שולמה במלואה)`,
      );
      continue;
    }
    if (c.amount > inv.openBefore + EPS) errors.push(`חשבונית ${c.invoiceNumber}: ${ils(c.amount)} גבוה מהיתרה הפתוחה שלה (${ils(inv.openBefore)})`);
  }
  const total = round2(chosen.reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0));
  if (total > ctx.amount + EPS) errors.push(`סך הפיזור ${ils(total)} גבוה מסכום הקבלה (${ils(ctx.amount)})`);
  if (errors.length) return out;

  // ---------- the rows and the receipt state ----------
  const proposal = proposeLines(ctx.amount, ctx.open, ctx.closedMonths);
  const source = sameAsProposal(chosen, proposal) ? SRC_AMOUNT : SRC_MANUAL;
  const isTest = ctx.receipt.isTestFixture === true || isFixtureCustomer(ctx.customer, ctx.customerCode);
  const customerName = str(ctx.customer?.customerName) || str(ctx.receipt.customerName) || ctx.customerCode;
  const rows: Item[] = [...chosen]
    .sort((a, b) => byOldest(openByNo.get(a.invoiceNumber)!, openByNo.get(b.invoiceNumber)!))
    .map((c) => {
      const inv = openByNo.get(c.invoiceNumber)!;
      const amount = round2(Math.min(c.amount, inv.openBefore));
      const openAfter = round2(Math.max(0, inv.openBefore - amount));
      const partial = openAfter > 0.005;
      return {
        receiptKey,
        bankLineId: str(ctx!.receipt.bankLineId) || null,
        invoiceNumber: c.invoiceNumber,
        customerCode: ctx!.customerCode,
        customerName,
        dueDate: inv.dueDate,
        amount,
        openBefore: inv.openBefore,
        openAfter,
        kind: partial ? KIND_PARTIAL : KIND_FULL,
        isPartial: partial,
        source,
        sourceRef: approvedBy,
        status: RA_READY,
        at: nowIso,
        isTestFixture: isTest,
      };
    });
  const allocated = round2(rows.reduce((s, r) => s + num(r.amount), 0));
  const unallocated = round2(Math.max(0, ctx.amount - allocated));
  const openLeft = ctx.open.filter((i) => {
    const r = rows.find((x) => x.invoiceNumber === i.invoiceNumber);
    return (r ? num(r.openAfter) : i.openBefore) > 0.005;
  });
  const matchStatus = unallocated <= 0.005 ? MS_SPREAD : !openLeft.length && allocated > 0.005 ? MS_SPREAD_SURPLUS : MS_ON_ACCOUNT_SPREAD;
  const needsTask = matchStatus === MS_ON_ACCOUNT_SPREAD && openLeft.length > 0;
  const fullyAllocated = matchStatus === MS_SPREAD || matchStatus === MS_SPREAD_SURPLUS;
  Object.assign(out, {
    allocated,
    unallocated,
    matchStatus,
    source,
    approvedBy,
    rows,
    openInvoicesLeft: openLeft.length,
    openTotalLeft: round2(openLeft.reduce((s, i) => {
      const r = rows.find((x) => x.invoiceNumber === i.invoiceNumber);
      return s + (r ? num(r.openAfter) : i.openBefore);
    }, 0)),
    taskKey: needsTask ? allocateTaskKey(receiptKey) : '',
  });
  if (dryRun) {
    out.ok = true;
    return out;
  }

  // ---------- write: new rows, old rows out, the receipt; read back; roll back on any failure ----------
  const journal = new WriteJournal();
  const receiptFields: Item = { allocatedAmount: allocated, unallocatedAmount: unallocated, matchStatus };
  try {
    const created: Item[] = [];
    for (const r of rows) created.push(await journal.create(client, 'ReceiptAllocations', r));
    for (const old of ctx.ownRows) await journal.remove(client, 'ReceiptAllocations', old);
    await journal.update(client, 'Receipts', ctx.receipt, receiptFields);
    const [backReceipt, backRows] = await Promise.all([readByIds(client, 'Receipts', [str(ctx.receipt.id)]), readWhereIn(client, 'ReceiptAllocations', 'receiptKey', [receiptKey])]);
    const rOk = !!backReceipt[0] && Object.entries(receiptFields).every(([k, v]) => str(backReceipt[0][k]) === str(v));
    const createdIds = new Set(created.map((c) => str(c.id)));
    const rowsOk = backRows.length === rows.length && backRows.every((b) => createdIds.has(str(b.id))) && Math.abs(backRows.reduce((s, b) => s + num(b.amount), 0) - allocated) <= EPS;
    if (!rOk || !rowsOk) throw new Error('הפיזור לא נקרא בחזרה כפי שנכתב');
    out.rows = backRows.sort((a, b) => naturalCompare(str(a.dueDate), str(b.dueDate)) || naturalCompare(str(a.invoiceNumber), str(b.invoiceNumber)));
  } catch (e) {
    const undo = await journal.rollback(client);
    errors.push(`הפיזור של ${receiptKey} לא נשמר: ${errText(e)}`, ...undo);
    out.rows = [];
    return out;
  }

  // ---------- the tasks (never undo the allocation) ----------
  let verified = true;
  const ctxNow: AllocationContext = { ...ctx, open: openLeft.map((i) => ({ ...i, openBefore: num(rows.find((r) => r.invoiceNumber === i.invoiceNumber)?.openAfter ?? i.openBefore) })) };
  if (needsTask) {
    const task = await openKeyedTask(client, { row: allocateTaskRow(ctxNow, { unallocated, proposed: false, asOfDate, nowIso }), nowIso, asOfDate, dryRun: false });
    out.taskChange = task.change;
    if (!task.writeVerified) verified = false;
    errors.push(...task.errors);
  }
  const toClose = [...(needsTask ? [] : [allocateTaskKey(receiptKey)]), ...(fullyAllocated ? [debtCheckTaskKey(receiptKey)] : [])];
  if (toClose.length) {
    const reason =
      matchStatus === MS_SPREAD
        ? `הקבלה פוזרה במלואה (${approvedBy})`
        : matchStatus === MS_SPREAD_SURPLUS
          ? `הקבלה פוזרה – ${ils(unallocated)} נשארו זכות על חשבון, אין חשבוניות פתוחות (${approvedBy})`
          : `אין ללקוח חשבוניות פתוחות לפיזור (${approvedBy})`;
    const closed = await closeTasksByKeys(client, toClose, reason, nowIso);
    out.closedTasks = closed.change === 'closed' ? closed.taskKey.split(',').filter(Boolean) : [];
    if (!closed.writeVerified) verified = false;
    errors.push(...closed.errors);
  }
  out.ok = true;
  out.writeVerified = verified;
  return out;
}

// ---------- the customer card: what each receipt covered and what is still open ----------
/**
 * Coverage of the customer's receipts (GetCustomer360). movements / allocations / invoices = the customer's rows. Pure.
 * openInvoices: every open invoice now (after all allocations) with the receipts that paid part of it.
 * coverageOf(receiptKey): covered = its allocation rows {invoiceNumber, dueDate, amount, isPartial, openAfter};
 * stillOpen = the customer's open invoices this receipt did not touch {invoiceNumber, dueDate, dueMonth, openAmount}.
 */
export function customerCoverage(x: { movements: Item[]; allocations: Item[]; invoices: Item[] }) {
  const open = openInvoicesOf({ movements: x.movements, allocations: x.allocations, invoices: x.invoices });
  const openInvoices = open.map((i) => ({
    invoiceNumber: i.invoiceNumber,
    invoiceDate: i.invoiceDate,
    dueDate: i.dueDate,
    dueMonth: i.dueMonth,
    invoiceAmount: i.invoiceAmount,
    openInPriority: i.openInPriority,
    allocated: i.allocatedByOthers,
    openBalance: i.openBefore,
    receipts: i.otherReceipts,
  }));
  const coverageOf = (receiptKey: string) => {
    const own = x.allocations
      .filter((a) => str(a.receiptKey) === receiptKey && num(a.amount) > 0)
      .sort((a, b) => str(toIsraelDate(a.dueDate)).localeCompare(str(toIsraelDate(b.dueDate))) || naturalCompare(str(a.invoiceNumber), str(b.invoiceNumber)));
    const covered = own.map((a) => {
      const openAfter = a.openAfter === null || a.openAfter === undefined ? round2(Math.max(0, num(a.openBefore) - num(a.amount))) : round2(num(a.openAfter));
      return {
        invoiceNumber: str(a.invoiceNumber),
        dueDate: toIsraelDate(a.dueDate),
        amount: round2(num(a.amount)),
        isPartial: a.isPartial === true || a.isPartial === 'true' || str(a.kind) === KIND_PARTIAL,
        openAfter,
      };
    });
    const touched = new Set(covered.map((c) => c.invoiceNumber));
    const stillOpen = open.filter((i) => !touched.has(i.invoiceNumber)).map((i) => ({ invoiceNumber: i.invoiceNumber, dueDate: i.dueDate, dueMonth: i.dueMonth, openAmount: i.openBefore }));
    return { covered, stillOpen, stillOpenTotal: round2(stillOpen.reduce((s, i) => s + i.openAmount, 0)) };
  };
  return { openInvoices, coverageOf };
}
