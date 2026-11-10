// Shared inbound-mail rules for Ciment Collections: sender address parsing, sender verification
// against CustomerContacts (VerifySender, IngestEmail, ClassifyAndLinkEmail, CreateReplyDraft all use
// the same function), customer identification from an email, and provider-value normalisation.
// Pure functions only; the actions do the reading and writing.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { isTestCode, readAll, readWhereIn, str } from './collections-data.ts';

export type VerificationStatus = 'מאומת' | 'לא מאומת' | 'לבדיקה';

export const VERIFIED: VerificationStatus = 'מאומת';
export const NOT_VERIFIED: VerificationStatus = 'לא מאומת';
export const TO_CHECK: VerificationStatus = 'לבדיקה';

/** Categories whose reply carries customer financial data: only a מאומת sender may receive them. */
export const DATA_CATEGORIES = ['כרטסת', 'חובות פתוחים'];

export const EMAIL_CATEGORIES = [
  'כרטסת',
  'חובות פתוחים',
  'תעודות וחשבוניות חסרות',
  'הפרש מחיר',
  'פירוט תשלום',
  'אישור ביטוח אשראי',
  'הבטחת תשלום',
  'אחר',
  'לא רלוונטי',
];
export const IRRELEVANT = 'לא רלוונטי';

export const FIXTURE_NAME_PREFIX = 'בדיקה – ';
export const DEFAULT_TEST_LABEL = 'Ciment-Test';
export const SIGNATURE_DEPARTMENT = 'מחלקת הנהלת חשבונות, סימנט';

/**
 * Free-mail domains: two people sharing gmail.com say nothing about belonging to the same company,
 * so a domain-only match is never drawn from these.
 */
export const PUBLIC_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.co.il',
  'hotmail.com',
  'hotmail.co.il',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.il',
  'icloud.com',
  'me.com',
  'aol.com',
  'walla.co.il',
  'walla.com',
  'bezeqint.net',
  'netvision.net.il',
  'zahav.net.il',
  '012.net.il',
  '013.net',
  'smile.net.il',
  'inter.net.il',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
]);

// ---------- provider values ----------

/** Template values a workflow passes for a missing field ("", "undefined", "null") → ''. */
export function clean(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  const s = String(v).trim();
  return s === 'undefined' || s === 'null' ? '' : s;
}

const EMAIL_RE = /[A-Za-z0-9._%+'\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;

/**
 * "מיכל לוי <michal@x.com>", "\"Levi, Michal\" <michal@x.com>", "<michal@x.com>", "michal@x.com",
 * "michal@x.com (מיכל לוי)", "mailto:michal@x.com" → { address (lower-case), name }.
 */
export function parseAddress(raw: unknown, fallbackName?: unknown): { address: string; name: string } {
  const s = clean(raw);
  let name = '';
  let address = '';
  const angle = /^(.*?)<\s*([^<>]+?)\s*>\s*(.*)$/.exec(s);
  if (angle) {
    name = angle[1].trim();
    const m = EMAIL_RE.exec(angle[2]);
    address = m ? m[0] : '';
  } else {
    const m = EMAIL_RE.exec(s);
    address = m ? m[0] : '';
    const paren = /\(([^()]+)\)/.exec(s);
    if (paren) name = paren[1].trim();
  }
  name = name.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\\"/g, '"').trim();
  if (!name || name.toLowerCase() === address.toLowerCase()) name = '';
  if (!name) name = clean(fallbackName);
  return { address: address.toLowerCase(), name };
}

export const normEmail = (v: unknown) => {
  const m = EMAIL_RE.exec(str(v));
  return m ? m[0].toLowerCase() : '';
};

export const domainOf = (address: string) => (address.includes('@') ? address.split('@').pop()!.toLowerCase() : '');

/**
 * Provider timestamp → ISO instant. Accepts epoch seconds, epoch milliseconds (number or numeric
 * string), ISO 8601 and RFC 2822. Returns { iso, parsed } – parsed=false when it fell back to now.
 */
export function parseReceivedAt(raw: unknown, now: Date = new Date()): { iso: string; parsed: boolean } {
  const s = typeof raw === 'number' ? String(raw) : clean(raw);
  if (s) {
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      const ms = n >= 1e12 ? n : n >= 1e9 ? n * 1000 : NaN;
      if (Number.isFinite(ms)) return { iso: new Date(ms).toISOString(), parsed: true };
    } else {
      const t = Date.parse(s);
      if (!Number.isNaN(t)) return { iso: new Date(t).toISOString(), parsed: true };
    }
  }
  return { iso: now.toISOString(), parsed: false };
}

