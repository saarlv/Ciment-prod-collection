// 2c – missing delivery notes / invoices. Shared by CheckInvoiceDocuments, CreateDocumentRequest,
// CheckDocumentScans and SimulateDeliveryNoteScan so the count, the case row, the customer package and
// the logistics drafts follow one set of rules.
//
// - Count per invoice: total = max(Invoices.deliveryNotesExpected, DeliveryNotes found), scanned = notes
//   with scanned = true.
// - Package (all scanned): Approvals kind מענה ללקוח, status ממתין, relatedTable Disputes, attachments =
//   the invoice document + every scan (one per line), only to a מאומת sender (or, without an email, the
//   customer's registered accounts contact). Test rows without a link get a marked "בדיקה" placeholder PDF,
//   stored back on the test row; a real Priority row is never written.
// - Logistics drafts: Approvals kind פנייה ללוגיסטיקה (בקשה / תזכורת), to the product line's logistics
//   owner from ProductLineContacts. Never sent.
// - Timer (CheckDocumentScans): past nextReminderAt with no reminder → reminder draft + תזכורת בטיוטה;
//   past it again → הוסלמה (ball with מנהל הגבייה, one Interactions הסלמה row).
// - Complete case (all scanned / מוכנה לשליחה ללקוח / נסגרה): its logistics drafts still ממתין are closed
//   as נדחה "בוטלה – כל התעודות נסרקו" (Approvals has no בוטלה status); the hourly run sweeps complete
//   cases too, so a draft left behind earlier is cancelled on the next run.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';
import { formatDateHe, israelDateOfInstant, israelLocalToUtcIso, nextBusinessDay, toIsraelDate } from './collections-dates.ts';
import {
  buildOwnerMap,
  errText,
  findCustomer,
  formatIls,
  mapLimit,
  num,
  numberSetting,
  ownerOf,
  readAll,
  readByIds,
  readSettings,
  readWhereIn,
  splitList,
  str,
} from './collections-data.ts';
import { joinLines, loadVerificationData, normEmail, replySubject, signBody, verifySender, VERIFIED } from './collections-mail.ts';
import { accountsContact } from './collections-ledger.ts';
import { C_DOCUMENTS, saveOutboxDraft, subjectBase } from './collections-outbox.ts';
import { COMPANY_HEADER, esc, FONT_BOLD_URL, FONT_REGULAR_URL, htmlToPdf, ltr, mixed } from './collections-statement.ts';
import {
  AGENT_MAYA,
  CASE_CLOSED,
  emailByMessageId,
  formatIsraelDateTime,
  isTestCase,
  isTestMirror,
  isTrue,
  mailboxOf,
  PENDING,
  pendingCaseDrafts,
  readTeam,
} from './collections-cases.ts';

// ---------- enums (verbatim from the table artifacts) ----------
export const DOC_DISPUTE = 'תעודת משלוח חסרה';
export const ST_WAITING = 'ממתינה לסריקה';
export const ST_REMINDER = 'תזכורת בטיוטה';
export const ST_ESCALATED = 'הוסלמה';
export const ST_READY = 'מוכנה לשליחה ללקוח';
/** Statuses the hourly chase works on. */
export const CHASE_STATUSES = [ST_WAITING, ST_REMINDER, ST_ESCALATED];
export const KIND_LOGISTICS = 'פנייה ללוגיסטיקה';
export const KIND_REPLY = 'מענה ללקוח';
export const BALL_LOGISTICS = 'לוגיסטיקה';
export const BALL_BOOKKEEPER = 'מנהלת חשבונות';
export const BALL_MANAGER = 'מנהל הגבייה';
const APPROVED_STATUSES = ['אושר', 'אושר – לא נשלח', 'אושר – לביצוע ב-Priority', 'בוצע', 'נשלח'];
const VERIFY_TASK = 'לאמת שולח';
const OPEN_TASK = ['ממתין', 'בטיפול'];

// ---------- outcomes (Maya's instructions rely on these strings) ----------
export const OUT_PACKAGE = 'חבילה מוכנה';
export const OUT_PACKAGE_VERIFY = 'הכל סרוק – לאמת שולח';
export const OUT_PACKAGE_NO_CONTACT = 'הכל סרוק – אין נמען רשום';
export const OUT_WAITING = 'ממתינה לסריקה';
export const OUT_REFUSED = 'סורבה';
// CheckDocumentScans actions
export const ACT_PACKAGE = OUT_PACKAGE;
export const ACT_REMINDER = 'תזכורת בטיוטה';
export const ACT_ESCALATED = 'הוסלמה';
export const ACT_NONE = 'ללא שינוי';

export type RequestKind = 'בקשה' | 'תזכורת';

export const DEFAULT_REMINDER_HOURS = 24;
export async function reminderHours(client: BlocksClient): Promise<number> {
  const h = numberSetting(await readSettings(client), 'logisticsReminderHours', DEFAULT_REMINDER_HOURS);
  return h > 0 ? h : DEFAULT_REMINDER_HOURS;
}

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const noteOrder = (a: Item, b: Item) => natural(str(a.noteNumber), str(b.noteNumber));

// ---------- counting ----------
export interface DocCount {
  invoiceNumber: string;
  expected: number;
  found: number;
  scanned: number;
  missingNoteNumbers: string[];
  /** Notes the invoice expects but that are not in DeliveryNotes at all. */
  missingUnknown: number;
  allScanned: boolean;
  notes: Item[];
}

