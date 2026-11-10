import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as analyze } from '../../AnalyzePriceGap/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};

describe('CreatePriceApprovalRequest', () => {
  const w = makeWorld();
  let caseId = '';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    current = w.client;
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
    caseId = (await analyze({ invoiceNumber: 'TEST-INV-008-1' }, ctx)).disputeId;
  });
  afterAll(() => vi.useRealTimers());

  it('validates and refuses a non-price case', async () => {
    expect((await invoke({}, ctx)).errors).toEqual(['חסר מזהה מקרה (disputeId)']);
    const [d] = w.fake.insert('Disputes', [{ disputeNumber: 'X', disputeType: 'אחר', status: 'פתוחה', customerCode: 'TEST-008' }]);
    expect((await invoke({ disputeId: d.id }, ctx)).errors[0]).toContain('אינו מקרה מחיר');
  });

  it('replaces the pending request; recipients are agent + manager', async () => {
    const before = w.fake.calls.length;
    const dry = await invoke({ disputeId: caseId, dryRun: true }, ctx);
    expect(writesSince(w.fake, before)).toHaveLength(0);
    expect(dry.approval).toMatchObject({ kind: 'בקשת אישור מחיר', recipientContact: 'agent.north@test.example, sales.manager@test.example' });
    const r = await invoke({ disputeId: caseId }, ctx);
    expect(r).toMatchObject({ writeVerified: true, replaced: true });
    expect(w.fake.rows('Approvals').filter((a) => a.kind === 'בקשת אישור מחיר')).toHaveLength(1);
    expect(r.approval.body).toContain('סה״כ פער לזיכוי: 520 ₪');
  });

  it('an agent missing from SalesAgents is said in the reason', async () => {
    w.fake.tables.set('SalesAgents', []);
    const r = await invoke({ disputeId: caseId, dryRun: true }, ctx);
    expect(r.approval.recipientContact).toBeNull();
    expect(r.approval.reason).toContain('הסוכן בדיקה – סוכן צפון לא נמצא בטבלת אנשי המכירות');
  });
});
