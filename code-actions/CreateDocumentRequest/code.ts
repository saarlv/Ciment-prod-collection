import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { str } from '../shared/collections-data.ts';
import { clean } from '../shared/collections-mail.ts';
import { DOC_DISPUTE, prepareDocumentRequest, type RequestKind } from '../shared/collections-documents.ts';
import { CASE_CLOSED } from '../shared/collections-cases.ts';

// Internal draft to the logistics owner of a תעודת משלוח חסרה case's product line (ProductLineContacts):
// kind בקשה (first request) or תזכורת. Lands in Approvals (kind פנייה ללוגיסטיקה, status ממתין,
// relatedTable Disputes) and is never sent. A pending draft of the same kind for the case is replaced.
// Without an active logistics contact the draft is still written with an empty recipient and the reason
// says so. Lists customer, invoice, site, delivery dates and the missing note numbers.
export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const id = clean(input?.disputeId);
  const kindRaw = clean(input?.kind) || 'בקשה';
  const out = (o: Item) => ({ dryRun, approval: null, writeVerified: false, errors: [] as string[], ...o });
  if (!id) return out({ errors: ['חסר מזהה מקרה (disputeId)'] });
  if (kindRaw !== 'בקשה' && kindRaw !== 'תזכורת') return out({ errors: [`סוג פנייה לא מוכר: "${kindRaw}" (בקשה / תזכורת)`] });

  const client = new BlocksClient(context);
  let dispute: Item | undefined;
  try {
    dispute = (await client.getItem('Disputes', id))?.item;
  } catch {
    dispute = undefined;
  }
  if (!dispute) return out({ errors: [`המקרה ${id} לא נמצא`] });
  if (str(dispute.disputeType) !== DOC_DISPUTE) return out({ errors: [`המקרה ${str(dispute.disputeNumber) || id} אינו מסוג ${DOC_DISPUTE}`] });
  if (str(dispute.status) === CASE_CLOSED) return out({ errors: [`המקרה ${str(dispute.disputeNumber) || id} סגור`] });

  const res = await prepareDocumentRequest(client, { dispute, kind: kindRaw as RequestKind, dryRun, nowIso: new Date().toISOString(), reminderOf: str(dispute.openedAt) });
  return {
    dryRun,
    approval: res.approval,
    replaced: res.replaced,
    noContact: res.noContact,
    writeVerified: !dryRun && res.writeVerified,
    errors: res.errors,
  };
};
