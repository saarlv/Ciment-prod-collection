// The note engine – plan 04.11 part A, stage 2 (CustomerNotes; the old aging-notes / payment-promises layer was removed in wave 3).
//
// One note = one customer (customer = a real reference to Customers.id; customerCode / customerName copied for the
// agents) + one due month (dueMonth YYYY-MM). Types: the four active ones (התחייבות לתשלום / תשלום באשראי / צ׳ק אצל
// סוכן / חזור אליי – actionDate required, each opens a grouped task by AgentSettings noteTask.<type>.*) and אחר (free
// customTypeLabel, noteText required). reminderDate on any type opens the grouped task תזכורות.
//
// Everything that writes a note goes through writeCustomerNote here: AddCustomerNote, the email panel's "אשר הבטחה"
// (AddCustomerNote with sourceEmailId), Tamar in the card. Month balances always come from the
// OpenMovements mirror (sum of amount per customerCode + dueMonth; no rows = 0).
//
// Never writes to Priority and never contacts anyone.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { addDays, businessDayOnOrAfter, formatShortDate, isMonthKey, isValidDate, israelToday, monthKeyOf, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { errText, findCustomer, isFixtureCustomer, num, numOrNull, readAll, readByIds, readSettings, readWhereIn, round2, splitList, str } from './collections-data.ts';
import { HS_DONE, PROPOSAL_APPROVED, promiseProposalOf, readQuotes } from './collections-inbox.ts';
import { isApprovedReceipt } from './collections-invoice-layer.ts';
import { refId } from './collections-morning-pull.ts';
import { type NoteTaskKey, noteTaskRule, S_BANK_CHECK_AT } from './plan-settings.ts';

// ---------- enums (exactly as in the CustomerNotes artifact) ----------
export const NT_COMMITMENT = 'התחייבות לתשלום';
export const NT_CARD = 'תשלום באשראי';
export const NT_AGENT_CHEQUE = 'צ׳ק אצל סוכן';
export const NT_CALLBACK = 'חזור אליי';
export const NT_OTHER = 'אחר';
export const NOTE_TYPES = [NT_COMMITMENT, NT_CARD, NT_AGENT_CHEQUE, NT_CALLBACK, NT_OTHER];
/** the four types that need an actionDate and open a grouped task */
export const ACTIVE_NOTE_TYPES = [NT_COMMITMENT, NT_CARD, NT_AGENT_CHEQUE, NT_CALLBACK];
/** noteType → its noteTask.<key>.* settings key (reminder = any note with a reminderDate) */
export const NOTE_TYPE_TASK_KEY: Record<string, NoteTaskKey> = {
  [NT_COMMITMENT]: 'promise',
  [NT_CARD]: 'creditCard',
  [NT_AGENT_CHEQUE]: 'agentCheque',
  [NT_CALLBACK]: 'callBack',
};

export const ST_ACTIVE = 'פעילה';
export const ST_MONTH_ZERO = 'נסגרה – החודש התאפס';
export const ST_MANUAL = 'נסגרה ידנית';

export const OUT_OPEN = 'פתוחה';
export const OUT_KEPT = 'קוימה';
export const OUT_PARTLY = 'קוימה חלקית';
export const OUT_NOT_KEPT = 'לא קוימה';
/** outcomes CheckCommitments (re)evaluates; קוימה is final */
export const OUTCOMES_TO_CHECK = [OUT_OPEN, OUT_PARTLY, OUT_NOT_KEPT];

export const SRC_TEAM = 'צוות';
export const SRC_MAYA = 'מאיה ממייל';
export const SRC_TAMAR = 'תמר בכרטיס';
export const SRC_MIGRATION = 'מיגרציה';
/** sources a writer may pass (מיגרציה is the migration's only) */
export const INPUT_NOTE_SOURCES = [SRC_TEAM, SRC_MAYA, SRC_TAMAR];

export const REFUSED_EMAIL_APPROVED = 'ההבטחה מהמייל הזה כבר אושרה';
const MAYA = 'מאיה';
const EMAIL_QUOTE_CHARS = 200;

const TABLE = 'CustomerNotes';
const EPS = 0.005;

export const isActiveNote = (n: Item) => str(n.status).trim() === ST_ACTIVE;
export const isCommitment = (n: Item) => str(n.noteType).trim() === NT_COMMITMENT;
/** "אחר – בירור – מחיר" style label of a note's type */
export const noteTypeLabel = (n: Item) => {
  const t = str(n.noteType).trim() || NT_OTHER;
  const custom = str(n.customTypeLabel).trim();
  return t === NT_OTHER && custom ? custom : t;
};
/** What a commitment promised: its amount, else the month's balance when it was written. */
export const promisedOf = (n: Item): number => {
  const a = numOrNull(n.amount);
  return round2(a !== null ? a : Math.max(0, num(n.balanceAtNote)));
};

