import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { formatDateHe, toIsraelDate, TZ } from './collections-dates.ts';
import {
  buildOwnerMap,
  errText,
  isFixtureCustomer,
  numberSetting,
  ownerOf,
  readAll,
  readSettings,
  readWhereIn,
  str,
} from './collections-data.ts';
import {
  clean,
  DEFAULT_TEST_LABEL,
  invoiceCandidates,
  mentionedInvoices,
  parseAddress,
  parseAttachments,
  parseReceivedAt,
  type Identification,
  type Verification,
} from './collections-mail.ts';
import {
  BY_CODE,
  buildCandidates,
  buildSortingBrief,
  CAT_OTHER,
  HS_OPEN,
  M_NONE,
  pickCandidate,
  senderRoleOf,
  storedCandidates,
  verifyHard,
} from './collections-inbox.ts';
import { findReferenceCodes, isUsableMailbox, readMailboxes } from './collections-outbox.ts';

// Shared by IngestEmail (and the offline ProcessInboundEmail stand-in in fake-blocks.ts).
// Provider-independent intake of one inbound email (the mailbox adapter workflow mapped the provider fields):
// dedupe by messageId; the mailbox (Mailboxes by address → mailboxId); threading (outbox threadId → CIM-<id>
// reference in the subject / body → threadId of an earlier inbound email); customer candidates from the data
// and the strongest one; hard sender verification (registered contact of that customer, or a SalesAgent
// authorised for it) with its basis and the sender's role; the reply deadline from replySlaHours; the owning
// bookkeeper. Writes one InboundEmails row: handlingState לא טופל, category אחר, classifiedBy קוד (Maya's
// sorting – ApplyMailClassification – replaces them; if she fails the mail stays אחר / לא טופל).
// Mail from the test mailbox label, or linked to a TEST- customer, is test data (isTestFixture). Sends nothing.

const MAX_BODY = 100_000;
const PROMPT_BODY = 4000;

function israelDateTime(iso: string): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const date = toIsraelDate(iso);
  return date ? `${formatDateHe(date)} ${time}` : iso;
}

export function buildPrompt(args: {
  fromAddress: string;
  fromName: string;
  verification: Verification;
  identification: Identification;
  bookkeeper: string;
  subject: string;
  body: string;
  receivedAt: string;
  dueAt: string;
  attachmentNames: string[];
  invoiceNumbers: string[];
  isTestFixture: boolean;
}): string {
  const a = args;
  const body = a.body.length > PROMPT_BODY ? `${a.body.slice(0, PROMPT_BODY)}\n[…הגוף קוצר, ${a.body.length} תווים במקור]` : a.body;
  const lines = [
    `שולח: ${a.fromName ? `${a.fromName} <${a.fromAddress}>` : a.fromAddress || 'לא ידוע'}`,
    `אימות שולח: ${a.verification.status} – ${a.verification.reason}`,
    a.identification.customerCode
      ? `לקוח: ${a.identification.customerName} (${a.identification.customerCode}) – זוהה לפי ${a.identification.method}: ${a.identification.detail}`
      : `לקוח: לא זוהה (${a.identification.detail})`,
    `אחראית: ${a.bookkeeper || 'לא ידוע'}`,
    `התקבל: ${israelDateTime(a.receivedAt)} · מועד מענה: ${israelDateTime(a.dueAt)}`,
    `נושא: ${a.subject || '(ללא נושא)'}`,
    `מספרי חשבוניות שזוהו במייל: ${a.invoiceNumbers.length ? a.invoiceNumbers.join(', ') : 'אין'}`,
    `קבצים מצורפים: ${a.attachmentNames.length ? a.attachmentNames.join(', ') : 'אין'}`,
  ];
  if (a.isTestFixture) lines.push('נתוני בדיקה: כן');
  lines.push('גוף ההודעה:', body || '(ריק)');
  return lines.join('\n');
}


export interface ThreadMatch {
  method: 'threadId-outbox' | 'reference-code' | 'threadId-inbound';
  table: 'Approvals' | 'InboundEmails';
  id: string;
  referenceCode: string | null;
  row: Item;
}

const byNewest = (a: Item, b: Item) => Number(b.id) - Number(a.id) || str(b.id).localeCompare(str(a.id));

/**
 * Is this email a reply? In order: (a) its provider threadId is the threadId of an outbox row; (b) a CIM-<id>
 * reference in the subject or body is an outbox row's referenceCode; (c) its threadId is the threadId of an
 * earlier inbound email (another messageId) – then the thread's first inquiry is the one it answers.
 */
