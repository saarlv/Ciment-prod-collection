import { describe, expect, it } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { refreshInvoiceLayer } from '../../shared/collections-invoice-layer.ts';

// r3 step 3: Receipts has no `status` column any more – the refresh reads a receipt by receiptStatus on both paths
// (every receipt, and scoped to customers). Allocations keep their own status (ReceiptAllocations.status).
// The issued date (paidPriorityDoneAt) comes only from the receipt row's issuedAt, so it proves the row was read.
const C = 'TEST-071';
const ISSUED_AT = '2026-10-21T06:00:00.000Z';
function world() {
  const fake = new FakeBlocks();
  fake.insert('Invoices', [{ invoiceNumber: 'A', customerCode: C, documentType: 'חשבונית', amount: 1000, openAmount: 1000, dueDate: '2026-09-30', syncedAt: '2026-10-21T03:00:00.000Z', isTestFixture: true }]);
  fake.insert('Receipts', [
    { receiptKey: 'RCPT-BL-1', bankLineId: 'BL-1', customerCode: C, amount: 1000, allocatedAmount: 1000, unallocatedAmount: 0, receiptStatus: 'הונפקה ב-Priority', matchStatus: 'מפוזרת', preparedAt: '2026-10-21T05:00:00.000Z', issuedAt: ISSUED_AT, isTestFixture: true },
  ]);
  fake.insert('ReceiptAllocations', [{ receiptKey: 'RCPT-BL-1', bankLineId: 'BL-1', invoiceNumber: 'A', customerCode: C, amount: 1000, status: 'הונפקה ב-Priority', at: '2026-10-21T05:00:00.000Z', isTestFixture: true }]);
  return fake;
}

describe('refreshInvoiceLayer reads receipts by receiptStatus', () => {
  for (const scope of [{}, { customerCodes: [C] }]) {
    const label = 'customerCodes' in scope ? 'scoped to the customer' : 'every receipt';
    it(`${label}: the issued receipt row is read (paidPriorityDoneAt = its issuedAt); no query filters Receipts on status`, async () => {
      const fake = world();
      const r = await refreshInvoiceLayer(fake.client() as any, { ...scope, dryRun: true, nowIso: '2026-10-21T08:00:00.000Z' });
      expect(r.errors).toEqual([]);
      expect(r.changes).toEqual([expect.objectContaining({ invoiceNumber: 'A' })]);
      expect(r.changes[0].fields).toMatchObject({ paymentState: 'נקלט ב-Priority', paidPriorityDoneAt: ISSUED_AT, paymentStatus: 'שולמה', remainingAmount: 0 });
      const receiptQueries = fake.calls.filter((c) => c.method === 'queryTable' && c.table === 'Receipts').map((c) => JSON.stringify(c.query?.where ?? null));
      expect(receiptQueries.length).toBeGreaterThan(0);
      expect(receiptQueries.some((w) => w.includes('"column":"status"'))).toBe(false);
    });
  }
});
