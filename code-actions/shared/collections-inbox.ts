// Component 04 · פניות – shared inbox rules (IngestEmail, FetchEmailAttachments, ApplyMailClassification,
// AttachThreadReply, SetEmailHandling):
// - handling states, sender roles, customer-match methods (exact enum values of InboundEmails)
// - customer candidates from the data (registered sender address, authorised sales agent, thread, invoice
//   numbers, signature, name in the text, domain) and the strongest one
// - hard sender verification: מאומת only for a registered contact of THAT customer, or a SalesAgent whose
//   authorizedCustomerCodes include it; signature / domain / name identify the customer only
// - the fixed-format Hebrew brief Maya sorts from
// - quote checking (normalised whitespace / punctuation / quotes)
// Pure functions only; the actions read and write.
import type { Item } from './blocks/blocks-client.ts';
import { isTestCode, splitList, str } from './collections-data.ts';
import {
  domainOf,
  EMAIL_CATEGORIES,
  nameVariants,
  normEmail,
  normText,
  NOT_VERIFIED,
  PUBLIC_DOMAINS,
  TO_CHECK,
  VERIFIED,
  verifySender,
  type VerificationStatus,
} from './collections-mail.ts';

// ---------- enums ----------

export const HS_OPEN = 'לא טופל';
export const HS_WAITING = 'ממתין';
export const HS_DONE = 'טופל';
export const HANDLING_STATES = [HS_OPEN, HS_WAITING, HS_DONE];

export const ROLE_CONTACT = 'איש קשר של הלקוח';
export const ROLE_AGENT = 'סוכן סימנט בשם הלקוח';
export const ROLE_LOGISTICS = 'איש לוגיסטיקה';
export const ROLE_OTHER = 'אחר';
export const SENDER_ROLES = [ROLE_CONTACT, ROLE_AGENT, ROLE_LOGISTICS, ROLE_OTHER];

export const M_ADDRESS = 'כתובת השולח';
export const M_AGENT = 'סוכן מורשה';
export const M_SIGNATURE = 'חתימה';
export const M_DOMAIN = 'דומיין';
export const M_NAME = 'שם בתוכן';
export const M_INVOICE = 'מספר חשבונית';
export const M_THREAD = 'שרשור';
export const M_NONE = 'לא זוהה';
export const MATCH_METHODS = [M_ADDRESS, M_AGENT, M_SIGNATURE, M_DOMAIN, M_NAME, M_INVOICE, M_THREAD, M_NONE];

export const BY_MAYA = 'מאיה';
export const BY_CODE = 'קוד';
export const SYSTEM_ACTOR = 'מערכת';

export const CAT_LEDGER = 'כרטסת';
export const CAT_OPEN_DEBTS = 'חובות פתוחים';
export const CAT_DOCUMENTS = 'תעודות וחשבוניות חסרות';
export const CAT_PRICE = 'הפרש מחיר';
export const CAT_REMITTANCE = 'פירוט תשלום';
export const CAT_INSURANCE = 'אישור ביטוח אשראי';
export const CAT_PROMISE = 'הבטחת תשלום';
export const CAT_OTHER = 'אחר';
export const CAT_IRRELEVANT = 'לא רלוונטי';
/** Folder order 1–5, אישור ביטוח אשראי, then הבטחת תשלום, אחר, לא רלוונטי. */
export const CATEGORY_ORDER = EMAIL_CATEGORIES;

/** Categories in folder order, de-duplicated, unknown values dropped. */
export function orderCategories(list: string[]): string[] {
  const set = new Set(list.map((c) => str(c).trim()));
  return CATEGORY_ORDER.filter((c) => set.has(c));
}

export const categoriesOf = (email: Item): string[] => {
  const list = splitList(email.categories);
  const primary = str(email.category).trim();
  return orderCategories(primary ? [primary, ...list] : list);
};

// ---------- people ----------

const activeRow = (r: Item) => !(r.active === false || r.active === 'false');

export function salesAgentsOf(address: string, salesAgents: Item[]): Item[] {
  const a = normEmail(address);
  if (!a) return [];
  return salesAgents.filter((s) => activeRow(s) && normEmail(s.email) === a);
}

export const authorizedCodesOf = (agent: Item) => splitList(agent.authorizedCustomerCodes);

