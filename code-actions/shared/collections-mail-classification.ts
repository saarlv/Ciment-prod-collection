// Maya's structured sorting of one email: parsing (object, JSON string, wrappers) and the code's checks of every
// item against the mail itself and the data. Pure functions; ApplyMailClassification reads and writes.
import type { Item } from './blocks/blocks-client.ts';
import { isValidDate } from './collections-dates.ts';
import { round2, str } from './collections-data.ts';
import { EMAIL_CATEGORIES } from './collections-mail.ts';
import { CAT_IRRELEVANT, hasDateWords, normQuote, numbersIn, orderCategories, quoteFound, SENDER_ROLES } from './collections-inbox.ts';

export interface RawClassification {
  types: { type: string; quote: string }[];
  customerCode: string | null;
  senderRole: string | null;
  invoices: { invoiceNumber: string; quote: string }[];
  promise: { amount: number | null; date: string | null; method: string | null; quote: string; invoiceNumbers: string[] } | null;
  /** a payment conditioned on a fix, or a claim that an invoice is wrong */
  dispute: { reason: string; invoiceNumbers: string[]; quote: string } | null;
  summary: string;
  /** the sender's signature block / letterhead / logo text as Maya read it (plan 04.11 part C) */
  signature: RawSignature | null;
}

export interface RawSignature {
  companyName: string | null;
  personName: string | null;
  title: string | null;
  logoText: string | null;
  quote: string;
}

/** The payment methods a promise may name (kept on Maya's proposal only). */
export const PROMISE_METHODS = ['העברה בנקאית', 'צ׳ק', 'צ׳ק דחוי', 'כרטיס אשראי'];

/** The dispute reasons Maya may give (the "בירור – <reason>" label of the CustomerNotes dispute note). */
export const DISPUTE_REASONS = ['מחיר', 'תעודת משלוח חסרה', 'כמות', 'איכות או החזרה', 'לא הוזמן', 'אחר'];

const numberList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x: any) => (typeof x === 'string' ? x : str(x?.invoiceNumber ?? x?.number)).trim()).filter(Boolean))] : [];

const WRAPPER_KEYS = ['answer', 'output', 'result', 'data', 'structuredOutput', 'structured_output', 'response', 'message', 'content', 'value', 'json'];

function parseJsonLoose(s: string): unknown {
  let t = s.trim();
  if (!t || t === 'undefined' || t === 'null') return null;
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const looksLikeClassification = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.types);

/**
 * The classification from whatever the workflow passed: an object, a JSON string (SendAgentMessage returns a
 * string), a fenced / double-encoded string, or any of those inside { answer | output | result | … } wrappers.
 * null when no object with a `types` array can be found.
 */
