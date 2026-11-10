// Direct, read-only Priority access through the app's Priority integration action ReadEntitySet.
// Used by SyncPrioritySubforms and ReadInvoiceLinesLive. Never calls CreateEntity / UpdateEntity.
//
// - At most 2 Priority calls in flight per Lambda (module-level semaphore).
// - On 429: honours Retry-After when the error carries one, else waits 2/4/8/16/32 s; max 5 retries.
// - The integration sometimes returns `data` as a JSON string: it is parsed; unparsable → the call failed.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';

export const PD_SOURCE = 'priority-direct';
export const PD_RETRY_BACKOFF_S = [2, 4, 8, 16, 32];
const MAX_CONCURRENT = 2;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
export function errText(e: any): string {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  return str(e.message || e.error || JSON.stringify(e)).slice(0, 1000);
}

/** Internal Priority accounts (1000xx) — same rule as the customers screen. */
export const isInternalCustomer = (code: unknown) => /^1000\d{2}$/.test(str(code).trim());

/** OData string literal. */
export const odataStr = (v: string) => `'${v.replace(/'/g, "''")}'`;

export const priorityStats = { calls: 0, retries: 0, waitedMs: 0, totalMs: 0 };

// ---------- 2-call semaphore ----------
let active = 0;
const waiters: (() => void)[] = [];
async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
  active++;
}
function release() {
  active--;
  const next = waiters.shift();
  if (next) next();
}

function isRateLimited(e: any): boolean {
  if (e?.statusCode === 429 || e?.status === 429) return true;
  return /\b429\b|too many requests|rate.?limit/i.test(errText(e));
}
function retryAfterMs(e: any): number | null {
  const m = /retry[-_ ]?after["':= ]*(\d+(\.\d+)?)/i.exec(errText(e));
  if (!m) return null;
  const s = Number(m[1]);
  return Number.isFinite(s) && s >= 0 && s <= 120 ? Math.ceil(s * 1000) : null;
}
export function isNotFound(e: any): boolean {
  return e?.statusCode === 404 || /\b404\b|not found/i.test(errText(e));
}

export interface ReadEntitySetInput {
  entityName: string;
  filter?: string;
  orderby?: string;
  top?: number;
  skip?: number;
  select?: string;
  expand?: string;
}

/** Turns the ReadEntitySet output into the OData `value` rows; throws on anything that is not a clean result. */
function valueOf(res: any): Item[] {
  let out = res?.output ?? res;
  if (typeof out === 'string') out = parseJson(out, 'output');
  if (out?.error) throw new Error(`Priority: ${typeof out.error === 'string' ? out.error : JSON.stringify(out.error).slice(0, 500)}`);
  let data = out?.data !== undefined ? out.data : out;
  if (typeof data === 'string') data = parseJson(data, 'data');
  if (data?.error) throw new Error(`Priority: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error).slice(0, 500)}`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.value)) return data.value;
  throw new Error('Priority: unexpected response (no value array)');
}
function parseJson(s: string, what: string) {
  try {
    return JSON.parse(s);
  } catch {
    throw new Error(`Priority: ${what} came back as text that is not valid JSON (likely truncated, ${s.length} chars)`);
  }
}

/** One ReadEntitySet call, ≤2 in flight, with 429 backoff. Returns the `value` rows or throws. */
export async function priorityRead(client: BlocksClient, input: ReadEntitySetInput, tag: string): Promise<Item[]> {
  for (let attempt = 0; ; attempt++) {
    await acquire();
    const t = Date.now();
    let err: any = null;
    let rows: Item[] | null = null;
    try {
      const res = await client.invokeAction('ReadEntitySet', input);
      rows = valueOf(res);
    } catch (e) {
      err = e;
    } finally {
      release();
    }
    const ms = Date.now() - t;
    priorityStats.calls++;
    priorityStats.totalMs += ms;
    if (rows) {
      console.log(`[p] ${tag} ${rows.length}r ${ms}ms${attempt ? ` try${attempt + 1}` : ''}`);
      return rows;
    }
    if (!isRateLimited(err) || attempt >= PD_RETRY_BACKOFF_S.length) {
      const e = new Error(`${tag}: ${errText(err)}${attempt ? ` (אחרי ${attempt} ניסיונות חוזרים)` : ''}`) as any;
      e.statusCode = err?.statusCode;
      throw e;
    }
    const wait = retryAfterMs(err) ?? PD_RETRY_BACKOFF_S[attempt] * 1000;
    priorityStats.retries++;
    priorityStats.waitedMs += wait;
    console.error(`[p] ${tag} 429, retry ${attempt + 1}/${PD_RETRY_BACKOFF_S.length} in ${wait}ms`);
    await sleep(wait);
  }
}

/** Runs fn over items with up to `limit` in flight (the semaphore still caps Priority calls at 2). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>, stop?: () => boolean): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (stop && stop()) return;
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------- app table helpers ----------

/** Reads every row matching `where`, paging until an empty page (queryTable may cap a page below `limit`). */
export async function queryAll(client: BlocksClient, table: string, where?: WhereClause): Promise<Item[]> {
  const all: Item[] = [];
  for (let offset = 0; offset < 200000; ) {
    const res = await client.queryTable(table, { from: { table }, ...(where ? { where } : {}), orderBy: [{ column: 'id', direction: 'asc' }], limit: 1000, offset });
    const items = res?.items ?? [];
    if (!items.length) break;
    all.push(...items);
    offset += items.length;
  }
  return all;
}

const WRITE_CHUNK = 200;
export async function writeChunks(rows: Item[], fn: (chunk: Item[]) => Promise<unknown>): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const c = rows.slice(i, i + WRITE_CHUNK);
    await fn(c);
    n += c.length;
  }
  return n;
}

/** Comparable form of a value (null/''/undefined equal; numbers by value; dates by their text). */
export function norm(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000);
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 10000) / 10000);
  return s;
}
/** True when every mapped field already equals the row's value. Date-only fields compare by their first 10 chars. */
export function sameFields(existing: Item, mapped: Item, dateFields: string[] = []): boolean {
  for (const [k, v] of Object.entries(mapped)) {
    let a = norm(existing[k]);
    let b = norm(v);
    if (dateFields.includes(k)) {
      a = a.slice(0, 10);
      b = b.slice(0, 10);
    }
    if (k === 'deletedInSource' || typeof v === 'boolean') {
      a = existing[k] ? '1' : '0';
      b = v ? '1' : '0';
    }
    if (a !== b) return false;
  }
  return true;
}

export const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const textOrNull = (v: unknown): string | null => (str(v).trim() ? str(v).trim() : null);
/** Priority date-time → YYYY-MM-DD (the local date as Priority writes it). */
export const dateOnly = (v: unknown): string | null => {
  const s = str(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
export const dateTimeOrNull = (v: unknown): string | null => {
  const s = str(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
