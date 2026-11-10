// Plan 04.11 part C, stage 8: an unknown sender → Maya's signature → "זה הלקוח X?" → ConfirmSender (confirm / reject).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorld, type World } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as apply } from '../../ApplyMailClassification/code.ts';
import { invoke as confirmSender } from '../code.ts';
import { suggestCustomerFromSignature } from '../../shared/collections-sender.ts';

const ctx: any = {};
const CODE = 'TEST-071';
const NAME = 'בדיקה – גשר הכרמל בע״מ';
const ADDRESS = 'orly@gesher-carmel.test.example';
let w: World;

const body = ['שלום,', 'אבקש כרטסת מתחילת השנה.', '', 'בברכה,', 'אורלי שמש', 'מנהלת חשבונות', 'גשר הכרמל בע"מ', 'טל׳ 04-1234567'].join('\n');
const signature = { companyName: 'גשר הכרמל בע"מ', personName: 'אורלי שמש', title: 'מנהלת חשבונות', logoText: null, quote: 'אורלי שמש\nמנהלת חשבונות\nגשר הכרמל בע"מ' };
const classification = {
  types: [{ type: 'כרטסת', quote: 'אבקש כרטסת מתחילת השנה' }],
  customerCode: null,
  senderRole: 'אחר',
  invoices: [],
  promise: null,
  dispute: null,
  summary: 'אורלי מגשר הכרמל מבקשת כרטסת',
  signature,
};

function addEmail() {
  const [e] = w.fake.insert('InboundEmails', [
    {
      messageId: `<c-${Math.random().toString(36).slice(2)}@x>`,
      subject: 'בקשה לכרטסת',
      bodyText: body,
      bodyStored: true,
      fromAddress: ADDRESS,
      fromName: 'אורלי שמש',
      receivedAt: '2026-10-21T06:00:00.000Z',
      dueAt: '2026-10-22T06:00:00.000Z',
      handlingState: 'לא טופל',
      senderVerification: 'לא מאומת',
      category: 'אחר',
      categories: 'אחר',
      status: 'בטיפול מאיה',
      customerCode: null,
      customerMatchMethod: 'לא זוהה',
      classificationQuotes: { types: [], invoices: [], rejected: [], candidates: [] },
      isTestFixture: true,
    },
  ]);
  return e;
}
const email = (id: string) => w.fake.rows('InboundEmails').find((e) => e.id === id)!;
const tasksOf = (key: string) => w.fake.rows('CollectionQueue').filter((t) => t.taskKey === key);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-10-21T08:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  w = makeWorld();
  current = w.client;
  w.fake.insert('Customers', [
    { customerCode: CODE, customerName: NAME, source: 'test-fixture', ledgerBalance: 1200 },
    { customerCode: 'TEST-072', customerName: 'בדיקה – כרמל אחר', source: 'test-fixture' },
  ]);
  w.fake.insert('CustomerOwners', [{ customerCode: CODE, bookkeeperName: 'בודקת', setAt: '2026-10-01T08:00:00.000Z' }]);
  w.fake.insert('LedgerEntries', [
    { customerCode: CODE, entryDate: '2026-09-01', valueDate: '2026-09-01', reference1: 'TEST-INV-071-1', details: 'חשבונית', movementType: 'חשבונית', debit: 1200, credit: 0, runningBalance: 1200, currency: 'ש״ח', source: 'test-fixture' },
  ]);
  w.fake.insert('Invoices', [{ customerCode: CODE, invoiceNumber: 'TEST-INV-071-1', documentType: 'חשבונית', invoiceDate: '2026-09-01', dueDate: '2026-10-01', amount: 1200, openAmount: 1200 }]);
});

