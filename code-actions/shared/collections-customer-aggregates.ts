// Calc layer on Customers (6b): the ledger balance from OpenMovements and the document counts from Invoices, written by
// RefreshCustomerAggregates (called by PullOpenMovements for the customers it completed, and by SyncFromBrain).
//   openBalance       sum of the customer's OpenMovements.amount
//   openDebit         sum of the positive amounts
//   onAccountCredit   sum of the קבלה movements (receipts left on account – negative)
//   overdueAmount     positive movements whose dueDate is before asOf
//   oldestDueDate     earliest dueDate of the open movements
//   openMovementCount number of open movements
//   documentCount     Invoices rows of the customer (not deletedInSource)
//   lastDocumentDate  latest Invoices.invoiceDate
// The ledger columns are filled only for customers whose ledger was read (movementsSyncedAt set); for the others they
// stay null ("—" = not known). asOf = AgentSettings balanceAsOfDate, empty = today (Asia/Jerusalem). Only rows whose
// values change are written (plus aggregatesAt), then read back. Never writes to Priority.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { israelToday, isValidDate, toIsraelDate } from './collections-dates.ts';
import { errText, mapLimit, num, numOrNull, readAll, readByIds, readWhereIn, round2, str } from './collections-data.ts';

/** OpenMovements.docType of a receipt left on account (as in priority-movements-source.ts DOC_RECEIPT) */
const DOC_RECEIPT = 'קבלה';
export const S_BALANCE_AS_OF_DATE = 'balanceAsOfDate';
export const LEDGER_AGG_FIELDS = ['openBalance', 'openDebit', 'onAccountCredit', 'overdueAmount', 'oldestDueDate', 'openMovementCount'] as const;
export const DOC_AGG_FIELDS = ['documentCount', 'lastDocumentDate'] as const;
export const AGG_FIELDS = [...LEDGER_AGG_FIELDS, ...DOC_AGG_FIELDS] as const;
const DATE_FIELDS = new Set<string>(['oldestDueDate', 'lastDocumentDate']);

export interface CustomerAggregates {
  openBalance: number | null;
  openDebit: number | null;
  onAccountCredit: number | null;
  overdueAmount: number | null;
  oldestDueDate: string | null;
  openMovementCount: number | null;
  documentCount: number;
  lastDocumentDate: string | null;
}

/** The aggregates of one customer (pure). ledgerRead = Customers.movementsSyncedAt is set. */
export function aggregatesOf(x: { ledgerRead: boolean; movements: Item[]; invoices: Item[]; asOf: string }): CustomerAggregates {
  const docs = x.invoices.filter((i) => i.deletedInSource !== true);
  const dates = docs.map((i) => toIsraelDate(i.invoiceDate)).filter(Boolean).sort() as string[];
  const out: CustomerAggregates = {
    openBalance: null,
    openDebit: null,
    onAccountCredit: null,
    overdueAmount: null,
    oldestDueDate: null,
    openMovementCount: null,
    documentCount: docs.length,
    lastDocumentDate: dates.at(-1) ?? null,
  };
  if (!x.ledgerRead) return out;
  let balance = 0;
  let debit = 0;
  let onAccount = 0;
  let overdue = 0;
  const dues: string[] = [];
  for (const m of x.movements) {
    const a = round2(num(m.amount));
    const due = toIsraelDate(m.dueDate);
    balance += a;
    if (a > 0) debit += a;
    if (str(m.docType).trim() === DOC_RECEIPT) onAccount += a;
    if (a > 0 && due && due < x.asOf) overdue += a;
    if (due) dues.push(due);
  }
  dues.sort();
  return {
    ...out,
    openBalance: round2(balance),
    openDebit: round2(debit),
    onAccountCredit: round2(onAccount),
    overdueAmount: round2(overdue),
    oldestDueDate: dues[0] ?? null,
    openMovementCount: x.movements.length,
  };
}

const norm = (f: string, v: unknown): string | number | null => {
  if (DATE_FIELDS.has(f)) return toIsraelDate(v);
  const n = numOrNull(v);
  return n === null ? null : round2(n);
};

/** field → [stored, computed] for the aggregate columns that differ. */
export function aggregatesDiff(row: Item, agg: Item): Record<string, [unknown, unknown]> {
  const d: Record<string, [unknown, unknown]> = {};
  for (const f of AGG_FIELDS) if (norm(f, row[f]) !== norm(f, agg[f])) d[f] = [row[f] ?? null, agg[f] ?? null];
  return d;
}

/** asOf: the AgentSettings row balanceAsOfDate when it is a date, else today (Asia/Jerusalem). */
export async function balanceAsOf(client: BlocksClient): Promise<string> {
  try {
    const r = await client.queryTable('AgentSettings', { from: { table: 'AgentSettings' }, where: { column: 'settingKey', value: S_BALANCE_AS_OF_DATE }, limit: 5 });
    const v = str(r?.items?.[0]?.value).trim();
    if (v && isValidDate(v)) return v;
  } catch (e) {
    console.error(`[aggregates] AgentSettings ${S_BALANCE_AS_OF_DATE}: ${errText(e)} – using today`);
  }
  return israelToday();
}

