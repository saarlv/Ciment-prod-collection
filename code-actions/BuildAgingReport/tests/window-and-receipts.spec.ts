import { describe, expect, it } from 'vitest';
import { buildWindow, computeAging } from '../../shared/collections-aging.ts';

// Since 26.10: the window goes back (monthsBack) AND forward (monthsForward); negative amounts stay as they are in
// their month cell (credit notes, the unallocated part of our receipts); fully paid invoices leave, partly paid
// ones stay with their remainder; the customer columns come from Customers; the balance check stays coherent.
const T = '2026-10-21';
const customer = {
  customerCode: 'C',
  customerName: 'c',
  priorityStatus: 'פעיל',
  paymentTermsLabel: 'שוטף+60',
  paymentMethod: 'העברה בנקאית',
  collectionNote: 'משלמים ב-30 לחודש',
  ledgerBalance: 4000,
};
const inv = (no: string, openAmount: number, dueDate: string, extra: any = {}) => ({
  invoiceNumber: no,
  customerCode: 'C',
  documentType: 'חשבונית',
  amount: openAmount,
  openAmount,
  dueDate,
  syncedAt: '2026-10-21T03:00:00.000Z',
  ...extra,
});

describe('aging window back and forward', () => {
  it('monthsBack 2 + monthsForward 2 → 5 month columns; debt before is חוב קודם, after is חוב מאוחר', () => {
    const w = buildWindow(T, 2, 2);
    expect(w.monthKeys).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
    const r = computeAging({
      window: w,
      customers: [{ ...customer, ledgerBalance: 1111 }],
      invoices: [inv('P', 1, '2026-07-31'), inv('M8', 10, '2026-08-31'), inv('M12', 100, '2026-12-31'), inv('L', 1000, '2027-01-31')],
      notes: [],
      ownerMap: new Map(),
    });
    const c = r.customers[0];
    expect(c.priorDebt.amount).toBe(1);
    expect(c.months.map((m) => [m.monthKey, m.amount])).toEqual([
      ['2026-08', 10],
      ['2026-09', 0],
      ['2026-10', 0],
      ['2026-11', 0],
      ['2026-12', 100],
    ]);
    expect(c.laterDebt.amount).toBe(1000);
    expect(c.laterDebt.byMonth.map((m) => m.monthKey)).toEqual(['2027-01']);
    expect(c.balanceMatches).toBe(true);
  });
});

describe('customer columns, paid / partly paid invoices and unallocated receipts', () => {
  const w = buildWindow(T, 3, 1);
  const receipt = {
    receiptKey: 'RCPT-BL-1',
    bankLineId: 'BL-1',
    customerCode: 'C',
    customerName: 'c',
    valueDate: '2026-10-20',
    amount: 3500,
    allocatedAmount: 3000,
    unallocatedAmount: 500,
    // receipt first (r3): readers go by receiptStatus
    receiptStatus: 'אושרה – לא נשלחה',
    preparedAt: '2026-10-21T06:00:00.000Z',
  };
  const allocations = [
    { receiptKey: 'RCPT-BL-1', bankLineId: 'BL-1', invoiceNumber: 'A', customerCode: 'C', amount: 1000, status: 'מוכנה', at: '2026-10-21T06:00:00.000Z' },
    { receiptKey: 'RCPT-BL-1', bankLineId: 'BL-1', invoiceNumber: 'B', customerCode: 'C', amount: 2000, status: 'מוכנה', at: '2026-10-21T06:00:00.000Z' },
  ];
  // ledger = A 1,000 + B 3,000 + credit −500 + D 500 = 4,000 (Priority does not know the receipt yet)
  const invoices = [inv('A', 1000, '2026-09-30'), inv('B', 3000, '2026-10-31'), inv('CR', -500, '2026-08-15', { documentType: 'חשבונית זיכוי' }), inv('D', 500, '2026-11-30')];
  const run = (receipts: any[], invs = invoices, ledgerBalance = 4000) =>
    computeAging({
      window: w,
      customers: [{ ...customer, ledgerBalance }],
      invoices: invs,
      notes: [],
      matchProposals: { proposals: [], receipts, allocations: receipts.length ? allocations.map((a) => ({ ...a, status: receipts[0].status })) : [] },
      receipts,
      ownerMap: new Map(),
    }).customers[0];

  it('before Priority knows the receipt: A leaves, B stays with 1,000, −500 receipt entry at 20.10, the credit note stays negative; balance matches', () => {
    const c = run([receipt]);
    expect(c).toMatchObject({ priorityStatus: 'פעיל', paymentTermsLabel: 'שוטף+60', paymentMethod: 'העברה בנקאית', collectionNote: 'משלמים ב-30 לחודש' });
    const all = [c.priorDebt, ...c.months, c.laterDebt].flatMap((x) => x.invoices);
    expect(all.map((i) => i.invoiceNumber)).not.toContain('A');
    expect(all.find((i) => i.invoiceNumber === 'B')).toMatchObject({ openAmount: 1000, remainingAmount: 1000, priorityOpenAmount: 3000, paymentStatus: 'שולמה חלקית', kind: 'חשבונית' });
    expect(all.find((i) => i.invoiceNumber === 'CR')).toMatchObject({ openAmount: -500, kind: 'חשבונית זיכוי' });
    const oct = c.months.find((m) => m.monthKey === '2026-10')!;
    expect(oct.invoices.map((i) => [i.kind, i.id, i.amount])).toEqual([
      ['קבלה לא מותאמת', 'RCPT-BL-1', -500],
      ['חשבונית', 'B', 3000],
    ]);
    expect(oct.amount).toBe(500); // B's 1,000 left − the receipt's 500 on account
    expect(c.total).toBe(500); // −500 (credit) + 1,000 (B) − 500 (receipt) + 500 (D)
    expect([c.paidSeenPending, c.unallocatedReceipts, c.unallocatedPending]).toEqual([3000, 500, 500]);
    expect(c.balanceMatches).toBe(true); // 500 = 4,000 − 3,000 − 500
  });

  it('after the receipt is issued and Priority synced: same picture, nothing pending, balance still matches', () => {
    const issued = { ...receipt, receiptStatus: 'הונפקה ב-Priority', status: 'הונפקה ב-Priority', issuedAt: '2026-10-21T07:00:00.000Z' };
    // Priority now shows A paid, B with 1,000 and the 500 on account in its ledger
    const synced = [inv('B', 1000, '2026-10-31', { amount: 3000, syncedAt: '2026-10-21T09:00:00.000Z' }), inv('CR', -500, '2026-08-15', { documentType: 'חשבונית זיכוי', syncedAt: '2026-10-21T09:00:00.000Z' }), inv('D', 500, '2026-11-30', { syncedAt: '2026-10-21T09:00:00.000Z' })];
    const c = run([issued], synced, 500);
    const b = [c.priorDebt, ...c.months, c.laterDebt].flatMap((x) => x.invoices).find((i) => i.invoiceNumber === 'B');
    expect(b).toMatchObject({ openAmount: 1000, priorityOpenAmount: 1000, paymentStatus: 'שולמה חלקית' });
    expect([c.total, c.paidSeenPending, c.unallocatedPending, c.unallocatedReceipts]).toEqual([500, 0, 0, 500]);
    expect(c.balanceMatches).toBe(true);
  });

  it('a fully allocated receipt adds no entry', () => {
    const c = run([{ ...receipt, unallocatedAmount: 0, allocatedAmount: 3500 }]);
    expect([c.priorDebt, ...c.months, c.laterDebt].flatMap((x) => x.invoices).some((i) => i.kind === 'קבלה לא מותאמת')).toBe(false);
  });
});
