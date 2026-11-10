import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};

describe('CreateTask', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-22T06:00:00.000Z')); // Thursday → next business day is Sunday
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: '2026-10-22' }, ctx);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('validates input', async () => {
    const r = await invoke({ customerCode: 'TEST-005', taskType: 'x', reasons: '' }, ctx);
    expect(r.errors).toEqual(['סוג משימה לא מוכר: "x"', 'חסרה סיבה (reasons)']);
    expect((await invoke({ customerCode: 'NOPE', taskType: 'אחר', reasons: 'r' }, ctx)).errors).toEqual(['לקוח NOPE לא נמצא']);
    // the old unknown-payer type was removed in r3 step 3: it is no longer accepted (the type is לא זוהה)
    expect((await invoke({ customerCode: 'TEST-005', taskType: 'לא מזוהה', reasons: 'r', dryRun: true }, ctx)).errors).toEqual(['סוג משימה לא מוכר: "לא מזוהה"']);
  });

  it('names and owner from the data, defaults, test marker, duplicate skipped', async () => {
    const r = await invoke({ customerCode: 'TEST-005', taskType: 'אחר', reasons: 'לבדוק', relatedTable: 'BankLines', relatedId: 'X1' }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.task).toMatchObject({
      customerName: 'בדיקה – גל מתכת',
      assignedBookkeeperName: 'בדיקה – אחראית א', // CustomerOwners override
      priorityScore: 50,
      status: 'ממתין',
      queueDate: '2026-10-22',
      dueAt: '2026-10-25T07:00:00.000Z', // Sunday 09:00 Israel (UTC+2 after the 25.10 switch)
      isTestFixture: true,
    });
    const dup = await invoke({ customerCode: 'TEST-005', taskType: 'אחר', reasons: 'שוב', relatedTable: 'BankLines', relatedId: 'X1' }, ctx);
    expect(dup.skippedDuplicate).toBe(true);
    expect(fake.rows('CollectionQueue')).toHaveLength(1);
    const real = await invoke({ customerCode: '10001', taskType: 'אחר', reasons: 'r', priorityScore: 90, dryRun: true }, ctx);
    expect(real.task).toMatchObject({ isTestFixture: false, assignedBookkeeperName: 'רינה', priorityScore: 90 });
  });

  it('manual key, every task column, and an open task with the same key is a duplicate', async () => {
    const r = await invoke({ customerCode: 'TEST-005', taskType: 'הבטחה הופרה', reasons: 'הלקוח לא שילם כמובטח. לבדוק מול הסוכן', priorityScore: 72, relatedTable: 'PaymentPromises', relatedId: 'P9' }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.task).toMatchObject({
      taskKey: 'manual:הבטחה הופרה:P9',
      title: 'הבטחה הופרה – בדיקה – גל מתכת: הלקוח לא שילם כמובטח',
      severity: 'קריטית', // 72 ≥ the default critical threshold 70
      severityScore: 72,
      source: 'הבטחות',
      openedAt: '2026-10-22T06:00:00.000Z',
      lastCheckedAt: '2026-10-22T06:00:00.000Z',
      resolvedAt: null,
      resolvedReason: null,
      invoiceNumbers: null,
      amount: null,
    });
    // a row with the same key (whatever its customer / relatedId fields say) is the duplicate
    const dup = await invoke({ customerCode: 'TEST-005', taskType: 'הבטחה הופרה', reasons: 'שוב', relatedId: 'P9' }, ctx);
    expect(dup).toMatchObject({ skippedDuplicate: true, task: { id: r.task.id } });
    // no relatedId → the key uses the customer code; source by type
    const v = await invoke({ customerCode: 'TEST-005', taskType: 'לאמת שולח', reasons: 'r', priorityScore: 10, dryRun: true }, ctx);
    expect(v.task).toMatchObject({ taskKey: 'manual:לאמת שולח:TEST-005', source: 'פניות', severity: 'נמוכה' });
    const b = await invoke({ customerCode: 'TEST-005', taskType: 'צ׳ק חוזר', reasons: 'r', priorityScore: 50, dryRun: true }, ctx);
    expect(b.task).toMatchObject({ source: 'תקבולים', severity: 'גבוהה' });
    const o = await invoke({ customerCode: 'TEST-005', taskType: 'אחר', reasons: 'r', priorityScore: 25, dryRun: true }, ctx);
    expect(o.task).toMatchObject({ source: 'דוח גיול', severity: 'בינונית', title: 'משימה – בדיקה – גל מתכת: r' });
  });
});