export function parseClassification(raw: unknown, depth = 0): RawClassification | null {
  if (depth > 5 || raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return parseClassification(parseJsonLoose(raw), depth + 1);
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v: any = raw;
  if (looksLikeClassification(v)) return normalise(v);
  for (const k of WRAPPER_KEYS) {
    if (v[k] !== undefined && v[k] !== null) {
      const inner = parseClassification(v[k], depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

function normalise(v: any): RawClassification {
  const types = (Array.isArray(v.types) ? v.types : [])
    .map((t: any) => (typeof t === 'string' ? { type: t, quote: '' } : { type: str(t?.type).trim(), quote: str(t?.quote) }))
    .filter((t: any) => t.type);
  const invoices = (Array.isArray(v.invoices) ? v.invoices : [])
    .map((i: any) => (typeof i === 'string' ? { invoiceNumber: i.trim(), quote: '' } : { invoiceNumber: str(i?.invoiceNumber ?? i?.number).trim(), quote: str(i?.quote) }))
    .filter((i: any) => i.invoiceNumber);
  const p = v.promise && typeof v.promise === 'object' ? v.promise : null;
  const amount = p && p.amount !== null && p.amount !== undefined && p.amount !== '' ? Number(String(p.amount).replace(/,/g, '')) : null;
  const d = v.dispute && typeof v.dispute === 'object' && !Array.isArray(v.dispute) ? v.dispute : null;
  const code = str(v.customerCode).trim();
  return {
    types,
    customerCode: code && code !== 'null' ? code : null,
    senderRole: str(v.senderRole).trim() || null,
    invoices,
    promise: p
      ? { amount: Number.isFinite(amount as number) ? (amount as number) : null, date: str(p.date).trim().slice(0, 10) || null, method: str(p.method).trim() || null, quote: str(p.quote), invoiceNumbers: numberList(p.invoiceNumbers) }
      : null,
    dispute: d ? { reason: str(d.reason).trim(), invoiceNumbers: numberList(d.invoiceNumbers), quote: str(d.quote) } : null,
    summary: str(v.summary).trim(),
    signature: signatureOf(v.signature),
  };
}

const textOrNull = (v: unknown) => {
  const t = str(v).trim();
  return t && t !== 'null' ? t : null;
};

function signatureOf(raw: unknown): RawSignature | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v: any = raw;
  const sig = { companyName: textOrNull(v.companyName), personName: textOrNull(v.personName), title: textOrNull(v.title), logoText: textOrNull(v.logoText), quote: str(v.quote) };
  return sig.companyName || sig.personName || sig.title || sig.logoText || sig.quote.trim() ? sig : null;
}

export interface Rejection {
  field: string;
  value: string;
  reason: string;
}

export interface Checked {
  types: { type: string; quote: string; verified: boolean }[];
  /** Verified types in folder order (לא רלוונטי dropped when a relevant type is there too). */
  categories: string[];
  invoices: { invoiceNumber: string; quote: string; verified: boolean; belongsToCustomer: boolean }[];
  /** Verified invoice numbers of the chosen customer. */
  customerInvoices: string[];
  customerCode: string | null;
  customerFromMaya: boolean;
  /** invoiceNumbers: the promise's numbers written in the mail and of the customer (else the customer's verified invoices) */
  promise: { amount: number; date: string; method: string | null; quote: string; invoiceNumbers: string[] } | null;
  /** a verified dispute (quote found); invoiceNumbers: written in the mail and of the customer */
  dispute: { reason: string; quote: string; invoiceNumbers: string[] } | null;
  senderRole: string | null;
  summary: string;
  /** the signature with its quote checked: verified = the quote is in the mail; company / logo text kept only when found too */
  signature: (RawSignature & { verified: boolean; companyNameFound: boolean; logoTextFound: boolean }) | null;
  rejected: Rejection[];
}

/**
 * The code's checks: every quote must be in the subject, body or extracted attachment text; customerCode must
 * be a candidate IngestEmail gave; every invoice must exist and belong to the chosen customer; a promise counts
 * only with an amount and a date stated in its quote; a dispute only with its quote, and it takes its invoices out of
 * the promise (none left → no promise). Rejections carry their reason.
 */
export function checkClassification(args: {
  c: RawClassification;
  haystack: string;
  candidates: { customerCode: string }[];
  fallbackCustomerCode: string | null;
  invoiceRows: Item[];
}): Checked {
  const { c, haystack, candidates } = args;
  const rejected: Rejection[] = [];

  // types
  const types = c.types.map((t) => {
    if (!EMAIL_CATEGORIES.includes(t.type)) {
      rejected.push({ field: 'types', value: t.type, reason: 'סוג לא מוכר' });
      return { type: t.type, quote: t.quote, verified: false };
    }
    const ok = quoteFound(t.quote, haystack);
    if (!ok) rejected.push({ field: 'types', value: t.type, reason: str(t.quote).trim() ? 'הציטוט לא נמצא בנושא, בגוף או בקבצים' : 'אין ציטוט' });
    return { type: t.type, quote: t.quote, verified: ok };
  });
  let categories = orderCategories(types.filter((t) => t.verified).map((t) => t.type));
  if (categories.length > 1 && categories.includes(CAT_IRRELEVANT)) categories = categories.filter((x) => x !== CAT_IRRELEVANT);

  // customer
  let customerCode: string | null = null;
  let customerFromMaya = false;
  if (c.customerCode) {
    const hit = candidates.find((x) => x.customerCode.toLowerCase() === c.customerCode!.toLowerCase());
    if (hit) {
      customerCode = hit.customerCode;
      customerFromMaya = true;
    } else rejected.push({ field: 'customerCode', value: c.customerCode, reason: 'הקוד אינו ברשימת מועמדי הלקוח שהקוד מצא' });
  }
  if (!customerCode) customerCode = args.fallbackCustomerCode || null;

  // invoices
  const byNo = new Map<string, Item>();
  for (const r of args.invoiceRows) byNo.set(str(r.invoiceNumber).trim().toUpperCase(), r);
  const seen = new Set<string>();
  const invoices: Checked['invoices'] = [];
  for (const i of c.invoices) {
    const key = i.invoiceNumber.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byNo.get(key);
    const inMail = quoteFound(i.quote, haystack) && haystack.includes(normQuote(i.invoiceNumber));
    const number = row ? str(row.invoiceNumber) : i.invoiceNumber;
    const belongs = !!row && !!customerCode && str(row.customerCode) === customerCode;
    if (!inMail) rejected.push({ field: 'invoices', value: i.invoiceNumber, reason: 'מספר החשבונית או הציטוט לא נמצאו במייל או בקבצים' });
    else if (!row) rejected.push({ field: 'invoices', value: i.invoiceNumber, reason: 'החשבונית לא נמצאה במראה של Priority' });
    else if (!belongs) rejected.push({ field: 'invoices', value: i.invoiceNumber, reason: customerCode ? `החשבונית שייכת ללקוח ${str(row.customerCode)} ולא ל-${customerCode}` : 'הלקוח לא נקבע – אי אפשר לבדוק שייכות' });
    invoices.push({ invoiceNumber: number, quote: i.quote, verified: inMail && !!row, belongsToCustomer: belongs });
  }
  const customerInvoices = invoices.filter((i) => i.verified && i.belongsToCustomer).map((i) => i.invoiceNumber);

  // invoice numbers a promise / dispute names: written in the mail, in the mirror and of the chosen customer
  const ofCustomer = (field: string, nos: string[]): string[] => {
    const ok: string[] = [];
    for (const no of nos) {
      const row = byNo.get(no.toUpperCase());
      const number = row ? str(row.invoiceNumber) : no;
      if (ok.includes(number)) continue;
      if (!haystack.includes(normQuote(no))) rejected.push({ field, value: no, reason: 'מספר החשבונית לא נמצא במייל או בקבצים' });
      else if (!row) rejected.push({ field, value: no, reason: 'החשבונית לא נמצאה במראה של Priority' });
      else if (!customerCode || str(row.customerCode) !== customerCode)
        rejected.push({ field, value: no, reason: customerCode ? `החשבונית שייכת ללקוח ${str(row.customerCode)} ולא ל-${customerCode}` : 'הלקוח לא נקבע – אי אפשר לבדוק שייכות' });
      else ok.push(number);
    }
    return ok;
  };

  // dispute: its quote must be in the mail; a dispute is never a promise
  let dispute: Checked['dispute'] = null;
  if (c.dispute) {
    const d = c.dispute;
    if (!quoteFound(d.quote, haystack)) rejected.push({ field: 'dispute', value: str(d.quote).slice(0, 120), reason: str(d.quote).trim() ? 'ציטוט המחלוקת לא נמצא במייל' : 'אין ציטוט למחלוקת' });
    else dispute = { reason: DISPUTE_REASONS.includes(d.reason) ? d.reason : 'אחר', quote: d.quote, invoiceNumbers: ofCustomer('dispute', d.invoiceNumbers) };
  }

  // promise: amount and date must be stated in the quoted words
  let promise: Checked['promise'] = null;
  if (c.promise) {
    const p = c.promise;
    const quoteOk = quoteFound(p.quote, haystack);
    const amountOk = p.amount !== null && p.amount > 0 && numbersIn(p.quote).some((n) => Math.abs(n - (p.amount as number)) < 0.01);
    const dateOk = !!p.date && isValidDate(p.date) && hasDateWords(p.quote);
    if (!quoteOk) rejected.push({ field: 'promise', value: str(p.quote).slice(0, 120), reason: 'ציטוט ההבטחה לא נמצא במייל' });
    else if (!amountOk) rejected.push({ field: 'promise', value: str(p.amount), reason: 'הסכום לא מופיע בציטוט' });
    else if (!dateOk) rejected.push({ field: 'promise', value: str(p.date), reason: 'אין תאריך תקין שמופיע בציטוט' });
    else {
      const method = p.method && PROMISE_METHODS.find((m) => normQuote(m) === normQuote(p.method)) ? PROMISE_METHODS.find((m) => normQuote(m) === normQuote(p.method)) ?? null : null;
      const named = p.invoiceNumbers.length ? ofCustomer('promise', p.invoiceNumbers) : customerInvoices;
      // the dispute wins for the invoices it names
      const left = dispute ? named.filter((n) => !dispute!.invoiceNumbers.includes(n)) : named;
      if (dispute && named.length && !left.length) rejected.push({ field: 'promise', value: named.join(', '), reason: 'התשלום מותנה – החשבוניות במחלוקת, לא הוצעה הבטחה' });
      else promise = { amount: round2(p.amount as number), date: p.date as string, method, quote: p.quote, invoiceNumbers: left };
    }
  }

  // signature: its quote must be in the mail; the company name / logo text count only when written there too
  let signature: Checked['signature'] = null;
  if (c.signature) {
    const sg = c.signature;
    const verified = quoteFound(sg.quote, haystack);
    if (!verified) rejected.push({ field: 'signature', value: str(sg.quote).slice(0, 120), reason: str(sg.quote).trim() ? 'ציטוט החתימה לא נמצא במייל או בקבצים' : 'אין ציטוט לחתימה' });
    signature = {
      ...sg,
      verified,
      companyNameFound: verified && !!sg.companyName && quoteFound(sg.companyName, haystack),
      logoTextFound: verified && !!sg.logoText && quoteFound(sg.logoText, haystack),
    };
  }

  const senderRole = c.senderRole && SENDER_ROLES.includes(c.senderRole) ? c.senderRole : null;
  return { types, categories, invoices, customerInvoices, customerCode, customerFromMaya, promise, dispute, senderRole, summary: c.summary, signature, rejected };
}
