import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { refreshCustomerAggregates } from '../shared/collections-customer-aggregates.ts';

// Calc layer (6b): the ledger balance columns on Customers from OpenMovements and documentCount / lastDocumentDate from
// Invoices (shared/collections-customer-aggregates.ts). dryRun (default true) only reports; a real run writes only the
// changed rows and reads them back (writeVerified). Never writes to Priority.
const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun !== false && input?.dryRun !== 'false';
  const client = new BlocksClient(context);
  return refreshCustomerAggregates(client, { customerCodes: listOf(input?.customerCodes), dryRun });
};
