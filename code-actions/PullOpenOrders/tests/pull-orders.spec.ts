import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';
import { seedTablesOk } from '../../shared/fake-receipts.ts';
import { pullOpenOrders } from '../../shared/collections-morning-pull.ts';
import { type ExposureSource, testExposureSource } from '../../shared/priority-orders-source.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke } from '../code.ts';

const T = '2026-11-04';
const NOW = '2026-11-04T04:05:00.000Z';
const ctx: any = {};
const strip = (rows: any[]) =>
  rows
    .map(({ syncedAt: _s, updatedAt: _u, ...rest }) => rest)
    .sort((a, b) => Number(a.id) - Number(b.id));

describe('PullOpenOrders (test source re-reads the exposure fixtures)', () => {
  const w = makeWorld({ inboxActions: true });
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(NOW));
    current = w.client;
    expect(seedTablesOk(await seed({ dryRun: false, asOfDate: T }, ctx))).toBe(true);
  });
  afterAll(() => vi.useRealTimers());

  it('dryRun is the default (invoke): writes nothing', async () => {
    const mark = w.fake.calls.length;
    const r = await invoke({}, ctx);
    expect([r.dryRun, r.ok]).toEqual([true, true]);
    expect(r.customers).toBeGreaterThanOrEqual(5);
    expect(writesSince(w.fake, mark)).toEqual([]);
  });

  it('a real pull leaves every exposure row unchanged except syncedAt (TEST-011..015 included)', async () => {
    const exp = strip(w.fake.rows('CustomerExposure'));
    const items = strip(w.fake.rows('ExposureItems'));
    const r = await pullOpenOrders(w.client, { dryRun: false }, { nowIso: NOW });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.writeVerified).toBe(true);
    expect(r.changed).toBe(0);
    expect(r.deleted).toBe(0);
    expect(strip(w.fake.rows('CustomerExposure'))).toEqual(exp);
    expect(strip(w.fake.rows('ExposureItems'))).toEqual(items);
    for (const code of ['TEST-011', 'TEST-012', 'TEST-013', 'TEST-014', 'TEST-015']) {
      expect(w.fake.rows('CustomerExposure').find((e) => e.customerCode === code)?.syncedAt).toBe(NOW);
    }
    expect(w.fake.rows('ExposureItems').every((i) => i.syncedAt === NOW)).toBe(true);
  });

  it('an empty or failing source changes nothing', async () => {
    const before = JSON.stringify([w.fake.rows('CustomerExposure'), w.fake.rows('ExposureItems')]);
    for (const source of [
      { ...testExposureSource, fetchExposure: async () => [] },
      { ...testExposureSource, fetchExposure: async () => Promise.reject(new Error('down')) },
    ] as ExposureSource[]) {
      const mark = w.fake.calls.length;
      await pullOpenOrders(w.client, { dryRun: false }, { nowIso: '2026-11-05T04:00:00.000Z', source });
      expect(writesSince(w.fake, mark)).toEqual([]);
    }
    expect(JSON.stringify([w.fake.rows('CustomerExposure'), w.fake.rows('ExposureItems')])).toBe(before);
  });

  it('a document Priority no longer returns for a returned customer leaves the mirror', async () => {
    const order = w.fake.rows('ExposureItems').find((i) => i.reference === 'TEST-SO-011-1')!;
    expect(order).toBeTruthy();
    const source: ExposureSource = {
      ...testExposureSource,
      fetchExposure: async (q) => (await testExposureSource.fetchExposure(q)).map((e) => (e.customerCode === 'TEST-011' ? { ...e, items: e.items.filter((i) => i.reference !== 'TEST-SO-011-1') } : e)),
    };
    const r = await pullOpenOrders(w.client, { dryRun: false }, { nowIso: '2026-11-05T04:00:00.000Z', source });
    expect(r.ok).toBe(true);
    expect(r.deleted).toBe(1);
    expect(w.fake.rows('ExposureItems').find((i) => i.reference === 'TEST-SO-011-1')).toBeUndefined();
  });
});
