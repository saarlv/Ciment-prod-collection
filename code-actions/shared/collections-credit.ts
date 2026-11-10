// Credit insurance and obligo (אובליגו) – read only. One place for the rules shared by GetCreditExposure (the
// customer card tab אובליגו וביטוח and the alerts on היום), ProposeInsuranceRequests and GetCustomer360:
// - the cover: CreditCovers row with status תקף (newest), else the newest cover of the customer
// - the static obligo: CustomerExposure.obligoTotal as Priority computed it – never computed here
// - the dynamic obligo: static − receipts approved here and not yet in Priority (computed now, never stored; the old
//   "transfers in clarification" adjustment went with the detail request on 08.11). Undeposited cheques are NOT
//   subtracted: listed apart, with afterDeposit = dynamic − cheques
// - use % (static and dynamic) against the insured amount; level גבוה at insuranceThresholdPct (default 80),
//   no separate level above 100%
// - expiringSoon: validUntil within coverExpiryAlertDays (default 30)
// Nothing here writes, calls the insurer (ICIC) or Priority.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { diffDays, sortableTime, toIsraelDate } from './collections-dates.ts';
import { num, numberSetting, numOrNull, readAll, readWhereIn, round1, round2, str } from './collections-data.ts';
import { MP_APPROVED } from './collections-matching.ts';
import { isApprovedNotIssued, RS_APPROVED } from './collections-invoice-layer.ts';

// ---------- enums (verbatim from artifacts/tables/CreditCovers.json and ExposureItems.json) ----------
export const COVER_VALID = 'תקף';
export const COVER_PENDING = 'בטיפול';
export const COVER_CANCELLED = 'מבוטל';

export const IT_INVOICE = 'חשבונית פתוחה';
export const IT_DELIVERY = 'תעודת משלוח שלא חויבה';
export const IT_CHEQUE = 'צ׳ק שלא הופקד';
export const IT_ORDER = 'הזמנה פתוחה';
/** Fixed order of the breakdown groups on the tab. */
export const ITEM_TYPE_ORDER = [IT_INVOICE, IT_DELIVERY, IT_CHEQUE, IT_ORDER];

// ---------- output vocabulary ----------
export const ADJ_RECEIPT = 'קבלה שטרם נרשמה ב-Priority';
export const LEVEL_OK = 'תקין';
export const LEVEL_HIGH = 'גבוה';
export const ALERT_HIGH_USE = 'ניצול גבוה';
export const ALERT_EXPIRY = 'פקיעה';

const REASON_RECEIPT = 'קבלה שאושרה אצלנו ועדיין לא סומנה כהונפקה ב-Priority';
const REASON_LEGACY_MATCH = 'התאמה שאושרה אצלנו ועדיין לא בוצעה ב-Priority';

// ---------- settings ----------
export const DEFAULT_THRESHOLD_PCT = 80;
/** The real lead time is still open with Yaniv; 30 days until then. */
export const DEFAULT_EXPIRY_ALERT_DAYS = 30;

export const thresholdPctOf = (settings: Map<string, string>) => numberSetting(settings, 'insuranceThresholdPct', DEFAULT_THRESHOLD_PCT);
export const expiryAlertDaysOf = (settings: Map<string, string>) => numberSetting(settings, 'coverExpiryAlertDays', DEFAULT_EXPIRY_ALERT_DAYS);

const byNewest = (a: Item, b: Item) =>
  sortableTime(b.syncedAt) - sortableTime(a.syncedAt) || sortableTime(b.validUntil) - sortableTime(a.validUntil) || Number(b.id ?? 0) - Number(a.id ?? 0);

/** The customer's current cover: status תקף (newest), else the newest cover; null without any cover. */
export function pickCover(covers: Item[]): Item | null {
  if (!covers.length) return null;
  const sorted = [...covers].sort(byNewest);
  return sorted.find((c) => str(c.status) === COVER_VALID) ?? sorted[0];
}

/** The customer's CustomerExposure row (one per customer; the newest if there are more). */
export function pickExposure(rows: Item[]): Item | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => sortableTime(b.asOf) - sortableTime(a.asOf) || Number(b.id ?? 0) - Number(a.id ?? 0))[0];
}

export const groupByCode = (rows: Item[]) => {
  const m = new Map<string, Item[]>();
  for (const r of rows) {
    const code = str(r.customerCode).trim();
    if (!code) continue;
    if (!m.has(code)) m.set(code, []);
    m.get(code)!.push(r);
  }
  return m;
};

