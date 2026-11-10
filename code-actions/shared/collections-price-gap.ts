// Shared by AnalyzePriceGap and ApplyMailClassification (moved from AnalyzePriceGap/code.ts).
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { errText, readAll, splitList, str } from './collections-data.ts';
import { clean } from './collections-mail.ts';
import { allocateDisputeNumber, CASE_CLOSED, isTrue } from './collections-cases.ts';
import { analysisText, BALL_AGENT, loadPriceAnalysis, OPEN_PRICE_STATUSES, PRICE_DISPUTE, ST_AGENT } from './collections-pricing.ts';
import { preparePriceRequest } from './collections-price-cases.ts';

// 2d engine. Compares every line of the invoice with the price list valid on the invoice date (the
// customer's list first, then the site's) and tags a reason per gap line: מחירון לא עודכן, מחיר ידני,
// ללא חיוב. Shows the list source (לקוח / אתר), the line's price source, the manager approval status
// and the order's free text.
// - dryRun: the analysis only (read-only; the case page draws its table from it).
// - otherwise: one Disputes case per invoice (מחיר, ממתינה לאישור סוכן, disputedAmount = total gap,
//   description = the Hebrew analysis, sales agent + manager from SalesAgents, ball with סוכן מכירות)
//   and the internal approval-request draft (CreatePriceApprovalRequest, never sent). An open case is
//   updated, not duplicated; once an approval was marked the case's status and approvals are kept.
// An invoice of another customer than the email's / given one is refused and nothing is written.
// outcome: "נפתח מקרה מחיר" / "מקרה מחיר עודכן" / "אין פער" / "סורבה". Writes nothing to Priority.
export const OUT_OPENED = 'נפתח מקרה מחיר';
export const OUT_UPDATED = 'מקרה מחיר עודכן';
export const OUT_NO_GAP = 'אין פער';
export const OUT_REFUSED = 'סורבה';

