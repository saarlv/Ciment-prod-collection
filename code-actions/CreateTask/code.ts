import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { israelLocalToUtcIso, israelToday, nextBusinessDay } from '../shared/collections-dates.ts';
import { buildOwnerMap, errText, findCustomer, isFixtureCustomer, ownerOf, readAll, readSettings, str } from '../shared/collections-data.ts';
import { severityConfigFrom, severityLevel } from '../shared/collections-severity.ts';
import { SRC_AGING, SRC_INBOX, SRC_PROMISES, SRC_RECEIPTS, TS_OPEN, TS_WORKING } from '../shared/collections-tasks.ts';

// Creates one CollectionQueue task by hand (a person or an agent). Customer name and owning bookkeeper come from the
// data (CustomerOwners first, else Customers.assignedBookkeeperName), never from the caller. Every task gets
// taskKey manual:<taskType>:<relatedId, else customerCode> – a key the task engine never manages, so the daily scan and
// the writers' syncs leave it alone – and every task column (title, severity + severityScore from priorityScore by the
// collections-severity thresholds, source by taskType, openedAt, lastCheckedAt). A duplicate (an open task with the same
// key, or the same customer, taskType and relatedId) is not created again. Receipt first (r3): the unknown-payer type is
// 'לא זוהה'. needsManagerApproval (default false) is always written. The old match / detail-request task types were
// removed on 08.11 with the invoice-matching ladder.
const TASK_TYPES = ['צ׳ק חוזר', 'לא זוהה', 'הבטחה הופרה', 'לאמת שולח', 'ביטוח 80%', 'אחר'];
const ACTIONS = ['לשלוח תזכורת', 'לשלוח WhatsApp', 'להתקשר', 'להסלים למנהל', 'לטפל במחלוקת', 'לבדוק הבטחה', 'לשחרר הזמנה חסומה'];
const OPEN = [TS_OPEN, TS_WORKING];
const RECEIPT_TYPES = ['צ׳ק חוזר', 'לא זוהה'];
const SRC_INSURANCE = 'ביטוח';
const TITLE_MAX = 140;

/** CollectionQueue.source of a manual task, by its type. */
export function sourceOfTaskType(taskType: string): string {
  if (RECEIPT_TYPES.includes(taskType)) return SRC_RECEIPTS;
  if (taskType === 'לאמת שולח') return SRC_INBOX;
  if (taskType === 'הבטחה הופרה') return SRC_PROMISES;
  if (taskType === 'ביטוח 80%') return SRC_INSURANCE;
  return SRC_AGING;
}

export const manualTaskKey = (taskType: string, relatedId: string | null, customerCode: string) => `manual:${taskType}:${relatedId || customerCode}`;

/** "<type> – <customer>: <first sentence of the reasons>", cut to TITLE_MAX characters. */
export function manualTitle(taskType: string, customerName: string, reasons: string): string {
  const first = reasons.split(/(?<=[.!?])\s+|\n/)[0].trim().replace(/[.]+$/, '');
  const t = `${taskType === 'אחר' ? 'משימה' : taskType} – ${customerName}${first ? `: ${first}` : ''}`;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t;
}

