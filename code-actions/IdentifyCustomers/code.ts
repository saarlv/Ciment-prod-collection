import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { identifyCustomers } from '../shared/collections-identify-customers.ts';

// Plan 04.11 part B, stage 4: identifies the customer of each bank line (העברה / זיכוי בנק) with a confidence 0–100 and
// stops there – one draft receipt per identified line, the identification step, the customer proposal, and the task
// זיהוי לקוח – לאישור for an uncertain line. Deterministic, no AI. dryRun defaults to true. Nothing is sent and nothing
// is written to Priority. The logic lives in shared/collections-identify-customers.ts (SyncPriorityBankLines and
// ConfirmExtractedLines call the same function); the confidence per rung is shared/collections-identify-confidence.ts.
export const invoke = async (input: any, context: any) => identifyCustomers(new BlocksClient(context), input ?? {});