export async function analyzePriceGap(client: BlocksClient, input: any) {
  const dryRun = input?.dryRun === true;
  const invoiceNumber = clean(input?.invoiceNumber);
  const emailId = clean(input?.inboundEmailId);
  const nowIso = new Date().toISOString();
  const base = (o: Item) => ({
    dryRun,
    invoiceNumber,
    customerCode: '',
    customerName: '',
    siteName: '',
    lines: [] as Item[],
    totalGap: 0,
    reasons: [] as string[],
    salesAgentName: '',
    salesManagerName: '',
    disputeId: null as string | null,
    approvalId: null as string | null,
    outcome: '',
    refused: false,
    refusalReason: '',
    writeVerified: false,
    errors: [] as string[],
    ...o,
  });
  if (!invoiceNumber) return base({ errors: ['חסר מספר חשבונית (invoiceNumber)'] });

  let email: Item | null = null;
  if (emailId) {
    try {
      email = (await client.getItem('InboundEmails', emailId))?.item ?? null;
    } catch {
      email = null;
    }
    if (!email) return base({ errors: [`המייל ${emailId} לא נמצא`] });
  }
  const { invoice, analysis } = await loadPriceAnalysis(client, invoiceNumber);
  if (!invoice || !analysis) return base({ errors: [`החשבונית ${invoiceNumber} לא נמצאה`] });

  const requestCode = clean(input?.customerCode) || str(email?.customerCode).trim();
  if (requestCode && analysis.customerCode !== requestCode) {
    return base({
      customerCode: requestCode,
      outcome: OUT_REFUSED,
      refused: true,
      refusalReason: `החשבונית ${invoiceNumber} אינה של הלקוח ${requestCode} – לא נותחה ולא נפתח מקרה`,
      writeVerified: true,
    });
  }
  const isTest = analysis.isTestFixture || isTrue(email?.isTestFixture);
  const view = base({
    customerCode: analysis.customerCode,
    customerName: analysis.customerName,
    invoiceDate: analysis.invoiceDate,
    siteName: analysis.siteName,
    lines: analysis.lines,
    totalGap: analysis.totalGap,
    underchargedTotal: analysis.underchargedTotal,
    reasons: analysis.reasons,
    salesAgentName: analysis.salesAgentName,
    salesManagerName: analysis.salesManagerName,
    salesAgentFound: analysis.salesAgentFound,
    analysisText: analysisText(analysis),
    isTestFixture: isTest,
  });

  const disputes = await readAll(client, 'Disputes');
  const existing =
    disputes
      .filter((d) => str(d.disputeType) === PRICE_DISPUTE && str(d.status) !== CASE_CLOSED && splitList(d.invoiceNumbers).includes(invoiceNumber))
      .sort((a, b) => Number(a.id) - Number(b.id))[0] ?? null;
  if (existing) Object.assign(view, { disputeId: String(existing.id), disputeNumber: str(existing.disputeNumber), caseStatus: str(existing.status) });

  if (!analysis.hasGap) {
    return { ...view, outcome: OUT_NO_GAP, writeVerified: !dryRun };
  }
  if (dryRun) return { ...view, outcome: existing ? OUT_UPDATED : OUT_OPENED };

  const refresh = !existing || OPEN_PRICE_STATUSES.includes(str(existing.status));
  const row: Item = {
    customerCode: analysis.customerCode,
    customerName: analysis.customerName,
    disputeType: PRICE_DISPUTE,
    invoiceNumbers: invoiceNumber,
    disputedAmount: analysis.totalGap,
    description: analysisText(analysis),
    ownerBookkeeperName: analysis.bookkeeperName || str(email?.assignedBookkeeperName) || null,
    salesAgentName: analysis.salesAgentName || null,
    salesManagerName: analysis.salesManagerName || null,
    inboundEmailId: str(existing?.inboundEmailId) || str(email?.messageId) || null,
    isTestFixture: isTest,
  };
  if (refresh) Object.assign(row, { status: ST_AGENT, ballWith: BALL_AGENT });
  if (!existing) {
    Object.assign(row, {
      disputeNumber: allocateDisputeNumber(new Set(disputes.map((d) => str(d.disputeNumber)).filter(Boolean)), isTest),
      openedAt: nowIso,
      closedAt: null,
      resolution: null,
      salesAgentApprovedAt: null,
      salesAgentApprovalMarkedBy: null,
      salesAgentApprovalEvidence: null,
      salesManagerApprovedAt: null,
      salesManagerApprovalMarkedBy: null,
      salesManagerApprovalEvidence: null,
      creditDraftNote: null,
    });
  }
  const errors: string[] = [];
  try {
    const saved = existing
      ? (await client.updateItem('Disputes', String(existing.id), row))?.item
      : (await client.createItem('Disputes', row))?.item;
    const id = String(saved?.id ?? existing?.id ?? '');
    const back = id ? (await client.getItem('Disputes', id))?.item : null;
    let verified = !!back && str(back.disputeType) === PRICE_DISPUTE && Number(back.disputedAmount) === analysis.totalGap && str(back.invoiceNumbers) === invoiceNumber;
    const dispute = back ?? { ...existing, ...row, id };
    let approvalId: string | null = null;
    let requestNote = '';
    if (str(dispute.status) === ST_AGENT) {
      const req = await preparePriceRequest(client, { dispute, analysis, dryRun: false, nowIso });
      errors.push(...req.errors);
      approvalId = req.approval?.id ? String(req.approval.id) : null;
      if (!req.writeVerified) verified = false;
    } else {
      requestNote = `המקרה כבר בסטטוס ${str(dispute.status)} – הניתוח עודכן, בקשת האישור לא נוצרה מחדש`;
    }
    return {
      ...view,
      disputeId: id,
      disputeNumber: str(dispute.disputeNumber),
      caseStatus: str(dispute.status),
      approvalId,
      note: requestNote,
      outcome: existing ? OUT_UPDATED : OUT_OPENED,
      writeVerified: verified && errors.length === 0,
      errors,
    };
  } catch (e) {
    return { ...view, outcome: '', errors: [`שמירת מקרה המחיר נכשלה: ${errText(e)}`] };
  }
}
