import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { errText, splitList, str } from '../shared/collections-data.ts';
import { clean } from '../shared/collections-mail.ts';
import { CASE_CLOSED, formatIsraelDateTime } from '../shared/collections-cases.ts';
import { loadPriceAnalysis, PRICE_DISPUTE, ST_CREDIT, ST_MANAGER } from '../shared/collections-pricing.ts';
import { creditDraftNoteFor } from '../shared/collections-price-cases.ts';

// A bookkeeper records an approval given outside the app on a מחיר case. The rule is enforced here:
// - order: סוכן אישר first, then מנהל אישר; a second mark of the same step is refused
// - evidence (pasted email text or a link) is mandatory on every mark – whitespace is not evidence
// - who marked and when are stored (*ApprovedAt / *MarkedBy / *Evidence)
// After סוכן אישר → ממתינה לאישור מנהל; after מנהל אישר → ממתינה לזיכוי with creditDraftNote (the summary
// for the credit note a person creates in Priority). One Interactions row per mark. A refusal returns
// refused:true with the reason in Hebrew and writes nothing. Only people call it; Maya has no access.
export const STEP_AGENT = 'סוכן אישר';
export const STEP_MANAGER = 'מנהל אישר';

export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const id = clean(input?.disputeId);
  const step = clean(input?.step);
  const evidenceRaw = typeof input?.evidence === 'string' ? input.evidence : '';
  // zero-width / direction marks and any whitespace alone are not evidence
  const evidence = evidenceRaw.replace(/\r\n/g, '\n').replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '').trim();
  const markedBy = clean(input?.markedBy);
  const evidenceEmailId = clean(input?.evidenceInboundEmailId);
  const refuse = (reason: string, dispute: Item | null = null) => ({ dryRun, refused: true, reason, dispute, writeVerified: false, errors: [] as string[] });

  if (!id) return refuse('חסר מזהה מקרה (disputeId)');
  if (step !== STEP_AGENT && step !== STEP_MANAGER) return refuse(`שלב לא מוכר: "${step}" – "${STEP_AGENT}" או "${STEP_MANAGER}"`);
  if (!evidence) return refuse('חובה לצרף ראיה לאישור: טקסט המייל או קישור. לא נשמר דבר');
  if (!markedBy) return refuse('חסר שם המסמנת (markedBy)');

  const client = new BlocksClient(context);
  let d: Item | undefined;
  try {
    d = (await client.getItem('Disputes', id))?.item;
  } catch {
    d = undefined;
  }
  if (!d) return refuse(`המקרה ${id} לא נמצא`);
  if (str(d.disputeType) !== PRICE_DISPUTE) return refuse(`המקרה ${str(d.disputeNumber) || id} אינו מקרה מחיר`, d);
  if (str(d.status) === CASE_CLOSED) return refuse(`המקרה ${str(d.disputeNumber) || id} סגור`, d);

  const agentMarked = !!str(d.salesAgentApprovedAt);
  const managerMarked = !!str(d.salesManagerApprovedAt);
  if (step === STEP_AGENT && agentMarked) {
    return refuse(`אישור הסוכן כבר סומן על ידי ${str(d.salesAgentApprovalMarkedBy)} ב-${formatIsraelDateTime(d.salesAgentApprovedAt)}`, d);
  }
  if (step === STEP_MANAGER && !agentMarked) return refuse('אי אפשר לסמן "מנהל אישר" לפני "סוכן אישר" – קודם אישור הסוכן', d);
  if (step === STEP_MANAGER && managerMarked) {
    return refuse(`אישור המנהל כבר סומן על ידי ${str(d.salesManagerApprovalMarkedBy)} ב-${formatIsraelDateTime(d.salesManagerApprovedAt)}`, d);
  }

  // evidence from an email: keep a reference to it next to the pasted text / link
  let fullEvidence = evidence;
  if (evidenceEmailId) {
    let em: Item | undefined;
    try {
      em = (await client.getItem('InboundEmails', evidenceEmailId))?.item;
    } catch {
      em = undefined;
    }
    if (!em) return refuse(`מייל הראיה ${evidenceEmailId} לא נמצא`, d);
    fullEvidence = `${evidence}\n\nמקור: מייל מ-${str(em.fromName) || str(em.fromAddress)} (${str(em.fromAddress)}), ${formatIsraelDateTime(em.receivedAt)}${str(em.subject) ? `, "${str(em.subject)}"` : ''} [${str(em.messageId) || evidenceEmailId}]`;
  }

  const nowIso = new Date().toISOString();
  const invoice = splitList(d.invoiceNumbers).join(', ');
  let update: Item;
  if (step === STEP_AGENT) {
    update = { salesAgentApprovedAt: nowIso, salesAgentApprovalMarkedBy: markedBy, salesAgentApprovalEvidence: fullEvidence, status: ST_MANAGER, ballWith: 'סוכן מכירות' };
  } else {
    update = { salesManagerApprovedAt: nowIso, salesManagerApprovalMarkedBy: markedBy, salesManagerApprovalEvidence: fullEvidence, status: ST_CREDIT, ballWith: 'מנהלת חשבונות' };
    const { analysis } = await loadPriceAnalysis(client, splitList(d.invoiceNumbers)[0] ?? '');
    update.creditDraftNote = creditDraftNoteFor({ ...d, ...update }, analysis);
  }
  const who = step === STEP_AGENT ? str(d.salesAgentName) || 'הסוכן' : str(d.salesManagerName) || 'המנהל';
  const excerpt = evidence.replace(/\s+/g, ' ').slice(0, 160);
  const interaction: Item = {
    customerCode: str(d.customerCode),
    customerName: str(d.customerName) || null,
    occurredAt: nowIso,
    type: 'מחלוקת',
    direction: 'פנימי',
    actorName: markedBy,
    summary: `${step}: ${who} אישר את המחיר בחשבונית ${invoice} (מקרה ${str(d.disputeNumber)}), סומן על ידי ${markedBy}. ראיה: ${excerpt}${evidence.length > 160 ? '…' : ''}`,
    relatedInvoiceNumbers: invoice || null,
  };
  if (dryRun) return { dryRun, refused: false, reason: '', dispute: { ...d, ...update }, interaction, writeVerified: false, errors: [] };

  try {
    await client.updateItem('Disputes', String(d.id), update);
    const saved = (await client.createItem('Interactions', interaction))?.item;
    const back = (await client.getItem('Disputes', String(d.id)))?.item;
    const at = step === STEP_AGENT ? 'salesAgent' : 'salesManager';
    const writeVerified =
      !!back &&
      str(back.status) === update.status &&
      str(back[`${at}ApprovalMarkedBy`]) === markedBy &&
      str(back[`${at}ApprovalEvidence`]) === fullEvidence &&
      !!str(back[`${at}ApprovedAt`]) &&
      (step === STEP_AGENT || str(back.creditDraftNote) === update.creditDraftNote) &&
      !!saved?.id;
    return { dryRun, refused: false, reason: '', dispute: back ?? { ...d, ...update }, interaction: saved ?? interaction, writeVerified, errors: [] };
  } catch (e) {
    return { dryRun, refused: false, reason: '', dispute: d, writeVerified: false, errors: [`שמירת הסימון נכשלה: ${errText(e)}`] };
  }
};
