import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { ingestEmail } from '../shared/collections-ingest.ts';

export { buildPrompt } from '../shared/collections-ingest.ts';

// Provider-independent intake of one inbound email (component 04). Skips a duplicate messageId; finds the
// mailbox (Mailboxes → mailboxId); threading in order: the threadId of an outbox row (Approvals.threadId), a
// CIM-<id> reference in the subject or body (Approvals.referenceCode), the threadId of an earlier inbound
// email – a match marks the row isThreadReply (threadOf / linkedTable / linkedId) and shouldProcess=false, so
// the DAG sends it to AttachThreadReply instead of Maya. Customer candidates from the data
// (classificationQuotes.candidates) and the strongest one (customerCode / customerMatchMethod); hard sender
// verification (registered contact of that customer, or a SalesAgent authorised for it) with
// verificationBasis and senderRole. Writes handlingState לא טופל, category אחר, classifiedBy קוד, the reply
// deadline and the owning bookkeeper. Sends nothing. The logic lives in shared/collections-ingest.ts.
export const invoke = async (input: any, context: any) => ingestEmail(new BlocksClient(context), input);
