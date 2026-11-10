// Plan 04.11 r2, stage 9: כרטסת / חובות פתוחים replies to inbound mail – the reply on the same thread, the open-debts
// PDF from OpenMovements (not the invoice layer), and the mailAutoReplyAt threshold (empty = OFF). Nothing is sent.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as apply } from '../code.ts';
import { replySubject } from '../../shared/collections-mail.ts';
import { autoReplyCheck } from '../../shared/collections-mail-auto-reply.ts';

const CODE = 'TEST-091';
const NAME = 'בדיקה – גבעת הזית';
const AP = 'yael@zayit.test.example';
let fake: FakeBlocks;
let pdfCalls: any[];

const email = (id: string) => fake.rows('InboundEmails').find((e) => e.id === id)!;
const replies = (emailId: string) => fake.rows('Approvals').filter((a) => a.relatedTable === 'InboundEmails' && a.relatedId === emailId);

function addEmail(extra: Record<string, unknown>) {
  const [e] = fake.insert('InboundEmails', [
    {
      messageId: '<orig-91@zayit.test.example>',
      threadId: 'thread-91',
      mailbox: 'keren@ciment.example',
      fromAddress: AP,
      fromName: 'יעל כהן',
      customerCode: CODE,
      bodyStored: true,
      receivedAt: '2026-11-04T06:00:00.000Z',
      dueAt: '2026-11-05T06:00:00.000Z',
      handlingState: 'לא טופל',
      category: 'אחר',
      categories: 'אחר',
      status: 'בטיפול מאיה',
      isTestFixture: true,
      classificationQuotes: { candidates: [{ customerCode: CODE, customerName: NAME, method: 'כתובת השולח' }] },
      ...extra,
    },
  ]);
  return e;
}

const classification = (types: { type: string; quote: string }[]) => ({
  types,
  customerCode: CODE,
  senderRole: 'איש קשר של הלקוח',
  invoices: [],
  promise: null,
  dispute: null,
  summary: 'בקשה לנתוני חשבון',
  signature: null,
});
const OPEN_DEBTS = [{ type: 'חובות פתוחים', quote: 'לשלוח לנו את פירוט החובות הפתוחים' }];
const BODY = 'שלום קרן,\nאפשר לשלוח לנו את פירוט החובות הפתוחים?\nתודה, יעל';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-11-05T08:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  fake = new FakeBlocks();
  pdfCalls = [];
  fake.insert('Customers', [{ customerCode: CODE, customerName: NAME, source: 'test-fixture', ledgerBalance: 12000 }]);
  fake.insert('CustomerOwners', [{ customerCode: CODE, bookkeeperName: 'בודקת', setAt: '2026-10-01T08:00:00.000Z' }]);
  fake.insert('CustomerContacts', [{ contactKey: `${CODE}-1`, customerCode: CODE, contactName: 'יעל כהן', email: AP, roleFlags: 'הנהלת חשבונות', isApContact: true, source: 'test-fixture' }]);
  // the old invoice layer says something else on purpose: the PDF must follow OpenMovements
  fake.insert('Invoices', [{ customerCode: CODE, invoiceNumber: 'TEST-INV-091-OLD', documentType: 'חשבונית', dueDate: '2026-09-30', amount: 99999, openAmount: 99999 }]);
  fake.insert('OpenMovements', [
    { movementId: 'M-91-1', customerCode: CODE, customerName: NAME, docType: 'חשבונית', docNumber: 'TEST-INV-091-1', docDate: '2026-08-10', dueDate: '2026-09-30', dueMonth: '2026-09', amount: 7000, source: 'test-fixture' },
    { movementId: 'M-91-2', customerCode: CODE, customerName: NAME, docType: 'חשבונית', docNumber: 'TEST-INV-091-2', docDate: '2026-09-12', dueDate: '2026-10-31', dueMonth: '2026-10', amount: 5432.1, source: 'test-fixture' },
  ]);
  fake.insert('LedgerEntries', [
    { entryKey: `${CODE}-L1`, customerCode: CODE, entryDate: '2026-08-10', valueDate: '2026-08-10', docType: 'חשבונית מס', docNumber: 'TEST-INV-091-1', details: 'חשבונית מס', debit: 7000, credit: 0, runningBalance: 7000 },
    { entryKey: `${CODE}-L2`, customerCode: CODE, entryDate: '2026-09-12', valueDate: '2026-09-12', docType: 'חשבונית מס', docNumber: 'TEST-INV-091-2', details: 'חשבונית מס', debit: 5432.1, credit: 0, runningBalance: 12432.1 },
  ]);
  const base = fake.client();
  current = {
    ...base,
    invokeAction: vi.fn(async (name: string, input: any) => {
      if (name !== 'HtmlToPdf') return base.invokeAction(name, input);
      pdfCalls.push(input);
      return { url: `https://files.example/protected/${input.pdfFilename}` };
    }),
  };
});