export function countDocuments(invoice: Item | undefined, invoiceNumber: string, notes: Item[]): DocCount {
  const own = notes.filter((n) => str(n.invoiceNumber) === invoiceNumber).sort(noteOrder);
  const expected = Math.max(num(invoice?.deliveryNotesExpected), own.length);
  const scanned = own.filter((n) => isTrue(n.scanned)).length;
  const missingNoteNumbers = own.filter((n) => !isTrue(n.scanned)).map((n) => str(n.noteNumber));
  const missingUnknown = Math.max(0, expected - own.length);
  return {
    invoiceNumber,
    expected,
    found: own.length,
    scanned,
    missingNoteNumbers,
    missingUnknown,
    allScanned: missingNoteNumbers.length === 0 && missingUnknown === 0,
    notes: own,
  };
}

/** Sum of several invoices' counts (a case normally holds one invoice). */
export function mergeCounts(counts: DocCount[]) {
  return {
    expected: counts.reduce((s, c) => s + c.expected, 0),
    scanned: counts.reduce((s, c) => s + c.scanned, 0),
    missingNoteNumbers: counts.flatMap((c) => c.missingNoteNumbers),
    missingUnknown: counts.reduce((s, c) => s + c.missingUnknown, 0),
    allScanned: counts.every((c) => c.allScanned),
  };
}

export function productLineOf(invoice: Item | undefined, notes: Item[]): string {
  const own = str(invoice?.productLine).trim();
  if (own) return own;
  const missing = notes.find((n) => !isTrue(n.scanned) && str(n.productLine).trim());
  const any = missing ?? notes.find((n) => str(n.productLine).trim());
  return any ? str(any.productLine).trim() : '';
}

/**
 * Active logistics owner of a product line. Test cases prefer test contacts (falling back to a real one,
 * the draft is never sent); a real case never gets a test contact.
 */
export function logisticsContactFor(contacts: Item[], productLine: string, isTest: boolean): Item | null {
  const line = str(productLine).trim();
  if (!line) return null;
  const active = contacts.filter((c) => str(c.productLine).trim() === line && c.active !== false && c.active !== 'false');
  const test = active.filter((c) => isTrue(c.isTestFixture));
  const real = active.filter((c) => !isTrue(c.isTestFixture));
  const pick = isTest ? (test[0] ?? real[0]) : real[0];
  return pick ?? null;
}

export function countSentence(c: { expected: number; scanned: number; missingNoteNumbers: string[]; missingUnknown: number }) {
  const parts = [`סרוקות ${c.scanned} מתוך ${c.expected}`];
  if (c.missingNoteNumbers.length) parts.push(`חסרות: ${c.missingNoteNumbers.join(', ')}`);
  if (c.missingUnknown) parts.push(`ועוד ${c.missingUnknown} שלא נמצאו במערכת`);
  return parts.join('. ');
}

/** Open (not נסגרה) missing-delivery-note case holding this invoice, oldest first. */
export function openDocCaseFor(disputes: Item[], invoiceNumber: string): Item | null {
  return (
    disputes
      .filter((d) => str(d.disputeType) === DOC_DISPUTE && str(d.status) !== CASE_CLOSED && splitList(d.invoiceNumbers).includes(invoiceNumber))
      .sort((a, b) => Number(a.id) - Number(b.id))[0] ?? null
  );
}

// ---------- placeholder documents for test rows ----------

