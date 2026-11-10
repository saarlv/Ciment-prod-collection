// 2d writers shared by AnalyzePriceGap and CreatePriceApprovalRequest: the internal approval-request draft
// to the sales agent and the agent's manager (Approvals kind בקשת אישור מחיר, never sent), and the
// credit-note summary MarkPriceApproval stores after both approvals.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { errText, formatIls, splitList, str } from './collections-data.ts';
import { joinLines, signBody } from './collections-mail.ts';
import { AGENT_MAYA, emailByMessageId, formatIsraelDateTime, isTestCase, mailboxOf, PENDING, pendingCaseDrafts, quoteEmail, readTeam } from './collections-cases.ts';
import { formatDateHe } from './collections-dates.ts';
import { C_PRICES, saveOutboxDraft } from './collections-outbox.ts';
import { KIND_PRICE, type PriceAnalysis, type PriceLine } from './collections-pricing.ts';

function attachmentList(raw: unknown): string[] {
  const s = str(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map((x) => str(x).trim()).filter(Boolean);
  } catch {
    // one url per line
  }
  return s.split(/\n/).map((x) => x.trim()).filter(Boolean);
}

/** The per-line table as plain text (the draft is plain text). */
export function priceTableText(lines: PriceLine[]): string {
  const rows = lines.map((l, i) => {
    const list = l.listPrice === null ? 'אין מחיר במחירון' : `${formatIls(l.listPrice)} ₪ (מחירון ${l.listSource ?? ''}${l.priceListCode ? ` ${l.priceListCode}` : ''}${l.validFrom ? `, מ-${formatDateHe(l.validFrom)}` : ''})`;
    const cur = l.currentListPrice !== null && l.listPrice !== null && Math.abs(l.currentListPrice - l.listPrice) >= 0.005 ? ` · עדכני ${formatIls(l.currentListPrice)} ₪` : '';
    const gap = l.reason ? `פער ${formatIls(l.gapPerUnit)} ₪ ליח׳ = ${formatIls(l.gapTotal)} ₪ · ${l.reason}` : l.explanation;
    const ft = l.freeText ? `\n   טקסט חופשי בהזמנה: "${l.freeText}"` : '';
    return `${i + 1}. ${l.itemName || l.sku}${l.sku ? ` (${l.sku})` : ''} | כמות ${formatIls(l.quantity)} | בחשבונית ${formatIls(l.unitPrice)} ₪ (${l.priceSource || '—'}${l.managerApprovalStatus ? `, ${l.managerApprovalStatus}` : ''}) | ${list}${cur} | ${gap}${ft}`;
  });
  return rows.join('\n');
}

export interface PriceRequestResult {
  approval: Item | null;
  replaced: boolean;
  writeVerified: boolean;
  errors: string[];
}

