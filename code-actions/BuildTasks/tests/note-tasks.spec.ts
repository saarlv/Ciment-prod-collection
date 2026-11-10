import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { syncNoteTasks } from '../../shared/collections-note-tasks.ts';
import { syncTasks } from '../../shared/collections-task-upsert.ts';

// The grouped note tasks (plan 04.11 stage 2): one task per note type + date + bookkeeper, rows in itemsJson.
const T = '2026-11-11'; // Wednesday
const at = (d: string) => `${d}T04:00:00.000Z`;
const noteRow = (code: string, extra: any = {}) => ({
  customerCode: code,
  customerName: `לקוח ${code}`,
  dueMonth: '2026-10',
  noteType: 'תשלום באשראי',
  actionDate: T,
  status: 'פעילה',
  noteCreatedAt: '2026-11-01T08:00:00.000Z',
  ...extra,
});

function world() {
  const fake = new FakeBlocks();
  fake.insert('Customers', ['TEST-A', 'TEST-B', 'TEST-C', 'TEST-D'].map((c) => ({ customerCode: c, customerName: `בדיקה – ${c}`, source: 'test-fixture' })));
  fake.insert('CustomerOwners', [
    { customerCode: 'TEST-A', bookkeeperName: 'דנה', setAt: '2026-10-01T00:00:00.000Z' },
    { customerCode: 'TEST-B', bookkeeperName: 'דנה', setAt: '2026-10-01T00:00:00.000Z' },
    { customerCode: 'TEST-C', bookkeeperName: 'דנה', setAt: '2026-10-01T00:00:00.000Z' },
    { customerCode: 'TEST-D', bookkeeperName: 'רינה', setAt: '2026-10-01T00:00:00.000Z' },
  ]);
  fake.insert(
    'OpenMovements',
    ['TEST-A', 'TEST-B', 'TEST-C', 'TEST-D'].map((c, i) => ({ movementId: `M-${c}`, customerCode: c, dueMonth: '2026-10', amount: 1000 * (i + 1), docType: 'חשבונית' })),
  );
  return fake;
}
const tasks = (fake: FakeBlocks, prefix = 'notes:') => fake.rows('CollectionQueue').filter((t) => String(t.taskKey).startsWith(prefix));
const run = (fake: FakeBlocks, date: string, phase: '06:00' | '09:00' | null = '06:00', extra: any = {}) => syncNoteTasks(fake.client(), { asOfDate: date, nowIso: at(date), dryRun: false, phase, ...extra });