/** senderRole from the data: registered contact → sales agent → logistics → אחר. */
export function senderRoleOf(address: string, data: { contacts: Item[]; salesAgents: Item[]; plContacts: Item[] }): string {
  const a = normEmail(address);
  if (!a) return ROLE_OTHER;
  if (data.contacts.some((c) => normEmail(c.email) === a)) return ROLE_CONTACT;
  if (salesAgentsOf(a, data.salesAgents).length) return ROLE_AGENT;
  if (data.plContacts.some((p) => activeRow(p) && normEmail(p.email) === a)) return ROLE_LOGISTICS;
  return ROLE_OTHER;
}

// ---------- hard verification ----------

export interface HardVerification {
  status: VerificationStatus;
  /** Hebrew: what the verification rests on. */
  basis: string;
  contactName: string;
  agentName: string;
  shortReason: string;
}

/**
 * מאומת only when the sender is a registered contact of `customerCode`, or an active SalesAgent whose
 * authorizedCustomerCodes include it. A domain-only match identifies the customer but stays לא מאומת; a contact
 * of another customer stays לבדיקה.
 */
export function verifyHard(args: {
  address: string;
  customerCode: string | null;
  contacts: Item[];
  customersByCode: Map<string, Item>;
  salesAgents: Item[];
}): HardVerification {
  const address = normEmail(args.address);
  const code = str(args.customerCode).trim();
  const v = verifySender(address, code || null, args.contacts, args.customersByCode);
  const label = (c: string) => `${str(args.customersByCode.get(c)?.customerName) || c} (${c})`;
  if (code && v.status === VERIFIED) {
    return {
      status: VERIFIED,
      basis: `איש קשר רשום ${v.contactName || 'ללא שם'}${v.contactRoles ? ` (${v.contactRoles})` : ''} של ${label(code)} – הכתובת ${address} רשומה בכרטיס הלקוח`,
      contactName: v.contactName,
      agentName: '',
      shortReason: v.shortReason,
    };
  }
  const agents = salesAgentsOf(address, args.salesAgents);
  if (code && agents.length) {
    const ok = agents.find((a) => authorizedCodesOf(a).includes(code));
    if (ok) {
      return {
        status: VERIFIED,
        basis: `סוכן סימנט ${str(ok.agentName) || address} מורשה לבקש בשם ${label(code)} (רשימת הלקוחות המורשים שלו)`,
        contactName: '',
        agentName: str(ok.agentName),
        shortReason: 'סוכן מורשה ללקוח',
      };
    }
    const a = agents[0];
    return {
      status: NOT_VERIFIED,
      basis: `${address} הוא סוכן סימנט ${str(a.agentName)}, אבל ${label(code)} אינו ברשימת הלקוחות המורשים שלו`,
      contactName: '',
      agentName: str(a.agentName),
      shortReason: 'סוכן שאינו מורשה ללקוח',
    };
  }
  if (!code) {
    return {
      status: v.status === VERIFIED ? NOT_VERIFIED : v.status === TO_CHECK && v.shortReason === 'רק הדומיין תואם לאיש קשר רשום' ? NOT_VERIFIED : v.status,
      basis: `הלקוח לא נקבע – ${v.reason}`,
      contactName: v.contactName,
      agentName: '',
      shortReason: 'הלקוח לא זוהה',
    };
  }
  if (v.status === TO_CHECK && v.shortReason === 'רק הדומיין תואם לאיש קשר רשום') {
    return { status: NOT_VERIFIED, basis: `${v.reason}. דומיין מזהה את הלקוח בלבד ואינו מאמת`, contactName: '', agentName: '', shortReason: v.shortReason };
  }
  return { status: v.status, basis: v.reason, contactName: v.contactName, agentName: '', shortReason: v.shortReason };
}

// ---------- customer candidates ----------

export interface Candidate {
  customerCode: string;
  customerName: string;
  /** The strongest way it was found (InboundEmails.customerMatchMethod value). */
  method: string;
  methods: string[];
  score: number;
}

const WEIGHT: Record<string, number> = {
  [M_ADDRESS]: 100,
  [M_THREAD]: 90,
  [M_AGENT]: 70,
  [M_INVOICE]: 50,
  [M_SIGNATURE]: 35,
  [M_NAME]: 25,
  [M_DOMAIN]: 15,
};

/** The last lines of the body (after a closing like בברכה / תודה when there is one): where a signature lives. */
export function signatureBlock(body: string): string {
  const lines = str(body).replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^(בברכה|בכבוד רב|תודה|תודה רבה|רב תודות|best regards|regards|thanks)[,.!]?\s*$/i.test(lines[i])) {
      idx = i;
      break;
    }
  }
  if (idx >= 0) return lines.slice(idx + 1, idx + 13).join('\n');
  return nonEmpty.slice(-8).join('\n');
}

