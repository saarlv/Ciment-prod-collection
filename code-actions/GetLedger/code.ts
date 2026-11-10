import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { clean } from '../shared/collections-mail.ts';
import { loadLedger, resolveRange } from '../shared/collections-ledger.ts';

// Read-only. A customer's ledger card (כרטסת) from the LedgerEntries mirror for a date range: entries in
// card order with debit, credit and running balance, the opening balance before the range and the
// closing balance at the end of the range. Says plainly when the mirror has no rows for the customer.

export const invoke = async (input: any, context: any) => {
  const customerCode = clean(input?.customerCode);
  if (!customerCode) throw new Error('customerCode is required');
  const { fromDate, toDate } = resolveRange(input);
  const client = new BlocksClient(context);
  const res = await loadLedger(client, customerCode, fromDate, toDate);
  return { ...res, syncedAt: res.syncedAt ?? '' };
};