// ---------- month balances (OpenMovements) ----------
export const monthKey = (code: unknown, month: unknown) => `${str(code).trim()}|${str(month).trim()}`;

/** customerCode|dueMonth → open total (sum of amount), movement count. */
export function monthBalances(movements: Item[]): Map<string, { total: number; count: number }> {
  const out = new Map<string, { total: number; count: number }>();
  for (const m of movements) {
    const code = str(m.customerCode).trim();
    const month = str(m.dueMonth).trim();
    if (!code || !month) continue;
    const k = monthKey(code, month);
    const cur = out.get(k) ?? { total: 0, count: 0 };
    cur.total = round2(cur.total + num(m.amount));
    cur.count += 1;
    out.set(k, cur);
  }
  return out;
}

/** The month's open total (no rows = 0). */
export const balanceOf = (balances: Map<string, { total: number; count: number }>, code: unknown, month: unknown) => balances.get(monthKey(code, month))?.total ?? 0;

/** True when OpenMovements has at least one row (an empty mirror = the pull never ran / failed: nothing is judged). */
export async function hasAnyMovement(client: BlocksClient): Promise<boolean> {
  const res = await client.queryTable('OpenMovements', { from: { table: 'OpenMovements' }, limit: 1 });
  return (res?.items ?? []).length > 0;
}

/** The customers' open months, oldest first, with their totals (only months above 0). */
export function openMonthsOf(movements: Item[], code: string): string[] {
  const b = monthBalances(movements.filter((m) => str(m.customerCode).trim() === code));
  return [...b.entries()]
    .filter(([, v]) => v.total > EPS)
    .map(([k]) => k.split('|')[1])
    .sort();
}

// ---------- validation (shared by Add and Update) ----------
export interface NoteFields {
  noteType: string;
  dueMonth: string;
  customTypeLabel: string | null;
  noteText: string | null;
  actionDate: string | null;
  reminderDate: string | null;
  amount: number | null;
}

const dateOrRaw = (v: unknown): { value: string | null; bad: string | null } => {
  const raw = str(v).trim();
  if (!raw) return { value: null, bad: null };
  const d = raw.slice(0, 10);
  return isValidDate(d) ? { value: d, bad: null } : { value: null, bad: raw };
};

/** Reads and validates the note fields; Hebrew errors for every problem (nothing is written when there is one). */
export function readNoteFields(input: Item, errors: string[]): NoteFields {
  const noteType = str(input.noteType).trim();
  if (!NOTE_TYPES.includes(noteType)) errors.push(`סוג הערה לא מוכר: "${noteType}". אפשר לבחור: ${NOTE_TYPES.join(', ')}`);
  const dueMonth = str(input.dueMonth).trim();
  if (!isMonthKey(dueMonth)) errors.push(`חודש הפירעון חייב להיות בפורמט YYYY-MM (dueMonth: "${dueMonth}")`);
  const action = dateOrRaw(input.actionDate);
  if (action.bad) errors.push(`התאריך אינו תאריך תקין בפורמט YYYY-MM-DD (actionDate: "${action.bad}")`);
  else if (ACTIVE_NOTE_TYPES.includes(noteType) && !action.value) errors.push(`בהערה מסוג "${noteType}" חובה לבחור תאריך (actionDate)`);
  const reminder = dateOrRaw(input.reminderDate);
  if (reminder.bad) errors.push(`תאריך התזכורת אינו תאריך תקין בפורמט YYYY-MM-DD (reminderDate: "${reminder.bad}")`);
  let amount: number | null = null;
  const rawAmount = input.amount;
  if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
    const n = Number(rawAmount);
    if (!Number.isFinite(n)) errors.push(`הסכום אינו מספר (amount: "${str(rawAmount)}")`);
    else if (n < 0) errors.push(`הסכום לא יכול להיות שלילי (amount: ${n})`);
    else amount = round2(n);
  }
  const noteText = str(input.noteText).trim() || null;
  if (noteType === NT_OTHER && !noteText) errors.push('בהערה מסוג "אחר" חובה לכתוב תוכן (noteText)');
  const label = str(input.customTypeLabel).trim() || null;
  return { noteType, dueMonth, customTypeLabel: noteType === NT_OTHER ? label : null, noteText, actionDate: action.value, reminderDate: reminder.value, amount };
}

// ---------- the task preview ----------
/** The day a grouped task opens for a trigger date: a trigger on Friday / Saturday opens on the next business day. */
export function taskOpenDay(trigger: string, asOfDate: string): string {
  return businessDayOnOrAfter(trigger > asOfDate ? trigger : asOfDate);
}

