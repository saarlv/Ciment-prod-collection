import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { formatDateHe, israelLocalToUtcIso, israelToday, nextBusinessDay, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, errText, formatIls, isFixtureCustomer, num, ownerOf, readAll, readByIds, readSettings, readWhereIn, str } from './collections-data.ts';
import { clean, DATA_CATEGORIES, VERIFIED } from './collections-mail.ts';
import {
  BY_CODE,
  BY_MAYA,
  CAT_DOCUMENTS,
  CAT_INSURANCE,
  CAT_IRRELEVANT,
  CAT_LEDGER,
  CAT_OPEN_DEBTS,
  CAT_OTHER,
  CAT_PRICE,
  CAT_PROMISE,
  CAT_REMITTANCE,
  candidatesOf,
  HS_DONE,
  HS_OPEN,
  HS_WAITING,
  normQuote,
  orderCategories,
  PROPOSAL_APPROVED,
  PROPOSAL_PENDING,
  promiseProposalOf,
  readQuotes,
  ROLE_OTHER,
  senderRoleOf,
  SYSTEM_ACTOR,
  verifyHard,
  WAIT_PROMISE_APPROVAL,
} from './collections-inbox.ts';
import { generateStatementPdf } from './collections-statement-pdf.ts';
import { createReplyDraft, REPLY_KIND } from './collections-reply.ts';
import { inboxKey, verifySenderKey } from './collections-tasks.ts';
import { syncTasksAfterWrite } from './collections-task-sync.ts';
import { writeEmailDisputeNotes } from './collections-notes.ts';
import { noteWriteSyncs } from './collections-note-runs.ts';
import { checkClassification, parseClassification, type Checked } from './collections-mail-classification.ts';
import { AUTO_REPLY_ACTOR, autoReplyCheck, type AutoReplyCheck } from './collections-mail-auto-reply.ts';
import { APPROVED, decideApprovals } from './collections-approval-decision.ts';
import {
  docsManualTaskKey,
  companyIdsIn,
  ensureManualTask,
  findInsuranceRequest,
  IDENTIFIED_BY_ADDRESS,
  IDENTIFIED_BY_SIGNATURE,
  INSURANCE_OPEN_STATUSES,
  insuranceUnlinkedTaskKey,
  isInsurerSender,
  priceManualTaskKey,
  senderDecisionOf,
  SRC_INBOX,
  SRC_INSURANCE,
  suggestCustomerFromSignature,
  TT_DOCS_MANUAL,
  TT_OTHER,
  TT_PRICE_MANUAL,
  WAIT_INSURANCE_AMOUNT,
  type ManualTaskResult,
  type SignatureSuggestion,
} from './collections-sender.ts';

// ApplyMailClassification (and ConfirmSender's re-route): checks Maya's structured sorting of one inbound email and
// routes it by code (component 04 · פניות, plan 04.11 part C).
// - classification: object or JSON string (or wrapped); missing / unparseable → אחר, לא טופל, classifiedBy קוד and a
//   task for the bookkeeper.
// - checks (collections-mail-classification.ts): quotes in the subject / body / extracted attachment text, customerCode
//   among the candidates IngestEmail stored, invoices of that customer, a promise only with an amount and a date in its
//   quote, the signature only with its quote. Rejections are stored in classificationQuotes.rejected with the reason.
// - verification stays the code's: re-checked against the chosen customer (a contact flagged isApContact, or an
//   authorised SalesAgent). Maya never sets it. identifiedBy כתובת when verified by address.
// - unknown sender (not מאומת, not an insurer / agent / logistics address): Maya's signature is stored (signatureText =
//   its verified quote, classificationQuotes.signature with the suggestion) and its company name / logo text matched
//   against Customers / approved BankAliases → suggestedCustomerCode, identifiedBy חתימה; the task engine opens the
//   verify-sender:<id> task titled "זה הלקוח <name>?". Nothing with customer data before a person confirms
//   (ConfirmSender).
// - routes per type: כרטסת / חובות פתוחים → statement PDF + reply with it (verified) or the לאמת שולח task;
//   תעודות וחשבוניות חסרות → only the manual task manual:docs-manual:<id> (תעודות / חשבוניות חסרות – טיפול ידני);
//   הפרש מחיר → only the manual task manual:price-manual:<id> (זיכוי / הפרש מחיר – טיפול ידני), both with Maya's quotes
//   and the invoice numbers; the email stays לא טופל, the task in classificationQuotes.manualTasks
//   (CheckInvoiceDocuments / AnalyzePriceGap / CreatePriceApprovalRequest are no longer called from here);
//   אישור ביטוח אשראי (Maya's type, or any mail from AgentSettings insurerSenders) → linked to the customer's open
//   CreditLimitRequests row (linkedTable / linkedId, classificationQuotes.insurance), ממתין "ממתין לאישור סכום בבקשת
//   הביטוח" – a person approves the amount in the insurance screen; no open request → manual task (אחר, source ביטוח);
//   פירוט תשלום → only linked to the customer (IdentifyCustomers' recent-mail rung reads linked mails), ממתין
//   להתאמת התקבול;
//   הבטחת תשלום → nothing is recorded and no draft: a promise with a verified quote, amount and date is stored as a
//   proposal in classificationQuotes.promise (status ממתינה לאישור) for a person to approve in the email panel
//   (AddCustomerNote with sourceEmailId – one התחייבות לתשלום CustomerNotes row); the email stays לא טופל, waitingFor ממתין לאישור הבטחה (a waiting state from
//   another type wins; the inbox task stays open either way, titled לאשר הבטחה מהמייל). An approved proposal is kept
//   as is on a rerun. אחר → task. One short customer reply draft per email carries the PDFs and a sentence per type
//   (no credit promise); לא רלוונטי → body, attachment text and summary deleted, handlingState טופל by מערכת.
// - dispute (a conditional payment / a claim the invoice is wrong) with a verified quote → since plan 04.11 stage 2 one
//   CustomerNotes row per due month of the quoted open invoices (אחר, customTypeLabel "בירור – <reason>", noteSource
//   מאיה ממייל, sourceEmailId; once per email and month), stored in classificationQuotes.dispute with noteIds. Never a promise: the invoices it names leave the promise proposal (none left → no proposal).
// The reply is on the same thread as the email: subject "Re: <original subject>" (never a second Re:) + " [CIM-<id>]",
// Approvals.inboundEmailId = the email's messageId (In-Reply-To) and Approvals.threadId = its threadId.
// Auto-reply (AgentSettings mailAutoReplyAt, collections-mail-auto-reply.ts): empty = OFF (default) – the draft waits
// for one-click approval. A number: a reply that is only statement PDFs, to a מאומת sender (identification confidence
// 100 ≥ the threshold), is approved through the same decision path as a person's click (אושר – לא נשלח, decidedBy
// שליחה אוטומטית (מערכת)) and the email is closed טופל by מערכת. There is no real send; nothing goes out.
// Every draft goes through the shared outbox helper (component, CIM-<id>, mailbox). Idempotent per email (a rerun
// keeps the sender decision, the approved promise and the manual tasks); a failing route is listed in errors, never
// thrown. Sends nothing, never writes to Priority.
// Tasks: after the final write the task engine runs for the email and its drafts (taskSync) – it opens / closes
// inbox:<id> (מייל לטיפול), verify-sender:<id> (לאמת שולח / זה הלקוח X?) and draft:<approvalId>, the same tasks the
// 06:00 scan keeps. The identify-customer task (אחר) and the manual:… tasks are written here.

