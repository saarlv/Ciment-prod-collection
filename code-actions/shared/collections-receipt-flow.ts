// Plan 04.11 part B, stage 4 (b/identify-receipt): what IdentifyCustomers and IssueReceipt share – the new enum values,
// the actors, the write journal (rollback of everything a run wrote), and the two task kinds this stage owns.
//
// Tasks of this stage (both outside the 06:00 scan: parseTaskKey does not know their kinds, so BuildTasks never opens,
// refreshes or closes them – their writers do):
//   identify:<bankLineId>      זיהוי לקוח – לאישור: an uncertain identification waiting for a person (IdentifyCustomers);
//                              closed when the line becomes certain, unknown or approved (IdentifyCustomers / IssueReceipt)
//   missing-ap:<customerCode>  חסר איש קשר הנהלת חשבונות: an approved receipt could not be drafted to the customer's AP
//                              contact (IssueReceipt); one per customer, refreshed / reopened by each further receipt, closed
//                              by closeResolvedMissingApTasks once the customer has an isApContact contact with an email
// The unknown payer keeps the existing scan-managed task receipt-customer:<bankLineId> (לא זוהה).
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { nextBusinessDay, israelLocalToUtcIso } from './collections-dates.ts';
import { errText, readAll, readByIds, readWhereIn, str } from './collections-data.ts';
import { buildTaskRow, OPEN_TASK_STATUSES, type TaskRowSpec, TS_AUTO_CLOSED, TS_OPEN, SRC_RECEIPTS } from './collections-tasks.ts';

// ---------- enums (exactly as in the table artifacts) ----------
/** Receipts.identifyStatus */
export const IS_CERTAIN = 'ודאי';
export const IS_UNCERTAIN = 'לא ודאי';
export const IS_APPROVED = 'אושר';
export const IS_AUTO = 'אושר אוטומטית';
export const IS_UNKNOWN = 'לא זוהה';
/** Receipts.receiptSource */
export const RSRC_BANK = 'דף בנק';
/** Receipts.matchStatus once the receipt is approved (the debt check / allocation come in b/debt-allocation) */
export const MS_ON_ACCOUNT_SPREAD = 'על חשבון – צריך פיזור';
/** Receipts.sendStatus */
export const SEND_DRAFT = 'טיוטה – בדיקה';
export const SEND_MISSING_CONTACT = 'חסר איש קשר';
/** MatchProposals.status a customer proposal gets when the person approves / overrides it */
export const MP_DECIDED_APPROVED = 'אושרה – לביצוע ב-Priority';
export const MP_DECIDED_REJECTED = 'נדחתה';

/** Who approves when customerAutoApproveAt is on (Receipts.preparedBy, Approvals.draftedBy). */
export const AUTO_APPROVE_ACTOR = 'אישור אוטומטי (מערכת)';
/** actorName of the identification step when no person started the run */
export const IDENTIFY_ACTOR = 'זיהוי לקוח (מערכת)';

// ---------- tasks ----------
export const TT_IDENTIFY = 'זיהוי לקוח – לאישור';
export const TT_MISSING_AP = 'חסר איש קשר הנהלת חשבונות';
export const identifyTaskKey = (bankLineId: unknown) => `identify:${str(bankLineId).trim()}`;
export const missingApTaskKey = (customerCode: unknown) => `missing-ap:${str(customerCode).trim()}`;
/** The legacy receipt task keys of a bank line (the old ladder's tasks that the new path supersedes). */
export const legacyLineTaskKeys = (bankLineId: unknown) =>
  ['receipt-customer', 'receipt-proposal', 'receipt-unmatched', 'receipt-match', 'receipt-detail'].map((k) => `${k}:${str(bankLineId).trim()}`);

/** Next business day, 12:00 Israel. */
export const nextNoonIso = (asOfDate: string) => israelLocalToUtcIso(nextBusinessDay(asOfDate), 12, 0);

/**
 * A complete CollectionQueue row for one of this stage's keys. The shared builder only knows the kinds of collections-
 * tasks.ts, so the row is built there under an unmanaged kind and the key / source set here (both are תקבולים).
 */
export function stageTaskRow(taskKey: string, spec: Omit<TaskRowSpec, 'kind' | 'id'>): Item {
  return { ...buildTaskRow({ ...spec, kind: 'bank-missing', id: 'x' }), taskKey, source: SRC_RECEIPTS };
}

