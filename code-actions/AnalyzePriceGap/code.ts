import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { analyzePriceGap } from '../shared/collections-price-gap.ts';

export { OUT_NO_GAP, OUT_OPENED, OUT_REFUSED, OUT_UPDATED } from '../shared/collections-price-gap.ts';

// 2d engine: compares every line of the invoice with the price list valid on the invoice date and tags a
// reason per gap line. dryRun: the analysis only. Otherwise one Disputes case per invoice (מחיר, ממתינה
// לאישור סוכן) and the internal approval-request draft (component מחירים in the outbox, never sent).
// An invoice of another customer is refused. Writes nothing to Priority.
// The logic lives in shared/collections-price-gap.ts (ApplyMailClassification uses the same function).
export const invoke = async (input: any, context: any) => analyzePriceGap(new BlocksClient(context), input);
