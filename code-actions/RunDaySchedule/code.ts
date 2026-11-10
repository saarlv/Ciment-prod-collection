import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { runDaySchedule } from '../shared/collections-day-schedule.ts';

// The work-day decision (plan 04.11 part A), called every round hour by DayRunner (mode מתוזמן) and by the button
// "משוך עכשיו מפריוריטי" (mode ידני). Ensures the plan's AgentSettings rows (shared/plan-settings.ts), decides which
// phase is due from the hour settings and today's ImportBatches, and runs the 06:00 phase: the three pulls, then the
// morning task scan, one ImportBatches row, and the day-pull-failed task on failure (shared/collections-day-schedule.ts).
// Since stage 2 also the bank-check phases (09:00 bankCheckAt / 10:00 bankRecheckAt): is the bank statement in Priority,
// then the receipts run, a second pull, CloseSettledNotes, CheckCommitments and the grouped commitment task; the urgent
// task דף הבנק לא עלה לפריוריטי at 10:00. bankScenario feeds the bank test source. dryRun defaults to true.
// Never writes to Priority and never contacts anyone.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return runDaySchedule(client, input ?? {});
};