const isOpen = (s: unknown) => !str(s).trim() || OPEN_TASK_STATUSES.includes(str(s).trim());
const VERIFY = ['status', 'taskKey', 'title', 'relatedId'];

export interface StageTaskResult {
  taskKey: string;
  change: 'created' | 'refreshed' | 'reopened' | 'closed' | 'none';
  taskIds: string[];
  writeVerified: boolean;
  errors: string[];
}

async function writeVerified(client: BlocksClient, writes: { id: string | null; fields: Item }[], out: StageTaskResult) {
  const ids: string[] = [];
  try {
    for (const w of writes) {
      if (w.id) {
        await client.updateItem('CollectionQueue', w.id, w.fields);
        ids.push(w.id);
      } else ids.push(str((await client.createItem('CollectionQueue', w.fields))?.item?.id));
    }
    const back = new Map((await readByIds(client, 'CollectionQueue', ids.filter(Boolean))).map((r) => [str(r.id), r]));
    out.taskIds = ids.filter(Boolean);
    out.writeVerified = writes.every((w, i) => {
      const b = back.get(ids[i]);
      return !!b && VERIFY.filter((f) => f in w.fields).every((f) => str(b[f]) === str(w.fields[f]));
    });
    if (!out.writeVerified) out.errors.push(`CollectionQueue ${out.taskKey}: לא נקרא בחזרה כפי שנכתב`);
  } catch (e) {
    out.taskIds = ids.filter(Boolean);
    out.errors.push(`CollectionQueue ${out.taskKey}: ${errText(e)}`);
  }
}

/** Closes (נסגר אוטומטית) every open task under exactly these keys. */
export async function closeTasksByKeys(client: BlocksClient, keys: string[], reason: string, nowIso: string): Promise<StageTaskResult> {
  const list = [...new Set(keys.map((k) => str(k).trim()).filter(Boolean))];
  const out: StageTaskResult = { taskKey: list.join(','), change: 'none', taskIds: [], writeVerified: true, errors: [] };
  if (!list.length) return out;
  let rows: Item[];
  try {
    rows = await readWhereIn(client, 'CollectionQueue', 'taskKey', list);
  } catch (e) {
    out.writeVerified = false;
    out.errors.push(`CollectionQueue: ${errText(e)}`);
    return out;
  }
  const open = rows.filter((r) => isOpen(r.status));
  if (!open.length) return out;
  out.change = 'closed';
  out.taskKey = [...new Set(open.map((r) => str(r.taskKey)))].join(',');
  await writeVerified(client, open.map((r) => ({ id: str(r.id), fields: { status: TS_AUTO_CLOSED, resolvedAt: nowIso, resolvedReason: reason, lastCheckedAt: nowIso } })), out);
  return out;
}

/**
 * Opens the task `row.taskKey`: an open row is refreshed (row fields except status / openedAt / queueDate / dueAt), extra
 * open rows close as duplicates, a closed row is reopened – also one a person closed, because this is called for a NEW
 * occurrence (another receipt of the customer without an AP contact) – otherwise a new row is created.
 */
export async function upsertReopenTask(client: BlocksClient, row: Item, nowIso: string, asOfDate: string): Promise<StageTaskResult> {
  const key = str(row.taskKey).trim();
  const out: StageTaskResult = { taskKey: key, change: 'none', taskIds: [], writeVerified: false, errors: [] };
  let rows: Item[];
  try {
    rows = (await readWhereIn(client, 'CollectionQueue', 'taskKey', [key])).sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
  } catch (e) {
    out.errors.push(`CollectionQueue: ${errText(e)}`);
    return out;
  }
  const open = rows.filter((r) => isOpen(r.status));
  const { status: _s, openedAt: _o, queueDate: _q, dueAt: _d, handledBy: _hb, handledAt: _ha, resolvedAt: _ra, resolvedReason: _rr, ...refresh } = row;
  const writes: { id: string | null; fields: Item }[] = [];
  if (open.length) {
    writes.push({ id: str(open[0].id), fields: { ...refresh, status: str(open[0].status).trim() || TS_OPEN, lastCheckedAt: nowIso } });
    for (const dup of open.slice(1)) {
      writes.push({ id: str(dup.id), fields: { status: TS_AUTO_CLOSED, resolvedAt: nowIso, resolvedReason: 'משימה כפולה – המשימה נמשכת ברשומה אחרת', lastCheckedAt: nowIso } });
    }
    out.change = 'refreshed';
  } else if (rows.length) {
    const newest = rows[rows.length - 1];
    writes.push({
      id: str(newest.id),
      fields: { ...refresh, status: TS_OPEN, openedAt: nowIso, queueDate: asOfDate, dueAt: row.dueAt ?? null, handledBy: null, handledAt: null, resolvedAt: null, resolvedReason: null, lastCheckedAt: nowIso },
    });
    out.change = 'reopened';
  } else {
    writes.push({ id: null, fields: row });
    out.change = 'created';
  }
  await writeVerified(client, writes, out);
  return out;
}

