import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { splitList, str } from '../shared/collections-data.ts';
import { clean } from '../shared/collections-mail.ts';
import { CASE_CLOSED } from '../shared/collections-cases.ts';
import { loadPriceAnalysis, PRICE_DISPUTE } from '../shared/collections-pricing.ts';
import { preparePriceRequest } from '../shared/collections-price-cases.ts';

// Internal draft to the sales agent and the agent's manager (SalesAgents) for a מחיר case, with the
// per-line analysis of AnalyzePriceGap as a text table and the customer's email quoted (its attachments
// linked). Approvals kind בקשת אישור מחיר, status ממתין, relatedTable Disputes; recipientName /
// recipientContact hold both people, comma-separated. Never sent. A pending draft is replaced.
export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const id = clean(input?.disputeId);
  const out = (o: Item) => ({ dryRun, approval: null, writeVerified: false, errors: [] as string[], ...o });
  if (!id) return out({ errors: ['חסר מזהה מקרה (disputeId)'] });
  const client = new BlocksClient(context);
  let dispute: Item | undefined;
  try {
    dispute = (await client.getItem('Disputes', id))?.item;
  } catch {
    dispute = undefined;
  }
  if (!dispute) return out({ errors: [`המקרה ${id} לא נמצא`] });
  if (str(dispute.disputeType) !== PRICE_DISPUTE) return out({ errors: [`המקרה ${str(dispute.disputeNumber) || id} אינו מקרה מחיר`] });
  if (str(dispute.status) === CASE_CLOSED) return out({ errors: [`המקרה ${str(dispute.disputeNumber) || id} סגור`] });
  const invoiceNumber = splitList(dispute.invoiceNumbers)[0];
  if (!invoiceNumber) return out({ errors: ['למקרה אין מספר חשבונית'] });
  const { analysis } = await loadPriceAnalysis(client, invoiceNumber);
  if (!analysis) return out({ errors: [`החשבונית ${invoiceNumber} לא נמצאה`] });
  const res = await preparePriceRequest(client, { dispute, analysis, dryRun, nowIso: new Date().toISOString() });
  return { dryRun, approval: res.approval, replaced: res.replaced, writeVerified: !dryRun && res.writeVerified, errors: res.errors };
};
