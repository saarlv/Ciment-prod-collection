// "Update my tasks now": the call every writer makes right after its own write succeeded, so CollectionQueue follows
// the record at once instead of waiting for the 06:00 scan (BuildTasks).
//
// syncTasksAfterWrite runs the task engine (collections-task-upsert.ts syncTasks, dryRun false) once per scope, in
// order, and NEVER throws: a failing task sync is reported in the summary's errors (and logged) and must never fail or
// change the writer's own result. A scope that names nothing (no ids and no customerCode) is skipped — an empty scope
// would be a full scan, which only BuildTasks runs.
import type { BlocksClient } from './blocks/blocks-client.ts';
import { errText, str } from './collections-data.ts';
import { syncTasks, type TaskScope } from './collections-task-upsert.ts';

export interface TaskSyncSummary {
  created: number;
  refreshed: number;
  reopened: number;
  autoClosed: number;
  keptClosedByPerson: number;
  /** one entry per task that was created / reopened / closed (refreshes are only counted) */
  changes: { taskKey: string; change: string; resolvedReason: string | null }[];
  writeVerified: boolean;
  errors: string[];
}

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x).trim()).filter(Boolean))] : []);

/** The scope with empty id lists dropped; null when nothing is named (never a full scan). */
export function cleanScope(s: TaskScope | null | undefined): TaskScope | null {
  if (!s) return null;
  const out: TaskScope = {};
  const bank = ids(s.bankLineIds);
  const emails = ids(s.emailIds);
  const approvals = ids(s.approvalIds);
  const code = str(s.customerCode).trim();
  if (bank.length) out.bankLineIds = bank;
  if (emails.length) out.emailIds = emails;
  if (approvals.length) out.approvalIds = approvals;
  if (code) out.customerCode = code;
  if (!bank.length && !emails.length && !approvals.length && !code) return null;
  if (Array.isArray(s.sources) && s.sources.length) out.sources = s.sources;
  return out;
}

export const emptyTaskSync = (): TaskSyncSummary => ({ created: 0, refreshed: 0, reopened: 0, autoClosed: 0, keptClosedByPerson: 0, changes: [], writeVerified: true, errors: [] });

/** Runs the engine for each scope (skipping empty ones); never throws. */
export async function syncTasksAfterWrite(
  client: BlocksClient,
  scopes: TaskScope | (TaskScope | null | undefined)[] | null | undefined,
  opts: { asOfDate?: string | null; nowIso?: string; label?: string } = {},
): Promise<TaskSyncSummary> {
  const sum = emptyTaskSync();
  const list = (Array.isArray(scopes) ? scopes : [scopes]).map(cleanScope).filter((s): s is TaskScope => !!s);
  for (const scope of list) {
    try {
      const r = await syncTasks(client, { dryRun: false, scope, asOfDate: opts.asOfDate ?? null, ...(opts.nowIso ? { nowIso: opts.nowIso } : {}) });
      sum.created += r.created;
      sum.refreshed += r.refreshed;
      sum.reopened += r.reopened;
      sum.autoClosed += r.autoClosed;
      sum.keptClosedByPerson += r.keptClosedByPerson;
      for (const c of r.changes) if (c.change !== 'refreshed') sum.changes.push({ taskKey: c.taskKey, change: c.change, resolvedReason: c.resolvedReason });
      if (!r.writeVerified) sum.writeVerified = false;
      sum.errors.push(...r.errors.map((e) => `משימות: ${e}`));
    } catch (e) {
      sum.writeVerified = false;
      sum.errors.push(`משימות: עדכון המשימות נכשל – ${errText(e)}`);
    }
  }
  if (sum.errors.length) console.warn(`${opts.label ?? 'syncTasksAfterWrite'}: ${sum.errors.join('; ')}`);
  return sum;
}