export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const customerCode = str(input?.customerCode).trim();
  const taskType = str(input?.taskType).trim();
  const needsManagerApproval = input?.needsManagerApproval === true || input?.needsManagerApproval === 'true';
  const reasons = str(input?.reasons).trim();
  const recommendedAction = str(input?.recommendedAction).trim() || null;
  const relatedTable = str(input?.relatedTable).trim() || null;
  const relatedId = str(input?.relatedId).trim() || null;
  const errors: string[] = [];

  if (!customerCode) errors.push('חסר קוד לקוח (customerCode)');
  if (!TASK_TYPES.includes(taskType)) errors.push(`סוג משימה לא מוכר: "${taskType}"`);
  if (!reasons) errors.push('חסרה סיבה (reasons)');
  if (recommendedAction && !ACTIONS.includes(recommendedAction)) errors.push(`פעולה מומלצת לא מוכרת: "${recommendedAction}"`);
  let priorityScore = 50;
  if (input?.priorityScore !== undefined && input?.priorityScore !== null && input?.priorityScore !== '') {
    const n = Number(input.priorityScore);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`priorityScore חייב להיות בין 0 ל-100 (התקבל "${str(input.priorityScore)}")`);
    else priorityScore = Math.round(n);
  }
  const today = israelToday();
  let dueAt = israelLocalToUtcIso(nextBusinessDay(today), 9, 0);
  if (str(input?.dueAt).trim()) {
    const t = Date.parse(str(input.dueAt));
    if (Number.isNaN(t)) errors.push(`dueAt אינו תאריך-שעה תקין: "${str(input.dueAt)}"`);
    else dueAt = new Date(t).toISOString();
  }
  if (errors.length) return { dryRun, task: null, skippedDuplicate: false, writeVerified: false, errors };

  const taskKey = manualTaskKey(taskType, relatedId, customerCode);
  const client = new BlocksClient(context);
  const [customer, owners, openTasks, openByKey, settings] = await Promise.all([
    findCustomer(client, customerCode),
    readAll(client, 'CustomerOwners', { column: 'customerCode', value: customerCode }),
    readAll(client, 'CollectionQueue', {
      and: [
        { column: 'customerCode', value: customerCode },
        { column: 'taskType', value: taskType },
        { column: 'status', operator: 'in', value: OPEN },
      ],
    }),
    readAll(client, 'CollectionQueue', { and: [{ column: 'taskKey', value: taskKey }, { column: 'status', operator: 'in', value: OPEN }] }),
    readSettings(client),
  ]);
  if (!customer) return { dryRun, task: null, skippedDuplicate: false, writeVerified: false, errors: [`לקוח ${customerCode} לא נמצא`] };

  const duplicate = openByKey[0] ?? openTasks.find((t) => (str(t.relatedId).trim() || null) === relatedId);
  if (duplicate) return { dryRun, task: duplicate, skippedDuplicate: true, writeVerified: false, errors: [] };

  const customerName = str(customer.customerName) || customerCode;
  const nowIso = new Date().toISOString();
  const task: Item = {
    queueDate: today,
    customerCode,
    customerName,
    assignedBookkeeperName: ownerOf(customerCode, customer, buildOwnerMap(owners)) || null,
    priorityScore,
    reasons,
    recommendedAction,
    status: TS_OPEN,
    handledBy: null,
    handledAt: null,
    taskType,
    needsManagerApproval,
    isAlert: false,
    relatedTable,
    relatedId,
    dueAt,
    taskKey,
    title: manualTitle(taskType, customerName, reasons),
    severity: severityLevel(priorityScore, severityConfigFrom(settings)),
    severityScore: priorityScore,
    source: sourceOfTaskType(taskType),
    invoiceNumbers: null,
    amount: null,
    openedAt: nowIso,
    lastCheckedAt: nowIso,
    resolvedAt: null,
    resolvedReason: null,
    isTestFixture: isFixtureCustomer(customer, customerCode),
  };
  if (dryRun) return { dryRun, task, skippedDuplicate: false, writeVerified: false, errors: [] };

  try {
    const { item } = await client.createItem('CollectionQueue', task);
    const { item: back } = await client.getItem('CollectionQueue', String(item.id));
    const writeVerified =
      !!back &&
      str(back.customerCode) === customerCode &&
      str(back.taskType) === taskType &&
      str(back.status) === TS_OPEN &&
      str(back.taskKey) === taskKey &&
      str(back.severity) === str(task.severity) &&
      (str(back.relatedId).trim() || null) === relatedId;
    return { dryRun, task: back ?? item, skippedDuplicate: false, writeVerified, errors: [] };
  } catch (e) {
    return { dryRun, task, skippedDuplicate: false, writeVerified: false, errors: [`CollectionQueue: ${errText(e)}`] };
  }
};
