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

describe('MarkPriceApproval', () => {
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

  it('refuses without the required fields, an unknown step and a non-price case – writing nothing', async () => {
    const before = w.fake.calls.length;
    expect((await invoke({ disputeId: caseId, step: 'סוכן אישר', evidence: 'x' }, ctx)).reason).toBe('חסר שם המסמנת (markedBy)');
    expect((await invoke({ disputeId: caseId, step: 'אושר', evidence: 'x', markedBy: 'y' }, ctx)).refused).toBe(true);
    expect((await invoke({ disputeId: caseId, step: 'סוכן אישר', markedBy: 'y' }, ctx)).reason).toContain('חובה לצרף ראיה');
    const [d] = w.fake.insert('Disputes', [{ disputeNumber: 'X', disputeType: 'תעודת משלוח חסרה', status: 'ממתינה לסריקה' }]);
    expect((await invoke({ disputeId: d.id, step: 'סוכן אישר', evidence: 'x', markedBy: 'y' }, ctx)).reason).toContain('אינו מקרה מחיר');
    expect(writesSince(w.fake, before).filter((c) => c.table !== 'Disputes' || c.method !== 'createItems')).toHaveLength(0);
  });

  it('dryRun previews; evidence from an email keeps a reference to it', async () => {
    const [em] = w.fake.insert('InboundEmails', [{ messageId: 'ag-1', fromAddress: 'agent.north@test.example', fromName: 'סוכן צפון', subject: 'Re: בקשת אישור מחיר', receivedAt: '2026-10-21T05:00:00.000Z' }]);
    const before = w.fake.calls.length;
    const dry = await invoke({ disputeId: caseId, step: 'סוכן אישר', evidence: 'מאשר', evidenceInboundEmailId: em.id, markedBy: 'בדיקה – אחראית ב', dryRun: true }, ctx);
    expect(writesSince(w.fake, before)).toHaveLength(0);
    expect(dry.dispute.status).toBe('ממתינה לאישור מנהל');
    expect(dry.dispute.salesAgentApprovalEvidence).toBe('מאשר\n\nמקור: מייל מ-סוכן צפון (agent.north@test.example), 21.10.2026 08:00, "Re: בקשת אישור מחיר" [ag-1]');
    const real = await invoke({ disputeId: caseId, step: 'סוכן אישר', evidence: 'מאשר', evidenceInboundEmailId: em.id, markedBy: 'בדיקה – אחראית ב' }, ctx);
    expect(real.writeVerified).toBe(true);
    const done = await invoke({ disputeId: caseId, step: 'מנהל אישר', evidence: 'מאשר גם אני', markedBy: 'בדיקה – אחראית ב' }, ctx);
    expect(done.dispute.status).toBe('ממתינה לזיכוי');
    expect(done.dispute.creditDraftNote).toContain('סה״כ לזיכוי: 520 ₪');
  });
});