describe('reply subject on the same thread', () => {
  it('Re: once, whatever prefix the original carries', () => {
    expect(replySubject('בקשה לחובות פתוחים')).toBe('Re: בקשה לחובות פתוחים');
    expect(replySubject('RE: בקשה')).toBe('RE: בקשה');
    expect(replySubject('Re[2]: בקשה')).toBe('Re[2]: בקשה');
    expect(replySubject('AW: Anfrage')).toBe('AW: Anfrage');
    expect(replySubject('תשובה: כרטסת')).toBe('תשובה: כרטסת');
    expect(replySubject('Rental report')).toBe('Re: Rental report');
  });
});

describe('open-debts reply (verified sender)', () => {
  it('the PDF comes from OpenMovements; the draft is on the same thread (Re:, CIM tag, In-Reply-To and threadId)', async () => {
    const e = addEmail({ subject: 'בקשה לחובות פתוחים', bodyText: BODY });
    const r = await apply({ inboundEmailId: e.id, classification: classification(OPEN_DEBTS) }, {});
    expect(r.errors).toEqual([]);
    expect(pdfCalls).toHaveLength(1);
    const html = pdfCalls[0].html as string;
    expect(html).toContain('TEST-INV-091-1');
    expect(html).toContain('5,432.10');
    expect(html).toContain('12,432.10');
    expect(html).not.toContain('TEST-INV-091-OLD');
    expect(html).not.toContain('99,999');

    const [d] = replies(e.id);
    expect(d).toMatchObject({
      kind: 'מענה ללקוח',
      status: 'ממתין',
      recipientContact: AP,
      subject: `Re: בקשה לחובות פתוחים [CIM-${d.id}]`,
      referenceCode: `CIM-${d.id}`,
      inboundEmailId: '<orig-91@zayit.test.example>',
      threadId: 'thread-91',
      attachmentUrls: 'https://files.example/protected/open-debts-TEST-091-2026-11-05.pdf',
    });
    // threshold empty (the plan default) = OFF: waits for one click
    expect(r.autoReply).toMatchObject({ on: false, threshold: null, confidence: 100, approved: false });
    expect(email(e.id)).toMatchObject({ handlingState: 'לא טופל', status: 'טיוטה מוכנה' });
  });

  it('a reply to our own mail: one Re:, our old CIM tag replaced by the new draft’s', async () => {
    const e = addEmail({ subject: 'RE: חובות פתוחים – בדיקה [CIM-7]', bodyText: BODY });
    await apply({ inboundEmailId: e.id, classification: classification(OPEN_DEBTS) }, {});
    const [d] = replies(e.id);
    expect(d.subject).toBe(`RE: חובות פתוחים – בדיקה [CIM-${d.id}]`);
  });

  it('an empty OpenMovements table: no PDF, no draft – the debts are unknown, not zero', async () => {
    fake.rows('OpenMovements').splice(0);
    const e = addEmail({ subject: 'חובות פתוחים', bodyText: BODY });
    const r = await apply({ inboundEmailId: e.id, classification: classification(OPEN_DEBTS) }, {});
    expect(pdfCalls).toHaveLength(0);
    expect(replies(e.id)).toHaveLength(0);
    expect(r.errors.join(' ')).toContain('OpenMovements ריקה');
  });
});