const OPEN_TASK = ['ממתין', 'בטיפול'];
const WAITING_TYPES = [CAT_REMITTANCE, CAT_INSURANCE];
/** Types whose only route is a manual task: the email stays לא טופל. */
const MANUAL_TYPES = [CAT_DOCUMENTS, CAT_PRICE];
const WAIT_RECEIPT = 'ממתין להתאמת התקבול';

const truthy = (v: unknown) => v === true || v === 'true';
const firstName = (s: string) => str(s).trim().split(/\s+/)[0] ?? '';

export async function applyMailClassification(client: BlocksClient, input: any) {
  const dryRun = input?.dryRun === true;
  const emailId = clean(input?.inboundEmailId);
  const classifiedByIn = clean(input?.classifiedBy) === BY_CODE ? BY_CODE : BY_MAYA;
  const nowIso = new Date().toISOString();
  const errors: string[] = [];
  const routes: Item[] = [];
  const tasks: Item[] = [];
  const draftIds: string[] = [];
  const agingNotes: string[] = [];
  const customerNotes: string[] = [];
  const out = (o: Item) => ({
    dryRun,
    categories: [] as string[],
    customerCode: '',
    handlingState: '',
    waitingFor: '',
    rejected: [] as Item[],
    drafts: [] as Item[],
    tasks,
    agingNotes,
    customerNotes,
    routes,
    autoReply: null as (AutoReplyCheck & { approvalId: string | null; approved: boolean }) | null,
    summary: '',
    writeVerified: false,
    errors,
    ...o,
  });
  if (!emailId) return out({ errors: ['חסר מזהה מייל (inboundEmailId)'] });

  const [email] = await readByIds(client, 'InboundEmails', [emailId]);
  if (!email) return out({ errors: [`המייל ${emailId} לא נמצא`] });

  // ---------- read what the checks need ----------
  const parsed = parseClassification(input?.classification);
  const attachments = await readAll(client, 'EmailAttachments', { column: 'inboundEmailId', value: emailId }).catch(() => [] as Item[]);
  const bodyStored = !(email.bodyStored === false || email.bodyStored === 'false');
  const haystack = normQuote([str(email.subject), bodyStored ? str(email.bodyText) : '', ...attachments.map((a) => str(a.extractedText))].join('\n'));
  const candidates = candidatesOf(email);
  const ingestCode = str(email.customerCode).trim() || null;
  const mayaNos = parsed ? [...parsed.invoices.map((i) => i.invoiceNumber), ...(parsed.promise?.invoiceNumbers ?? []), ...(parsed.dispute?.invoiceNumbers ?? [])] : [];
  const mayaInvoiceNos = [...new Set(mayaNos.flatMap((n) => [n, n.toUpperCase()]))];
  const invoiceRows = mayaInvoiceNos.length ? await readWhereIn(client, 'Invoices', 'invoiceNumber', mayaInvoiceNos) : [];

  const failed = !parsed;
  const checked: Checked | null = parsed ? checkClassification({ c: parsed, haystack, candidates, fallbackCustomerCode: ingestCode, invoiceRows }) : null;
  let categories = checked?.categories.length ? checked.categories : [CAT_OTHER];
  const typeRows: Item[] = checked ? [...checked.types] : [];

  // an insurer address (AgentSettings insurerSenders) makes the mail an insurance answer whatever Maya said
  const settings = await readSettings(client);
  const insurerSender = isInsurerSender(email.fromAddress, settings);
  if (insurerSender) {
    if (!categories.includes(CAT_INSURANCE)) typeRows.push({ type: CAT_INSURANCE, quote: '', verified: true, basis: 'כתובת השולח ברשימת כתובות המבטח (insurerSenders)' });
    categories = orderCategories([CAT_INSURANCE, ...categories.filter((c) => c !== CAT_IRRELEVANT && c !== CAT_OTHER)]);
  }
  const irrelevant = !failed && categories.length === 1 && categories[0] === CAT_IRRELEVANT;

  // an insurance answer: the open credit-limit request it belongs to (by ח.פ in the text, the customer, or the name)
  const rawText = [str(email.subject), bodyStored ? str(email.bodyText) : '', ...attachments.map((a) => str(a.extractedText))].join('\n');
  let insuranceMatch: ReturnType<typeof findInsuranceRequest> = null;
  if (categories.includes(CAT_INSURANCE)) {
    try {
      const requests = await readAll(client, 'CreditLimitRequests', { column: 'status', operator: 'in', value: INSURANCE_OPEN_STATUSES });
      insuranceMatch = findInsuranceRequest(requests, { customerCode: checked?.customerCode ?? ingestCode, text: rawText });
    } catch (e) {
      errors.push(`בקשות הביטוח: ${errText(e)}`);
    }
  }
  const code = (insuranceMatch ? str(insuranceMatch.request.customerCode).trim() : '') || checked?.customerCode || ingestCode || '';
  const classifiedBy = failed ? BY_CODE : classifiedByIn;
  if (!failed && checked && !checked.categories.length) {
    routes.push({ type: CAT_OTHER, result: 'אף סוג של מאיה לא עבר את בדיקת הציטוט – המייל נשאר "אחר"' });
  }

  // customer, bookkeeper and verification from the data
  const [customers, owners, contacts, salesAgents, plContacts] = await Promise.all([
    code ? readAll(client, 'Customers', { column: 'customerCode', value: code }) : Promise.resolve([] as Item[]),
    code ? readAll(client, 'CustomerOwners', { column: 'customerCode', value: code }) : Promise.resolve([] as Item[]),
    readAll(client, 'CustomerContacts'),
    readAll(client, 'SalesAgents').catch(() => [] as Item[]),
    readAll(client, 'ProductLineContacts').catch(() => [] as Item[]),
  ]);
  const customer = customers[0];
  const customerName = str(customer?.customerName) || candidates.find((c) => c.customerCode === code)?.customerName || '';
  const bookkeeper = (code ? ownerOf(code, customer, buildOwnerMap(owners)) : '') || str(email.assignedBookkeeperName) || str(email.mailboxOwnerName);
  const customersByCode = new Map(customer ? [[code, customer]] : []);
  const verification = verifyHard({ address: str(email.fromAddress), customerCode: code || null, contacts, customersByCode, salesAgents });
  const verified = verification.status === VERIFIED;
  const dataRole = senderRoleOf(str(email.fromAddress), { contacts, salesAgents, plContacts });
  const senderRole = dataRole !== ROLE_OTHER ? dataRole : checked?.senderRole || ROLE_OTHER;
  const matchMethod =
    code && code !== ingestCode ? candidates.find((c) => c.customerCode === code)?.method || str(email.customerMatchMethod) || null : str(email.customerMatchMethod) || null;
  const isTestFixture = truthy(email.isTestFixture) || (!!code && isFixtureCustomer(customer, code));
  const summaryText = irrelevant ? '' : str(checked?.summary).trim();

  // the sender's signature; for an unknown sender, the customer it names ("זה הלקוח X?" – a person confirms)
  const priorQuotes = readQuotes(email.classificationQuotes);
  const decision = senderDecisionOf(email);
  const sigChecked = !irrelevant ? (checked?.signature ?? null) : null;
  const unknownSender = !verified && !insurerSender && dataRole === ROLE_OTHER && !categories.includes(CAT_INSURANCE);
  let suggestion: SignatureSuggestion | null = null;
  if (!decision && unknownSender && sigChecked?.verified && (sigChecked.companyNameFound || sigChecked.logoTextFound)) {
    try {
      const [allCustomers, aliases] = await Promise.all([readAll(client, 'Customers'), readAll(client, 'BankAliases').catch(() => [] as Item[])]);
      suggestion = suggestCustomerFromSignature(sigChecked, { customers: allCustomers, aliases, preferTest: truthy(email.isTestFixture) }).suggestion;
    } catch (e) {
      errors.push(`זיהוי מהחתימה: ${errText(e)}`);
    }
  }
  const priorSignature = priorQuotes.signature && typeof priorQuotes.signature === 'object' ? (priorQuotes.signature as Item) : null;
  const signature: Item | null = decision
    ? priorSignature
    : sigChecked
      ? {
          companyName: sigChecked.companyName,
          personName: sigChecked.personName,
          title: sigChecked.title,
          logoText: sigChecked.logoText,
          quote: sigChecked.quote,
          verified: sigChecked.verified,
          suggestion: suggestion ? { ...suggestion } : null,
        }
      : null;
  const suggestedCode = decision ? str(email.suggestedCustomerCode).trim() || null : verified ? null : suggestion?.customerCode ?? null;
  const identifiedBy = decision?.mode === 'confirm' ? IDENTIFIED_BY_SIGNATURE : verified ? IDENTIFIED_BY_ADDRESS : suggestion ? IDENTIFIED_BY_SIGNATURE : null;

  // the promise proposal: an approved one is never replaced; else Maya's verified promise waits for a person
  const priorProposal = promiseProposalOf(email);
  const approvedProposal = priorProposal && (str(priorProposal.status) === PROPOSAL_APPROVED || str(priorProposal.approvedPromiseId)) ? priorProposal : null;
  const mayaPromise = !irrelevant && checked?.promise ? checked.promise : null;
  const proposal: Item | null =
    approvedProposal ??
    (mayaPromise
      ? { amount: mayaPromise.amount, date: mayaPromise.date, method: mayaPromise.method, quote: mayaPromise.quote, verified: true, invoiceNumbers: mayaPromise.invoiceNumbers, status: PROPOSAL_PENDING }
      : null);
  const pendingProposal = !!proposal && !approvedProposal;
  const mayaDispute = !irrelevant && checked?.dispute ? checked.dispute : null;
  const priorDispute = priorQuotes.dispute && typeof priorQuotes.dispute === 'object' ? (priorQuotes.dispute as Item) : null;

  const quotes: Item = {
    types: typeRows,
    invoices: checked ? checked.invoices : [],
    rejected: checked ? checked.rejected : failed ? [{ field: 'classification', value: '', reason: 'אין מיון של מאיה או שלא ניתן לקרוא אותו' }] : [],
    candidates: priorQuotes.candidates ?? candidates,
  };
  if (proposal) quotes.promise = proposal;
  if (signature) quotes.signature = signature;
  if (decision) quotes.senderDecision = decision;
  if (insuranceMatch) {
    const r = insuranceMatch.request;
    quotes.insurance = {
      requestId: str(r.id),
      customerCode: str(r.customerCode),
      customerName: str(r.customerName) || null,
      status: str(r.status),
      requestedLimit: r.requestedLimit ?? null,
      companyId: str(r.companyId) || null,
      matchedBy: insuranceMatch.matchedBy,
      fromInsurerSender: insurerSender,
    };
  }
  // manual tasks of earlier runs stay listed (their rows are never reopened or duplicated)
  const manualTasks: Item[] = Array.isArray(priorQuotes.manualTasks) ? [...(priorQuotes.manualTasks as Item[])] : [];
  if (manualTasks.length) quotes.manualTasks = manualTasks;
  if (mayaDispute) {
    quotes.dispute = {
      reason: mayaDispute.reason,
      quote: mayaDispute.quote,
      verified: true,
      invoiceNumbers: mayaDispute.invoiceNumbers,
      noteIds: Array.isArray(priorDispute?.noteIds) ? priorDispute!.noteIds : [],
    };
  }
  if (irrelevant) {
    quotes.types = (quotes.types as Item[]).map((t) => ({ ...t, quote: '' }));
    quotes.invoices = [];
  }
  const customerInvoices = checked?.customerInvoices ?? [];

  const classificationUpdate: Item = {
    category: categories[0],
    categories: categories.join(', '),
    classifiedBy,
    classificationQuotes: quotes,
    senderRole,
    senderVerification: verification.status,
    verificationBasis: verification.basis || null,
    customerCode: code || null,
    customerName: code ? customerName || null : null,
    customerMatchMethod: matchMethod,
    assignedBookkeeperName: bookkeeper || null,
    agentSummary: summaryText || null,
    mentionedInvoiceNumbers: customerInvoices.length ? customerInvoices.join(', ') : str(email.mentionedInvoiceNumbers) || null,
    isTestFixture,
    signatureText: sigChecked ? (sigChecked.verified ? str(sigChecked.quote).trim() || null : null) : str(email.signatureText) || null,
    suggestedCustomerCode: suggestedCode,
    identifiedBy,
    ...(insuranceMatch ? { linkedTable: 'CreditLimitRequests', linkedId: str(insuranceMatch.request.id) } : {}),
    status: irrelevant ? 'לא רלוונטית' : ['טיוטה מוכנה', 'נענתה'].includes(str(email.status)) ? str(email.status) : 'בטיפול מאיה',
  };
  if (irrelevant) Object.assign(classificationUpdate, { bodyText: '', bodyStored: false, attachmentNames: null, attachmentUrls: null, agentSummary: null, mentionedInvoiceNumbers: null, signatureText: null });

  if (dryRun) {
    const plan = categories.map((t) => ({
      type: t,
      result: plannedRoute(t, { code, verified, invoices: customerInvoices, promise: pendingProposal ? proposal : null, insurance: insuranceMatch?.request ?? null, suggestion }),
    }));
    if (mayaDispute) plan.push({ type: 'מחלוקת', result: `הערת לקוח "בירור – ${mayaDispute.reason}" לחודשי הפירעון של ${mayaDispute.invoiceNumbers.join(', ') || 'אף חשבונית (לא צוינו חשבוניות של הלקוח)'}` });
    return out({
      categories,
      customerCode: code,
      handlingState: irrelevant ? HS_DONE : '',
      rejected: quotes.rejected,
      routes: [...routes, ...plan],
      summary: `בדיקה בלבד: ${categories.join(', ')}${quotes.rejected.length ? ` · נפסלו ${quotes.rejected.length}` : ''}`,
      emailUpdate: classificationUpdate,
      verification: { status: verification.status, basis: verification.basis },
    });
  }

  // ---------- write the classification first (the routes read it) ----------
  try {
    await client.updateItem('InboundEmails', emailId, classificationUpdate);
  } catch (e) {
    return out({ categories, customerCode: code, rejected: quotes.rejected, errors: [`שמירת המיון נכשלה: ${errText(e)}`] });
  }
  const freshEmail = { ...email, ...classificationUpdate };

  // ---------- tasks (one open task per email and task type) ----------
  const openTasks = await readAll(client, 'CollectionQueue', {
    and: [
      { column: 'relatedTable', value: 'InboundEmails' },
      { column: 'relatedId', value: emailId },
      { column: 'status', operator: 'in', value: OPEN_TASK },
    ],
  }).catch(() => [] as Item[]);
  const ensureTask = async (taskType: string, reasons: string, recommendedAction: string | null, priorityScore: number) => {
    const have = openTasks.find((t) => str(t.taskType) === taskType);
    if (have) {
      tasks.push({ id: str(have.id), taskType, created: false, reasons: str(have.reasons) });
      return have;
    }
    const row: Item = {
      queueDate: israelToday(),
      customerCode: code || null,
      customerName: code ? customerName || null : null,
      assignedBookkeeperName: bookkeeper || null,
      priorityScore,
      reasons,
      recommendedAction,
      status: 'ממתין',
      handledBy: null,
      handledAt: null,
      taskType,
      needsManagerApproval: false,
      isAlert: false,
      relatedTable: 'InboundEmails',
      relatedId: emailId,
      dueAt: str(email.dueAt) || israelLocalToUtcIso(nextBusinessDay(israelToday()), 9, 0),
      isTestFixture,
    };
    try {
      const saved = (await client.createItem('CollectionQueue', row))?.item;
      openTasks.push(saved ?? row);
      tasks.push({ id: str(saved?.id), taskType, created: true, reasons });
      return saved;
    } catch (e) {
      errors.push(`משימה "${taskType}": ${errText(e)}`);
      return null;
    }
  };
  const subjectLabel = str(email.subject).trim() || '(ללא נושא)';
  const senderLabel = str(email.fromName).trim() || str(email.fromAddress).trim() || 'שולח לא ידוע';
  // an unknown sender whose signature names a customer: the "זה הלקוח X?" task (verify-sender:<id>) carries it
  const identifyTask = async (why: string) =>
    suggestion
      ? null
      : ensureTask('אחר', `לא זוהה לקוח למייל "${subjectLabel}" מ-${senderLabel} – ${why}. לזהות את הלקוח ולקשר אותו`, null, 60);

  // ---------- Maya failed ----------
  if (failed && !categories.includes(CAT_INSURANCE)) {
    // the task: inbox:<id> (מייל לטיפול), opened by the task engine in finish() – the email stays לא טופל
    routes.push({ type: CAT_OTHER, result: 'אין מיון של מאיה – המייל נשאר "אחר" / לא טופל, נפתחה משימה לאחראית' });
    return finish({ handlingState: HS_OPEN, waitingFor: '' });
  }

  // ---------- לא רלוונטי ----------
  if (irrelevant) {
    if (attachments.length) {
      for (const a of attachments) {
        try {
          if (str(a.extractedText)) await client.updateItem('EmailAttachments', str(a.id), { extractedText: null });
        } catch (e) {
          errors.push(`EmailAttachments ${str(a.id)}: ${errText(e)}`);
        }
      }
    }
    routes.push({ type: CAT_IRRELEVANT, result: 'הגוף, תוכן הקבצים והסיכום נמחקו; נסגר אוטומטית (טופל – מערכת)' });
    return finish({ handlingState: HS_DONE, waitingFor: '' });
  }

  // ---------- routes ----------
  const noteManualTask = (r: ManualTaskResult) => {
    if (r.error) {
      errors.push(r.error);
      return;
    }
    tasks.push({ id: r.id, taskType: r.taskType, taskKey: r.taskKey, created: r.created, status: r.status });
    const at = manualTasks.findIndex((t) => str(t.taskKey) === r.taskKey);
    const entry = { taskKey: r.taskKey, taskId: r.id, taskType: r.taskType };
    if (at >= 0) manualTasks[at] = entry;
    else manualTasks.push(entry);
    quotes.manualTasks = manualTasks;
  };
  const sections: string[] = [];
  const pdfUrls: string[] = [];
  const waits: string[] = [];
  const statement = async (kind: 'כרטסת' | 'חובות פתוחים') => {
    if (suggestion && !verified) {
      routes.push({ type: kind, result: `שולח לא מוכר – לפי החתימה זה ${suggestion.customerName} (${suggestion.customerCode}); משימה "זה הלקוח ${suggestion.customerName}?", בלי PDF עד שאדם מאשר` });
      return;
    }
    if (!code) {
      await identifyTask(`בקשת ${kind}`);
      routes.push({ type: kind, result: 'הלקוח לא זוהה – נפתחה משימה לזיהוי, לא הוכן PDF' });
      return;
    }
    if (!verified) {
      // the task: verify-sender:<id> (לאמת שולח), opened by the task engine in finish()
      routes.push({ type: kind, result: `השולח לא מאומת (${verification.status}) – משימה "לאמת שולח", בלי PDF` });
      return;
    }
    const r: Item = await generateStatementPdf(client, { customerCode: code, kind });
    if (r.errors?.length || !r.url) {
      errors.push(...(r.errors ?? ['ה-PDF לא הופק']).map((e: string) => `${kind}: ${e}`));
      routes.push({ type: kind, result: `הפקת ה-PDF נכשלה: ${(r.errors ?? []).join('; ')}` });
      return;
    }
    pdfUrls.push(r.url);
    sections.push(
      kind === 'כרטסת'
        ? `מצורפת כרטסת הלקוח של ${customerName || code} (${r.asOfLabel || 'נכון להיום'}).`
        : `מצורף פירוט החובות הפתוחים של ${customerName || code} (${r.asOfLabel || 'נכון להיום'}).`,
    );
    routes.push({ type: kind, result: `הופק PDF (${r.fileName}) וצורף לטיוטת המענה`, url: r.url });
  };

  for (const type of categories) {
    try {
      if (type === CAT_LEDGER || type === CAT_OPEN_DEBTS) {
        await statement(type);
      } else if (MANUAL_TYPES.includes(type)) {
        // plan 04.11 part C: Maya sorts, a person handles – only a manual task with her quotes and the invoice numbers
        const docs = type === CAT_DOCUMENTS;
        const typeQuotes = typeRows.filter((t) => t.type === type && t.verified && str(t.quote).trim()).map((t) => `"${str(t.quote).trim().slice(0, 200)}"`);
        const invoiceQuotes = (checked?.invoices ?? []).filter((i) => i.verified).map((i) => `${i.invoiceNumber}${str(i.quote).trim() ? ` ("${str(i.quote).trim().slice(0, 120)}")` : ''}`);
        const nos = customerInvoices.length ? customerInvoices : (checked?.invoices ?? []).filter((i) => i.verified).map((i) => i.invoiceNumber);
        const who = code ? `${customerName || code} (${code})` : `${senderLabel} – הלקוח לא זוהה${suggestion ? ` (לפי החתימה: ${suggestion.customerName})` : ''}`;
        const r = await ensureManualTask(client, {
          key: docs ? docsManualTaskKey(emailId) : priceManualTaskKey(emailId),
          taskType: docs ? TT_DOCS_MANUAL : TT_PRICE_MANUAL,
          title: `${docs ? TT_DOCS_MANUAL : TT_PRICE_MANUAL} – ${code ? customerName || code : senderLabel}: ${subjectLabel}`,
          reasons: [
            `מייל מ-${who} מבקש ${docs ? 'תעודות / חשבוניות חסרות' : 'זיכוי / בדיקת הפרש מחיר'}. הטיפול האוטומטי כבוי – לטפל ידנית`,
            typeQuotes.length ? `ציטוט: ${typeQuotes.join(' · ')}` : '',
            invoiceQuotes.length ? `חשבוניות במייל: ${invoiceQuotes.join(', ')}` : 'לא צוינו מספרי חשבוניות',
            summaryText,
          ]
            .filter(Boolean)
            .join('. '),
          recommendedAction: docs ? 'לפנות ללוגיסטיקה' : 'לטפל במחלוקת',
          source: SRC_INBOX,
          customerCode: code || null,
          customerName: code ? customerName || null : null,
          owner: bookkeeper || null,
          relatedTable: 'InboundEmails',
          relatedId: emailId,
          invoiceNumbers: nos,
          dueAt: str(email.dueAt) || null,
          isTestFixture,
        });
        noteManualTask(r);
        routes.push({ type, result: r.error ? `פתיחת המשימה נכשלה: ${r.error}` : `משימה לטיפול ידני "${r.taskType}" ${r.created ? 'נפתחה' : 'כבר קיימת'}${nos.length ? ` (${nos.join(', ')})` : ''}`, taskId: r.id || null });
      } else if (type === CAT_INSURANCE) {
        if (insuranceMatch) {
          const req = insuranceMatch.request;
          waits.push(WAIT_INSURANCE_AMOUNT);
          routes.push({
            type,
            result: `קושר לבקשת הביטוח הפתוחה של ${str(req.customerName) || str(req.customerCode)} (${str(req.status)}, לפי ${insuranceMatch.matchedBy}) – אדם מאשר את הסכום במסך הביטוח`,
            linkedTable: 'CreditLimitRequests',
            linkedId: str(req.id),
          });
        } else {
          const ids = companyIdsIn(rawText);
          const r = await ensureManualTask(client, {
            key: insuranceUnlinkedTaskKey(emailId),
            taskType: TT_OTHER,
            title: `אישור ביטוח אשראי בלי בקשה פתוחה – ${code ? customerName || code : senderLabel}: ${subjectLabel}`,
            reasons: [
              `התקבל אישור ביטוח אשראי מ-${senderLabel}${code ? ` על ${customerName || code} (${code})` : ''}, ולא נמצאה בקשה פתוחה (הוגשה למבטח / ממתינה להגשה)${code ? ' של הלקוח' : ' – הלקוח לא זוהה'}`,
              ids.length ? `ח.פ במייל: ${ids.join(', ')}` : '',
              summaryText,
              'לבדוק במסך הביטוח ולעדכן את הבקשה ידנית',
            ]
              .filter(Boolean)
              .join('. '),
            recommendedAction: 'לטפל במייל',
            source: SRC_INSURANCE,
            customerCode: code || null,
            customerName: code ? customerName || null : null,
            owner: bookkeeper || null,
            relatedTable: 'InboundEmails',
            relatedId: emailId,
            invoiceNumbers: [],
            dueAt: str(email.dueAt) || null,
            isTestFixture,
          });
          noteManualTask(r);
          routes.push({ type, result: r.error ? `פתיחת המשימה נכשלה: ${r.error}` : `לא נמצאה בקשת ביטוח פתוחה – משימה לאחראית ${r.created ? 'נפתחה' : 'כבר קיימת'}`, taskId: r.id || null });
        }
      } else if (type === CAT_REMITTANCE) {
        if (!code) {
          await identifyTask('פירוט תשלום');
          routes.push({ type, result: 'הלקוח לא זוהה – הפירוט לא שויך' });
          continue;
        }
        // linked to the customer only: the identification of the customer's next transfers reads it (recent-mail rung)
        waits.push(WAIT_RECEIPT);
        sections.push('תודה על פירוט התשלום. נעדכן את ההתאמה בחשבון בהתאם.');
        routes.push({ type, result: `הפירוט שויך ללקוח ${code}${customerName ? ` ${customerName}` : ''} וימתין לתקבול` });
      } else if (type === CAT_PROMISE) {
        // no promise is recorded here and no draft: a person approves Maya's proposal in the email panel
        if (!code) await identifyTask('הבטחת תשלום');
        if (approvedProposal) {
          routes.push({ type, result: `ההבטחה מהמייל כבר אושרה (${str(approvedProposal.approvedPromiseId)})`, promiseId: str(approvedProposal.approvedPromiseId) || null });
        } else if (proposal) {
          const nos = (proposal.invoiceNumbers as string[]) ?? [];
          routes.push({
            type,
            result: `הצעת הבטחה ממתינה לאישור: ${formatIls(num(proposal.amount))} ש״ח עד ${formatDateHe(str(proposal.date))}${nos.length ? ` (${nos.join(', ')})` : ''}${code ? '' : ' – הלקוח לא זוהה'}`,
          });
        } else {
          routes.push({ type, result: 'לא הוצעה הבטחה: אין סכום ותאריך מצוטטים (או שהתשלום מותנה)' });
        }
      } else if (type === CAT_OTHER) {
        // the task: inbox:<id> (מייל לטיפול), opened by the task engine in finish()
        sections.push('קיבלנו את פנייתך ונחזור אלייך בהקדם.');
        routes.push({ type, result: 'טיוטת אישור קבלה קצרה ומשימה לאחראית' });
      }
    } catch (e) {
      errors.push(`${type}: ${errText(e)}`);
      routes.push({ type, result: `נכשל: ${errText(e)}` });
    }
  }

  // ---------- one short customer reply per email ----------
  let autoClosed = false;
  if (sections.length) {
    try {
      const decided = (
        await readAll(client, 'Approvals', {
          and: [
            { column: 'relatedTable', value: 'InboundEmails' },
            { column: 'relatedId', value: emailId },
            { column: 'kind', value: REPLY_KIND },
          ],
        })
      ).filter((a) => !['ממתין', 'נדחה'].includes(str(a.status)));
      if (decided.length) {
        // a rerun after an automatic approval keeps the email closed
        if (decided.some((a) => str(a.decidedBy) === AUTO_REPLY_ACTOR && str(a.status) === APPROVED) && str(email.handlingState) === HS_DONE) autoClosed = true;
        routes.push({ type: 'מענה ללקוח', result: `כבר אושרה טיוטת מענה למייל (${str(decided[0].referenceCode) || decided[0].id}) – לא נכתבה חדשה` });
      } else {
        const greet = firstName(str(email.fromName));
        const body = [greet && !/@/.test(greet) ? `שלום ${greet},` : 'שלום,', '', ...sections].join('\n');
        const r: Item = await createReplyDraft(client, {
          inboundEmailId: emailId,
          body,
          reason: `מענה למייל נכנס (${categories.join(', ')})${summaryText ? `: ${summaryText}` : ''}`,
          attachmentUrls: pdfUrls,
          draftedBy: BY_MAYA,
        });
        if (r.refused) routes.push({ type: 'מענה ללקוח', result: `לא נכתבה טיוטה: ${r.refusalReason}` });
        else if (r.approval?.id) {
          draftIds.push(str(r.approval.id));
          routes.push({ type: 'מענה ללקוח', result: `${r.replaced ? 'הוחלפה' : 'נכתבה'} טיוטת מענה ${str(r.approval.referenceCode)}${pdfUrls.length ? ` עם ${pdfUrls.length} PDF` : ''}` });
        }
        errors.push(...((r.errors ?? []) as string[]).map((e) => `מענה: ${e}`));
      }
    } catch (e) {
      errors.push(`מענה: ${errText(e)}`);
    }
  }

  // ---------- auto-reply (mailAutoReplyAt; empty = OFF) ----------
  let autoReply: (AutoReplyCheck & { approvalId: string | null; approved: boolean }) | null = null;
  const replyId = draftIds[0] ?? null;
  if (replyId) {
    const statementFailed = routes.some((r) => DATA_CATEGORIES.includes(str(r.type)) && !r.url);
    const check = autoReplyCheck(settings, {
      verificationStatus: verification.status,
      categories,
      pdfCount: pdfUrls.length,
      hasOtherParts: statementFailed || !!proposal || !!mayaDispute || errors.length > 0,
    });
    autoReply = { ...check, approvalId: replyId, approved: false };
    if (check.on) {
      try {
        const d: Item = await decideApprovals(client, { decision: 'approve', approvalIds: [replyId], decidedBy: AUTO_REPLY_ACTOR, note: `אושר אוטומטית: ${check.reason}` });
        const row = ((d.updated ?? []) as Item[]).find((u) => str(u.id) === replyId);
        autoReply.approved = str(row?.status) === APPROVED;
        errors.push(...((d.errors ?? []) as string[]).map((e) => `שליחה אוטומטית: ${e}`));
        if (autoReply.approved) {
          autoClosed = true;
          routes.push({ type: 'מענה ללקוח', result: `הטיוטה אושרה אוטומטית (${check.reason}) – ${APPROVED}` });
        } else {
          routes.push({ type: 'מענה ללקוח', result: `האישור האוטומטי לא בוצע – הטיוטה ממתינה לאישור${(d.skipped ?? []).length ? ` (${str((d.skipped as Item[])[0].reason)})` : ''}` });
        }
      } catch (e) {
        errors.push(`שליחה אוטומטית: ${errText(e)}`);
      }
    }
  }

  // ---------- customer notes: Maya's dispute (plan 04.11 stage 2 – once per email and due month) ----------
  // (types 3 / 4 no longer write notes of their own: plan 04.11 part C hands them to a person as a manual task)
  const disputeNos = mayaDispute?.invoiceNumbers ?? [];
  if (code && mayaDispute && disputeNos.length) {
    try {
      const day = toIsraelDate(email.receivedAt) || israelToday();
      const r = await writeEmailDisputeNotes(
        client,
        { customerCode: code, emailId, reason: mayaDispute.reason, quote: str(mayaDispute.quote), invoiceNumbers: disputeNos, receivedDay: day, contactName: str(email.fromName) || null, nowIso },
        { taskSync: noteWriteSyncs('ApplyMailClassification').taskSync },
      );
      customerNotes.push(...r.noteIds);
      errors.push(...r.errors);
      if (quotes.dispute) quotes.dispute.noteIds = r.noteIds;
      routes.push({ type: 'הערות לקוח', result: r.createdMonths.length ? `נוספו הערות "בירור – ${mayaDispute.reason}" לחודשים ${r.createdMonths.join(', ')}` : 'אין הערות בירור חדשות (כבר נכתבו או שהחשבוניות סגורות)' });
    } catch (e) {
      errors.push(`הערות בירור: ${errText(e)}`);
    }
  }
  if (mayaDispute) {
    routes.push({
      type: 'מחלוקת',
      result: disputeNos.length
        ? `תשלום מותנה / טענה על החשבונית (${mayaDispute.reason}) – בבירור: ${disputeNos.join(', ')}; לא נרשמה הבטחה`
        : `תשלום מותנה / טענה על החשבונית (${mayaDispute.reason}) – לא צוינו חשבוניות של הלקוח, לא נכתבו הערות`,
    });
  }

  // ---------- interaction (once per email) ----------
  if (code) {
    try {
      const rows = await readAll(client, 'Interactions', {
        and: [
          { column: 'customerCode', value: code },
          { column: 'type', value: 'דואל' },
          { column: 'direction', value: 'נכנס' },
        ],
      });
      const at = Date.parse(str(email.receivedAt));
      const prefix = `דואל נכנס: ${subjectLabel}`;
      const exists = rows.some((r) => Date.parse(str(r.occurredAt)) === at && str(r.summary).startsWith(prefix));
      if (!exists) {
        await client.createItem('Interactions', {
          customerCode: code,
          customerName: customerName || null,
          occurredAt: str(email.receivedAt) || nowIso,
          type: 'דואל',
          direction: 'נכנס',
          actorName: senderLabel,
          summary: `${prefix} (${categories.join(', ')})${summaryText ? ` – ${summaryText}` : ''}`,
          relatedInvoiceNumbers: customerInvoices.join(', ') || null,
        });
      }
    } catch (e) {
      errors.push(`Interactions: ${errText(e)}`);
    }
  }

  // ---------- handling state ----------
  // a pending promise proposal keeps the email לא טופל (ממתין לאישור הבטחה) unless the other types make it ממתין;
  // the inbox task stays open for the proposal either way (collections-tasks.ts)
  // a reply approved automatically answers the email: nobody has anything left to do
  if (autoClosed) return finish({ handlingState: HS_DONE, waitingFor: '' });
  const nonWaiting = categories.filter((c) => !WAITING_TYPES.includes(c) && !(pendingProposal && c === CAT_PROMISE));
  if (waits.length && !nonWaiting.length) return finish({ handlingState: HS_WAITING, waitingFor: waits.join(' · ') });
  if (pendingProposal && !nonWaiting.length) return finish({ handlingState: HS_OPEN, waitingFor: WAIT_PROMISE_APPROVAL });
  return finish({ handlingState: HS_OPEN, waitingFor: '' });

  // ---------- final write + read back ----------
  async function finish(state: { handlingState: string; waitingFor: string }) {
    const personClosed = str(email.handlingState) === HS_DONE && str(email.handledBy) && str(email.handledBy) !== SYSTEM_ACTOR && !irrelevant;
    const update: Item = personClosed
      ? {}
      : state.handlingState === HS_WAITING
        ? {
            handlingState: HS_WAITING,
            waitingFor: state.waitingFor,
            waitingSince: str(email.handlingState) === HS_WAITING && str(email.waitingFor) === state.waitingFor && str(email.waitingSince) ? str(email.waitingSince) : nowIso,
            handledBy: null,
            handledAt: null,
          }
        : state.handlingState === HS_DONE
          ? { handlingState: HS_DONE, handledBy: SYSTEM_ACTOR, handledAt: str(email.handledAt) || nowIso, waitingFor: null, waitingSince: null }
          : { handlingState: HS_OPEN, waitingFor: state.waitingFor || null, waitingSince: null, handledBy: null, handledAt: null };
    // the dispute's note ids and the manual tasks are known only now
    if (quotes.dispute || quotes.manualTasks) update.classificationQuotes = quotes;
    try {
      if (Object.keys(update).length) await client.updateItem('InboundEmails', emailId, update);
    } catch (e) {
      errors.push(`מצב הטיפול: ${errText(e)}`);
    }
    const finalState = personClosed ? HS_DONE : state.handlingState;

    // the email's tasks and its drafts' tasks (the dispute notes' grouped tasks are synced by writeEmailDisputeNotes)
    const taskSync = await syncTasksAfterWrite(
      client,
      [{ emailIds: [emailId], approvalIds: draftIds }],
      { label: 'ApplyMailClassification' },
    );
    const opened = new Set(taskSync.changes.filter((c) => c.change === 'created' || c.change === 'reopened').map((c) => c.taskKey));
    try {
      const keyed = await readWhereIn(client, 'CollectionQueue', 'taskKey', [inboxKey(emailId), verifySenderKey(emailId)]);
      for (const t of keyed) {
        if (!OPEN_TASK.includes(str(t.status))) continue;
        tasks.push({ id: str(t.id), taskType: str(t.taskType), taskKey: str(t.taskKey), created: opened.has(str(t.taskKey)), reasons: str(t.reasons) });
      }
    } catch (e) {
      taskSync.errors.push(`משימות: קריאת המשימות נכשלה – ${errText(e)}`);
    }

    const [back] = await readByIds(client, 'InboundEmails', [emailId]);
    const draftRows = draftIds.length ? await readByIds(client, 'Approvals', [...new Set(draftIds)]) : [];
    const drafts = draftRows.map((a) => ({
      approvalId: str(a.id),
      referenceCode: str(a.referenceCode) || null,
      kind: str(a.kind),
      component: str(a.component) || null,
      to: str(a.recipientContact) || str(a.recipientName) || null,
      status: str(a.status),
    }));
    let writeVerified =
      !!back &&
      str(back.category) === categories[0] &&
      str(back.handlingState) === finalState &&
      str(back.classifiedBy) === classifiedBy &&
      (str(back.customerCode) || '') === (code || '');
    if (irrelevant) writeVerified = writeVerified && !str(back?.bodyText) && !str(back?.agentSummary);
    if (errors.length) writeVerified = false;

    const createdTasks = tasks.filter((t) => t.created).length;
    const bits = [
      `${failed ? 'לא מוין (מאיה נכשלה)' : `סווג: ${categories.join(', ')}`}${code ? ` · ${customerName || code}` : ' · לקוח לא זוהה'}`,
      drafts.length ? `${drafts.length} טיוטות בדואר היוצא` : '',
      autoReply?.approved ? 'המענה אושר אוטומטית (לפי סף השליחה)' : '',
      createdTasks ? `${createdTasks} משימות` : '',
      agingNotes.length ? `${agingNotes.length} הערות גיול` : '',
      customerNotes.length ? `${customerNotes.length} הערות בירור ללקוח` : '',
      quotes.rejected.length ? `נפסלו ${quotes.rejected.length} פריטים` : '',
      finalState === HS_WAITING || (finalState === HS_OPEN && state.waitingFor) ? state.waitingFor : finalState === HS_DONE ? (irrelevant ? 'נסגר (לא רלוונטי)' : 'טופל') : 'ממתין לטיפול האחראית',
    ].filter(Boolean);
    return out({
      categories,
      customerCode: code,
      handlingState: finalState,
      waitingFor: personClosed ? '' : state.waitingFor,
      promiseProposal: quotes.promise ?? null,
      dispute: quotes.dispute ?? null,
      rejected: quotes.rejected,
      drafts,
      autoReply,
      summary: bits.join(' · '),
      writeVerified,
      verification: { status: verification.status, basis: verification.basis },
      classifiedBy,
      taskSync,
    });
  }
}

