import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { pullOpenOrders } from '../shared/collections-morning-pull.ts';

// Morning pull, step 3: Priority's אובליגו screen → CustomerExposure + ExposureItems (shared/collections-morning-pull.ts).
// The Priority API is not connected yet, so this returns ok: false with reason "Priority sync not connected yet" and
// writes nothing. dryRun defaults to true. Never writes to Priority.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return pullOpenOrders(client, { dryRun: input?.dryRun, importBatchId: input?.importBatchId });
};
