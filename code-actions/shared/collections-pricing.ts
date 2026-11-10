// 2d – price gaps. Shared by AnalyzePriceGap, CreatePriceApprovalRequest and MarkPriceApproval.
//
// Every invoice line is compared with the price list valid on the invoice date: the customer's list
// first (PriceListItems.customerCode = the customer, or priceListCode = Customers.priceListCode), then
// the site's list (siteName of the invoice's delivery notes). Reason per gap line:
// - ללא חיוב: a zero price on a delivered quantity
// - מחיר ידני: a manual / order price that differs from the list and is not approved
// - מחירון לא עודכן: the line charged an expired list price while a newer one applies
// Read-only: nothing here writes, and nothing is ever written to Priority.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';
import { formatDateHe, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, findCustomer, formatIls, num, ownerOf, readAll, round2, str } from './collections-data.ts';

export const PRICE_DISPUTE = 'מחיר';
export const ST_AGENT = 'ממתינה לאישור סוכן';
export const ST_MANAGER = 'ממתינה לאישור מנהל';
export const ST_CREDIT = 'ממתינה לזיכוי';
/** Statuses in which the analysis may still be refreshed and the request redrafted. */
export const OPEN_PRICE_STATUSES = ['פתוחה', 'בטיפול', ST_AGENT];
export const KIND_PRICE = 'בקשת אישור מחיר';
export const BALL_AGENT = 'סוכן מכירות';

export const R_STALE = 'מחירון לא עודכן';
export const R_MANUAL = 'מחיר ידני';
export const R_ZERO = 'ללא חיוב';
export const REASONS = [R_STALE, R_MANUAL, R_ZERO];

export const LIST_CUSTOMER = 'לקוח';
export const LIST_SITE = 'אתר';

const EPS = 0.005;

/** Priority's manager approval says approved ("אושר" / "מאושר"…), not "לא אושר" / "לא נדרש". */
export const isApprovedPrice = (v: unknown) => /^(אושר|מאושר)/.test(str(v).trim());

const day = (v: unknown) => toIsraelDate(v);

function validOn(e: Item, date: string): boolean {
  const from = day(e.validFrom);
  const to = day(e.validTo);
  return (!from || from <= date) && (!to || to >= date);
}

const latestFirst = (a: Item, b: Item) => str(day(b.validFrom)).localeCompare(str(day(a.validFrom))) || Number(b.id ?? 0) - Number(a.id ?? 0);

export interface PriceLine {
  lineKey: string;
  orderNumber: string | null;
  sku: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  listPrice: number | null;
  listSource: string | null;
  priceListCode: string | null;
  validFrom: string | null;
  validTo: string | null;
  currentListPrice: number | null;
  currentValidFrom: string | null;
  priceSource: string;
  managerApprovalStatus: string;
  freeText: string | null;
  gapPerUnit: number;
  gapTotal: number;
  reason: string | null;
  explanation: string;
}

export interface PriceAnalysis {
  invoiceNumber: string;
  invoiceDate: string | null;
  customerCode: string;
  customerName: string;
  siteName: string;
  lines: PriceLine[];
  /** Overcharge on the tagged lines – what a credit note would return. */
  totalGap: number;
  /** Zero / under-priced amount on the tagged lines (shown, never credited). */
  underchargedTotal: number;
  reasons: string[];
  salesAgentName: string;
  salesAgentEmail: string;
  salesManagerName: string;
  salesManagerEmail: string;
  salesAgentFound: boolean;
  bookkeeperName: string;
  isTestFixture: boolean;
  hasGap: boolean;
}

