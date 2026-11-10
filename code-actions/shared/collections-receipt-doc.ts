// THE receipt document (single source of truth) – plan 04.11 part B, stage 4. GenerateReceiptPdf (preview / download)
// and IssueReceipt (the PDF attached to the mail draft to the customer's AP contact) both call generateReceiptPdf, so the
// file a person previews is the file the draft carries.
//
// Same visual language as the statement template (collections-statement.ts): rendered by the platform HtmlToPdf action
// (WeasyPrint) – self-contained HTML, tables only (no flex / grid / CSS variables / external stylesheets / images),
// inline styles, a <style> block in <head> holding only @font-face and @page. Hebrew RTL page; numbers, dates and codes
// in left-to-right spans. Until Priority is connected the receipt carries the stamp "הופק באפליקציה – טרם הונפק
// ב-Priority", and while it is not approved also "טיוטה – ממתינה לאישור" (both @page margin boxes + a box on the page).
// Writes no rows and sends nothing.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { israelDateOfInstant, toIsraelDate } from './collections-dates.ts';
import { errText, findCustomer, readAll, round2, str } from './collections-data.ts';
import { receiptKeyOf, RS_APPROVED, RS_ISSUED } from './collections-receipt-record.ts';
import { loadStatementSigner } from './collections-statement-pdf.ts';
import {
  amount2,
  BRAND_BLUE,
  COMPANY_LINES,
  COMPANY_NAME_HE,
  CURRENCY,
  ddmmyyyy,
  esc,
  FONT_BOLD_URL,
  FONT_REGULAR_URL,
  htmlToPdf,
  ltr,
  mixed,
  type StatementSigner,
  wordmark,
} from './collections-statement.ts';
import { MS_ON_ACCOUNT_SPREAD } from './collections-receipt-flow.ts';

const FONT_STACK = "'CimentAlef', 'Alef', 'DejaVu Sans', 'Arial', sans-serif";
export const STAMP_NOT_IN_PRIORITY = 'הופק באפליקציה – טרם הונפק ב-Priority';
export const STAMP_DRAFT = 'טיוטה – ממתינה לאישור';
export const RECEIPT_TITLE = 'קבלה';

export interface ReceiptDocView {
  receiptKey: string;
  receiptStatus: string;
  customerCode: string;
  customerName: string;
  companyId: string;
  /** the transfer's value date (YYYY-MM-DD) */
  valueDate: string | null;
  /** the date printed as the receipt date (preparedAt, else today) */
  receiptDate: string;
  amount: number;
  /** העברה בנקאית / זיכוי בנק */
  paymentMethod: string;
  reference: string;
  payerName: string;
  /** "על חשבון" until the allocation; else the matchStatus as is */
  allocationLabel: string;
  signer: StatementSigner | null;
  priorityReceiptNumber: string;
}

/** ASCII file name: receipt-RCPT-PL-123.pdf */
export function receiptFileName(receiptKey: string): string {
  const k = str(receiptKey).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'receipt';
  return `receipt-${k}.pdf`;
}

/** The payment method of a bank line type. */
export const paymentMethodOf = (lineType: unknown) => (str(lineType).trim() === 'זיכוי בנק' ? 'זיכוי בנק' : 'העברה בנקאית');

/** The allocation line on the receipt: on account until an allocation is approved (b/debt-allocation). */
export function allocationLabelOf(matchStatus: unknown): string {
  const ms = str(matchStatus).trim();
  if (!ms || ms === MS_ON_ACCOUNT_SPREAD || ms.startsWith('על חשבון')) return 'על חשבון';
  return ms;
}

export const isApprovedReceipt = (status: unknown) => [RS_APPROVED, RS_ISSUED].includes(str(status).trim());

const CELL = 'border: 1px solid #1f2937; padding: 6px 8px; font-size: 10pt; vertical-align: middle;';
const KEY = `${CELL} font-weight: bold; text-align: right; background-color: #eef2fb; width: 32%;`;
const VAL = `${CELL} text-align: right;`;

