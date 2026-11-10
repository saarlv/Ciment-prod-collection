import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { addDays, resolveAsOf } from '../shared/collections-dates.ts';
import { readAll, readWhereIn, str } from '../shared/collections-data.ts';
import { readPayingProposals } from '../shared/collections-invoice-layer.ts';
import { BANK_LINE_KINDS, batchWorkDay, workDayOf } from '../shared/collections-receipts.ts';
import { BROKEN_CARRY_DAYS, computeWeekBrief, NO_NOTE_DAYS, weekOf } from './brief.ts';

// Read only. The home screen's two summaries: the calendar week (Sunday..Saturday, Asia/Jerusalem) as the aging
// report sees it – what falls due, commitments (CustomerNotes), disputes to follow up (בירור notes), commitments not
// kept, overdue customers with no recent note, with deterministic Hebrew conclusions and KPIs – and today's bank work day
// of receipts (Friday/Saturday count as Thursday): bank files and Priority bank-line pulls, money received (העברה /
// זיכוי בנק – not פירעון צ׳ק / אחר), matched, waiting, still to match.
// bookkeeperName limits both to one bookkeeper's customers (CustomerOwners override, else Priority). See ./brief.ts.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const asOfDate = resolveAsOf(input?.asOfDate);
  const bookkeeperName = str(input?.bookkeeperName).trim() || null;
  const { start, end } = weekOf(asOfDate);
  const workDay = workDayOf(asOfDate);

  // round trip 1: everything the week needs, and the bank files
  const [customers, owners, invoices, notes, payingMatches, lastSynced, allBatches] = await Promise.all([
    readAll(client, 'Customers'),
    readAll(client, 'CustomerOwners'),
    readAll(client, 'Invoices', { column: 'openAmount', operator: '!=', value: 0 }),
    // CustomerNotes: the active ones, those written lately (overdue without a note) and the commitments dated from the
    // carry window on (kept / not kept ones of this week included)
    readAll(client, 'CustomerNotes', {
      or: [
        { column: 'status', value: 'פעילה' },
        { column: 'noteCreatedAt', operator: '>=', value: `${addDays(asOfDate, -NO_NOTE_DAYS)}T00:00:00.000Z` },
        { and: [{ column: 'actionDate', operator: '>=', value: addDays(start, -BROKEN_CARRY_DAYS) }, { column: 'actionDate', operator: '<=', value: end }] },
      ],
    }),
    readPayingProposals(client),
    client
      .queryTable('Invoices', {
        from: { table: 'Invoices' },
        where: { column: 'syncedAt', operator: 'is not null' },
        orderBy: [{ column: 'syncedAt', direction: 'desc' }],
        limit: 1,
      })
      .then((r) => (r?.items ?? []) as Item[])
      .catch(() => [] as Item[]),
    readAll(client, 'ImportBatches', { column: 'kind', operator: 'in', value: BANK_LINE_KINDS }),
  ]);

  // round trip 2: the work day's bank lines and their proposals
  const batches = allBatches.filter((b) => batchWorkDay(b) === workDay);
  const batchIds = batches.map((b) => str(b.id)).filter(Boolean);
  const [lines, lineProposals] = batchIds.length
    ? await Promise.all([readWhereIn(client, 'BankLines', 'importBatchId', batchIds), readWhereIn(client, 'MatchProposals', 'importBatchId', batchIds)])
    : [[] as Item[], [] as Item[]];

  return computeWeekBrief({
    asOfDate,
    bookkeeperName,
    customers,
    owners,
    invoices,
    notes,
    payingMatches,
    lastSynced,
    batches,
    lines,
    lineProposals,
  });
};
