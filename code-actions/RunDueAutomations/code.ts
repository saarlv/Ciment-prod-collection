import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { runDueAutomations } from '../shared/collections-mail-automations.ts';

// Hourly due check (MailAutomationsRunner workflow → MailAutomationsPipeline). In Asia/Jerusalem: an active
// automation is due once today is past its day of month, or it is that day and its hour has come (a day past the end
// of a short month counts as the last day), and it has no completed scheduled run (MailAutomationRuns, trigger
// מתוזמן, status הושלמה) this month. Each due automation runs with dryRun=false, trigger מתוזמן, requestedBy
// "ריצה מתוזמנת". A failed run is recorded as נכשלה and does not stop the others (it is tried again next hour).
// Sends nothing. The logic lives in shared/collections-mail-automations.ts.
export const invoke = async (input: any, context: any) => runDueAutomations(new BlocksClient(context), input);