function head(view: ReceiptDocView): string {
  const draft = !isApprovedReceipt(view.receiptStatus);
  const stamps = [draft ? STAMP_DRAFT : '', view.receiptStatus === RS_ISSUED ? '' : STAMP_NOT_IN_PRIORITY].filter(Boolean).join(' · ');
  return `<head>
<meta charset="utf-8">
<title>${esc(`${RECEIPT_TITLE} ${view.receiptKey}`)}</title>
<style>
@font-face { font-family: 'CimentAlef'; src: url('${FONT_REGULAR_URL}') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'CimentAlef'; src: url('${FONT_BOLD_URL}') format('truetype'); font-weight: bold; font-style: normal; }
@page {
  size: A4;
  margin: 18mm 14mm 16mm 14mm;
  @top-left { content: "${stamps}"; font-family: ${FONT_STACK}; font-size: 9pt; font-weight: bold; color: #b42318; }
  @top-center { content: "${RECEIPT_TITLE}"; font-family: ${FONT_STACK}; font-size: 8.5pt; color: #374151; }
  @bottom-left { content: counter(page) "/" counter(pages); font-family: ${FONT_STACK}; font-size: 8pt; color: #4b5563; }
}
</style>
</head>`;
}

function companyHeader(): string {
  const lines = COMPANY_LINES.map(([k, v]) => `<div style="font-size: 9.5pt; font-weight: bold; line-height: 1.35;">${esc(k)} ${ltr(v)}</div>`).join('\n');
  return `<table style="width: 100%; border-collapse: collapse;">
<tr>
<td style="text-align: right; vertical-align: top; padding: 0; width: 55%;">
<div style="font-size: 14pt; font-weight: bold; margin-bottom: 3px;">${esc(COMPANY_NAME_HE)}</div>
${lines}
</td>
<td style="text-align: left; vertical-align: middle; padding: 0 0 0 4mm;">${wordmark(34)}</td>
</tr>
</table>
<div style="border-top: 1.5px solid #dbe4ee; margin: 8px 0 10px 0;"></div>`;
}

const row = (k: string, v: string) => `<tr><td style="${KEY}">${esc(k)}</td><td style="${VAL}">${v}</td></tr>`;

