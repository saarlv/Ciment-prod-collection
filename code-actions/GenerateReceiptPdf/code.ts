import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { generateReceiptPdf } from '../shared/collections-receipt-doc.ts';

// Builds the receipt PDF of one receipt (Receipts.receiptKey) from the one shared Hebrew RTL template
// (shared/collections-receipt-doc.ts, same look as the statement) and converts it with the platform HtmlToPdf action.
// IssueReceipt attaches exactly this PDF to the mail draft; the screen previews and downloads the same url.
// Writes no rows and sends nothing.
export const invoke = async (input: any, context: any) => {
  const r = await generateReceiptPdf(new BlocksClient(context), { receiptKey: String(input?.receiptKey ?? '').trim() });
  return { url: r.url, fileName: r.fileName, receiptKey: r.receiptKey, customerCode: r.customerCode, customerName: r.customerName, errors: r.errors };
};
