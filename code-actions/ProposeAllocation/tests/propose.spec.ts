import { describe, expect, it, vi } from 'vitest';
import { allocationWorld, allocs, BK, C1, NOW, rec, receipt, T, tasks } from '../../shared/fake-allocation.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { proposeAllocation } from '../../shared/collections-allocation.ts';

const CTX = { appId: 'test', token: 't' };
const world = (receipts: any[], settings: Record<string, string> = {}) => {
  const w = allocationWorld({ receipts, settings });
  current = w.client;
  return w;
};
const propose = (w: any, input: any) => proposeAllocation(w.client, { asOfDate: T, ...input }, { nowIso: NOW });

describe('ProposeAllocation – the proposal', () => {
  it('oldest to newest, the last invoice partial, grouped by due month; dryRun writes nothing', async () => {
    const w = world([receipt('RCPT-1', 4000)]);
    const r = await invoke({ receiptKey: 'RCPT-1', dryRun: true, asOfDate: T }, CTX);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ ok: true, customerCode: C1, amount: 4000, proposedTotal: 4000, surplus: 0, openTotal: 7000, allocationConfidence: 30, autoApplied: false, alreadyAllocated: false });
    expect(r.proposal).toEqual([
      { invoiceNumber: 'A-1', amount: 1000, isPartial: false },
      { invoiceNumber: 'A-2', amount: 2000, isPartial: false },
      { invoiceNumber: 'A-3', amount: 1000, isPartial: true },
    ]);
    expect(r.months.map((m: any) => [m.dueMonth, m.openTotal, m.invoices.length])).toEqual([
      ['2026-08', 3000, 2],
      ['2026-09', 1500, 1],
      ['2026-10', 2500, 1],
    ]);
    // Invoices adds details only: the original amount and the invoice date; the credit movement is not an invoice
    expect(r.months[0].invoices[0]).toMatchObject({ invoiceNumber: 'A-1', invoiceAmount: 1200, openInPriority: 1000, openBefore: 1000, invoiceDate: '2026-07-10', proposed: 1000 });
    expect(r.months[1].invoices[0]).toMatchObject({ invoiceNumber: 'A-3', proposed: 1000, isPartial: true });
    expect(w.fake.calls.filter((c: any) => ['updateItem', 'createItem', 'deleteItem'].includes(c.method))).toEqual([]);
  });

  it('a surplus beyond the open invoices stays on account', async () => {
    const w = world([receipt('RCPT-1', 8000)]);
    const r = await propose(w, { receiptKey: 'RCPT-1', dryRun: true });
    expect(r).toMatchObject({ proposedTotal: 7000, surplus: 1000, allocationConfidence: 30 });
    expect(r.proposal.every((l: any) => !l.isPartial)).toBe(true);
  });

  it('starts from the months the debt check closed: a single closed month comes first, confidence 100', async () => {
    const w = world([receipt('RCPT-1', 2500, { debtCheckResult: 'נסגר לאפס – חודש אחד', debtCheckMonths: '2026-10', matchStatus: 'פיזור מוצע – לאישור' })]);
    const r = await propose(w, { receiptKey: 'RCPT-1' });
    expect(r.errors).toEqual([]);
    expect(r.proposal).toEqual([{ invoiceNumber: 'A-4', amount: 2500, isPartial: false }]);
    expect(r).toMatchObject({ allocationConfidence: 100, closedMonths: ['2026-10'], matchStatus: 'פיזור מוצע – לאישור', taskKey: 'allocate:RCPT-1', writeVerified: true });
    expect(r.months.find((m: any) => m.dueMonth === '2026-10').closedByDebtCheck).toBe(true);
    expect(rec(w.fake, 'RCPT-1')).toMatchObject({ allocationConfidence: 100, matchStatus: 'פיזור מוצע – לאישור' });
    // the proposal waits for a person: the task קבלה – צריך פיזור; nothing allocated yet
    expect(tasks(w.fake, 'allocate:RCPT-1')[0]).toMatchObject({ taskType: 'קבלה – צריך פיזור', status: 'ממתין', source: 'תקבולים', relatedTable: 'Receipts', relatedId: 'RCPT-1', assignedBookkeeperName: BK, isAlert: false, isTestFixture: true });
    expect(allocs(w.fake, 'RCPT-1')).toEqual([]);
  });

  it('a zero close whose invoices do not add up exactly → confidence 80 (cumulative Aug + Sep with the Sep credit)', async () => {
    // Aug 3,000 + Sep (1,500 − 500) = 4,000 closes cumulatively; the invoices of those months are 4,500 → A-3 partial
    const w = world([receipt('RCPT-1', 4000, { debtCheckResult: 'נסגר לאפס – מצטבר', debtCheckMonths: '2026-08,2026-09' })]);
    const r = await propose(w, { receiptKey: 'RCPT-1', dryRun: true });
    expect(r.proposal.map((l: any) => [l.invoiceNumber, l.amount, l.isPartial])).toEqual([
      ['A-1', 1000, false],
      ['A-2', 2000, false],
      ['A-3', 1000, true],
    ]);
    expect(r.allocationConfidence).toBe(80);
  });

  it('לברר מול הלקוח: confidence written, no proposed state and no task (the debt-check task carries it)', async () => {
    const w = world([receipt('RCPT-1', 3000)]);
    const r = await propose(w, { receiptKey: 'RCPT-1' });
    expect(r).toMatchObject({ ok: true, allocationConfidence: 50, matchStatus: 'על חשבון – צריך פיזור', taskKey: '' });
    expect(rec(w.fake, 'RCPT-1')).toMatchObject({ allocationConfidence: 50, matchStatus: 'על חשבון – צריך פיזור' });
    expect(w.fake.rows('CollectionQueue')).toEqual([]);
  });

  it('an invoice already paid in part by another receipt: its open balance is net of that allocation', async () => {
    const w = world([receipt('RCPT-1', 3000), receipt('RCPT-OTHER', 2500, { matchStatus: 'מפוזרת' })]);
    w.fake.insert('ReceiptAllocations', [
      { receiptKey: 'RCPT-OTHER', invoiceNumber: 'A-1', customerCode: C1, amount: 1000, status: 'מוכנה' },
      { receiptKey: 'RCPT-OTHER', invoiceNumber: 'A-2', customerCode: C1, amount: 1500, status: 'מוכנה' },
    ]);
    const r = await propose(w, { receiptKey: 'RCPT-1', dryRun: true });
    // A-1 fully paid → not offered; A-2 has 500 left
    expect(r.months[0].invoices.map((i: any) => [i.invoiceNumber, i.openBefore, i.allocatedByOthers])).toEqual([['A-2', 500, 1500]]);
    expect(r.months[0].invoices[0].otherReceipts).toEqual([{ receiptKey: 'RCPT-OTHER', amount: 1500 }]);
    expect(r.proposal).toEqual([
      { invoiceNumber: 'A-2', amount: 500, isPartial: false },
      { invoiceNumber: 'A-3', amount: 1500, isPartial: false },
      { invoiceNumber: 'A-4', amount: 1000, isPartial: true },
    ]);
  });

  it('an allocated receipt is never overwritten: the proposal comes back with alreadyAllocated and current[]', async () => {
    const w = world([receipt('RCPT-1', 1000, { matchStatus: 'מפוזרת', allocationConfidence: 30 })]);
    w.fake.insert('ReceiptAllocations', [{ receiptKey: 'RCPT-1', invoiceNumber: 'A-3', customerCode: C1, amount: 1000, status: 'מוכנה' }]);
    const r = await propose(w, { receiptKey: 'RCPT-1' });
    expect(r).toMatchObject({ ok: true, alreadyAllocated: true, current: [{ invoiceNumber: 'A-3', amount: 1000 }], matchStatus: 'מפוזרת' });
    // its own rows are not subtracted: A-3 is offered with its full 1,500 and shows current 1,000
    expect(r.months.find((m: any) => m.dueMonth === '2026-09').invoices[0]).toMatchObject({ openBefore: 1500, current: 1000 });
    expect(w.fake.calls.filter((c: any) => ['updateItem', 'createItem', 'deleteItem'].includes(c.method))).toEqual([]);
  });

  it('errors: missing receipt, not approved, empty mirror', async () => {
    const w = world([receipt('RCPT-D', 1000, { receiptStatus: 'טיוטה – ממתינה לאישור' })]);
    expect((await propose(w, { receiptKey: 'NOPE' })).errors[0]).toContain('לא נמצאה');
    expect((await propose(w, { receiptKey: 'RCPT-D' })).errors[0]).toContain('עוד לא אושרה');
    w.fake.rows('OpenMovements').splice(0);
    w.fake.rows('Receipts')[0].receiptStatus = 'אושרה – לא נשלחה';
    const r = await propose(w, { receiptKey: 'RCPT-D' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('OpenMovements ריקה');
  });
});

