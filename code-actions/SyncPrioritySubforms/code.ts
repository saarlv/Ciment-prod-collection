// SyncPrioritySubforms — reads Priority subforms directly (ReadEntitySet only, read-only) into CustomerContacts and
// Payments. One SyncRuns row per run (syncKind priority-direct), always closed in finally.
import { BlocksClient, type Item } from '../shared/blocks/blocks-client.ts';
import { errText, str, priorityStats } from '../shared/priority-direct.ts';
import type { RunCtx, ScopeResult } from './common.ts';
import { runContacts } from './contacts.ts';
import { runPayments } from './payments.ts';

const READ_BUDGET_MS = 10 * 60 * 1000;
const HARD_DEADLINE_MS = 12.5 * 60 * 1000;
const STALE_RUN_MS = 20 * 60 * 1000;
const INTERRUPTED_ERROR = 'הריצה נקטעה לפני סגירה (כנראה תם הזמן); מה שנכתב נשמר, וההרצה הבאה תמשיך מהסמן';
const PER_TABLE_FIELDS = ['table', 'sourceTable', 'sourceRows', 'expectedRows', 'inserted', 'updated', 'unchanged', 'markedDeletedInSource', 'writeVerified', 'gate', 'error'] as const;

async function healStaleRuns(client: BlocksClient, now: number) {
  try {
    const r = await client.queryTable('SyncRuns', {
      from: { table: 'SyncRuns' },
      where: { and: [{ column: 'syncKind', value: 'priority-direct' }, { column: 'status', value: 'רץ' }] },
      limit: 50,
    });
    for (const row of r?.items ?? []) {
      const started = new Date(row.startedAt).getTime();
      if (!Number.isFinite(started) || now - started < STALE_RUN_MS) continue;
      console.log(`[heal] closing stale run ${str(row.runId)} started ${str(row.startedAt)}`);
      await client.updateItem('SyncRuns', str(row.id), { status: 'הצליח חלקית', finishedAt: new Date(started + 15 * 60 * 1000).toISOString(), error: INTERRUPTED_ERROR });
    }
  } catch (e) {
    console.error(`[heal] ${errText(e)}`);
  }
}

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const dryRun = input?.dryRun !== false;
  const resume = input?.resume !== false;
  const wanted: string[] = Array.isArray(input?.scopes) && input.scopes.length ? input.scopes : ['contacts', 'payments'];
  const scopes = (['contacts', 'payments'] as const).filter((s) => wanted.includes(s));
  const trigger = ['מתוזמן', 'ידני', 'אחרי כתיבה'].includes(input?.trigger) ? input.trigger : 'ידני';
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const ctx: RunCtx = {
    client, runId, dryRun, resume, nowIso: startedAt.toISOString(),
    readDeadline: startedAt.getTime() + READ_BUDGET_MS,
    hardDeadline: startedAt.getTime() + HARD_DEADLINE_MS,
  };
  console.log(`[run] ${runId} dryRun=${dryRun} resume=${resume} scopes=${scopes.join(',')} trigger=${trigger}`);

  const errors: string[] = [];
  const perScope: ScopeResult[] = [];
  let status = 'נכשל';
  let rowId: string | null = null;

  try {
    await healStaleRuns(client, startedAt.getTime());
    try {
      const c = await client.createItem('SyncRuns', {
        runId, syncKind: 'priority-direct', startedAt: ctx.nowIso, trigger, dryRun, status: 'רץ', perTable: [],
      });
      rowId = str(c?.item?.id) || null;
    } catch (e) {
      errors.push(`SyncRuns: ${errText(e)}`);
    }

    for (const scope of scopes) {
      if (Date.now() >= ctx.hardDeadline) {
        errors.push(`${scope}: לא הורץ — נגמר הזמן`);
        continue;
      }
      const r = scope === 'contacts' ? await runContacts(ctx) : await runPayments(ctx);
      perScope.push(r);
      if (r.error) errors.push(`${scope}: ${r.error}`);
    }

    const allComplete = perScope.length === scopes.length && perScope.every((r) => r.complete && !r.error);
    if (allComplete) status = 'הצליח';
    else if (perScope.some((r) => r.calls > 0)) status = 'הצליח חלקית';
    else status = 'נכשל';
  } catch (e) {
    errors.push(errText(e));
    status = perScope.length ? 'הצליח חלקית' : 'נכשל';
  } finally {
    if (status === 'רץ') status = 'נכשל';
    const notes = perScope.flatMap((r) => r.notes.map((n) => `${r.scope}: ${n}`));
    const errorText = [...errors, ...notes].join(' | ').slice(0, 4000);
    const perTable = perScope.map((r) => Object.fromEntries(PER_TABLE_FIELDS.map((k) => [k, r[k] ?? null])));
    const full: Item = { finishedAt: new Date().toISOString(), status, perTable, error: errorText || null };
    try {
      if (rowId) await client.updateItem('SyncRuns', rowId, full);
      else await client.createItem('SyncRuns', { runId, syncKind: 'priority-direct', startedAt: ctx.nowIso, trigger, dryRun, ...full });
    } catch (e) {
      console.error(`[run] SyncRuns close failed: ${errText(e)} — retrying minimal`);
      try {
        const minimal = { finishedAt: full.finishedAt, status, error: `${errText(e)} | ${errorText}`.slice(0, 4000) };
        if (rowId) await client.updateItem('SyncRuns', rowId, minimal);
      } catch (e2) {
        console.error(`[run] SyncRuns minimal close failed: ${errText(e2)}`);
      }
    }
    console.log(`[run] ${runId} status=${status} priorityCalls=${priorityStats.calls} retries429=${priorityStats.retries} waited=${priorityStats.waitedMs}ms in ${Date.now() - startedAt.getTime()}ms`);
  }

  return {
    runId,
    dryRun,
    status,
    perScope: perScope.map(({ notes, ...r }) => ({ ...r, notes })),
    needsResume: perScope.some((r) => r.needsResume && !r.complete),
    errors,
  };
};
