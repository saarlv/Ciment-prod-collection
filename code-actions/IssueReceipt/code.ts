import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { issueReceipts } from '../shared/collections-issue-receipt.ts';

// Plan 04.11 part B, stage 4: a person approves the customer of identified bank lines (mode certain = "אשר את כל
// הוודאיים", mode one = one line with a confirmed / picked customer) and the approval issues the receipt: אושרה – לא
// נשלחה, the receipt PDF and a mail draft to the customer's accounts-payable contact (or the task חסר איש קשר הנהלת
// חשבונות). Idempotent; nothing is sent and nothing is written to Priority. The logic lives in
// shared/collections-issue-receipt.ts (IdentifyCustomers' automatic approval calls the same function).
export const invoke = async (input: any, context: any) => {
  const mode = String(input?.mode ?? '').trim();
  // 'auto' is internal to IdentifyCustomers (customerAutoApproveAt) – not a mode of this action
  if (mode === 'auto') return { ok: false, dryRun: input?.dryRun === true, issued: [], skipped: [], writeVerified: false, taskSync: null, errors: ['מצב לא מוכר: "auto" (certain / one)'] };
  return issueReceipts(new BlocksClient(context), input ?? {});
};