/** The receipt as one HTML page (WeasyPrint-safe). */
export function renderReceiptHtml(view: ReceiptDocView): string {
  const draft = !isApprovedReceipt(view.receiptStatus);
  const notIssued = view.receiptStatus !== RS_ISSUED;
  const stampBox = [draft ? STAMP_DRAFT : '', notIssued ? STAMP_NOT_IN_PRIORITY : '']
    .filter(Boolean)
    .map((s) => `<div style="border: 2px solid #b42318; color: #b42318; font-weight: bold; font-size: 11pt; padding: 4px 8px; margin-bottom: 6px; text-align: center;">${esc(s)}</div>`)
    .join('\n');
  const signer = view.signer;
  const phone = str(signer?.phone).trim();
  const body = `${companyHeader()}
<table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
<tr>
<td style="text-align: right; vertical-align: top; padding: 0; font-weight: bold; font-size: 10.5pt; line-height: 1.5;">
<div>לכבוד:</div>
<div>${mixed(view.customerName || view.customerCode)}</div>
<div>חשבון: ${ltr(view.customerCode)}</div>
${view.companyId ? `<div>ח.פ.: ${ltr(view.companyId)}</div>` : ''}
</td>
<td style="text-align: left; vertical-align: top; padding: 0; font-weight: bold; font-size: 10.5pt; line-height: 1.5; width: 40%;">
<div>תאריך: ${ltr(ddmmyyyy(view.receiptDate))}</div>
<div>מספר קבלה: ${ltr(view.receiptKey)}</div>
${view.priorityReceiptNumber ? `<div>מספר קבלה ב-Priority: ${ltr(view.priorityReceiptNumber)}</div>` : ''}
</td>
</tr>
</table>
<div style="text-align: center; font-size: 18pt; font-weight: bold; color: ${BRAND_BLUE}; margin: 10px 0 12px 0;">${esc(RECEIPT_TITLE)} ${ltr(view.receiptKey)}</div>
${stampBox}
<table style="width: 100%; border-collapse: collapse; margin-top: 6px;">
<tbody>
${row('סכום', `<b>${ltr(amount2(view.amount))} ${esc(CURRENCY)}</b>`)}
${row('אמצעי תשלום', esc(view.paymentMethod))}
${row('תאריך ערך', view.valueDate ? ltr(ddmmyyyy(view.valueDate)) : '')}
${row('אסמכתא בבנק', mixed(view.reference))}
${row('שם המעביר', mixed(view.payerName))}
${row('שיוך לחשבוניות', esc(view.allocationLabel))}
</tbody>
</table>
<table style="width: 100%; border-collapse: collapse; margin-top: 14px;">
<tr>
<td style="${CELL} font-weight: bold; text-align: right; background-color: #eef2fb;">סה״כ התקבל</td>
<td style="${CELL} font-weight: bold; text-align: left; width: 30%;">${ltr(amount2(view.amount))} ${esc(CURRENCY)}</td>
</tr>
</table>
<div style="margin-top: 26px; font-size: 10pt; line-height: 1.6;">
<div>תודה על התשלום.</div>
${phone ? `<div>לבירורים ניתן לפנות בחזרה למייל / נייד ${ltr(phone)}</div>` : '<div>לבירורים ניתן לפנות בחזרה למייל</div>'}
${signer?.name ? `<div style="margin-top: 12px;">${mixed(signer.name)} - ${esc(signer.role || 'מנהלת חשבונות')}</div>` : ''}
<div style="margin-top: 10px;">${esc(COMPANY_NAME_HE)}</div>
</div>`;
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
${head(view)}
<body dir="rtl" style="font-family: ${FONT_STACK}; color: #111827; font-size: 10pt; margin: 0; direction: rtl; text-align: right;">
${body}
</body>
</html>`;
}

/** The document view of a receipt row (with its bank line, customer and signer). Pure. */
export function receiptDocView(x: { receipt: Item; line?: Item | null; customer?: Item | null; signer?: StatementSigner | null; todayIso?: string }): ReceiptDocView {
  const r = x.receipt;
  const prepared = toIsraelDate(r.preparedAt);
  return {
    receiptKey: str(r.receiptKey),
    receiptStatus: str(r.receiptStatus).trim(),
    customerCode: str(r.customerCode),
    customerName: str(r.customerName) || str(x.customer?.customerName) || str(r.customerCode),
    companyId: str(x.customer?.companyId).trim(),
    valueDate: toIsraelDate(r.valueDate),
    receiptDate: prepared ?? israelDateOfInstant(new Date(x.todayIso ?? Date.now())),
    amount: round2(Math.abs(Number(r.amount) || 0)),
    paymentMethod: paymentMethodOf(x.line?.lineType),
    reference: str(r.reference ?? x.line?.reference),
    payerName: str(r.payerName ?? x.line?.payerName).replace(/\s+/g, ' ').trim(),
    allocationLabel: allocationLabelOf(r.matchStatus),
    signer: x.signer ?? null,
    priorityReceiptNumber: str(r.priorityReceiptNumber).trim(),
  };
}

export interface ReceiptPdfResult {
  url: string;
  fileName: string;
  receiptKey: string;
  customerCode: string;
  customerName: string;
  errors: string[];
}

/**
 * Loads the receipt (by receiptKey, or the row given), its bank line, customer and the customer's bookkeeper, renders
 * the one template and converts it with HtmlToPdf. Never throws: problems are in errors (url empty).
 */
export async function generateReceiptPdf(client: BlocksClient, x: { receiptKey?: string; receipt?: Item | null; customer?: Item | null; signer?: StatementSigner | null }): Promise<ReceiptPdfResult> {
  const key = str(x.receiptKey ?? x.receipt?.receiptKey).trim();
  const out: ReceiptPdfResult = { url: '', fileName: key ? receiptFileName(key) : '', receiptKey: key, customerCode: '', customerName: '', errors: [] };
  if (!key) {
    out.errors.push('חסר מספר קבלה (receiptKey)');
    return out;
  }
  try {
    const receipt = x.receipt ?? (await readAll(client, 'Receipts', { column: 'receiptKey', value: key })).sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0];
    if (!receipt) {
      out.errors.push(`הקבלה ${key} לא נמצאה`);
      return out;
    }
    const code = str(receipt.customerCode).trim();
    out.customerCode = code;
    out.customerName = str(receipt.customerName) || code;
    if (!code) {
      out.errors.push(`לקבלה ${key} אין לקוח`);
      return out;
    }
    const lineId = str(receipt.bankLineId).trim() || key.replace(/^RCPT-/, '');
    const [lines, customer] = await Promise.all([
      readAll(client, 'BankLines', { column: 'bankLineId', value: lineId }).catch(() => [] as Item[]),
      x.customer !== undefined ? Promise.resolve(x.customer ?? undefined) : findCustomer(client, code).catch(() => undefined),
    ]);
    const signer = x.signer !== undefined ? x.signer : await loadStatementSigner(client, code, customer ?? undefined).catch(() => null);
    const view = receiptDocView({ receipt, line: lines[0] ?? null, customer: customer ?? null, signer });
    out.customerName = view.customerName;
    const html = renderReceiptHtml(view);
    out.url = await htmlToPdf(client, html, out.fileName);
    return out;
  } catch (e) {
    out.errors.push(`הפקת ה-PDF נכשלה: ${errText(e)}`);
    return out;
  }
}

export { receiptKeyOf };
