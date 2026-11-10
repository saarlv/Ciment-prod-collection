import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { str } from '../shared/collections-data.ts';
import { checkCommitments } from '../shared/collections-note-runs.ts';

// Sets the outcome of payment commitments (CustomerNotes התחייבות לתשלום) – plan 04.11 part A, stage 2. Every active
// commitment whose check day (actionDate + noteTask.promise.offsetDays) has come and whose outcome is not קוימה:
// promised = amount ?? balanceAtNote; received = the customer's receipts since the note's day (Payments mirror + our
// receipts approved here, a receipt in both counted once, never credit notes); month at 0 or received ≥ promised →
// קוימה, something → קוימה חלקית, nothing → לא קוימה; amountRemaining = max(promised − received, 0). Then the grouped
// task התחייבויות שלא קוימו – ליצור קשר is synced. customerCode / noteIds limit the run. dryRun defaults to true.
// Rules: shared/collections-note-runs.ts. Never writes to Priority or contacts anyone.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return checkCommitments(client, {
    customerCode: str(input?.customerCode).trim() || null,
    noteIds: Array.isArray(input?.noteIds) ? input.noteIds.map((x: unknown) => str(x)) : null,
    asOfDate: str(input?.asOfDate).trim() || null,
    dryRun: input?.dryRun !== false && input?.dryRun !== 'false',
  });
};