/** What a type would do (dryRun). */
function plannedRoute(
  type: string,
  x: { code: string; verified: boolean; invoices: string[]; promise: Item | null; insurance: Item | null; suggestion: SignatureSuggestion | null },
): string {
  if (type === CAT_IRRELEVANT) return 'מחיקת הגוף והסיכום, טופל (מערכת)';
  if (DATA_CATEGORIES.includes(type)) {
    if (x.suggestion && !x.verified) return `משימה "זה הלקוח ${x.suggestion.customerName}?", בלי PDF`;
    return !x.code ? 'משימה לזיהוי לקוח' : x.verified ? `PDF ${type} + טיוטת מענה` : 'משימה "לאמת שולח", בלי PDF';
  }
  if (type === CAT_DOCUMENTS) return `משימה "${TT_DOCS_MANUAL}"${x.invoices.length ? ` (${x.invoices.join(', ')})` : ''}`;
  if (type === CAT_PRICE) return `משימה "${TT_PRICE_MANUAL}"${x.invoices.length ? ` (${x.invoices.join(', ')})` : ''}`;
  if (type === CAT_INSURANCE) return x.insurance ? `קישור לבקשת הביטוח ${str(x.insurance.id)} (${str(x.insurance.status)}), ${WAIT_INSURANCE_AMOUNT}` : 'אין בקשת ביטוח פתוחה – משימה לאחראית';
  if (type === CAT_REMITTANCE) return x.code ? 'שיוך ללקוח – ממתין לתקבול' : 'משימה לזיהוי לקוח';
  if (type === CAT_PROMISE) return x.promise ? `הצעת הבטחה לאישור: ${x.promise.amount} ש״ח עד ${x.promise.date}` : 'אין הצעת הבטחה (אין סכום ותאריך מצוטטים או שהתשלום מותנה)';
  return 'טיוטת אישור קבלה ומשימה לאחראית';
}
