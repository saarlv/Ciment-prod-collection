import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { noteWriteSyncs } from '../shared/collections-note-runs.ts';
import { updateCustomerNote } from '../shared/collections-notes.ts';

// Edits or closes one CustomerNotes row (plan 04.11 part A, stage 2). Editable: noteText, customTypeLabel (אחר only),
// actionDate, reminderDate ('' clears it), amount, dueMonth; noteType, customer, author and source never change.
// close → נסגרה ידנית (an already closed note is left as is, see notice); reopen → a manually closed note is active again
// (a note closed because its month reached 0 is not reopened). Same validation as AddCustomerNote. A commitment whose
// date, amount or month changes is reset (outcome פתוחה, received / remaining / checkedAt cleared) and checked again; a
// new month re-reads balanceAtNote. Afterwards the grouped tasks holding the note are refreshed. dryRun (default false)
// only reports. Rules: shared/collections-notes.ts updateCustomerNote. Never writes to Priority or contacts anyone.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return updateCustomerNote(client, input ?? {}, noteWriteSyncs('UpdateCustomerNote'));
};
