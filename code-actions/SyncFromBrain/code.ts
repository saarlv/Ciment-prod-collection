import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';

// Copies Priority customers and invoices from Brain (RAW.PRIORITY_1_*) into the Customers / Invoices mirror.
// Writes ONLY the allow-listed mirror columns + sync metadata; never deletes; never writes to Priority or Brain.

const APP_PAGE = 1000;
const WRITE_CHUNK = 200;
const WRITE_PARALLEL = 4;
const VERIFY_SAMPLE = 50;
const GATE_RATIO = 0.8;
const SOURCE_TAG = 'priority-brain';
const OK_STATUSES = ['הצליח', 'הצליח חלקית'];

const CUSTOMER_STATUSES = ['פעיל', 'זמני', 'חסום', 'חסום BDI', 'לא פעיל', 'פעיל-ח.ניירת', 'חס-חסר ניירת', 'בטיפול', 'לא פעיל בפריוריטי'];

// allow-listed mirror columns and their comparison kind
const CUSTOMER_FIELDS: Record<string, 'str' | 'num' | 'date'> = {
  customerCode: 'str', priorityKey: 'str', customerName: 'str', companyId: 'str', priorityStatus: 'str',
  paymentTermsLabel: 'str', paymentTermsCode: 'str', creditLimit: 'num', obligoLimit: 'num', creditInsuredAmount: 'num',
  salesAgentName: 'str', salesAgentCode: 'str', primaryEmail: 'str', address: 'str', priorityOwner: 'str',
};
const INVOICE_FIELDS: Record<string, 'str' | 'num' | 'date'> = {
  invoiceNumber: 'str', priorityForm: 'str', priorityKey: 'str', customerCode: 'str', customerName: 'str',
  invoiceDate: 'date', amount: 'num', documentType: 'str', priorityDocStatus: 'str', reconciledDate: 'date',
  currencyCode: 'str', salesAgentName: 'str',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const errText = (e: any) => (e?.message ? String(e.message) : String(e));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v: unknown) => str(v) || null;

const israelDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
/** A UTC timestamp (ISO string, epoch s/ms, Date) → the calendar date in Israel (YYYY-MM-DD). */
function toIsraelDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  let d: Date;
  if (typeof v === 'number') d = new Date(v > 1e11 ? v : v * 1000);
  else if (v instanceof Date) d = v;
  else {
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return toIsraelDate(Number(s));
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
    d = new Date(hasTz || s.length <= 10 ? s : `${s.replace(' ', 'T')}Z`);
  }
  return Number.isNaN(d.getTime()) ? null : israelDay.format(d);
}

function norm(kind: 'str' | 'num' | 'date', v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (kind === 'num') {
    const n = numOrNull(v);
    return n === null ? '' : String(round2(n));
  }
  if (kind === 'date') return String(v).slice(0, 10);
  return String(v).trim();
}

/** The latest scheduled Brain run (04:00 / 16:00 UTC) at or before now. */
function lastScheduledRun(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16));
  if (d <= now) return d;
  d.setUTCHours(4);
  if (d <= now) return d;
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(16);
  return d;
}

// ---------- Brain reads ----------

/** query_table result → rows as objects keyed by UPPER-case column names. Throws on a refused / failed read. */
function rowsOf(res: any): Item[] {
  const r = res?.output ?? res;
  if (r?.error) throw new Error(`query_table: ${typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}`);
  const rows = r?.rows ?? r?.data?.rows;
  if (!Array.isArray(rows)) throw new Error('query_table: התשובה לא כללה rows');
  const cols: string[] = (r?.columns ?? r?.data?.columns ?? []).map((c: any) => String(typeof c === 'string' ? c : c?.name ?? ''));
  return rows.map((row: any) => {
    const o: Item = {};
    if (Array.isArray(row)) row.forEach((v, i) => (o[(cols[i] ?? String(i)).toUpperCase()] = v));
    else for (const [k, v] of Object.entries(row ?? {})) o[k.toUpperCase()] = v;
    return o;
  });
}

const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;
const REQUEST_PAGE = 1000; // query_table caps results (~100); page 1 detects the effective size
const RETRY_BACKOFF_S = [2, 4, 8, 16, 32]; // max 5 retries per read on 429
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-read latency stats for the run log. */
const readStats = { reads: 0, totalMs: 0, maxMs: 0, retries: 0, waitedMs: 0 };

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

/** One query_table read, one at a time; on 429 honours Retry-After, else backs off 2/4/8/16/32 s; then throws. */
async function query(client: BlocksClient, sql: string, tag: string): Promise<Item[]> {
  for (let attempt = 0; ; attempt++) {
    const t = Date.now();
    try {
      const rows = rowsOf(await client.invokeAction('query_table', { sql }));
      const ms = Date.now() - t;
      readStats.reads++;
      readStats.totalMs += ms;
      readStats.maxMs = Math.max(readStats.maxMs, ms);
      console.log(`[q] ${tag} ${rows.length}r ${ms}ms${attempt ? ` try${attempt + 1}` : ''}`);
      return rows;
    } catch (e) {
      if (!isRateLimited(e) || attempt >= RETRY_BACKOFF_S.length) {
        throw new Error(`${tag}: ${errText(e)}${attempt ? ` (אחרי ${attempt} ניסיונות חוזרים)` : ''}`);
      }
      const wait = retryAfterMs(e) ?? RETRY_BACKOFF_S[attempt] * 1000;
      readStats.retries++;
      readStats.waitedMs += wait;
      console.error(`[q] ${tag} 429 after ${Date.now() - t}ms, retry ${attempt + 1}/${RETRY_BACKOFF_S.length} in ${wait}ms`);
      await sleep(wait);
    }
  }
}