/** Longest name variant of a customer that appears in `hay` (normalised text), or 0. */
function nameHit(hay: string, customerName: unknown): number {
  let len = 0;
  for (const v of nameVariants(customerName)) if (v.length > len && v.replace(/[^א-תa-z0-9]/g, '').length >= 4 && hay.includes(v)) len = v.length;
  return len;
}

/**
 * Customer candidates for one email, strongest first. Every source is data: registered contact address,
 * an active sales agent's authorised customers (corroborated by the text when the agent has several), the
 * thread's record, invoice numbers of the customer in the text, the customer's name in the signature or the
 * text, and the sender's (non free-mail) domain shared with a registered contact.
 */
export function buildCandidates(args: {
  address: string;
  subject: string;
  body: string;
  contacts: Item[];
  customers: Item[];
  salesAgents: Item[];
  invoicesMentioned: Item[];
  threadCustomer?: { customerCode: string; customerName?: string } | null;
  max?: number;
}): Candidate[] {
  const byCode = new Map(args.customers.map((c) => [str(c.customerCode), c]));
  const nameOf = (code: string) => str(byCode.get(code)?.customerName) || str(args.contacts.find((c) => str(c.customerCode) === code)?.customerName) || code;
  const found = new Map<string, Set<string>>();
  const add = (code: string, method: string) => {
    const c = str(code).trim();
    if (!c) return;
    if (!found.has(c)) found.set(c, new Set());
    found.get(c)!.add(method);
  };
  const address = normEmail(args.address);
  const text = `${args.subject}\n${args.body}`;
  const hay = normText(text);
  const sigHay = normText(signatureBlock(args.body));

  // 1. registered contact address
  if (address) for (const c of args.contacts) if (normEmail(c.email) === address) add(str(c.customerCode), M_ADDRESS);
  // 2. thread
  if (args.threadCustomer?.customerCode) add(args.threadCustomer.customerCode, M_THREAD);
  // 3. invoice numbers of the customer in the text
  const invoiceCodes = new Set<string>();
  for (const inv of args.invoicesMentioned) {
    const code = str(inv.customerCode).trim();
    if (code) {
      invoiceCodes.add(code);
      add(code, M_INVOICE);
    }
  }
  // 4. name in the signature / in the text (customers with a name hit)
  const nameHits: { code: string; len: number; sig: boolean }[] = [];
  if (hay) {
    for (const c of args.customers) {
      const code = str(c.customerCode);
      if (!code) continue;
      const len = nameHit(hay, c.customerName);
      if (!len) continue;
      nameHits.push({ code, len, sig: !!sigHay && nameHit(sigHay, c.customerName) > 0 });
    }
    nameHits.sort((a, b) => b.len - a.len);
    for (const h of nameHits.slice(0, 6)) add(h.code, h.sig ? M_SIGNATURE : M_NAME);
  }
  const codeInText = (code: string) => new RegExp(`(^|[^0-9A-Za-z])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9A-Za-z]|$)`, 'i').test(text);
  // 5. authorised sales agent: an authorised customer the text points at; a single authorised customer as is
  for (const agent of salesAgentsOf(address, args.salesAgents)) {
    const codes = authorizedCodesOf(agent);
    const corroborated = codes.filter((code) => found.has(code) || invoiceCodes.has(code) || codeInText(code) || nameHit(hay, nameOf(code)) > 0);
    if (corroborated.length) corroborated.forEach((code) => add(code, M_AGENT));
    else if (codes.length === 1) add(codes[0], M_AGENT);
  }
  // 6. domain shared with a registered contact (never a free-mail domain)
  const domain = domainOf(address);
  if (domain && !PUBLIC_DOMAINS.has(domain)) {
    for (const c of args.contacts) if (normEmail(c.email) && domainOf(normEmail(c.email)) === domain) add(str(c.customerCode), M_DOMAIN);
  }

  const out: Candidate[] = [...found.entries()].map(([code, set]) => {
    const methods = [...set].sort((a, b) => (WEIGHT[b] ?? 0) - (WEIGHT[a] ?? 0));
    return { customerCode: code, customerName: nameOf(code), method: methods[0], methods, score: methods.reduce((s, m) => s + (WEIGHT[m] ?? 0), 0) };
  });
  out.sort((a, b) => b.score - a.score || a.customerCode.localeCompare(b.customerCode, 'en', { numeric: true }));
  return out.slice(0, args.max ?? 10);
}

/** Test-data separation is retired (real Priority data only): no candidate is test data. */
const isFixtureCandidate = (_c: Candidate, _byCode: Map<string, Item>) => {
  return false;
};

