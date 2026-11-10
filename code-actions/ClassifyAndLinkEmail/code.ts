import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { israelLocalToUtcIso, israelToday, nextBusinessDay, sortableTime } from '../shared/collections-dates.ts';
import { buildOwnerMap, errText, findCustomer, isFixtureCustomer, ownerOf, readAll, splitList, str } from '../shared/collections-data.ts';
import { verifySenderKey } from '../shared/collections-tasks.ts';
import { syncTasksAfterWrite, type TaskSyncSummary } from '../shared/collections-task-sync.ts';
import {
  clean,
  DATA_CATEGORIES,
  EMAIL_CATEGORIES,
  IRRELEVANT,
  loadVerificationData,
  verifySender,
  VERIFIED,
  type Verification,
} from '../shared/collections-mail.ts';

// Stores Maya's classification of one InboundEmails row. Deterministic rules (here, not in the prompt):
// - לא רלוונטי: body, attachments, summary and mentioned invoices are removed in the same write
//   (bodyStored=false, status לא רלוונטית). No task, no interaction.
// - כרטסת / חובות פתוחים from a sender who is not מאומת: status ממתינה לגורם פנימי and one CollectionQueue task
//   לאמת שולח (להתקשר), opened by the task engine (verify-sender:<emailId>) right after the write – the same task the
//   06:00 scan keeps. Nothing may be prepared for that sender.
// - otherwise status stays בטיפול מאיה (CreateReplyDraft moves it to טיוטה מוכנה).
// Customer name and owning bookkeeper always come from the data; the sender is re-verified against the
// linked customer. A linked relevant email gets one Interactions row (דואל, נכנס). Idempotent per email.
// A פירוט תשלום email is only linked to the customer: IdentifyCustomers' recent-mail rung reads linked mails when it
// identifies a payer; mentionedInvoiceNumbers (comma-separated) is kept for the record.

const OPEN_TASK = ['ממתין', 'בטיפול'];
const VERIFY_TASK = 'לאמת שולח';
const KEEP_STATUSES = ['טיוטה מוכנה', 'נענתה'];

const nullable = (v: unknown) => (str(v).trim() ? str(v).trim() : null);
const same = (a: unknown, b: unknown) => (nullable(a) ?? '') === (nullable(b) ?? '');

export function verifyTaskReason(category: string, address: string, v: Verification): string {
  return `בקשת ${category} מ-${address || 'שולח לא ידוע'} – ${v.shortReason}. לאמת בטלפון לפני ששולחים נתונים`;
}

function nextStepFor(args: { category: string; customerCode: string; customerName: string; verification: string; taskCreated: boolean; taskExisting: boolean; invoices: string[] }): string {
  const { category, customerCode, customerName, verification, invoices } = args;
  const who = customerCode ? `${customerName} (${customerCode})` : '';
  if (category === IRRELEVANT) return 'המייל סומן לא רלוונטי; הגוף והקבצים נמחקו. אין צורך בפעולה נוספת.';
  if (DATA_CATEGORIES.includes(category) && verification !== VERIFIED) {
    return `${args.taskCreated ? 'נפתחה' : 'כבר פתוחה'} משימה "לאמת שולח" (להתקשר ללקוח ולאמת). אין להכין PDF או טיוטה עם נתונים עד שהשולח יאומת – עצרי כאן.`;
  }
  if (!customerCode) return 'הלקוח לא זוהה. אם אפשר לזהות אותו מהנתונים (GetCustomer360 / VerifySender) – קשרי שוב עם customerCode; אחרת הכיני טיוטת מענה קצרה ללא נתונים (CreateReplyDraft) שמבקשת פרטים מזהים.';
  if (category === 'כרטסת') return `השולח מאומת. הכיני כרטסת: GenerateStatementPdf (kind כרטסת, customerCode ${customerCode}) ואז CreateReplyDraft עם ה-PDF ל${who}.`;
  if (category === 'חובות פתוחים') return `השולח מאומת. הכיני פירוט חובות: GenerateStatementPdf (kind חובות פתוחים, customerCode ${customerCode}) ואז CreateReplyDraft עם ה-PDF ל${who}.`;
  if (category === 'פירוט תשלום')
    return `${invoices.length ? `מספרי החשבוניות (${invoices.join(', ')}) נשמרו.` : 'לא נמצאו מספרי חשבוניות במייל.'} המייל שויך ללקוח, וזיהוי הלקוח של ההעברות הבאות שלו קורא אותו (מיילים אחרונים). אם נדרש – הכיני טיוטת אישור קבלה קצרה (CreateReplyDraft), בלי קבצים מצורפים.`;
  if (category === 'הבטחת תשלום') return `ההבטחה מהמייל נשמרת כהצעה לאישור בפאנל המייל; אדם מאשר אותה כהערת "התחייבות לתשלום" ללקוח ${customerCode} (AddCustomerNote עם sourceEmailId). אל תרשמי אותה בעצמך. אם נדרש – הכיני טיוטת אישור קצרה (CreateReplyDraft).`;
  return `הכיני טיוטת מענה מהנתונים (CreateReplyDraft) ל${who}, בלי קבצים מצורפים.`;
}

