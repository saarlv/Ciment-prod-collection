import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};
const T = '2026-10-21';

describe('GetLedger', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: T }, ctx);
  });

  it('TEST-004: full card from 1.1 ends on the customer balance 111,500', async () => {
    const r = await invoke({ customerCode: 'TEST-004', asOfDate: T }, ctx);
    expect(r).toMatchObject({ customerName: 'בדיקה – רמות בנייה ופיתוח', fromDate: '2026-01-01', toDate: T, hasLedger: true, openingBalance: 0, closingBalance: 111500, totalDebit: 139140, totalCredit: 27640 });
    expect(r.entries).toHaveLength(8);
    expect(r.entries.at(-1)).toMatchObject({ docType: 'קבלה', docNumber: 'TEST-RC-004-1', runningBalance: 111500 });
    expect(r.entries.find((e: any) => e.docType === 'קבלה')).toMatchObject({ docNumber: 'TEST-RC-004-1', credit: 27640 });
    expect(r.syncedAt).toBeTruthy();
    expect(r.note).toBe('');
  });

  it('a range gives the opening balance before it', async () => {
    const r = await invoke({ customerCode: 'TEST-004', fromDate: '2026-08-01', toDate: T }, ctx);
    expect([r.openingBalance, r.entries.length, r.closingBalance]).toEqual([113970, 3, 111500]);
    const early = await invoke({ customerCode: 'TEST-004', fromDate: '2026-06-01', toDate: '2026-06-30' }, ctx);
    expect([early.openingBalance, early.closingBalance, early.totalDebit]).toEqual([0, 42150, 42150]);
  });

  it('TEST-010 ends in credit; no ledger and unknown customers say so', async () => {
    expect((await invoke({ customerCode: 'TEST-010', asOfDate: T }, ctx)).closingBalance).toBe(-8000);
    const none = await invoke({ customerCode: 'TEST-001', asOfDate: T }, ctx);
    expect(none).toMatchObject({ hasLedger: false, entries: [], syncedAt: '' });
    expect(none.note).toBe('אין שורות כרטסת במראה עבור בדיקה – גולף בנייה. יתרת כרטיס הלקוח: 21,500 ש״ח.');
    expect((await invoke({ customerCode: 'NOPE' }, ctx)).note).toBe('הלקוח NOPE לא נמצא.');
    await expect(invoke({ customerCode: 'TEST-004', fromDate: '2026-12-01', toDate: '2026-01-01' }, ctx)).rejects.toThrow('after toDate');
  });
});