/** Hebrew line(s): which grouped task will open and when (e.g. "תיפתח משימה ב-12.11 אם החודש לא יתאפס"). */
export function taskPreviewOf(settings: Map<string, string>, n: Pick<NoteFields, 'noteType' | 'actionDate' | 'reminderDate'>, asOfDate: string): string {
  const lines: string[] = [];
  const key = NOTE_TYPE_TASK_KEY[n.noteType];
  if (key && n.actionDate) {
    const rule = noteTaskRule(settings, key);
    if (rule.offsetDays === null) lines.push(`לא ניתן לחשב את מועד המשימה – ההגדרה noteTask.${key}.offsetDays אינה מספר`);
    else {
      const day = formatShortDate(taskOpenDay(addDays(n.actionDate, rule.offsetDays), asOfDate));
      lines.push(
        key === 'promise' || rule.runAt === S_BANK_CHECK_AT
          ? `תיפתח משימה "${rule.taskType}" ב-${day} אחרי ריצת התקבולים, אם ההתחייבות לא תקוים והחודש לא יתאפס`
          : `תיפתח משימה "${rule.taskType}" ב-${day} אם החודש לא יתאפס`,
      );
    }
  }
  if (n.reminderDate) {
    const rule = noteTaskRule(settings, 'reminder');
    if (rule.offsetDays === null) lines.push('לא ניתן לחשב את מועד התזכורת – ההגדרה noteTask.reminder.offsetDays אינה מספר');
    else lines.push(`תזכורת: תיפתח משימה "${rule.taskType}" ב-${formatShortDate(taskOpenDay(addDays(n.reminderDate, rule.offsetDays), asOfDate))} אם החודש לא יתאפס`);
  }
  return lines.length ? lines.join(' · ') : 'הערה בלי משימה – נשמרת בהיסטוריה של החודש';
}

// ---------- reading what a writer needs ----------
export interface NoteContext {
  customer: Item | undefined;
  movements: Item[];
  settings: Map<string, string>;
}

async function readNoteContext(client: BlocksClient, customerCode: string): Promise<NoteContext> {
  const [customer, movements, settings] = await Promise.all([
    findCustomer(client, customerCode),
    readAll(client, 'OpenMovements', { column: 'customerCode', value: customerCode }),
    readSettings(client),
  ]);
  return { customer, movements, settings };
}

/** Default author: the given name, else the signed-in user, else the source's agent / team. */
async function authorOf(client: BlocksClient, given: unknown, source: string): Promise<string> {
  const g = str(given).trim();
  if (g) return g;
  try {
    const u = (await client.getCurrentUser())?.user;
    if (str(u?.name).trim()) return str(u?.name).trim();
  } catch {
    // no signed-in user (a scheduled / agent call)
  }
  return source === SRC_MAYA ? MAYA : source === SRC_TAMAR ? 'תמר' : SRC_TEAM;
}

/** The due month of a set of invoice numbers: the oldest due month among them (OpenMovements docNumber, else Invoices). */
export async function oldestMonthOfInvoices(client: BlocksClient, customerCode: string, invoiceNumbers: string[], movements: Item[]): Promise<string | null> {
  const nos = [...new Set(invoiceNumbers.map((n) => str(n).trim()).filter(Boolean))];
  if (!nos.length) return null;
  const months: string[] = [];
  for (const m of movements) {
    if (str(m.customerCode).trim() === customerCode && nos.includes(str(m.docNumber).trim()) && isMonthKey(str(m.dueMonth).trim())) months.push(str(m.dueMonth).trim());
  }
  const found = new Set(movements.filter((m) => nos.includes(str(m.docNumber).trim())).map((m) => str(m.docNumber).trim()));
  const missing = nos.filter((n) => !found.has(n));
  if (missing.length) {
    const invoices = (await readWhereIn(client, 'Invoices', 'invoiceNumber', missing)).filter((i) => str(i.customerCode).trim() === customerCode);
    for (const i of invoices) {
      const mk = str(i.dueMonth).trim();
      const due = toIsraelDate(i.dueDate);
      if (isMonthKey(mk)) months.push(mk);
      else if (due) months.push(monthKeyOf(due));
    }
  }
  return months.sort()[0] ?? null;
}

// ---------- writing a note ----------
export interface NoteInput {
  customerCode?: unknown;
  dueMonth?: unknown;
  noteType?: unknown;
  customTypeLabel?: unknown;
  noteText?: unknown;
  actionDate?: unknown;
  reminderDate?: unknown;
  amount?: unknown;
  authorName?: unknown;
  noteSource?: unknown;
  sourceEmailId?: unknown;
  /** email approval: the invoices the person selected (else the proposal's invoices) */
  promiseInvoiceNumbers?: unknown;
  dryRun?: unknown;
}

export interface WriteNoteOptions {
  nowIso?: string;
  asOfDate?: string | null;
  /** sync the grouped tasks after the write (default true; never fails the write) */
  syncTasks?: boolean;
  /** the grouped-task sync (collections-note-tasks.ts syncNoteTasksAfterWrite), injected to keep this module free of the task engine */
  taskSync?: (client: BlocksClient, x: { noteIds: string[]; customerCode: string; asOfDate: string; nowIso: string }) => Promise<Item>;
  /** the email's own task sync (inbox:<id>) after an approval */
  emailTaskSync?: (client: BlocksClient, emailId: string) => Promise<Item>;
  /** sourceEmailId only records where the note came from (Maya's dispute notes) – no promise approval */
  emailLinkOnly?: boolean;
}

