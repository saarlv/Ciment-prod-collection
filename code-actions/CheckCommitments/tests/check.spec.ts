import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { checkCommitments } from '../../shared/collections-note-runs.ts';

const T = '2026-11-11'; // Wednesday
const NOW = '2026-11-11T07:00:00.000Z';
const commitment = (code: string, extra: any = {}) => ({
  customerCode: code,
  customerName: `לקוח ${code}`,
  dueMonth: '2026-10',
  noteType: 'התחייבות לתשלום',
  actionDate: '2026-11-09', // check day 10.11 (offset 1) ≤ 11.11
  amount: 10000,
  balanceAtNote: 12000,
  status: 'פעילה',
  outcome: 'פתוחה',
  noteCreatedAt: '2026-11-02T08:00:00.000Z',
  ...extra,
});
const mv = (code: string, amount: number, dueMonth = '2026-10') => ({ movementId: `${code}-${amount}`, customerCode: code, dueMonth, amount, docType: 'חשבונית' });

function world() {
  const fake = new FakeBlocks();
  fake.insert('CustomerNotes', [
    commitment('TEST-K'), // receipts 10,000 → קוימה
    commitment('TEST-P'), // 4,000 → קוימה חלקית
    commitment('TEST-N'), // nothing → לא קוימה
    commitment('TEST-Z'), // month at 0 → קוימה even with nothing received
    commitment('TEST-F', { actionDate: '2026-11-11' }), // check day 12.11: not yet
    commitment('TEST-K', { outcome: 'קוימה', amountRemaining: 0 }), // final: not checked again
    commitment('TEST-B', { amount: null, balanceAtNote: 3000 }), // promised = balanceAtNote
  ]);
  fake.insert('OpenMovements', [mv('TEST-K', 10000), mv('TEST-P', 9000), mv('TEST-N', 7000), mv('TEST-Z', 500), mv('TEST-Z', -500), mv('TEST-F', 100), mv('TEST-B', 3000)]);
  fake.insert('Payments', [
    // Priority receipts since the note's day
    { customerCode: 'TEST-K', paymentRef: 'PR-1', receiptNumber: 'R-100', paymentDate: '2026-11-05', amount: 6000, method: 'העברה בנקאית' },
    // the Priority copy of our receipt RCPT-K (same priorityReceiptNumber) – counted once
    { customerCode: 'TEST-K', paymentRef: 'PR-2', receiptNumber: 'R-200', paymentDate: '2026-11-06', amount: 4000, method: 'העברה בנקאית' },
    // before the note was written – not counted
    { customerCode: 'TEST-N', paymentRef: 'PR-3', paymentDate: '2026-10-30', amount: 7000, method: 'צ׳ק' },
    // a credit / negative row is never a receipt
    { customerCode: 'TEST-N', paymentRef: 'PR-4', paymentDate: '2026-11-05', amount: -500, method: 'העברה בנקאית' },
    // the copy of our TEST-B receipt by its bank line
    { customerCode: 'TEST-B', paymentRef: 'PR-5', bankLineId: 'BL-B', paymentDate: '2026-11-08', amount: 1000, method: 'העברה בנקאית' },
  ]);
  fake.insert('Receipts', [
    { receiptKey: 'RCPT-K', customerCode: 'TEST-K', amount: 4000, valueDate: '2026-11-06', receiptStatus: 'הונפקה ב-Priority', priorityReceiptNumber: 'R-200', bankLineId: 'BL-K' },
    // our receipt approved here, not yet in Priority – counts until the API exists
    { receiptKey: 'RCPT-P', customerCode: 'TEST-P', amount: 4000, valueDate: '2026-11-08', receiptStatus: 'אושרה – לא נשלחה', bankLineId: 'BL-P' },
    // a draft pays nothing
    { receiptKey: 'RCPT-N', customerCode: 'TEST-N', amount: 7000, valueDate: '2026-11-08', receiptStatus: 'טיוטה – ממתינה לאישור', bankLineId: 'BL-N' },
    { receiptKey: 'RCPT-B', customerCode: 'TEST-B', amount: 1000, valueDate: '2026-11-08', receiptStatus: 'אושרה – לא נשלחה', bankLineId: 'BL-B' },
  ]);
  return fake;
}
const of = (r: any, code: string) => r.commitments.find((c: any) => c.customerCode === code);