/** Creates or (while ממתין) replaces the approval request of a מחיר case. */
export async function preparePriceRequest(
  client: BlocksClient,
  args: { dispute: Item; analysis: PriceAnalysis; dryRun: boolean; nowIso: string },
): Promise<PriceRequestResult> {
  const { dispute, analysis: a, dryRun, nowIso } = args;
  const out: PriceRequestResult = { approval: null, replaced: false, writeVerified: false, errors: [] };
  const [email, team, drafts] = await Promise.all([
    emailByMessageId(client, str(dispute.inboundEmailId)),
    readTeam(client),
    dispute.id ? pendingCaseDrafts(client, String(dispute.id), KIND_PRICE) : Promise.resolve([] as Item[]),
  ]);
  const existing = drafts.find((d) => str(d.status) === PENDING) ?? null;
  const bookkeeper = str(dispute.ownerBookkeeperName) || a.bookkeeperName;
  const agent = str(dispute.salesAgentName) || a.salesAgentName;
  const manager = str(dispute.salesManagerName) || a.salesManagerName;
  const names = [agent, manager].filter(Boolean);
  const contacts = [a.salesAgentEmail, a.salesManagerEmail].filter(Boolean);
  const invoice = splitList(dispute.invoiceNumbers)[0] || a.invoiceNumber;
  const tagged = a.lines.filter((l) => l.reason);

  const body = signBody(
    [
      names.length ? `שלום ${names.join(' ו')},` : 'שלום,',
      '',
      `${a.customerName} (${a.customerCode}) פנה בעניין המחיר בחשבונית ${invoice}${a.invoiceDate ? ` מ-${formatDateHe(a.invoiceDate)}` : ''}${a.siteName ? `, אתר ${a.siteName}` : ''}.`,
      'השוואה לכל שורה מול המחירון שהיה בתוקף בתאריך החשבונית (קודם מחירון הלקוח, אחר כך מחירון האתר):',
      '',
      priceTableText(a.lines),
      '',
      `סה״כ פער לזיכוי: ${formatIls(a.totalGap)} ₪${a.underchargedTotal ? ` · ללא חיוב: ${formatIls(a.underchargedTotal)} ₪` : ''}`,
      a.reasons.length ? `סיבות: ${a.reasons.join(', ')}` : '',
      '',
      `נבקש אישור לזיכוי${tagged.length ? ` של ${tagged.length === 1 ? 'השורה' : `${tagged.length} השורות`} עם הפער` : ''}: קודם אישור הסוכן${agent ? ` (${agent})` : ''}, ואחריו אישור המנהל${manager ? ` (${manager})` : ''}. אפשר להשיב למייל הזה; את האישור נרשום במערכת עם המייל כראיה.`,
      ...(email ? ['', quoteEmail(email)] : []),
    ]
      .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
      .join('\n'),
    bookkeeper,
  );
  const missing: string[] = [];
  if (!a.salesAgentFound) missing.push(`הסוכן ${agent || '(לא ידוע)'} לא נמצא בטבלת אנשי המכירות – אין כתובת ואין מנהל`);
  else {
    if (!a.salesAgentEmail) missing.push('לסוכן אין כתובת מייל');
    if (!manager) missing.push('לסוכן לא רשום מנהל');
    else if (!a.salesManagerEmail) missing.push('למנהל אין כתובת מייל');
  }
  const draft: Item = {
    customerCode: a.customerCode || null,
    customerName: a.customerName || null,
    kind: KIND_PRICE,
    recipientName: names.join(', ') || null,
    recipientContact: contacts.join(', ') || null,
    subject: `בקשת אישור מחיר – חשבונית ${invoice} (${a.customerName})`,
    body,
    reason: `פער מחיר בחשבונית ${invoice}: ${formatIls(a.totalGap)} ₪ (${a.reasons.join(', ') || 'ללא סיבה'}). נדרש אישור סוכן ואחריו מנהל${missing.length ? `. ${missing.join('; ')}` : ''}`,
    status: PENDING,
    draftedBy: AGENT_MAYA,
    draftedAt: nowIso,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    relatedTable: 'Disputes',
    relatedId: dispute.id ? String(dispute.id) : null,
    fromMailbox: mailboxOf(team, bookkeeper) || str(email?.mailbox) || null,
    attachmentUrls: joinLines(attachmentList(email?.attachmentUrls)),
    batchId: null,
    inboundEmailId: null,
    isTestFixture: isTestCase(dispute),
  };
  out.replaced = !!existing;
  if (dryRun) {
    out.approval = existing ? { ...existing, ...draft } : draft;
    return out;
  }
  try {
    const saved = await saveOutboxDraft(client, draft, { component: C_PRICES, existing, mailboxId: str(email?.mailboxId) || null });
    const back = saved.item;
    out.approval = back ?? draft;
    out.writeVerified = !!back && str(back.kind) === KIND_PRICE && str(back.status) === PENDING && str(back.relatedId) === String(dispute.id) && str(back.body) === body;
  } catch (e) {
    out.approval = draft;
    out.errors.push(`שמירת בקשת האישור נכשלה: ${errText(e)}`);
  }
  return out;
}

/** The summary for the credit note a person creates in Priority (stored on Disputes.creditDraftNote). */
export function creditDraftNoteFor(d: Item, a: PriceAnalysis | null): string {
  const invoice = splitList(d.invoiceNumbers).join(', ') || a?.invoiceNumber || '';
  const tagged = (a?.lines ?? []).filter((l) => l.reason && l.gapTotal > 0);
  const total = a ? a.totalGap : Number(d.disputedAmount) || 0;
  const lines = tagged.length
    ? tagged.map((l) => `• ${l.itemName || l.sku}${l.sku ? ` (${l.sku})` : ''}: ${formatIls(l.quantity)} יח׳ × ${formatIls(l.gapPerUnit)} ₪ = ${formatIls(l.gapTotal)} ₪ (חויב ${formatIls(l.unitPrice)} ₪ במקום ${formatIls(l.listPrice ?? 0)} ₪ – ${l.reason})`)
    : [`• סכום המחלוקת: ${formatIls(total)} ₪`];
  return [
    `זיכוי לחשבונית ${invoice} – ${str(d.customerName)} (${str(d.customerCode)})`,
    'שורות לזיכוי:',
    ...lines,
    `סה״כ לזיכוי: ${formatIls(total)} ₪`,
    `אישור סוכן: ${str(d.salesAgentName) || 'הסוכן'} – סומן על ידי ${str(d.salesAgentApprovalMarkedBy)} ב-${formatIsraelDateTime(d.salesAgentApprovedAt)}`,
    `אישור מנהל: ${str(d.salesManagerName) || 'המנהל'} – סומן על ידי ${str(d.salesManagerApprovalMarkedBy)} ב-${formatIsraelDateTime(d.salesManagerApprovedAt)}`,
    `מקרה ${str(d.disputeNumber)}. את חשבונית הזיכוי יוצרת מנהלת החשבונות ב-Priority; המערכת לא כותבת ל-Priority.`,
  ].join('\n');
}