export interface AggregatesResult {
  ok: boolean;
  dryRun: boolean;
  asOf: string;
  customersChecked: number;
  customersChanged: number;
  samples: Item[];
  writeVerified: boolean;
  errors: string[];
}

const BATCH = 200;

/** Recomputes the aggregates of the given customers (none = all), in batches of customer codes. */
export async function refreshCustomerAggregates(
  client: BlocksClient,
  opts: { customerCodes?: string[] | null; dryRun?: boolean; nowIso?: string; asOf?: string } = {},
): Promise<AggregatesResult> {
  const dryRun = opts.dryRun !== false;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const errors: string[] = [];
  const asOf = opts.asOf && isValidDate(opts.asOf) ? opts.asOf : await balanceAsOf(client);
  const out: AggregatesResult = { ok: false, dryRun, asOf, customersChecked: 0, customersChanged: 0, samples: [], writeVerified: false, errors };
  const only = [...new Set((opts.customerCodes ?? []).map((c) => str(c).trim()).filter(Boolean))];

  // the customers, then their sources batch by batch
  let customers: Item[];
  try {
    customers = only.length ? await readWhereIn(client, 'Customers', 'customerCode', only) : await readAll(client, 'Customers');
  } catch (e) {
    errors.push(`Customers: קריאה נכשלה – ${errText(e)}`);
    return out;
  }
  const codes = [...new Set(customers.map((c) => str(c.customerCode).trim()).filter(Boolean))].sort();
  out.customersChecked = customers.length;
  console.log(`[aggregates] dryRun=${dryRun} asOf=${asOf} customers=${customers.length} codes=${codes.length}`);

  const planned: { row: Item; fields: Item; previous: Item }[] = [];
  for (let i = 0; i < codes.length; i += BATCH) {
    const batch = codes.slice(i, i + BATCH);
    let movements: Item[];
    let invoices: Item[];
    try {
      [movements, invoices] = await Promise.all([readWhereIn(client, 'OpenMovements', 'customerCode', batch), readWhereIn(client, 'Invoices', 'customerCode', batch)]);
    } catch (e) {
      errors.push(`קריאת תנועות / חשבוניות נכשלה (${batch[0]}…): ${errText(e)}`);
      continue;
    }
    const group = (rows: Item[]) => {
      const m = new Map<string, Item[]>();
      for (const r of rows) {
        const c = str(r.customerCode).trim();
        if (!m.has(c)) m.set(c, []);
        m.get(c)!.push(r);
      }
      return m;
    };
    const movBy = group(movements);
    const invBy = group(invoices);
    const set = new Set(batch);
    for (const row of customers) {
      const code = str(row.customerCode).trim();
      if (!set.has(code) || row.id === undefined || row.id === null) continue;
      const agg = aggregatesOf({ ledgerRead: !!str(row.movementsSyncedAt).trim(), movements: movBy.get(code) ?? [], invoices: invBy.get(code) ?? [], asOf }) as unknown as Item;
      const diff = aggregatesDiff(row, agg);
      if (!Object.keys(diff).length) continue;
      const fields: Item = {};
      for (const f of AGG_FIELDS) fields[f] = agg[f] ?? null;
      planned.push({ row, fields, previous: Object.fromEntries(Object.entries(diff).map(([k, [from]]) => [k, from])) });
    }
  }
  out.customersChanged = planned.length;
  out.samples = planned.slice(0, 10).map((x) => ({
    customerCode: str(x.row.customerCode),
    fields: Object.fromEntries(Object.keys(x.previous).map((k) => [k, x.fields[k]])),
    previous: x.previous,
  }));
  if (dryRun) {
    out.ok = errors.length === 0;
    return out;
  }
  if (!planned.length) {
    out.ok = errors.length === 0;
    out.writeVerified = errors.length === 0;
    return out;
  }

  const payload = planned.map((x) => ({ id: str(x.row.id), ...x.fields, aggregatesAt: nowIso }));
  const chunks: Item[][] = [];
  for (let i = 0; i < payload.length; i += 100) chunks.push(payload.slice(i, i + 100));
  await mapLimit(chunks, 4, async (chunk) => {
    try {
      await client.updateItems('Customers', chunk);
    } catch {
      await mapLimit(chunk, 8, async (item) => {
        const { id, ...fields } = item;
        try {
          await client.updateItem('Customers', id, fields);
        } catch (e) {
          errors.push(`Customers ${id}: ${errText(e)}`);
        }
      });
    }
  });

  try {
    const back = await readByIds(client, 'Customers', planned.map((x) => str(x.row.id)));
    const byId = new Map(back.map((r) => [str(r.id), r]));
    for (const x of planned) {
      const r = byId.get(str(x.row.id));
      if (!r) {
        errors.push(`Customers ${str(x.row.customerCode)}: לא נקרא בחזרה`);
        continue;
      }
      const still = Object.keys(aggregatesDiff(r, x.fields));
      if (still.length) errors.push(`Customers ${str(x.row.customerCode)}: ${still.join(', ')} לא נשמרו`);
    }
  } catch (e) {
    errors.push(`Customers: קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  out.writeVerified = errors.length === 0;
  out.ok = errors.length === 0;
  console.log(`[aggregates] changed=${planned.length} writeVerified=${out.writeVerified} errors=${errors.length}`);
  return out;
}