async function countOf(client: BlocksClient, table: string): Promise<number> {
  const r = await query(client, `SELECT COUNT(*) AS CNT FROM ${table}`, `${table} count`);
  const n = Number(r[0]?.CNT ?? Object.values(r[0] ?? {})[0]);
  if (!Number.isFinite(n)) throw new Error(`${table}: COUNT(*) לא החזיר מספר`);
  return n;
}

interface SourceRead {
  rows: Item[]; // rows read in THIS call
  expected: number; // SELECT COUNT(*)
  finished: boolean; // reached the end of the key space
  budgetHit: boolean; // stopped at the deadline
  lastKey: string | null; // last key read (resume point)
  pages: number;
  ms: number;
}

/**
 * Reads a source table with plain keyset paging on a unique key, ONE page at a time.
 * `after` continues after a key (resume); `deadline` (epoch ms) stops before the next page once passed.
 */
async function readSource(client: BlocksClient, table: string, columns: string[], key: string,
  opts: { after?: string | null; deadline?: number; onPage?: (rows: Item[]) => void } = {}): Promise<SourceRead> {
  const t0 = Date.now();
  const expected = await countOf(client, table);
  const cols = columns.join(', ');
  const short = table.replace('RAW.PRIORITY_1_', '');
  console.log(`[source] ${table} count=${expected} after=${opts.after ?? '-'}`);
  const rows: Item[] = [];
  let last: string | null = opts.after ?? null;
  let pageSize = REQUEST_PAGE;
  let pages = 0;
  let finished = false;
  let budgetHit = false;
  for (let guard = 0; guard < 100_000; guard++) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) {
      budgetHit = true;
      break;
    }
    const cond = last === null ? `${key} IS NOT NULL` : `${key} > ${sqlStr(last)}`;
    const page = await query(client, `SELECT ${cols} FROM ${table} WHERE ${cond} ORDER BY ${key} LIMIT ${pageSize}`, `${short} p${pages + 1}`);
    if (pages === 0 && page.length > 0 && page.length < REQUEST_PAGE) pageSize = page.length; // effective cap
    pages++;
    if (page.length) {
      rows.push(...page);
      opts.onPage?.(page);
    }
    if (page.length < pageSize) {
      finished = true;
      if (page.length) last = str(page[page.length - 1][key]);
      break;
    }
    const newLast = str(page[page.length - 1][key]);
    if (!newLast || newLast === last) {
      console.error(`[source] ${table} key did not advance at "${last}" — stopping`);
      break; // finished=false → incomplete read
    }
    last = newLast;
  }
  const ms = Date.now() - t0;
  console.log(`[source] ${table} read=${rows.length} expected=${expected} pages=${pages} pageSize=${pageSize} finished=${finished} budgetHit=${budgetHit} in ${ms}ms`);
  return { rows, expected, finished, budgetHit, lastKey: last, pages, ms };
}

// ---------- App reads / writes ----------

async function readApp(client: BlocksClient, table: 'Customers' | 'Invoices', columns: string[]): Promise<Item[]> {
  const out: Item[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const res = await client.queryTable(table, {
      from: { table },
      select: ['id', ...columns].map((column) => ({ column })),
      orderBy: [{ column: 'id', direction: 'asc' }],
      limit: APP_PAGE,
      offset,
    });
    const items = res?.items ?? [];
    let fresh = 0;
    for (const it of items) {
      const id = str(it.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(it);
      fresh++;
    }
    if (items.length === 0 || fresh === 0) break;
    offset += items.length;
  }
  return out;
}

/** Writes rows in chunks, WRITE_PARALLEL at a time; no new chunk starts once `deadline` (epoch ms) has passed. */
async function inChunks(rows: Item[], fn: (chunk: Item[]) => Promise<unknown>, deadline?: number): Promise<{ written: number; stopped: boolean }> {
  const chunks: Item[][] = [];
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) chunks.push(rows.slice(i, i + WRITE_CHUNK));
  let next = 0;
  let written = 0;
  let stopped = false;
  const worker = async () => {
    while (next < chunks.length) {
      if (deadline !== undefined && Date.now() >= deadline) {
        stopped = true;
        return;
      }
      const c = chunks[next++];
      await fn(c);
      written += c.length;
    }
  };
  await Promise.all(Array.from({ length: Math.min(WRITE_PARALLEL, chunks.length) }, worker));
  return { written, stopped };
}

// ---------- per table ----------

interface TableResult {
  table: string;
  sourceTable: string;
  sourceRows: number;
  expectedRows: number | null;
  lastRunSourceRows: number | null;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedNewerInApp: number;
  markedDeletedInSource: number;
  writeVerified: boolean | null;
  gate: 'passed' | 'blocked' | 'incomplete read' | 'not-run';
  blocked: boolean;
  error: string | null;
  warnings?: string[];
  /** the hard deadline stopped the writes part-way: the next run completes them (upsert by key) */
  writeStoppedAtDeadline?: boolean;
  /** invoice numbers inserted / changed / marked deleted (for a targeted RefreshInvoiceLayer) */
  changedKeys?: string[];
}

interface SourceSet {
  form: string | null; // invoices: the Priority form; customers: null
  complete: boolean; // rows read == COUNT(*)
  read: number;
  expected: number;
  rows: Item[]; // mapped app rows (allow-listed fields)
}

