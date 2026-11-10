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
import { invoke } from '../code.ts';

const ctx: any = {};
const mail = (o: Record<string, unknown>) =>
  ingest({ mailProvider: 'gmail', mailbox: 'saar@blocks.diy', mailboxOwnerName: 'סער', sourceLabel: 'Ciment-Test', receivedAt: '1792560600', ...o }, ctx);

describe('ClassifyAndLinkEmail', () => {
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
    expect((await invoke({ inboundEmailId: '', category: 'x' }, ctx)).errors).toEqual(['חסר מזהה מייל (inboundEmailId)', 'סיווג לא מוכר: "x"']);
    expect((await invoke({ inboundEmailId: '999999', category: 'אחר' }, ctx)).errors).toEqual(['המייל 999999 לא נמצא']);
  });

  it('לא רלוונטי deletes body, attachments and summary in the same single write', async () => {
    const m = await mail({ messageId: 'c-1', fromAddress: 'news@shop.example', subject: 'מבצע', bodyText: 'הנחה ענקית', attachments: [{ filename: 'flyer.pdf' }] });
    const before = fake.calls.length;
    const r = await invoke({ inboundEmailId: m.inboundEmailId, category: 'לא רלוונטי', agentSummary: 'פרסומת' }, ctx);
    const updates = fake.calls.slice(before).filter((c) => c.method === 'updateItem' && c.table === 'InboundEmails');
    expect(updates).toHaveLength(1);
    expect(r).toMatchObject({ bodyDeleted: true, verifyTask: null, interaction: null, writeVerified: true });
    const row = fake.rows('InboundEmails').find((x) => x.messageId === 'c-1')!;
    expect(row).toMatchObject({ bodyText: '', bodyStored: false, attachmentNames: null, attachmentUrls: null, agentSummary: null, status: 'לא רלוונטית', category: 'לא רלוונטי' });
    expect(row.subject).toBe('מבצע'); // metadata kept
  });

  it('unverified ledger request → one verify-sender task, status ממתינה לגורם פנימי; idempotent', async () => {
    const m = await mail({ messageId: 'c-2', fromAddress: 'stranger@outside.test.example', subject: 'כרטסת של בדיקה – רמות בנייה ופיתוח', bodyText: 'אשמח לכרטסת' });
    expect(m.verification.status).toBe('לא מאומת');
    const r = await invoke({ inboundEmailId: m.inboundEmailId, category: 'כרטסת', customerCode: 'TEST-004', agentSummary: 'בקשה לכרטסת מכתובת לא רשומה' }, ctx);
    expect(r.writeVerified).toBe(true);
    // the task engine's verify-sender task (the same row the 06:00 scan keeps)
    expect(r.verifyTask).toMatchObject({
      taskKey: `verify-sender:${m.inboundEmailId}`,
      source: 'פניות',
      taskType: 'לאמת שולח',
      recommendedAction: 'להתקשר',
      severity: 'בינונית',
      status: 'ממתין',
      customerCode: 'TEST-004',
      customerName: 'בדיקה – רמות בנייה ופיתוח',
      assignedBookkeeperName: 'בדיקה – אחראית א',
      relatedTable: 'InboundEmails',
      relatedId: m.inboundEmailId,
      isTestFixture: true,
    });
    expect(r.verifyTask.reasons).toMatch(/^בקשת כרטסת מ-stranger@outside\.test\.example, השולח לא מאומת .*לאמת בטלפון לפני ששולחים נתונים$/);
    expect(r.taskSync).toMatchObject({ created: 1, errors: [] });
    expect(r.inboundEmail.status).toBe('ממתינה לגורם פנימי');
    expect(r.nextStep).toContain('עצרי כאן');
    expect(r.interaction).toMatchObject({ type: 'דואל', direction: 'נכנס', actorName: 'stranger@outside.test.example', customerCode: 'TEST-004' });
    const again = await invoke({ inboundEmailId: m.inboundEmailId, category: 'כרטסת', customerCode: 'TEST-004' }, ctx);
    expect(again.verifyTask.id).toBe(r.verifyTask.id);
    expect(fake.rows('CollectionQueue').filter((t) => t.taskType === 'לאמת שולח')).toHaveLength(1);
    expect(fake.rows('Interactions').filter((i) => i.type === 'דואל' && i.customerCode === 'TEST-004')).toHaveLength(1);
  });

  it('unknown customer: task without customer, bookkeeper from the email', async () => {
    const m = await mail({ messageId: 'c-3', fromAddress: 'who@unknown.example', subject: 'חובות פתוחים', bodyText: 'מה היתרה שלנו?', sourceLabel: 'INBOX' });
    const r = await invoke({ inboundEmailId: m.inboundEmailId, category: 'חובות פתוחים' }, ctx);
    expect(r.verifyTask).toMatchObject({ customerCode: null, customerName: null, assignedBookkeeperName: 'סער', isTestFixture: false });
    expect(r.verifyTask.reasons).toMatch(/^בקשת חובות פתוחים מ-who@unknown\.example, השולח לא מאומת \(הלקוח לא נקבע.*לאמת בטלפון לפני ששולחים נתונים$/);
    expect(r.interaction).toBeNull();
  });

  it('verified remittance: invoices stored, linked to the customer only, one interaction, names from the data', async () => {
    const seeded = fake.rows('InboundEmails').find((x) => x.messageId === 'TEST-MAIL-004')!;
    const r = await invoke(
      { inboundEmailId: seeded.id, category: 'פירוט תשלום', customerCode: 'TEST-004', mentionedInvoiceNumbers: ['TEST-INV-004-1', 'TEST-INV-004-3', 'TEST-INV-004-4', 'TEST-INV-004-6'], agentSummary: 'פירוט להעברה של 82,880' },
      ctx,
    );
    expect(r.writeVerified).toBe(true);
    expect(r.inboundEmail).toMatchObject({
      senderVerification: 'מאומת',
      status: 'בטיפול מאיה',
      customerName: 'בדיקה – רמות בנייה ופיתוח',
      mentionedInvoiceNumbers: 'TEST-INV-004-1, TEST-INV-004-3, TEST-INV-004-4, TEST-INV-004-6',
      agentSummary: 'פירוט להעברה של 82,880',
    });
    expect(r.verifyTask).toBeNull();
    expect(r.interaction.summary).toBe('דואל נכנס: פירוט העברה מאתמול (פירוט תשלום) – פירוט להעברה של 82,880');
    expect(r.interaction.actorName).toBe('מיכל לוי');
    expect(r.nextStep).toContain('המייל שויך ללקוח');
    await invoke({ inboundEmailId: seeded.id, category: 'פירוט תשלום', customerCode: 'TEST-004' }, ctx);
    expect(fake.rows('Interactions').filter((i) => i.summary?.startsWith('דואל נכנס: פירוט העברה מאתמול'))).toHaveLength(1);
    expect((await invoke({ inboundEmailId: seeded.id, category: 'אחר', customerCode: 'NOPE' }, ctx)).errors).toEqual(['לקוח NOPE לא נמצא']);
  });
});
