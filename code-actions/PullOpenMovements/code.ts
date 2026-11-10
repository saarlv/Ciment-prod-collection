import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { pullOpenMovements } from '../shared/collections-morning-pull.ts';

// Morning pull, step 2: Priority's unmatched customer movements → OpenMovements (shared/collections-morning-pull.ts).
// The Priority API is not connected yet, so this returns ok: false with reason "Priority sync not connected yet" and
// writes nothing. dryRun defaults to true. Never writes to Priority.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return pullOpenMovements(client, { dryRun: input?.dryRun, customerCodes: input?.customerCodes, importBatchId: input?.importBatchId });
};