/** A clearly marked "בדיקה" PDF page (Hebrew RTL), for test rows that have no real document link. */
export function renderTestDocumentHtml(title: string, rows: [string, string][], note: string): string {
  const font = "'CimentAlef', 'Alef', 'DejaVu Sans', 'Arial', sans-serif";
  const cell = 'border: 1px solid #c9ced6; padding: 6px 8px; font-size: 11pt; text-align: right; vertical-align: top;';
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
@font-face { font-family: 'CimentAlef'; src: url('${FONT_REGULAR_URL}') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'CimentAlef'; src: url('${FONT_BOLD_URL}') format('truetype'); font-weight: bold; font-style: normal; }
@page { size: A4; margin: 20mm 16mm; @top-left { content: "בדיקה – מסמך מדומה"; font-family: ${font}; font-size: 9pt; color: #b42318; } }
</style>
</head>
<body dir="rtl" style="font-family: ${font}; color: #101828; margin: 0; direction: rtl; text-align: right;">
<div style="font-size: 13pt; color: #475467;">${esc(COMPANY_HEADER)}</div>
<div style="border: 2px solid #b42318; color: #b42318; padding: 10px 14px; margin: 14px 0; font-size: 15pt; font-weight: bold;">${mixed(title)}</div>
<table style="width: 100%; border-collapse: collapse;">
${rows.map(([k, v]) => `<tr><td style="${cell} width: 32%; font-weight: bold; background-color: #f8f9fb;">${esc(k)}</td><td style="${cell}">${v}</td></tr>`).join('\n')}
</table>
<div style="margin-top: 18px; font-size: 10pt; color: #b42318;">${esc(note)}</div>
</body>
</html>`;
}

const safeName = (s: string) => str(s).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'doc';

export function scanPlaceholderHtml(note: Item): string {
  const d = toIsraelDate(note.deliveryDate);
  return renderTestDocumentHtml(
    `בדיקה – סריקה מדומה של תעודת משלוח ${str(note.noteNumber)}`,
    [
      ['תעודת משלוח', ltr(note.noteNumber)],
      ['חשבונית', ltr(note.invoiceNumber)],
      ['לקוח', `${mixed(note.customerName)} (${ltr(note.customerCode)})`],
      ['אתר', mixed(note.siteName) || '—'],
      ['תאריך אספקה', d ? ltr(formatDateHe(d)) : '—'],
      ['קו מוצר', mixed(note.productLine) || '—'],
    ],
    'מסמך בדיקה בלבד: סריקה מדומה שהופקה במערכת הגבייה לצורך הדגמה. אינו תעודת משלוח אמיתית.',
  );
}

export const scanPlaceholderFile = (note: Item) => `test-scan-${safeName(str(note.noteNumber))}.pdf`;

export function invoicePlaceholderHtml(invoice: Item): string {
  const d = toIsraelDate(invoice.invoiceDate);
  const due = toIsraelDate(invoice.dueDate);
  return renderTestDocumentHtml(
    `בדיקה – עותק מדומה של חשבונית ${str(invoice.invoiceNumber)}`,
    [
      ['חשבונית', ltr(invoice.invoiceNumber)],
      ['לקוח', `${mixed(invoice.customerName)} (${ltr(invoice.customerCode)})`],
      ['תאריך', d ? ltr(formatDateHe(d)) : '—'],
      ['לתשלום עד', due ? ltr(formatDateHe(due)) : '—'],
      ['סכום', `${ltr(formatIls(num(invoice.amount)))} ש״ח`],
      ['תעודות משלוח צפויות', ltr(String(num(invoice.deliveryNotesExpected)))],
    ],
    'מסמך בדיקה בלבד: עותק מדומה שהופק במערכת הגבייה לצורך הדגמה. אינו חשבונית אמיתית.',
  );
}

export const invoicePlaceholderFile = (invoice: Item) => `test-invoice-${safeName(str(invoice.invoiceNumber))}.pdf`;

// ---------- the customer package ----------

export interface PackageResult {
  packaged: boolean;
  outcome: string;
  reason: string;
  approval: Item | null;
  replaced: boolean;
  attachments: string[];
  generated: { table: string; key: string; url: string }[];
  verifyTask: Item | null;
  writeVerified: boolean;
  errors: string[];
}

/**
 * Prepares (or, while ממתין, replaces) the customer package for a case whose notes are all scanned.
 * `dispute` must carry id for a write (dryRun may pass a planned row without one).
 */
export async function preparePackage(
  client: BlocksClient,
  args: { dispute: Item; email?: Item | null; dryRun: boolean; nowIso: string },
): Promise<PackageResult> {
  const { dispute, dryRun, nowIso } = args;
  const code = str(dispute.customerCode);
  const invoiceNumbers = splitList(dispute.invoiceNumbers);
  const isTest = isTestCase(dispute);
  const res: PackageResult = { packaged: false, outcome: OUT_PACKAGE, reason: '', approval: null, replaced: false, attachments: [], generated: [], verifyTask: null, writeVerified: false, errors: [] };

  const [email, customer, owners, invoices, notes, contacts, team, pending] = await Promise.all([
    args.email !== undefined ? Promise.resolve(args.email) : emailByMessageId(client, str(dispute.inboundEmailId)),
    code ? findCustomer(client, code) : Promise.resolve(undefined),
    code ? readAll(client, 'CustomerOwners', { column: 'customerCode', value: code }) : Promise.resolve([] as Item[]),
    readWhereIn(client, 'Invoices', 'invoiceNumber', invoiceNumbers),
    readWhereIn(client, 'DeliveryNotes', 'invoiceNumber', invoiceNumbers),
    readAll(client, 'CustomerContacts', { column: 'customerCode', value: code }),
    readTeam(client),
    dispute.id ? pendingCaseDrafts(client, String(dispute.id), KIND_REPLY) : Promise.resolve([] as Item[]),
  ]);
  const bookkeeper = ownerOf(code, customer, buildOwnerMap(owners)) || str(dispute.ownerBookkeeperName) || str(email?.assignedBookkeeperName);
  const customerName = str(customer?.customerName) || str(dispute.customerName);

  // ---- recipient: the verified sender, or (no email) the registered accounts contact ----
  let recipient = '';
  let recipientName = '';
  if (email) {
    recipient = normEmail(email.fromAddress);
    recipientName = str(email.fromName).trim() || recipient;
    let verification = str(email.senderVerification).trim();
    let shortReason = '';
    if (verification !== VERIFIED) {
      const data = await loadVerificationData(client, code ? [code] : []);
      const v = verifySender(email.fromAddress, code || null, data.contacts, data.customersByCode);
      if (!verification) verification = v.status;
      shortReason = v.shortReason;
    }
    if (verification !== VERIFIED || !recipient) {
      res.outcome = OUT_PACKAGE_VERIFY;
      res.reason = `השולח ${recipient || 'לא ידוע'} אינו מאומת (${verification || 'לא נבדק'}) – החבילה לא הוכנה; לאמת בטלפון ואז להריץ שוב`;
      // one open "לאמת שולח" task per email, like ClassifyAndLinkEmail
      const open = await readAll(client, 'CollectionQueue', {
        and: [
          { column: 'relatedTable', value: 'InboundEmails' },
          { column: 'relatedId', value: String(email.id) },
          { column: 'taskType', value: VERIFY_TASK },
          { column: 'status', operator: 'in', value: OPEN_TASK },
        ],
      });
      if (open.length) {
        res.verifyTask = open[0];
        res.writeVerified = true;
        return res;
      }
      const task: Item = {
        queueDate: israelDateOfInstant(new Date(nowIso)),
        customerCode: code || null,
        customerName: customerName || null,
        assignedBookkeeperName: bookkeeper || null,
        priorityScore: 70,
        reasons: `בקשת תעודות וחשבוניות חסרות מ-${recipient || 'שולח לא ידוע'}${shortReason ? ` – ${shortReason}` : ''}. לאמת בטלפון לפני ששולחים מסמכים`,
        recommendedAction: 'להתקשר',
        status: 'ממתין',
        handledBy: null,
        handledAt: null,
        taskType: VERIFY_TASK,
        needsManagerApproval: false,
        isAlert: false,
        relatedTable: 'InboundEmails',
        relatedId: String(email.id),
        dueAt: str(email.dueAt) || israelLocalToUtcIso(nextBusinessDay(israelDateOfInstant(new Date(nowIso))), 9, 0),
        isTestFixture: isTest,
      };
      if (dryRun) {
        res.verifyTask = task;
        return res;
      }
      try {
        const saved = (await client.createItem('CollectionQueue', task))?.item;
        await client.updateItem('InboundEmails', String(email.id), { status: 'ממתינה לגורם פנימי' });
        const back = saved?.id ? (await client.getItem('CollectionQueue', String(saved.id)))?.item : null;
        res.verifyTask = back ?? saved ?? task;
        res.writeVerified = !!back && str(back.taskType) === VERIFY_TASK;
      } catch (e) {
        res.errors.push(`משימת אימות שולח: ${errText(e)}`);
      }
      return res;
    }
  } else {
    const ap = accountsContact(contacts, code);
    recipient = normEmail(ap?.email) || normEmail(customer?.apContactEmail);
    recipientName = str(ap?.contactName) || str(customer?.apContactName) || recipient;
    if (!recipient) {
      res.outcome = OUT_PACKAGE_NO_CONTACT;
      res.reason = 'אין מייל פונה ואין איש קשר רשום להנהלת חשבונות אצל הלקוח – החבילה לא הוכנה';
      res.writeVerified = true;
      return res;
    }
  }

  // ---- attachments: the invoice document + every scan ----
  const missingLinks: string[] = [];
  const urls: string[] = [];
  const ensure = async (table: 'Invoices' | 'DeliveryNotes', row: Item, field: 'sourceDocUrl' | 'scanUrl', key: string, html: () => string, file: string) => {
    const have = str(row[field]).trim();
    if (have) return have;
    if (!isTestMirror(row)) {
      missingLinks.push(key);
      return '';
    }
    if (dryRun) return `(יופק קובץ בדיקה ${file})`;
    const url = await htmlToPdf(client, html(), file);
    await client.updateItem(table, String(row.id), { [field]: url });
    res.generated.push({ table, key, url });
    return url;
  };
  // in attachment order: each invoice, then its scanned notes; placeholder PDFs are made 3 at a time
  const jobs: (() => Promise<string>)[] = [];
  for (const no of invoiceNumbers) {
    const inv = invoices.find((i) => str(i.invoiceNumber) === no);
    if (inv) jobs.push(() => ensure('Invoices', inv, 'sourceDocUrl', `חשבונית ${no}`, () => invoicePlaceholderHtml(inv), invoicePlaceholderFile(inv)));
    else missingLinks.push(`חשבונית ${no}`);
    for (const n of notes.filter((x) => str(x.invoiceNumber) === no && isTrue(x.scanned)).sort(noteOrder)) {
      jobs.push(() => ensure('DeliveryNotes', n, 'scanUrl', `תעודה ${str(n.noteNumber)}`, () => scanPlaceholderHtml(n), scanPlaceholderFile(n)));
    }
  }
  try {
    for (const u of await mapLimit(jobs, 3, (job) => job())) if (u) urls.push(u);
  } catch (e) {
    res.errors.push(`הפקת מסמך בדיקה נכשלה: ${errText(e)}`);
    return res;
  }
  res.attachments = urls;

  const counts = invoiceNumbers.map((no) => countDocuments(invoices.find((i) => str(i.invoiceNumber) === no), no, notes));
  const total = counts.reduce((s, c) => s + c.scanned, 0);
  const invList = invoiceNumbers.join(', ');
  const greeting = recipientName && recipientName !== recipient ? `שלום ${recipientName.split(/\s+/)[0]},` : 'שלום,';
  const body = signBody(
    [
      greeting,
      '',
      `מצורפים ${invoiceNumbers.length === 1 ? `החשבונית ${invList}` : `החשבוניות ${invList}`} ו-${total === 1 ? 'תעודת המשלוח החתומה' : `${total} תעודות המשלוח החתומות`} ${invoiceNumbers.length === 1 ? 'שלה' : 'שלהן'}.`,
      ...counts.flatMap((c) => (c.notes.length ? [`חשבונית ${c.invoiceNumber}: ${c.notes.map((n) => str(n.noteNumber)).join(', ')}`] : [])),
      '',
      'נשמח לאישור שהמסמכים התקבלו ולהסדרת התשלום.',
    ].join('\n'),
    bookkeeper,
  );
  const existing = pending.find((p) => str(p.status) === PENDING) ?? null;
  const draft: Item = {
    customerCode: code || null,
    customerName: customerName || null,
    kind: KIND_REPLY,
    recipientName: recipientName || recipient,
    recipientContact: recipient,
    subject: email ? replySubject(str(email.subject)) : `חשבונית ${invList} ותעודות משלוח`,
    body,
    reason: `כל התעודות של ${invoiceNumbers.length === 1 ? `חשבונית ${invList}` : `החשבוניות ${invList}`} סרוקות (${counts.map((c) => `${c.scanned}/${c.expected}`).join(', ')}) – חבילה ללקוח: חשבונית ו-${total} תעודות${missingLinks.length ? `. חסר קישור ב-Priority ל: ${missingLinks.join(', ')} – לצרף ידנית` : ''}`,
    status: PENDING,
    draftedBy: AGENT_MAYA,
    draftedAt: nowIso,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    relatedTable: 'Disputes',
    relatedId: dispute.id ? String(dispute.id) : null,
    fromMailbox: str(email?.mailbox) || mailboxOf(team, bookkeeper),
    attachmentUrls: joinLines(urls),
    batchId: null,
    inboundEmailId: email ? str(email.messageId) || null : str(dispute.inboundEmailId) || null,
    isTestFixture: isTest,
  };
  res.packaged = true;
  res.replaced = !!existing;
  res.reason = draft.reason;
  if (dryRun) {
    res.approval = existing ? { ...existing, ...draft } : draft;
    return res;
  }
  try {
    const saved = await saveOutboxDraft(client, draft, { component: C_DOCUMENTS, existing, mailboxId: str(email?.mailboxId) || null });
    const id = saved.id;
    if (email && str(email.status) !== 'נענתה') await client.updateItem('InboundEmails', String(email.id), { status: 'טיוטה מוכנה' });
    const back = id ? (await client.getItem('Approvals', id))?.item : null;
    res.approval = back ?? saved.item ?? draft;
    res.writeVerified =
      !!back && str(back.status) === PENDING && str(back.kind) === KIND_REPLY && str(back.relatedId) === String(dispute.id) && str(back.attachmentUrls) === str(draft.attachmentUrls);
  } catch (e) {
    res.approval = draft;
    res.errors.push(`שמירת החבילה נכשלה: ${errText(e)}`);
  }
  return res;
}

// ---------- the logistics drafts ----------

export interface RequestResult {
  approval: Item | null;
  replaced: boolean;
  skipped: string;
  noContact: boolean;
  writeVerified: boolean;
  errors: string[];
}

export const requestKindOf = (row: Item): RequestKind => (str(row.subject).startsWith('תזכורת') ? 'תזכורת' : 'בקשה');

/**
 * Internal draft to the product line's logistics owner. A pending draft of the same kind for the case is
 * replaced. With onlyIfNone, nothing is written when a request of this kind was already approved (a
 * repeated customer email does not ask logistics twice).
 */
export async function prepareDocumentRequest(
  client: BlocksClient,
  args: { dispute: Item; kind: RequestKind; dryRun: boolean; nowIso: string; reminderOf?: string; onlyIfNone?: boolean },
): Promise<RequestResult> {
  const { dispute, kind, dryRun, nowIso } = args;
  const out: RequestResult = { approval: null, replaced: false, skipped: '', noContact: false, writeVerified: false, errors: [] };
  const code = str(dispute.customerCode);
  const invoiceNumbers = splitList(dispute.invoiceNumbers);
  const isTest = isTestCase(dispute);
  const [customer, owners, invoices, notes, plContacts, team, drafts] = await Promise.all([
    code ? findCustomer(client, code) : Promise.resolve(undefined),
    code ? readAll(client, 'CustomerOwners', { column: 'customerCode', value: code }) : Promise.resolve([] as Item[]),
    readWhereIn(client, 'Invoices', 'invoiceNumber', invoiceNumbers),
    readWhereIn(client, 'DeliveryNotes', 'invoiceNumber', invoiceNumbers),
    readAll(client, 'ProductLineContacts'),
    readTeam(client),
    dispute.id ? pendingCaseDrafts(client, String(dispute.id), KIND_LOGISTICS) : Promise.resolve([] as Item[]),
  ]);
  const sameKind = drafts.filter((d) => requestKindOf(d) === kind);
  const existing = sameKind.find((d) => str(d.status) === PENDING) ?? null;
  if (!existing && args.onlyIfNone) {
    const done = sameKind.find((d) => APPROVED_STATUSES.includes(str(d.status)));
    if (done) {
      out.approval = done;
      out.skipped = `כבר אושרה ${kind} ללוגיסטיקה לתיק הזה (${str(done.status)}) – לא נוצרה טיוטה נוספת`;
      out.writeVerified = true;
      return out;
    }
  }

  const bookkeeper = ownerOf(code, customer, buildOwnerMap(owners)) || str(dispute.ownerBookkeeperName);
  const customerName = str(customer?.customerName) || str(dispute.customerName);
  const counts = invoiceNumbers.map((no) => countDocuments(invoices.find((i) => str(i.invoiceNumber) === no), no, notes));
  const merged = mergeCounts(counts);
  const productLine = str(dispute.productLine) || productLineOf(invoices[0], notes);
  const stored = str(dispute.logisticsOwnerEmail).trim() ? { logisticsOwnerName: dispute.logisticsOwnerName, email: dispute.logisticsOwnerEmail } : null;
  const contact = stored ?? logisticsContactFor(plContacts, productLine, isTest);
  out.noContact = !contact || !normEmail(contact.email);
  const ownerName = str(contact?.logisticsOwnerName).trim();

  const missingNotes = counts.flatMap((c) => c.notes.filter((n) => !isTrue(n.scanned)));
  const sites = [...new Set(counts.flatMap((c) => c.notes).map((n) => str(n.siteName).trim()).filter(Boolean))];
  const invList = invoiceNumbers.join(', ');
  const opened = formatIsraelDateTime(args.reminderOf || dispute.openedAt);
  const lines = [
    ownerName ? `שלום ${ownerName},` : 'שלום,',
    '',
    kind === 'בקשה'
      ? `הלקוח ${customerName} (${code}) ביקש את תעודות המשלוח של ${invoiceNumbers.length === 1 ? `חשבונית ${invList}` : `החשבוניות ${invList}`}, וחלק מהן עדיין לא סרוקות.`
      : `תזכורת לבקשה${opened ? ` מ-${opened}` : ''}: עדיין חסרות תעודות משלוח של ${invoiceNumbers.length === 1 ? `חשבונית ${invList}` : `החשבוניות ${invList}`} ללקוח ${customerName} (${code}).`,
    `${countSentence(merged)}.`,
    sites.length ? `אתר: ${sites.join(', ')}` : '',
    productLine ? `קו מוצר: ${productLine}` : '',
    '',
    'תעודות חסרות:',
    ...missingNotes.map((n) => {
      const d = toIsraelDate(n.deliveryDate);
      return `- תעודה ${str(n.noteNumber)}${d ? ` · אספקה ${formatDateHe(d)}` : ''}${str(n.siteName).trim() ? ` · ${str(n.siteName).trim()}` : ''}`;
    }),
    ...(merged.missingUnknown ? [`- ועוד ${merged.missingUnknown} תעודות שהחשבונית מצפה להן ואינן במערכת`] : []),
    '',
    'נא לסרוק את התעודות החתומות ולצרף אותן לחשבונית ב-Priority, כדי שנוכל להעביר אותן ללקוח.',
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === ''));
  const subject = `${kind === 'תזכורת' ? 'תזכורת: ' : ''}סריקת תעודות משלוח – ${invoiceNumbers.length === 1 ? `חשבונית ${invList}` : `חשבוניות ${invList}`} (${customerName})`;
  const draft: Item = {
    customerCode: code || null,
    customerName: customerName || null,
    kind: KIND_LOGISTICS,
    recipientName: ownerName || null,
    recipientContact: normEmail(contact?.email) || null,
    subject,
    body: signBody(lines.join('\n'), bookkeeper),
    reason: `${kind === 'בקשה' ? 'בקשה' : `תזכורת ${num(dispute.reminderCount) + 1}`} ללוגיסטיקה${productLine ? ` של קו ${productLine}` : ''}: ${countSentence(merged)}${out.noContact ? `. אין איש לוגיסטיקה פעיל${productLine ? ` לקו ${productLine}` : ' (קו המוצר לא ידוע)'} בטבלת אנשי הקשר – לבחור נמען ידנית` : ''}`,
    status: PENDING,
    draftedBy: AGENT_MAYA,
    draftedAt: nowIso,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    relatedTable: 'Disputes',
    relatedId: dispute.id ? String(dispute.id) : null,
    fromMailbox: mailboxOf(team, bookkeeper),
    attachmentUrls: null,
    batchId: null,
    inboundEmailId: null,
    isTestFixture: isTest,
  };
  out.replaced = !!existing;
  if (dryRun) {
    out.approval = existing ? { ...existing, ...draft } : draft;
    return out;
  }
  try {
    const saved = await saveOutboxDraft(client, draft, { component: C_DOCUMENTS, existing });
    const back = saved.item;
    out.approval = back ?? draft;
    out.writeVerified = !!back && str(back.kind) === KIND_LOGISTICS && str(back.status) === PENDING && str(back.relatedId) === String(dispute.id) && subjectBase(back.subject) === subjectBase(subject);
  } catch (e) {
    out.approval = draft;
    out.errors.push(`שמירת הפנייה ללוגיסטיקה נכשלה: ${errText(e)}`);
  }
  return out;
}

// ---------- cancelling stale logistics drafts ----------

/** Approvals has no "בוטלה" status: a stale logistics draft is closed as נדחה with this note. */
export const CANCELLED_STATUS = 'נדחה';
export const CANCELLED_NOTE = 'בוטלה – כל התעודות נסרקו';
export const SYSTEM_ACTOR = 'המערכת';
/** A documents case in one of these statuses has every note scanned: no logistics draft is needed. */
export const COMPLETE_STATUSES = [ST_READY, CASE_CLOSED];
export const ACT_CANCELLED = 'בוטלו טיוטות ללוגיסטיקה';

/** Pending (ממתין) logistics drafts – the first request and the תזכורת – of these cases. */
export async function pendingLogisticsDrafts(client: BlocksClient, disputeIds?: string[]): Promise<Item[]> {
  const base: WhereClause[] = [
    { column: 'relatedTable', value: 'Disputes' },
    { column: 'kind', value: KIND_LOGISTICS },
    { column: 'status', value: PENDING },
  ];
  if (disputeIds && !disputeIds.length) return [];
  const rows = disputeIds
    ? (await readWhereIn(client, 'Approvals', 'relatedId', disputeIds)).filter((r) => base.every((w) => str(r[w.column!]) === w.value))
    : await readAll(client, 'Approvals', { and: base });
  return rows.sort((a, b) => Number(a.id) - Number(b.id));
}

export interface CancelResult {
  /** Ids of the drafts cancelled (or, on dryRun, that would be cancelled). */
  cancelledIds: string[];
  writeVerified: boolean;
  errors: string[];
}

/**
 * Once a documents case is complete, its logistics drafts still waiting for approval (בקשה and
 * תזכורת, kind פנייה ללוגיסטיקה, status ממתין) are pointless: each is closed as נדחה with the note
 * "בוטלה – כל התעודות נסרקו", decidedBy המערכת. The customer package (מענה ללקוח) and every draft that
 * is not ממתין are never touched. Idempotent. `pending` may carry rows already read.
 */
export async function cancelStaleLogisticsDrafts(
  client: BlocksClient,
  args: { disputeIds: string[]; dryRun: boolean; nowIso: string; pending?: Item[] },
): Promise<CancelResult> {
  const ids = new Set(args.disputeIds.filter(Boolean).map(String));
  const out: CancelResult = { cancelledIds: [], writeVerified: true, errors: [] };
  if (!ids.size) return out;
  const rows = (args.pending ?? (await pendingLogisticsDrafts(client, [...ids]))).filter(
    (r) => ids.has(str(r.relatedId)) && str(r.relatedTable) === 'Disputes' && str(r.kind) === KIND_LOGISTICS && str(r.status) === PENDING,
  );
  out.cancelledIds = rows.map((r) => String(r.id));
  if (args.dryRun || !rows.length) return out;
  const patch = { status: CANCELLED_STATUS, decisionNote: CANCELLED_NOTE, decidedBy: SYSTEM_ACTOR, decidedAt: args.nowIso };
  const done: string[] = [];
  await mapLimit(rows, 4, async (r) => {
    try {
      await client.updateItem('Approvals', String(r.id), patch);
      done.push(String(r.id));
    } catch (e) {
      out.errors.push(`ביטול טיוטת הלוגיסטיקה ${r.id}: ${errText(e)}`);
    }
  });
  const back = done.length ? await readByIds(client, 'Approvals', done) : [];
  for (const id of out.cancelledIds) {
    const b = back.find((x) => String(x.id) === id);
    if (!b || str(b.status) !== CANCELLED_STATUS || str(b.decisionNote) !== CANCELLED_NOTE) out.writeVerified = false;
  }
  if (out.errors.length) out.writeVerified = false;
  return out;
}

// ---------- the timer ----------

export interface ScanCheckCase {
  disputeId: string;
  disputeNumber: string;
  customerCode: string;
  customerName: string;
  invoiceNumbers: string[];
  isTestFixture: boolean;
  clock: string;
  clockUsed: 'שעון בדיקה' | 'שעון אמיתי';
  scanned: number;
  expected: number;
  missingNoteNumbers: string[];
  before: string;
  after: string;
  action: string;
  steps: string[];
  reminderCount: number;
  nextReminderAt: string | null;
  approvalId: string | null;
  interactionId: string | null;
  /** Pending logistics drafts closed because the case is complete (on dryRun: that would be). */
  cancelledDraftIds: string[];
  note: string;
}

/**
 * Evaluates missing-delivery-note cases as of `clockMs`. A clock other than now acts only on test cases;
 * real cases are always evaluated with the real clock. Catches up within one run (a clock past two
 * periods gives the reminder and the escalation), so a second run at the same clock changes nothing.
 */
export async function runScanCheck(
  client: BlocksClient,
  args: { clockMs: number; nowMs: number; clockIsNow: boolean; disputeIds?: string[]; dryRun: boolean },
): Promise<{ cases: ScanCheckCase[]; cancelledDraftIds: string[]; writeVerified: boolean; errors: string[] }> {
  const { clockMs, nowMs, clockIsNow, dryRun } = args;
  const nowIso = new Date(nowMs).toISOString();
  const errors: string[] = [];
  const hours = await reminderHours(client);
  const period = hours * 3_600_000;

  let disputes: Item[];
  let pendingLogistics: Item[];
  if (args.disputeIds?.length) {
    disputes = (await readByIds(client, 'Disputes', args.disputeIds)).filter((d) => str(d.disputeType) === DOC_DISPUTE);
    for (const id of args.disputeIds) if (!disputes.some((d) => String(d.id) === String(id))) errors.push(`המקרה ${id} לא נמצא או שאינו מסוג ${DOC_DISPUTE}`);
    pendingLogistics = await pendingLogisticsDrafts(client, disputes.map((d) => String(d.id)));
  } else {
    [disputes, pendingLogistics] = await Promise.all([
      readAll(client, 'Disputes', {
        and: [
          { column: 'disputeType', value: DOC_DISPUTE },
          { column: 'status', operator: 'in', value: CHASE_STATUSES },
        ],
      }),
      pendingLogisticsDrafts(client),
    ]);
    // the sweep: complete cases (מוכנה לשליחה ללקוח / נסגרה) that still have a pending logistics draft.
    // A test clock acts on test cases only, like the rest of the run.
    const known = new Set(disputes.map((d) => String(d.id)));
    const extraIds = [...new Set(pendingLogistics.map((a) => str(a.relatedId)).filter((id) => id && !known.has(id)))];
    if (extraIds.length) {
      const extra = (await readByIds(client, 'Disputes', extraIds)).filter(
        (d) => str(d.disputeType) === DOC_DISPUTE && COMPLETE_STATUSES.includes(str(d.status)) && (clockIsNow || isTestCase(d)),
      );
      disputes.push(...extra);
    }
  }
  disputes.sort((a, b) => Number(a.id) - Number(b.id));
  let verified = true;
  const cancelledDraftIds: string[] = [];
  const cancelFor = async (d: Item, c: ScanCheckCase) => {
    const r = await cancelStaleLogisticsDrafts(client, { disputeIds: [String(d.id)], dryRun, nowIso, pending: pendingLogistics });
    errors.push(...r.errors);
    if (!dryRun && !r.writeVerified) verified = false;
    c.cancelledDraftIds = r.cancelledIds;
    cancelledDraftIds.push(...r.cancelledIds);
    return r.cancelledIds;
  };
  const allInvoices = [...new Set(disputes.flatMap((d) => splitList(d.invoiceNumbers)))];
  const [invoices, notes] = await Promise.all([
    readWhereIn(client, 'Invoices', 'invoiceNumber', allInvoices),
    readWhereIn(client, 'DeliveryNotes', 'invoiceNumber', allInvoices),
  ]);

  const cases: ScanCheckCase[] = [];
  for (const d of disputes) {
    const isTest = isTestCase(d);
    const useClock = isTest || clockIsNow ? clockMs : nowMs;
    const invs = splitList(d.invoiceNumbers);
    const counts = invs.map((no) => countDocuments(invoices.find((i) => str(i.invoiceNumber) === no), no, notes));
    const merged = mergeCounts(counts);
    const before = str(d.status);
    const c: ScanCheckCase = {
      disputeId: String(d.id),
      disputeNumber: str(d.disputeNumber),
      customerCode: str(d.customerCode),
      customerName: str(d.customerName),
      invoiceNumbers: invs,
      isTestFixture: isTest,
      clock: new Date(useClock).toISOString(),
      clockUsed: !clockIsNow && isTest ? 'שעון בדיקה' : 'שעון אמיתי',
      scanned: merged.scanned,
      expected: merged.expected,
      missingNoteNumbers: merged.missingNoteNumbers,
      before,
      after: before,
      action: ACT_NONE,
      steps: [],
      reminderCount: num(d.reminderCount),
      nextReminderAt: str(d.nextReminderAt) || null,
      approvalId: null,
      interactionId: null,
      cancelledDraftIds: [],
      note: !isTest && !clockIsNow ? 'מקרה אמיתי – נבדק לפי השעון האמיתי, לא לפי שעון הבדיקה' : '',
    };
    cases.push(c);
    if (COMPLETE_STATUSES.includes(before)) {
      c.note = `המקרה בסטטוס ${before} – אין מה לבדוק`;
      try {
        const gone = await cancelFor(d, c);
        if (gone.length) {
          c.action = ACT_CANCELLED;
          const what =
            gone.length === 1
              ? `טיוטה אחת ללוגיסטיקה שהמתינה ${dryRun ? 'תבוטל' : 'בוטלה'}`
              : `${gone.length} טיוטות ללוגיסטיקה שהמתינו ${dryRun ? 'יבוטלו' : 'בוטלו'}`;
          c.note = `המקרה בסטטוס ${before} – ${what} (${CANCELLED_NOTE})`;
        }
      } catch (e) {
        errors.push(`${str(d.disputeNumber) || d.id}: ${errText(e)}`);
        verified = false;
      }
      continue;
    }

    try {
      // ---- all scanned → package ----
      if (merged.allScanned) {
        const update: Item = { status: ST_READY, ballWith: BALL_BOOKKEEPER, missingNoteNumbers: null, nextReminderAt: null, description: `כל התעודות סרוקות (${countSentence(merged)}) – חבילה ללקוח` };
        const pkg = await preparePackage(client, { dispute: { ...d, ...update }, dryRun, nowIso });
        errors.push(...pkg.errors);
        c.action = pkg.packaged ? ACT_PACKAGE : pkg.outcome;
        c.steps.push(c.action);
        c.approvalId = pkg.approval?.id ? String(pkg.approval.id) : null;
        c.after = ST_READY;
        c.nextReminderAt = null;
        if (pkg.reason && !pkg.packaged) c.note = pkg.reason;
        if (!dryRun) {
          await client.updateItem('Disputes', String(d.id), update);
          if (!pkg.writeVerified) verified = false;
        }
        const gone = await cancelFor(d, c);
        if (gone.length) c.steps.push(ACT_CANCELLED);
        continue;
      }

      // ---- still missing: keep the missing list current, then the timer ----
      const update: Item = {};
      const missingStr = merged.missingNoteNumbers.join(', ') || null;
      if ((str(d.missingNoteNumbers) || null) !== missingStr) update.missingNoteNumbers = missingStr;
      let status = before;
      let count = num(d.reminderCount);
      let next = Date.parse(str(d.nextReminderAt));
      if (!Number.isFinite(next)) {
        const opened = Date.parse(str(d.openedAt));
        next = (Number.isFinite(opened) ? opened : nowMs) + period;
        update.nextReminderAt = new Date(next).toISOString();
      }
      let reminderAt = '';
      while (status !== ST_ESCALATED && useClock >= next) {
        if (count < 1) {
          reminderAt = new Date(next).toISOString();
          const reqRes = await prepareDocumentRequest(client, {
            dispute: { ...d, ...update, reminderCount: count },
            kind: 'תזכורת',
            dryRun,
            nowIso,
            reminderOf: str(d.openedAt),
          });
          errors.push(...reqRes.errors);
          if (!dryRun && !reqRes.writeVerified) verified = false;
          c.approvalId = reqRes.approval?.id ? String(reqRes.approval.id) : null;
          count += 1;
          next += period;
          status = ST_REMINDER;
          Object.assign(update, { status, reminderCount: count, nextReminderAt: new Date(next).toISOString(), ballWith: BALL_LOGISTICS });
          c.steps.push(ACT_REMINDER);
        } else {
          status = ST_ESCALATED;
          Object.assign(update, { status, ballWith: BALL_MANAGER, nextReminderAt: null });
          c.steps.push(ACT_ESCALATED);
          const interaction: Item = {
            customerCode: str(d.customerCode),
            customerName: str(d.customerName) || null,
            occurredAt: new Date(useClock).toISOString(),
            type: 'הסלמה',
            direction: 'פנימי',
            actorName: AGENT_MAYA,
            summary: `תעודות משלוח חסרות – ${invs.length === 1 ? `חשבונית ${invs[0]}` : `חשבוניות ${invs.join(', ')}`} (${countSentence(merged)}). הוסלם למנהל הגבייה אחרי ${count === 1 ? 'תזכורת' : `${count} תזכורות`} ללוגיסטיקה`,
            relatedInvoiceNumbers: invs.join(', '),
          };
          if (!dryRun) {
            const saved = (await client.createItem('Interactions', interaction))?.item;
            c.interactionId = saved?.id ? String(saved.id) : null;
          }
        }
      }
      c.after = status;
      c.reminderCount = count;
      c.nextReminderAt = status === ST_ESCALATED ? null : str(update.nextReminderAt ?? d.nextReminderAt) || null;
      c.action = c.steps.length ? c.steps[c.steps.length - 1] : ACT_NONE;
      if (reminderAt) c.note = [c.note, `התזכורת הגיעה ב-${formatIsraelDateTime(reminderAt)}`].filter(Boolean).join(' · ');
      if (!c.steps.length && c.nextReminderAt && status !== ST_ESCALATED) {
        c.note = [c.note, `התזכורת הבאה ב-${formatIsraelDateTime(c.nextReminderAt)}`].filter(Boolean).join(' · ');
      }
      if (!dryRun && Object.keys(update).length) {
        await client.updateItem('Disputes', String(d.id), update);
      }
    } catch (e) {
      errors.push(`${str(d.disputeNumber) || d.id}: ${errText(e)}`);
      verified = false;
    }
  }

  // ---- read back every changed case ----
  if (!dryRun) {
    const changed = cases.filter((c) => c.after !== c.before || c.steps.length);
    if (changed.length) {
      const back = await readByIds(client, 'Disputes', changed.map((c) => c.disputeId));
      for (const c of changed) {
        const b = back.find((x) => String(x.id) === c.disputeId);
        if (!b || str(b.status) !== c.after || num(b.reminderCount) !== c.reminderCount) verified = false;
      }
      for (const c of changed.filter((x) => x.steps.includes(ACT_ESCALATED))) if (!c.interactionId) verified = false;
    }
  }
  return { cases, cancelledDraftIds, writeVerified: verified && errors.length === 0, errors };
}