export async function findThread(client: BlocksClient, args: { messageId: string; threadId: string; subject: string; body: string }): Promise<ThreadMatch | null> {
  const { messageId, threadId } = args;
  if (threadId) {
    const rows = await readAll(client, 'Approvals', { column: 'threadId', value: threadId });
    const row = rows.sort(byNewest)[0];
    if (row) return { method: 'threadId-outbox', table: 'Approvals', id: str(row.id), referenceCode: str(row.referenceCode) || null, row };
  }
  const refs = findReferenceCodes(`${args.subject}\n${args.body}`);
  if (refs.length) {
    const rows = await readWhereIn(client, 'Approvals', 'referenceCode', refs);
    for (const ref of refs) {
      const row = rows.filter((r) => str(r.referenceCode).toLowerCase() === ref.toLowerCase()).sort(byNewest)[0];
      if (row) return { method: 'reference-code', table: 'Approvals', id: str(row.id), referenceCode: str(row.referenceCode) || ref, row };
    }
  }
  if (threadId) {
    const rows = (await readAll(client, 'InboundEmails', { column: 'threadId', value: threadId })).filter((r) => str(r.messageId) !== messageId);
    const byTime = (a: Item, b: Item) => Date.parse(str(a.receivedAt)) - Date.parse(str(b.receivedAt)) || Number(a.id) - Number(b.id);
    const roots = rows.filter((r) => !(r.isThreadReply === true || r.isThreadReply === 'true')).sort(byTime);
    const row = roots[0] ?? rows.sort(byTime)[0];
    if (row) return { method: 'threadId-inbound', table: 'InboundEmails', id: str(row.id), referenceCode: null, row };
  }
  return null;
}

/** The record a reply belongs to (InboundEmails.linkedTable / linkedId) and the outbox row it answers (threadOf). */
export function threadLink(m: ThreadMatch): { threadOf: string | null; linkedTable: string; linkedId: string } {
  if (m.table === 'InboundEmails') return { threadOf: null, linkedTable: 'InboundEmails', linkedId: m.id };
  const rt = str(m.row.relatedTable).trim();
  const rid = str(m.row.relatedId).trim();
  return rt && rid ? { threadOf: m.id, linkedTable: rt, linkedId: rid } : { threadOf: m.id, linkedTable: 'Approvals', linkedId: m.id };
}

/**
 * The IngestEmail step (also the first step of the ProcessInboundEmail pipeline). Shared so the offline
 * test platform can play that pipeline's ingest step with exactly the same rules.
 */
