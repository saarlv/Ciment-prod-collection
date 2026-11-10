// Shared data helpers for Ciment Collections code actions.
// Table names passed in are always the exact table names from requirements.json.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';
import { sortableTime } from './collections-dates.ts';

export const DEFAULT_RECORDER = 'נינה';

const PAGE_SIZE = 500;
const COUNT_ALIAS = 'rowCount';

/**
 * Row count for `where` via a count aggregate, or null when the server does not answer with exactly
 * one row holding a finite count (then the caller falls back to paging until an empty page).
 */
async function countRows(client: BlocksClient, table: string, where?: WhereClause): Promise<number | null> {
  try {
    const res = await client.queryTable(table, {
      from: { table },
      ...(where ? { where } : {}),
      select: [{ column: 'id', function: 'count', as: COUNT_ALIAS }],
    });
    const items = res?.items ?? [];
    if (items.length !== 1) return null;
    const raw = items[0]?.[COUNT_ALIAS];
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** 'done' / 'more' when the query response itself carries a paging signal, else null. */
function pagingSignal(res: any, receivedSoFar: number): 'done' | 'more' | null {
  if (!res || typeof res !== 'object') return null;
  if ('nextCursor' in res) return res.nextCursor === null || res.nextCursor === '' ? 'done' : 'more';
  if (typeof res.hasMore === 'boolean') return res.hasMore ? 'more' : 'done';
  const total = typeof res.total === 'number' ? res.total : typeof res.totalCount === 'number' ? res.totalCount : null;
  if (total !== null) return receivedSoFar >= total ? 'done' : 'more';
  if (res.limitReached === false) return 'done';
  return null;
}

/**
 * Reads every row of a table matching `where` in one round trip of latency for tables up to one page:
 * the first page and a count aggregate are requested in parallel, and paging stops as soon as the rows
 * received reach the count (or the response's own paging signal says done). The server page cap is
 * not assumed: further pages use the page length actually received, so a cap below PAGE_SIZE never
 * skips rows. Without a usable count it falls back to paging until an empty page.
 */
export async function readAll(client: BlocksClient, table: string, where?: WhereClause): Promise<Item[]> {
  const base = { from: { table }, ...(where ? { where } : {}) };
  const out: Item[] = [];
  const seen = new Set<string>();
  const add = (items: Item[]) => {
    let fresh = 0;
    for (const it of items) {
      const id = it?.id !== undefined && it?.id !== null ? String(it.id) : null;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(it);
      fresh += 1;
    }
    return fresh;
  };

  const [first, total] = await Promise.all([
    client.queryTable(table, { ...base, limit: PAGE_SIZE, offset: 0 }),
    countRows(client, table, where),
  ]);
  const firstItems = first?.items ?? [];
  add(firstItems);
  let offset = firstItems.length;
  if (firstItems.length === 0) return out;
  if (pagingSignal(first, offset) === 'done') return out;
  if (total !== null && out.length >= total) return out;

  // known total: fetch the remaining pages in parallel, sized by the page length the server returned
  if (total !== null) {
    const pageLen = firstItems.length;
    const offsets: number[] = [];
    for (let o = offset; o < total; o += pageLen) offsets.push(o);
    for (let i = 0; i < offsets.length; i += 8) {
      const pages = await Promise.all(
        offsets.slice(i, i + 8).map((o) => client.queryTable(table, { ...base, limit: PAGE_SIZE, offset: o })),
      );
      for (const p of pages) {
        const items = p?.items ?? [];
        add(items);
        offset += items.length;
      }
    }
    if (out.length >= total) return out;
  }

  // fallback / top-up: sequential pages until an empty page or no new rows
  for (let guard = 0; guard < 10000; guard++) {
    const res = await client.queryTable(table, { ...base, limit: PAGE_SIZE, offset });
    const items = res?.items ?? [];
    if (items.length === 0) break;
    if (add(items) === 0) break;
    offset += items.length;
    if (pagingSignal(res, offset) === 'done') break;
    if (total !== null && out.length >= total) break;
  }
  return out;
}

/** Rows by platform id (chunked `id in`, chunks read in parallel). */
export async function readByIds(client: BlocksClient, table: string, ids: string[], size = 200): Promise<Item[]> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  const parts = await Promise.all(chunks.map((c) => readAll(client, table, { column: 'id', operator: 'in', value: c })));
  return parts.flat();
}

/** Rows whose `column` is one of `values` (chunked, chunks read in parallel). */
export async function readWhereIn(client: BlocksClient, table: string, column: string, values: string[], size = 200): Promise<Item[]> {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  const parts = await Promise.all(chunks.map((c) => readAll(client, table, { column, operator: 'in', value: c })));
  const byId = new Map<string, Item>();
  for (const r of parts.flat()) byId.set(str(r.id) || JSON.stringify(r), r);
  return [...byId.values()];
}

/** Runs fn over items with at most `limit` calls in flight; results in input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const errText = (e: any) => (e?.message ? String(e.message) : String(e));

/** Inserts rows in chunks; returns the created rows in input order. */
export async function createInChunks(client: BlocksClient, table: string, rows: Item[], size = 100): Promise<Item[]> {
  const created: Item[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const res = await client.createItems(table, chunk);
    created.push(...(res?.items ?? []));
  }
  return created;
}

/** Deletes rows by id in batches (falls back to one-by-one if a batch delete is rejected). */
export async function deleteByIds(client: BlocksClient, table: string, ids: string[], size = 100): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    try {
      const res = await client.deleteItems(table, { where: { column: 'id', operator: 'in', value: chunk } });
      const n = res?.itemIds?.length;
      if (typeof n === 'number' && n === chunk.length) {
        deleted += n;
        continue;
      }
      // partial or unknown result: delete whatever is left one by one
      const done = new Set((res?.itemIds ?? []).map(String));
      deleted += done.size;
      for (const id of chunk.filter((x) => !done.has(String(x)))) {
        try {
          await client.deleteItem(table, id);
          deleted += 1;
        } catch {
          // already gone or not deletable; the re-read verification reports it
        }
      }
    } catch {
      for (const id of chunk) {
        try {
          await client.deleteItem(table, id);
          deleted += 1;
        } catch {
          // reported by verification
        }
      }
    }
  }
  return deleted;
}

