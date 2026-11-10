// Plan 04.11 part C: the automatic document chase is off (AgentSettings documentChaseActive) without deleting it.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';
import { PLAN_SETTINGS } from '../../shared/plan-settings.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as checkDocs } from '../../CheckInvoiceDocuments/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};

describe('documentChaseActive', () => {
  const w = makeWorld();
  let caseId = '';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Wed 21.10.2026 09:00 Israel – inside business hours
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    current = w.client;
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
    caseId = (await checkDocs({ invoiceNumbers: ['TEST-INV-004-7'], customerCode: 'TEST-004' }, ctx)).invoices[0].disputeId;
  });
  afterAll(() => vi.useRealTimers());

  it('the plan default is off (לא, כן או לא)', () => {
    expect(PLAN_SETTINGS.find((s) => s.settingKey === 'documentChaseActive')).toMatchObject({ value: 'לא', valueType: 'כן או לא', part: 'C' });
  });

  it('off (no row, or לא): the scheduled run returns skipped with the reason and writes nothing', async () => {
    const mark = w.fake.calls.length;
    const r = await invoke({ scheduled: true }, ctx);
    expect(r).toMatchObject({ skipped: true, cases: [], errors: [] });
    expect(r.reason).toContain('documentChaseActive');
    expect(writesSince(w.fake, mark)).toHaveLength(0);
    w.fake.insert('AgentSettings', [{ settingKey: 'documentChaseActive', value: 'לא', valueType: 'כן או לא' }]);
    expect((await invoke({ scheduled: true }, ctx)).skipped).toBe(true);
  });

  it('a person can still recount one case from the case page while the chase is off', async () => {
    const r = await invoke({ disputeId: caseId, dryRun: true }, ctx);
    expect(r.skipped).toBeUndefined();
    expect(r.cases.map((c: any) => c.disputeId)).toEqual([caseId]);
  });

  it('on (כן): the scheduled run works again', async () => {
    const row = w.fake.rows('AgentSettings').find((s) => s.settingKey === 'documentChaseActive')!;
    row.value = 'כן';
    const r = await invoke({ scheduled: true, dryRun: true }, ctx);
    expect(r.skipped).toBeUndefined();
    expect(r.cases.length).toBeGreaterThan(0);
  });
});