function mapCustomer(r: Item, warnings: string[]): Item {
  const code = str(r.CUSTNAME);
  const status = str(r.STATDES);
  let priorityStatus: string | null = null;
  if (status) {
    if (CUSTOMER_STATUSES.includes(status)) priorityStatus = status;
    else {
      warnings.push(`לקוח ${code}: סטטוס לא מוכר "${status}" – נשאר ריק`);
      console.error(`[customers] unknown STATDES "${status}" for ${code}`);
    }
  }
  const address = [r.ADDRESS, r.ADDRESS2, r.ADDRESS3, r.STATE].map(str).filter(Boolean).join(', ');
  const row: Item = {
    customerCode: code,
    priorityKey: code,
    customerName: strOrNull(r.CUSTDES),
    companyId: strOrNull(r.VATNUM),
    priorityStatus,
    paymentTermsLabel: strOrNull(r.PAYDES),
    paymentTermsCode: strOrNull(r.PAYCODE),
    creditLimit: numOrNull(r.MAX_CREDIT),
    obligoLimit: numOrNull(r.MAX_OBLIGO),
    creditInsuredAmount: numOrNull(r.ZMET_CREDITINSURAMNT),
    salesAgentName: strOrNull(r.AGENTNAME),
    salesAgentCode: strOrNull(r.AGENTCODE),
    primaryEmail: strOrNull(r.EMAIL),
    address: address || null,
    priorityOwner: strOrNull(r.OWNERLOGIN),
  };
  // an unknown status or a missing VATNUM never overwrites what the row already has
  if (status && !priorityStatus) row._keepExisting = ['priorityStatus'];
  if (!row.companyId) row._keepExisting = [...(row._keepExisting ?? []), 'companyId'];
  return row;
}

function mapInvoice(form: string, r: Item): Item {
  const credit = str(r.DEBIT).toUpperCase() === 'C';
  const total = numOrNull(r.TOTPRICE);
  const ivnum = str(r.IVNUM);
  return {
    invoiceNumber: ivnum,
    priorityForm: form,
    priorityKey: `${form}:${ivnum}`,
    customerCode: strOrNull(r.CUSTNAME),
    customerName: strOrNull(r.CDES),
    invoiceDate: toIsraelDate(r.IVDATE),
    amount: total === null ? null : round2(credit ? -Math.abs(total) : total),
    documentType: credit ? 'חשבונית זיכוי' : 'חשבונית',
    priorityDocStatus: strOrNull(r.STATDES),
    reconciledDate: toIsraelDate(r.IVRECONDATE),
    currencyCode: strOrNull(r.CODE),
    salesAgentName: strOrNull(r.AGENTNAME),
  };
}

