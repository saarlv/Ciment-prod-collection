// THE statement template (single source of truth) for the כרטסת and חובות פתוחים PDFs, in the layout of Yaniv's
// Priority printouts ("הדפסת חובות פתוחים ללקוח" and "כרטסת"). Used by GenerateStatementPdf, ApplyMailClassification
// and the open-debts batch (PrepareOpenDebtsBatch / RunMailAutomation), so a preview, a reply attachment and a batch
// PDF of the same data are the same document.
//
// Rendered by the platform HtmlToPdf action (WeasyPrint): self-contained HTML, tables only (no flex / grid / CSS
// variables / external stylesheets / image files), inline styles; a <style> block in <head> holds only @page and
// @font-face. The CIMENT wordmark is text + a CSS triangle (no image asset). Hebrew RTL page; every number, date
// and document number is wrapped in a left-to-right span so it reads correctly inside the RTL text. The
// "תצוגה – נכון ל-…" stamp and the page number are @page margin boxes, so they are printed on every page.
// Credit balances are shown as negative numbers, as in Priority.
import type { BlocksClient } from './blocks/blocks-client.ts';
import { diffDays, TZ } from './collections-dates.ts';
import { round2, str } from './collections-data.ts';
import type { LedgerResult, OpenDebtsResult, OpenDocument } from './collections-ledger.ts';

/** Alef (Hebrew + Latin + digits + ₪ ״ ׳ –), SIL OFL, from the Google Fonts repository. */
export const FONT_REGULAR_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/alef/Alef-Regular.ttf';
export const FONT_BOLD_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/alef/Alef-Bold.ttf';
const FONT_STACK = "'CimentAlef', 'Alef', 'DejaVu Sans', 'Arial', sans-serif";

// ---------- company details (Yaniv's printouts) ----------
export const COMPANY_NAME_HE = 'סימנט אי.אס. בע״מ';
export const COMPANY_NAME_EN = 'CIMENT I.S. LTD';
export const COMPANY_LINES: [string, string][] = [
  ['ת.ד.', '10630'],
  ['מפרץ חיפה', '2611702'],
  ['טלפון:', '04-8460570'],
  ['פקס:', '077-3179670'],
  ['עוסק מורשה:', '514745819'],
  ['מספר תיק במע״מ:', '514745819'],
  ['מס. תיק ניכויים:', '910842152'],
];
export const BRAND_BLUE = '#2C44A6';
/** Kept for the other documents that print a department header (collections-documents). */
export const COMPANY_HEADER = 'סימנט – מחלקת הנהלת חשבונות';
export const CURRENCY = 'ש״ח';

export type StatementKind = 'כרטסת' | 'חובות פתוחים';
export const KIND_TITLE: Record<StatementKind, string> = { כרטסת: 'כרטסת', 'חובות פתוחים': 'הדפסת חובות פתוחים ללקוח' };

/** Who signs the open-debts report: the owning bookkeeper, her role and mobile (TeamMembers.phone). */
export interface StatementSigner {
  name: string;
  role: string;
  phone: string;
}

export const esc = (v: unknown) =>
  str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A left-to-right island inside the RTL page (numbers, dates, document numbers, codes). */
export const ltr = (v: unknown) => `<span dir="ltr" style="unicode-bidi: embed">${esc(v)}</span>`;

const NUMBER_RUN = /[A-Za-z0-9](?:[A-Za-z0-9.,/:_-]*[A-Za-z0-9])?/g;

