import { BlocksClient, Item, WhereClause } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf } from '../shared/collections-dates.ts';
import { errText, readAll, readSettings, str } from '../shared/collections-data.ts';
import { severityConfigFrom } from '../shared/collections-severity.ts';
import {
  buildSummaryPrompt,
  computeCustomerFact,
  type CustomerFact,
  DISPUTE_CLOSED_STATUS,
  factOrder,
  MAX_AGENT_CUSTOMERS,
  needsSummary,
  OPEN_TASK_STATUSES,
} from '../shared/collections-customer-summary.ts';

// First step of CustomerSummaryRun. Read only. Picks the customers (one customerCode, or every customer with an open
// balance, an open task or an open promise), computes each one's facts as of asOfDate with the shared summary code
// and returns the prompt for Iris plus facts[] for WriteCustomerSummaries. Maya's pending promise proposals
// (InboundEmails) and receipt tasks (CollectionQueue תקבולים) count as open tasks. At most MAX_AGENT_CUSTOMERS
// customers (largest overdue first) go into the prompt; the rest are in facts with inPrompt false and get the code
// summary from WriteCustomerSummaries.
// The note facts come from CustomerNotes only (the old aging notes / payment promises were removed in wave 3): open
// commitments, commitments not kept / partly kept (with what came in and what is left), active notes and the latest
// note. The output contract is unchanged.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const errors: string[] = [];
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    return { asOfDate: str(input?.asOfDate), customerCount: 0, hasCustomers: false, prompt: '', facts: [], errors: [errText(e)] };
  }
  const only = str(input?.customerCode).trim();
  const byCode = (w?: WhereClause): WhereClause | undefined =>
    only ? (w ? { and: [{ column: 'customerCode', value: only }, w] } : { column: 'customerCode', value: only }) : w;

  const [customers, invoices, tasks, disputes, interactions, emails, settings, customerNotes] = await Promise.all([
    readAll(client, 'Customers', byCode()),
    readAll(client, 'Invoices', byCode({ column: 'openAmount', operator: '!=', value: 0 })),
    readAll(client, 'CollectionQueue', byCode({ column: 'status', operator: 'in', value: OPEN_TASK_STATUSES })),
    readAll(client, 'Disputes', byCode({ column: 'status', operator: '!=', value: DISPUTE_CLOSED_STATUS })),
    readAll(client, 'Interactions', byCode()),
    readAll(client, 'InboundEmails', byCode({ column: 'customerCode', operator: 'is not null' })),
    readSettings(client),
    readAll(client, 'CustomerNotes', byCode()),
  ]);

  const group = (rows: Item[]) => {
    const m = new Map<string, Item[]>();
    for (const r of rows) {
      const code = str(r.customerCode).trim();
      if (!code) continue;
      if (!m.has(code)) m.set(code, []);
      m.get(code)!.push(r);
    }
    return m;
  };
  const g = {
    invoices: group(invoices),
    tasks: group(tasks),
    disputes: group(disputes),
    interactions: group(interactions),
    emails: group(emails),
    customerNotes: group(customerNotes),
  };
  const customerByCode = new Map(customers.map((c) => [str(c.customerCode).trim(), c]));

  let codes: string[];
  if (only) {
    if (!customerByCode.has(only) && !g.invoices.has(only)) {
      return { asOfDate, customerCount: 0, hasCustomers: false, prompt: '', facts: [], errors: [`לקוח ${only} לא נמצא`] };
    }
    codes = [only];
  } else {
    // candidates: anyone with an open invoice, an open task, an open promise or a pending email proposal
    const activeCommitmentCodes = customerNotes.filter((n) => str(n.status) === 'פעילה' && str(n.noteType) === 'התחייבות לתשלום').map((n) => str(n.customerCode).trim()).filter(Boolean);
    codes = [...new Set([...g.invoices.keys(), ...g.tasks.keys(), ...g.emails.keys(), ...activeCommitmentCodes])];
  }

  const severity = severityConfigFrom(settings);
  const facts: CustomerFact[] = [];
  for (const code of codes) {
    try {
      const fact = computeCustomerFact(
        asOfDate,
        {
          customerCode: code,
          customer: customerByCode.get(code),
          invoices: g.invoices.get(code) ?? [],
          tasks: g.tasks.get(code) ?? [],
          disputes: g.disputes.get(code) ?? [],
          interactions: g.interactions.get(code) ?? [],
          emails: g.emails.get(code) ?? [],
          customerNotes: g.customerNotes.get(code) ?? [],
        },
        severity,
      );
      // the card's refresh summarises its customer even when the account is clean
      if (only || needsSummary(fact)) facts.push(fact);
    } catch (e) {
      errors.push(`לקוח ${code}: ${errText(e)}`);
    }
  }
  facts.sort(factOrder);
  facts.forEach((f, i) => (f.inPrompt = i < MAX_AGENT_CUSTOMERS));
  const inPrompt = facts.filter((f) => f.inPrompt);

  return {
    asOfDate,
    customerCount: facts.length,
    promptCustomerCount: inPrompt.length,
    hasCustomers: inPrompt.length > 0,
    prompt: inPrompt.length ? buildSummaryPrompt(asOfDate, inPrompt) : '',
    facts,
    errors,
  };
};