// ---------- sources ----------
export interface CreditSources {
  covers: Item[];
  exposures: Item[];
  /** ExposureItems (empty when not loaded). */
  items: Item[];
  /** Receipts approved here (אושרה – לא נשלחה), not yet marked issued in Priority. */
  readyReceipts: Item[];
  /** MatchProposals in אושרה – לביצוע ב-Priority (legacy approvals; those without receiptKey count). */
  approvedProposals: Item[];
}

/**
 * Reads everything the credit view needs. codes = the customers of interest; null = every customer with a cover
 * (alerts mode). The adjustment sources are small working sets and are read whole, then filtered in memory.
 */
export async function loadCreditSources(client: BlocksClient, codes: string[] | null, opts: { items?: boolean } = {}): Promise<CreditSources> {
  const [covers, readyReceipts, approvedProposals] = await Promise.all([
    codes ? readWhereIn(client, 'CreditCovers', 'customerCode', codes) : readAll(client, 'CreditCovers'),
    readAll(client, 'Receipts', { column: 'receiptStatus', value: RS_APPROVED }),
    readAll(client, 'MatchProposals', { column: 'status', value: MP_APPROVED }),
  ]);
  const wanted = codes ?? [...new Set(covers.map((c) => str(c.customerCode).trim()).filter(Boolean))];
  const [exposures, items] = await Promise.all([
    wanted.length ? readWhereIn(client, 'CustomerExposure', 'customerCode', wanted) : Promise.resolve([] as Item[]),
    opts.items && wanted.length ? readWhereIn(client, 'ExposureItems', 'customerCode', wanted) : Promise.resolve([] as Item[]),
  ]);
  return { covers, exposures, items, readyReceipts, approvedProposals };
}

// ---------- adjustments (static → dynamic) ----------
export interface Adjustment {
  kind: string;
  amount: number;
  bankLineId: string | null;
  receiptKey: string | null;
  matchProposalId: string | null;
  valueDate: string | null;
  payerName: string | null;
  status: string;
  /** receipts only: Receipts.receiptStatus */
  receiptStatus?: string;
  reason: string;
}

/** customerCode → adjustments, each bank line counted once (the receipt first, then a legacy match). */
export function buildAdjustments(src: CreditSources): Map<string, Adjustment[]> {
  const out = new Map<string, Adjustment[]>();
  const seen = new Set<string>();
  const push = (code: string, a: Adjustment) => {
    if (!code || !(a.amount > 0)) return;
    if (a.bankLineId) {
      if (seen.has(a.bankLineId)) return;
      seen.add(a.bankLineId);
    }
    if (!out.has(code)) out.set(code, []);
    out.get(code)!.push(a);
  };

  // (1) receipts approved here and not yet in Priority (amount = the transfer amount)
  for (const r of src.readyReceipts) {
    if (!isApprovedNotIssued(r)) continue;
    push(str(r.customerCode).trim(), {
      kind: ADJ_RECEIPT,
      amount: round2(num(r.amount)),
      bankLineId: str(r.bankLineId) || null,
      receiptKey: str(r.receiptKey) || null,
      matchProposalId: str(r.matchProposalId) || null,
      valueDate: toIsraelDate(r.valueDate),
      payerName: str(r.payerName) || null,
      status: str(r.receiptStatus),
      receiptStatus: str(r.receiptStatus),
      reason: REASON_RECEIPT,
    });
  }
  // (2) legacy approved matches without a receipt
  for (const p of src.approvedProposals) {
    if (str(p.status) !== MP_APPROVED || str(p.receiptKey).trim()) continue;
    push(str(p.customerCode).trim(), {
      kind: ADJ_RECEIPT,
      amount: round2(num(p.amount)),
      bankLineId: str(p.bankLineId) || null,
      receiptKey: null,
      matchProposalId: str(p.id) || null,
      valueDate: toIsraelDate(p.valueDate),
      payerName: str(p.payerName) || null,
      status: str(p.status),
      reason: REASON_LEGACY_MATCH,
    });
  }
  for (const list of out.values()) list.sort((a, b) => sortableTime(a.valueDate) - sortableTime(b.valueDate) || b.amount - a.amount);
  return out;
}