/** Free text (details, names): escaped, with every run that contains a digit kept left-to-right. */
export function mixed(v: unknown): string {
  const s = str(v);
  let out = '';
  let last = 0;
  for (const m of s.matchAll(NUMBER_RUN)) {
    if (!/\d/.test(m[0])) continue;
    out += esc(s.slice(last, m.index)) + ltr(m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  return out + esc(s.slice(last));
}

/** 17,369.60 / -1,589.45 (always two decimals, like Priority). */
export const amount2 = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(n) || 0);
const money = (n: number) => ltr(amount2(n));

/** dd/mm/yy (Priority's short date). */
export function ddmmyy(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y.slice(2)}`;
}

/** dd/mm/yyyy */
export function ddmmyyyy(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

const dateCell = (d: string | null) => (d ? ltr(ddmmyy(d)) : '');

/** d.m.yyyy without leading zeros. */
export function shortDateYear(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return `${d}.${m}.${y}`;
}

/** "תצוגה – נכון ל-21.10.2026" */
export const asOfLabel = (asOf: string) => `תצוגה – נכון ל-${shortDateYear(asOf)}`;

/** ASCII file name: kartesset-C1004-2026-10-21.pdf / open-debts-C1004-2026-10-21.pdf */
export function statementFileName(kind: StatementKind, customerCode: string, asOf: string): string {
  const code = str(customerCode).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'customer';
  return `${kind === 'כרטסת' ? 'kartesset' : 'open-debts'}-${code}-${asOf}.pdf`;
}

/** "22/10/26 10:51" in Israel time. */
export function printedStamp(at: Date = new Date()): string {
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (const part of fmt.formatToParts(at)) p[part.type] = part.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// ---------- layout pieces ----------

const BORDER = '1px solid #1f2937';
const CELL = `border: ${BORDER}; padding: 4px 5px; font-size: 9pt; vertical-align: middle;`;
const HEAD = `${CELL} font-weight: bold; text-align: center; background-color: #ffffff;`;
const NUM = `${CELL} text-align: left; white-space: nowrap;`;
const TXT = `${CELL} text-align: right;`;
const CTR = `${CELL} text-align: center;`;

function head(asOf: string, pageTitle: string): string {
  const stamp = asOfLabel(asOf);
  return `<head>
<meta charset="utf-8">
<title>${esc(pageTitle)}</title>
<style>
@font-face { font-family: 'CimentAlef'; src: url('${FONT_REGULAR_URL}') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'CimentAlef'; src: url('${FONT_BOLD_URL}') format('truetype'); font-weight: bold; font-style: normal; }
@page {
  size: A4;
  margin: 18mm 12mm 16mm 12mm;
  @top-left { content: "${stamp}"; font-family: ${FONT_STACK}; font-size: 9pt; font-weight: bold; color: #b42318; }
  @top-center { content: "${pageTitle}"; font-family: ${FONT_STACK}; font-size: 8.5pt; color: #374151; }
  @bottom-left { content: counter(page) "/" counter(pages); font-family: ${FONT_STACK}; font-size: 8pt; color: #4b5563; }
}
</style>
</head>`;
}

const wrap = (asOf: string, pageTitle: string, body: string) =>
  `<!DOCTYPE html>
<html dir="rtl" lang="he">
${head(asOf, pageTitle)}
<body dir="rtl" style="font-family: ${FONT_STACK}; color: #111827; font-size: 10pt; margin: 0; direction: rtl; text-align: right;">
${body}
</body>
</html>`;

/** The CIMENT wordmark: bold blue letters and the small arrow mark of the logo, drawn with text and CSS only. */
export function wordmark(sizePt = 34): string {
  const tri = Math.max(6, Math.round(sizePt / 3.4));
  return `<div dir="ltr" style="direction: ltr; unicode-bidi: embed; text-align: left; white-space: nowrap; color: ${BRAND_BLUE}; font-family: ${FONT_STACK}; font-weight: bold; font-size: ${sizePt}pt; letter-spacing: 2px; line-height: 1;">CIMENT<span style="display: inline-block; width: 0; height: 0; border-top: ${tri}px solid ${BRAND_BLUE}; border-left: ${tri}px solid transparent; margin-left: 3px; vertical-align: baseline;"></span></div>`;
}

/** Company block (right) + wordmark (left), then a thin rule – the top of Yaniv's open-debts printout. */
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

// ---------- open debts (חובות פתוחים) ----------

export interface AgingBucket {
  key: string;
  label: string;
  amount: number;
  count: number;
}

const daysLate = (d: OpenDocument, asOf: string) => (d.dueDate && d.dueDate < asOf ? diffDays(asOf, d.dueDate) : 0);

/** Debt by days past the payment date: עד 30, 31–60, 61–90, מעל 90 (and טרם הגיע מועד התשלום for documents not yet due). */
export function agingBuckets(docs: OpenDocument[], asOf: string): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: 'notDue', label: 'טרם הגיע מועד התשלום', amount: 0, count: 0 },
    { key: 'd30', label: 'עד 30 יום', amount: 0, count: 0 },
    { key: 'd60', label: '31–60 יום', amount: 0, count: 0 },
    { key: 'd90', label: '61–90 יום', amount: 0, count: 0 },
    { key: 'd90p', label: 'מעל 90 יום', amount: 0, count: 0 },
  ];
  for (const d of docs) {
    const late = daysLate(d, asOf);
    const b = late <= 0 ? buckets[0] : late <= 30 ? buckets[1] : late <= 60 ? buckets[2] : late <= 90 ? buckets[3] : buckets[4];
    b.amount = round2(b.amount + d.openAmount);
    b.count += 1;
  }
  return buckets;
}