export interface WriteNoteResult {
  dryRun: boolean;
  note: Item | null;
  taskPreview: string;
  refused: boolean;
  refusalReason: string | null;
  existingNoteId: string | null;
  taskSync: Item | null;
  email?: Item | null;
  writeVerified: boolean;
  errors: string[];
}

const toList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : typeof v === 'string' ? splitList(v) : []);

/**
 * Writes ONE CustomerNotes row (always a new row – history is kept). With sourceEmailId it approves Maya's promise
 * proposal on the email: one התחייבות לתשלום note (noteSource מאיה ממייל, amount / date from the proposal unless given,
 * dueMonth = given, else the oldest due month of the quoted invoices, else the customer's oldest open month), the
 * proposal → אושרה (approvedNoteId, approvedPromiseId = the note id for the screens, approvedBy, approvedAt), the email
 * טופל; a second approval is refused and writes nothing. Validation failures refuse too (refused, refusalReason, errors).
 */
export async function writeCustomerNote(client: BlocksClient, input: NoteInput, opts: WriteNoteOptions = {}): Promise<WriteNoteResult> {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const errors: string[] = [];
  const out: WriteNoteResult = { dryRun, note: null, taskPreview: '', refused: false, refusalReason: null, existingNoteId: null, taskSync: null, writeVerified: false, errors };
  const refuse = (reasons: string[]) => {
    errors.push(...reasons);
    out.refused = true;
    out.refusalReason = errors.join('; ');
    return out;
  };
  let asOfDate: string;
  try {
    asOfDate = opts.asOfDate ? resolveAsOf(opts.asOfDate) : israelToday();
  } catch (e) {
    return refuse([errText(e)]);
  }

  const customerCode = str(input.customerCode).trim();
  const sourceEmailId = str(input.sourceEmailId).trim();
  const fromEmail = !!sourceEmailId && !opts.emailLinkOnly;
  const noteSource = fromEmail ? SRC_MAYA : str(input.noteSource).trim() || SRC_TEAM;
  const fields: Item = { ...input };

  // ---------- the email approval: the proposal on the email ----------
  let email: Item | null = null;
  let proposal: Item | null = null;
  if (fromEmail) {
    email = (await readByIds(client, 'InboundEmails', [sourceEmailId]))[0] ?? null;
    if (!email) return refuse([`המייל ${sourceEmailId} לא נמצא`]);
    proposal = promiseProposalOf(email);
    if (!proposal) return refuse(['במייל הזה אין הצעת הבטחה של מאיה לאישור']);
    // a second approval: the proposal is אושרה / carries a note id, or a commitment was already written from this email
    let existing = str(proposal.approvedNoteId).trim();
    if (!existing) {
      const rows = await readAll(client, TABLE, { column: 'sourceEmailId', value: sourceEmailId });
      existing = str(rows.find(isCommitment)?.id);
    }
    if (existing || str(proposal.status).trim() === PROPOSAL_APPROVED || str(proposal.approvedPromiseId).trim()) {
      out.refused = true;
      out.refusalReason = REFUSED_EMAIL_APPROVED;
      out.existingNoteId = existing || str(proposal.approvedPromiseId).trim() || null;
      out.email = email;
      return out;
    }
    const emailCode = str(email.customerCode).trim();
    if (emailCode && customerCode && emailCode !== customerCode) errors.push(`המייל שייך ללקוח ${emailCode} ולא ל-${customerCode}`);
    const t = str(input.noteType).trim();
    if (t && t !== NT_COMMITMENT) errors.push(`מהמייל אפשר לאשר רק הערה מסוג "${NT_COMMITMENT}" (התקבל "${t}")`);
    const given = (v: unknown) => v !== undefined && v !== null && str(v).trim() !== '';
    fields.noteType = NT_COMMITMENT;
    fields.amount = given(input.amount) ? input.amount : proposal.amount ?? null;
    fields.actionDate = given(input.actionDate) ? input.actionDate : proposal.date ?? null;
    if (errors.length) return refuse([]);
  }

  if (!customerCode) return refuse(['חסר קוד לקוח (customerCode)']);
  if (!INPUT_NOTE_SOURCES.includes(noteSource)) return refuse([`מקור הערה לא מוכר: "${noteSource}". אפשר: ${INPUT_NOTE_SOURCES.join(', ')}`]);

  const ctx = await readNoteContext(client, customerCode);
  if (!ctx.customer) return refuse([`לקוח ${customerCode} לא נמצא`]);

  // email: the month when not given = the oldest due month of the quoted invoices, else the customer's oldest open month
  let quoted: string[] = [];
  if (fromEmail) {
    quoted = toList(input.promiseInvoiceNumbers);
    if (!quoted.length) quoted = toList(proposal?.invoiceNumbers);
    if (!str(fields.dueMonth).trim()) {
      fields.dueMonth = (await oldestMonthOfInvoices(client, customerCode, quoted, ctx.movements)) ?? openMonthsOf(ctx.movements, customerCode)[0] ?? '';
      if (!fields.dueMonth) return refuse(['לא ניתן לקבוע את חודש הפירעון: החשבוניות שבמייל לא נמצאו ואין ללקוח חודש פתוח (dueMonth)']);
    }
    if (!str(fields.noteText).trim()) {
      const quote = str(proposal?.quote).trim();
      const parts = [quote ? `מתוך המייל: "${quote.slice(0, EMAIL_QUOTE_CHARS)}"` : 'הבטחת תשלום מהמייל', quoted.length ? `חשבוניות: ${quoted.join(', ')}` : ''].filter(Boolean);
      fields.noteText = parts.join(' · ');
    } else if (quoted.length) fields.noteText = `${str(fields.noteText).trim()} · חשבוניות: ${quoted.join(', ')}`;
  }

  const f = readNoteFields(fields, errors);
  if (errors.length) return refuse([]);

  const balanceAtNote = balanceOf(monthBalances(ctx.movements), customerCode, f.dueMonth);
  const authorName = await authorOf(client, input.authorName, noteSource);
  const note: Item = {
    customer: refId(ctx.customer.id),
    customerCode,
    customerName: str(ctx.customer.customerName).trim() || customerCode,
    noteCreatedAt: nowIso,
    dueMonth: f.dueMonth,
    noteType: f.noteType,
    customTypeLabel: f.customTypeLabel,
    noteText: f.noteText,
    actionDate: f.actionDate,
    reminderDate: f.reminderDate,
    amount: f.amount,
    balanceAtNote,
    authorName,
    noteSource,
    sourceEmailId: sourceEmailId || null,
    status: ST_ACTIVE,
    closedAt: null,
    outcome: f.noteType === NT_COMMITMENT ? OUT_OPEN : null,
    amountReceived: null,
    amountRemaining: null,
    checkedAt: null,
    legacyId: null,
    isTestFixture: isFixtureCustomer(ctx.customer, customerCode),
  };
  out.taskPreview = taskPreviewOf(ctx.settings, f, asOfDate);
  if (dryRun) {
    out.note = note;
    if (fromEmail) out.email = email;
    return out;
  }

  let saved: Item | null = null;
  try {
    saved = (await client.createItem(TABLE, note))?.item ?? null;
  } catch (e) {
    errors.push(`שמירת ההערה נכשלה: ${errText(e)}`);
    return out;
  }
  const noteId = str(saved?.id);
  if (!noteId) {
    errors.push('שמירת ההערה נכשלה: לא הוחזר מזהה');
    return out;
  }
  let noteVerified = false;
  try {
    const back = (await client.getItem(TABLE, noteId))?.item;
    noteVerified =
      !!back &&
      str(back.customerCode) === customerCode &&
      str(back.dueMonth) === f.dueMonth &&
      str(back.noteType) === f.noteType &&
      str(back.status) === ST_ACTIVE &&
      str(toIsraelDate(back.actionDate) ?? '') === str(f.actionDate ?? '');
    out.note = back ?? saved;
  } catch (e) {
    out.note = saved;
    errors.push(`אימות הכתיבה נכשל: ${errText(e)}`);
  }

  // ---------- the email: proposal approved, email handled ----------
  let emailVerified = true;
  if (fromEmail && email) {
    const quotes = readQuotes(email.classificationQuotes);
    try {
      await client.updateItem('InboundEmails', sourceEmailId, {
        classificationQuotes: {
          ...quotes,
          promise: { ...(quotes.promise ?? {}), status: PROPOSAL_APPROVED, approvedNoteId: noteId, approvedPromiseId: noteId, approvedBy: authorName, approvedAt: nowIso },
        },
        handlingState: HS_DONE,
        handledBy: authorName,
        handledAt: nowIso,
        waitingFor: null,
        waitingSince: null,
      });
      const [back] = await readByIds(client, 'InboundEmails', [sourceEmailId]);
      const p = back ? promiseProposalOf(back) : null;
      emailVerified = !!back && str(back.handlingState) === HS_DONE && str(p?.approvedNoteId) === noteId && str(p?.status) === PROPOSAL_APPROVED;
      out.email = back ?? null;
      if (!emailVerified) errors.push(`המייל ${sourceEmailId} לא נקרא בחזרה כפי שנכתב`);
    } catch (e) {
      emailVerified = false;
      errors.push(`ההערה נשמרה, אבל עדכון המייל נכשל: ${errText(e)}`);
    }
  }

  // ---------- tasks (never fail the write) ----------
  const taskSyncs: Item[] = [];
  if (opts.syncTasks !== false) {
    if (fromEmail && opts.emailTaskSync) {
      try {
        taskSyncs.push(await opts.emailTaskSync(client, sourceEmailId));
      } catch (e) {
        taskSyncs.push({ errors: [`משימות המייל: ${errText(e)}`] });
      }
    }
    if (opts.taskSync) {
      try {
        taskSyncs.push(await opts.taskSync(client, { noteIds: [noteId], customerCode, asOfDate, nowIso }));
      } catch (e) {
        taskSyncs.push({ errors: [`משימות: ${errText(e)}`] });
      }
    }
  }
  out.taskSync = taskSyncs.length === 1 ? taskSyncs[0] : taskSyncs.length ? { parts: taskSyncs } : null;
  out.writeVerified = noteVerified && emailVerified;
  return out;
}

