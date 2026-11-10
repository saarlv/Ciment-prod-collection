import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { generateStatementPdf } from '../shared/collections-statement-pdf.ts';

// Builds the statement PDF of one customer – כרטסת (GetLedger data) or חובות פתוחים (GetOpenDebts
// data) – from the one shared Hebrew RTL template and converts it with the platform HtmlToPdf action.
// Returns the protected PDF url: the same url goes into Approvals.attachmentUrls and the preview, so
// preview and attachment are one file. Writes no table rows and sends nothing.
// The logic lives in shared/collections-statement-pdf.ts (ApplyMailClassification uses the same function).
export const invoke = async (input: any, context: any) => generateStatementPdf(new BlocksClient(context), input);
