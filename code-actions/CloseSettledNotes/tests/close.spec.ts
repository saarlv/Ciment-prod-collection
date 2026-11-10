import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { closeSettledNotes } from '../../shared/collections-note-runs.ts';

const NOW = '2026-11-11T04:00:00.000Z';
const note = (code: string, dueMonth: string, extra: any = {}) => ({ customerCode: code, customerName: code, dueMonth, noteType: 'חזור אליי', actionDate: '2026-11-01', status: 'פעילה', noteCreatedAt: '2026-10-20T08:00:00.000Z', ...extra });
const mv = (code: string, dueMonth: string, amount: number) => ({ movementId: `${code}-${dueMonth}-${amount}`, customerCode: code, dueMonth, amount, docType: 'חשבונית' });

function world() {
  const fake = new FakeBlocks();
  fake.insert('CustomerNotes', [
    note('TEST-A', '2026-09'), // 4,000 − 4,000 = 0 → closes
    note('TEST-A', '2026-09', { noteType: 'התחייבות לתשלום', outcome: 'לא קוימה', amount: 4000, amountRemaining: 4000 }), // → קוימה
    note('TEST-A', '2026-10'), // 1,500 open → stays
    note('TEST-B', '2026-08', { noteType: 'אחר', noteText: 'x' }), // no movements for the month → 0 → closes
    note('TEST-B', '2026-07', { status: 'נסגרה ידנית' }), // not active: never looked at
    note('TEST-C', '2026-09', { noteType: 'התחייבות לתשלום', outcome: 'קוימה' }), // credit only → closes, outcome stays קוימה
  ]);
  fake.insert('OpenMovements', [mv('TEST-A', '2026-09', 4000), mv('TEST-A', '2026-09', -4000), mv('TEST-A', '2026-10', 1500), mv('TEST-B', '2026-10', 900), mv('TEST-C', '2026-09', -200)]);
  return fake;
}
const byId = (fake: FakeBlocks, i: number) => fake.rows('CustomerNotes')[i];

describe('CloseSettledNotes', () => {
  it('dryRun is the default: reports what would close and writes nothing', async () => {
    const fake = world();
    current = fake.client();
    const mark = fake.calls.length;
    const r = await invoke({}, {});
    expect(r).toMatchObject({ dryRun: true, monthsChecked: 4, monthsSettled: 3, notesClosed: 4, commitmentsKept: 1 });
    expect(fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method))).toEqual([]);
  });

  it('a month at 0 or less (no rows = 0) closes its active notes; a commitment not yet kept becomes קוימה (remaining 0); a month above 0 stays', async () => {
    const fake = world();
    const r = await closeSettledNotes(fake.client(), { dryRun: false, nowIso: NOW, asOfDate: '2026-11-11' });
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(r.closed.map((c) => [c.customerCode, c.dueMonth, c.noteType])).toEqual([
      ['TEST-A', '2026-09', 'חזור אליי'],
      ['TEST-A', '2026-09', 'התחייבות לתשלום'],
      ['TEST-B', '2026-08', 'אחר'],
      ['TEST-C', '2026-09', 'התחייבות לתשלום'],
    ]);
    expect(byId(fake, 0)).toMatchObject({ status: 'נסגרה – החודש התאפס', closedAt: NOW });
    expect(byId(fake, 1)).toMatchObject({ status: 'נסגרה – החודש התאפס', outcome: 'קוימה', amountRemaining: 0, checkedAt: NOW });
    expect(byId(fake, 2)).toMatchObject({ status: 'פעילה' });
    expect(byId(fake, 3)).toMatchObject({ status: 'נסגרה – החודש התאפס' });
    expect(byId(fake, 4)).toMatchObject({ status: 'נסגרה ידנית' });
    expect(byId(fake, 5)).toMatchObject({ status: 'נסגרה – החודש התאפס', outcome: 'קוימה' });
    expect(byId(fake, 5).checkedAt).toBeUndefined();
    expect(r.commitmentsKept).toBe(1);
    expect(r.skipped).toEqual([expect.objectContaining({ customerCode: 'TEST-A', dueMonth: '2026-10', balance: 1500 })]);
    // closed notes stay in the history
    expect(fake.rows('CustomerNotes')).toHaveLength(6);
  });

  it('customerCode limits the run', async () => {
    const fake = world();
    const r = await closeSettledNotes(fake.client(), { dryRun: false, nowIso: NOW, customerCode: 'TEST-B' });
    expect(r.closed.map((c) => c.customerCode)).toEqual(['TEST-B']);
    expect(byId(fake, 0).status).toBe('פעילה');
  });

  it('guard: an EMPTY OpenMovements table (failed pull / empty source) closes nothing and says so', async () => {
    const fake = world();
    fake.tables.set('OpenMovements', []);
    const r = await closeSettledNotes(fake.client(), { dryRun: false, nowIso: NOW });
    expect(r.errors).toEqual([]);
    expect(r.notesClosed).toBe(0);
    expect(r.skipped[0].reason).toContain('OpenMovements ריקה');
    expect(fake.rows('CustomerNotes').filter((n) => n.status === 'פעילה')).toHaveLength(5);
  });

  it('a closed note leaves its grouped task row; a task left with no rows closes automatically', async () => {
    const fake = world();
    const [t] = fake.insert('CollectionQueue', [
      {
        taskKey: 'notes:callBack:2026-11-10:דנה',
        taskType: 'לחזור ללקוח',
        status: 'ממתין',
        openedAt: '2026-11-10T04:00:00.000Z',
        itemsJson: [{ customerCode: 'TEST-A', dueMonth: '2026-09', noteIds: [byId(fake, 0).id], noteKeys: [`${byId(fake, 0).id}@2026-11-01`], noteType: 'חזור אליי', handledBy: null, handledAt: null }],
      },
    ]);
    const r = await closeSettledNotes(fake.client(), { dryRun: false, nowIso: NOW });
    expect(r.taskSync).toMatchObject({ autoClosed: 1 });
    expect(fake.rows('CollectionQueue').find((x) => x.id === t.id)).toMatchObject({ status: 'נסגר אוטומטית', itemsJson: [] });
    expect(String(fake.rows('CollectionQueue').find((x) => x.id === t.id)!.resolvedReason)).toContain('ההערה נסגרה');
  });
});
