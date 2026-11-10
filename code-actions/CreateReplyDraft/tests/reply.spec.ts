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
import { invoke } from '../code.ts';
import { signBody } from '../../shared/collections-mail.ts';

const ctx: any = {};
const PDF = 'https://files.example/kartesset-TEST-004-2026-10-21.pdf';
const mail = (o: Record<string, unknown>) =>
  ingest({ mailProvider: 'gmail', mailbox: 'saar@blocks.diy', mailboxOwnerName: 'סער', sourceLabel: 'Ciment-Test', receivedAt: '1792560600', ...o }, ctx);

describe('CreateReplyDraft', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
  });
  afterAll(() => vi.useRealTimers());

  it('signature comes from the data and replaces a sign-off the writer added', () => {
    expect(signBody('שלום מיכל,\nמצורפת הכרטסת.', 'דנה')).toBe('שלום מיכל,\nמצורפת הכרטסת.\n\nבברכה,\nדנה\nמחלקת הנהלת חשבונות, סימנט');
    expect(signBody('שלום,\nמצורף.\n\nבברכה,\nמאיה', 'דנה')).toBe('שלום,\nמצורף.\n\nבברכה,\nדנה\nמחלקת הנהלת חשבונות, סימנט');
  });

  it('refuses a PDF (and a ledger reply) to an unverified sender; nothing written', async () => {
    const m = await mail({ messageId: 'r-1', fromAddress: 'stranger@outside.test.example', subject: 'כרטסת', bodyText: 'כרטסת של בדיקה – רמות בנייה ופיתוח' });
    await classify({ inboundEmailId: m.inboundEmailId, category: 'כרטסת', customerCode: 'TEST-004' }, ctx);
    const before = fake.rows('Approvals').length;
    const r = await invoke({ inboundEmailId: m.inboundEmailId, body: 'מצורפת כרטסת', reason: 'בקשה לכרטסת', attachmentUrls: [PDF] }, ctx);
    expect(r.refused).toBe(true);
    expect(r.refusalReason).toBe('השולח stranger@outside.test.example אינו מאומת (לא מאומת) – אסור לצרף קבצים לפני אימות השולח בטלפון');
    const noPdf = await invoke({ inboundEmailId: m.inboundEmailId, body: 'היתרה היא…', reason: 'בקשה לכרטסת' }, ctx);
    expect(noPdf.refused).toBe(true);
    expect(noPdf.refusalReason).toContain('להכין מענה עם נתוני כרטסת');
    expect(fake.rows('Approvals')).toHaveLength(before);
    expect(fake.rows('InboundEmails').find((x) => x.messageId === 'r-1')!.status).toBe('ממתינה לגורם פנימי');
  });

  it('verified sender: one pending draft with the PDF, replaced (not duplicated) on a second call', async () => {
    const m = await mail({ messageId: 'r-2', fromAddress: 'מיכל לוי <saarlevi14@gmail.com>', subject: 'בקשה לכרטסת', bodyText: 'אפשר כרטסת?' });
    await classify({ inboundEmailId: m.inboundEmailId, category: 'כרטסת', customerCode: 'TEST-004' }, ctx);
    const r = await invoke({ inboundEmailId: m.inboundEmailId, body: 'שלום מיכל,\nמצורפת הכרטסת המעודכנת.', reason: 'בקשת כרטסת משולח מאומת', attachmentUrls: [PDF] }, ctx);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ refused: false, replaced: false, writeVerified: true });
    expect(r.approval).toMatchObject({
      kind: 'מענה ללקוח',
      status: 'ממתין',
      customerCode: 'TEST-004',
      customerName: 'בדיקה – רמות בנייה ופיתוח',
      recipientName: 'מיכל לוי',
      recipientContact: 'saarlevi14@gmail.com',
      // every outbox draft carries its CIM reference in the subject (component 04: the reply threads back by it)
      subject: `Re: בקשה לכרטסת [${r.approval.referenceCode}]`,
      referenceCode: `CIM-${r.approval.id}`,
      fromMailbox: 'saar@blocks.diy',
      draftedBy: 'מאיה',
      relatedTable: 'InboundEmails',
      relatedId: m.inboundEmailId,
      inboundEmailId: 'r-2',
      attachmentUrls: PDF,
      isTestFixture: true,
    });
    expect(r.approval.body.endsWith('בברכה,\nבדיקה – אחראית א\nמחלקת הנהלת חשבונות, סימנט')).toBe(true);
    expect(fake.rows('InboundEmails').find((x) => x.messageId === 'r-2')!.status).toBe('טיוטה מוכנה');

    const again = await invoke({ inboundEmailId: m.inboundEmailId, body: 'נוסח מתוקן', reason: 'תיקון', attachmentUrls: [PDF, 'https://files.example/open-debts.pdf'] }, ctx);
    expect(again).toMatchObject({ replaced: true, writeVerified: true });
    expect(again.approval.id).toBe(r.approval.id);
    expect(again.approval.attachmentUrls).toBe(`${PDF}\nhttps://files.example/open-debts.pdf`);
    expect(fake.rows('Approvals').filter((a) => a.relatedId === m.inboundEmailId)).toHaveLength(1);
  });

  it('irrelevant mail and missing input are refused / rejected', async () => {
    const m = await mail({ messageId: 'r-3', fromAddress: 'news@shop.example', subject: 'מבצע' });
    await classify({ inboundEmailId: m.inboundEmailId, category: 'לא רלוונטי' }, ctx);
    expect((await invoke({ inboundEmailId: m.inboundEmailId, body: 'x', reason: 'y' }, ctx)).refused).toBe(true);
    expect((await invoke({ inboundEmailId: m.inboundEmailId, body: '', reason: '' }, ctx)).errors).toEqual(['חסר גוף התשובה (body)', 'חסרה סיבה (reason)']);
  });
});