async function syncTable(opts: {
  client: BlocksClient;
  table: 'Customers' | 'Invoices';
  label: string;
  sourceTable: string;
  fields: Record<string, 'str' | 'num' | 'date'>;
  keyOf: (row: Item) => string; // the unique key (Customers: customerCode; Invoices: form + number)
  loadSource: (warnings: string[]) => Promise<SourceSet[]>;
  lastRunSourceRows: number | null;
  dryRun: boolean;
  runId: string;
  brainDataAsOf: Date;
  incompleteNote?: () => string;
  deadline: number;
}): Promise<TableResult> {
  const { client, table, fields, keyOf, dryRun, runId, brainDataAsOf } = opts;
  const res: TableResult = {
    table: opts.label, sourceTable: opts.sourceTable, sourceRows: 0, expectedRows: null, lastRunSourceRows: opts.lastRunSourceRows,
    inserted: 0, updated: 0, unchanged: 0, skippedNewerInApp: 0, markedDeletedInSource: 0,
    writeVerified: null, gate: 'not-run', blocked: false, error: null,
  };
  const warnings: string[] = [];
  let reading = true;
  try {
    const t0 = Date.now();
    const sets = await opts.loadSource(warnings);
    reading = false;
    res.sourceRows = sets.reduce((s, x) => s + x.rows.length, 0);
    res.expectedRows = sets.reduce((s, x) => s + x.expected, 0);
    res.sourceTable = sets.map((x) => `${x.form ?? opts.sourceTable} ${x.read}/${x.expected}`).join(' + ');
    console.log(`[${table}] source rows=${res.sourceRows}/${res.expectedRows} in ${Date.now() - t0}ms`);

    // every source (both invoice forms) must be fully read, or the table is not applied
    if (sets.some((x) => !x.complete)) {
      res.gate = 'incomplete read';
      res.blocked = true;
      res.error = `incomplete read: ${res.sourceTable}${opts.incompleteNote ? ` (${opts.incompleteNote()})` : ''}`;
      console.log(`[${table}] gate blocked: ${res.error}`);
      if (warnings.length) res.warnings = warnings.slice(0, 50);
      return res;
    }

    // gate
    const prev = opts.lastRunSourceRows;
    if (res.sourceRows === 0 || (prev !== null && prev > 0 && res.sourceRows < GATE_RATIO * prev)) {
      res.gate = 'blocked';
      res.blocked = true;
      res.error = res.sourceRows === 0 ? 'המקור החזיר 0 שורות' : `המקור ירד ל-${res.sourceRows} שורות לעומת ${prev} בהרצה המוצלחת האחרונה (יותר מ-20%)`;
      console.log(`[${table}] gate blocked: ${res.error}`);
      return res;
    }
    res.gate = 'passed';

    const existing = await readApp(client, table, [...Object.keys(fields), 'lastAppWriteAt', 'pendingBrainConfirm', 'deletedInSource']);
    console.log(`[${table}] existing app rows=${existing.length}`);
    const byKey = new Map<string, Item>();
    for (const e of existing) {
      const k = keyOf(e);
      if (k && !byKey.has(k)) byKey.set(k, e);
    }

    const now = new Date().toISOString();
    const meta = { syncedAt: now, syncRunId: runId, deletedInSource: false, source: SOURCE_TAG };
    const creates: Item[] = [];
    const updates: Item[] = [];
    const sourceKeys = new Set<string>();
    const isNewer = (e: Item) => {
      const t = e.lastAppWriteAt ? new Date(e.lastAppWriteAt).getTime() : NaN;
      return Number.isFinite(t) && t > brainDataAsOf.getTime();
    };

    for (const set of sets) {
      for (const raw of set.rows) {
        const { _keepExisting, ...row } = raw;
        const key = keyOf(row);
        if (!key || sourceKeys.has(key)) continue;
        sourceKeys.add(key);
        const e = byKey.get(key);
        if (!e) {
          creates.push({ ...row, ...meta, pendingBrainConfirm: false });
          continue;
        }
        if (isNewer(e)) {
          res.skippedNewerInApp++;
          continue;
        }
        const keep: string[] = _keepExisting ?? [];
        const patch: Item = {};
        for (const [f, kind] of Object.entries(fields)) {
          if (keep.includes(f)) continue;
          if (norm(kind, row[f]) !== norm(kind, e[f])) patch[f] = row[f];
        }
        const flagFix = e.deletedInSource === true || e.pendingBrainConfirm === true;
        if (Object.keys(patch).length === 0 && !flagFix) {
          res.unchanged++;
          continue;
        }
        updates.push({ id: e.id, ...patch, ...meta, ...(e.pendingBrainConfirm === true ? { pendingBrainConfirm: false } : {}) });
      }
    }

    // rows synced before but gone from a fully read source → deletedInSource (never deleted)
    const fullForms = new Set(sets.filter((s) => s.complete).map((s) => s.form ?? ''));
    const deletions: Item[] = [];
    for (const e of existing) {
      if (!str(e.priorityKey) || e.deletedInSource === true) continue;
      const form = table === 'Invoices' ? str(e.priorityForm) : '';
      if (!fullForms.has(form)) continue;
      if (sourceKeys.has(keyOf(e))) continue;
      if (isNewer(e)) {
        res.skippedNewerInApp++;
        continue;
      }
      deletions.push({ id: e.id, deletedInSource: true, syncedAt: now, syncRunId: runId });
    }

    res.inserted = creates.length;
    res.updated = updates.length;
    res.markedDeletedInSource = deletions.length;
    console.log(`[${table}] plan insert=${creates.length} update=${updates.length} unchanged=${res.unchanged} skipped=${res.skippedNewerInApp} deleted=${deletions.length}`);
    if (dryRun) {
      if (warnings.length) res.warnings = warnings.slice(0, 50);
      return res;
    }

    const tw = Date.now();
    const c1 = await inChunks(creates, (c) => opts.client.createItems(table, c), opts.deadline);
    const c2 = await inChunks(updates, (c) => opts.client.updateItems(table, c), opts.deadline);
    // a row is marked deletedInSource only when every insert / update of the run landed
    const c3 = c1.stopped || c2.stopped ? { written: 0, stopped: deletions.length > 0 } : await inChunks(deletions, (c) => opts.client.updateItems(table, c), opts.deadline);
    res.inserted = c1.written;
    res.updated = c2.written;
    res.markedDeletedInSource = c3.written;
    if (table === 'Invoices') {
      const byIdKey = new Map(existing.map((e) => [str(e.id), str(e.invoiceNumber)]));
      res.changedKeys = [
        ...creates.slice(0, c1.written).map((r) => str(r.invoiceNumber)),
        ...[...updates.slice(0, c2.written), ...deletions.slice(0, c3.written)].map((u) => byIdKey.get(str(u.id)) ?? ''),
      ].filter(Boolean);
    }
    console.log(`[${table}] writes done in ${Date.now() - tw}ms: inserted=${c1.written}/${creates.length} updated=${c2.written}/${updates.length} deleted=${c3.written}/${deletions.length}`);
    if (c1.stopped || c2.stopped || c3.stopped) {
      res.writeStoppedAtDeadline = true;
      res.error = `הכתיבה נעצרה במגבלת הזמן: נכתבו ${c1.written}/${creates.length} חדשות, ${c2.written}/${updates.length} עדכונים, ${c3.written}/${deletions.length} סימוני מחיקה – ההרצה הבאה תשלים`;
      console.error(`[${table}] ${res.error}`);
      if (warnings.length) res.warnings = warnings.slice(0, 50);
      return res;
    }

    // verify a sample of written rows
    const byId = new Map(existing.map((e) => [str(e.id), e]));
    const keyFields = table === 'Invoices' ? ['priorityForm', 'invoiceNumber', 'priorityKey'] : ['customerCode', 'priorityKey'];
    const written = [
      ...creates,
      ...updates.map((u) => {
        const e = byId.get(str(u.id)) ?? {};
        const ids = Object.fromEntries(keyFields.map((f) => [f, e[f]]));
        return { ...ids, ...u };
      }),
    ];
    const sample = written.filter((w) => str(w.priorityKey)).slice(0, VERIFY_SAMPLE);
    if (sample.length === 0) res.writeVerified = true;
    else {
      const got = await client.queryTable(table, {
        from: { table },
        where: { column: 'priorityKey', operator: 'in', value: sample.map((s) => str(s.priorityKey)) },
        limit: sample.length * 2,
      });
      const back = new Map((got?.items ?? []).map((r) => [keyOf(r), r]));
      const bad: string[] = [];
      for (const s of sample) {
        const b = back.get(keyOf(s));
        if (!b) {
          bad.push(`${keyOf(s)}: לא נמצא`);
          continue;
        }
        for (const [f, kind] of Object.entries(fields)) {
          if (f in s && norm(kind, s[f]) !== norm(kind, b[f])) bad.push(`${keyOf(s)}.${f}`);
        }
      }
      res.writeVerified = bad.length === 0;
      if (bad.length) {
        warnings.push(`אימות כתיבה נכשל: ${bad.slice(0, 10).join(', ')}`);
        console.error(`[${table}] verify mismatches: ${bad.slice(0, 20).join(', ')}`);
      }
    }
  } catch (e) {
    res.error = reading ? `incomplete read: ${errText(e)}` : errText(e);
    if (reading) {
      // a read that failed (e.g. 429 after retries) → not applied, nothing marked deleted
      res.gate = 'incomplete read';
      res.blocked = true;
    }
    console.error(`[${table}] failed: ${res.error}`);
  }
  if (warnings.length) res.warnings = warnings.slice(0, 50);
  return res;
}

