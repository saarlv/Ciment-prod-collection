import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

const gmail = (o: Record<string, unknown>) => ({
  mailProvider: 'gmail',
  mailbox: 'saar@blocks.diy',
  mailboxOwnerName: 'סער (תיבת בדיקה)',
  sourceLabel: 'Ciment-Test',
  threadId: 'undefined',
  ...o,
});

describe('IngestEmail', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    seedRealWorld(fake);
    // since 28.10 the intake resolves the mailbox in Mailboxes (the live app has this one row) – unregistered → an error
    fake.insert('Mailboxes', [{ address: 'saar@blocks.diy', provider: 'gmail', ownerName: 'סער', sourceLabel: 'Ciment-Test', active: true, isTestFixture: false }]);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: T }, ctx);
  });
  afterAll(() => vi.useRealTimers());

  it('registered sender: customer by contact, מאומת, 24h deadline, test data, brief for Maya', async () => {
    const r = await invoke(
      gmail({
        messageId: 'gm-1',
        fromAddress: 'מיכל לוי <saarlevi14@gmail.com>',
        subject: 'בקשה לכרטסת',
        bodyText: 'שלום, אפשר לקבל כרטסת מעודכנת? תודה, מיכל',
        receivedAt: '1792560600', // epoch seconds = 21.10.2026 08:30 Israel
        attachments: [{ attachmentId: 'a1', filename: 'הזמנה.pdf', mimeType: 'application/pdf' }],
      }),
      ctx,
    );
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ duplicate: false, shouldProcess: true, writeVerified: true });
    expect(r.inboundEmail.mailboxId).toBe(String(fake.rows('Mailboxes')[0].id));
    expect(r.identification).toMatchObject({ customerCode: 'TEST-004', method: 'כתובת השולח' });
    expect(r.verification.status).toBe('מאומת');
    expect(r.inboundEmail).toMatchObject({
      fromAddress: 'saarlevi14@gmail.com',
      fromName: 'מיכל לוי',
      threadId: null,
      receivedAt: '2026-10-21T05:30:00.000Z',
      dueAt: '2026-10-22T05:30:00.000Z',
      customerName: 'בדיקה – רמות בנייה ופיתוח',
      assignedBookkeeperName: 'בדיקה – אחראית א',
      status: 'בטיפול מאיה',
      bodyStored: true,
      // since 28.10 the intake stores אחר (category and categories) until Maya's classification replaces it
      category: 'אחר',
      attachmentNames: 'הזמנה.pdf',
      attachmentUrls: null,
      isTestFixture: true,
    });
    // since 28.10 Maya only sorts: the prompt states what is known of the sender and lists the customer candidates
    expect(r.promptForAgent).toContain('שולח: saarlevi14@gmail.com (מיכל לוי)');
    expect(r.promptForAgent).toContain('מה ידוע על השולח: מאומת · איש קשר של הלקוח · איש קשר רשום מיכל לוי');
    expect(r.promptForAgent).toContain('מועמדי לקוח (קוד | שם | איך נמצא):\nTEST-004 | בדיקה – רמות בנייה ופיתוח | כתובת השולח');
    expect(r.promptForAgent).toContain('נושא: בקשה לכרטסת');
    expect(r.promptForAgent).toContain('קבצים מצורפים: הזמנה.pdf');
    expect(r.promptForAgent).toContain('אפשר לקבל כרטסת מעודכנת');
  });

  it('dedupes by messageId: nothing written, shouldProcess=false', async () => {
    const before = fake.rows('InboundEmails').length;
    const r = await invoke(gmail({ messageId: 'gm-1', fromAddress: 'saarlevi14@gmail.com', receivedAt: '2026-10-21T08:30:00+03:00' }), ctx);
    expect(r).toMatchObject({ duplicate: true, shouldProcess: false });
    expect(r.inboundEmailId).toBe(String(fake.rows('InboundEmails').find((m) => m.messageId === 'gm-1')!.id));
    expect(fake.rows('InboundEmails')).toHaveLength(before);
  });

  it('unregistered sender: customer from invoice numbers, לא מאומת, mentioned invoices stored', async () => {
    const r = await invoke(
      gmail({
        messageId: 'gm-2',
        fromAddress: 'Stranger <stranger@outside.test.example>',
        subject: 'כרטסת בבקשה',
        bodyText: 'שלחו לי בבקשה כרטסת. לגבי TEST-INV-004-1 ו-TEST-INV-004-3',
        receivedAt: 'Wed, 21 Oct 2026 09:15:00 +0300',
      }),
      ctx,
    );
    expect(r.identification).toMatchObject({ customerCode: 'TEST-004', method: 'מספר חשבונית' });
    expect(r.verification.status).toBe('לא מאומת');
    expect(r.inboundEmail.mentionedInvoiceNumbers).toBe('TEST-INV-004-1, TEST-INV-004-3');
    expect(r.inboundEmail.receivedAt).toBe('2026-10-21T06:15:00.000Z');
    expect(r.promptForAgent).toContain('מה ידוע על השולח: לא מאומת · אחר · הכתובת stranger@outside.test.example לא רשומה באנשי הקשר של בדיקה – רמות בנייה ופיתוח (TEST-004)');
    expect(r.promptForAgent).toContain('מועמדי לקוח (קוד | שם | איך נמצא):\nTEST-004 | בדיקה – רמות בנייה ופיתוח | מספר חשבונית');
    expect(r.promptForAgent).toContain('לגבי TEST-INV-004-1 ו-TEST-INV-004-3');
  });

  it('customer by name (with or without the בדיקה prefix); test label prefers the test customer', async () => {
    fake.insert('Customers', [{ customerCode: '20004', customerName: 'רמות בנייה ופיתוח בע״מ', source: 'priority-mock', assignedBookkeeperName: 'רינה' }]);
    const r = await invoke(gmail({ messageId: 'gm-3', fromAddress: 'stranger@outside.test.example', subject: 'יתרה של רמות בנייה ופיתוח', bodyText: '', receivedAt: '' }), ctx);
    expect(r.identification).toMatchObject({ customerCode: 'TEST-004', method: 'שם בתוכן' });
    expect(r.errors[0]).toContain('לא זוהה כתאריך');
    // a production mailbox (no test label) with the real name → the real customer, not test data
    const real = await invoke(gmail({ messageId: 'gm-4', sourceLabel: 'INBOX', fromAddress: 'a@b.co.il', subject: 'רמות בנייה ופיתוח', receivedAt: '1792560600000', dryRun: true }), ctx);
    expect(real.identification.customerCode).toBe('20004');
    expect(real.inboundEmail).toMatchObject({ isTestFixture: false, assignedBookkeeperName: 'רינה' });
    expect(fake.rows('InboundEmails').some((m) => m.messageId === 'gm-4')).toBe(false);
    // nothing recognisable → unidentified, owner = mailbox owner
    const none = await invoke(gmail({ messageId: 'gm-5', sourceLabel: 'INBOX', fromAddress: 'x@unknown.example', subject: 'שלום', receivedAt: '1792560600', dryRun: true }), ctx);
    expect(none.identification.customerCode).toBe('');
    expect(none.inboundEmail).toMatchObject({ customerCode: null, assignedBookkeeperName: 'סער (תיבת בדיקה)', isTestFixture: false });
    expect(none.promptForAgent).toContain('מועמדי לקוח (קוד | שם | איך נמצא):\nאין');
    expect(none.promptForAgent).toContain('הלקוח לא נקבע');
  });

  it('invoice numbers TEST-INV-004-7 / TEST-INV-004-2 are caught in the subject and the body', async () => {
    const a = await invoke(gmail({ messageId: 'inv-1', fromAddress: 'saarlevi14@gmail.com', subject: 'חסרות תעודות לחשבונית TEST-INV-004-7', bodyText: 'תודה', receivedAt: '1792560600' }), ctx);
    expect(a.errors).toEqual([]);
    const b = await invoke(gmail({ messageId: 'inv-2', fromAddress: 'saarlevi14@gmail.com', subject: 'שאלה', bodyText: 'המחיר בחשבונית TEST-INV-004-2 לא נכון.\nוגם לגבי (TEST-INV-004-7)', receivedAt: '1792560600' }), ctx);
    expect(b.errors).toEqual([]);
    const row = (id: string) => fake.rows('InboundEmails').find((x) => x.messageId === id)!;
    expect(row('inv-1').mentionedInvoiceNumbers).toBe('TEST-INV-004-7');
    expect(row('inv-2').mentionedInvoiceNumbers).toBe('TEST-INV-004-2, TEST-INV-004-7');
    expect([row('inv-1').customerCode, row('inv-2').customerCode]).toEqual(['TEST-004', 'TEST-004']);
  });
});