// ---------- the view ----------
export interface UseLine {
  pct: number | null;
  amount: number | null;
  headroom: number | null;
  level: string | null;
}

export function useOf(amount: number | null, insured: number | null, thresholdPct: number): UseLine {
  if (amount === null || insured === null || insured <= 0) return { pct: null, amount, headroom: insured !== null && amount !== null ? round2(insured - amount) : null, level: null };
  const pct = round1((amount / insured) * 100);
  return { pct, amount, headroom: round2(insured - amount), level: pct >= thresholdPct ? LEVEL_HIGH : LEVEL_OK };
}

const itemView = (i: Item) => ({
  id: str(i.id) || null,
  reference: str(i.reference) || null,
  amount: round2(num(i.amount)),
  docDate: toIsraelDate(i.docDate),
  dueDate: toIsraelDate(i.dueDate),
});

/** ExposureItems grouped by itemType, every group in the fixed order (empty ones too), unknown types last. */
export function breakdownOf(items: Item[]) {
  const types = [...ITEM_TYPE_ORDER, ...[...new Set(items.map((i) => str(i.itemType)))].filter((t) => t && !ITEM_TYPE_ORDER.includes(t))];
  return types.map((itemType) => {
    const rows = items
      .filter((i) => str(i.itemType) === itemType)
      .map(itemView)
      .sort((a, b) => sortableTime(a.docDate) - sortableTime(b.docDate) || str(a.reference).localeCompare(str(b.reference), 'en', { numeric: true }));
    return { itemType, count: rows.length, total: round2(rows.reduce((s, r) => s + r.amount, 0)), items: rows };
  });
}

export function coverView(cover: Item | null, asOfDate: string, expiryDays: number) {
  if (!cover) return null;
  const validUntil = toIsraelDate(cover.validUntil);
  const daysToExpiry = validUntil ? diffDays(validUntil, asOfDate) : null;
  return {
    id: str(cover.id) || null,
    insurer: str(cover.insurer) || null,
    coverNo: str(cover.coverNo) || null,
    insuredAmount: numOrNull(cover.insuredAmount),
    validUntil,
    status: str(cover.status) || null,
    coverSource: str(cover.coverSource) || null,
    syncedAt: cover.syncedAt ? String(cover.syncedAt) : null,
    daysToExpiry,
    expiringSoon: daysToExpiry !== null && daysToExpiry <= expiryDays,
    expired: daysToExpiry !== null && daysToExpiry < 0,
  };
}

export interface CreditViewArgs {
  customerCode: string;
  asOfDate: string;
  thresholdPct: number;
  expiryDays: number;
  covers: Item[];
  exposures: Item[];
  items: Item[];
  adjustments: Adjustment[];
}

/** Everything the tab shows for one customer. insured = the customer has a cover (else no tab). */
export function creditViewOf(a: CreditViewArgs) {
  const coverRow = pickCover(a.covers);
  const cover = coverView(coverRow, a.asOfDate, a.expiryDays);
  const exposure = pickExposure(a.exposures);
  const staticAmount = exposure ? numOrNull(exposure.obligoTotal) : null;
  const adjustmentsTotal = round2(a.adjustments.reduce((s, x) => s + x.amount, 0));
  // never below zero: an adjustment can only bring the obligo down to nothing
  const dynamicAmount = staticAmount === null ? null : Math.max(0, round2(staticAmount - adjustmentsTotal));
  const cheques = a.items
    .filter((i) => str(i.itemType) === IT_CHEQUE)
    .map(itemView)
    .sort((x, y) => sortableTime(x.dueDate) - sortableTime(y.dueDate));
  const chequesTotal = round2(cheques.reduce((s, c) => s + c.amount, 0));
  const insured = cover?.insuredAmount ?? null;
  return {
    insured: !!cover,
    cover,
    staticObligo: {
      amount: staticAmount,
      asOf: exposure?.asOf ? String(exposure.asOf) : null,
      syncedAt: exposure?.syncedAt ? String(exposure.syncedAt) : null,
    },
    dynamicObligo: {
      amount: dynamicAmount,
      staticAmount,
      adjustmentsTotal,
      adjustments: a.adjustments,
      undepositedCheques: cheques,
      chequesTotal,
      afterDeposit: dynamicAmount === null ? null : round2(dynamicAmount - chequesTotal),
    },
    use: {
      thresholdPct: a.thresholdPct,
      insuredAmount: insured,
      static: useOf(staticAmount, insured, a.thresholdPct),
      dynamic: useOf(dynamicAmount, insured, a.thresholdPct),
      afterDeposit: useOf(dynamicAmount === null ? null : round2(dynamicAmount - chequesTotal), insured, a.thresholdPct),
    },
    breakdown: breakdownOf(a.items),
  };
}

