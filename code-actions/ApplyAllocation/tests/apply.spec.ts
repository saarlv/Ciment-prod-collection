import { describe, expect, it, vi } from 'vitest';
import { allocationWorld, allocs, C1, NOW, rec, receipt, T, tasks } from '../../shared/fake-allocation.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { applyAllocation } from '../../shared/collections-allocation.ts';

const CTX = { appId: 'test', token: 't' };
const world = (receipts: any[]) => {
  const w = allocationWorld({ receipts });
  current = w.client;
  return w;
};
const apply = (w: any, input: any) => applyAllocation(w.client, { asOfDate: T, approvedBy: 'דנה', ...input }, { nowIso: NOW });
const writes = (w: any) => w.fake.calls.filter((c: any) => ['updateItem', 'createItem', 'deleteItem'].includes(c.method));

describe('ApplyAllocation – validation (nothing is written on any error)', () => {
  it('another customer\'s invoice, an unknown invoice, amount 0, above the open balance, twice, total above the receipt', async () => {
    const w = world([receipt('RCPT-1', 3000)]);
    const r = await invoke(
      {
        receiptKey: 'RCPT-1',
        asOfDate: T,
        allocations: [
          { invoiceNumber: 'B-1', amount: 100 },
          { invoiceNumber: 'Z-9', amount: 100 },
          { invoiceNumber: 'A-1', amount: 0 },
          { invoiceNumber: 'A-2', amount: 2500 },
          { invoiceNumber: 'A-2', amount: 100 },
        ],
      },
      CTX,
    );
    expect(r.ok).toBe(false);
    const all = r.errors.join(' | ');
    expect(all).toContain('B-1 שייכת ללקוח אחר (TEST-302)');
    expect(all).toContain('Z-9 אינה חשבונית פתוחה של הלקוח');
    expect(all).toContain('A-1: הסכום חייב להיות גדול מ-0');
    expect(all).toContain('A-2: 2,500 ש״ח גבוה מהיתרה הפתוחה שלה (2,000 ש״ח)');
    expect(all).toContain('A-2 מופיעה פעמיים');
    expect(writes(w)).toEqual([]);
    const over = await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-2', amount: 2000 }, { invoiceNumber: 'A-3', amount: 1500 }] });
    expect(over.errors).toEqual(['סך הפיזור 3,500 ש״ח גבוה מסכום הקבלה (3,000 ש״ח)']);
    expect(writes(w)).toEqual([]);
  });

  it('the open balance counts the allocations of other receipts', async () => {
    const w = world([receipt('RCPT-1', 3000), receipt('RCPT-2', 1200, { matchStatus: 'מפוזרת' })]);
    w.fake.insert('ReceiptAllocations', [{ receiptKey: 'RCPT-2', invoiceNumber: 'A-3', customerCode: C1, amount: 1200, status: 'מוכנה' }]);
    const r = await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-3', amount: 500 }] });
    expect(r.errors).toEqual(['חשבונית A-3: 500 ש״ח גבוה מהיתרה הפתוחה שלה (300 ש״ח)']);
  });

  it('a receipt not approved yet cannot be allocated', async () => {
    const w = world([receipt('RCPT-1', 1000, { receiptStatus: 'טיוטה – ממתינה לאישור' })]);
    const r = await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-1', amount: 1000 }] });
    expect(r.errors[0]).toContain('עוד לא אושרה');
  });
});