describe('grouped note tasks', () => {
  it('one task per type + date + bookkeeper: 3 customers of דנה in ONE task, a customer of רינה in its own; two notes of one customer + month = one row', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [noteRow('TEST-A', { amount: 500 }), noteRow('TEST-A', { amount: 700 }), noteRow('TEST-B'), noteRow('TEST-C'), noteRow('TEST-D')]);
    const r = await run(fake, T);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(r.created).toBe(2);
    const dana = tasks(fake).find((t) => t.taskKey === `notes:creditCard:${T}:דנה`)!;
    expect(dana).toMatchObject({
      taskType: 'להתקשר לפרטי אשראי',
      title: 'להתקשר לפרטי אשראי · 3 לקוחות · 11.11',
      source: 'דוח גיול',
      status: 'ממתין',
      customerCode: null,
      customerName: null,
      assignedBookkeeperName: 'דנה',
      amount: 6000, // the month balances 1,000 + 2,000 + 3,000
      relatedTable: 'CustomerNotes',
      isAlert: false,
      isTestFixture: true,
      queueDate: T,
    });
    expect(dana.itemsJson).toHaveLength(3);
    const a = dana.itemsJson.find((row: any) => row.customerCode === 'TEST-A');
    expect(a).toMatchObject({ dueMonth: '2026-10', noteType: 'תשלום באשראי', actionDate: T, promised: 1200, monthBalance: 1000, handledBy: null, handledAt: null });
    expect(a.noteIds).toHaveLength(2);
    expect(a.customerId).toBeTruthy();
    const rina = tasks(fake).find((t) => t.taskKey === `notes:creditCard:${T}:רינה`)!;
    expect(rina).toMatchObject({ customerCode: 'TEST-D', title: 'להתקשר לפרטי אשראי · לקוח אחד · 11.11', amount: 4000 });
    expect(['קריטית', 'גבוהה', 'בינונית', 'נמוכה']).toContain(dana.severity);
    // a rerun refreshes, never duplicates
    const again = await run(fake, T);
    expect(again.created).toBe(0);
    expect(tasks(fake)).toHaveLength(2);
  });

  it('phases: the commitment task only in the bank-check phase (09:00), the morning types only at 06:00; only קוימה חלקית / לא קוימה rows', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [
      noteRow('TEST-A', { noteType: 'התחייבות לתשלום', actionDate: '2026-11-10', outcome: 'לא קוימה', amount: 900, amountReceived: 0, amountRemaining: 900 }),
      noteRow('TEST-B', { noteType: 'התחייבות לתשלום', actionDate: '2026-11-10', outcome: 'פתוחה', amount: 900 }),
      noteRow('TEST-C', { noteType: 'התחייבות לתשלום', actionDate: '2026-11-10', outcome: 'קוימה', amount: 900 }),
      noteRow('TEST-D', { noteType: 'חזור אליי' }),
    ]);
    await run(fake, T, '06:00');
    expect(tasks(fake).map((t) => t.taskKey)).toEqual([`notes:callBack:${T}:רינה`]);
    await run(fake, T, '09:00');
    const p = tasks(fake, 'notes:promise:');
    expect(p.map((t) => t.taskKey)).toEqual([`notes:promise:${T}:דנה`]);
    expect(p[0].itemsJson.map((row: any) => [row.customerCode, row.outcome, row.promised, row.received, row.remaining])).toEqual([['TEST-A', 'לא קוימה', 900, 0, 900]]);
    expect(p[0].amount).toBe(900);
    expect(p[0].title).toBe('התחייבויות שלא קוימו – ליצור קשר · לקוח אחד · 11.11');
  });

  it('catch-up ONCE: a trigger on Friday joins Sunday’s task; Monday it is not added again', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [noteRow('TEST-A', { noteType: 'חזור אליי', actionDate: '2026-11-13' })]);
    await run(fake, '2026-11-12');
    expect(tasks(fake)).toEqual([]);
    await run(fake, '2026-11-15');
    expect(tasks(fake).map((t) => t.taskKey)).toEqual(['notes:callBack:2026-11-15:דנה']);
    const monday = await run(fake, '2026-11-16');
    expect(monday.created).toBe(0);
    expect(tasks(fake)).toHaveLength(1);
    // also when Sunday's task was closed by a person
    tasks(fake)[0].status = 'טופל';
    await run(fake, '2026-11-17');
    expect(tasks(fake)).toHaveLength(1);
  });

  it('a reminder (any type, also אחר) opens תזכורות on its reminderDate', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [noteRow('TEST-B', { noteType: 'אחר', customTypeLabel: 'בירור – מחיר', noteText: 'x', actionDate: null, reminderDate: T })]);
    await run(fake, T);
    expect(tasks(fake)).toEqual([expect.objectContaining({ taskKey: `notes:reminder:${T}:דנה`, taskType: 'תזכורות' })]);
    expect(tasks(fake)[0].itemsJson[0].noteType).toBe('בירור – מחיר');
  });

  it('rows leave when the note closes or the month reaches 0; handledBy / handledAt are kept; no rows left → נסגר אוטומטית; a person-closed task stays closed', async () => {
    const fake = world();
    const [n1, n2, n3] = fake.insert('CustomerNotes', [noteRow('TEST-A'), noteRow('TEST-B'), noteRow('TEST-C')]);
    await run(fake, T);
    const task = () => tasks(fake).find((t) => t.taskKey === `notes:creditCard:${T}:דנה`)!;
    // the screen marks a row handled
    task().itemsJson.find((row: any) => row.customerCode === 'TEST-C').handledBy = 'דנה';
    task().itemsJson.find((row: any) => row.customerCode === 'TEST-C').handledAt = '2026-11-11T09:00:00.000Z';
    // A's note closes manually; B's month reaches 0
    fake.rows('CustomerNotes').find((n) => n.id === n1.id)!.status = 'נסגרה ידנית';
    fake.rows('OpenMovements').find((m) => m.customerCode === 'TEST-B')!.amount = 0;
    const r = await run(fake, T, null, { noteIds: [n1.id] });
    expect(r.refreshed).toBe(1);
    expect(task().itemsJson.map((row: any) => [row.customerCode, row.handledBy, row.handledAt])).toEqual([['TEST-C', 'דנה', '2026-11-11T09:00:00.000Z']]);
    expect(task()).toMatchObject({ status: 'ממתין', customerCode: 'TEST-C', title: 'להתקשר לפרטי אשראי · לקוח אחד · 11.11', amount: 3000 });
    // C closes too → the task closes automatically
    fake.rows('CustomerNotes').find((n) => n.id === n3.id)!.status = 'נסגרה – החודש התאפס';
    const r2 = await run(fake, '2026-11-12', null);
    expect(r2.autoClosed).toBe(1);
    expect(task()).toMatchObject({ status: 'נסגר אוטומטית', itemsJson: [] });
    expect(String(task().resolvedReason)).toContain('כל השורות יצאו מהמשימה');
    // a person-closed task is never touched
    const [n4] = fake.insert('CustomerNotes', [noteRow('TEST-D', { noteType: 'חזור אליי' })]);
    await run(fake, T);
    const rina = () => tasks(fake).find((t) => t.taskKey === `notes:callBack:${T}:רינה`)!;
    rina().status = 'טופל';
    fake.rows('CustomerNotes').find((n) => n.id === n4.id)!.status = 'נסגרה ידנית';
    await run(fake, T, null);
    expect(rina()).toMatchObject({ status: 'טופל' });
    expect(rina().itemsJson).toHaveLength(1);
    expect(n2.id).toBeTruthy();
  });

  it('guard: an empty OpenMovements mirror judges no balance – nothing joins and no row leaves for it', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [noteRow('TEST-A')]);
    await run(fake, T);
    expect(tasks(fake)).toHaveLength(1);
    fake.tables.set('OpenMovements', []);
    fake.insert('CustomerNotes', [noteRow('TEST-B')]);
    const r = await run(fake, T);
    expect(r.balancesKnown).toBe(false);
    expect(r.errors).toEqual([]);
    expect(tasks(fake)[0].itemsJson.map((row: any) => row.customerCode)).toEqual(['TEST-A']);
  });

  it('the per-problem scan (syncTasks) never touches notes:* tasks', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [noteRow('TEST-A')]);
    await run(fake, T);
    const before = JSON.stringify(tasks(fake));
    const scan = await syncTasks(fake.client(), { asOfDate: T, dryRun: false, nowIso: at('2026-11-12') });
    expect(scan.changes.filter((c) => c.taskKey.startsWith('notes:'))).toEqual([]);
    expect(JSON.stringify(tasks(fake))).toBe(before);
  });

  it('BuildTasks: phase 09:00 builds only the commitment task (noteTasks output); the default 06:00 runs the scan and the morning types', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [
      noteRow('TEST-A', { noteType: 'התחייבות לתשלום', actionDate: '2026-11-10', outcome: 'קוימה חלקית', amount: 900, amountReceived: 400, amountRemaining: 500 }),
      noteRow('TEST-B'),
    ]);
    current = fake.client();
    const bank = await invoke({ asOfDate: T, dryRun: false, phase: '09:00' }, {});
    expect(bank).toMatchObject({ phase: '09:00', found: 0, created: 0, noteTasks: { created: 1, byType: { promise: { tasks: 1, rows: 1 } } } });
    expect(tasks(fake).map((t) => t.taskKey)).toEqual([`notes:promise:${T}:דנה`]);
    const morning = await invoke({ asOfDate: T, dryRun: false }, {});
    expect(morning.phase).toBe('06:00');
    expect(morning.noteTasks).toMatchObject({ created: 1, byType: { creditCard: { tasks: 1, rows: 1 } } });
    expect(tasks(fake).map((t) => t.taskKey).sort()).toEqual([`notes:creditCard:${T}:דנה`, `notes:promise:${T}:דנה`]);
    // an id-scoped run (one email) never builds grouped tasks
    const scoped = await invoke({ asOfDate: T, dryRun: true, emailIds: ['1'] }, {});
    expect(scoped.noteTasks).toBeNull();
  });
});