/** The strongest candidate: the unique top score; a tie between a test and a real customer goes by the mail being test data. */
export function pickCandidate(candidates: Candidate[], customers: Item[], preferTest: boolean): Candidate | null {
  if (!candidates.length) return null;
  const top = candidates[0].score;
  const best = candidates.filter((c) => c.score === top);
  if (best.length === 1) return best[0];
  const byCode = new Map(customers.map((c) => [str(c.customerCode), c]));
  const pref = best.filter((c) => isFixtureCandidate(c, byCode) === preferTest);
  return pref.length === 1 ? pref[0] : null;
}

/** What InboundEmails.classificationQuotes.candidates stores. */
export const storedCandidates = (cs: Candidate[]) => cs.map((c) => ({ customerCode: c.customerCode, customerName: c.customerName, method: c.method }));

/** Candidates back from classificationQuotes (tolerates a JSON string). */
export function readQuotes(raw: unknown): Item {
  let v: any = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// ---------- Maya's promise proposal (classificationQuotes.promise) ----------
/** Maya proposes; a person approves it in the email panel (AddCustomerNote with sourceEmailId → one התחייבות לתשלום note). */
export const PROPOSAL_PENDING = 'ממתינה לאישור';
export const PROPOSAL_APPROVED = 'אושרה';
/** waitingFor while the proposal waits for a person (the email stays לא טופל). */
export const WAIT_PROMISE_APPROVAL = 'ממתין לאישור הבטחה';
/** The inbox task title prefix while a proposal waits. */
export const TITLE_PROMISE_APPROVAL = 'לאשר הבטחה מהמייל';

/** The proposal stored on the email, or null. */
export function promiseProposalOf(email: Item): Item | null {
  const p = readQuotes(email.classificationQuotes).promise;
  return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
}

/** A proposal waiting for approval (not yet approved). */
export function pendingPromiseOf(email: Item): Item | null {
  const p = promiseProposalOf(email);
  return p && str(p.status).trim() === PROPOSAL_PENDING && !str(p.approvedPromiseId).trim() ? p : null;
}

export function candidatesOf(email: Item): { customerCode: string; customerName: string; method: string }[] {
  const q = readQuotes(email.classificationQuotes);
  const list = Array.isArray(q.candidates) ? q.candidates : [];
  return list
    .filter((c: any) => c && str(c.customerCode).trim())
    .map((c: any) => ({ customerCode: str(c.customerCode).trim(), customerName: str(c.customerName), method: str(c.method) }));
}

// ---------- sender decision / signature (plan 04.11 part C) ----------
export interface SenderDecision {
  mode: 'confirm' | 'reject';
  customerCode: string | null;
  customerName: string | null;
  contactId: string | null;
  contactKey: string | null;
  decidedBy: string | null;
  decidedAt: string;
  note: string | null;
}

export function senderDecisionOf(email: Item): SenderDecision | null {
  const d = readQuotes(email.classificationQuotes).senderDecision;
  return d && typeof d === 'object' && (d.mode === 'confirm' || d.mode === 'reject') ? (d as SenderDecision) : null;
}

/** A person said this sender is not a customer contact: no "זה הלקוח?" task again. */
export const senderRejected = (email: Item) => senderDecisionOf(email)?.mode === 'reject';

export interface StoredSignature {
  companyName: string | null;
  personName: string | null;
  title: string | null;
  logoText: string | null;
  quote: string;
  verified: boolean;
}

/** The signature stored on the email (classificationQuotes.signature), or null. */
export function storedSignatureOf(email: Item): (StoredSignature & { suggestion?: Item | null }) | null {
  const s = readQuotes(email.classificationQuotes).signature;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
}

/** The Hebrew lines of a "זה הלקוח X?" task / card: signature, title, logo text. */
export function signatureLines(sig: Partial<StoredSignature> | null | undefined): string[] {
  if (!sig) return [];
  const out: string[] = [];
  if (str(sig.personName).trim()) out.push(`שם: ${str(sig.personName).trim()}`);
  if (str(sig.title).trim()) out.push(`תפקיד: ${str(sig.title).trim()}`);
  if (str(sig.companyName).trim()) out.push(`חברה בחתימה: ${str(sig.companyName).trim()}`);
  if (str(sig.logoText).trim()) out.push(`לוגו: ${str(sig.logoText).trim()}`);
  if (str(sig.quote).trim()) out.push(`החתימה: "${str(sig.quote).trim().replace(/\s*\n\s*/g, ' / ').slice(0, 300)}"`);
  return out;
}

// ---------- the brief ----------

export const FILE_TEXT_CAP = 6000;
export const TOTAL_TEXT_CAP = 20000;

export interface BriefFile {
  fileName: string;
  fileKind: string;
  extractionState: string;
  text?: string | null;
}

/**
 * Maya's sorting brief, in the fixed format:
 * משימה / שולח / מה ידוע על השולח / מועמדי לקוח (קוד | שם | איך נמצא) / נושא / קבצים מצורפים / גוף.
 * Each file's text is capped (FILE_TEXT_CAP) and all files together (TOTAL_TEXT_CAP).
 */
export function buildSortingBrief(a: {
  fromAddress: string;
  fromName?: string | null;
  verification: string;
  senderRole: string;
  verificationBasis: string;
  candidates: { customerCode: string; customerName: string; method: string }[];
  subject: string;
  files: BriefFile[] | null;
  /** Attachment names only (when the files were not fetched yet). */
  attachmentNames?: string[];
  body: string;
}): string {
  const sender = `${a.fromAddress || 'לא ידוע'}${str(a.fromName).trim() ? ` (${str(a.fromName).trim()})` : ''}`;
  const known = [a.verification || NOT_VERIFIED, a.senderRole || ROLE_OTHER, a.verificationBasis].filter((x) => str(x).trim()).join(' · ');
  const cands = a.candidates.length ? a.candidates.map((c) => `${c.customerCode} | ${c.customerName || c.customerCode} | ${c.method || M_NONE}`).join('\n') : 'אין';
  let files: string;
  if (a.files && a.files.length) {
    let budget = TOTAL_TEXT_CAP;
    files = a.files
      .map((f) => {
        const head = `${f.fileName} (${f.fileKind}, ${f.extractionState}):`;
        let text = str(f.text).trim();
        if (!text) return `${head}\n(לא חולץ טקסט – לפי שם הקובץ בלבד)`;
        const original = text.length;
        const cap = Math.max(0, Math.min(FILE_TEXT_CAP, budget));
        if (cap <= 0) return `${head}\n[התוכן הושמט – הגעת לתקרת הטקסט של כל הקבצים]`;
        if (text.length > cap) text = `${text.slice(0, cap)}\n[…קוצר, ${original} תווים במקור]`;
        budget -= Math.min(original, cap);
        return `${head}\n${text}`;
      })
      .join('\n');
  } else if (a.attachmentNames && a.attachmentNames.length) {
    files = a.attachmentNames.join(', ');
  } else files = 'אין';
  return [
    'משימה: מיון מייל נכנס',
    `שולח: ${sender}`,
    `מה ידוע על השולח: ${known}`,
    'מועמדי לקוח (קוד | שם | איך נמצא):',
    cands,
    `נושא: ${a.subject || '(ללא נושא)'}`,
    `קבצים מצורפים: ${files}`,
    'גוף:',
    a.body || '(ריק)',
  ].join('\n');
}

// ---------- quotes ----------

/** Lower-case, no quotes / punctuation / bidi marks, one space: for "does this quote appear in the mail". */
export function normQuote(s: unknown): string {
  return str(s)
    .toLowerCase()
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[׳״'"`’‘“”„«»]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the (normalised) quote appears in the (normalised) haystack. An empty quote never does. */
export function quoteFound(quote: unknown, normalisedHaystack: string): boolean {
  const q = normQuote(quote);
  if (!q) return false;
  return normalisedHaystack.includes(q);
}

/** Numbers written in a text ("12,500", "12500.50", "1.250,00" is read as 1250). */
export function numbersIn(text: unknown): number[] {
  const out: number[] = [];
  for (const m of str(text).matchAll(/\d[\d,.]*/g)) {
    let t = m[0].replace(/[.,]$/, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    const n = Number(t);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'מרס', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Does the text state a date (d/m, d.m, ISO, a Hebrew month, or a relative day like מחר / יום ה׳)? */
export function hasDateWords(text: unknown): boolean {
  const s = str(text);
  if (/\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/.test(s)) return true;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(s)) return true;
  if (HE_MONTHS.some((m) => s.includes(m))) return true;
  if (/(מחר|מחרתיים|היום|השבוע|שבוע הבא|בשבוע הבא|סוף החודש|סוף השבוע|תחילת החודש|יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|[א-ו][׳'])|עד\s+ה-?\s*\d{1,2}|ב-?\s*\d{1,2}\s+ל)/.test(s)) return true;
  return false;
}
