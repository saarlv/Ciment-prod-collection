import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { writesSince } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { evaluateDebt } from '../../shared/collections-debt-check.ts';

const T = '2026-11-05';
const CTX = { appId: 'test', token: 't' };
const BK = 'בדיקה – אחראית א';

const mv = (code: string, dueMonth: string, amount: number, n = 1) => ({
  movementId: `TEST-MV-${code}-${dueMonth}-${n}`,
  customerCode: code,
  customerName: code,
  docType: amount < 0 ? 'זיכוי' : 'חשבונית',
  docNumber: `TEST-INV-${code}-${dueMonth}-${n}`,
  dueDate: `${dueMonth}-15`,
  dueMonth,
  amount,
  source: 'test-fixture',
});
const receipt = (key: string, code: string, amount: number, extra: Record<string, unknown> = {}) => ({
  receiptKey: key,
  customerCode: code,
  customerName: `בדיקה – ${code}`,
  amount,
  receiptStatus: 'אושרה – לא נשלחה',
  identifyStatus: 'אושר',
  matchStatus: 'על חשבון – צריך פיזור',
  debtCheckResult: null,
  debtCheckMonths: null,
  receiptSource: 'דף בנק',
  isTestFixture: true,
  ...extra,
});

function world(movements: any[] = []) {
  const fake = new FakeBlocks();
  fake.insert('Customers', [
    { customerCode: 'TEST-201', customerName: 'בדיקה – אלפא', assignedBookkeeperName: BK, isTestFixture: true },
    { customerCode: 'TEST-202', customerName: 'בדיקה – בטא', assignedBookkeeperName: BK, isTestFixture: true },
    { customerCode: 'TEST-203', customerName: 'בדיקה – גמא', assignedBookkeeperName: BK, isTestFixture: true },
  ]);
  fake.insert('OpenMovements', movements);
  fake.insert('Receipts', [
    receipt('RCPT-A', 'TEST-201', 9000), // Aug 4,000 + Sep 5,000 → cumulative
    receipt('RCPT-B', 'TEST-201', 3000), // = Oct alone → single month
    receipt('RCPT-C', 'TEST-201', 7777), // nothing → ask
    receipt('RCPT-D', 'TEST-202', 1000), // no movements for the customer → ask
    receipt('RCPT-E', 'TEST-201', 9000, { receiptStatus: 'טיוטה – ממתינה לאישור' }), // not approved → skipped
  ]);
  current = fake.client();
  return fake;
}
const base = [mv('TEST-201', '2026-08', 4000), mv('TEST-201', '2026-09', 2000), mv('TEST-201', '2026-09', 3000, 2), mv('TEST-201', '2026-10', 3000), mv('TEST-203', '2026-07', 50)];
const rec = (fake: FakeBlocks, key: string) => fake.rows('Receipts').find((r) => r.receiptKey === key)!;
const tasks = (fake: FakeBlocks, key: string) => fake.rows('CollectionQueue').filter((t) => t.taskKey === key);

describe('evaluateDebt (pure)', () => {
  it('cumulative wins over a single month; credits count in the running balance; ±0.01', () => {
    const a = base.filter((m) => m.customerCode === 'TEST-201');
    const ev = evaluateDebt(9000.01, a);
    expect(ev.result).toBe('נסגר לאפס – מצטבר');
    expect(ev.months).toEqual(['2026-08', '2026-09']);
    expect(evaluateDebt(4000, a).months).toEqual(['2026-08']); // first month = cumulative of one month
    const withCredit = [mv('X', '2026-08', 5000), mv('X', '2026-09', -1000), mv('X', '2026-10', 2000)];
    expect(evaluateDebt(4000, withCredit)).toMatchObject({ result: 'נסגר לאפס – מצטבר', months: ['2026-08', '2026-09'] });
    expect(evaluateDebt(9000.02, a).result).toBe('לברר מול הלקוח');
  });
  it('single month: the oldest of equal balances, the others reported', () => {
    const ev = evaluateDebt(3000, [mv('X', '2026-08', 1000), mv('X', '2026-09', 3000), mv('X', '2026-10', 3000)]);
    expect(ev).toMatchObject({ result: 'נסגר לאפס – חודש אחד', months: ['2026-09'], sameBalanceMonths: ['2026-10'] });
  });
});

