import { describe, expect, it, vi } from 'vitest';
import { allocationWorld, C1, NOW, receipt, T } from '../../shared/fake-allocation.ts';
import { applyAllocation } from '../../shared/collections-allocation.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

// Plan 04.11 stage 6: each receipt on the card says what it covered and what is still open ("שילמת על X, Y, Z ולא על א, ב, ג"),
// and openInvoices lists the open invoices now with the receipts that paid part of each.
describe('GetCustomer360 – receipt coverage', () => {
  it('covered[] / stillOpen[] per receipt and openInvoices[] with paying receipts, still two read rounds', async () => {
    const w = allocationWorld({ receipts: [receipt('RCPT-1', 3500, { valueDate: '2026-11-02' }), receipt('RCPT-2', 500, { valueDate: '2026-11-03' })] });
    current = w.client;
    const a = await applyAllocation(w.client, { receiptKey: 'RCPT-1', allocations: [{ invoiceNumber: 'A-1', amount: 1000 }, { invoiceNumber: 'A-2', amount: 2000 }, { invoiceNumber: 'A-3', amount: 500 }], asOfDate: T }, { nowIso: NOW });
    const b = await applyAllocation(w.client, { receiptKey: 'RCPT-2', allocations: [{ invoiceNumber: 'A-3', amount: 500 }], asOfDate: T }, { nowIso: NOW });
    expect([...a.errors, ...b.errors]).toEqual([]);
    w.fake.resetDepth();
    const r: any = await invoke({ customerCode: C1, asOfDate: T }, {});
    expect(w.fake.maxDepth).toBeLessThanOrEqual(2);
    const r1 = r.receipts.find((x: any) => x.receiptKey === 'RCPT-1');
    expect(r1.covered).toEqual([
      { invoiceNumber: 'A-1', dueDate: '2026-08-10', amount: 1000, isPartial: false, openAfter: 0 },
      { invoiceNumber: 'A-2', dueDate: '2026-08-20', amount: 2000, isPartial: false, openAfter: 0 },
      { invoiceNumber: 'A-3', dueDate: '2026-09-15', amount: 500, isPartial: true, openAfter: 1000 },
    ]);
    expect(r1.stillOpen).toEqual([{ invoiceNumber: 'A-4', dueDate: '2026-10-15', dueMonth: '2026-10', openAmount: 2500 }]);
    expect(r1.stillOpenTotal).toBe(2500);
    const r2 = r.receipts.find((x: any) => x.receiptKey === 'RCPT-2');
    expect(r2.covered).toEqual([{ invoiceNumber: 'A-3', dueDate: '2026-09-15', amount: 500, isPartial: true, openAfter: 500 }]);
    expect(r2.stillOpen.map((i: any) => i.invoiceNumber)).toEqual(['A-4']);
    expect(r.openInvoices).toEqual([
      expect.objectContaining({ invoiceNumber: 'A-3', openInPriority: 1500, allocated: 1000, openBalance: 500, receipts: [{ receiptKey: 'RCPT-1', amount: 500 }, { receiptKey: 'RCPT-2', amount: 500 }] }),
      expect.objectContaining({ invoiceNumber: 'A-4', openBalance: 2500, receipts: [] }),
    ]);
    // the older receipt fields stay
    expect(r1.allocations).toHaveLength(3);
  });
});
