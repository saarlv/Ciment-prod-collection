import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { str } from '../shared/collections-data.ts';
import { closeSettledNotes } from '../shared/collections-note-runs.ts';

// Closes the notes of every customer + due month whose OpenMovements total reached 0 ₪ (plan 04.11 part A, stage 2):
// status נסגרה – החודש התאפס, closedAt; an active commitment not yet קוימה becomes קוימה (amountRemaining 0, checkedAt).
// A month with no movements left counts as 0. An empty OpenMovements table closes nothing (reported in skipped).
// RunDaySchedule runs it after each successful pull. The grouped note tasks then drop the closed notes' rows.
// customerCode limits the run. dryRun defaults to true. Rules: shared/collections-note-runs.ts.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return closeSettledNotes(client, {
    customerCode: str(input?.customerCode).trim() || null,
    asOfDate: str(input?.asOfDate).trim() || null,
    dryRun: input?.dryRun !== false && input?.dryRun !== 'false',
  });
};