/** Label with its numbers kept left-to-right ("31–60 יום"). */
const bucketLabel = (label: string) => label.replace(/(\d+–\d+|\d+)/g, (m) => ltr(m));

/** Closing lines of the open-debts report: Yaniv's wording, then the signer's name, role and mobile. */
export function openDebtsClosing(signer: StatementSigner | null): string[] {
  const phone = str(signer?.phone).trim();
  return [
    'שלום ,',
    'מצורף דוח חשבוניות פתוחות לבדיקה התאמה ומועדי תשלום',
    phone ? `לבירורים ניתן לפנות בחזרה למייל / נייד ${phone}` : 'לבירורים ניתן לפנות בחזרה למייל',
  ];
}

/** The signed amount of a document: a credit document shows its full amount as negative, like its open balance. */
const signedAmount = (d: OpenDocument) => (d.openAmount < 0 && d.amount > 0 ? -d.amount : d.amount || d.openAmount);

/** Short movement type: the ledger's docType when the mirror has it, else the document type. */
const movementOf = (d: OpenDocument) => d.movementType || (d.openAmount < 0 ? 'זיכוי' : d.documentType || 'חשבונית');

export function renderOpenDebtsHtml(data: OpenDebtsResult, asOf: string, opts: { signer?: StatementSigner | null } = {}): string {
  const signer = opts.signer ?? null;
  let running = 0;
  const rows = data.documents
    .map((d) => {
      running = round2(running + d.openAmount);
      const late = daysLate(d, asOf);
      return `<tr>
<td style="${CTR}">${dateCell(d.dueDate)}</td>
<td style="${NUM}">${late > 0 ? ltr(String(late)) : ''}</td>
<td style="${CTR}">${dateCell(d.invoiceDate)}</td>
<td style="${CTR}">${ltr(d.invoiceNumber)}</td>
<td style="${TXT}">${mixed(movementOf(d))}</td>
<td style="${TXT}">${mixed(d.details)}</td>
<td style="${NUM}">${money(signedAmount(d))}</td>
<td style="${NUM}">${money(d.openAmount)}</td>
<td style="${NUM}">${money(running)}</td>
<td style="${CTR}">${esc(CURRENCY)}</td>
</tr>`;
    })
    .join('\n');
  const total = round2(data.documents.reduce((s, d) => s + d.openAmount, 0));

  const buckets = agingBuckets(data.documents, asOf);
  const shown = buckets.filter((b) => b.count > 0);
  const agingCols = shown.length ? shown : buckets.filter((b) => b.key !== 'notDue');
  const agingTable = `<table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
<thead><tr>${agingCols.map((b) => `<th style="${HEAD}">${bucketLabel(esc(b.label))}</th>`).join('')}<th style="${HEAD}">סה״כ</th></tr></thead>
<tbody><tr>${agingCols.map((b) => `<td style="${CTR}">${money(b.amount)} ${esc(CURRENCY)}</td>`).join('')}<td style="${CTR}">${money(total)} ${esc(CURRENCY)}</td></tr></tbody>
</table>`;

  const closing = openDebtsClosing(signer)
    .map((l) => `<div>${mixed(l)}</div>`)
    .join('\n');
  const signerLine = signer?.name ? `<div style="margin-top: 12px;">${mixed(signer.name)} - ${esc(signer.role || 'מנהלת חשבונות')}</div>` : '';

  const body = `${companyHeader()}
<table style="width: 100%; border-collapse: collapse; margin-bottom: 6px;">
<tr>
<td style="text-align: right; vertical-align: top; padding: 0; font-weight: bold; font-size: 10pt; line-height: 1.45;">
<div>לכבוד:</div>
<div>${mixed(data.customerName || data.customerCode)}</div>
<div style="margin-top: 4px;">א.ג.נ.,</div>
</td>
<td style="text-align: left; vertical-align: top; padding: 0; font-weight: bold; font-size: 10pt; line-height: 1.45; width: 35%;">
<div>תאריך: ${ltr(ddmmyy(asOf))}</div>
<div>חשבון: ${ltr(data.customerCode)}</div>
</td>
</tr>
</table>
<div style="text-align: center; font-size: 14pt; margin: 12px 0 14px 0;"><span style="text-decoration: underline;">הנדון: חובות שטרם שולמו</span></div>
<div style="font-size: 10pt; margin-bottom: 3px;">${ltr('1.')} להלן פירוט החובות שטרם שולמו עד לתאריך: ${ltr(ddmmyy(asOf))}</div>
<table style="width: 100%; border-collapse: collapse;">
<thead>
<tr>
<th style="${HEAD} width: 9%;">תאריך תשלום</th>
<th style="${HEAD} width: 6%;">ימי פיגור</th>
<th style="${HEAD} width: 9%;">תאריך חשבונית</th>
<th style="${HEAD} width: 13%;">חשבונית</th>
<th style="${HEAD} width: 8%;">סוג תנועה</th>
<th style="${HEAD}">פרטים</th>
<th style="${HEAD} width: 11%;">סכום החשבונית</th>
<th style="${HEAD} width: 11%;">חוב לחשבונית</th>
<th style="${HEAD} width: 11%;">חוב מצטבר</th>
<th style="${HEAD} width: 5%;">מטבע</th>
</tr>
</thead>
<tbody>
${rows || `<tr><td style="${TXT}" colspan="10">אין חובות פתוחים</td></tr>`}
<tr>
<td style="${TXT} font-weight: bold;" colspan="7">סה״כ</td>
<td style="${NUM} font-weight: bold;">${money(total)}</td>
<td style="${NUM} font-weight: bold;">${money(total)}</td>
<td style="${CTR} font-weight: bold;">${esc(CURRENCY)}</td>
</tr>
</tbody>
</table>
<div style="font-size: 10pt; margin: 14px 0 3px 0;">${ltr('2.')} גיול חובות עד לתאריך: ${ltr(ddmmyy(asOf))}</div>
${agingTable}
<div style="margin-top: 22px; font-size: 10pt; line-height: 1.5;">
${closing}
${signerLine}
<div style="margin-top: 14px;">${esc(COMPANY_NAME_HE)}</div>
</div>`;
  return wrap(asOf, KIND_TITLE['חובות פתוחים'], body);
}

