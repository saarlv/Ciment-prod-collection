import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { noteWriteSyncs } from '../shared/collections-note-runs.ts';
import { writeCustomerNote } from '../shared/collections-notes.ts';

// Adds a note for a customer + due month to CustomerNotes (plan 04.11 part A, stage 2) – the only note writer (the old
// aging notes / payment promises are gone). Always a new row. customer = the Customers row id (from customerCode), balanceAtNote =
// the month's OpenMovements total now, status פעילה, a commitment starts with outcome פתוחה. Refuses (writes nothing)
// on an unknown customer, a month that is not YYYY-MM, an active type without actionDate, אחר without text or a
// negative amount. With sourceEmailId it approves Maya's promise proposal on the email (one commitment, noteSource
// מאיה ממייל; a second approval is refused). taskPreview says which grouped task will open and when. Afterwards the
// grouped note tasks and the email's task are synced (never fails the write). dryRun (default false) only reports.
// All the rules: shared/collections-notes.ts writeCustomerNote. Never writes to Priority or contacts anyone.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const r = await writeCustomerNote(client, input ?? {}, noteWriteSyncs('AddCustomerNote'));
  return {
    dryRun: r.dryRun,
    note: r.note,
    taskPreview: r.taskPreview,
    refused: r.refused,
    refusalReason: r.refusalReason,
    existingNoteId: r.existingNoteId,
    taskSync: r.taskSync,
    ...(r.email !== undefined ? { email: r.email } : {}),
    writeVerified: r.writeVerified,
    errors: r.errors,
  };
};
