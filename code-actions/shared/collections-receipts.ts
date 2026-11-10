// Receipts: the shared vocabulary of the bank-line flow and the bank-file reader's checks. Since 08.11 the receipts flow
// is ONE flow per record – identify (IdentifyCustomers) → receipt (IssueReceipt) → debt check (CheckDebt) → allocation
// (ProposeAllocation / ApplyAllocation); agent cheques (PullAgentReceipts) enter at the debt check. The old invoice-
// matching ladder, the remittance-mail reading, the mail search with approval and the detail request were removed.
// What is left here: the enums of BankLines.checkStage, ReceiptCheckSteps (stage / rung / result / actor) and
// ImportBatches, the name / amount helpers of the identification, the batch work-day rules, refreshBatchCheckStatus,
// and the reader-output normalisation (WriteExtractedLines / RecordAgentFeedback). Nothing is written to Priority.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { addDays, isValidDate, toIsraelDate } from './collections-dates.ts';
import { formatIls, isTestCode, num, readAll, readByIds, round2, str } from './collections-data.ts';
import { normName } from './collections-matching.ts';

// ---------- enums (exactly as in the table artifacts) ----------
/** BankLines.checkStage */
export const CS_PENDING = 'ממתינה לבדיקה';
export const CS_IDENTIFY = 'זיהוי לקוח';
export const CS_AWAITING = 'ממתינה לאישור';
export const CS_APPROVED = 'אושרה';
export const CS_UNIDENTIFIED = 'לא מזוהה';
/** checkStage values of a line still waiting in the check (the batch is not done while one remains). */
export const WAITING_STAGES = [CS_PENDING, CS_IDENTIFY, CS_AWAITING];

/** ReceiptCheckSteps.stage */
export const ST_READ = 'קריאה';
export const ST_IDENTIFY = 'זיהוי לקוח';
export const ST_DECISION = 'החלטה';

/** ReceiptCheckSteps.rung */
export const R_READ = 'קריאת הקובץ';
export const R_BOUNCED = 'צ׳ק חוזר';
export const R_CARD = 'כרטיס לקוח';
export const R_ALIAS = 'כינוי';
export const R_MAIL = 'מיילים 7 ימים';
export const R_APPROVE = 'אישור';
export const R_CORRECT = 'תיקון';

/** ReceiptCheckSteps.result */
export const RES_FOUND = 'נמצא';
export const RES_NOT_FOUND = 'לא נמצא';
export const RES_AMBIGUOUS = 'דו-משמעי';
export const RES_SKIPPED = 'דולג';

/** ReceiptCheckSteps.actor */
export const ACTOR_READER = 'סוכן הקריאה';
export const ACTOR_NINA = 'נינה';
export const ACTOR_USER = 'משתמש';
/** a step no person and no agent took (an automatic approval) */
export const ACTOR_SYSTEM = 'מערכת';
export const READER_DISPLAY = 'סוכן הקריאה';
export const NINA_DISPLAY = 'נינה';

export const EX_WAITING = 'ממתין לקריאה';
export const EX_READING = 'בקריאה';
export const EX_TO_VERIFY = 'נקרא – לאימות';
export const EX_VERIFIED = 'אומת';
export const EX_FAILED = 'נכשל';

export const TC_MATCH = 'תואם';
export const TC_MISMATCH = 'לא תואם';
export const TC_NONE = 'אין סיכום בקובץ';

export const CK_NOT_STARTED = 'טרם התחילו';
export const CK_RUNNING = 'בבדיקה';
export const CK_PAUSED = 'הושהתה';
export const CK_DONE = 'הושלמה';

export const FLAG_MISSING = 'שדה חסר';
export const FLAG_LOW = 'קריאות נמוכה';
export const FLAG_DUP = 'כפילות';

export const BANK_KIND = 'קובץ בנק';
/** plan r3 stage 2: one ImportBatches row per pull of Priority's שורות דפי בנק (SyncPriorityBankLines) – no reading step */
export const PRIORITY_BANK_KIND = 'שורות דפי בנק – Priority';
/** Both kinds of bank-line batches: an uploaded file and a Priority pull. */
export const BANK_LINE_KINDS = [BANK_KIND, PRIORITY_BANK_KIND];
/** A batch whose lines are confirmed: a Priority pull always (nothing is read), a file once verified (אומת). */
export const isVerifiedBankBatch = (b: Item | null | undefined) => str(b?.kind) === PRIORITY_BANK_KIND || str(b?.extractionStatus) === 'אומת';
/**
 * Money received: a positive line of type העברה / זיכוי בנק, or a legacy צ׳ק deposit / untyped legacy line.
 * פירעון צ׳ק, אחר and צ׳ק חוזר are not money received.
 */