export function analyzeLines(x: {
  invoice: Item;
  lines: Item[];
  customer: Item | undefined;
  priceItems: Item[];
  siteNames: string[];
}): { lines: PriceLine[]; totalGap: number; underchargedTotal: number; reasons: string[] } {
  const code = str(x.invoice.customerCode);
  const date = day(x.invoice.invoiceDate) ?? day(x.invoice.dueDate) ?? '';
  const listCode = str(x.customer?.priceListCode).trim();
  const sites = new Set(x.siteNames.map((s) => s.trim()).filter(Boolean));
  const isCustomerList = (e: Item) => !str(e.siteName).trim() && (str(e.customerCode) === code || (!!listCode && str(e.priceListCode) === listCode));
  const isSiteList = (e: Item) => !!str(e.siteName).trim() && sites.has(str(e.siteName).trim()) && (!str(e.customerCode) || str(e.customerCode) === code);

  const out: PriceLine[] = [];
  for (const l of [...x.lines].sort((a, b) => str(a.lineKey).localeCompare(str(b.lineKey), 'en', { numeric: true }))) {
    const sku = str(l.sku).trim();
    const qty = num(l.quantity);
    const unit = num(l.unitPrice);
    const priceSource = str(l.priceSource).trim();
    const approval = str(l.managerApprovalStatus).trim();
    const ofSku = x.priceItems.filter((e) => str(e.sku).trim() === sku);
    const customerEntries = ofSku.filter(isCustomerList).sort(latestFirst);
    const siteEntries = ofSku.filter(isSiteList).sort(latestFirst);
    let source: string | null = null;
    let entries: Item[] = [];
    let valid = date ? customerEntries.find((e) => validOn(e, date)) : undefined;
    if (valid) {
      source = LIST_CUSTOMER;
      entries = customerEntries;
    } else {
      valid = date ? siteEntries.find((e) => validOn(e, date)) : undefined;
      if (valid) {
        source = LIST_SITE;
        entries = siteEntries;
      }
    }
    const current = entries[0] ?? null;
    const listPrice = valid ? num(valid.price) : null;
    const gapPerUnit = listPrice === null ? 0 : round2(unit - listPrice);
    const gapTotal = round2(gapPerUnit * qty);
    const stale = valid
      ? entries.find((e) => e !== valid && Math.abs(num(e.price) - unit) < EPS && (day(e.validTo) ?? '9999-12-31') < date)
      : undefined;

    let reason: string | null = null;
    let explanation = '';
    const listText = listPrice === null ? '' : `${formatIls(listPrice)} ₪ במחירון ה${source} ${str(valid?.priceListCode)}`.trim();
    if (qty > 0 && Math.abs(unit) < EPS && (listPrice === null || listPrice > 0)) {
      if (isApprovedPrice(approval)) explanation = 'ללא חיוב באישור מנהל';
      else {
        reason = R_ZERO;
        explanation = `השורה לא חויבה${listText ? ` (המחיר במחירון ${listText})` : ''}`;
      }
    } else if (listPrice === null) {
      explanation = date ? `לא נמצא מחיר בתוקף ל-${formatDateHe(date)} במחירון הלקוח או האתר` : 'לחשבונית אין תאריך – אי אפשר לבדוק מחירון';
    } else if (Math.abs(gapPerUnit) < EPS) {
      explanation = 'תואם למחירון';
    } else if (isApprovedPrice(approval) && priceSource !== 'מחירון') {
      explanation = `מחיר ${priceSource || 'ידני'} שאושר על ידי מנהל (${approval})`;
    } else if (priceSource === 'ידני') {
      reason = R_MANUAL;
      explanation = `מחיר ידני ${formatIls(unit)} ₪ מול ${listText}, לא אושר${approval ? ` (${approval})` : ''}`;
    } else if (stale || priceSource === 'מחירון') {
      reason = R_STALE;
      explanation = stale
        ? `חויב ${formatIls(unit)} ₪ לפי מחירון שפג תוקפו${day(stale.validTo) ? ` ב-${formatDateHe(day(stale.validTo)!)}` : ''}; בתאריך החשבונית בתוקף ${listText}`
        : `חויב ${formatIls(unit)} ₪ לפי מחירון, אבל בתאריך החשבונית בתוקף ${listText}`;
    } else {
      reason = R_MANUAL;
      explanation = `מחיר מההזמנה ${formatIls(unit)} ₪ מול ${listText}, לא אושר${approval ? ` (${approval})` : ''}`;
    }

    out.push({
      lineKey: str(l.lineKey),
      orderNumber: str(l.orderNumber) || null,
      sku,
      itemName: str(l.itemName),
      quantity: qty,
      unitPrice: unit,
      lineTotal: num(l.lineTotal),
      listPrice,
      listSource: source,
      priceListCode: valid ? str(valid.priceListCode) || null : null,
      validFrom: valid ? day(valid.validFrom) : null,
      validTo: valid ? day(valid.validTo) : null,
      currentListPrice: current ? num(current.price) : null,
      currentValidFrom: current ? day(current.validFrom) : null,
      priceSource,
      managerApprovalStatus: approval,
      freeText: str(l.freeText).trim() || null,
      gapPerUnit,
      gapTotal: reason === R_ZERO && listPrice !== null ? round2(-listPrice * qty) : gapTotal,
      reason,
      explanation,
    });
  }
  const tagged = out.filter((l) => l.reason);
  const totalGap = round2(tagged.filter((l) => l.gapTotal > 0).reduce((s, l) => s + l.gapTotal, 0));
  const underchargedTotal = round2(-tagged.filter((l) => l.gapTotal < 0).reduce((s, l) => s + l.gapTotal, 0));
  const reasons = REASONS.filter((r) => tagged.some((l) => l.reason === r));
  return { lines: out, totalGap, underchargedTotal, reasons };
}