export async function ingestEmail(client: BlocksClient, input: any) {
  const dryRun = input?.dryRun === true;
  const errors: string[] = [];
  const messageId = clean(input?.messageId);
  const mailProvider = clean(input?.mailProvider) || 'gmail';
  const mailbox = clean(input?.mailbox);
  const rawFrom = clean(input?.fromAddress);
  const empty = { isThreadReply: false, threadMatch: null, candidates: [] as Item[], mailboxId: '' };
  if (!messageId) errors.push('חסר מזהה הודעה (messageId)');
  if (!rawFrom) errors.push('חסר שולח (fromAddress)');
  if (!['gmail', 'outlook'].includes(mailProvider)) errors.push(`ספק דואר לא מוכר: "${mailProvider}"`);
  if (errors.length) {
    return { dryRun, duplicate: false, shouldProcess: false, inboundEmailId: '', inboundEmail: null, writeVerified: false, errors, ...empty };
  }

  const [existing, settings, contacts, customers, salesAgents, plContacts, mailboxes] = await Promise.all([
    client.queryTable('InboundEmails', { from: { table: 'InboundEmails' }, where: { column: 'messageId', value: messageId }, limit: 1 }),
    readSettings(client),
    readAll(client, 'CustomerContacts'),
    readAll(client, 'Customers'),
    readAll(client, 'SalesAgents').catch(() => [] as Item[]),
    readAll(client, 'ProductLineContacts').catch(() => [] as Item[]),
    readMailboxes(client),
  ]);
  const dup = existing?.items?.[0];
  if (dup) {
    return {
      dryRun,
      duplicate: true,
      shouldProcess: false,
      inboundEmailId: String(dup.id),
      inboundEmail: dup,
      identification: { customerCode: str(dup.customerCode), customerName: str(dup.customerName), method: str(dup.customerMatchMethod) || null, detail: 'המייל כבר נקלט' },
      verification: { status: str(dup.senderVerification), contactName: '', reason: 'המייל כבר נקלט' },
      promptForAgent: '',
      writeVerified: false,
      errors: [],
      isThreadReply: dup.isThreadReply === true || dup.isThreadReply === 'true',
      threadMatch: null,
      candidates: [],
      mailboxId: str(dup.mailboxId),
    };
  }

  const { address, name } = parseAddress(rawFrom, input?.fromName);
  const subject = clean(input?.subject);
  const bodyText = str(input?.bodyText).slice(0, MAX_BODY);
  const threadId = clean(input?.threadId);
  const text = `${subject}\n${bodyText}`;
  const received = parseReceivedAt(input?.receivedAt);
  const replySlaHours = numberSetting(settings, 'replySlaHours', 24);
  const dueAt = new Date(Date.parse(received.iso) + replySlaHours * 3600000).toISOString();
  const testLabel = (settings.get('testMailboxLabel') || DEFAULT_TEST_LABEL).trim().toLowerCase();
  const sourceLabel = clean(input?.sourceLabel);
  const fromTestLabel = !!sourceLabel && sourceLabel.toLowerCase() === testLabel;
  const attachments = parseAttachments(input?.attachments);

  // the mailbox it arrived in: an active one (or the test mailbox); an inactive mailbox is not linked
  const byAddress = (list: Item[]) => list.find((m) => str(m.address).trim().toLowerCase() === mailbox.toLowerCase() && !!mailbox);
  const byLabel = (list: Item[]) => (sourceLabel ? list.find((m) => str(m.sourceLabel).trim().toLowerCase() === sourceLabel.toLowerCase()) : undefined);
  const usable = mailboxes.filter(isUsableMailbox);
  const mb = byAddress(usable) ?? byLabel(usable);
  const inactiveMb = mb ? undefined : (byAddress(mailboxes) ?? byLabel(mailboxes));
  const mailboxId = mb ? str(mb.id) : '';

  // threading
  let thread: ThreadMatch | null = null;
  try {
    thread = await findThread(client, { messageId, threadId, subject, body: bodyText });
  } catch (e) {
    errors.push(`בדיקת השרשור נכשלה: ${errText(e)}`);
  }
  const link = thread ? threadLink(thread) : null;

  // invoice numbers in the text, from the data
  const tokens = invoiceCandidates(text);
  const invoiceRows = tokens.length ? await readWhereIn(client, 'Invoices', 'invoiceNumber', tokens) : [];
  const found = mentionedInvoices(text, invoiceRows);
  const invoiceNumbers = found.map((i) => str(i.invoiceNumber));

  // customer candidates and the strongest one
  const threadCode = thread ? str(thread.row.customerCode).trim() : '';
  const candidates = buildCandidates({
    address,
    subject,
    body: bodyText,
    contacts,
    customers,
    salesAgents,
    invoicesMentioned: found,
    threadCustomer: threadCode ? { customerCode: threadCode, customerName: str(thread!.row.customerName) } : null,
  });
  const picked = pickCandidate(candidates, customers, fromTestLabel);
  const code = picked?.customerCode ?? '';
  const customersByCode = new Map(customers.map((c) => [str(c.customerCode), c]));
  const customer: Item | undefined = code ? customersByCode.get(code) : undefined;

  // hard verification and the sender's role, from the data
  const verification = verifyHard({ address: address || rawFrom, customerCode: code || null, contacts, customersByCode, salesAgents });
  const senderRole = senderRoleOf(address || rawFrom, { contacts, salesAgents, plContacts });

  const owners = code ? await readAll(client, 'CustomerOwners', { column: 'customerCode', value: code }) : [];
  const mailboxOwnerName = clean(input?.mailboxOwnerName) || str(mb?.ownerName);
  const bookkeeper = (code ? ownerOf(code, customer, buildOwnerMap(owners)) : '') || str(thread?.row.assignedBookkeeperName) || mailboxOwnerName;
  const isTestFixture = fromTestLabel || (!!code && isFixtureCustomer(customer, code)) || (thread?.row.isTestFixture === true);
  const isThreadReply = !!thread;

  const row: Item = {
    messageId,
    threadId: threadId || null,
    mailProvider,
    mailbox: mailbox || null,
    mailboxOwnerName: mailboxOwnerName || null,
    mailboxId: mailboxId || null,
    sourceLabel: sourceLabel || null,
    fromAddress: address || rawFrom,
    fromName: name || null,
    subject: subject || null,
    bodyText,
    bodyStored: true,
    receivedAt: received.iso,
    dueAt,
    customerCode: code || null,
    customerName: code ? str(customer?.customerName) || picked?.customerName || null : null,
    customerMatchMethod: picked ? picked.method : M_NONE,
    senderVerification: verification.status,
    verificationBasis: verification.basis || null,
    senderRole,
    category: CAT_OTHER,
    categories: CAT_OTHER,
    mentionedInvoiceNumbers: invoiceNumbers.length ? invoiceNumbers.join(', ') : null,
    attachmentNames: attachments.names.length ? attachments.names.join(', ') : null,
    attachmentUrls: attachments.urls.length ? attachments.urls.join('\n') : null,
    status: isThreadReply ? 'חדשה' : 'בטיפול מאיה',
    handlingState: HS_OPEN,
    waitingFor: null,
    waitingSince: null,
    handledBy: null,
    handledAt: null,
    classifiedBy: BY_CODE,
    classificationQuotes: { types: [], invoices: [], rejected: [], candidates: storedCandidates(candidates) },
    isThreadReply,
    threadOf: link?.threadOf ?? null,
    linkedTable: link?.linkedTable ?? null,
    linkedId: link?.linkedId ?? null,
    assignedBookkeeperName: bookkeeper || null,
    agentSummary: null,
    answeredAt: null,
    isTestFixture,
  };
  const identification = {
    customerCode: code,
    customerName: code ? str(row.customerName) : '',
    method: picked ? picked.method : null,
    detail: picked
      ? `${picked.methods.join(' + ')}${candidates.length > 1 ? ` (מתוך ${candidates.length} מועמדים)` : ''}`
      : candidates.length
        ? `כמה מועמדים בלי מועמד חזק אחד: ${candidates.map((c) => `${c.customerName} (${c.customerCode})`).join(', ')}`
        : 'לא נמצאו כתובת רשומה, סוכן מורשה, שרשור, מספר חשבונית, חתימה, שם או דומיין',
  };
  const verificationOut = { status: verification.status, contactName: verification.contactName || verification.agentName, reason: verification.basis };
  const threadMatch = thread ? { method: thread.method, table: thread.table, id: thread.id, referenceCode: thread.referenceCode } : null;
  const promptForAgent = buildSortingBrief({
    fromAddress: address || rawFrom,
    fromName: name,
    verification: verification.status,
    senderRole,
    verificationBasis: verification.basis,
    candidates: storedCandidates(candidates),
    subject,
    files: null,
    attachmentNames: attachments.names,
    body: bodyText,
  });
  if (!received.parsed) errors.push(`receivedAt "${str(input?.receivedAt)}" לא זוהה כתאריך; נרשם זמן הקליטה`);
  if (inactiveMb) errors.push(`התיבה ${str(inactiveMb.address) || mailbox} לא פעילה בטבלת התיבות (Mailboxes) – המייל נקלט בלי תיבה`);
  else if (mailbox && !mailboxId) errors.push(`התיבה ${mailbox} לא רשומה בטבלת התיבות (Mailboxes)`);
  const common = {
    identification,
    verification: verificationOut,
    promptForAgent,
    isThreadReply,
    threadMatch,
    candidates: storedCandidates(candidates),
    mailboxId,
  };

  if (dryRun) {
    return { dryRun, duplicate: false, shouldProcess: false, inboundEmailId: '', inboundEmail: row, writeVerified: false, errors, ...common };
  }

  try {
    const { item } = await client.createItem('InboundEmails', row);
    const id = String(item?.id ?? '');
    const { item: back } = await client.getItem('InboundEmails', id);
    const writeVerified =
      !!back &&
      str(back.messageId) === messageId &&
      str(back.handlingState) === HS_OPEN &&
      str(back.senderVerification) === verification.status &&
      (str(back.customerCode) || '') === (code || '') &&
      (back.isThreadReply === true || back.isThreadReply === 'true') === isThreadReply;
    return {
      dryRun,
      duplicate: false,
      // a reply goes to AttachThreadReply; only a new inquiry is sorted by Maya
      shouldProcess: !!id && !isThreadReply,
      inboundEmailId: id,
      inboundEmail: back ?? item,
      writeVerified,
      errors,
      ...common,
    };
  } catch (e) {
    return { dryRun, duplicate: false, shouldProcess: false, inboundEmailId: '', inboundEmail: row, writeVerified: false, errors: [...errors, `InboundEmails: ${errText(e)}`], ...common };
  }
}