// ---------- invoice staging (SyncStaging) ----------

const INVOICE_FORMS = ['CINVOICES', 'AINVOICES'] as const;
type Form = (typeof INVOICE_FORMS)[number];
const INVOICE_BUDGET_MS = 10 * 60 * 1000; // stop reading invoices 10 min after the run started (leaves room to apply)
const HARD_DEADLINE_MS = 13.5 * 60 * 1000; // after this nothing new starts; the SyncRuns row is closed before the 15-min Lambda limit
const STALE_RUN_MS = 20 * 60 * 1000; // a 'רץ' row older than this was cut off (no run lives past 15 min)
const REFRESH_TARGETED_MAX = 2000; // up to this many changed invoices → RefreshInvoiceLayer on those only, else a full refresh
const INTERRUPTED_ERROR = 'הריצה נקטעה לפני סגירה (כנראה תם הזמן); הנתונים נכתבו אך הספירות לא נשמרו';
const STAGE_FROM_MS = 6 * 60 * 1000; // stream pages to staging once a run is this old (a budget stop becomes likely)
const RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;
type ResumeState = { runId: string } & Partial<Record<Form, string | null>>;

function parseObj(v: unknown): any {
  if (typeof v === 'string') try { return JSON.parse(v); } catch { return null; }
  return v ?? null;
}

/** All staged raw rows of a run, per form. */
async function readStaged(client: BlocksClient, stageRunId: string): Promise<Record<Form, Item[]>> {
  const out: Record<Form, Item[]> = { CINVOICES: [], AINVOICES: [] };
  const seen = new Set<string>();
  let offset = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const res = await client.queryTable('SyncStaging', {
      from: { table: 'SyncStaging' },
      select: ['id', 'form', 'priorityKey', 'payload'].map((column) => ({ column })),
      where: { column: 'runId', value: stageRunId },
      orderBy: [{ column: 'id', direction: 'asc' }],
      limit: APP_PAGE,
      offset,
    });
    const items = res?.items ?? [];
    let fresh = 0;
    for (const it of items) {
      const pk = str(it.priorityKey);
      if (!pk || seen.has(pk)) continue;
      seen.add(pk);
      fresh++;
      const form = str(it.form) as Form;
      const payload = parseObj(it.payload);
      if (out[form] && payload) out[form].push(payload);
    }
    if (items.length === 0 || fresh === 0) break;
    offset += items.length;
  }
  return out;
}

async function deleteStaged(client: BlocksClient, stageRunId: string) {
  try {
    const r = await client.deleteItems('SyncStaging', { where: { column: 'runId', value: stageRunId } });
    console.log(`[staging] deleted ${r?.itemIds?.length ?? 0} rows of run ${stageRunId}`);
  } catch (e) {
    console.error(`[staging] delete for ${stageRunId} failed: ${errText(e)}`);
  }
}

/** Writes read pages to SyncStaging in the background (upsert on runId+priorityKey), off the read loop. */
class Stager {
  private buf: Item[] = [];
  private chain: Promise<void> = Promise.resolve();
  error: string | null = null;
  written = 0;
  constructor(private client: BlocksClient, private runId: string, private startMs: number) {}
  add(form: Form, rows: Item[]) {
    for (const r of rows) {
      const iv = str(r.IVNUM);
      if (iv) this.buf.push({ runId: this.runId, form, priorityKey: `${form}:${iv}`, payload: r });
    }
    if (Date.now() - this.startMs >= STAGE_FROM_MS && this.buf.length >= 1000) this.flush();
  }
  flush() {
    if (!this.buf.length) return;
    const batch = this.buf;
    this.buf = [];
    this.chain = this.chain.then(async () => {
      try {
        await inChunks(batch, (c) => this.client.createItems('SyncStaging', c));
        this.written += batch.length;
      } catch (e) {
        this.error = errText(e);
        console.error(`[staging] write failed: ${this.error}`);
      }
    });
  }
  async drain() {
    this.flush();
    await this.chain;
  }
}

// ---------- entry ----------

const PER_TABLE_KEYS = ['table', 'sourceTable', 'sourceRows', 'expectedRows', 'lastRunSourceRows', 'inserted', 'updated', 'unchanged',
  'skippedNewerInApp', 'markedDeletedInSource', 'writeVerified', 'gate', 'error'] as const;
/** perTable as the SyncRuns schema declares it: only its keys, no nulls (a null in a string / number field can be rejected). */
function perTableForRow(perTable: TableResult[]): Item[] {
  return perTable.map((t) => {
    const o: Item = {};
    for (const k of PER_TABLE_KEYS) {
      const v = (t as any)[k];
      if (v !== null && v !== undefined) o[k] = v;
    }
    return o;
  });
}

