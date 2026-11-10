import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { syncTasks } from '../../shared/collections-task-upsert.ts';
import { bouncedTaskKey, chequeNumberIn, chequeNumberOf, parseTaskKey } from '../../shared/collections-tasks.ts';
import { identifyCustomers } from '../../shared/collections-identify-customers.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

const T = '2026-11-03';
const NOW = '2026-11-03T05:00:00.000Z';
const LATER = '2026-11-03T09:00:00.000Z';
const ACC = 'TEST-ACC-1 (בדיקה)';
const KEY = `receipt-bounced:cheque:${ACC}:004512`;
const REF = 'צ׳ק 004512 חזר – אין כיסוי מספיק';

/** The sample bank file uploaded 3 times: the same returned cheque on 3 lines of 3 batches. */
function world(opts: { lines?: number } = {}) {
  const fake = new FakeBlocks();
  fake.insert('AgentSettings', [{ settingKey: 'taskOverdueMinDays', value: '7', valueType: 'מספר' }]);
  fake.insert('Customers', [{ customerCode: 'TEST-005', customerName: 'בדיקה – גל מתכת', assignedBookkeeperName: 'בדיקה – אחראית א', source: 'test-fixture' }]);
  const batches = ['6225289', '6376039', '6522160'].slice(0, opts.lines ?? 3);
  fake.insert(
    'BankLines',
    batches.map((b, i) => ({
      bankLineId: `TEST-BL-${b}-5`,
      importBatchId: b,
      amount: -14500,
      valueDate: '2026-10-28',
      payerName: 'גל מתכת',
      reference: REF,
      rawText: `28/10/2026 | גל מתכת | -14,500 | ${REF}`,
      bankAccount: ACC,
      lineType: 'צ׳ק חוזר',
      status: 'חדשה',
      checkStage: null,
      customerCode: 'TEST-005',
      source: 'test-fixture',
      lineNo: i + 1,
    })),
  );
  current = fake.client();
  return fake;
}
const lineKey = (b: string) => `receipt-bounced:TEST-BL-${b}-5`;
const oldTask = (b: string, extra: Record<string, unknown>) => ({
  taskKey: lineKey(b),
  taskType: 'צ׳ק חוזר',
  title: 'צ׳ק חוזר – בדיקה – גל מתכת: 14,500 ש״ח',
  source: 'תקבולים',
  relatedTable: 'BankLines',
  relatedId: `TEST-BL-${b}-5`,
  customerCode: 'TEST-005',
  severity: 'קריטית',
  status: 'ממתין',
  openedAt: '2026-10-28T06:00:00.000Z',
  isTestFixture: true,
  ...extra,
});
const run = (fake: FakeBlocks, opts: any = {}) => syncTasks(fake.client() as any, { asOfDate: T, dryRun: false, nowIso: NOW, ...opts });
const bounced = (fake: FakeBlocks) => fake.rows('CollectionQueue').filter((t) => String(t.taskKey).startsWith('receipt-bounced:'));