describe('signature → suggested customer', () => {
  it('matches the company name normalised (בע״מ, quotes, test prefix), an approved alias, a name inside the text; ties give none', () => {
    const customers = [
      { customerCode: 'A', customerName: 'בדיקה – גשר הכרמל בע״מ' },
      { customerCode: 'B', customerName: 'אבני דרך' },
    ];
    expect(suggestCustomerFromSignature({ companyName: 'גשר הכרמל בע"מ' }, { customers }).suggestion).toMatchObject({ customerCode: 'A', how: 'שם זהה', matchedOn: 'companyName' });
    expect(suggestCustomerFromSignature({ companyName: 'קבוצת אבני דרך – הנהלת חשבונות' }, { customers }).suggestion).toMatchObject({ customerCode: 'B', how: 'שם הלקוח בחתימה' });
    const aliases = [{ bankName: 'א.ד. בנייה', customerCode: 'B', status: 'מאושר' }, { bankName: 'משהו', customerCode: 'A', status: 'מוצע' }];
    expect(suggestCustomerFromSignature({ companyName: null, logoText: 'א.ד. בנייה' }, { customers, aliases }).suggestion).toMatchObject({ customerCode: 'B', how: 'כינוי', matchedOn: 'logoText' });
    expect(suggestCustomerFromSignature({ companyName: 'משהו' }, { customers, aliases }).suggestion).toBeNull();
    const twins = [...customers, { customerCode: 'C', customerName: 'גשר הכרמל' }];
    expect(suggestCustomerFromSignature({ companyName: 'גשר הכרמל' }, { customers: twins }).suggestion).toBeNull();
  });

  it('ApplyMailClassification stores the signature and the suggestion; the task asks "זה הלקוח X?"; no PDF', async () => {
    const e = addEmail();
    const r = await apply({ inboundEmailId: e.id, classification }, ctx);
    expect(r.errors).toEqual([]);
    const back = email(e.id);
    expect(back).toMatchObject({ senderVerification: 'לא מאומת', suggestedCustomerCode: CODE, identifiedBy: 'חתימה', customerCode: null });
    expect(back.signatureText).toBe(signature.quote);
    expect(back.classificationQuotes.signature).toMatchObject({ companyName: 'גשר הכרמל בע"מ', title: 'מנהלת חשבונות', verified: true, suggestion: { customerCode: CODE, how: 'שם זהה' } });
    expect(w.fake.rows('Approvals').filter((a) => a.relatedId === e.id)).toHaveLength(0);
    expect(w.pdfs).toHaveLength(0);
    const [verify] = tasksOf(`verify-sender:${e.id}`);
    expect(verify).toMatchObject({ taskType: 'לאמת שולח', status: 'ממתין', relatedTable: 'InboundEmails', relatedId: e.id, title: `זה הלקוח ${NAME}?` });
    expect(verify.reasons).toContain('תפקיד: מנהלת חשבונות');
    expect(verify.reasons).toContain('חברה בחתימה: גשר הכרמל בע"מ');
    // no separate identify-customer task while the suggestion carries it
    expect(w.fake.rows('CollectionQueue').filter((t) => t.taskType === 'אחר')).toHaveLength(0);
  });

  it('a signature quote that is not in the mail is rejected and suggests nothing', async () => {
    const e = addEmail();
    await apply({ inboundEmailId: e.id, classification: { ...classification, signature: { ...signature, quote: 'חתימה שלא קיימת במייל' } } }, ctx);
    const back = email(e.id);
    expect(back.suggestedCustomerCode).toBeNull();
    expect(back.signatureText).toBeNull();
    expect(back.classificationQuotes.rejected.some((x: any) => x.field === 'signature')).toBe(true);
  });
});