// ---------- updating / closing a note ----------
export const EDITABLE_FIELDS = ['noteText', 'customTypeLabel', 'actionDate', 'reminderDate', 'amount', 'dueMonth'] as const;

export interface UpdateNoteResult {
  dryRun: boolean;
  note: Item | null;
  changed: string[];
  notice: string | null;
  taskSync: Item | null;
  writeVerified: boolean;
  errors: string[];
}

const sameValue = (a: unknown, b: unknown) => {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return true;
  if (typeof a === 'number' || typeof b === 'number') return numOrNull(a) !== null && numOrNull(b) !== null && Math.abs(num(a) - num(b)) < EPS;
  return str(a) === str(b);
};

/**
 * Edits or closes one note. noteType / customer / author / source never change. Same validation as a new note.
 * A commitment whose actionDate, amount or month changes is reset (outcome פתוחה, received / remaining / checkedAt
 * cleared) so it is checked again; a month change re-reads balanceAtNote for the new month.
 */
export async function updateCustomerNote(client: BlocksClient, input: Item, opts: WriteNoteOptions = {}): Promise<UpdateNoteResult> {
  const dryRun = input?.dryRun === true || input?.dryRun === 'true';
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const errors: string[] = [];
  const out: UpdateNoteResult = { dryRun, note: null, changed: [], notice: null, taskSync: null, writeVerified: false, errors };
  const noteId = str(input?.noteId).trim();
  if (!noteId) {
    errors.push('חסר מזהה הערה (noteId)');
    return out;
  }
  const close = input?.close === true || input?.close === 'true';
  const reopen = input?.reopen === true || input?.reopen === 'true';
  if (close && reopen) {
    errors.push('אי אפשר לסגור ולפתוח מחדש באותה פעולה (close + reopen)');
    return out;
  }
  let note: Item | undefined;
  try {
    note = (await readByIds(client, TABLE, [noteId]))[0];
  } catch (e) {
    errors.push(`${TABLE}: ${errText(e)}`);
    return out;
  }
  if (!note) {
    errors.push(`ההערה ${noteId} לא נמצאה`);
    return out;
  }
  out.note = note;
  const type = str(note.noteType).trim();
  const has = (k: string) => input && Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined;
  if (has('customTypeLabel') && type !== NT_OTHER && str(input.customTypeLabel).trim()) errors.push(`סוג חופשי (customTypeLabel) רק בהערה מסוג "${NT_OTHER}"`);

  // the merged values, validated as a whole
  const merged: Item = {
    noteType: type,
    dueMonth: has('dueMonth') ? input.dueMonth : note.dueMonth,
    customTypeLabel: has('customTypeLabel') ? input.customTypeLabel : note.customTypeLabel,
    noteText: has('noteText') ? input.noteText : note.noteText,
    actionDate: has('actionDate') ? input.actionDate : toIsraelDate(note.actionDate),
    reminderDate: has('reminderDate') ? input.reminderDate : toIsraelDate(note.reminderDate),
    amount: has('amount') ? input.amount : note.amount,
  };
  const f = readNoteFields(merged, errors);
  if (errors.length) return out;

  const patch: Item = {};
  const next: Item = {
    dueMonth: f.dueMonth,
    customTypeLabel: f.customTypeLabel,
    noteText: f.noteText,
    actionDate: f.actionDate,
    reminderDate: f.reminderDate,
    amount: f.amount,
  };
  for (const k of EDITABLE_FIELDS) {
    const before = k === 'actionDate' || k === 'reminderDate' ? toIsraelDate(note[k]) : note[k];
    if (!sameValue(before, next[k])) patch[k] = next[k];
  }
  // a new month: balanceAtNote is the new month's open total
  if ('dueMonth' in patch) {
    try {
      const movements = await readAll(client, 'OpenMovements', { column: 'customerCode', value: str(note.customerCode).trim() });
      patch.balanceAtNote = balanceOf(monthBalances(movements), note.customerCode, f.dueMonth);
    } catch (e) {
      errors.push(`OpenMovements: ${errText(e)}`);
      return out;
    }
  }
  // a commitment with a new date / amount / month is checked again on its new check day
  if (type === NT_COMMITMENT && ('actionDate' in patch || 'amount' in patch || 'dueMonth' in patch) && isActiveNote(note)) {
    Object.assign(patch, { outcome: OUT_OPEN, amountReceived: null, amountRemaining: null, checkedAt: null });
  }

  const status = str(note.status).trim();
  if (close) {
    if (status === ST_ACTIVE) Object.assign(patch, { status: ST_MANUAL, closedAt: nowIso });
    else out.notice = `ההערה כבר סגורה (${status || 'ללא סטטוס'}) – לא שונתה`;
  }
  if (reopen) {
    if (status === ST_MANUAL) Object.assign(patch, { status: ST_ACTIVE, closedAt: null });
    else if (status === ST_MONTH_ZERO) out.notice = 'ההערה נסגרה כי החודש התאפס – היא לא נפתחת מחדש. אפשר לכתוב הערה חדשה';
    else out.notice = 'ההערה כבר פעילה';
  }
  out.changed = Object.keys(patch);
  const preview: Item = { ...note, ...patch };
  if (dryRun || !out.changed.length) {
    out.note = preview;
    out.writeVerified = !dryRun;
    return out;
  }
  try {
    await client.updateItem(TABLE, noteId, patch);
    const [back] = await readByIds(client, TABLE, [noteId]);
    out.note = back ?? preview;
    out.writeVerified =
      !!back &&
      out.changed.every((k) => {
        const b = k === 'actionDate' || k === 'reminderDate' ? toIsraelDate(back[k]) : back[k];
        return sameValue(b, patch[k]);
      });
    if (!out.writeVerified) errors.push(`${TABLE} ${noteId}: לא נקרא בחזרה כפי שנכתב`);
  } catch (e) {
    errors.push(`${TABLE} ${noteId}: ${errText(e)}`);
    return out;
  }
  if (opts.syncTasks !== false && opts.taskSync) {
    try {
      out.taskSync = await opts.taskSync(client, { noteIds: [noteId], customerCode: str(note.customerCode).trim(), asOfDate: opts.asOfDate ? resolveAsOf(opts.asOfDate) : israelToday(), nowIso });
    } catch (e) {
      out.taskSync = { errors: [`משימות: ${errText(e)}`] };
    }
  }
  return out;
}

