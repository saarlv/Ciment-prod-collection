import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { decideApprovals } from '../shared/collections-approval-decision.ts';

export { APPROVED, REJECTED } from '../shared/collections-approval-decision.ts';

// A person's decision on outbound drafts in Approvals (approve → אושר – לא נשלח, reject → נדחה, edit). The logic lives
// in shared/collections-approval-decision.ts, which ApplyMailClassification's auto-reply (mailAutoReplyAt) also uses,
// so an automatic approval writes exactly what a person's click writes.
export const invoke = async (input: any, context: any) => decideApprovals(new BlocksClient(context), input);