describe('ConfirmSender', () => {
  it('confirm: our contact (isApContact), verified email, task closed, Priority task, re-routed with the statement draft', async () => {
    const e = addEmail();
    await apply({ inboundEmailId: e.id, classification }, ctx);
    const r = await confirmSender({ inboundEmailId: e.id, mode: 'confirm', customerCode: CODE, decidedBy: 'קרן' }, ctx);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ mode: 'confirm', customerCode: CODE, customerName: NAME, contactKey: `ours:${CODE}:${ADDRESS}`, rerouted: true });
    const contacts = w.fake.rows('CustomerContacts').filter((c) => c.email === ADDRESS);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ id: r.contactId, source: 'נוסף אצלנו', isApContact: true, contactName: 'אורלי שמש', signatureTitle: 'מנהלת חשבונות', addedFromEmailId: e.id, roleFlags: 'הנהלת חשבונות' });
    const back = email(e.id);
    expect(back).toMatchObject({ customerCode: CODE, senderVerification: 'מאומת', identifiedBy: 'חתימה', suggestedCustomerCode: CODE });
    expect(back.classificationQuotes.senderDecision).toMatchObject({ mode: 'confirm', customerCode: CODE, decidedBy: 'קרן', contactId: r.contactId });
    const [verify] = tasksOf(`verify-sender:${e.id}`);
    expect(verify).toMatchObject({ status: 'טופל', handledBy: 'קרן' });
    const [prio] = tasksOf(`manual:priority-contact:ours:${CODE}:${ADDRESS}`);
    expect(prio).toMatchObject({ id: r.priorityTaskId, taskType: 'להוסיף איש קשר בפריוריטי', status: 'ממתין', customerCode: CODE, assignedBookkeeperName: 'בודקת', relatedTable: 'CustomerContacts', relatedId: r.contactId });
    // the statement PDF and its reply draft now exist
    expect(w.pdfs).toHaveLength(1);
    const drafts = w.fake.rows('Approvals').filter((a) => a.relatedTable === 'InboundEmails' && a.relatedId === e.id);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe('ממתין');
  });

  it('a second confirm changes nothing and returns the same contact', async () => {
    const e = addEmail();
    await apply({ inboundEmailId: e.id, classification }, ctx);
    const first = await confirmSender({ inboundEmailId: e.id, mode: 'confirm', customerCode: CODE }, ctx);
    const rows = w.fake.rows('CollectionQueue').length;
    const drafts = w.fake.rows('Approvals').length;
    const again = await confirmSender({ inboundEmailId: e.id, mode: 'confirm', customerCode: CODE }, ctx);
    expect(again).toMatchObject({ contactId: first.contactId, contactKey: first.contactKey, priorityTaskId: first.priorityTaskId, rerouted: false });
    expect(w.fake.rows('CustomerContacts').filter((c) => c.email === ADDRESS)).toHaveLength(1);
    expect(w.fake.rows('CollectionQueue')).toHaveLength(rows);
    expect(w.fake.rows('Approvals')).toHaveLength(drafts);
    // a rerun of the routing keeps the decision and stays verified (no new "זה הלקוח?" task)
    await apply({ inboundEmailId: e.id, classification: { ...classification, customerCode: CODE } }, ctx);
    expect(email(e.id)).toMatchObject({ senderVerification: 'מאומת', identifiedBy: 'חתימה' });
    expect(tasksOf(`verify-sender:${e.id}`).filter((t) => t.status === 'ממתין')).toHaveLength(0);
  });

  it('confirm for another customer than suggested; a Priority row of the same address is never changed', async () => {
    const [prioRow] = w.fake.insert('CustomerContacts', [{ contactKey: 'TEST-072-1', customerCode: 'TEST-072', contactName: 'אחר', email: ADDRESS, roleFlags: 'רכש', isApContact: false, source: 'test-fixture' }]);
    const e = addEmail();
    await apply({ inboundEmailId: e.id, classification }, ctx);
    const r = await confirmSender({ inboundEmailId: e.id, mode: 'confirm', customerCode: 'TEST-072', contactName: 'אורלי ש.' }, ctx);
    expect(r.customerCode).toBe('TEST-072');
    const rows = w.fake.rows('CustomerContacts').filter((c) => c.email === ADDRESS);
    expect(rows).toHaveLength(2);
    expect(rows.find((c) => c.id === prioRow.id)).toMatchObject({ contactName: 'אחר', isApContact: false, source: 'test-fixture' });
    expect(rows.find((c) => c.source === 'נוסף אצלנו')).toMatchObject({ customerCode: 'TEST-072', contactName: 'אורלי ש.', isApContact: true });
    expect(email(e.id)).toMatchObject({ customerCode: 'TEST-072', senderVerification: 'מאומת' });
  });

  it('reject: nothing written but the decision; the task is closed (נדחה) and not opened again', async () => {
    const e = addEmail();
    await apply({ inboundEmailId: e.id, classification }, ctx);
    const contactsBefore = w.fake.rows('CustomerContacts').length;
    const r = await confirmSender({ inboundEmailId: e.id, mode: 'reject', note: 'ספק, לא לקוח', decidedBy: 'קרן' }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.mode).toBe('reject');
    expect(w.fake.rows('CustomerContacts')).toHaveLength(contactsBefore);
    const back = email(e.id);
    expect(back.senderVerification).toBe('לא מאומת');
    expect(back.classificationQuotes.senderDecision).toMatchObject({ mode: 'reject', note: 'ספק, לא לקוח' });
    expect(tasksOf(`verify-sender:${e.id}`)[0]).toMatchObject({ status: 'נדחה', resolvedReason: 'השולח אינו איש קשר של לקוח – ספק, לא לקוח' });
    expect(w.fake.rows('CollectionQueue').filter((t) => String(t.taskKey).startsWith('manual:priority-contact'))).toHaveLength(0);
    // a rerun of the routing does not ask again
    await apply({ inboundEmailId: e.id, classification }, ctx);
    expect(tasksOf(`verify-sender:${e.id}`).filter((t) => t.status === 'ממתין')).toHaveLength(0);
    expect(email(e.id).classificationQuotes.senderDecision.mode).toBe('reject');
  });

  it('refuses a confirm without a customer, an unknown customer, or a bad mode', async () => {
    const e = addEmail();
    expect((await confirmSender({ inboundEmailId: e.id, mode: 'confirm' }, ctx)).errors[0]).toContain('חסר קוד לקוח');
    expect((await confirmSender({ inboundEmailId: e.id, mode: 'confirm', customerCode: 'NOPE' }, ctx)).errors[0]).toContain('לא נמצא');
    expect((await confirmSender({ inboundEmailId: e.id, mode: 'maybe' }, ctx)).errors[0]).toContain('mode');
  });
});
