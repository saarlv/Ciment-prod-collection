// Reads the lines of ONE invoice live from Priority (read-only ReadEntitySet on a subform path) and upserts them
// into InvoiceLines. On a Priority failure it returns the mirror's existing lines with `error` — it never throws.
import { BlocksClient, type Item } from '../shared/blocks/blocks-client.ts';
import {
  PD_SOURCE, priorityRead, isNotFound, errText, str, odataStr, numOrNull, textOrNull, dateTimeOrNull, sameFields,
} from '../shared/priority-direct.ts';

async function mirrorLines(client: BlocksClient, invoiceNumber: string): Promise<Item[]> {
  try {
    const r = await client.queryTable('InvoiceLines', {
      from: { table: 'InvoiceLines' },
      where: { column: 'invoiceNumber', value: invoiceNumber },
      orderBy: [{ column: 'lineNumber', direction: 'asc' }],
      limit: 1000,
    });
    return r?.items ?? [];
  } catch (e) {
    console.error(`[mirror] read failed: ${errText(e)}`);
    return [];
  }
}

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const invoiceNumber = str(input?.invoiceNumber).trim();
  const form = input?.form === 'AINVOICES' ? 'AINVOICES' : 'CINVOICES';
  const ivtype = form === 'AINVOICES' ? 'A' : 'C';
  const readAt = new Date().toISOString();
  if (!invoiceNumber) return { lines: [], readAt, error: 'חסר מספר חשבונית' };
  console.log(`[run] ${form} ${invoiceNumber}`);

  // 1. Priority read (DEBIT 'D', then 'C' when empty / not found)
  let rows: Item[] | null = null;
  let readError: string | null = null;
  for (const debit of ['D', 'C']) {
    const path = `${form}(IVNUM=${odataStr(invoiceNumber)},IVTYPE='${ivtype}',DEBIT='${debit}')/CINVOICEITEMS_SUBFORM`;
    try {
      const r = await priorityRead(client, { entityName: path }, `${form} ${invoiceNumber} ${debit}`);
      if (r.length) {
        rows = r;
        readError = null;
        break;
      }
      rows = r;
    } catch (e) {
      if (isNotFound(e)) continue;
      readError = errText(e);
      break;
    }
  }
  if (readError || !rows) {
    const lines = await mirrorLines(client, invoiceNumber);
    const error = readError ? `קריאה מ-Priority נכשלה: ${readError}` : `החשבונית ${invoiceNumber} לא נמצאה ב-Priority`;
    console.error(`[run] ${error}; returning ${lines.length} mirror lines`);
    return { lines, readAt, error };
  }
  if (!rows.length) {
    const lines = await mirrorLines(client, invoiceNumber);
    return { lines, readAt, error: `לא נמצאו שורות לחשבונית ${invoiceNumber} ב-Priority` };
  }

  // 2. Context from the Invoices mirror
  let inv: Item | null = null;
  try {
    const r = await client.queryTable('Invoices', { from: { table: 'Invoices' }, where: { column: 'invoiceNumber', value: invoiceNumber }, limit: 1 });
    inv = r?.items?.[0] ?? null;
  } catch (e) {
    console.error(`[inv] lookup failed: ${errText(e)}`);
  }

  // 3. Map + upsert
  const mapped = rows
    .filter((l) => l?.KLINE !== undefined && l?.KLINE !== null)
    .map((l) => {
      const key = `${form}:${invoiceNumber}:${l.KLINE}`;
      return {
        lineKey: key,
        priorityKey: key,
        priorityForm: form,
        invoiceNumber,
        lineNumber: numOrNull(l.KLINE),
        sku: textOrNull(l.PARTNAME),
        itemName: textOrNull(l.PDES),
        quantity: numOrNull(l.TQUANT),
        unit: textOrNull(l.TUNITNAME),
        unitPrice: numOrNull(l.PRICE),
        discountPercent: numOrNull(l.PERCENT),
        lineTotal: numOrNull(l.QPRICE),
        grossTotal: numOrNull(l.TOTPRICE),
        vatAmount: numOrNull(l.IVTAX),
        orderNumber: textOrNull(l.ORDNAME),
        deliveryNoteNumber: textOrNull(l.DOCNO),
        lineUpdatedAt: dateTimeOrNull(l.UDATE),
        customerCode: textOrNull(inv?.customerCode),
        customerName: textOrNull(inv?.customerName),
        salesAgentName: textOrNull(inv?.salesAgentName),
        source: PD_SOURCE,
      } as Item;
    });

  try {
    const existing = await client.queryTable('InvoiceLines', {
      from: { table: 'InvoiceLines' },
      where: { column: 'lineKey', operator: 'in', value: mapped.map((m) => m.lineKey) },
      limit: 1000,
    });
    const byKey = new Map((existing?.items ?? []).map((r) => [str(r.lineKey), r]));
    const creates: Item[] = [];
    const updates: Item[] = [];
    for (const m of mapped) {
      const ex = byKey.get(m.lineKey);
      if (!ex) creates.push({ ...m, syncedAt: readAt });
      else if (!sameFields(ex, m)) updates.push({ id: ex.id, ...m, syncedAt: readAt });
      else updates.push({ id: ex.id, syncedAt: readAt });
    }
    if (creates.length) await client.createItems('InvoiceLines', creates);
    if (updates.length) await client.updateItems('InvoiceLines', updates);
    console.log(`[write] ${form} ${invoiceNumber}: ${creates.length} new, ${updates.length} refreshed`);
  } catch (e) {
    const msg = `השורות נקראו מ-Priority אך שמירתן נכשלה: ${errText(e)}`;
    console.error(`[write] ${msg}`);
    return { lines: mapped.map((m) => ({ ...m, syncedAt: readAt })), readAt, error: msg };
  }

  const lines = (await mirrorLines(client, invoiceNumber)).filter((r) => str(r.priorityForm) === form && str(r.source) === PD_SOURCE);
  return { lines: lines.length ? lines : mapped.map((m) => ({ ...m, syncedAt: readAt })), readAt, error: null };
};
