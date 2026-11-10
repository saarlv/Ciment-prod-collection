/**
 * THE ONE PLACE the app writes CustomerNotes (Design 02 section 7, "כתיבה").
 *
 * Every write goes through the note engine: AddCustomerNote (new note) and UpdateCustomerNote (edit / manual close).
 * The engine resolves the customer reference, the month's balance at writing time and the grouped tasks, so the
 * screen only sends what the person filled in. No file may call useEntityCreate / useEntityUpdate on
 * CustomerNotesEntity.
 */
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AddCustomerNoteAction, UpdateCustomerNoteAction } from '@/product-types';
import { isActiveType } from '@/utils/AgingMonths';
import type { NoteType } from '@/utils/AgingMonths';
import { capitalizeName, round2 } from '@/utils/Format';

/** What the note form collects. Dates are YYYY-MM-DD; empty strings / null = not set. */
export interface NoteFields {
  noteType: NoteType;
  customTypeLabel: string;
  noteText: string;
  actionDate: string;
  reminderDate: string;
  amount: number | null;
}

export interface NewCustomerNote extends NoteFields {
  /** The Customers row id; the engine resolves the reference from customerCode, so this is informational only. */
  customerId: string | null;
  customerCode: string;
  customerName: string;
  /** YYYY-MM */
  dueMonth: string;
  /** The month's open balance on screen; the engine computes balanceAtNote itself from OpenMovements. */
  balanceAtNote: number;
  authorName: string;
}

/** What a saved note tells the screen: the engine's line about which grouped task will open, and when. */
export interface SavedNote {
  taskPreview: string | null;
}

interface EngineResult {
  refused?: boolean;
  refusalReason?: string;
  errors?: string[];
  taskPreview?: string;
}

/** The form fields as action inputs: only what the type uses (a free label only under אחר). */
function fieldInputs(f: NoteFields) {
  return {
    noteText: f.noteText.trim(),
    ...(f.noteType === 'אחר' ? { customTypeLabel: f.customTypeLabel.trim() } : {}),
    ...(f.actionDate ? { actionDate: f.actionDate } : {}),
    ...(f.amount === null ? {} : { amount: round2(f.amount) }),
  };
}

/** The engine refused the write (its Hebrew reason is the message) — shown as is, unlike a network failure. */
export class NoteRefusedError extends Error {}

/** A refused or failed engine call becomes a NoteRefusedError with its Hebrew reason, so the form shows it. */
function checked(out: unknown): EngineResult {
  const r = (out && typeof out === 'object' ? out : {}) as EngineResult;
  if (r.refused) throw new NoteRefusedError(r.refusalReason || 'ההערה לא נשמרה.');
  if (Array.isArray(r.errors) && r.errors.length > 0) throw new NoteRefusedError(r.errors.join(' · '));
  return r;
}

/** Required-field errors, the same rule the engine enforces: a date for the four active types, a label for אחר. */
export function noteFieldErrors(f: NoteFields): Partial<Record<'actionDate' | 'customTypeLabel' | 'amount', string>> {
  const errors: Partial<Record<'actionDate' | 'customTypeLabel' | 'amount', string>> = {};
  if (isActiveType(f.noteType) && !f.actionDate) errors.actionDate = 'צריך תאריך';
  if (f.noteType === 'אחר' && !f.customTypeLabel.trim()) errors.customTypeLabel = 'צריך לכתוב את סוג ההערה';
  if (f.amount !== null && !Number.isFinite(f.amount)) errors.amount = 'סכום לא תקין';
  return errors;
}

export function useCustomerNotesApi() {
  const { executeFunction: addNote, isLoading: adding } = useExecuteAction(AddCustomerNoteAction);
  const { executeFunction: updateNote, isLoading: updating } = useExecuteAction(UpdateCustomerNoteAction);

  /** AddCustomerNote: always a new row; returns the line about the task it will open. */
  async function addCustomerNote(n: NewCustomerNote): Promise<SavedNote> {
    const r = checked(
      await addNote({
        customerCode: n.customerCode,
        dueMonth: n.dueMonth,
        noteType: n.noteType,
        ...fieldInputs(n),
        ...(n.reminderDate ? { reminderDate: n.reminderDate } : {}),
        authorName: capitalizeName(n.authorName),
        noteSource: 'צוות',
      }),
    );
    return { taskPreview: r.taskPreview?.trim() || null };
  }

  /**
   * AddCustomerNote with the email: approves Maya's promise proposal on it — one התחייבות לתשלום note, the email
   * טופל. Amount / date / month are sent only when the person changed them; the engine takes the rest from the proposal.
   */
  async function approveEmailPromise(p: { customerCode: string; sourceEmailId: string; dueMonth?: string; actionDate?: string; amount?: number; authorName: string }) {
    checked(
      await addNote({
        customerCode: p.customerCode,
        noteType: 'התחייבות לתשלום',
        sourceEmailId: p.sourceEmailId,
        ...(p.dueMonth ? { dueMonth: p.dueMonth } : {}),
        ...(p.actionDate ? { actionDate: p.actionDate } : {}),
        ...(p.amount !== undefined ? { amount: round2(p.amount) } : {}),
        authorName: capitalizeName(p.authorName),
      }),
    );
  }

  /** UpdateCustomerNote (edit). An emptied reminder is sent as "" so the engine clears it. */
  async function updateCustomerNote(id: string, f: NoteFields) {
    checked(await updateNote({ noteId: id, ...fieldInputs(f), reminderDate: f.reminderDate }));
  }

  /** UpdateCustomerNote (manual close → נסגרה ידנית). */
  async function closeCustomerNote(id: string) {
    checked(await updateNote({ noteId: id, close: true }));
  }

  return { addCustomerNote, approveEmailPromise, updateCustomerNote, closeCustomerNote, isSaving: adding || updating };
}