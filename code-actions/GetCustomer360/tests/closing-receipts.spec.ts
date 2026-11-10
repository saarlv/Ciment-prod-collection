import { describe, expect, it } from 'vitest';
import { closingReceiptsByInvoice, invoiceClosingOf, invoicePaidOf } from '../../shared/collections-closing-receipts.ts';

const C = 'C-1';
const invoices = [
  { invoiceNumber: 'I-1', customerCode: C, dueDate: '2026-09-01', amount: 10000, openAmount: 0, status: 'שולמה' },
  { invoiceNumber: 'I-2', customerCode: C, dueDate: '2026-09-15', amount: 6000, openAmount: 0, status: 'שולמה' },
  { invoiceNumber: 'I-3', customerCode: C, dueDate: '2026-09-20', amount: 3000, openAmount: 0, status: 'שולמה', paidPriorityDoneAt: '2026-10-12T09:00:00.000Z' },
  { invoiceNumber: 'I-4', customerCode: C, dueDate: '2026-10-20', amount: 2000, openAmount: 2000, status: 'פתוחה' },
];
const payments = [
  // one Priority receipt over two invoices: spread oldest due first, each up to the invoice amount
  { id: '1', paymentRef: 'PR-1', receiptNumber: 'R-1', customerCode: C, paymentDate: '2026-10-05', amount: 12000, method: 'צ׳ק', matchedInvoiceNumbers: 'I-2,I-1' },
  // Priority's copy of our receipt RCPT-BL-9: counted once, as ours
  { id: '2', paymentRef: 'PR-2', receiptNumber: 'R-77', customerCode: C, paymentDate: '2026-10-06', amount: 500, method: 'העברה בנקאית', matchedInvoiceNumbers: 'I-2' },
  // a Priority receipt naming one invoice: in full, not an estimate
  { id: '3', paymentRef: 'PR-3', receiptNumber: 'R-3', customerCode: C, paymentDate: '2026-10-08', amount: 3500, method: 'העברה בנקאית', matchedInvoiceNumbers: 'I-2' },
];
const receipts = [
  { receiptKey: 'RCPT-BL-9', bankLineId: 'BL-9', customerCode: C, receiptStatus: 'הונפקה ב-Priority', status: 'הונפקה ב-Priority', priorityReceiptNumber: 'R-77', valueDate: '2026-10-04' },
];
const allocations = [
  { receiptKey: 'RCPT-BL-9', invoiceNumber: 'I-2', customerCode: C, amount: 500, status: 'הונפקה ב-Priority', at: '2026-10-06T10:00:00.000Z' },
];
const src = { receipts, allocations, payments, invoices };

describe('closing receipts of a closed invoice (same rule as the promise engine)', () => {
  const byInvoice = closingReceiptsByInvoice(C, src, '2026-11-01');

  it('spreads a multi-invoice Priority receipt oldest due first and marks it an estimate', () => {
    expect(byInvoice.get('I-1')).toEqual([
      expect.objectContaining({ source: 'Priority', receiptKey: null, priorityReceiptNumber: 'R-1', paymentRef: 'PR-1', date: '2026-10-05', method: 'צ׳ק', amount: 10000, status: 'הונפקה ב-Priority', isEstimate: true }),
    ]);
  });

  it('lists ours and Priority receipts, newest first, and counts the Priority copy of our receipt once', () => {
    const rows = byInvoice.get('I-2')!;
    expect(rows.map((r) => [r.source, r.receiptKey ?? r.paymentRef, r.amount, r.isEstimate])).toEqual([
      ['Priority', 'PR-3', 3500, false],
      ['Priority', 'PR-1', 2000, true],
      ['שלנו', 'RCPT-BL-9', 500, false],
    ]);
    expect(rows[2]).toMatchObject({ priorityReceiptNumber: 'R-77', date: '2026-10-04', method: 'העברה בנקאית', status: 'הונפקה ב-Priority' });
    expect(rows.some((r) => r.paymentRef === 'PR-2')).toBe(false);
  });

  it('closedAt = the last closing receipt; fully covered → not closedWithoutReceipt', () => {
    const c = invoiceClosingOf(invoices[1], true, byInvoice.get('I-2')!);
    expect(c).toMatchObject({ closedAt: '2026-10-08', closingReceiptsTotal: 6000, closedWithoutReceipt: false });
  });

  it('closed with no receipt (credit note / write-off): closedWithoutReceipt, closedAt from Priority', () => {
    const c = invoiceClosingOf(invoices[2], true, byInvoice.get('I-3') ?? []);
    expect(c).toEqual({ closingReceipts: [], closingReceiptsTotal: 0, closedAt: '2026-10-12', closedWithoutReceipt: true });
  });

  it('an open invoice gets no closing view', () => {
    expect(invoiceClosingOf(invoices[3], false, [])).toEqual({ closingReceipts: [], closingReceiptsTotal: 0, closedAt: null, closedWithoutReceipt: false });
  });

  it('a receipt not yet issued (אושרה – לא נשלחה) still closes, with its receiptStatus', () => {
    const ready = closingReceiptsByInvoice(
      C,
      {
        ...src,
        // receipt first (r3): the receipt's state is receiptStatus (the allocation keeps its own status)
        receipts: [{ receiptKey: 'RCPT-BL-5', bankLineId: 'BL-5', customerCode: C, receiptStatus: 'אושרה – לא נשלחה', valueDate: '2026-10-30' }],
        allocations: [{ receiptKey: 'RCPT-BL-5', invoiceNumber: 'I-3', customerCode: C, amount: 3000, status: 'מוכנה', at: '2026-10-30T08:00:00.000Z' }],
      },
      '2026-11-01',
    );
    expect(ready.get('I-3')).toEqual([expect.objectContaining({ source: 'שלנו', receiptKey: 'RCPT-BL-5', amount: 3000, status: 'אושרה – לא נשלחה', receiptStatus: 'אושרה – לא נשלחה', date: '2026-10-30' })]);
  });
});

describe('paid on an open invoice (the card שולם column)', () => {
  it('an open, partly paid invoice carries paidAmount and its Priority receipt', () => {
    const C7 = 'TEST-007';
    const inv = { invoiceNumber: 'TEST-INV-007-1', customerCode: C7, dueDate: '2026-10-01', amount: 20000, openAmount: 8000, status: 'פתוחה' };
    const pay = { id: 'p7', paymentRef: 'TEST-RC-007-1', receiptNumber: 'TEST-RC-007-1', customerCode: C7, paymentDate: '2026-10-19', amount: 12000, method: 'העברה בנקאית', matchedInvoiceNumbers: 'TEST-INV-007-1' };
    const applied = closingReceiptsByInvoice(C7, { receipts: [], allocations: [], payments: [pay], invoices: [inv] }, '2026-11-01').get('TEST-INV-007-1') ?? [];
    const paid = invoicePaidOf(applied);
    expect(paid.paidAmount).toBe(12000);
    expect(paid.paidReceipts).toEqual([
      expect.objectContaining({ source: 'Priority', paymentRef: 'TEST-RC-007-1', date: '2026-10-19', amount: 12000, isEstimate: false }),
    ]);
    // still open: no closing view
    expect(invoiceClosingOf(inv, false, applied)).toMatchObject({ closingReceipts: [], closedAt: null, closedWithoutReceipt: false });
  });
});
