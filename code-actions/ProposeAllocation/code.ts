import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { proposeAllocation } from '../shared/collections-allocation.ts';

// Plan 04.11 part B, stage 6: the allocation proposal of one receipt – the customer's open invoices (OpenMovements, minus
// every ReceiptAllocations row on them) by due month, oldest to newest from the months the debt check closed, last invoice
// partial, surplus on account, allocationConfidence; allocationAutoApproveAt (empty = off) applies it at once. IssueReceipt
// runs the same function right after the debt check; the allocation editor calls it with dryRun. Logic:
// shared/collections-allocation.ts.
export const invoke = async (input: any, context: any) => proposeAllocation(new BlocksClient(context), input ?? {});
