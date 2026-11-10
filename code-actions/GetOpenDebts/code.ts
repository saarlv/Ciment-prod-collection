import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf } from '../shared/collections-dates.ts';
import { clean } from '../shared/collections-mail.ts';
import { loadOpenDebts } from '../shared/collections-ledger.ts';

// Read-only. A customer's open documents as of a date – the customer's OpenMovements rows (Priority's open movements
// per due month; the same builder feeds the open-debts PDF) – with due date, days overdue and open amount; totals (open, overdue, not yet due – credit notes net in by due date, as in
// the aging); the end-of-card balance (last LedgerEntries running balance, else Customers.ledgerBalance);
// and the receipts still waiting for a match (undecided MatchProposals, open bank lines of the customer).
// movementsMirrorEmpty = the whole OpenMovements table is empty (pull never ran): the documents are unknown.
export const invoke = async (input: any, context: any) => {
  const customerCode = clean(input?.customerCode);
  if (!customerCode) throw new Error('customerCode is required');
  const asOf = resolveAsOf(input?.asOfDate);
  const client = new BlocksClient(context);
  return loadOpenDebts(client, customerCode, asOf);
};
