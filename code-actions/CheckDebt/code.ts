import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { checkDebt } from '../shared/collections-debt-check.ts';

// Plan 04.11 part B, stage 5: the debt check of approved receipts against the customer's OpenMovements per due month
// (נסגר לאפס – מצטבר / נסגר לאפס – חודש אחד → alert נסגר לאפס + פיזור מוצע – לאישור; otherwise לברר מול הלקוח with the
// task debt-check:<receiptKey>). IssueReceipt runs the same function in-process right after each approval; this action is
// the on-demand entry. Idempotent; never writes to Priority, sends nothing. Logic: shared/collections-debt-check.ts.
export const invoke = async (input: any, context: any) => checkDebt(new BlocksClient(context), input ?? {});