describe('CheckCommitments', () => {
  it('the three outcomes; received = Priority receipts + our approved receipts since the note’s day, a receipt in both counted once', async () => {
    const fake = world();
    const r = await checkCommitments(fake.client(), { asOfDate: T, nowIso: NOW, dryRun: false });
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(r.commitments.map((c: any) => c.customerCode).sort()).toEqual(['TEST-B', 'TEST-K', 'TEST-N', 'TEST-P', 'TEST-Z']);
    expect(of(r, 'TEST-K')).toMatchObject({ promised: 10000, received: 10000, remaining: 0, outcome: 'קוימה', previousOutcome: 'פתוחה' });
    expect(of(r, 'TEST-K').receipts.map((x: any) => x.ref).sort()).toEqual(['P:PR-1', 'RCPT-K']);
    expect(of(r, 'TEST-P')).toMatchObject({ promised: 10000, received: 4000, remaining: 6000, outcome: 'קוימה חלקית' });
    expect(of(r, 'TEST-N')).toMatchObject({ received: 0, remaining: 10000, outcome: 'לא קוימה' });
    expect(of(r, 'TEST-Z')).toMatchObject({ received: 0, remaining: 0, monthBalance: 0, outcome: 'קוימה' });
    expect(of(r, 'TEST-B')).toMatchObject({ promised: 3000, received: 1000, remaining: 2000, outcome: 'קוימה חלקית' });
    expect([r.checked, r.kept, r.partlyKept, r.notKept]).toEqual([5, 2, 2, 1]);
    const n = fake.rows('CustomerNotes');
    expect(n[1]).toMatchObject({ outcome: 'קוימה חלקית', amountReceived: 4000, amountRemaining: 6000, checkedAt: NOW, status: 'פעילה' });
    expect(n[4]).toMatchObject({ outcome: 'פתוחה' }); // check day not reached
    expect(n[4].checkedAt).toBeUndefined();
  });

  it('builds the grouped commitment task with the not-kept / partly-kept rows only', async () => {
    const fake = world();
    const r = await checkCommitments(fake.client(), { asOfDate: T, nowIso: NOW, dryRun: false });
    expect(r.taskSync).toMatchObject({ created: 1 });
    const [task] = fake.rows('CollectionQueue');
    expect(task).toMatchObject({ taskKey: `notes:promise:${T}:ללא`, taskType: 'התחייבויות שלא קוימו – ליצור קשר', amount: 18000 });
    expect(task.itemsJson.map((row: any) => [row.customerCode, row.outcome, row.received, row.remaining]).sort()).toEqual([
      ['TEST-B', 'קוימה חלקית', 1000, 2000],
      ['TEST-N', 'לא קוימה', 0, 10000],
      ['TEST-P', 'קוימה חלקית', 4000, 6000],
    ]);
  });

  it('a not-kept commitment is re-evaluated on the next run (money came in) – its row then leaves the task', async () => {
    const fake = world();
    await checkCommitments(fake.client(), { asOfDate: T, nowIso: NOW, dryRun: false });
    fake.insert('Payments', [{ customerCode: 'TEST-N', paymentRef: 'PR-9', paymentDate: '2026-11-12', amount: 10000, method: 'העברה בנקאית' }]);
    const r = await checkCommitments(fake.client(), { asOfDate: '2026-11-12', nowIso: '2026-11-12T07:00:00.000Z', dryRun: false });
    expect(of(r, 'TEST-N')).toMatchObject({ previousOutcome: 'לא קוימה', outcome: 'קוימה', received: 10000 });
    expect(of(r, 'TEST-K')).toBeUndefined(); // קוימה is final
    const task = fake.rows('CollectionQueue').find((t) => t.taskKey === `notes:promise:${T}:ללא`)!;
    expect(task.itemsJson.map((row: any) => row.customerCode).sort()).toEqual(['TEST-B', 'TEST-P']);
  });

  it('dryRun is the default (invoke) and writes nothing; customerCode limits the run', async () => {
    const fake = world();
    current = fake.client();
    const mark = fake.calls.length;
    const r = await invoke({ asOfDate: T, customerCode: 'TEST-P' }, {});
    expect(r.dryRun).toBe(true);
    expect(r.commitments.map((c: any) => c.customerCode)).toEqual(['TEST-P']);
    expect(fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method))).toEqual([]);
  });
});
