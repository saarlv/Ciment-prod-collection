import { describe, expect, it } from 'vitest';
import { isNoteTask, isRowHandled, markRowHandled, noteRowKey, noteRowsOf } from '@/utils/NoteTaskRows';
import { compareTasks, isAlertTask } from '@/utils/Tasks';
import type { Task } from '@/utils/Tasks';

const rows = [
  { customerCode: '1001', customerName: 'א', dueMonth: '2026-09', promised: 5000, received: 2000, remaining: 3000, outcome: 'קוימה חלקית', noteIds: ['7'] },
  { customerCode: '1002', customerName: 'ב', dueMonth: '2026-10', remaining: 800 },
];

describe('grouped note task rows', () => {
  it('reads itemsJson stored as an array, a JSON string or {rows}', () => {
    expect(noteRowsOf(rows)).toHaveLength(2);
    expect(noteRowsOf(JSON.stringify(rows))).toHaveLength(2);
    expect(noteRowsOf({ rows })).toHaveLength(2);
    expect(noteRowsOf('not json')).toEqual([]);
    expect(noteRowsOf(null)).toEqual([]);
  });

  it('marks one row handled and keeps every other field and row as stored', () => {
    const next = markRowHandled(noteRowsOf(rows), noteRowKey(rows[0]), 'דנה', '2026-11-05T08:00:00.000Z');
    expect(next[0]).toMatchObject({ ...rows[0], handled: true, handledBy: 'דנה', handledAt: '2026-11-05T08:00:00.000Z' });
    expect(next[1]).toEqual(rows[1]);
    expect(next.map(isRowHandled)).toEqual([true, false]);
  });

  it('recognises grouped tasks by their notes: key', () => {
    expect(isNoteTask({ taskKey: 'notes:promise:2026-11-05:דנה' })).toBe(true);
    expect(isNoteTask({ taskKey: 'aging-overdue:123' })).toBe(false);
  });
});

describe('task order and alerts', () => {
  const task = (over: Partial<Task>): Task => ({ id: over.taskKey ?? 'x', ...over }) as Task;

  it('puts "דף הבנק לא עלה לפריוריטי" first, ahead of any severity', () => {
    const critical = task({ taskKey: 'aging-overdue:1', severity: 'קריטית', severityScore: 99 });
    const bank = task({ taskKey: 'bank-missing:2026-11-05', taskType: 'דף הבנק לא עלה לפריוריטי', severity: 'בינונית' });
    expect([critical, bank].sort(compareTasks)[0]).toBe(bank);
  });

  it('treats only isAlert=true as an alert', () => {
    expect(isAlertTask({ isAlert: true })).toBe(true);
    expect(isAlertTask({ isAlert: false })).toBe(false);
    expect(isAlertTask({})).toBe(false);
  });
});