/** Loads one invoice with everything the comparison needs and analyzes it (read-only). */
export async function loadPriceAnalysis(client: BlocksClient, invoiceNumber: string): Promise<{ invoice: Item | null; customer: Item | undefined; analysis: PriceAnalysis | null }> {
  const no = str(invoiceNumber).trim();
  const [invRows, lines, notes] = await Promise.all([
    readAll(client, 'Invoices', { column: 'invoiceNumber', value: no }),
    readAll(client, 'InvoiceLines', { column: 'invoiceNumber', value: no }),
    readAll(client, 'DeliveryNotes', { column: 'invoiceNumber', value: no }),
  ]);
  const invoice = invRows.sort((a, b) => Number(a.id) - Number(b.id))[0] ?? null;
  if (!invoice) return { invoice: null, customer: undefined, analysis: null };
  const code = str(invoice.customerCode);
  const siteNames = [...new Set(notes.map((n) => str(n.siteName).trim()).filter(Boolean))];
  const [customer, owners, agents] = await Promise.all([
    code ? findCustomer(client, code) : Promise.resolve(undefined),
    code ? readAll(client, 'CustomerOwners', { column: 'customerCode', value: code }) : Promise.resolve([] as Item[]),
    readAll(client, 'SalesAgents').catch(() => [] as Item[]),
  ]);
  const or: WhereClause[] = [{ column: 'customerCode', value: code }];
  if (str(customer?.priceListCode).trim()) or.push({ column: 'priceListCode', value: str(customer?.priceListCode).trim() });
  if (siteNames.length) or.push({ column: 'siteName', operator: 'in', value: siteNames });
  const priceItems = await readAll(client, 'PriceListItems', { or });
  const res = analyzeLines({ invoice, lines, customer, priceItems, siteNames });

  const agentName = str(invoice.salesAgentName).trim() || str(customer?.salesAgentName).trim() || str(lines.find((l) => str(l.salesAgentName).trim())?.salesAgentName).trim();
  const isTest = false;
  const active = agents.filter((a) => str(a.agentName).trim() === agentName && a.active !== false && a.active !== 'false');
  const agent = active.find((a) => (a.isTestFixture === true || a.isTestFixture === 'true') === isTest) ?? active[0] ?? null;
  return {
    invoice,
    customer,
    analysis: {
      invoiceNumber: no,
      invoiceDate: day(invoice.invoiceDate),
      customerCode: code,
      customerName: str(customer?.customerName) || str(invoice.customerName),
      siteName: siteNames.join(', '),
      ...res,
      salesAgentName: agentName,
      salesAgentEmail: str(agent?.email).trim().toLowerCase(),
      salesManagerName: str(agent?.managerName).trim(),
      salesManagerEmail: str(agent?.managerEmail).trim().toLowerCase(),
      salesAgentFound: !!agent,
      bookkeeperName: ownerOf(code, customer, buildOwnerMap(owners)),
      isTestFixture: isTest,
      hasGap: res.reasons.length > 0,
    },
  };
}

// ---------- texts ----------

export function lineSentence(l: PriceLine): string {
  const src = l.listSource ? `מחירון ${l.listSource}${l.priceListCode ? ` ${l.priceListCode}` : ''}${l.validFrom ? `, בתוקף מ-${formatDateHe(l.validFrom)}` : ''}` : 'אין מחירון';
  const parts = [
    `${l.itemName || l.sku}${l.sku ? ` (${l.sku})` : ''}: ${formatIls(l.quantity)} × ${formatIls(l.unitPrice)} ₪ (${l.priceSource || 'מקור לא ידוע'}${l.managerApprovalStatus ? `, ${l.managerApprovalStatus}` : ''})`,
    l.listPrice === null ? src : `מול ${formatIls(l.listPrice)} ₪ – ${src}`,
  ];
  if (l.currentListPrice !== null && l.listPrice !== null && Math.abs(l.currentListPrice - l.listPrice) >= EPS) parts.push(`המחיר העדכני ${formatIls(l.currentListPrice)} ₪`);
  if (l.reason) parts.push(`פער ${formatIls(l.gapPerUnit)} ₪ ליחידה, ${formatIls(l.gapTotal)} ₪ בשורה – ${l.reason}`);
  else parts.push(l.explanation);
  if (l.freeText) parts.push(`טקסט חופשי בהזמנה: "${l.freeText}"`);
  return `• ${parts.join(' · ')}`;
}

export function analysisText(a: PriceAnalysis): string {
  const head = `ניתוח פער מחיר – חשבונית ${a.invoiceNumber}${a.invoiceDate ? ` מ-${formatDateHe(a.invoiceDate)}` : ''}, ${a.customerName} (${a.customerCode})${a.siteName ? `, אתר ${a.siteName}` : ''}`;
  const lines = a.lines.map(lineSentence);
  const total = [`סה״כ פער לזיכוי: ${formatIls(a.totalGap)} ₪`];
  if (a.underchargedTotal) total.push(`שורות ללא חיוב: ${formatIls(a.underchargedTotal)} ₪ (לא לזיכוי)`);
  return [head, '', ...lines, '', total.join(' · '), a.reasons.length ? `סיבות: ${a.reasons.join(', ')}` : 'לא נמצא פער מול המחירון'].join('\n');
}