/**
 * Attachment metadata from a provider (Gmail attachment_list: [{attachmentId, filename, mimeType}]),
 * possibly delivered as a JSON string by a workflow template. Names always; urls only when given.
 */
export function parseAttachments(raw: unknown): { names: string[]; urls: string[]; count: number } {
  let list: any = raw;
  if (typeof list === 'string') {
    const s = list.trim();
    if (!s || s === 'undefined' || s === 'null') list = [];
    else {
      try {
        list = JSON.parse(s);
      } catch {
        list = [];
      }
    }
  }
  if (list && !Array.isArray(list) && typeof list === 'object') list = [list];
  if (!Array.isArray(list)) list = [];
  const names: string[] = [];
  const urls: string[] = [];
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const name = clean(a.filename ?? a.fileName ?? a.name ?? a.title);
    const url = clean(a.url ?? a.fileUrl ?? a.downloadUrl ?? a.link);
    if (name) names.push(name.replace(/[\r\n]+/g, ' ').replace(/,/g, ' '));
    if (url) urls.push(url);
  }
  return { names, urls, count: list.length };
}

// ---------- verification ----------

export interface Verification {
  status: VerificationStatus;
  address: string;
  customerCode: string;
  customerName: string;
  contactName: string;
  contactRoles: string;
  /** Full Hebrew explanation from the data. */
  reason: string;
  /** Short form for task texts ("הכתובת לא רשומה אצל הלקוח"). */
  shortReason: string;
}

const nameOf = (code: string, customersByCode: Map<string, Item>, contacts: Item[]) =>
  str(customersByCode.get(code)?.customerName) || str(contacts.find((c) => str(c.customerCode) === code)?.customerName) || code;

const customerLabel = (code: string, customersByCode: Map<string, Item>, contacts: Item[]) =>
  `${nameOf(code, customersByCode, contacts)} (${code})`;

/** A contact flagged as the customer's accounts-payable (הנהלת חשבונות) contact – the only kind that verifies a sender. */
export const isApContactRow = (c: Item) => c?.isApContact === true || c?.isApContact === 'true';

/**
 * Sender verification against CustomerContacts (plan 04.11 part C: by isApContact).
 * - מאומת: the exact address is a contact of the customer flagged isApContact (with no customer given: an
 *   isApContact contact of exactly one customer). Priority rows and rows we added (source נוסף אצלנו) count alike.
 * - לבדיקה: the address is a contact of the customer that is not flagged isApContact, a contact of a different
 *   customer (or of several), or only the domain (never a free-mail domain) matches a contact of the customer.
 * - לא מאומת: no match.
 */