export type CreditView = ReturnType<typeof creditViewOf>;

export const BASIS_INSURANCE = 'ביטוח אשראי';
export const BASIS_CREDIT_LIMIT = 'מסגרת אשראי';

/**
 * The tab's use (since 01.11 the card shows the אובליגו tab for every customer): with a cover, use against the
 * insured amount as is (basis ביטוח אשראי); without one, against the Priority credit limit (Customers.creditLimit,
 * basis מסגרת אשראי); with neither, null. basisAmount = the amount the % is measured against.
 */
export function tabUseOf(view: CreditView, creditLimit: number | null, thresholdPct: number) {
  if (view.cover) return { ...view.use, basis: BASIS_INSURANCE, basisAmount: view.use.insuredAmount, creditLimit };
  if (creditLimit === null || !(creditLimit > 0)) return null;
  const dynamicAmount = view.dynamicObligo.amount;
  const afterDeposit = view.dynamicObligo.afterDeposit;
  return {
    thresholdPct,
    insuredAmount: null,
    basis: BASIS_CREDIT_LIMIT,
    basisAmount: creditLimit,
    creditLimit,
    static: useOf(view.staticObligo.amount, creditLimit, thresholdPct),
    dynamic: useOf(dynamicAmount, creditLimit, thresholdPct),
    afterDeposit: useOf(afterDeposit, creditLimit, thresholdPct),
  };
}

/** Credit views of many customers from one CreditSources read. */
export function creditViewsFor(src: CreditSources, codes: string[], asOfDate: string, thresholdPct: number, expiryDays: number): Map<string, CreditView> {
  const covers = groupByCode(src.covers);
  const exposures = groupByCode(src.exposures);
  const items = groupByCode(src.items);
  const adjustments = buildAdjustments(src);
  const out = new Map<string, CreditView>();
  for (const code of codes) {
    out.set(
      code,
      creditViewOf({
        customerCode: code,
        asOfDate,
        thresholdPct,
        expiryDays,
        covers: covers.get(code) ?? [],
        exposures: exposures.get(code) ?? [],
        items: items.get(code) ?? [],
        adjustments: adjustments.get(code) ?? [],
      }),
    );
  }
  return out;
}

/** Codes of the customers whose current cover is תקף. */
export function insuredCodes(covers: Item[]): string[] {
  const byCode = groupByCode(covers);
  return [...byCode.entries()].filter(([, list]) => str(pickCover(list)?.status) === COVER_VALID).map(([code]) => code).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
}

/** The alerts of היום: ניצול גבוה on the DYNAMIC use, פקיעה when the cover expires soon. Cover תקף only. */
export function alertsOf(rows: { customerCode: string; customerName: string | null; bookkeeperName: string | null; view: CreditView }[]) {
  const alerts: Item[] = [];
  for (const r of rows) {
    const { view } = r;
    if (!view.cover || view.cover.status !== COVER_VALID) continue;
    const base = {
      customerCode: r.customerCode,
      customerName: r.customerName,
      bookkeeperName: r.bookkeeperName,
      insurer: view.cover.insurer,
      coverNo: view.cover.coverNo,
      insuredAmount: view.cover.insuredAmount,
      staticAmount: view.staticObligo.amount,
      dynamicAmount: view.dynamicObligo.amount,
      staticPct: view.use.static.pct,
      dynamicPct: view.use.dynamic.pct,
      thresholdPct: view.use.thresholdPct,
      validUntil: view.cover.validUntil,
      daysToExpiry: view.cover.daysToExpiry,
    };
    if (view.use.dynamic.level === LEVEL_HIGH) alerts.push({ kind: ALERT_HIGH_USE, ...base });
    if (view.cover.expiringSoon) alerts.push({ kind: ALERT_EXPIRY, ...base });
  }
  return alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === ALERT_HIGH_USE ? -1 : 1;
    if (a.kind === ALERT_HIGH_USE) return (b.dynamicPct ?? 0) - (a.dynamicPct ?? 0);
    return (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0);
  });
}
