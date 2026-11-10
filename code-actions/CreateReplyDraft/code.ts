import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { createReplyDraft, REPLY_KIND } from '../shared/collections-reply.ts';

// Creates – or, while it is still ממתין, replaces – the one reply draft for an InboundEmails row in
// Approvals (kind מענה ללקוח, to the original sender, from the mailbox the mail arrived in, draftedBy
// מאיה, status ממתין), through the shared outbox helper (component פניות, referenceCode CIM-<id> at the end
// of the subject, mailboxId), signed in the owning bookkeeper's name from the data. Refused (nothing
// written) when it would hand customer data to a sender who is not מאומת: any attachment, or a reply to a
// כרטסת / חובות פתוחים email. Sets the email to טיוטה מוכנה. There is no send.
// The logic lives in shared/collections-reply.ts (ApplyMailClassification uses the same function).

export const KIND = REPLY_KIND;

export const invoke = async (input: any, context: any) => createReplyDraft(new BlocksClient(context), input);
