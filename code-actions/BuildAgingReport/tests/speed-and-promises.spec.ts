import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as aging } from '../code.ts';
import { invoke as c360 } from '../../GetCustomer360/code.ts';
import { buildWindow, computeAging } from '../../shared/collections-aging.ts';
import { isFixtureCustomer, readAll } from '../../shared/collections-data.ts';

const T = '2026-10-21';
const ctx: any = {};

describe('a commitment marker sits on its dueMonth cell (CustomerNotes)', () => {
  const w = buildWindow(T, 3, 0);
  const base = {
    window: w,
    customers: [{ customerCode: 'C', customerName: 'c' }],
    invoices: [
      { customerCode: 'C', invoiceNumber: 'I-SEP', documentType: 'חשבונית', openAmount: 100, dueDate: '2026-09-30' },
      { customerCode: 'C', invoiceNumber: 'I-AUG', documentType: 'חשבונית', openAmount: 100, dueDate: '2026-08-31' },
    ],
    ownerMap: new Map<string, string>(),
  };
  const commitment = (dueMonth: string, outcome = 'פתוחה', status = 'פעילה') => ({ customerCode: 'C', dueMonth, noteType: 'התחייבות לתשלום', status, outcome, amount: 100, actionDate: '2026-10-20', noteCreatedAt: '2026-10-10T08:00:00.000Z' });
  const cellOf = (n: any) => {
    const r = computeAging({ ...base, notes: [n] }).customers[0];
    return r.months.find((m) => m.promises.length)?.monthKey ?? (r.laterDebt.promises.length ? 'later' : r.priorDebt.promises.length ? 'prior' : null);
  };
  it('its due month, before / after the window in חוב קודם / חוב מאוחר; never a kept or closed one', () => {
    expect(cellOf(commitment('2026-09'))).toBe('2026-09');
    expect(cellOf(commitment('2026-08'))).toBe('2026-08');
    expect(cellOf(commitment('2026-12'))).toBe('later');
    expect(cellOf(commitment('2026-01'))).toBe('prior');
    expect(cellOf(commitment('2026-09', 'לא קוימה'))).toBe('2026-09');
    expect(cellOf(commitment('2026-09', 'קוימה'))).toBeNull();
    expect(cellOf(commitment('2026-09', 'פתוחה', 'נסגרה ידנית'))).toBeNull();
  });
  it('amounts and totals do not change', () => {
    const a = computeAging({ ...base, notes: [] }).totals;
    const b = computeAging({ ...base, notes: [commitment('2026-09')] }).totals;
    expect(b).toEqual(a);
  });
});

describe('isFixtureCustomer', () => {
  it('source test-fixture or a TEST- code (also without the customer row)', () => {
    expect(isFixtureCustomer({ customerCode: 'X', source: 'test-fixture' })).toBe(true);
    expect(isFixtureCustomer({ customerCode: 'TEST-1', source: 'priority-mock' })).toBe(true);
    expect(isFixtureCustomer(undefined, 'TEST-404')).toBe(true);
    expect(isFixtureCustomer({ customerCode: '10001', source: 'priority-mock' }, '10001')).toBe(false);
    expect(isFixtureCustomer(undefined, '10001')).toBe(false);
  });
});

describe('readAll paging', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ n: i }));
  it('one round trip for a small table, no extra empty page', async () => {
    const fake = new FakeBlocks();
    fake.insert('T', rows);
    const got = await readAll(fake.client() as any, 'T');
    expect(got).toHaveLength(23);
    expect(fake.maxDepth).toBe(1);
    expect(fake.calls).toHaveLength(2); // first page + count, in parallel
  });
  it('a server page cap below the requested limit never loses rows', async () => {
    const fake = new FakeBlocks();
    fake.insert('T', rows);
    fake.pageCap = 5;
    const got = await readAll(fake.client() as any, 'T');
    expect(got.map((r) => r.n)).toEqual(rows.map((r) => r.n));
    expect(fake.maxDepth).toBe(2); // remaining pages fetched in parallel
  });
  it('without a usable count it falls back to paging until an empty page', async () => {
    const fake = new FakeBlocks();
    fake.insert('T', rows);
    fake.pageCap = 10;
    fake.supportsCount = false;
    expect(await readAll(fake.client() as any, 'T')).toHaveLength(23);
  });
});

describe('latency of /aging and /customers/[code] on the seeded data', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: T }, ctx);
  });

  it('BuildAgingReport: one round trip; TEST-001 commitment on September', async () => {
    fake.resetDepth();
    const res = await aging({ asOfDate: T }, ctx);
    expect(fake.maxDepth).toBe(1);
    const c1 = res.customers.find((c: any) => c.customerCode === 'TEST-001');
    expect(c1.months.find((m: any) => m.monthKey === '2026-09').promises.map((p: any) => p.promisedAmount)).toEqual([12000]);
    expect(c1.months.find((m: any) => m.monthKey === '2026-10').promises).toHaveLength(0);
    expect(c1.total).toBe(21500);
  });

  it('GetCustomer360: two round trips; same commitment placement in its aging row', async () => {
    fake.resetDepth();
    const res = await c360({ customerCode: 'TEST-001', asOfDate: T }, ctx);
    expect(fake.maxDepth).toBe(2);
    expect(res.aging.months.find((m: any) => m.monthKey === '2026-09').promises).toHaveLength(1);
    fake.resetDepth();
    const r7 = await c360({ customerCode: 'TEST-007', asOfDate: T }, ctx);
    expect(r7.invoices.find((i: any) => i.invoiceNumber === 'TEST-INV-007-2').missingNoteNumbers).toEqual(['TEST-DN-007-5', 'TEST-DN-007-6']);
    expect(fake.maxDepth).toBe(2);
  });
});
