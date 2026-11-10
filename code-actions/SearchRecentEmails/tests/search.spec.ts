import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { CTX, receiptsWorld, type ReceiptsWorld } from '../../shared/fake-receipts.ts';
import { invoke as search } from '../code.ts';

const T = '2026-10-21';

describe('SearchRecentEmails (read only)', () => {
  let w: ReceiptsWorld;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T07:00:00.000Z'));
    w = await receiptsWorld(T, (c) => (current = c));
  });
  afterAll(() => vi.useRealTimers());

  it('by amount in any format, by name, within the window; writes nothing', async () => {
    const mark = w.fake.calls.length;
    const byAmount = await search({ amount: 8000, asOfDate: T }, CTX);
    expect(byAmount.fromDate).toBe('2026-10-14');
    expect(byAmount.emails.map((e: any) => [e.subject, e.senderKind, e.matchedOn, e.customerCode])).toEqual([['דקל קבלנות – תשלום', 'סוכן סימנט', 'סכום', 'TEST-007']]);
    const byName = await search({ name: 'אבי', asOfDate: T }, CTX);
    expect(byName.emails.map((e: any) => [e.fromName, e.senderKind])).toEqual([['אבי כהן', 'איש קשר רשום']]);
    expect((await search({ amount: 82880, asOfDate: T }, CTX)).emails.map((e: any) => e.subject)).toEqual(['פירוט העברה מאתמול']);
    expect((await search({ amount: 3333, asOfDate: T }, CTX)).emails).toEqual([]);
    expect((await search({ amount: 8000, asOfDate: '2026-11-30', days: 7 }, CTX)).emails).toEqual([]);
    expect((await search({ asOfDate: T }, CTX)).errors).toEqual(['נדרש שם או סכום לחיפוש']);
    expect(w.fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method))).toHaveLength(0);
  });
});
