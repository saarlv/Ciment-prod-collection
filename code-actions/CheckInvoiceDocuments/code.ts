import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { checkInvoiceDocuments } from '../shared/collections-doc-check.ts';

// 2c engine for a "תעודות וחשבוניות חסרות" request: per invoice of the request's customer, counts the
// delivery notes, opens / updates the Disputes case, and prepares the customer package (all scanned, only to
// a מאומת sender) or the internal logistics draft (something missing). Another customer's invoice is refused.
// Drafts go to the outbox through the shared helper (component תעודות, referenceCode CIM-<id>).
// Idempotent. Writes nothing to Priority; nothing is sent.
// The logic lives in shared/collections-doc-check.ts (ApplyMailClassification uses the same function).
export const invoke = async (input: any, context: any) => checkInvoiceDocuments(new BlocksClient(context), input);