const MONEY_IN_LINE_TYPES = ['העברה', 'זיכוי בנק', 'צ׳ק'];
export const isMoneyInLine = (l: Item) => num(l.amount) > 0 && (!str(l.lineType).trim() || MONEY_IN_LINE_TYPES.includes(str(l.lineType).trim()));
/** Lines that are neither a receipt nor a returned cheque (stored only): פירעון צ׳ק / אחר. */
export const isNonReceiptLine = (l: Item) => ['פירעון צ׳ק', 'אחר'].includes(str(l.lineType).trim());
export const READER_AGENT = 'BankFileReader';
export const NINA_AGENT = 'CollectionsAgent';

export const ALIAS_SRC_MATCH = 'אישור התאמה';
export const ALIAS_SRC_MAIL = 'מייל';
export const ALIAS_SRC_MANUAL = 'ידני';
export const PRIORITY_NOT_SYNCED = 'לא סונכרן';

export const SENDER_CONTACT = 'איש קשר רשום';
export const SENDER_AGENT = 'סוכן סימנט';
export const SENDER_OTHER = 'אחר';

const EPS = 0.01;

// ---------- small helpers ----------
export const isTrue = (v: unknown) => v === true || v === 'true';

const collapse = (s: unknown) => str(s).replace(/\s+/g, ' ').trim();

/** The Israel work day of an upload: its date, Friday/Saturday counted to that week's Thursday. */
export function workDayOf(israelDate: string): string {
  const wd = new Date(`${israelDate}T00:00:00Z`).getUTCDay();
  if (wd === 5) return addDays(israelDate, -1);
  if (wd === 6) return addDays(israelDate, -2);
  return israelDate;
}

/**
 * The work day a bank file belongs to (the receipts screen's batchWorkDay): workDay, else dataDate, else the
 * Israel date of uploadedAt; Friday/Saturday count for Thursday.
 */
export function batchWorkDay(b: Item): string | null {
  const raw = toIsraelDate(b.workDay) || toIsraelDate(b.dataDate) || toIsraelDate(b.uploadedAt);
  return raw && isValidDate(raw) ? workDayOf(raw) : null;
}

