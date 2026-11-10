import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { pullOpenMovements } from '../../shared/collections-morning-pull.ts';
import { invoke } from '../code.ts';

const ctx: any = {};
const T = '2026-10-21';

describe('GetOpenDebts', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: T }, ctx);
  });

  it('an empty OpenMovements table: the documents are unknown (movementsMirrorEmpty), never read from Invoices', async () => {
    const r = await invoke({ customerCode: 'TEST-004', asOfDate: T }, ctx);
    expect(r).toMatchObject({ documents: [], source: 'OpenMovements', movementsMirrorEmpty: true });
    expect(r.note).toContain('OpenMovements ריקה');
    // the open movements (test source derived from the seed) – the source of truth from here on
    expect((await pullOpenMovements(current, { dryRun: false }, { nowIso: `${T}T04:00:00.000Z` })).ok).toBe(true);
  });

  it('TEST-004: documents, overdue split, balance from the ledger card', async () => {
    const r = await invoke({ customerCode: 'TEST-004', asOfDate: T }, ctx);
    expect(r.documents.map((d: any) => [d.invoiceNumber, d.dueDate, d.daysOverdue, d.openAmount])).toEqual([
      ['TEST-INV-004-1', '2026-08-31', 51, 23400],
      ['TEST-INV-004-2', '2026-08-31', 51, 18750],
      ['TEST-INV-004-3', '2026-09-30', 21, 31200],
      ['TEST-INV-004-4', '2026-09-30', 21, 12980],
      ['TEST-INV-004-6', '2026-10-31', 0, 15300],
      ['TEST-INV-004-7', '2026-10-31', 0, 9870],
    ]);
    expect(r).toMatchObject({ totalOpen: 111500, totalOverdue: 86330, totalNotDue: 25170, endOfCardBalance: 111500, balanceSource: 'כרטסת', openReceipts: [], note: '', source: 'OpenMovements', movementsMirrorEmpty: false });
    // the open amount follows OpenMovements, not Invoices.openAmount
    const m = fake.rows('OpenMovements').find((x) => x.customerCode === 'TEST-004' && x.docNumber === 'TEST-INV-004-7')!;
    m.amount = 4870;
    const after = await invoke({ customerCode: 'TEST-004', asOfDate: T }, ctx);
    expect(after.documents.find((d: any) => d.invoiceNumber === 'TEST-INV-004-7').openAmount).toBe(4870);
    expect(after.totalOpen).toBe(106500);
    m.amount = 9870;
  });

  it('no ledger → Customers.ledgerBalance; credit notes; open receipts listed', async () => {
    const t1 = await invoke({ customerCode: 'TEST-001', asOfDate: T }, ctx);
    expect([t1.endOfCardBalance, t1.balanceSource]).toEqual([21500, 'כרטיס לקוח']);
    const t10 = await invoke({ customerCode: 'TEST-010', asOfDate: T }, ctx);
    expect(t10.documents).toEqual([expect.objectContaining({ invoiceNumber: 'TEST-INV-010-C1', documentType: 'זיכוי', openAmount: -8000, daysOverdue: 0 })]);
    expect([t10.totalOpen, t10.endOfCardBalance]).toEqual([-8000, -8000]);

    fake.insert('MatchProposals', [{ bankLineId: 'TEST-BL-PBD-02', customerCode: 'TEST-002', amount: 17424, valueDate: '2026-10-20', payerName: 'אלון יזמות בע״מ', status: 'מוצעת', isTestFixture: true }]);
    fake.insert('BankLines', [
      { bankLineId: 'X-1', customerCode: 'TEST-002', amount: 500, valueDate: '2026-10-19', payerName: 'אלון', status: 'חדשה', source: 'test-fixture' },
      { bankLineId: 'X-2', customerCode: 'TEST-002', amount: 900, valueDate: '2026-10-19', payerName: 'אלון', status: 'קבלה הונפקה', source: 'test-fixture' },
    ]);
    const t2 = await invoke({ customerCode: 'TEST-002', asOfDate: T }, ctx);
    expect(t2.openReceipts.map((o: any) => [o.source, o.bankLineId, o.amount])).toEqual([
      ['שורת בנק', 'X-1', 500],
      ['הצעת התאמה', 'TEST-BL-PBD-02', 17424],
    ]);
    expect(t2.note).toContain('2 תקבולים ממתינים להתאמה בסך 17,924 ש״ח');
  });
});
