import { describe, expect, it } from 'vitest';
import { computeInvoiceLayer, effectiveOpen, paymentEntries, withLayer } from '../../shared/collections-invoice-layer.ts';

// Since 26.10 the payments come from ReceiptAllocations of our receipts (מוכנה = נראה תשלום, הונפקה ב-Priority =
// נקלט ב-Priority); approved MatchProposals without a receipt among the sources still count (legacy), and a
// proposal whose receipt is given never counts twice.
const C = 'TEST-070';
const inv = (no: string, openAmount: number, extra: any = {}) => ({ invoiceNumber: no, customerCode: C, documentType: 'חשבונית', amount: openAmount, openAmount, dueDate: '2026-09-30', syncedAt: '2026-10-21T03:00:00.000Z', ...extra });
// receipt first: readers read receiptStatus; the helper's argument is the allocations' status (מוכנה → אושרה – לא נשלחה)
const receipt = (status: string, extra: any = {}) => ({ receiptKey: 'RCPT-BL-1', bankLineId: 'BL-1', customerCode: C, receiptStatus: status === 'מוכנה' ? 'אושרה – לא נשלחה' : status, preparedAt: '2026-10-21T05:00:00.000Z', ...extra });
const alloc = (no: string, amount: number, status = 'מוכנה') => ({ receiptKey: 'RCPT-BL-1', bankLineId: 'BL-1', invoiceNumber: no, customerCode: C, amount, status, at: '2026-10-21T05:00:00.000Z' });
const approvedMatch = (no: string, amount: number, extra: any = {}) => ({ id: 'mp1', bankLineId: 'BL-1', customerCode: C, status: 'אושרה – לביצוע ב-Priority', decidedAt: '2026-10-21T05:00:00.000Z', allocations: { lines: [{ invoiceNumber: no, amount }] }, ...extra });

describe('invoice layer from receipts', () => {
  it('a receipt מוכנה: full → שולמה (remaining 0), partial → שולמה חלקית with the remainder, untouched → פתוחה', () => {
    const l = computeInvoiceLayer([inv('A', 1000), inv('B', 3000), inv('C', 700)], { proposals: [], receipts: [receipt('מוכנה')], allocations: [alloc('A', 1000), alloc('B', 2000)] });
    expect(l.get(`${C}|A`)).toMatchObject({ paymentState: 'נראה תשלום', paymentStatus: 'שולמה', remainingAmount: 0, receiptKeys: 'RCPT-BL-1', paidSeenBankLineIds: 'BL-1', paidPendingAmount: 1000 });
    expect(l.get(`${C}|B`)).toMatchObject({ paymentStatus: 'שולמה חלקית', remainingAmount: 1000, paidSeenAmount: 2000 });
    expect(l.get(`${C}|C`)).toMatchObject({ paymentState: null, paymentStatus: 'פתוחה', remainingAmount: 700, receiptKeys: null });
    expect(effectiveOpen(withLayer(inv('B', 3000), l.get(`${C}|B`)))).toBe(1000);
  });

  it('issued in Priority: נקלט ב-Priority (paidPriorityDoneAt = issuedAt); applied until the invoice is synced after the issue', () => {
    const issued = receipt('הונפקה ב-Priority', { issuedAt: '2026-10-21T06:00:00.000Z' });
    const before = computeInvoiceLayer([inv('B', 3000)], { proposals: [], receipts: [issued], allocations: [alloc('B', 2000, 'הונפקה ב-Priority')] }).get(`${C}|B`)!;
    expect(before).toMatchObject({ paymentState: 'נקלט ב-Priority', paidPriorityDoneAt: '2026-10-21T06:00:00.000Z', remainingAmount: 1000, paymentStatus: 'שולמה חלקית', paidPendingAmount: 2000 });
    // Priority caught up: its open amount already shows the payment, nothing is subtracted again
    const after = computeInvoiceLayer([inv('B', 1000, { amount: 3000, syncedAt: '2026-10-21T08:00:00.000Z' })], { proposals: [], receipts: [issued], allocations: [alloc('B', 2000, 'הונפקה ב-Priority')] }).get(`${C}|B`)!;
    expect(after).toMatchObject({ paymentState: 'נקלט ב-Priority', remainingAmount: 1000, paymentStatus: 'שולמה חלקית', paidPendingAmount: 0 });
  });

  it('a proposal whose receipt is among the sources never counts twice; a legacy approved match (no receiptKey) still counts', () => {
    const withKey = approvedMatch('A', 1000, { receiptKey: 'RCPT-BL-1' });
    const sources = { proposals: [withKey], receipts: [receipt('מוכנה')], allocations: [alloc('A', 600)] };
    expect(computeInvoiceLayer([inv('A', 1000)], sources).get(`${C}|A`)).toMatchObject({ paidSeenAmount: 600, remainingAmount: 400 });
    expect(paymentEntries(sources, new Map()).map((e) => [e.invoiceNumber, e.amount, e.receiptKey])).toEqual([['A', 600, 'RCPT-BL-1']]);
    // a bare array is proposals only: the proposal's own split counts (same numbers DecideMatchProposal keeps on it)
    expect(computeInvoiceLayer([inv('A', 1000)], [approvedMatch('A', 1000, { receiptKey: 'RCPT-BL-1' })]).get(`${C}|A`)).toMatchObject({ paymentStatus: 'שולמה', remainingAmount: 0 });
    const legacy = computeInvoiceLayer([inv('A', 1000)], { proposals: [approvedMatch('A', 1000)], receipts: [], allocations: [] }).get(`${C}|A`)!;
    expect(legacy).toMatchObject({ paymentState: 'נראה תשלום', paymentStatus: 'שולמה', remainingAmount: 0, receiptKeys: null });
  });

  it('a credit note stays פתוחה with its negative remaining; an invoice Priority already shows paid is שולמה', () => {
    const l = computeInvoiceLayer([inv('CR', -500, { documentType: 'חשבונית זיכוי' }), inv('Z', 0, { amount: 800 })], { proposals: [] });
    expect(l.get(`${C}|CR`)).toMatchObject({ paymentStatus: 'פתוחה', remainingAmount: -500 });
    expect(l.get(`${C}|Z`)).toMatchObject({ paymentStatus: 'שולמה', remainingAmount: 0 });
  });
});