// ---------- what came in since a commitment (CheckCommitments) ----------
export interface ReceivedEntry {
  ref: string;
  kind: 'ours' | 'priority';
  date: string | null;
  amount: number;
}

/**
 * Every receipt of the customer dated from `sinceDate` to `asOfDate`: our Receipts approved here (אושרה – לא נשלחה /
 * הונפקה ב-Priority – a draft never counts) and Priority's receipts (Payments mirror). A Payments row that is the Priority
 * copy of one of our receipts (its receiptNumber is our priorityReceiptNumber, or the same bankLineId) is skipped, so a
 * receipt counts once (the collections-promise-paid.ts rule for closing receipts). Credit notes are not receipts: only positive amounts count.
 */
export function receivedSince(code: string, sinceDate: string, asOfDate: string, src: { receipts: Item[]; payments: Item[] }): { total: number; entries: ReceivedEntry[] } {
  const same = (r: Item) => str(r.customerCode).trim() === code;
  const inWindow = (d: string | null) => !!d && d >= sinceDate && d <= asOfDate;
  const ours = src.receipts.filter(same);
  const ourPriorityNumbers = new Set(ours.map((r) => str(r.priorityReceiptNumber).trim()).filter(Boolean));
  const ourBankLines = new Set(ours.map((r) => str(r.bankLineId).trim()).filter(Boolean));
  const entries: ReceivedEntry[] = [];
  for (const r of ours) {
    if (!isApprovedReceipt(r)) continue;
    const amount = round2(num(r.amount));
    if (amount <= EPS) continue;
    const date = toIsraelDate(r.valueDate) ?? toIsraelDate(r.preparedAt);
    if (!inWindow(date)) continue;
    entries.push({ ref: str(r.receiptKey).trim() || `R:${str(r.id)}`, kind: 'ours', date, amount });
  }
  for (const p of src.payments.filter(same)) {
    const amount = round2(num(p.amount));
    if (amount <= EPS) continue;
    if (str(p.receiptNumber).trim() && ourPriorityNumbers.has(str(p.receiptNumber).trim())) continue;
    if (str(p.bankLineId).trim() && ourBankLines.has(str(p.bankLineId).trim())) continue;
    const date = toIsraelDate(p.paymentDate);
    if (!inWindow(date)) continue;
    entries.push({ ref: `P:${str(p.paymentRef).trim() || str(p.receiptNumber).trim() || str(p.id)}`, kind: 'priority', date, amount });
  }
  entries.sort((a, b) => str(a.date).localeCompare(str(b.date)));
  return { total: round2(entries.reduce((s, e) => s + e.amount, 0)), entries };
}

