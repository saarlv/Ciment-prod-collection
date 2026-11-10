// Plan 04.11 part C (stages 8 + 10) – inbox helpers shared by ApplyMailClassification (shared/collections-mail-route.ts)
// and ConfirmSender:
// - the unknown sender: Maya's signature → a suggested customer (Customers names and approved BankAliases, normalised
//   with the receipts' normName), stored on the email; a person confirms it (ConfirmSender) or rejects it
// - the sender decision stored in classificationQuotes.senderDecision
// - insurer mail (בסס״ח): senders from AgentSettings insurerSenders, and the open CreditLimitRequests row it answers
// - manual tasks (manual:<what>:<id>): one row per key, never reopened, never touched by the task scan
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { israelLocalToUtcIso, israelToday, nextBusinessDay } from './collections-dates.ts';
import { errText, readAll, splitList, str } from './collections-data.ts';
import { normEmail } from './collections-mail.ts';
import { normName } from './collections-matching.ts';
import { DEFAULT_SEVERITY_CONFIG, SEV_MEDIUM } from './collections-severity.ts';
import { buildTaskRow, OPEN_TASK_STATUSES, taskKeyOf } from './collections-tasks.ts';

export { senderDecisionOf, senderRejected, signatureLines, storedSignatureOf, type SenderDecision, type StoredSignature } from './collections-inbox.ts';

// ---------- enums ----------
export const IDENTIFIED_BY_ADDRESS = 'כתובת';
export const IDENTIFIED_BY_SIGNATURE = 'חתימה';
export const CONTACT_SOURCE_OURS = 'נוסף אצלנו';
export const AP_ROLE = 'הנהלת חשבונות';

export const TT_VERIFY_SENDER = 'לאמת שולח';
export const TT_PRIORITY_CONTACT = 'להוסיף איש קשר בפריוריטי';
export const TT_DOCS_MANUAL = 'תעודות / חשבוניות חסרות – טיפול ידני';
export const TT_PRICE_MANUAL = 'זיכוי / הפרש מחיר – טיפול ידני';
export const TT_OTHER = 'אחר';
export const SRC_INSURANCE = 'ביטוח';
export const SRC_INBOX = 'פניות';

/** waitingFor of an insurer approval linked to its request. */
export const WAIT_INSURANCE_AMOUNT = 'ממתין לאישור סכום בבקשת הביטוח';
/** CreditLimitRequests statuses an insurer answer can belong to. */
export const INSURANCE_OPEN_STATUSES = ['הוגשה למבטח', 'ממתינה להגשה'];
export const SETTING_INSURER_SENDERS = 'insurerSenders';

// ---------- manual task keys ----------
export const ourContactKey = (customerCode: string, address: string) => `ours:${str(customerCode).trim()}:${normEmail(address)}`;
export const priorityContactTaskKey = (contactKey: string) => taskKeyOf('manual', `priority-contact:${contactKey}`);
export const docsManualTaskKey = (emailId: string) => taskKeyOf('manual', `docs-manual:${emailId}`);
export const priceManualTaskKey = (emailId: string) => taskKeyOf('manual', `price-manual:${emailId}`);
export const insuranceUnlinkedTaskKey = (emailId: string) => taskKeyOf('manual', `insurance-unlinked:${emailId}`);

// ---------- signature → suggested customer ----------

export interface SignatureSuggestion {
  customerCode: string;
  customerName: string;
  /** which signature field matched */
  matchedOn: 'companyName' | 'logoText';
  /** the text as written in the signature */
  value: string;
  /** שם זהה / כינוי / שם הלקוח בחתימה */
  how: string;
}

export const HOW_SAME_NAME = 'שם זהה';
export const HOW_ALIAS = 'כינוי';
export const HOW_CONTAINS = 'שם הלקוח בחתימה';
const HOW_RANK: Record<string, number> = { [HOW_SAME_NAME]: 3, [HOW_ALIAS]: 2, [HOW_CONTAINS]: 1 };

/** Test-data separation is retired (real Priority data only). */
const isFixtureCustomer = (_c: Item | undefined) => false;
const letters = (s: string) => s.replace(/[^א-תa-z0-9]/g, '').length;

/**
 * The customer a signature names: the company name (then the logo text), normalised like the receipts' names (test
 * prefix, punctuation, בע״מ / ושות׳ dropped). Strongest first: the same name as a customer, an approved BankAliases
 * name, a customer name contained as whole words in the signature text (≥4 letters). One customer at the strongest
 * level, else none (a tie between a test and a real customer goes by the mail being test data).
 */
