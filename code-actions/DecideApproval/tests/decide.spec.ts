import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as ingest } from '../../IngestEmail/code.ts';
import { invoke as classify } from '../../ClassifyAndLinkEmail/code.ts';
import { invoke as reply } from '../../CreateReplyDraft/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};

async function draftFor(messageId: string) {
  const m = await ingest({ messageId, mailProvider: 'gmail', mailbox: 'saar@blocks.diy', sourceLabel: 'Ciment-Test', fromAddress: 'מיכל לוי <saarlevi14@gmail.com>', subject: 'שאלה', bodyText: 'שאלה על חשבונית', receivedAt: '1792560600' }, ctx);
  await classify({ inboundEmailId: m.inboundEmailId, category: 'אחר', customerCode: 'TEST-004' }, ctx);
  const r = await reply({ inboundEmailId: m.inboundEmailId, body: 'שלום מיכל, בדקנו.', reason: 'מענה לשאלה' }, ctx);
  return { emailId: m.inboundEmailId, approvalId: String(r.approval.id) };
}

describe('DecideApproval', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
  });
  afterAll(() => vi.useRealTimers());

  it('validates', async () => {
    const r = await invoke({ decision: 'send', decidedBy: '' }, ctx);
    expect(r.errors).toEqual(['החלטה לא מוכרת: "send" (approve / reject / edit)', 'חסר שם המחליט (decidedBy)', 'חסרים approvalIds או batchId']);
    expect((await invoke({ decision: 'edit', decidedBy: 'נינה', batchId: 'b' }, ctx)).errors).toContain('עריכה אפשרית רק לטיוטות מסוימות (approvalIds)');
  });

  it('edit keeps it pending; approve → אושר – לא נשלח and the email is answered; a second decision is skipped', async () => {
    const { emailId, approvalId } = await draftFor('d-1');
    const edit = await invoke({ decision: 'edit', decidedBy: 'נינה', approvalIds: [approvalId], body: 'גוף ערוך' }, ctx);
    expect(edit.writeVerified).toBe(true);
    expect(edit.updated[0]).toMatchObject({ status: 'ממתין', body: 'גוף ערוך', decisionNote: 'נערך על ידי נינה ב-21.10.2026' });

    const dry = await invoke({ decision: 'approve', decidedBy: 'נינה', approvalIds: [approvalId], dryRun: true }, ctx);
    expect(dry.updated[0].status).toBe('אושר – לא נשלח');
    expect(fake.rows('Approvals').find((a) => a.id === approvalId)!.status).toBe('ממתין');

    const r = await invoke({ decision: 'approve', decidedBy: 'נינה', approvalIds: [approvalId, 'missing-id'], note: 'מאושר' }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.updated[0]).toMatchObject({ status: 'אושר – לא נשלח', decidedBy: 'נינה', decidedAt: '2026-10-21T06:00:00.000Z', decisionNote: 'מאושר' });
    expect(r.skipped).toEqual([{ approvalId: 'missing-id', reason: 'הטיוטה לא נמצאה' }]);
    const email = fake.rows('InboundEmails').find((m) => m.id === emailId)!;
    expect(email).toMatchObject({ status: 'נענתה', answeredAt: '2026-10-21T06:00:00.000Z' });

    const twice = await invoke({ decision: 'reject', decidedBy: 'נינה', approvalIds: [approvalId] }, ctx);
    expect(twice.updated).toHaveLength(0);
    expect(twice.skipped[0]).toMatchObject({ approvalId, reason: 'הטיוטה כבר בסטטוס אושר – לא נשלח' });
    expect(fake.rows('Approvals').find((a) => a.id === approvalId)!.status).toBe('אושר – לא נשלח');
  });

  it('reject puts the email back to בטיפול מאיה; a batch decides only its pending drafts', async () => {
    const { emailId, approvalId } = await draftFor('d-2');
    const r = await invoke({ decision: 'reject', decidedBy: 'נינה', approvalIds: [approvalId], note: 'לא מדויק' }, ctx);
    expect(r.updated[0].status).toBe('נדחה');
    expect(fake.rows('InboundEmails').find((m) => m.id === emailId)!.status).toBe('בטיפול מאיה');

    fake.insert('Approvals', [
      { kind: 'מנת חובות פתוחים', batchId: 'open-debts-2026-10', customerCode: 'TEST-004', status: 'ממתין', isTestFixture: true },
      { kind: 'מנת חובות פתוחים', batchId: 'open-debts-2026-10', customerCode: 'TEST-007', status: 'ממתין', isTestFixture: true },
      { kind: 'מנת חובות פתוחים', batchId: 'open-debts-2026-10', customerCode: 'TEST-002', status: 'נדחה', isTestFixture: true },
    ]);
    const batch = await invoke({ decision: 'approve', decidedBy: 'מנהל', batchId: 'open-debts-2026-10' }, ctx);
    expect(batch.writeVerified).toBe(true);
    expect(batch.updated.map((u: any) => [u.customerCode, u.status])).toEqual([
      ['TEST-004', 'אושר – לא נשלח'],
      ['TEST-007', 'אושר – לא נשלח'],
    ]);
    expect(batch.skipped.map((s: any) => s.customerCode)).toEqual(['TEST-002']);
    expect(fake.rows('Approvals').some((a) => a.status === 'נשלח')).toBe(false);
  });
});
