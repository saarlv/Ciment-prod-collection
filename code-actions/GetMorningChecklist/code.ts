import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { formatDayMonth, hebrewDayName, previousBusinessDay, resolveAsOf, sortableTime, toIsraelDate } from '../shared/collections-dates.ts';
import { readAll, str } from '../shared/collections-data.ts';

// Read only. The two mandatory morning uploads for asOfDate:
// - the bank file of the previous business day (Sun–Thu; on Sunday that is Thursday)
// - the open-invoices file, with data from the previous business day or later
const BANK = 'קובץ בנק';
const OPEN_INVOICES = 'חשבוניות פתוחות';

const latest = (rows: Item[]) =>
  [...rows].sort((a, b) => sortableTime(b.uploadedAt) - sortableTime(a.uploadedAt) || sortableTime(b.dataDate) - sortableTime(a.dataDate))[0];

const taskOf = (kind: string, label: string, requiredDataDate: string, batch: Item | undefined) => ({
  kind,
  label,
  requiredDataDate,
  done: !!batch,
  importBatchId: batch ? str(batch.id) : null,
  fileName: batch ? str(batch.fileName) : null,
  uploadedAt: batch?.uploadedAt ?? null,
  uploadedBy: batch ? str(batch.uploadedBy) : null,
  dataDate: batch ? toIsraelDate(batch.dataDate) : null,
});

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const asOfDate = resolveAsOf(input?.asOfDate);
  const pbd = previousBusinessDay(asOfDate);

  const batches = await readAll(client, 'ImportBatches', {
    and: [
      { column: 'kind', operator: 'in', value: [BANK, OPEN_INVOICES] },
      { column: 'status', value: 'נכתב' },
    ],
  });

  const bankDone = latest(batches.filter((b) => b.kind === BANK && b.status === 'נכתב' && toIsraelDate(b.dataDate) === pbd));
  const invDone = latest(
    batches.filter((b) => {
      const dd = toIsraelDate(b.dataDate);
      return b.kind === OPEN_INVOICES && b.status === 'נכתב' && !!dd && dd >= pbd;
    }),
  );

  const tasks = [
    taskOf(BANK, `להעלות את קובץ הבנק של ${hebrewDayName(pbd)} ${formatDayMonth(pbd)}`, pbd, bankDone),
    taskOf(OPEN_INVOICES, 'להעלות את קובץ החשבוניות הפתוחות', pbd, invDone),
  ];

  return {
    asOfDate,
    previousBusinessDay: pbd,
    allDone: tasks.every((t) => t.done),
    tasks,
  };
};
