import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { addDays, israelLocalToUtcIso, resolveAsOf } from '../shared/collections-dates.ts';
import { errText, num, numberSetting, readAll, readSettings, str } from '../shared/collections-data.ts';
import { searchEmails } from './search.ts';

// Read-only search of InboundEmails of the last N days (default AgentSettings mailLookbackDays = 7) by a name (payer,
// customer, contact) and/or an amount (matches 17,424 / 17424 / 17,424.00 in subject or body). Contacts and Ciment sales
// agents rank first; mail classified לא רלוונטי is searched by subject and sender only. Nina's chat tool for "who sent
// this transfer?". Writes nothing.
const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;

export const invoke = async (input: any, context: any) => {
  const name = str(input?.name).trim();
  const amount = input?.amount === undefined || input?.amount === null || input?.amount === '' ? null : num(input.amount);
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    return { fromDate: '', emails: [], errors: [errText(e)] };
  }
  if (!name && !amount) return { fromDate: '', emails: [], errors: ['נדרש שם או סכום לחיפוש'] };

  const client = new BlocksClient(context);
  const lookback = numberSetting(await readSettings(client), 'mailLookbackDays', DEFAULT_DAYS);
  const daysIn = num(input?.days);
  const days = daysIn > 0 ? Math.min(Math.round(daysIn), MAX_DAYS) : lookback > 0 ? Math.round(lookback) : DEFAULT_DAYS;
  const limitIn = num(input?.limit);
  const limit = limitIn > 0 ? Math.min(Math.round(limitIn), MAX_LIMIT) : DEFAULT_LIMIT;
  const fromDate = addDays(asOfDate, -days);
  console.log(`SearchRecentEmails: name "${name}" amount ${amount ?? '—'} from ${fromDate}`);

  const [customers, contacts, salesAgents, mails] = await Promise.all([
    readAll(client, 'Customers'),
    readAll(client, 'CustomerContacts'),
    readAll(client, 'SalesAgents'),
    readAll(client, 'InboundEmails', { column: 'receivedAt', operator: '>=', value: israelLocalToUtcIso(fromDate, 0, 0) }),
  ]);
  const emails = searchEmails({ customers, contacts, salesAgents, mails }, { name: name || null, amount, fromDate, limit });
  console.log(`SearchRecentEmails: ${mails.length} mails in the window, ${emails.length} found`);
  return { fromDate, days, emails, errors: [] as string[] };
};
