import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { errText, str } from '../shared/collections-data.ts';
import { REQ_APPROVED_NOT_SUBMITTED, REQ_PROPOSED } from '../shared/collections-insurance.ts';

// A person approves one credit-insurance increase proposal on the insurance screen: a CreditLimitRequests
// row in "הוצעה ע״י הסוכנת" moves to "אושר – לא הוגש" with decidedBy and decidedAt. Nothing is submitted
// to the insurer (the API connection opens when keys arrive) and nothing is written to Priority. Any other
// current status is refused with a Hebrew reason, so a request is never approved twice. dryRun shows the
// change without writing.
export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const requestId = str(input?.requestId).trim();
  const decidedBy = str(input?.decidedBy).trim();
  const refuse = (reason: string, request: Item | null = null, errors: string[] = []) => ({ dryRun, refused: true, reason, request, writeVerified: false, errors });
  if (!requestId) return refuse('חסר מזהה הבקשה (requestId)', null, ['חסר מזהה הבקשה (requestId)']);
  if (!decidedBy) return refuse('חסר שם המאשר (decidedBy)', null, ['חסר שם המאשר (decidedBy)']);

  const client = new BlocksClient(context);
  let row: Item | null = null;
  try {
    row = (await client.getItem('CreditLimitRequests', requestId))?.item ?? null;
  } catch {
    row = null;
  }
  if (!row) return refuse(`הבקשה ${requestId} לא נמצאה`, null, [`הבקשה ${requestId} לא נמצאה`]);
  const status = str(row.status);
  if (status !== REQ_PROPOSED) {
    const by = str(row.decidedBy).trim();
    return refuse(
      `הבקשה של ${str(row.customerName) || str(row.customerCode)} בסטטוס "${status || 'ללא סטטוס'}"${by ? ` (החליט/ה: ${by})` : ''} – אפשר לאשר רק בקשה ב"${REQ_PROPOSED}"`,
      row,
    );
  }

  const patch = { status: REQ_APPROVED_NOT_SUBMITTED, decidedBy, decidedAt: new Date().toISOString() };
  if (dryRun) return { dryRun, refused: false, reason: '', request: { ...row, ...patch }, writeVerified: false, errors: [] };
  try {
    await client.updateItem('CreditLimitRequests', requestId, patch);
    const back = (await client.getItem('CreditLimitRequests', requestId))?.item ?? null;
    const ok = !!back && str(back.status) === REQ_APPROVED_NOT_SUBMITTED && str(back.decidedBy) === decidedBy && !!str(back.decidedAt);
    return { dryRun, refused: false, reason: '', request: back ?? { ...row, ...patch }, writeVerified: ok, errors: ok ? [] : ['הבקשה לא נקראה בחזרה כמאושרת'] };
  } catch (e) {
    return { dryRun, refused: false, reason: '', request: row, writeVerified: false, errors: [`CreditLimitRequests: ${errText(e)}`] };
  }
};
