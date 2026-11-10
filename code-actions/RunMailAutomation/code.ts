import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { runInputOf, runMailAutomation } from '../shared/collections-mail-automations.ts';

// Runs one mail automation (MailAutomations row) now – from the inbox automations tab (הרץ עכשיו, and the template
// preview while editing) or from RunDueAutomations. Today the only kind is the monthly open-debts mail: the shared
// open-debts batch with the automation's audience, templates and mailbox. dryRun (default) returns the eligible and
// excluded customers and, with previewCustomerCode, that customer's rendered subject, body and a preview PDF – no
// table row is written. A real run writes the outbox drafts (component מנה חודשית, a re-run in the same month
// replaces that month's pending drafts), one MailAutomationRuns row, and lastRunAt / lastRunSummary. subject/body
// overrides apply to this run only. Sends nothing. The logic lives in shared/collections-mail-automations.ts.
export const invoke = async (input: any, context: any) => runMailAutomation(new BlocksClient(context), runInputOf(input));