export const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

export const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export const splitList = (v: unknown): string[] =>
  str(v)
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Test-data separation is retired (real Priority data only): no code is treated as test data. Kept for callers. */
export const isTestCode = (_code: unknown) => false;

/** "12,000" style ILS amount. */
export const formatIls = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(round2(n));

// ---------- AgentSettings (read only) ----------

export async function readSettings(client: BlocksClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await readAll(client, 'AgentSettings');
    for (const r of rows) {
      if (r.settingKey) map.set(String(r.settingKey), str(r.value));
    }
  } catch {
    // fall back to hard-coded defaults
  }
  return map;
}

export function numberSetting(settings: Map<string, string>, key: string, fallback: number): number {
  const raw = settings.get(key);
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// ---------- owning bookkeeper ----------

/** customerCode → bookkeeperName from CustomerOwners (latest setAt wins). */
export function buildOwnerMap(ownerRows: Item[]): Map<string, string> {
  const best = new Map<string, Item>();
  for (const r of ownerRows) {
    const code = str(r.customerCode);
    if (!code || !str(r.bookkeeperName)) continue;
    const prev = best.get(code);
    if (!prev || sortableTime(r.setAt) >= sortableTime(prev.setAt)) best.set(code, r);
  }
  return new Map([...best.entries()].map(([k, v]) => [k, str(v.bookkeeperName)]));
}

/** Owning bookkeeper: CustomerOwners override, else Customers.assignedBookkeeperName. */
export function ownerOf(customerCode: string, customer: Item | undefined, ownerMap: Map<string, string>): string {
  return ownerMap.get(customerCode) || str(customer?.assignedBookkeeperName);
}

export async function findCustomer(client: BlocksClient, customerCode: string): Promise<Item | undefined> {
  const res = await client.queryTable('Customers', {
    from: { table: 'Customers' },
    where: { column: 'customerCode', value: customerCode },
    limit: 5,
  });
  return (res?.items ?? [])[0];
}

export async function ownerForCustomer(client: BlocksClient, customerCode: string, customer?: Item): Promise<string> {
  const rows = await readAll(client, 'CustomerOwners', { column: 'customerCode', value: customerCode });
  return ownerOf(customerCode, customer, buildOwnerMap(rows));
}

/** Test-data separation is retired (real Priority data only): no customer is treated as test data. Kept for callers. */
export const isFixtureCustomer = (_customer: Item | undefined, _customerCode?: unknown) => false;