// ---------- ledger (כרטסת) ----------

const L_CELL = 'border: 1px solid #9ca3af; padding: 3px 4px; font-size: 8.5pt; vertical-align: middle;';
const L_HEAD = `${L_CELL} font-weight: bold; text-align: center; background-color: #dfe8f6; color: #1f2a44;`;
const L_NUM = `${L_CELL} text-align: left; white-space: nowrap;`;
const L_TXT = `${L_CELL} text-align: right;`;
const L_CTR = `${L_CELL} text-align: center;`;
const L_BAND = `${L_CELL} text-align: right; font-weight: bold; background-color: #fde5a7;`;
const L_TOTAL = 'background-color: #eef4fc; font-weight: bold;';

export function renderLedgerHtml(data: LedgerResult, asOf: string, opts: { signer?: StatementSigner | null; printedAt?: Date } = {}): string {
  const who = str(opts.signer?.name).trim() || 'מחלקת הנהלת חשבונות';
  const rows = data.entries
    .map(
      (e) => `<tr>
<td style="${L_CTR}">${dateCell(e.valueDate || e.entryDate)}</td>
<td style="${L_CTR}">${dateCell(e.entryDate)}</td>
<td style="${L_CTR}">${ltr(e.docNumber)}</td>
<td style="${L_CTR}"></td>
<td style="${L_TXT}">${mixed(e.details)}</td>
<td style="${L_CTR}"></td>
<td style="${L_TXT}">${mixed(e.docType)}</td>
<td style="${L_NUM}">${e.debit ? money(e.debit) : ''}</td>
<td style="${L_NUM}">${e.credit ? money(e.credit) : ''}</td>
<td style="${L_NUM}">${money(e.runningBalance)}</td>
<td style="${L_CTR}">${esc(CURRENCY)}</td>
</tr>`,
    )
    .join('\n');
  const params = `מתאריך ${ltr(ddmmyy(data.fromDate))}, עד תאריך ${ltr(ddmmyy(data.toDate))}, בחירת כרטסת כרטסת לקוחות, מטבע ${esc(CURRENCY)}, תאריך קובע תאריך ערך, חשבון ${ltr(data.customerCode)}`;
  const body = `<div style="text-align: center; font-size: 10pt; margin-bottom: 4px;">${esc(COMPANY_NAME_EN)}</div>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 4px;">
<tr>
<td style="text-align: right; vertical-align: top; padding: 0; font-size: 9pt; line-height: 1.45;">
<div><b>${ltr(COMPANY_NAME_EN)}</b>, ${mixed(who)}</div>
<div>${ltr(printedStamp(opts.printedAt ?? new Date()))}</div>
<div>${params}</div>
</td>
<td style="text-align: left; vertical-align: top; padding: 0; width: 30%;">${wordmark(22)}</td>
</tr>
</table>
<div style="text-align: center; font-weight: bold; font-size: 10.5pt;">כרטסת</div>
<div style="text-align: center; font-weight: bold; font-size: 9.5pt; margin-bottom: 6px;">נכון לתקופה: ${ltr(`${ddmmyyyy(data.toDate)}-${ddmmyyyy(data.fromDate)}`)}</div>
<table style="width: 100%; border-collapse: collapse;">
<thead>
<tr>
<th style="${L_HEAD} width: 8%;">תאריך ערך</th>
<th style="${L_HEAD} width: 8%;">תאריך למאזן</th>
<th style="${L_HEAD} width: 11%;">אסמכתא ${ltr('1')}</th>
<th style="${L_HEAD} width: 8%;">אסמכתא ${ltr('2')}</th>
<th style="${L_HEAD}">פרטים</th>
<th style="${L_HEAD} width: 8%;">חשבון נגדי</th>
<th style="${L_HEAD} width: 9%;">סוג תנועה</th>
<th style="${L_HEAD} width: 10%;">חובה</th>
<th style="${L_HEAD} width: 10%;">זכות</th>
<th style="${L_HEAD} width: 10%;">יתרה מצטברת</th>
<th style="${L_HEAD} width: 4%;">מט.</th>
</tr>
</thead>
<tbody>
<tr><td style="${L_BAND}" colspan="11">חשבון: ${ltr(data.customerCode)}, תאור חשבון: ${mixed(data.customerName || data.customerCode)}</td></tr>
<tr><td style="${L_BAND}" colspan="11">יתרת פתיחה: ${money(data.openingBalance)}</td></tr>
${rows || `<tr><td style="${L_TXT}" colspan="11">אין תנועות בתקופה</td></tr>`}
<tr>
<td style="${L_TXT} ${L_TOTAL}" colspan="7">סה״כ לחשבון: ${ltr(data.customerCode)}</td>
<td style="${L_NUM} ${L_TOTAL}">${money(data.totalDebit)}</td>
<td style="${L_NUM} ${L_TOTAL}">${money(data.totalCredit)}</td>
<td style="${L_NUM} ${L_TOTAL}">${money(data.closingBalance)}</td>
<td style="${L_CTR} ${L_TOTAL}">${esc(CURRENCY)}</td>
</tr>
</tbody>
</table>`;
  return wrap(asOf, COMPANY_NAME_EN, body);
}

export function renderStatementHtml(
  kind: StatementKind,
  data: LedgerResult | OpenDebtsResult,
  asOf: string,
  opts: { signer?: StatementSigner | null } = {},
): string {
  return kind === 'כרטסת' ? renderLedgerHtml(data as LedgerResult, asOf, opts) : renderOpenDebtsHtml(data as OpenDebtsResult, asOf, opts);
}

/** Converts the HTML with the platform HtmlToPdf action → the protected PDF url. */
export async function htmlToPdf(client: BlocksClient, html: string, pdfFilename: string): Promise<string> {
  const res: any = await client.invokeAction('HtmlToPdf', { html, pdfFilename });
  const url = str(res?.url ?? res?.output?.url ?? res?.data?.url);
  if (!url) throw new Error('HtmlToPdf did not return a url');
  return url;
}
