import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { formatDateHe, israelToday } from './collections-dates.ts';
import { errText, readAll, readByIds, readWhereIn, str } from './collections-data.ts';
import { clean } from './collections-mail.ts';
import { withReference } from './collections-outbox.ts';
import { syncTasksAfterWrite } from './collections-task-sync.ts';

// Shared by DecideApproval and ApplyMailClassification's auto-reply (mailAutoReplyAt): a decision on outbound drafts in Approvals, by approvalIds or a whole batchId:
// - approve → אושר – לא נשלח (the end of the path: there is no send), for every kind (also the 2c/2d
//   internal drafts פנייה ללוגיסטיקה and בקשת אישור מחיר). A reply to an InboundEmails row – or a
//   customer package (מענה ללקוח on a Disputes case) whose inboundEmailId names the email – marks that
//   email answered (answeredAt, status נענתה – what the inbox SLA counts as done).
// - reject → נדחה. A rejected reply puts its email back to בטיפול מאיה.
// - edit → new subject / body on a pending draft (stays ממתין; approvalIds only).
// decidedBy / decidedAt / decisionNote are recorded. Only ממתין drafts change; others are skipped.

export const APPROVED = 'אושר – לא נשלח';
export const REJECTED = 'נדחה';
const PENDING = 'ממתין';
const REPLY_KIND = 'מענה ללקוח';