// ---------- structured agent output (object, JSON string, or wrapped in the step output) ----------
export function parseStructured(v: unknown, isIt: (o: any) => boolean, depth = 0): any | null {
  if (v === null || v === undefined || depth > 5) return null;
  if (typeof v === 'string') {
    const s = v
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    if (!s || s === 'undefined' || s === 'null' || !/[{[]/.test(s)) return null;
    try {
      return parseStructured(JSON.parse(s), isIt, depth + 1);
    } catch {
      const a = s.indexOf('{');
      const b = s.lastIndexOf('}');
      if (a >= 0 && b > a) {
        try {
          return parseStructured(JSON.parse(s.slice(a, b + 1)), isIt, depth + 1);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  if (isIt(v)) return v;
  const o = v as Record<string, unknown>;
  for (const k of ['structuredOutput', 'structured', 'output', 'result', 'data', 'response', 'message', 'content', 'text', 'value']) {
    if (k in o) {
      const r = parseStructured(o[k], isIt, depth + 1);
      if (r) return r;
    }
  }
  for (const val of Object.values(o)) {
    if (val && (typeof val === 'object' || typeof val === 'string')) {
      const r = parseStructured(val, isIt, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

// ---------- names and amounts in free text ----------
/** Generic words of company names that never identify a payer on their own. */
const STOP_TOKENS = new Set([
  'בעמ',
  'ושות',
  'חברה',
  'חברת',
  'השקעות',
  'בנייה',
  'בניה',
  'ובנייה',
  'פיתוח',
  'ופיתוח',
  'הנדסה',
  'יזמות',
  'קבלנות',
  'שיווק',
  'ושיווק',
  'יבוא',
  'סחר',
  'תעשיות',
  'אחזקות',
  'נכסים',
  'שירותים',
  'ובניו',
  'שות',
  'שיווק',
  'בניו',
  'קבוצת',
  'העברה',
  'תשלום',
  'בדיקה',
  'ltd',
  'inc',
  'group',
]);

const letterCount = (t: string) => (t.match(/\p{L}/gu) ?? []).length;

/** Meaningful tokens of a payer name: ≥3 letters, not a generic company word. */
export function payerTokens(payer: unknown): string[] {
  const key = normName(payer);
  if (!key) return [];
  return [...new Set(key.split(' ').filter((t) => letterCount(t) >= 3 && !STOP_TOKENS.has(t)))];
}

/** Text for name matching: lower-case, quotes and dots removed, punctuation → space. */
export function normForNames(s: unknown): string {
  return str(s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/["'״׳`’‘“”.]/g, '')
    .replace(/[,\-–—_/\\()!?:;|<>@[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The token as a whole word (a one-letter Hebrew prefix ו/ה/ב/ל/מ/ש/כ allowed). */
export function containsToken(normalizedText: string, token: string): boolean {
  if (!token) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:[והבלמשכ])?${escRe(token)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalizedText);
}

/** Matches the amount as written in mail: 17,424 / 17424 / 17,424.00 (whole number, not part of a longer one). */
export function amountRegex(amount: number): RegExp | null {
  const a = Math.abs(round2(amount));
  if (!(a >= 1)) return null;
  const int = Math.trunc(a);
  const cents = Math.round((a - int) * 100);
  let s = String(int);
  const groups: string[] = [];
  while (s.length > 3) {
    groups.unshift(s.slice(-3));
    s = s.slice(0, -3);
  }
  groups.unshift(s);
  const intPat = groups.join(',?');
  const centsPat = cents === 0 ? '(?:\\.0{1,2})?' : cents % 10 === 0 ? `\\.${cents / 10}0?` : `\\.${String(cents).padStart(2, '0')}`;
  return new RegExp(`(?<![\\d.,])${intPat}${centsPat}(?![\\d]|[.,]\\d)`);
}

export function textHasAmount(text: unknown, amount: number): boolean {
  const re = amountRegex(amount);
  return !!re && re.test(str(text));
}

// ---------- quotes ----------
/** Whitespace / quote-mark / dash tolerant form for comparing a quote with the email text. */
export function normQuote(s: unknown): string {
  return str(s)
    .normalize('NFC')
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[״“”„"]/g, '"')
    .replace(/[׳’‘`']/g, "'")
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ---------- bank lines ----------


/**
 * Keeps ImportBatches.checkStatus in step with its lines: resume (a line is checked) turns הושהתה back to
 * בבדיקה; when no line of a started batch is still waiting, the batch becomes הושלמה.
 */
export async function refreshBatchCheckStatus(client: BlocksClient, importBatchId: string | null, opts: { resume?: boolean } = {}): Promise<Item | null> {
  if (!importBatchId) return null;
  const [batch] = await readByIds(client, 'ImportBatches', [importBatchId]);
  if (!batch) return null;
  const current = str(batch.checkStatus);
  if (![CK_RUNNING, CK_PAUSED].includes(current)) return { importBatchId, checkStatus: current || null, changed: false };
  const lines = await readAll(client, 'BankLines', { column: 'importBatchId', value: importBatchId });
  const waiting = lines.filter((l) => WAITING_STAGES.includes(str(l.checkStage))).length;
  let next = current;
  if (lines.length && waiting === 0) next = CK_DONE;
  else if (opts.resume && current === CK_PAUSED) next = CK_RUNNING;
  if (next !== current) {
    await client.updateItem('ImportBatches', importBatchId, { checkStatus: next });
  }
  return { importBatchId, checkStatus: next, changed: next !== current, waiting };
}

// ---------- reader output (WriteExtractedLines) ----------
export interface ExtractedLine {
  lineNo: number;
  valueDate: string | null;
  amount: number | null;
  payerName: string;
  reference: string;
  lineType: string;
  sourceRef: string;
  rawText: string;
  legibility: string | null;
  flags: string[];
}

export interface Extraction {
  account: string;
  bankName: string;
  periodFrom: string | null;
  periodTo: string | null;
  linesInFile: number | null;
  totalInFile: number | null;
  lines: ExtractedLine[];
  warnings: string[];
}

const LEGIBILITY = ['טובה', 'בינונית', 'נמוכה'];

export function parseExtraction(raw: unknown): any | null {
  return parseStructured(raw, (o) => typeof o === 'object' && o !== null && Array.isArray(o.lines));
}

/** YYYY-MM-DD from YYYY-MM-DD / DD/MM/YYYY / DD.MM.YYYY / DD-MM-YYYY, else null. */
export function toDate(v: unknown): string | null {
  const s = str(v).trim();
  if (!s) return null;
  if (isValidDate(s.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidDate(d) ? d : null;
  }
  return null;
}

export function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null;
  let s = str(v).replace(/[₪\s]/g, '').replace(/ש"ח|ש״ח/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/,/g, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(neg ? -Math.abs(n) : n) : null;
}

export function normLineType(v: unknown): string {
  const s = str(v).trim().replace(/['"`’]/g, '׳');
  if (!s) return 'העברה';
  if (s.includes('חוזר')) return 'צ׳ק חוזר';
  if (['צ׳ק', 'שיק', 'המחאה'].includes(s)) return 'צ׳ק';
  if (s.startsWith('העברה') || s === 'זיכוי') return 'העברה';
  return 'אחר';
}

export function bankNameOf(v: unknown): string | null {
  const s = str(v).trim();
  if (!s) return null;
  if (s.includes('מזרחי') || s.includes('טפחות') || /mizrahi/i.test(s)) return 'מזרחי';
  if (s.includes('בינלאומי') || /fibi|international/i.test(s)) return 'בינלאומי';
  return 'אחר';
}

/** Normalises the reader's output and flags every line (required fields, legibility). */
export function normaliseExtraction(o: any): Extraction {
  const rawLines: any[] = Array.isArray(o?.lines) ? o.lines : [];
  const lines: ExtractedLine[] = rawLines.map((l, i) => {
    const valueDate = toDate(l?.valueDate);
    const amount = toAmount(l?.amount);
    const payerName = collapse(l?.payerName);
    const reference = collapse(l?.reference);
    const legibility = LEGIBILITY.includes(str(l?.legibility).trim()) ? str(l?.legibility).trim() : null;
    const flags: string[] = [];
    if (!valueDate || amount === null || amount === 0 || (!payerName && !reference)) flags.push(FLAG_MISSING);
    if (legibility === 'נמוכה') flags.push(FLAG_LOW);
    const n = Number(l?.lineNo);
    return {
      lineNo: Number.isInteger(n) && n > 0 ? n : i + 1,
      valueDate,
      amount,
      payerName,
      reference,
      lineType: normLineType(l?.lineType),
      sourceRef: collapse(l?.sourceRef),
      rawText: str(l?.rawText).trim(),
      legibility,
      flags,
    };
  });
  // line numbers must be unique (they make the bankLineId)
  if (new Set(lines.map((l) => l.lineNo)).size !== lines.length) lines.forEach((l, i) => (l.lineNo = i + 1));
  const numOrNull = (v: unknown) => {
    const a = toAmount(v);
    return a === null ? null : a;
  };
  return {
    account: collapse(o?.account),
    bankName: collapse(o?.bankName),
    periodFrom: toDate(o?.periodFrom),
    periodTo: toDate(o?.periodTo),
    linesInFile: numOrNull(o?.linesInFile),
    totalInFile: numOrNull(o?.totalInFile),
    lines,
    warnings: (Array.isArray(o?.warnings) ? o.warnings : []).map((w: unknown) => collapse(w)).filter(Boolean),
  };
}

export const isTestAccount = (account: unknown) => isTestCode(str(account).trim().replace(/^[^A-Za-z0-9]+/, ''));

/** Credit lines (amount > 0) count and total – what a bank file's own summary row states. */
export function creditTotals(lines: { amount: number | null }[]) {
  const credits = lines.filter((l) => (l.amount ?? 0) > 0);
  return { count: credits.length, total: round2(credits.reduce((s, l) => s + (l.amount ?? 0), 0)) };
}

export function totalsCheckOf(count: number, total: number, linesInFile: number | null, totalInFile: number | null): string {
  if (linesInFile === null && totalInFile === null) return TC_NONE;
  if (linesInFile !== null && Math.round(linesInFile) !== count) return TC_MISMATCH;
  if (totalInFile !== null && Math.abs(round2(totalInFile) - round2(total)) > EPS) return TC_MISMATCH;
  return TC_MATCH;
}

const fmt = (n: number) => formatIls(n);

export function totalsSentence(rows: number, count: number, total: number, check: string, linesInFile: number | null, totalInFile: number | null): string {
  const read = `נקראו ${rows} שורות${rows !== count ? ` (${count} זיכויים)` : ''}, סה״כ ${fmt(total)}.`;
  const file = [linesInFile !== null ? `${linesInFile} תנועות` : '', totalInFile !== null ? fmt(totalInFile) : ''].filter(Boolean).join(', ');
  if (check === TC_MATCH) return `${read} תואם לסיכום בקובץ`;
  if (check === TC_MISMATCH) return `${read} לא תואם: בקובץ ${file}`;
  return `${read} אין סיכום בקובץ להשוואה`;
}

/** Duplicate key of a bank line: value date, amount, normalised payer, normalised reference. */
export const dupKey = (valueDate: unknown, amount: unknown, payer: unknown, reference: unknown) =>
  [toIsraelDate(valueDate) ?? '', round2(num(amount)).toFixed(2), normName(payer), normQuote(reference)].join('|');

