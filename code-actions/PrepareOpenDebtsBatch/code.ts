import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf } from '../shared/collections-dates.ts';
import { str } from '../shared/collections-data.ts';
import { parseCodes, runOpenDebtsBatch } from '../shared/collections-open-debts-batch.ts';

export {
  candidateOf,
  draftFor,
  evaluateBatch,
  KIND,
  REASON_CREDIT,
  REASON_DO_NOT_CONTACT,
  REASON_NO_CONTACT,
  REASON_NOT_FOUND,
  REASON_RECEIPTS,
  REASON_ZERO,
  renderTemplate,
  type Candidate,
} from '../shared/collections-open-debts-batch.ts';

// The open-debts batch as of asOfDate (batch screen; the monthly mail automation runs the same shared logic through
// RunMailAutomation / RunDueAutomations). Eligible: a debit end-of-card balance, not doNotContact, no receipts
// waiting for a match, a registered accounts contact; customerCodes limits it to those customers. Each exclusion
// carries its Hebrew reason. Every eligible customer gets an open-debts PDF in Yaniv's layout (shared statement
// template) and one outbox draft (component מנה חודשית, batchId open-debts-YYYY-MM, CIM reference), rendered from
// subjectTemplate / bodyTemplate when given. A re-run replaces the batch's pending drafts. `scheduled` is accepted
// and ignored (the schedule lives in MailAutomations). dryRun (default) lists only. Sends nothing.
// The logic lives in shared/collections-open-debts-batch.ts.
export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun !== false && input?.dryRun !== 'false';
  const asOf = resolveAsOf(input?.asOfDate);
  return runOpenDebtsBatch(new BlocksClient(context), {
    asOf,
    dryRun,
    customerCodes: parseCodes(input?.customerCodes),
    subjectTemplate: str(input?.subjectTemplate) || null,
    bodyTemplate: str(input?.bodyTemplate) || null,
    automationId: str(input?.automationId).trim() || null,
    mailboxId: str(input?.mailboxId).trim() || null,
    requestedBy: str(input?.requestedBy).trim() || null,
  });
};