export function suggestCustomerFromSignature(
  sig: { companyName?: string | null; logoText?: string | null; companyNameFound?: boolean; logoTextFound?: boolean },
  data: { customers: Item[]; aliases?: Item[]; preferTest?: boolean },
): { suggestion: SignatureSuggestion | null; hits: SignatureSuggestion[] } {
  const fields: { field: 'companyName' | 'logoText'; value: string }[] = [];
  if (sig.companyName && sig.companyNameFound !== false) fields.push({ field: 'companyName', value: sig.companyName });
  if (sig.logoText && sig.logoTextFound !== false) fields.push({ field: 'logoText', value: sig.logoText });
  const byCode = new Map(data.customers.map((c) => [str(c.customerCode), c]));
  const hits: SignatureSuggestion[] = [];
  const push = (h: SignatureSuggestion) => {
    const prev = hits.find((x) => x.customerCode === h.customerCode);
    if (!prev) hits.push(h);
    else if ((HOW_RANK[h.how] ?? 0) > (HOW_RANK[prev.how] ?? 0)) Object.assign(prev, h);
  };
  for (const f of fields) {
    const n = normName(f.value);
    if (letters(n) < 3) continue;
    const padded = ` ${n} `;
    for (const c of data.customers) {
      const code = str(c.customerCode);
      const cn = normName(c.customerName);
      if (!code || !cn) continue;
      if (cn === n) push({ customerCode: code, customerName: str(c.customerName), matchedOn: f.field, value: f.value, how: HOW_SAME_NAME });
      else if (letters(cn) >= 4 && padded.includes(` ${cn} `)) push({ customerCode: code, customerName: str(c.customerName), matchedOn: f.field, value: f.value, how: HOW_CONTAINS });
    }
    for (const a of data.aliases ?? []) {
      if (str(a.status).trim() !== 'מאושר') continue;
      const code = str(a.customerCode).trim();
      if (!code || normName(a.bankName) !== n) continue;
      push({ customerCode: code, customerName: str(byCode.get(code)?.customerName) || str(a.customerName) || code, matchedOn: f.field, value: f.value, how: HOW_ALIAS });
    }
  }
  if (!hits.length) return { suggestion: null, hits };
  const top = Math.max(...hits.map((h) => HOW_RANK[h.how] ?? 0));
  let best = hits.filter((h) => (HOW_RANK[h.how] ?? 0) === top);
  if (best.length > 1 && data.preferTest !== undefined) {
    const pref = best.filter((h) => isFixtureCustomer(byCode.get(h.customerCode) ?? { customerCode: h.customerCode }) === data.preferTest);
    if (pref.length) best = pref;
  }
  return { suggestion: best.length === 1 ? best[0] : null, hits };
}

// ---------- insurer mail ----------
export function insurerAddresses(settings: Map<string, string>): string[] {
  return splitList(str(settings.get(SETTING_INSURER_SENDERS)).replace(/[;\n]/g, ','))
    .map((a) => normEmail(a) || a.trim().toLowerCase())
    .filter(Boolean);
}

/** The sender is one of the insurer addresses (an entry "@domain" or "domain" matches the whole domain). */
export function isInsurerSender(address: unknown, settings: Map<string, string>): boolean {
  const a = normEmail(address);
  if (!a) return false;
  const domain = a.split('@')[1] ?? '';
  return insurerAddresses(settings).some((x) => (x.includes('@') && !x.startsWith('@') ? x === a : x.replace(/^@/, '') === domain));
}

const digitsOnly = (s: unknown) => str(s).replace(/\D/g, '');

/** Company ids (ח.פ, 8–9 digits not starting with 0, with or without dashes / spaces) written in a text. */
export function companyIdsIn(text: unknown): string[] {
  const out = new Set<string>();
  for (const m of str(text).matchAll(/\d[\d\- ]{6,12}\d/g)) {
    const d = digitsOnly(m[0]);
    // a leading 0 is a phone number (04-8460570), not a company id
    if (d.length >= 8 && d.length <= 9 && !d.startsWith('0')) out.add(d);
  }
  return [...out];
}

export interface InsuranceMatch {
  request: Item;
  matchedBy: 'ח.פ' | 'קוד לקוח' | 'שם לקוח';
}

const newestFirst = (a: Item, b: Item) =>
  Date.parse(str(b.submittedAt) || str(b.requestCreatedAt) || '0') - Date.parse(str(a.submittedAt) || str(a.requestCreatedAt) || '0') || Number(b.id) - Number(a.id);

/**
 * The open credit-limit request (הוגשה למבטח / ממתינה להגשה) an insurer answer belongs to: by the company id written
 * in the mail, else by the email's customer, else by a request's customer name written in the mail (one customer
 * only). Several open requests of the customer: the newest.
 */
