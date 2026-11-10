// Credit insurance (בסס״ח, ICIC API) – ground work only. Nothing here calls the insurer: no keys exist
// yet. ProposeInsuranceRequests builds increase proposals as CreditLimitRequests rows whose insurerFields
// preview the ICIC quota request field by field; DecideInsuranceRequest lets a person approve one to
// "אושר – לא הוגש". Increases of an existing cover only – never a request for a new customer.
import type { Item } from './blocks/blocks-client.ts';
import { formatDateHe, toIsraelDate } from './collections-dates.ts';
import { formatIls, isFixtureCustomer, num, round1, str } from './collections-data.ts';
import type { CreditView } from './collections-credit.ts';

// ---------- enums (verbatim from artifacts/tables/CreditLimitRequests.json) ----------
export const REQ_DRAFT = 'טיוטה';
export const REQ_PROPOSED = 'הוצעה ע״י הסוכנת';
export const REQ_APPROVED_NOT_SUBMITTED = 'אושר – לא הוגש';
export const REQ_WAITING_SUBMIT = 'ממתינה להגשה';
export const REQ_SUBMITTED = 'הוגשה למבטח';
/** A customer with a request in one of these statuses gets no second proposal. */
export const OPEN_REQUEST_STATUSES = [REQ_DRAFT, REQ_PROPOSED, REQ_APPROVED_NOT_SUBMITTED, REQ_WAITING_SUBMIT, REQ_SUBMITTED];

// ---------- outcomes per checked customer ----------
export const OUT_PROPOSED = 'הוצעה';
export const OUT_BELOW = 'מתחת לסף';
export const OUT_OPEN = 'יש בקשה פתוחה';
export const OUT_NO_COVER = 'אין מסגרת מבוטחת';

// ---------- settings (existing AgentSettings keys) ----------
export { DEFAULT_THRESHOLD_PCT } from './collections-credit.ts';
export const DEFAULT_INCREASE_PCT = 50;

// ---------- the ICIC request ----------
export const ICIC_API = 'ICIC';
export const REQUEST_TYPE_INCREASE = 'הגדלת מכסה';
export const COUNTRY_ISRAEL = 916;
export const CURRENCY_NIS = 'NIS';
export const PRODUCT_TYPE = 1;
export const F_FROM_DATA = 'מהנתונים';
export const F_CONSTANT = 'קבוע';
export const F_MISSING = 'חסר';
export const F_UNKNOWN = 'לא ידוע';
export const NOTE_MISSING = 'חסר בכרטיס הלקוח';
export const NOTE_ASK_YANIV = 'לא ידוע – לברר עם יניב';
const CREDIT_NOTE = 'חשבונית זיכוי';

export interface InsurerField {
  name: string;
  label: string;
  value: string | number | null;
  status: string;
  source: string;
  note: string;
}

export interface InsurerFields {
  api: string;
  requestType: string;
  fields: InsurerField[];
  missingFields: string[];
}

/** "85", "85.5" */
export const formatPct = (n: number) => String(round1(n));

/**
 * Use of the insured limit, % rounded to one decimal, on the DYNAMIC obligo (same rule as the ניצול גבוה alert of
 * GetCreditExposure); null without a cover in תקף or without an insured amount.
 */
export function usePctOf(view: CreditView | undefined | null): number | null {
  if (!view?.cover || view.cover.status !== 'תקף') return null;
  return view.use.dynamic.pct;
}

/** SUM_REQUESTED: the insured limit × (1 + increase%), whole shekels. */
export const sumRequested = (insured: number, increasePct: number) => Math.round(insured * (1 + increasePct / 100));

/**
 * Overdue debt on the aging report as of asOfDate: open documents (openAmount > 0, not a credit note) whose
 * due date is before asOfDate.
 */
export function overdueInvoices(invoices: Item[], customerCode: string, asOfDate: string): Item[] {
  return invoices
    .filter((i) => str(i.customerCode) === customerCode && num(i.openAmount) > 0 && str(i.documentType) !== CREDIT_NOTE)
    .filter((i) => {
      const due = toIsraelDate(i.dueDate);
      return !!due && due < asOfDate;
    })
    .sort((a, b) => str(toIsraelDate(a.dueDate)).localeCompare(str(toIsraelDate(b.dueDate))) || str(a.invoiceNumber).localeCompare(str(b.invoiceNumber), 'en', { numeric: true }));
}