describe('ProposeAllocation – allocationAutoApproveAt', () => {
  const closed = () => receipt('RCPT-1', 2500, { debtCheckResult: 'נסגר לאפס – חודש אחד', debtCheckMonths: '2026-10', matchStatus: 'פיזור מוצע – לאישור' });

  it('empty (off, the default): nothing is applied', async () => {
    const w = world([closed()]);
    const r = await propose(w, { receiptKey: 'RCPT-1' });
    expect(r).toMatchObject({ autoApproveAt: null, wouldAutoApply: false, autoApplied: false });
    expect(allocs(w.fake, 'RCPT-1')).toEqual([]);
  });

  it('on and reached: applied at once with אושר אוטומטית; the proposal task is not opened', async () => {
    const w = world([closed()], { allocationAutoApproveAt: '90' });
    const r = await propose(w, { receiptKey: 'RCPT-1' });
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ autoApproveAt: 90, wouldAutoApply: true, autoApplied: true, matchStatus: 'מפוזרת', writeVerified: true });
    expect(allocs(w.fake, 'RCPT-1')).toEqual([expect.objectContaining({ invoiceNumber: 'A-4', amount: 2500, kind: 'מלאה', isPartial: false, source: 'סכום', sourceRef: 'אושר אוטומטית', status: 'מוכנה' })]);
    expect(rec(w.fake, 'RCPT-1')).toMatchObject({ allocatedAmount: 2500, unallocatedAmount: 0, matchStatus: 'מפוזרת', allocationConfidence: 100 });
    expect(tasks(w.fake, 'allocate:RCPT-1')).toEqual([]);
  });

  it('on but not reached: stays a proposal for a person', async () => {
    const w = world([receipt('RCPT-1', 4000)], { allocationAutoApproveAt: '90' });
    const r = await propose(w, { receiptKey: 'RCPT-1' });
    expect(r).toMatchObject({ allocationConfidence: 30, wouldAutoApply: false, autoApplied: false });
    expect(allocs(w.fake, 'RCPT-1')).toEqual([]);
  });
});