export function findInsuranceRequest(requests: Item[], args: { customerCode: string | null; text: string }): InsuranceMatch | null {
  const open = requests.filter((r) => INSURANCE_OPEN_STATUSES.includes(str(r.status).trim())).sort(newestFirst);
  if (!open.length) return null;
  const ids = new Set(companyIdsIn(args.text));
  if (ids.size) {
    const byId = open.filter((r) => digitsOnly(r.companyId) && ids.has(digitsOnly(r.companyId)));
    const codes = [...new Set(byId.map((r) => str(r.customerCode)))];
    if (codes.length === 1) return { request: byId[0], matchedBy: 'ח.פ' };
  }
  const code = str(args.customerCode).trim();
  if (code) {
    const r = open.find((x) => str(x.customerCode) === code);
    if (r) return { request: r, matchedBy: 'קוד לקוח' };
  }
  const hay = ` ${normName(args.text)} `;
  const byName = open.filter((r) => {
    const n = normName(r.customerName);
    return letters(n) >= 4 && hay.includes(` ${n} `);
  });
  const codes = [...new Set(byName.map((r) => str(r.customerCode)))];
  if (codes.length === 1) return { request: byName[0], matchedBy: 'שם לקוח' };
  return null;
}

// ---------- manual tasks ----------
export interface ManualTaskSpec {
  key: string;
  taskType: string;
  title: string;
  reasons: string;
  recommendedAction: string;
  source: string;
  customerCode: string | null;
  customerName: string | null;
  owner: string | null;
  relatedTable: string;
  relatedId: string;
  invoiceNumbers?: string[];
  dueAt?: string | null;
  isTestFixture: boolean;
}

export interface ManualTaskResult {
  id: string;
  taskKey: string;
  taskType: string;
  created: boolean;
  status: string;
  error?: string;
}

/**
 * One CollectionQueue row per key (manual:…, never managed by the task scan): created once; while open its title /
 * reasons / customer follow the latest write; once a person (or anyone) closed it, it is left as is – never reopened.
 */
export async function ensureManualTask(client: BlocksClient, spec: ManualTaskSpec, nowIso = new Date().toISOString()): Promise<ManualTaskResult> {
  const base = { taskKey: spec.key, taskType: spec.taskType };
  try {
    const existing = (await readAll(client, 'CollectionQueue', { column: 'taskKey', value: spec.key })).sort((a, b) => Number(a.id) - Number(b.id));
    const open = existing.find((t) => OPEN_TASK_STATUSES.includes(str(t.status)));
    const row = existing[0];
    if (open) {
      const patch: Item = {};
      const want: Item = {
        title: spec.title,
        reasons: spec.reasons,
        customerCode: spec.customerCode || null,
        customerName: spec.customerName || null,
        assignedBookkeeperName: spec.owner || null,
        invoiceNumbers: spec.invoiceNumbers?.length ? spec.invoiceNumbers.join(',') : null,
      };
      for (const [k, v] of Object.entries(want)) if ((open[k] ?? null) !== v && !(k === 'assignedBookkeeperName' && !v)) patch[k] = v;
      if (Object.keys(patch).length) await client.updateItem('CollectionQueue', str(open.id), { ...patch, lastCheckedAt: nowIso });
      return { ...base, id: str(open.id), created: false, status: str(open.status) };
    }
    if (row) return { ...base, id: str(row.id), created: false, status: str(row.status) };
    const asOfDate = israelToday();
    const built = buildTaskRow({
      kind: 'manual',
      id: spec.key.replace(/^manual:/, ''),
      taskType: spec.taskType,
      title: spec.title,
      reasons: spec.reasons,
      recommendedAction: spec.recommendedAction,
      severity: { score: Math.round(DEFAULT_SEVERITY_CONFIG.scoreMedium), level: SEV_MEDIUM },
      customerCode: spec.customerCode,
      customerName: spec.customerName,
      owner: spec.owner,
      amount: null,
      invoiceNumbers: spec.invoiceNumbers ?? [],
      relatedTable: spec.relatedTable,
      relatedId: spec.relatedId,
      dueAt: spec.dueAt || israelLocalToUtcIso(nextBusinessDay(asOfDate), 12, 0),
      asOfDate,
      nowIso,
      isTestFixture: spec.isTestFixture,
    });
    const saved = (await client.createItem('CollectionQueue', { ...built, source: spec.source }))?.item;
    return { ...base, id: str(saved?.id), created: true, status: str(saved?.status) || built.status };
  } catch (e) {
    return { ...base, id: '', created: false, status: '', error: `משימה "${spec.taskType}": ${errText(e)}` };
  }
}
