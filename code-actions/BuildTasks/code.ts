import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { str } from '../shared/collections-data.ts';
import { runBuildTasks } from '../shared/collections-note-tasks.ts';

// The task builder, run by the 06:00 phase of RunDaySchedule (after RefreshInvoiceLayer). Reads every
// source in scope, computes the open problems as of asOfDate and upserts them into CollectionQueue by taskKey (rules in
// shared/collections-tasks.ts and shared/collections-task-upsert.ts, which later writers call for their own scoped
// runs). Since plan 04.11 stage 2 it also builds the GROUPED note tasks (notes:<type>:<date>:<bookkeeper>,
// shared/collections-note-tasks.ts): phase 06:00 (default) = the full scan + the types whose runAt is morningPullAt;
// phase 09:00 = only the commitment task (runAt bankCheckAt), without the rest of the scan. Output noteTasks. dryRun
// defaults to true. Never writes to Priority and never contacts anyone.
const list = (v: unknown): string[] | null => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : null);

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return runBuildTasks(client, {
    asOfDate: str(input?.asOfDate).trim() || null,
    dryRun: input?.dryRun !== false,
    phase: str(input?.phase).trim() || null,
    scope: {
      sources: list(input?.sources),
      customerCode: str(input?.customerCode).trim() || null,
      bankLineIds: list(input?.bankLineIds),
      emailIds: list(input?.emailIds),
      approvalIds: list(input?.approvalIds),
    },
  });
};