/** The outcome of a commitment from the month balance, what was promised and what came in. */
export function commitmentOutcome(x: { monthBalance: number; promised: number; received: number }): { outcome: string; remaining: number } {
  if (x.monthBalance <= EPS || x.received >= x.promised - EPS) return { outcome: OUT_KEPT, remaining: 0 };
  const remaining = round2(Math.max(x.promised - x.received, 0));
  return { outcome: x.received > EPS ? OUT_PARTLY : OUT_NOT_KEPT, remaining };
}

// ---------- Maya's dispute from an email (ApplyMailClassification) ----------
export const DISPUTE_LABEL_PREFIX = 'בירור – ';

/**
 * Maya's dispute (a conditional payment / a claim the invoice is wrong) as CustomerNotes: one אחר note per due month of
 * the quoted invoices (customTypeLabel "בירור – <reason>", noteSource מאיה ממייל, sourceEmailId), once per email and
 * month (a rerun writes nothing new). A quoted invoice that is not open (no open movement, Priority's open amount 0) is
 * skipped. Returns every note id of the email's dispute (existing + new).
 */
export async function writeEmailDisputeNotes(
  client: BlocksClient,
  x: { customerCode: string; emailId: string; reason: string; quote: string; invoiceNumbers: string[]; receivedDay: string; contactName?: string | null; nowIso?: string },
  sync: Pick<WriteNoteOptions, 'taskSync'> = {},
): Promise<{ noteIds: string[]; createdMonths: string[]; taskSync?: Item | null; errors: string[] }> {
  const errors: string[] = [];
  const nos = [...new Set(x.invoiceNumbers.map((n) => str(n).trim()).filter(Boolean))];
  const [existing, movements, invoices] = await Promise.all([
    readAll(client, TABLE, { column: 'sourceEmailId', value: x.emailId }),
    readAll(client, 'OpenMovements', { column: 'customerCode', value: x.customerCode }),
    nos.length ? readWhereIn(client, 'Invoices', 'invoiceNumber', nos) : Promise.resolve([] as Item[]),
  ]);
  const mine = existing.filter((n) => str(n.noteType).trim() === NT_OTHER && str(n.customTypeLabel).startsWith(DISPUTE_LABEL_PREFIX));
  const have = new Set(mine.map((n) => str(n.dueMonth).trim()));
  // the due month of each quoted open invoice: its open movement, else the Invoices row (open in Priority)
  const byMonth = new Map<string, string[]>();
  for (const no of nos) {
    const mv = movements.find((m) => str(m.docNumber).trim() === no && Math.abs(num(m.amount)) > EPS && isMonthKey(str(m.dueMonth).trim()));
    let month = mv ? str(mv.dueMonth).trim() : '';
    if (!month) {
      const inv = invoices.find((i) => str(i.invoiceNumber).trim() === no && str(i.customerCode).trim() === x.customerCode && Math.abs(num(i.openAmount)) > EPS);
      const due = toIsraelDate(inv?.dueDate);
      month = inv ? (isMonthKey(str(inv.dueMonth).trim()) ? str(inv.dueMonth).trim() : due ? monthKeyOf(due) : '') : '';
    }
    if (!month) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(no);
  }
  const ids = mine.map((n) => str(n.id));
  const createdMonths: string[] = [];
  const day = /^\d{4}-\d{2}-\d{2}$/.test(x.receivedDay) ? `${x.receivedDay.slice(8, 10)}.${x.receivedDay.slice(5, 7)}.${x.receivedDay.slice(0, 4)}` : x.receivedDay;
  for (const [month, list] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (have.has(month)) continue;
    const r = await writeCustomerNote(
      client,
      {
        customerCode: x.customerCode,
        dueMonth: month,
        noteType: NT_OTHER,
        customTypeLabel: `${DISPUTE_LABEL_PREFIX}${x.reason}`,
        noteText: `בבירור מול הלקוח – ${x.reason} (מייל נכנס מ-${day}${x.contactName ? `, ${x.contactName}` : ''}; חשבוניות: ${list.join(', ')}): "${str(x.quote).trim().slice(0, 300)}"`,
        authorName: MAYA,
        noteSource: SRC_MAYA,
        sourceEmailId: x.emailId,
      },
      { nowIso: x.nowIso, syncTasks: !!sync.taskSync, taskSync: sync.taskSync, emailLinkOnly: true },
    );
    errors.push(...r.errors.map((e) => `הערת בירור ${month}: ${e}`));
    if (r.note?.id) {
      ids.push(str(r.note.id));
      createdMonths.push(month);
    }
  }
  return { noteIds: [...new Set(ids)], createdMonths, errors };
}