/** Closes SyncRuns rows left in 'רץ' by a run that was cut off (Lambda timeout) and deletes their staging rows. */
async function healStaleRuns(client: BlocksClient, recentRuns: Item[], now: number, currentRunId: string) {
  for (const r of recentRuns) {
    if (str(r.status) !== 'רץ' || str(r.runId) === currentRunId) continue;
    const started = new Date(r.startedAt).getTime();
    if (!Number.isFinite(started) || now - started < STALE_RUN_MS) continue;
    console.log(`[heal] closing stale run ${str(r.runId)} (row ${str(r.id)}) started ${str(r.startedAt)}`);
    const rf = parseObj(r.resumeFrom);
    for (const stageId of new Set([str(r.runId), str(rf?.runId)].filter(Boolean))) await deleteStaged(client, stageId);
    try {
      await client.updateItem('SyncRuns', str(r.id), { status: 'הצליח חלקית', finishedAt: str(r.startedAt) || new Date(now).toISOString(), error: INTERRUPTED_ERROR });
      r.status = 'הצליח חלקית';
    } catch (e) {
      console.error(`[heal] update ${str(r.id)} failed: ${errText(e)}`);
    }
  }
}

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const dryRun = input?.dryRun !== false;
  const wanted: string[] = Array.isArray(input?.tables) && input.tables.length ? input.tables : ['customers', 'invoices'];
  const tables = ['customers', 'invoices'].filter((t) => wanted.includes(t));
  const trigger = ['מתוזמן', 'ידני', 'אחרי כתיבה'].includes(input?.trigger) ? input.trigger : 'ידני';
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const invoiceDeadline = startedAt.getTime() + INVOICE_BUDGET_MS;
  const hardDeadline = startedAt.getTime() + HARD_DEADLINE_MS;
  const pastDeadline = () => Date.now() >= hardDeadline;
  const brainDataAsOf = lastScheduledRun(startedAt);
  const brainDataAsOfSource = 'last-scheduled-run';
  const errors: string[] = [];
  const notes: string[] = [];
  console.log(`[run] ${runId} dryRun=${dryRun} tables=${tables.join(',')} trigger=${trigger} brainDataAsOf=${brainDataAsOf.toISOString()}`);

  let syncRunRowId: string | null = null;
  try {
    const created = await client.createItem('SyncRuns', {
      runId, startedAt: startedAt.toISOString(), trigger, dryRun, brainDataAsOf: brainDataAsOf.toISOString(), status: 'רץ', perTable: [],
    });
    syncRunRowId = str(created?.item?.id) || null;
  } catch (e) {
    errors.push(`SyncRuns: ${errText(e)}`);
  }

  const perTable: TableResult[] = [];
  let refreshInvoiceLayer: Item | null = null;
  let status = 'נכשל';
  let resumeOut: ResumeState | null = null;
  let budgetHit = false;
  let stageToDelete: string | null = null; // staged read of this run that is over (applied / gated / failed)

  /** Writes the SyncRuns row; if the full write is rejected, closes it with the minimal fields so it never stays 'רץ'. */
  const writeRunRow = async (final: boolean) => {
    const errorText = [...notes, ...errors].join(' | ').slice(0, 4000);
    const full: Item = { finishedAt: new Date().toISOString(), status, perTable: perTableForRow(perTable), ...(errorText ? { error: errorText } : {}) };
    if (resumeOut) full.resumeFrom = resumeOut;
    try {
      if (syncRunRowId) await client.updateItem('SyncRuns', syncRunRowId, full);
      else {
        const c = await client.createItem('SyncRuns', { runId, startedAt: startedAt.toISOString(), trigger, dryRun, brainDataAsOf: brainDataAsOf.toISOString(), ...full });
        syncRunRowId = str(c?.item?.id) || null;
      }
      console.log(`[run] SyncRuns ${final ? 'closed' : 'written (before refresh)'} status=${status}`);
    } catch (e) {
      console.error(`[run] SyncRuns full write failed: ${errText(e)} — retrying minimal`);
      if (final) errors.push(`SyncRuns: ${errText(e)}`);
      try {
        const minimal: Item = { finishedAt: full.finishedAt, status, error: (`${errText(e)} | ${errorText}`).slice(0, 4000) };
        if (syncRunRowId) await client.updateItem('SyncRuns', syncRunRowId, minimal);
        else await client.createItem('SyncRuns', { runId, startedAt: startedAt.toISOString(), trigger, dryRun, ...minimal });
      } catch (e2) {
        console.error(`[run] SyncRuns minimal write failed: ${errText(e2)}`);
      }
    }
  };

  try {
    const recentRuns = (await client.queryTable('SyncRuns', {
      from: { table: 'SyncRuns' },
      orderBy: [{ column: 'startedAt', direction: 'desc' }],
      limit: 100,
    }))?.items ?? [];
    await healStaleRuns(client, recentRuns, startedAt.getTime(), runId);
    const prevRuns = recentRuns.filter((r) => OK_STATUSES.includes(str(r.status)) && r.dryRun === false);
    const lastRows = (label: string): number | null => {
      for (const r of prevRuns) {
        const pt = parseObj(r.perTable);
        const entry = Array.isArray(pt) ? pt.find((x: any) => x?.table === label && x?.gate === 'passed' && !x?.error) : null;
        if (entry && Number.isFinite(Number(entry.sourceRows))) return Number(entry.sourceRows);
      }
      return null;
    };
    // runs still holding an unfinished staged invoice read (resumeFrom set)
    const pendingRuns = recentRuns
      .filter((r) => str(r.runId) !== runId)
      .map((r) => ({ row: r, rf: parseObj(r.resumeFrom) }))
      .filter((x) => x.rf && typeof x.rf === 'object' && str(x.rf.runId));

    // which staged read (if any) this run continues
    let resume: ResumeState | null = null;
    if (tables.includes('invoices')) {
      const given = parseObj(input?.resumeFrom);
      if (given && str(given.runId)) resume = given;
      else if (trigger === 'מתוזמן') {
        const fresh = pendingRuns.find((x) => startedAt.getTime() - new Date(x.row.startedAt).getTime() <= RESUME_WINDOW_MS);
        if (fresh) {
          resume = fresh.rf;
          console.log(`[run] scheduled: auto-resuming staged run ${resume!.runId} (from SyncRuns ${str(fresh.row.runId)})`);
        }
      }
    }
    // abandoned staged runs (older than the window, not the one resumed) → delete staging, clear their resumeFrom
    if (trigger === 'מתוזמן' && !dryRun) {
      for (const x of pendingRuns) {
        if (resume && str(x.rf.runId) === str(resume.runId)) continue;
        if (startedAt.getTime() - new Date(x.row.startedAt).getTime() <= RESUME_WINDOW_MS) continue;
        console.log(`[run] abandoning staged run ${str(x.rf.runId)}`);
        await deleteStaged(client, str(x.rf.runId));
        try { await client.updateItem('SyncRuns', str(x.row.id), { resumeFrom: null }); } catch (e) { console.error(`[run] clear resumeFrom: ${errText(e)}`); }
      }
    }

    // 1) customers — first, not under the invoice budget (but under the hard deadline for its writes)
    if (tables.includes('customers')) {
      perTable.push(await syncTable({
        client, table: 'Customers', label: 'customers', sourceTable: 'RAW.PRIORITY_1_CUSTOMERS', fields: CUSTOMER_FIELDS,
        keyOf: (r) => str(r.customerCode), lastRunSourceRows: lastRows('customers'), dryRun, runId, brainDataAsOf, deadline: hardDeadline,
        loadSource: async (warnings) => {
          const src = await readSource(client, 'RAW.PRIORITY_1_CUSTOMERS', [
            'CUSTNAME', 'CUSTDES', 'VATNUM', 'STATDES', 'PAYDES', 'PAYCODE', 'MAX_CREDIT', 'MAX_OBLIGO', 'ZMET_CREDITINSURAMNT',
            'AGENTNAME', 'AGENTCODE', 'EMAIL', 'ADDRESS', 'ADDRESS2', 'ADDRESS3', 'STATE', 'OWNERLOGIN',
          ], 'CUSTNAME', { deadline: hardDeadline });
          const raw = src.rows;
          return [{ form: null, complete: src.finished && raw.length === src.expected, read: raw.length, expected: src.expected, rows: raw.filter((r) => str(r.CUSTNAME)).map((r) => mapCustomer(r, warnings)) }];
        },
      }));
    }

    // 2) invoices — sequential pages under the read budget, staged so a later run can continue
    if (tables.includes('invoices') && pastDeadline()) {
      notes.push('חשבוניות: לא הספיק (מגבלת הזמן של ההרצה)');
    } else if (tables.includes('invoices')) {
      const stageRunId = resume ? str(resume.runId) : runId;
      if (resume) notes.push(`המשך של הרצה ${stageRunId}`);
      const stager = new Stager(client, stageRunId, startedAt.getTime());
      const cols = ['IVNUM', 'CUSTNAME', 'CDES', 'IVDATE', 'TOTPRICE', 'DEBIT', 'STATDES', 'IVRECONDATE', 'CODE', 'AGENTNAME'];
      const state: ResumeState = { runId: stageRunId };
      let readFailed = false;
      let result: TableResult;
      try {
        result = await syncTable({
          client, table: 'Invoices', label: 'invoices', sourceTable: 'RAW.PRIORITY_1_CINVOICES + RAW.PRIORITY_1_AINVOICES', fields: INVOICE_FIELDS,
          keyOf: (r) => (str(r.priorityForm) && str(r.invoiceNumber) ? `${str(r.priorityForm)}|${str(r.invoiceNumber)}` : ''),
          lastRunSourceRows: lastRows('invoices'), dryRun, runId, brainDataAsOf, deadline: hardDeadline,
          incompleteNote: () => (budgetHit ? 'נעצר במגבלת 10 הדקות לקריאה – להמשך עם resumeFrom' : ''),
          loadSource: async () => {
            readFailed = true; // cleared once both forms are read without throwing
            const staged = resume ? await readStaged(client, stageRunId) : { CINVOICES: [], AINVOICES: [] };
            if (resume) console.log(`[invoices] staged rows: CINVOICES=${staged.CINVOICES.length} AINVOICES=${staged.AINVOICES.length}`);
            const sets: SourceSet[] = [];
            for (const form of INVOICE_FORMS) {
              const table = `RAW.PRIORITY_1_${form}`;
              const prior = resume ? (resume[form] ?? null) : null;
              let src: SourceRead;
              if (prior === 'done') {
                src = { rows: [], expected: await countOf(client, table), finished: true, budgetHit: false, lastKey: 'done', pages: 0, ms: 0 };
              } else if (budgetHit) {
                // budget already spent on the first form: don't start this one
                src = { rows: [], expected: 0, finished: false, budgetHit: true, lastKey: prior, pages: 0, ms: 0 };
              } else {
                src = await readSource(client, table, cols, 'IVNUM', { after: prior, deadline: invoiceDeadline, onPage: (p) => stager.add(form, p) });
              }
              if (src.budgetHit) budgetHit = true;
              state[form] = src.finished ? 'done' : src.lastKey;
              const all = [...staged[form], ...src.rows];
              const ivs = new Set(all.map((r) => str(r.IVNUM)).filter(Boolean));
              const complete = src.finished && !src.budgetHit && all.length === src.expected && ivs.size === all.length;
              sets.push({ form, complete, read: all.length, expected: src.expected, rows: all.filter((r) => str(r.IVNUM)).map((r) => mapInvoice(form, r)) });
            }
            readFailed = false;
            return sets;
          },
        });
      } finally {
        // whatever happened, background staging writes are settled before we decide what to keep
        await stager.drain();
      }
      perTable.push(result);
      if (resume) (result as any).resumedFromRunId = stageRunId;

      if (budgetHit && !readFailed) {
        // stop: nothing applied; every page read is staged, hand back where to continue
        if (stager.error) {
          errors.push(`SyncStaging: ${stager.error} – אין אפשרות להמשיך, ההרצה הבאה תתחיל מחדש`);
          stageToDelete = stageRunId;
        } else {
          resumeOut = state;
          console.log(`[invoices] budget hit — staged ${stager.written} new rows; resumeFrom=${JSON.stringify(resumeOut)}`);
        }
      } else {
        // finished (applied, gated, or failed): this staged read is over either way — deleted in finally
        stageToDelete = stageRunId;
        if (stager.written) console.log(`[invoices] ${stager.written} rows were staged during the read; deleting them at close`);
      }
      // supersede earlier rows pointing at this staged read
      for (const x of pendingRuns) {
        if (str(x.rf.runId) !== stageRunId) continue;
        try { await client.updateItem('SyncRuns', str(x.row.id), { resumeFrom: null }); } catch (e) { console.error(`[run] clear resumeFrom: ${errText(e)}`); }
      }
    }

    for (const t of perTable) if (t.error) errors.push(`${t.table}: ${t.error}`);
    const applied = perTable.filter((t) => t.gate === 'passed' && !t.error);
    const partlyWritten = perTable.filter((t) => t.writeStoppedAtDeadline);
    const blocked = perTable.filter((t) => t.blocked);
    const skippedTable = perTable.length < tables.length;
    if (resumeOut || partlyWritten.length) status = 'הצליח חלקית';
    else if (perTable.length && blocked.length === perTable.length) status = 'נעצר בשער';
    else if (applied.length === perTable.length && perTable.length) status = skippedTable ? 'הצליח חלקית' : 'הצליח';
    else if (applied.length > 0) status = 'הצליח חלקית';
    else status = 'נכשל';

    // the counts are saved now, before the invoice layer refresh, so a later cut-off cannot lose them
    if (!dryRun) await writeRunRow(false);

    const wrote = perTable.filter((t) => t.gate === 'passed' && (t.inserted || t.updated || t.markedDeletedInSource));
    if (!dryRun && wrote.length > 0 && tables.includes('invoices')) {
      const inv = perTable.find((t) => t.table === 'invoices');
      const changed = [...new Set(inv?.changedKeys ?? [])];
      // the layer depends only on invoice rows: customer changes never need it
      if (!changed.length) {
        refreshInvoiceLayer = { skipped: 'אין חשבוניות שהשתנו' };
      } else if (pastDeadline()) {
        refreshInvoiceLayer = { skipped: 'לא הספיק' };
        notes.push('רענון שכבת החשבוניות: לא הספיק');
        if (status === 'הצליח') status = 'הצליח חלקית';
      } else {
        // only invoices whose mirror columns changed can change their layer; a large change → one full refresh.
        // Started in the background so it runs in its own time budget, never this run's.
        const refreshInput: Item = { dryRun: false };
        if (changed.length && changed.length <= REFRESH_TARGETED_MAX) refreshInput.invoiceNumbers = changed;
        const scope = refreshInput.invoiceNumbers ? `${changed.length} invoices` : `all invoices (${changed.length} changed)`;
        try {
          const started = await client.invokeActionAsync('RefreshInvoiceLayer', refreshInput);
          refreshInvoiceLayer = { started: true, async: true, workflowId: started?.workflowId ?? null, scope, invoicesRequested: refreshInput.invoiceNumbers ? changed.length : null };
          console.log(`[run] RefreshInvoiceLayer started async (${scope}) workflowId=${started?.workflowId}`);
        } catch (e) {
          console.error(`[run] RefreshInvoiceLayer async start failed: ${errText(e)} — trying a bounded synchronous call`);
          // fallback: synchronous, but never past the hard deadline (the row is closed either way)
          const left = hardDeadline - Date.now();
          const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), Math.max(0, left)));
          try {
            const r: any = await Promise.race([client.invokeAction('RefreshInvoiceLayer', refreshInput), timeout]);
            if (r === 'timeout') {
              refreshInvoiceLayer = { skipped: 'לא הספיק', scope };
              notes.push('רענון שכבת החשבוניות: לא הספיק');
              if (status === 'הצליח') status = 'הצליח חלקית';
            } else {
              const out = r?.output ?? r ?? {};
              refreshInvoiceLayer = { scope, invoicesChecked: out.invoicesChecked, invoicesChanged: out.invoicesChanged, writeVerified: out.writeVerified, errors: (out.errors ?? []).slice(0, 20) };
            }
          } catch (e2) {
            refreshInvoiceLayer = { error: errText(e2) };
            errors.push(`RefreshInvoiceLayer: ${errText(e2)}`);
            if (status === 'הצליח') status = 'הצליח חלקית';
          }
        }
      }
    }
  } catch (e) {
    status = perTable.some((t) => t.gate === 'passed' && (t.inserted || t.updated)) ? 'הצליח חלקית' : 'נכשל';
    errors.push(errText(e));
    console.error(`[run] failed: ${errText(e)}`);
  } finally {
    if (stageToDelete) await deleteStaged(client, stageToDelete);
    if (status === 'רץ') status = 'נכשל';
    await writeRunRow(true);
  }

  const avg = readStats.reads ? Math.round(readStats.totalMs / readStats.reads) : 0;
  console.log(`[reads] count=${readStats.reads} total=${readStats.totalMs}ms avg=${avg}ms max=${readStats.maxMs}ms retries429=${readStats.retries} waited=${readStats.waitedMs}ms`);
  console.log(`[run] ${runId} status=${status} in ${Date.now() - startedAt.getTime()}ms`);

  return {
    runId, dryRun, status, brainDataAsOf: brainDataAsOf.toISOString(), brainDataAsOfSource,
    perTable: perTable.map(({ changedKeys, ...t }) => ({ ...t, changedInvoices: changedKeys?.length ?? undefined })),
    refreshInvoiceLayer: refreshInvoiceLayer ?? {}, errors, resumeFrom: resumeOut,
  };
};