export function verifySender(
  rawAddress: unknown,
  customerCode: string | null | undefined,
  contacts: Item[],
  customersByCode: Map<string, Item>,
): Verification {
  const address = normEmail(rawAddress) || parseAddress(rawAddress).address;
  const code = clean(customerCode);
  const base = { address, customerCode: code, customerName: code ? nameOf(code, customersByCode, contacts) : '', contactName: '', contactRoles: '' };
  if (!address) {
    return { ...base, status: NOT_VERIFIED, reason: 'לא התקבלה כתובת שולח תקינה', shortReason: 'אין כתובת שולח' };
  }
  const withEmail = contacts.filter((c) => normEmail(c.email));
  const exact = withEmail.filter((c) => normEmail(c.email) === address);
  const exactCodes = [...new Set(exact.map((c) => str(c.customerCode)).filter(Boolean))];
  const domain = domainOf(address);
  const domainUsable = !!domain && !PUBLIC_DOMAINS.has(domain);

  if (code) {
    const own = exact.find((c) => str(c.customerCode) === code && isApContactRow(c));
    const ownNotAp = exact.find((c) => str(c.customerCode) === code && !isApContactRow(c));
    if (!own && ownNotAp) {
      return {
        ...base,
        status: TO_CHECK,
        contactName: str(ownNotAp.contactName),
        contactRoles: str(ownNotAp.roleFlags),
        reason: `הכתובת ${address} רשומה אצל ${customerLabel(code, customersByCode, contacts)} כאיש הקשר ${str(ownNotAp.contactName) || 'ללא שם'}, אבל לא מסומנת כאיש קשר בהנהלת חשבונות`,
        shortReason: 'הכתובת רשומה אצל הלקוח אך לא כהנהלת חשבונות',
      };
    }
    if (own) {
      return {
        ...base,
        status: VERIFIED,
        contactName: str(own.contactName),
        contactRoles: str(own.roleFlags),
        reason: `הכתובת ${address} רשומה אצל ${customerLabel(code, customersByCode, contacts)} כאיש הקשר ${str(own.contactName) || 'ללא שם'}${str(own.roleFlags) ? ` (${str(own.roleFlags)})` : ''}`,
        shortReason: 'הכתובת רשומה אצל הלקוח',
      };
    }
    if (exactCodes.length) {
      const other = exact.find((c) => str(c.customerCode) !== code)!;
      return {
        ...base,
        status: TO_CHECK,
        contactName: str(other.contactName),
        contactRoles: str(other.roleFlags),
        reason: `הכתובת ${address} רשומה אצל לקוח אחר: ${exactCodes.map((c) => customerLabel(c, customersByCode, contacts)).join(', ')}, ולא אצל ${customerLabel(code, customersByCode, contacts)}`,
        shortReason: 'הכתובת רשומה אצל לקוח אחר',
      };
    }
    if (domainUsable) {
      const sameDomain = withEmail.find((c) => str(c.customerCode) === code && domainOf(normEmail(c.email)) === domain);
      if (sameDomain) {
        return {
          ...base,
          status: TO_CHECK,
          reason: `רק הדומיין ${domain} תואם לאיש קשר רשום של ${customerLabel(code, customersByCode, contacts)} (${str(sameDomain.contactName) || 'ללא שם'}, ${normEmail(sameDomain.email)}); הכתובת ${address} עצמה לא רשומה`,
          shortReason: 'רק הדומיין תואם לאיש קשר רשום',
        };
      }
    }
    return {
      ...base,
      status: NOT_VERIFIED,
      reason: `הכתובת ${address} לא רשומה באנשי הקשר של ${customerLabel(code, customersByCode, contacts)}`,
      shortReason: 'הכתובת לא רשומה אצל הלקוח',
    };
  }

  // no customer given
  const apExact = exact.filter(isApContactRow);
  const apCodes = [...new Set(apExact.map((c) => str(c.customerCode)).filter(Boolean))];
  if (exactCodes.length === 1 && !apCodes.length) {
    const c = exact[0];
    const only = exactCodes[0];
    return {
      ...base,
      status: TO_CHECK,
      customerCode: only,
      customerName: nameOf(only, customersByCode, contacts),
      contactName: str(c.contactName),
      contactRoles: str(c.roleFlags),
      reason: `הכתובת ${address} רשומה אצל ${customerLabel(only, customersByCode, contacts)} כאיש הקשר ${str(c.contactName) || 'ללא שם'}, אבל לא מסומנת כאיש קשר בהנהלת חשבונות`,
      shortReason: 'הכתובת רשומה אצל הלקוח אך לא כהנהלת חשבונות',
    };
  }
  if (exactCodes.length === 1) {
    const c = apExact[0];
    const only = exactCodes[0];
    return {
      ...base,
      status: VERIFIED,
      customerCode: only,
      customerName: nameOf(only, customersByCode, contacts),
      contactName: str(c.contactName),
      contactRoles: str(c.roleFlags),
      reason: `הכתובת ${address} רשומה אצל ${customerLabel(only, customersByCode, contacts)} כאיש הקשר ${str(c.contactName) || 'ללא שם'}${str(c.roleFlags) ? ` (${str(c.roleFlags)})` : ''}`,
      shortReason: 'הכתובת רשומה אצל הלקוח',
    };
  }
  if (exactCodes.length > 1) {
    return {
      ...base,
      status: TO_CHECK,
      reason: `הכתובת ${address} רשומה אצל כמה לקוחות: ${exactCodes.map((c) => customerLabel(c, customersByCode, contacts)).join(', ')}`,
      shortReason: 'הכתובת רשומה אצל כמה לקוחות',
    };
  }
  if (domainUsable) {
    const sameDomain = withEmail.filter((c) => domainOf(normEmail(c.email)) === domain);
    const codes = [...new Set(sameDomain.map((c) => str(c.customerCode)).filter(Boolean))];
    if (codes.length) {
      return {
        ...base,
        status: TO_CHECK,
        customerCode: codes.length === 1 ? codes[0] : '',
        customerName: codes.length === 1 ? nameOf(codes[0], customersByCode, contacts) : '',
        reason: `רק הדומיין ${domain} תואם לאיש קשר רשום של ${codes.map((c) => customerLabel(c, customersByCode, contacts)).join(', ')}; הכתובת ${address} עצמה לא רשומה`,
        shortReason: 'רק הדומיין תואם לאיש קשר רשום',
      };
    }
  }
  return {
    ...base,
    status: NOT_VERIFIED,
    reason: `הכתובת ${address} לא רשומה באף איש קשר של לקוח`,
    shortReason: 'הלקוח לא זוהה והכתובת לא רשומה',
  };
}

