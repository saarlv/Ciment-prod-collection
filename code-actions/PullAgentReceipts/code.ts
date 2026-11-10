import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { pullAgentReceipts } from '../shared/collections-agent-receipts.ts';

// Plan 04.11 part B, stage 7: field agents' cheque receipts. Payments rows with method צ׳ק / צ׳ק דחוי and collectedBy set
// (paymentDate within sinceDays, default 14) → one Receipts row each (RCPT-AGT-<paymentRef>, receiptSource צ׳ק סוכן,
// identifyStatus אושר, receiptStatus אושרה – לא נשלחה, priorityReceiptNumber = Payments.receiptNumber; idempotent), then
// the same debt check (CheckDebt) and allocation proposal (ProposeAllocation) in-process, and the customer's active
// "צ׳ק אצל סוכן" notes of the months the cheque pays close through the notes engine. No identification, no receipt mail.
// Runs in RunDaySchedule's bank-check phase after the receipts run, and on demand. dryRun (default false) only reports.
// Never writes to Priority; sends nothing. Logic: shared/collections-agent-receipts.ts.
export const invoke = async (input: any, context: any) => pullAgentReceipts(new BlocksClient(context), input ?? {});