describe('CheckDebt', () => {
  it('cumulative close → נסגר לאפס – מצטבר, months, פיזור מוצע – לאישור and the alert נסגר לאפס (isAlert)', async () => {
    const fake = world(base);
    const r = await invoke({ receiptKeys: ['RCPT-A'], asOfDate: T }, CTX);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ ok: true, writeVerified: true, alerts: 1, tasks: 0 });
    expect(r.results[0]).toMatchObject({ receiptKey: 'RCPT-A', result: 'נסגר לאפס – מצטבר', months: ['2026-08', '2026-09'], taskKey: 'debt-zero:RCPT-A', matchStatus: 'פיזור מוצע – לאישור' });
    expect(rec(fake, 'RCPT-A')).toMatchObject({ debtCheckResult: 'נסגר לאפס – מצטבר', debtCheckMonths: '2026-08,2026-09', matchStatus: 'פיזור מוצע – לאישור' });
    const [alert] = tasks(fake, 'debt-zero:RCPT-A');
    expect(alert).toMatchObject({ taskType: 'נסגר לאפס', isAlert: true, status: 'ממתין', source: 'תקבולים', relatedTable: 'Receipts', relatedId: 'RCPT-A', customerCode: 'TEST-201', assignedBookkeeperName: BK, amount: 9000, isTestFixture: true });
    expect(alert.title).toBe('נסגר לאפס – בדיקה – אלפא: קבלה 9,000 ש״ח');
    expect(tasks(fake, 'debt-check:RCPT-A')).toEqual([]);
  });

  it('single-month close → נסגר לאפס – חודש אחד with that month, alert', async () => {
    const fake = world(base);
    const r = await invoke({ receiptKeys: ['RCPT-B'], asOfDate: T }, CTX);
    expect(r.results[0]).toMatchObject({ result: 'נסגר לאפס – חודש אחד', months: ['2026-10'] });
    expect(rec(fake, 'RCPT-B')).toMatchObject({ debtCheckResult: 'נסגר לאפס – חודש אחד', debtCheckMonths: '2026-10', matchStatus: 'פיזור מוצע – לאישור' });
    expect(tasks(fake, 'debt-zero:RCPT-B')[0]).toMatchObject({ isAlert: true, taskType: 'נסגר לאפס' });
  });

  it('no close → לברר מול הלקוח, על חשבון – צריך פיזור and the task debt-check:<receiptKey> for the bookkeeper; a customer with no movements too', async () => {
    const fake = world(base);
    const r = await invoke({ receiptKeys: ['RCPT-C', 'RCPT-D', 'RCPT-E', 'RCPT-NONE'], asOfDate: T }, CTX);
    expect(r).toMatchObject({ ok: true, tasks: 2, alerts: 0, writeVerified: true });
    expect(rec(fake, 'RCPT-C')).toMatchObject({ debtCheckResult: 'לברר מול הלקוח', debtCheckMonths: null, matchStatus: 'על חשבון – צריך פיזור' });
    const [task] = tasks(fake, 'debt-check:RCPT-C');
    expect(task).toMatchObject({ taskType: 'לברר מול הלקוח – סכום לא סוגר חודש', isAlert: false, status: 'ממתין', assignedBookkeeperName: BK, relatedId: 'RCPT-C', amount: 7777 });
    expect(task.reasons).toContain('לא שווה ליתרה המצטברת');
    expect(rec(fake, 'RCPT-D')).toMatchObject({ debtCheckResult: 'לברר מול הלקוח' });
    expect(tasks(fake, 'debt-check:RCPT-D')[0].reasons).toContain('ללקוח אין תנועות פתוחות');
    // not approved / missing → skipped, nothing written for them
    expect(r.results.find((x: any) => x.receiptKey === 'RCPT-E').skippedReason).toContain('עוד לא אושרה');
    expect(rec(fake, 'RCPT-E').debtCheckResult).toBeNull();
    expect(r.results.find((x: any) => x.receiptKey === 'RCPT-NONE').skippedReason).toBe('הקבלה לא נמצאה');
  });

  it('an empty OpenMovements mirror = unknown: nothing decided, nothing written, an error', async () => {
    const fake = world([]);
    const mark = fake.calls.length;
    const r = await invoke({ receiptKeys: ['RCPT-A', 'RCPT-C'], asOfDate: T }, CTX);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('OpenMovements ריקה');
    expect(writesSince(fake, mark)).toEqual([]);
    expect(rec(fake, 'RCPT-A').debtCheckResult).toBeNull();
    expect(fake.rows('CollectionQueue')).toEqual([]);
  });

  it('idempotent: a rerun keeps the stored result (also after the movements changed) and never duplicates the task; a closed task stays closed', async () => {
    const fake = world(base);
    await invoke({ receiptKeys: ['RCPT-A', 'RCPT-C'], asOfDate: T }, CTX);
    const before = JSON.stringify(fake.rows('Receipts'));
    // the next pull: Priority now shows other balances – the earlier decision stands
    fake.insert('OpenMovements', [mv('TEST-201', '2026-06', 1234)]);
    const r2 = await invoke({ receiptKeys: ['RCPT-A', 'RCPT-C'], asOfDate: T }, CTX);
    expect(r2.errors).toEqual([]);
    expect(r2.results.map((x: any) => [x.result, x.already])).toEqual([
      ['נסגר לאפס – מצטבר', true],
      ['לברר מול הלקוח', true],
    ]);
    expect(JSON.stringify(fake.rows('Receipts'))).toBe(before);
    expect(tasks(fake, 'debt-zero:RCPT-A')).toHaveLength(1);
    expect(tasks(fake, 'debt-check:RCPT-C')).toHaveLength(1);
    // a person closes the task: a rerun does not reopen it
    tasks(fake, 'debt-check:RCPT-C')[0].status = 'טופל';
    const r3 = await invoke({ receiptKeys: ['RCPT-C'], asOfDate: T }, CTX);
    expect(r3.results[0].taskChange).toBe('keptClosed');
    expect(tasks(fake, 'debt-check:RCPT-C')).toHaveLength(1);
    expect(tasks(fake, 'debt-check:RCPT-C')[0].status).toBe('טופל');
  });

  it('dryRun reports and writes nothing; an allocated receipt keeps its matchStatus', async () => {
    const fake = world(base);
    const mark = fake.calls.length;
    const dry = await invoke({ receiptKeys: ['RCPT-A'], asOfDate: T, dryRun: true }, CTX);
    expect(dry.results[0]).toMatchObject({ result: 'נסגר לאפס – מצטבר', taskKey: 'debt-zero:RCPT-A' });
    expect(writesSince(fake, mark)).toEqual([]);
    rec(fake, 'RCPT-A').matchStatus = 'מפוזרת';
    await invoke({ receiptKeys: ['RCPT-A'], asOfDate: T }, CTX);
    expect(rec(fake, 'RCPT-A')).toMatchObject({ debtCheckResult: 'נסגר לאפס – מצטבר', matchStatus: 'מפוזרת' });
  });
});