/** The decision itself (DecideApproval, and the mail auto-reply of ApplyMailClassification – the same writes). */
export async function decideApprovals(client: BlocksClient, input: any) {
  const dryRun = input?.dryRun === true;
  const decision = clean(input?.decision);
  const decidedBy = clean(input?.decidedBy);
  const note = str(input?.note).trim();
  const batchId = clean(input?.batchId);
  const ids = Array.isArray(input?.approvalIds) ? [...new Set(input.approvalIds.map((x: unknown) => str(x).trim()).filter(Boolean))] as string[] : [];
  const subject = str(input?.subject).trim();
  const body = str(input?.body).trim();
  const out = (o: Item) => ({ dryRun, updated: [], skipped: [], writeVerified: false, errors: [], ...o });

  const errors: string[] = [];
  if (!['approve', 'reject', 'edit'].includes(decision)) errors.push(`החלטה לא מוכרת: "${decision}" (approve / reject / edit)`);
  if (!decidedBy) errors.push('חסר שם המחליט (decidedBy)');
  if (!ids.length && !batchId) errors.push('חסרים approvalIds או batchId');
  if (decision === 'edit') {
    if (!ids.length) errors.push('עריכה אפשרית רק לטיוטות מסוימות (approvalIds)');
    if (!subject && !body) errors.push('בעריכה צריך נושא (subject) או גוף (body) חדשים');
  }
  if (errors.length) return out({ errors });

  const [byIds, byBatch] = await Promise.all([
    ids.length ? readByIds(client, 'Approvals', ids) : Promise.resolve([] as Item[]),
    batchId && decision !== 'edit' ? readAll(client, 'Approvals', { column: 'batchId', value: batchId }) : Promise.resolve([] as Item[]),
  ]);
  const skipped: Item[] = [];
  const found = new Map<string, Item>();
  for (const r of [...byIds, ...byBatch]) found.set(String(r.id), r);
  for (const id of ids) if (!found.has(id)) skipped.push({ approvalId: id, reason: 'הטיוטה לא נמצאה' });

  const now = new Date().toISOString();
  const targets: { row: Item; update: Item }[] = [];
  for (const row of [...found.values()].sort((a, b) => Number(a.id) - Number(b.id))) {
    if (str(row.status) !== PENDING) {
      // a batch call quietly passes over decided drafts; an explicit id is reported
      if (ids.includes(String(row.id)) || decision !== 'edit') {
        skipped.push({ approvalId: String(row.id), customerCode: str(row.customerCode), status: str(row.status), reason: `הטיוטה כבר בסטטוס ${str(row.status)}` });
      }
      continue;
    }
    let update: Item;
    if (decision === 'approve') update = { status: APPROVED, decidedBy, decidedAt: now, decisionNote: note || null };
    else if (decision === 'reject') update = { status: REJECTED, decidedBy, decidedAt: now, decisionNote: note || null };
    else {
      const edited = `נערך על ידי ${decidedBy} ב-${formatDateHe(israelToday())}`;
      update = {
        // an edited subject keeps the row's " [CIM-<id>]" reference, so a reply still finds its way back
        ...(subject ? { subject: str(row.referenceCode).trim() ? withReference(subject, str(row.referenceCode).trim()) : subject } : {}),
        ...(body ? { body } : {}),
        decisionNote: [str(row.decisionNote).trim(), edited, note].filter(Boolean).join(' · '),
      };
    }
    targets.push({ row, update });
  }

  // replies to inbound emails follow the decision
  const emailUpdates = new Map<string, Item>();
  const follow = (emailId: string) => {
    if (decision === 'approve') emailUpdates.set(emailId, { answeredAt: now, status: 'נענתה' });
    if (decision === 'reject') emailUpdates.set(emailId, { status: 'בטיפול מאיה' });
  };
  // a customer reply attached to another record (the 2c document package, relatedTable Disputes) answers
  // the email named in inboundEmailId (InboundEmails.messageId)
  const byMessageId = targets
    .map(({ row }) => row)
    .filter((row) => str(row.relatedTable) !== 'InboundEmails' && str(row.kind) === REPLY_KIND && str(row.inboundEmailId).trim());
  const messageEmails = byMessageId.length && decision !== 'edit'
    ? await readWhereIn(client, 'InboundEmails', 'messageId', byMessageId.map((r) => str(r.inboundEmailId).trim()))
    : [];
  for (const { row } of targets) {
    if (str(row.relatedTable) === 'InboundEmails' && str(row.relatedId)) {
      follow(str(row.relatedId));
      continue;
    }
    if (byMessageId.includes(row)) {
      const em = messageEmails.find((e) => str(e.messageId) === str(row.inboundEmailId).trim());
      if (em) follow(String(em.id));
    }
  }

  const preview = targets.map(({ row, update }) => ({ ...row, ...update }));
  if (dryRun) return out({ updated: preview, skipped });
  if (!targets.length) return out({ updated: [], skipped, writeVerified: true });

  const writeErrors: string[] = [];
  for (const { row, update } of targets) {
    try {
      await client.updateItem('Approvals', String(row.id), update);
    } catch (e) {
      writeErrors.push(`${row.id}: ${errText(e)}`);
    }
  }
  for (const [emailId, upd] of emailUpdates) {
    try {
      const current = (await client.getItem('InboundEmails', emailId))?.item;
      // a rejected draft only reopens an email that was waiting on it
      if (decision === 'reject' && str(current?.status) !== 'טיוטה מוכנה') {
        emailUpdates.delete(emailId);
        continue;
      }
      await client.updateItem('InboundEmails', emailId, upd);
    } catch (e) {
      writeErrors.push(`InboundEmails ${emailId}: ${errText(e)}`);
    }
  }

  // read back
  const back = await readByIds(client, 'Approvals', targets.map((t) => String(t.row.id)));
  const backById = new Map(back.map((r) => [String(r.id), r]));
  let writeVerified = writeErrors.length === 0 && back.length === targets.length;
  for (const { row, update } of targets) {
    const b = backById.get(String(row.id));
    if (!b) {
      writeVerified = false;
      continue;
    }
    if (update.status && str(b.status) !== update.status) writeVerified = false;
    if (update.body && str(b.body) !== update.body) writeVerified = false;
    if (update.subject && str(b.subject) !== update.subject) writeVerified = false;
  }
  if (emailUpdates.size) {
    const emails = await readByIds(client, 'InboundEmails', [...emailUpdates.keys()]);
    for (const [emailId, upd] of emailUpdates) {
      const e = emails.find((x) => String(x.id) === emailId);
      if (!e || str(e.status) !== upd.status) writeVerified = false;
    }
  }
  const updated = targets.map(({ row }) => backById.get(String(row.id)) ?? row);

  // the drafts' tasks (draft:<id>) and their source emails' tasks follow the decision now; never fails the decision
  const sourceEmails = new Set<string>(emailUpdates.keys());
  for (const { row } of targets) {
    if (str(row.relatedTable) === 'InboundEmails' && str(row.relatedId)) sourceEmails.add(str(row.relatedId));
    const em = messageEmails.find((e) => str(row.inboundEmailId).trim() && str(e.messageId) === str(row.inboundEmailId).trim());
    if (em) sourceEmails.add(String(em.id));
  }
  const taskSync = await syncTasksAfterWrite(client, { approvalIds: targets.map((t) => String(t.row.id)), emailIds: [...sourceEmails] }, { label: 'DecideApproval' });
  return out({ updated, skipped, writeVerified, errors: writeErrors, taskSync });
}
