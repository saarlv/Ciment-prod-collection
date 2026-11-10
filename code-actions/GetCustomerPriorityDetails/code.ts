import { BlocksClient } from '../shared/blocks/blocks-client.ts';

// Read-only: one row of RAW.PRIORITY_1_CUSTOMERS from Brain for the customer card. Writes nothing.

type Row = Record<string, unknown>;
const errText = (e: any) => (e?.message ? String(e.message) : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_BACKOFF_S = [2, 4, 8, 16, 32];
const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** query_table result → rows keyed by UPPER-case column names. Throws on a refused / failed read. */
function rowsOf(res: any): Row[] {
  const r = res?.output ?? res;
  if (r?.error) throw new Error(`query_table: ${typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}`);
  const rows = r?.rows ?? r?.data?.rows;
  if (!Array.isArray(rows)) throw new Error('query_table: התשובה לא כללה rows');
  const cols: string[] = (r?.columns ?? r?.data?.columns ?? []).map((c: any) => String(typeof c === 'string' ? c : c?.name ?? ''));
  return rows.map((row: any) => {
    const o: Row = {};
    if (Array.isArray(row)) row.forEach((v, i) => (o[(cols[i] ?? String(i)).toUpperCase()] = v));
    else for (const [k, v] of Object.entries(row ?? {})) o[k.toUpperCase()] = v;
    return o;
  });
}

function isRateLimited(e: any): boolean {
  if (e?.statusCode === 429) return true;
  return /429|too many requests|rate.?limit/i.test(errText(e));
}
function retryAfterMs(e: any): number | null {
  const m = /retry[-_ ]?after["':= ]*(\d+(\.\d+)?)/i.exec(errText(e));
  if (!m) return null;
  const s = Number(m[1]);
  return Number.isFinite(s) && s >= 0 && s <= 120 ? Math.ceil(s * 1000) : null;
}

async function query(client: BlocksClient, sql: string): Promise<Row[]> {
  for (let attempt = 0; ; attempt++) {
    const t = Date.now();
    try {
      const rows = rowsOf(await client.invokeAction('query_table', { sql }));
      console.log(`[q] ${rows.length}r ${Date.now() - t}ms${attempt ? ` try${attempt + 1}` : ''}`);
      return rows;
    } catch (e) {
      if (!isRateLimited(e) || attempt >= RETRY_BACKOFF_S.length) {
        throw new Error(`${errText(e)}${attempt ? ` (אחרי ${attempt} ניסיונות חוזרים)` : ''}`);
      }
      const wait = retryAfterMs(e) ?? RETRY_BACKOFF_S[attempt] * 1000;
      console.error(`[q] 429, retry ${attempt + 1}/${RETRY_BACKOFF_S.length} in ${wait}ms`);
      await sleep(wait);
    }
  }
}

export const invoke = async (input: any, context: any) => {
  const readAt = new Date().toISOString();
  const code = String(input?.customerCode ?? '').trim();
  if (!code) return { record: null, readAt, error: 'חסר קוד לקוח' };
  console.log(`[GetCustomerPriorityDetails] customer=${code}`);
  try {
    const client = new BlocksClient(context);
    const rows = await query(client, `SELECT * FROM RAW.PRIORITY_1_CUSTOMERS WHERE CUSTNAME = ${sqlStr(code)} LIMIT 1`);
    return { record: rows[0] ?? null, readAt };
  } catch (e) {
    console.error(`[GetCustomerPriorityDetails] failed: ${errText(e)}`);
    return { record: null, readAt, error: `לא ניתן לקרוא את פרטי הלקוח מפריוריטי: ${errText(e)}` };
  }
};