describe('ApplyAllocation – rows, receipt, tasks', () => {
  it('fully allocated (the unchanged proposal) → מפוזרת, source סכום, the debt-check task closes', async () => {
    const w = world([receipt('RCPT-1', 4000)]);
    w.fake.insert('CollectionQueue', [{ taskKey: 'debt-check:RCPT-1', taskType: 'לברר מול הלקוח – סכום לא סוגר חודש', status: 'ממתין', title: 'x', relatedId: 'RCPT-1' }]);
    const r = await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-3', amount: 1000 }, { invoiceNumber: 'A-1', amount: 1000 }, { invoiceNumber: 'A-2', amount: 2000 }] });
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ ok: true, allocated: 4000, unallocated: 0, matchStatus: 'מפוזרת', source: 'סכום', taskKey: '', writeVerified: true, closedTasks: ['debt-check:RCPT-1'] });
    const rows = allocs(w.fake, 'RCPT-1').sort((a: any, b: any) => a.invoiceNumber.localeCompare(b.invoiceNumber));
    expect(rows.map((x: any) => [x.invoiceNumber, x.amount, x.openBefore, x.openAfter, x.kind, x.isPartial, x.source, x.status])).toEqual([
      ['A-1', 1000, 1000, 0, 'מלאה', false, 'סכום', 'מוכנה'],
      ['A-2', 2000, 2000, 0, 'מלאה', false, 'סכום', 'מוכנה'],
      ['A-3', 1000, 1500, 500, 'חלקית', true, 'סכום', 'מוכנה'],
    ]);
    expect(rows[0]).toMatchObject({ customerCode: C1, dueDate: '2026-08-10', bankLineId: '1', sourceRef: 'דנה', at: NOW, isTestFixture: true });
    expect(rec(w.fake, 'RCPT-1')).toMatchObject({ allocatedAmount: 4000, unallocatedAmount: 0, matchStatus: 'מפוזרת' });
    expect(tasks(w.fake, 'debt-check:RCPT-1')[0]).toMatchObject({ status: 'נסגר אוטומטית' });
    expect(tasks(w.fake, 'allocate:RCPT-1')).toEqual([]);
  });

  it('partly allocated with open invoices left → על חשבון – צריך פיזור, source ידני, task allocate:<receiptKey>; completing it closes the task', async () => {
    const w = world([receipt('RCPT-1', 3000)]);
    const r = await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-4', amount: 1000 }] });
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ allocated: 1000, unallocated: 2000, matchStatus: 'על חשבון – צריך פיזור', source: 'ידני', taskKey: 'allocate:RCPT-1', taskChange: 'created' });
    const [task] = tasks(w.fake, 'allocate:RCPT-1');
    expect(task).toMatchObject({ taskType: 'קבלה – צריך פיזור', status: 'ממתין', amount: 2000, relatedTable: 'Receipts', relatedId: 'RCPT-1', source: 'תקבולים' });
    expect(task.title).toContain('2,000 ש״ח עוד לא פוזרו');
    // re-apply REPLACES the receipt's rows (many-to-many: the old row goes, the new ones come)
    const again = await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-1', amount: 1000 }, { invoiceNumber: 'A-2', amount: 2000 }] });
    expect(again.errors).toEqual([]);
    expect(allocs(w.fake, 'RCPT-1').map((x: any) => x.invoiceNumber).sort()).toEqual(['A-1', 'A-2']);
    expect(again).toMatchObject({ matchStatus: 'מפוזרת', closedTasks: ['allocate:RCPT-1'] });
    expect(tasks(w.fake, 'allocate:RCPT-1')[0]).toMatchObject({ status: 'נסגר אוטומטית' });
    expect(rec(w.fake, 'RCPT-1')).toMatchObject({ allocatedAmount: 3000, unallocatedAmount: 0 });
  });

  it('a surplus with no open invoice left → מפוזרת – עודף על חשבון, no task', async () => {
    const w = world([receipt('RCPT-1', 8000)]);
    const all = [{ invoiceNumber: 'A-1', amount: 1000 }, { invoiceNumber: 'A-2', amount: 2000 }, { invoiceNumber: 'A-3', amount: 1500 }, { invoiceNumber: 'A-4', amount: 2500 }];
    const r = await apply(w, { receiptKey: 'RCPT-1', allocations: all });
    expect(r).toMatchObject({ allocated: 7000, unallocated: 1000, matchStatus: 'מפוזרת – עודף על חשבון', openInvoicesLeft: 0, source: 'סכום', taskKey: '' });
    expect(tasks(w.fake, 'allocate:RCPT-1')).toEqual([]);
  });

  it('one invoice paid by two receipts: the second receipt sees what the first left', async () => {
    const w = world([receipt('RCPT-1', 1000), receipt('RCPT-2', 500)]);
    await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-3', amount: 1000 }] });
    const r = await apply(w, { receiptKey: 'RCPT-2', allocations: [{ invoiceNumber: 'A-3', amount: 500 }] });
    expect(r.errors).toEqual([]);
    expect(allocs(w.fake, 'RCPT-2')[0]).toMatchObject({ invoiceNumber: 'A-3', openBefore: 500, openAfter: 0, kind: 'מלאה', isPartial: false });
    expect(w.fake.rows('ReceiptAllocations').filter((a: any) => a.invoiceNumber === 'A-3')).toHaveLength(2);
  });

  it('a write failure rolls back every row written; dryRun writes nothing', async () => {
    const w = world([receipt('RCPT-1', 3000)]);
    w.fake.insert('ReceiptAllocations', [{ receiptKey: 'RCPT-1', invoiceNumber: 'A-1', customerCode: C1, amount: 1000, openBefore: 1000, status: 'מוכנה' }]);
    const dry = await apply(w, { receiptKey: 'RCPT-1', dryRun: true, allocations: [{ invoiceNumber: 'A-2', amount: 2000 }] });
    expect(dry).toMatchObject({ ok: true, allocated: 2000, matchStatus: 'על חשבון – צריך פיזור' });
    expect(writes(w)).toEqual([]);
    w.fake.failOn = (method, table) => method === 'updateItem' && table === 'Receipts';
    const r = await apply(w, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-2', amount: 2000 }] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('הפיזור של RCPT-1 לא נשמר');
    expect(allocs(w.fake, 'RCPT-1').map((x: any) => [x.invoiceNumber, x.amount])).toEqual([['A-1', 1000]]);
    expect(rec(w.fake, 'RCPT-1').matchStatus).toBe('על חשבון – צריך פיזור');
  });
});