/** An isApContact contact of the customer that has an email (the mail draft goes to it). */
export const hasApEmail = (c: Item) => (c.isApContact === true || c.isApContact === 'true') && /@/.test(str(c.email));

/**
 * Closes the open missing-ap:<customerCode> tasks whose customer now has an isApContact contact with an email. Cheap:
 * one read of the open tasks, one read of the contacts of their customers. Never throws.
 */
export async function closeResolvedMissingApTasks(client: BlocksClient, nowIso: string): Promise<StageTaskResult> {
  const out: StageTaskResult = { taskKey: 'missing-ap:*', change: 'none', taskIds: [], writeVerified: true, errors: [] };
  try {
    const open = (await readAll(client, 'CollectionQueue', { column: 'taskType', value: TT_MISSING_AP })).filter((t) => isOpen(t.status) && str(t.taskKey).startsWith('missing-ap:'));
    if (!open.length) return out;
    const codes = [...new Set(open.map((t) => str(t.taskKey).slice('missing-ap:'.length).trim()).filter(Boolean))];
    const contacts = await readWhereIn(client, 'CustomerContacts', 'customerCode', codes);
    const resolved = new Set(contacts.filter(hasApEmail).map((c) => str(c.customerCode).trim()));
    const keys = codes.filter((c) => resolved.has(c)).map(missingApTaskKey);
    if (!keys.length) return out;
    return await closeTasksByKeys(client, keys, 'נוסף איש קשר הנהלת חשבונות עם מייל – אפשר לשלוח את הקבלות', nowIso);
  } catch (e) {
    out.writeVerified = false;
    out.errors.push(`missing-ap: ${errText(e)}`);
    return out;
  }
}

// ---------- the write journal ----------
/**
 * Records every row a run writes so a failure can undo exactly that: created rows are deleted, updated rows get their
 * previous values back, deleted rows are created again (without the platform fields). Undo runs newest first.
 */
export class WriteJournal {
  private ops: ({ kind: 'created'; table: string; id: string } | { kind: 'updated'; table: string; id: string; before: Item } | { kind: 'deleted'; table: string; row: Item })[] = [];

  async create(client: BlocksClient, table: string, fields: Item): Promise<Item> {
    const row = (await client.createItem(table, fields))?.item;
    const id = str(row?.id);
    if (!id) throw new Error(`${table}: השורה לא נוצרה`);
    this.ops.push({ kind: 'created', table, id });
    return row!;
  }

  /** Updates `existing` (the row as read before) and records the previous values of the fields written. */
  async update(client: BlocksClient, table: string, existing: Item, fields: Item): Promise<void> {
    const id = str(existing.id);
    const before = Object.fromEntries(Object.keys(fields).map((k) => [k, existing[k] ?? null]));
    await client.updateItem(table, id, fields);
    this.ops.push({ kind: 'updated', table, id, before });
  }

  async remove(client: BlocksClient, table: string, existing: Item): Promise<void> {
    await client.deleteItem(table, str(existing.id));
    this.ops.push({ kind: 'deleted', table, row: existing });
  }

  get size() {
    return this.ops.length;
  }

  async rollback(client: BlocksClient): Promise<string[]> {
    const errors: string[] = [];
    for (const op of [...this.ops].reverse()) {
      try {
        if (op.kind === 'created') await client.deleteItem(op.table, op.id);
        else if (op.kind === 'updated') await client.updateItem(op.table, op.id, op.before);
        else {
          const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = op.row;
          await client.createItem(op.table, fields);
        }
      } catch (e) {
        errors.push(`${op.table}: ביטול הכתיבה נכשל – ${errText(e)}`);
      }
    }
    this.ops = [];
    return errors;
  }
}
