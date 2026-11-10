import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { refreshInvoiceLayer } from '../shared/collections-invoice-layer.ts';

// Recomputes the app layer on Invoices (payment seen, paymentStatus / remainingAmount / receiptKeys, openDisputeId,
// subStatus) from ReceiptAllocations of our Receipts (approved MatchProposals without a receipt still count) and open
// Disputes, with the same shared code every writer runs after its writes. Only rows whose layer values change are written
// (the layer columns and layerUpdatedAt, never a Priority column), then read back. dryRun (default true) only
// reports the changes. Used once to backfill and as a repair tool.
const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun !== false && input?.dryRun !== 'false';
  const client = new BlocksClient(context);
  return refreshInvoiceLayer(client, {
    invoiceNumbers: listOf(input?.invoiceNumbers),
    customerCodes: listOf(input?.customerCodes),
    dryRun,
  });
};
