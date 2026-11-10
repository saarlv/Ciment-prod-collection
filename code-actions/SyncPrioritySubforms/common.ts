import type { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { errText, str } from '../shared/priority-direct.ts';

export interface RunCtx {
  client: BlocksClient;
  runId: string;
  dryRun: boolean;
  resume: boolean;
  nowIso: string;
  /** no new Priority read starts after this */
  readDeadline: number;
  /** nothing new (reads or writes) starts after this */
  hardDeadline: number;
}

export interface ScopeResult {
  scope: 'contacts' | 'payments';
  table: string;
  sourceTable: string;
  mode: string;
  calls: number;
  sourceRows: number;
  expectedRows: number | null;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedAppRows: number;
  markedDeletedInSource: number;
  pendingCount: number;
  complete: boolean;
  needsResume: boolean;
  writeVerified: boolean | null;
  gate: 'passed' | 'incomplete read' | 'blocked' | 'not-run';
  error: string | null;
  notes: string[];
  [k: string]: any;
}

export function newResult(scope: 'contacts' | 'payments', table: string, sourceTable: string): ScopeResult {
  return {
    scope, table, sourceTable, mode: '', calls: 0, sourceRows: 0, expectedRows: null, inserted: 0, updated: 0, unchanged: 0,
    skippedAppRows: 0, markedDeletedInSource: 0, pendingCount: 0, complete: false, needsResume: false, writeVerified: null,
    gate: 'not-run', error: null, notes: [],
  };
}

export async function loadCursor(client: BlocksClient, scope: string): Promise<Item | null> {
  const r = await client.queryTable('PrioritySyncCursors', { from: { table: 'PrioritySyncCursors' }, where: { column: 'scope', value: scope }, limit: 1 });
  const row = r?.items?.[0] ?? null;
  if (row && typeof row.cursor === 'string') {
    try {
      row.cursor = JSON.parse(row.cursor);
    } catch {
      row.cursor = {};
    }
  }
  return row;
}

/** Upserts the scope's cursor row. Never called on a dry run. */
export async function saveCursor(ctx: RunCtx, scope: string, existingId: string | null, fields: Item): Promise<string | null> {
  if (ctx.dryRun) return existingId;
  const row = { ...fields, scope, updatedAt: new Date().toISOString() };
  if (existingId) {
    await ctx.client.updateItem('PrioritySyncCursors', existingId, row);
    return existingId;
  }
  const c = await ctx.client.createItem('PrioritySyncCursors', row);
  return str(c?.item?.id) || null;
}

/** Reads back up to 10 written keys and checks they carry this run's syncRunId. */
export async function verifySample(ctx: RunCtx, table: string, keyCol: string, keys: string[]): Promise<boolean | null> {
  if (ctx.dryRun || !keys.length) return null;
  const sample = keys.length <= 10 ? keys : Array.from({ length: 10 }, (_, i) => keys[Math.floor((i * keys.length) / 10)]);
  try {
    const r = await ctx.client.queryTable(table, { from: { table }, where: { column: keyCol, operator: 'in', value: sample }, limit: 100 });
    const got = new Map((r?.items ?? []).map((x) => [str(x[keyCol]), x]));
    const ok = sample.every((k) => got.has(k) && str(got.get(k)!.syncRunId) === ctx.runId);
    console.log(`[verify] ${table} ${sample.length} sampled → ${ok ? 'ok' : 'MISMATCH'}`);
    return ok;
  } catch (e) {
    console.error(`[verify] ${table} failed: ${errText(e)}`);
    return false;
  }
}

/** Priority boolean-ish flag ('Y', true, 1). */
export const flag = (v: unknown) => v === true || v === 1 || /^(y|1|true)$/i.test(str(v).trim());