describe('mailAutoReplyAt threshold', () => {
  it('the check: empty = off; a number + a verified sender + statements only = on', () => {
    const s = (v: string) => new Map([['mailAutoReplyAt', v]]);
    const x = { verificationStatus: 'מאומת', categories: ['כרטסת'], pdfCount: 1, hasOtherParts: false };
    expect(autoReplyCheck(new Map(), x)).toMatchObject({ on: false, threshold: null });
    expect(autoReplyCheck(s(''), x)).toMatchObject({ on: false, threshold: null });
    expect(autoReplyCheck(s('90'), x)).toMatchObject({ on: true, threshold: 90, confidence: 100 });
    expect(autoReplyCheck(s('90'), { ...x, verificationStatus: 'לבדיקה' })).toMatchObject({ on: false, confidence: 0 });
    expect(autoReplyCheck(s('101'), x).on).toBe(false);
    expect(autoReplyCheck(s('90'), { ...x, categories: ['כרטסת', 'אחר'] }).on).toBe(false);
    expect(autoReplyCheck(s('90'), { ...x, pdfCount: 0 }).on).toBe(false);
    expect(autoReplyCheck(s('90'), { ...x, hasOtherParts: true }).on).toBe(false);
  });

  it('on: the draft is approved through the outbox decision path (אושר – לא נשלח) and the email closed; a rerun keeps it', async () => {
    fake.insert('AgentSettings', [{ settingKey: 'mailAutoReplyAt', value: '90', valueType: 'מספר' }]);
    const e = addEmail({ subject: 'כרטסת לחשבון', bodyText: 'שלום,\nנבקש כרטסת לחשבון שלנו.\nיעל' });
    const c = classification([{ type: 'כרטסת', quote: 'נבקש כרטסת לחשבון שלנו' }]);
    const r = await apply({ inboundEmailId: e.id, classification: c }, {});
    expect(r.errors).toEqual([]);
    expect(pdfCalls.map((p) => p.pdfFilename)).toEqual(['kartesset-TEST-091-2026-11-05.pdf']);
    const [d] = replies(e.id);
    expect(d).toMatchObject({ status: 'אושר – לא נשלח', decidedBy: 'שליחה אוטומטית (מערכת)', subject: `Re: כרטסת לחשבון [CIM-${d.id}]`, threadId: 'thread-91' });
    expect(d.decisionNote).toContain('סף השליחה האוטומטית 90');
    expect(r.autoReply).toMatchObject({ on: true, threshold: 90, confidence: 100, approved: true, approvalId: d.id });
    expect(email(e.id)).toMatchObject({ status: 'נענתה', handlingState: 'טופל', handledBy: 'מערכת' });
    expect(email(e.id).answeredAt).toBeTruthy();
    expect(r.writeVerified).toBe(true);

    const again = await apply({ inboundEmailId: e.id, classification: c }, {});
    expect(replies(e.id)).toHaveLength(1);
    expect(again.handlingState).toBe('טופל');
    expect(email(e.id).handlingState).toBe('טופל');
  });

  it('on, but the email also asks something else: the draft waits for a person', async () => {
    fake.insert('AgentSettings', [{ settingKey: 'mailAutoReplyAt', value: '90', valueType: 'מספר' }]);
    const e = addEmail({ subject: 'חובות ושאלה', bodyText: `${BODY}\nויש לנו גם שאלה כללית על ההזמנה` });
    const r = await apply(
      { inboundEmailId: e.id, classification: classification([...OPEN_DEBTS, { type: 'אחר', quote: 'ויש לנו גם שאלה כללית על ההזמנה' }]) },
      {},
    );
    expect(replies(e.id)[0].status).toBe('ממתין');
    expect(r.autoReply).toMatchObject({ on: false, threshold: 90, approved: false });
    expect(email(e.id).handlingState).toBe('לא טופל');
  });

  it('on, unverified sender: no PDF and no draft at all', async () => {
    fake.insert('AgentSettings', [{ settingKey: 'mailAutoReplyAt', value: '0', valueType: 'מספר' }]);
    const e = addEmail({ subject: 'חובות פתוחים', bodyText: BODY, fromAddress: 'someone@zayit.test.example' });
    const r = await apply({ inboundEmailId: e.id, classification: classification(OPEN_DEBTS) }, {});
    expect(pdfCalls).toHaveLength(0);
    expect(replies(e.id)).toHaveLength(0);
    expect(r.autoReply).toBeNull();
  });
});