const fromData = (name: string, label: string, raw: unknown, source: string): InsurerField => {
  const v = typeof raw === 'number' ? raw : str(raw).trim();
  const empty = v === '' || v === null || v === undefined;
  return empty
    ? { name, label, value: null, status: F_MISSING, source, note: NOTE_MISSING }
    : { name, label, value: v, status: F_FROM_DATA, source, note: '' };
};
const constant = (name: string, label: string, value: string | number, note = ''): InsurerField => ({
  name,
  label,
  value,
  status: F_CONSTANT,
  source: 'קבוע בבקשת ICIC',
  note,
});
const unknown = (name: string, label: string): InsurerField => ({ name, label, value: null, status: F_UNKNOWN, source: '', note: NOTE_ASK_YANIV });

/** The ICIC quota-increase request, field by field, in the order of the insurer's guide. */
export function buildInsurerFields(args: { customer: Item; cover: { insuredAmount: number | null; coverNo: string | null }; asOfDate: string; increasePct: number; overdue: Item[] }): InsurerFields {
  const { customer, cover, asOfDate, increasePct, overdue } = args;
  const insured = num(cover.insuredAmount);
  const indDebts = overdue.length ? 'Y' : 'N';
  const listed = overdue.slice(0, 3).map((i) => `${str(i.invoiceNumber)} (${formatIls(num(i.openAmount))} ש״ח, לתשלום עד ${formatDateHe(str(toIsraelDate(i.dueDate)))})`);
  const fields: InsurerField[] = [
    fromData('REGISTERED_NO', 'ח״פ', customer.companyId, 'כרטיס הלקוח – ח״פ'),
    fromData('BUYER_NAME', 'שם הקונה', customer.customerName, 'כרטיס הלקוח – שם'),
    fromData('BUYER_ADDRESS', 'כתובת הקונה', customer.address, 'כרטיס הלקוח – כתובת'),
    constant('COUNTRY_NO', 'ארץ', COUNTRY_ISRAEL, 'ישראל'),
    constant('CURRENCY_CODE', 'מטבע', CURRENCY_NIS),
    constant('PRODUCT_TYPE', 'סוג מוצר', PRODUCT_TYPE),
    {
      name: 'SUM_REQUESTED',
      label: 'סכום מבוקש',
      value: sumRequested(insured, increasePct),
      status: F_FROM_DATA,
      source: `המסגרת המבוטחת ${formatIls(insured)} ש״ח × (1 + ${formatPct(increasePct)}%)`,
      note: '',
    },
    fromData('ORIG_COVER_NO', 'מספר מכסה קיימת', cover.coverNo, 'מכסת הביטוח (CreditCovers) – מספר המכסה אצל המבטח'),
    {
      name: 'IND_DEBTS',
      label: 'פיגור בחובות',
      value: indDebts,
      status: F_FROM_DATA,
      source: `דוח הגיול נכון ל-${formatDateHe(asOfDate)}`,
      note: overdue.length
        ? `${overdue.length === 1 ? 'חשבונית פתוחה אחת' : `${overdue.length} חשבוניות פתוחות`} שמועד פירעונן עבר: ${listed.join(', ')}${overdue.length > 3 ? ` ועוד ${overdue.length - 3}` : ''}`
        : 'אין חשבונית פתוחה שמועד פירעונה עבר',
    },
    unknown('CREDIT_DAYS', 'ימי אשראי'),
    unknown('PAYTERMS_CODE', 'קוד תנאי תשלום'),
  ];
  return {
    api: ICIC_API,
    requestType: REQUEST_TYPE_INCREASE,
    fields,
    missingFields: fields.filter((f) => f.status === F_MISSING || f.status === F_UNKNOWN).map((f) => f.name),
  };
}

/** One Hebrew sentence for the request row. */
export function justificationOf(args: { usePct: number; obligoUsed: number; insured: number; thresholdPct: number; increasePct: number; requested: number; indDebts: string }) {
  const a = args;
  const vsThreshold = a.usePct === a.thresholdPct ? `הגיע לסף ${formatPct(a.thresholdPct)}%` : `מעל סף ${formatPct(a.thresholdPct)}%`;
  return (
    `ניצול ${formatPct(a.usePct)}% מהמסגרת המבוטחת (${formatIls(a.obligoUsed)} מתוך ${formatIls(a.insured)} ש״ח) – ${vsThreshold}. ` +
    `מוצעת הגדלה של ${formatPct(a.increasePct)}% ל-${formatIls(a.requested)} ש״ח. פיגור בדוח הגיול: ${a.indDebts === 'Y' ? 'כן' : 'לא'}.`
  );
}