/** Reads what verifySender needs: every contact, plus the customer rows those contacts (and `code`) refer to. */
export async function loadVerificationData(client: BlocksClient, extraCodes: string[] = []) {
  const contacts = await readAll(client, 'CustomerContacts');
  const codes = [...new Set([...contacts.map((c) => str(c.customerCode)), ...extraCodes].filter(Boolean))];
  const customers = codes.length ? await readWhereIn(client, 'Customers', 'customerCode', codes) : [];
  return { contacts, customersByCode: new Map(customers.map((c) => [str(c.customerCode), c])) };
}

// ---------- identification ----------

/** Lower-case, unified quotes/dashes/whitespace, for name matching inside free text. */
export function normText(s: unknown): string {
  return str(s)
    .toLowerCase()
    .replace(/[״”“"]/g, '"')
    .replace(/[׳’‘`']/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMPANY_SUFFIX = /\s*(בע"מ|בע'מ|בעמ|ltd\.?|inc\.?)\s*$/i;

/** The ways a customer's name can appear in a mail: full, without the "בדיקה – " prefix, without בע״מ. */
export function nameVariants(name: unknown): string[] {
  const full = normText(name);
  const prefix = normText(FIXTURE_NAME_PREFIX);
  const out = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (t.replace(/[^א-תa-z0-9]/g, '').length >= 4) out.add(t);
  };
  add(full);
  const bare = full.startsWith(prefix) ? full.slice(prefix.length) : full.startsWith('בדיקה -') ? full.slice('בדיקה -'.length) : full;
  add(bare);
  add(full.replace(COMPANY_SUFFIX, ''));
  add(bare.replace(COMPANY_SUFFIX, ''));
  return [...out];
}

/** Invoice-number-like tokens (letters/digits/-/ / with at least one digit, 4–40 chars). */
export function invoiceCandidates(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z0-9][A-Za-z0-9\-\/_.]*[A-Za-z0-9]/g)) {
    const t = m[0];
    if (t.length < 4 || t.length > 40 || !/\d/.test(t)) continue;
    if (t.includes('@')) continue;
    out.add(t);
    out.add(t.toUpperCase());
  }
  return [...out].slice(0, 400);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Invoice numbers from `invoices` that appear in `text` as whole tokens (case-insensitive). */
export function mentionedInvoices(text: string, invoices: Item[]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const inv of invoices) {
    const no = str(inv.invoiceNumber);
    if (!no || seen.has(no)) continue;
    const re = new RegExp(`(^|[^0-9A-Za-z])${escapeRe(no)}([^0-9A-Za-z]|$)`, 'i');
    if (re.test(text)) {
      seen.add(no);
      out.push(inv);
    }
  }
  return out;
}

export interface Identification {
  customerCode: string;
  customerName: string;
  method: 'כתובת איש קשר רשום' | 'מספר חשבונית במייל' | 'שם הלקוח במייל' | null;
  detail: string;
}


/**
 * Identifies the customer of an email: (1) the sender is a contact of exactly one customer,
 * (2) invoice numbers in the subject/body belong to one customer, (3) a customer name appears in the
 * text. Ties between a test and a real customer are broken by whether the mail itself is test data.
 */
export function identifyCustomer(args: {
  address: string;
  text: string;
  contacts: Item[];
  customers: Item[];
  invoicesMentioned: Item[];
  preferTest: boolean;
}): Identification {
  const { address, text, contacts, customers, invoicesMentioned, preferTest } = args;
  const byCode = new Map(customers.map((c) => [str(c.customerCode), c]));
  const label = (code: string) => str(byCode.get(code)?.customerName) || code;
  void preferTest; // test-data separation retired: no tie-break between test and real customers
  const pickByTestPreference = (codes: string[]) => codes;

  // 1. registered contact address
  if (address) {
    const hits = contacts.filter((c) => normEmail(c.email) === address);
    const codes = [...new Set(hits.map((c) => str(c.customerCode)).filter(Boolean))];
    if (codes.length === 1) {
      const c = hits[0];
      return {
        customerCode: codes[0],
        customerName: label(codes[0]),
        method: 'כתובת איש קשר רשום',
        detail: `${address} הוא איש הקשר ${str(c.contactName) || 'ללא שם'} של הלקוח`,
      };
    }
  }

  // 2. invoice numbers
  if (invoicesMentioned.length) {
    const byCust = new Map<string, string[]>();
    for (const inv of invoicesMentioned) {
      const code = str(inv.customerCode);
      if (!code) continue;
      if (!byCust.has(code)) byCust.set(code, []);
      byCust.get(code)!.push(str(inv.invoiceNumber));
    }
    const ranked = [...byCust.entries()].sort((a, b) => b[1].length - a[1].length);
    if (ranked.length && (ranked.length === 1 || ranked[0][1].length > ranked[1][1].length)) {
      const [code, nos] = ranked[0];
      return {
        customerCode: code,
        customerName: label(code),
        method: 'מספר חשבונית במייל',
        detail: `${nos.length === 1 ? 'החשבונית' : 'החשבוניות'} ${nos.join(', ')} ${nos.length === 1 ? 'שייכת' : 'שייכות'} ללקוח`,
      };
    }
  }

  // 3. customer name in the text
  const hay = normText(text);
  if (hay) {
    let best = 0;
    let bestCodes: string[] = [];
    for (const c of customers) {
      const code = str(c.customerCode);
      if (!code) continue;
      let len = 0;
      for (const v of nameVariants(c.customerName)) if (v.length > len && hay.includes(v)) len = v.length;
      if (!len) continue;
      if (len > best) {
        best = len;
        bestCodes = [code];
      } else if (len === best && !bestCodes.includes(code)) bestCodes.push(code);
    }
    const picked = pickByTestPreference(bestCodes);
    if (picked.length === 1) {
      return {
        customerCode: picked[0],
        customerName: label(picked[0]),
        method: 'שם הלקוח במייל',
        detail: `שם הלקוח "${label(picked[0])}" מופיע בנושא או בגוף המייל`,
      };
    }
    if (picked.length > 1) {
      return {
        customerCode: '',
        customerName: '',
        method: null,
        detail: `כמה לקוחות מתאימים לשם במייל: ${picked.map((c) => `${label(c)} (${c})`).join(', ')}`,
      };
    }
  }
  return { customerCode: '', customerName: '', method: null, detail: 'לא נמצאו כתובת רשומה, מספר חשבונית או שם לקוח במייל' };
}

// ---------- replies ----------

/** "בברכה,\n<bookkeeper>\nמחלקת הנהלת חשבונות, סימנט" */
export const signatureFor = (bookkeeperName: string) =>
  `בברכה,\n${bookkeeperName || 'מחלקת הנהלת חשבונות'}\n${SIGNATURE_DEPARTMENT}`;

/** Body + signature from the data; a closing "בברכה…" block the writer already added is replaced. */
export function signBody(body: string, bookkeeperName: string): string {
  let text = str(body).replace(/\r\n/g, '\n').trimEnd();
  const idx = text.search(/\n\s*בברכה[,]?\s*(\n|$)/);
  if (idx >= 0 && text.length - idx < 200) text = text.slice(0, idx).trimEnd();
  else if (/^\s*בברכה[,]?\s*(\n|$)/.test(text)) text = '';
  return `${text}\n\n${signatureFor(bookkeeperName)}`;
}

/** The reply subject on the same thread: "Re: <original>", never a second prefix (Re: / RE: / Re[2]: / AW: / SV: / השב: / תשובה:). */
export const replySubject = (original: string) => {
  const s = str(original).trim();
  if (!s) return 'Re:';
  return /^(re|aw|sv|השב|תשובה)\s*(\[\d+\])?\s*:/i.test(s) ? s : `Re: ${s}`;
};

export const joinLines = (xs: string[]) => (xs.length ? xs.join('\n') : null);