export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const id = clean(input?.inboundEmailId);
  const category = clean(input?.category);
  const errors: string[] = [];
  if (!id) errors.push('חסר מזהה מייל (inboundEmailId)');
  if (!EMAIL_CATEGORIES.includes(category)) errors.push(`סיווג לא מוכר: "${category}"`);
  const fail = (errs: string[], email: Item | null = null) => ({
    dryRun,
    inboundEmail: email,
    bodyDeleted: false,
    verifyTask: null,
    interaction: null,
    nextStep: '',
    writeVerified: false,
    errors: errs,
  });
  if (errors.length) return fail(errors);

  const client = new BlocksClient(context);
  let email: Item | undefined;
  try {
    email = (await client.getItem('InboundEmails', id))?.item;
  } catch {
    email = undefined;
  }
  if (!email) return fail([`המייל ${id} לא נמצא`]);

  const givenCode = clean(input?.customerCode);
  const customerCode = givenCode || str(email.customerCode).trim();
  const customer = customerCode ? await findCustomer(client, customerCode) : undefined;
  if (givenCode && !customer) return fail([`לקוח ${givenCode} לא נמצא`], email);

  const irrelevant = category === IRRELEVANT;
  const [owners, verifyData] = await Promise.all([
    customerCode ? readAll(client, 'CustomerOwners', { column: 'customerCode', value: customerCode }) : Promise.resolve([] as Item[]),
    loadVerificationData(client, customerCode ? [customerCode] : []),
  ]);
  const verification = verifySender(email.fromAddress, customerCode || null, verifyData.contacts, verifyData.customersByCode);
  const customerName = customer ? str(customer.customerName) : '';
  const bookkeeper = (customerCode ? ownerOf(customerCode, customer, buildOwnerMap(owners)) : '') || str(email.assignedBookkeeperName) || str(email.mailboxOwnerName);
  const isTestFixture = email.isTestFixture === true || email.isTestFixture === 'true' || (!!customerCode && isFixtureCustomer(customer, customerCode));
  const inputInvoices = Array.isArray(input?.mentionedInvoiceNumbers)
    ? [...new Set(input.mentionedInvoiceNumbers.map((x: unknown) => str(x).trim()).filter(Boolean))] as string[]
    : null;
  const invoices = inputInvoices && inputInvoices.length ? inputInvoices : splitList(email.mentionedInvoiceNumbers);
  const needsVerifyTask = !irrelevant && DATA_CATEGORIES.includes(category) && verification.status !== VERIFIED;

  const status = irrelevant
    ? 'לא רלוונטית'
    : needsVerifyTask
      ? 'ממתינה לגורם פנימי'
      : KEEP_STATUSES.includes(str(email.status))
        ? str(email.status)
        : 'בטיפול מאיה';

  const update: Item = {
    category,
    customerCode: customerCode || null,
    customerName: customerCode ? customerName || null : null,
    assignedBookkeeperName: bookkeeper || null,
    senderVerification: verification.status,
    status,
    isTestFixture,
  };
  if (irrelevant) {
    Object.assign(update, { bodyText: '', bodyStored: false, attachmentNames: null, attachmentUrls: null, agentSummary: null, mentionedInvoiceNumbers: null });
  } else {
    update.mentionedInvoiceNumbers = invoices.length ? invoices.join(', ') : null;
    if (str(input?.agentSummary).trim()) update.agentSummary = str(input.agentSummary).trim();
  }

  // verify-sender task (one open task per email)
  let existingTask: Item | null = null;
  if (needsVerifyTask) {
    const open = await readAll(client, 'CollectionQueue', {
      and: [
        { column: 'relatedTable', value: 'InboundEmails' },
        { column: 'relatedId', value: String(email.id) },
        { column: 'taskType', value: VERIFY_TASK },
        { column: 'status', operator: 'in', value: OPEN_TASK },
      ],
    });
    existingTask = open[0] ?? null;
  }
  const plannedTask: Item | null =
    needsVerifyTask && !existingTask
      ? {
          queueDate: israelToday(),
          customerCode: customerCode || null,
          customerName: customerCode ? customerName || null : null,
          assignedBookkeeperName: bookkeeper || null,
          priorityScore: 70,
          reasons: verifyTaskReason(category, str(email.fromAddress), verification),
          recommendedAction: 'להתקשר',
          status: 'ממתין',
          handledBy: null,
          handledAt: null,
          taskType: VERIFY_TASK,
          needsManagerApproval: false,
          isAlert: false,
          taskKey: verifySenderKey(email.id),
          source: 'פניות',
          relatedTable: 'InboundEmails',
          relatedId: String(email.id),
          dueAt: str(email.dueAt) || israelLocalToUtcIso(nextBusinessDay(israelToday()), 9, 0),
          isTestFixture,
        }
      : null;

  // interaction for a linked relevant email, once per email
  const summaryText = (update.agentSummary ?? str(email.agentSummary)).trim();
  const subject = str(email.subject).trim() || '(ללא נושא)';
  const actorName = str(email.fromName).trim() || str(email.fromAddress).trim() || 'שולח לא ידוע';
  let existingInteraction: Item | null = null;
  if (!irrelevant && customerCode) {
    const rows = await readAll(client, 'Interactions', {
      and: [
        { column: 'customerCode', value: customerCode },
        { column: 'type', value: 'דואל' },
        { column: 'direction', value: 'נכנס' },
      ],
    });
    const at = sortableTime(email.receivedAt);
    existingInteraction = rows.find((r) => sortableTime(r.occurredAt) === at && str(r.actorName) === actorName && str(r.summary).startsWith(`דואל נכנס: ${subject}`)) ?? null;
  }
  const plannedInteraction: Item | null =
    !irrelevant && customerCode && !existingInteraction
      ? {
          customerCode,
          customerName: customerName || null,
          occurredAt: str(email.receivedAt) || new Date().toISOString(),
          type: 'דואל',
          direction: 'נכנס',
          actorName,
          summary: `דואל נכנס: ${subject} (${category})${summaryText ? ` – ${summaryText}` : ''}`,
          relatedInvoiceNumbers: invoices.length ? invoices.join(', ') : null,
        }
      : null;

  const nextStep = nextStepFor({
    category,
    customerCode,
    customerName,
    verification: verification.status,
    taskCreated: !!plannedTask,
    taskExisting: !!existingTask,
    invoices,
  });

  if (dryRun) {
    return {
      dryRun,
      inboundEmail: { ...email, ...update },
      bodyDeleted: irrelevant,
      verifyTask: plannedTask ?? existingTask,
      interaction: plannedInteraction ?? existingInteraction,
      nextStep,
      writeVerified: false,
      errors: [],
    };
  }

  try {
    await client.updateItem('InboundEmails', String(email.id), update);
    let interaction: Item | null = existingInteraction;
    if (plannedInteraction) interaction = (await client.createItem('Interactions', plannedInteraction))?.item ?? null;

    // read back every written row
    const back = (await client.getItem('InboundEmails', String(email.id)))?.item;
    let writeVerified =
      !!back &&
      str(back.category) === category &&
      str(back.status) === status &&
      same(back.customerCode, update.customerCode) &&
      str(back.senderVerification) === verification.status;
    if (irrelevant) writeVerified = writeVerified && !str(back?.bodyText) && (back?.bodyStored === false || back?.bodyStored === 'false') && !str(back?.attachmentNames) && !str(back?.agentSummary);
    if (plannedInteraction) {
      const it = interaction?.id ? (await client.getItem('Interactions', String(interaction.id)))?.item : null;
      writeVerified = writeVerified && !!it && str(it.customerCode) === customerCode && str(it.type) === 'דואל';
      interaction = it ?? interaction;
    }

    // the email's tasks (verify-sender / inbox) from the task engine; a task failure never fails the classification
    let task: Item | null = existingTask;
    const taskSync: TaskSyncSummary = await syncTasksAfterWrite(client, { emailIds: [String(email.id)] }, { label: 'ClassifyAndLinkEmail' });
    if (needsVerifyTask) {
      try {
        const open = await readAll(client, 'CollectionQueue', {
          and: [
            { column: 'relatedTable', value: 'InboundEmails' },
            { column: 'relatedId', value: String(email.id) },
            { column: 'taskType', value: VERIFY_TASK },
            { column: 'status', operator: 'in', value: OPEN_TASK },
          ],
        });
        task = open.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? task;
      } catch (e) {
        taskSync.errors.push(`משימות: קריאת משימת האימות נכשלה – ${errText(e)}`);
      }
    }
    return { dryRun, inboundEmail: back ?? { ...email, ...update }, bodyDeleted: irrelevant, verifyTask: task, interaction, nextStep, taskSync, writeVerified, errors: [] };
  } catch (e) {
    return { ...fail([`שמירת הסיווג נכשלה: ${errText(e)}`], email), nextStep };
  }
};