export interface ProposalArgs {
  asOfDate: string;
  nowIso: string;
  thresholdPct: number;
  increasePct: number;
  proposedBy: string;
  /** The insured customers to check: code, the Customers row (may be missing) and the credit view. */
  customers: { customerCode: string; customerName?: string | null; customer: Item | undefined; view: CreditView | undefined }[];
  /** customerCode → owning bookkeeper (CustomerOwners first, else the customer card). */
  ownerOf: (code: string, customer: Item | undefined) => string;
  /** Requests of the checked customers (any status). */
  requests: Item[];
  invoices: Item[];
}

/**
 * Pure decision per insured customer: propose when use% (1 decimal) >= threshold and no open request.
 * Returns the customer list (every customer checked) and the rows to write.
 */
export function planProposals(a: ProposalArgs) {
  const customers: Item[] = [];
  const rows: Item[] = [];
  for (const entry of a.customers) {
    const code = entry.customerCode;
    const c: Item = entry.customer ?? { customerCode: code, customerName: entry.customerName ?? null };
    const credit = entry.view;
    const insured = num(credit?.cover?.insuredAmount);
    const obligoUsed = num(credit?.dynamicObligo.amount);
    const usePct = usePctOf(credit);
    const isTest = isFixtureCustomer(entry.customer, code);
    const owner = a.ownerOf(code, entry.customer);
    const view: Item = {
      customerCode: code,
      customerName: str(c.customerName),
      insuredLimit: credit?.cover ? insured : null,
      coverNo: credit?.cover?.coverNo ?? null,
      obligoUsed,
      staticObligo: credit?.staticObligo.amount ?? null,
      staticPct: credit?.cover?.status === 'תקף' ? credit.use.static.pct : null,
      usePct,
      thresholdPct: a.thresholdPct,
      outcome: '',
      openRequestId: null,
      openRequestStatus: null,
      requestedLimit: null,
      assignedBookkeeperName: owner || null,
      isTestFixture: isTest,
    };
    customers.push(view);
    if (usePct === null) {
      view.outcome = OUT_NO_COVER;
      continue;
    }
    if (usePct < a.thresholdPct) {
      view.outcome = OUT_BELOW;
      continue;
    }
    const open = a.requests
      .filter((r) => str(r.customerCode) === code && OPEN_REQUEST_STATUSES.includes(str(r.status)))
      .sort((x, y) => Number(x.id) - Number(y.id))[0];
    if (open) {
      view.outcome = OUT_OPEN;
      view.openRequestId = open.id !== undefined && open.id !== null ? String(open.id) : null;
      view.openRequestStatus = str(open.status);
      continue;
    }
    const overdue = overdueInvoices(a.invoices, code, a.asOfDate);
    const insurerFields = buildInsurerFields({ customer: c, cover: { insuredAmount: insured, coverNo: credit?.cover?.coverNo ?? null }, asOfDate: a.asOfDate, increasePct: a.increasePct, overdue });
    const requested = sumRequested(insured, a.increasePct);
    const indDebts = overdue.length ? 'Y' : 'N';
    view.outcome = OUT_PROPOSED;
    view.requestedLimit = requested;
    view.indDebts = indDebts;
    view.missingFields = insurerFields.missingFields;
    rows.push({
      customerCode: code,
      customerName: str(c.customerName) || null,
      currentLimit: insured,
      obligoPct: usePct,
      requestedLimit: requested,
      justification: justificationOf({ usePct, obligoUsed, insured, thresholdPct: a.thresholdPct, increasePct: a.increasePct, requested, indDebts }),
      status: REQ_PROPOSED,
      requestCreatedAt: a.nowIso,
      triggeredAtPct: usePct,
      companyId: str(c.companyId).trim() || null,
      currency: 'ILS',
      insuredLimitAtRequest: insured,
      insurerFields,
      assignedBookkeeperName: owner || null,
      proposedBy: a.proposedBy,
      decidedBy: null,
      decidedAt: null,
      submittedAt: null,
      approvedAmount: null,
      insurerCaseNumber: null,
      insurerResponseNote: null,
      isTestFixture: isTest,
    });
  }
  customers.sort((x, y) => (y.usePct ?? -1) - (x.usePct ?? -1) || str(x.customerCode).localeCompare(str(y.customerCode), 'en', { numeric: true }));
  return { customers, rows };
}
