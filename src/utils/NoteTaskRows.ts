import type { Task } from '@/utils/Tasks';

/**
 * The grouped note tasks (Design 02 section 6): taskKey notes:<type>:<date>:<bookkeeper>, one row per customer + due
 * month in itemsJson. BuildTasks refreshes the numbers and keeps the row's handled / handledBy / handledAt, which the
 * tasks screen sets (code-actions/shared/collections-note-tasks.ts).
 */
export type NoteTaskItem = NonNullable<Task['itemsJson']>[number];

export const isNoteTask = (t: Pick<Task, 'taskKey'>): boolean => (t.taskKey ?? '').startsWith('notes:');

/** itemsJson as stored (an array, a JSON string, or {rows}) → its rows, every stored field kept. */
export function noteRowsOf(itemsJson: unknown): NoteTaskItem[] {
  let v: unknown = itemsJson;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as { rows?: unknown }).rows)) v = (v as { rows: unknown[] }).rows;
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is NoteTaskItem => !!r && typeof r === 'object' && !Array.isArray(r));
}

/** A row's identity inside its task: one row per customer + month. */
export const noteRowKey = (r: NoteTaskItem): string => `${r.customerCode ?? ''}|${(r.dueMonth ?? '').slice(0, 7)}`;

export const isRowHandled = (r: NoteTaskItem): boolean => r.handled === true || !!r.handledBy;

/** The rows with one of them marked טופל by `by` at `at` (ISO); the others untouched. */
export function markRowHandled(rows: NoteTaskItem[], key: string, by: string, at: string): NoteTaskItem[] {
  return rows.map((r) => (noteRowKey(r) === key ? { ...r, handled: true, handledBy: by, handledAt: at } : r));
}