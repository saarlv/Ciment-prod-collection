import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { applyAllocation } from '../shared/collections-allocation.ts';

// Plan 04.11 part B, stage 6: approves the allocation of one receipt (the editor's click, or the automatic threshold):
// validates, replaces the receipt's ReceiptAllocations rows, updates the receipt's allocated / unallocated / matchStatus and
// opens or closes the task קבלה – צריך פיזור (allocate:<receiptKey>). Never writes to Priority. Logic:
// shared/collections-allocation.ts.
export const invoke = async (input: any, context: any) => applyAllocation(new BlocksClient(context), input ?? {});