describe('returned cheques: one task per cheque', () => {
  it('reads the cheque number after צ׳ק / שיק / המחאה (leading zeros kept), reference first, then the raw text', () => {
    expect(chequeNumberIn(REF)).toBe('004512');
    expect(chequeNumberIn('שיק מס׳ 0077 חזר')).toBe('0077');
    expect(chequeNumberIn('המחאה 001187')).toBe('001187');
    expect(chequeNumberIn("צ'ק חוזר 4411")).toBe('4411');
    expect(chequeNumberIn('4411')).toBeNull();
    expect(chequeNumberOf({ reference: 'החזרה', rawText: '| צ׳ק 000118 חזר |' })).toBe('000118');
    // no number or no account → the line key (fallback)
    expect(bouncedTaskKey({ bankLineId: 'BL-9', reference: '4411', bankAccount: 'A' })).toBe('receipt-bounced:BL-9');
    expect(bouncedTaskKey({ bankLineId: 'BL-9', reference: REF })).toBe('receipt-bounced:BL-9');
    expect(bouncedTaskKey({ bankLineId: 'BL-9', reference: REF, bankAccount: ACC })).toBe(KEY);
    expect(parseTaskKey(KEY)).toEqual({ kind: 'receipt-bounced', id: `cheque:${ACC}:004512` });
  });

  it('one cheque on 3 lines (3 uploads) → ONE task, relatedId = the earliest line', async () => {
    const fake = world();
    const r = await run(fake);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(bounced(fake)).toHaveLength(1);
    expect(bounced(fake)[0]).toMatchObject({ taskKey: KEY, relatedId: 'TEST-BL-6225289-5', severity: 'קריטית', taskType: 'צ׳ק חוזר', amount: 14500, status: 'ממתין', isTestFixture: true });
    expect(bounced(fake)[0].reasons).toContain('מופיע ב-3 שורות בנק');
    const again = await run(fake, { nowIso: LATER });
    expect([again.created, again.reopened, again.autoClosed]).toEqual([0, 0, 0]);
    expect(bounced(fake)).toHaveLength(1);
  });

  it('the live case: the open old-key task is RE-KEYED (status, openedAt, handledBy kept); the closed duplicates stay closed', async () => {
    const fake = world();
    fake.insert('CollectionQueue', [
      oldTask('6225289', { status: 'בטיפול', handledBy: 'בדיקה – אחראית א', openedAt: '2026-10-28T06:00:00.000Z' }),
      oldTask('6376039', { status: 'נסגר אוטומטית', resolvedReason: 'כפילות: הצ׳ק 004512 כבר במשימה 6500382', resolvedAt: '2026-11-02T10:00:00.000Z' }),
      oldTask('6522160', { status: 'נסגר אוטומטית', resolvedReason: 'כפילות: הצ׳ק 004512 כבר במשימה 6500382', resolvedAt: '2026-11-02T10:00:00.000Z' }),
    ]);
    const keptId = fake.rows('CollectionQueue')[0].id;
    const r = await run(fake);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect([r.created, r.reopened]).toEqual([0, 0]);
    expect(r.changes.filter((c) => c.change === 'rekeyed').map((c) => c.taskKey)).toEqual([KEY]);
    const rows = bounced(fake);
    expect(rows).toHaveLength(3);
    expect(rows.find((t) => t.id === keptId)).toMatchObject({ taskKey: KEY, status: 'בטיפול', handledBy: 'בדיקה – אחראית א', openedAt: '2026-10-28T06:00:00.000Z', relatedId: 'TEST-BL-6225289-5' });
    expect(rows.filter((t) => t.status === 'נסגר אוטומטית').map((t) => [t.taskKey, t.resolvedReason])).toEqual([
      [lineKey('6376039'), 'כפילות: הצ׳ק 004512 כבר במשימה 6500382'],
      [lineKey('6522160'), 'כפילות: הצ׳ק 004512 כבר במשימה 6500382'],
    ]);
    // the next scans neither reopen the closed duplicates nor open a new task
    const again = await run(fake, { nowIso: LATER });
    expect([again.created, again.reopened, again.autoClosed]).toEqual([0, 0, 0]);
    expect(bounced(fake).filter((t) => t.status !== 'נסגר אוטומטית')).toHaveLength(1);
  });

  it('two open old-key tasks: the oldest is re-keyed, the other closes as a duplicate', async () => {
    const fake = world();
    fake.insert('CollectionQueue', [
      oldTask('6376039', { openedAt: '2026-10-30T06:00:00.000Z' }),
      oldTask('6225289', { openedAt: '2026-10-28T06:00:00.000Z' }),
    ]);
    const r = await run(fake);
    expect(r.errors).toEqual([]);
    expect(r.created).toBe(0);
    const rows = bounced(fake);
    expect(rows.find((t) => t.taskKey === KEY)).toMatchObject({ openedAt: '2026-10-28T06:00:00.000Z', status: 'ממתין' });
    const dup = rows.find((t) => t.taskKey === lineKey('6376039'))!;
    expect(dup.status).toBe('נסגר אוטומטית');
    expect(dup.resolvedReason).toMatch(/^כפילות: צ׳ק 004512 חוזר \(TEST-ACC-1 \(בדיקה\)\) – המשימה נמשכת ברשומה \d+$/);
  });

  it('an open old-key row next to an existing cheque-key task closes as a duplicate', async () => {
    const fake = world();
    await run(fake);
    fake.insert('CollectionQueue', [oldTask('6522160', {})]);
    const r = await run(fake, { nowIso: LATER });
    expect(r.autoClosed).toBe(1);
    expect(bounced(fake).filter((t) => ['ממתין', 'בטיפול'].includes(t.status)).map((t) => t.taskKey)).toEqual([KEY]);
  });

  it('closed old-key rows only: a person-closed one stays closed (no new task); an auto-closed one is never reopened', async () => {
    const person = world();
    person.insert('CollectionQueue', [oldTask('6225289', { status: 'טופל', handledBy: 'דנה', resolvedAt: '2026-10-29T10:00:00.000Z' })]);
    const r = await run(person);
    expect([r.created, r.reopened, r.keptClosedByPerson]).toEqual([0, 0, 1]);
    expect(bounced(person)).toHaveLength(1);
    expect(bounced(person)[0]).toMatchObject({ taskKey: lineKey('6225289'), status: 'טופל' });

    const auto = world();
    auto.insert('CollectionQueue', [oldTask('6376039', { status: 'נסגר אוטומטית', resolvedReason: 'כפילות: …' })]);
    const a = await run(auto);
    expect([a.created, a.reopened]).toEqual([0, 0]);
    expect(bounced(auto)).toEqual([expect.objectContaining({ taskKey: lineKey('6376039'), status: 'נסגר אוטומטית', resolvedReason: 'כפילות: …' })]);
  });

  it('a cheque-key task a person closed stays closed while the cheque is still returned', async () => {
    const fake = world();
    await run(fake);
    const t = bounced(fake)[0];
    Object.assign(t, { status: 'טופל', handledBy: 'דנה' });
    const r = await run(fake, { nowIso: LATER });
    expect([r.created, r.reopened, r.keptClosedByPerson]).toEqual([0, 0, 1]);
    expect(bounced(fake)).toEqual([expect.objectContaining({ taskKey: KEY, status: 'טופל' })]);
  });

  it('a scoped run on the LAST upload line re-keys the old task, keeps the earliest line as relatedId and closes the duplicate', async () => {
    const fake = world();
    fake.insert('CollectionQueue', [oldTask('6225289', { status: 'בטיפול' }), oldTask('6522160', { openedAt: '2026-11-01T06:00:00.000Z' })]);
    const r = await run(fake, { scope: { bankLineIds: ['TEST-BL-6522160-5'] } });
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(r.created).toBe(0);
    const rows = bounced(fake);
    expect(rows.find((t) => t.taskKey === KEY)).toMatchObject({ status: 'בטיפול', relatedId: 'TEST-BL-6225289-5' });
    expect(rows.find((t) => t.taskKey === lineKey('6522160'))).toMatchObject({ status: 'נסגר אוטומטית' });
    // a scoped run on another line changes nothing more
    const again = await run(fake, { scope: { bankLineIds: ['TEST-BL-6376039-5'] }, nowIso: LATER });
    expect([again.created, again.reopened, again.autoClosed]).toEqual([0, 0, 0]);
  });

  it('the identification (IdentifyCustomers) of another upload line opens no second task – the old one is re-keyed', async () => {
    const fake = world();
    fake.insert('CollectionQueue', [oldTask('6225289', { status: 'בטיפול', handledBy: 'בדיקה – אחראית א' })]);
    const r = await identifyCustomers(fake.client() as any, { bankLineIds: ['TEST-BL-6522160-5'], asOfDate: T, dryRun: false });
    expect(r.errors).toEqual([]);
    expect(r.counts.skipped).toBe(1);
    const open = bounced(fake).filter((t) => ['ממתין', 'בטיפול'].includes(t.status));
    expect(open).toEqual([expect.objectContaining({ taskKey: KEY, status: 'בטיפול', handledBy: 'בדיקה – אחראית א', relatedId: 'TEST-BL-6225289-5' })]);
  });

  it('the identification of a new cheque writes the task under the cheque key', async () => {
    const fake = world({ lines: 1 });
    const r = await identifyCustomers(fake.client() as any, { bankLineIds: ['TEST-BL-6225289-5'], asOfDate: T, dryRun: false });
    expect(r.errors).toEqual([]);
    expect(bounced(fake)).toEqual([expect.objectContaining({ taskKey: KEY, severity: 'קריטית' })]);
  });

  it('transfers are NOT deduped by content: 3 unidentified transfers of one payer on 3 dates → 3 tasks', async () => {
    const fake = new FakeBlocks();
    fake.insert(
      'BankLines',
      ['2026-10-27', '2026-10-28', '2026-10-29'].map((d, i) => ({
        bankLineId: `TEST-BL-AVI-${i + 1}`,
        amount: 12000,
        valueDate: d,
        payerName: 'אבי ובניו',
        reference: 'העברה',
        bankAccount: ACC,
        lineType: 'העברה',
        status: 'לא מזוהה',
        checkStage: 'לא מזוהה',
      })),
    );
    const r = await run(fake);
    expect(r.errors).toEqual([]);
    const tasks = fake.rows('CollectionQueue').filter((t) => String(t.taskKey).startsWith('receipt-customer:'));
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.title)).toEqual(Array(3).fill('תקבול לא זוהה – אבי ובניו: 12,000 ש״ח'));
  });
});
