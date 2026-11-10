// Plan 04.11 part C, stage 10: insurer answers linked to the open credit-limit request; documents / price only open a
// manual task; the inbox task is not doubled; isApContact decides verification in the routing.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as apply } from '../code.ts';
import { companyIdsIn, findInsuranceRequest, isInsurerSender } from '../../shared/collections-sender.ts';
import { syncTasks } from '../../shared/collections-task-upsert.ts';

const CODE = 'TEST-081';
const NAME = 'בדיקה – אבן הגליל';
const INSURER = 'credit@bsch.test.example';
let fake: FakeBlocks;

function addEmail(extra: Record<string, unknown>) {
  const [e] = fake.insert('InboundEmails', [
    {
      messageId: `<p-${Math.random().toString(36).slice(2)}@x>`,
      bodyStored: true,
      receivedAt: '2026-10-21T06:00:00.000Z',
      dueAt: '2026-10-22T06:00:00.000Z',
      handlingState: 'לא טופל',
      category: 'אחר',
      categories: 'אחר',
      status: 'בטיפול מאיה',
      isTestFixture: true,
      ...extra,
    },
  ]);
  return e;
}
const email = (id: string) => fake.rows('InboundEmails').find((e) => e.id === id)!;
const tasks = () => fake.rows('CollectionQueue');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-10-21T08:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  fake = new FakeBlocks();
  fake.insert('AgentSettings', [{ settingKey: 'insurerSenders', value: `${INSURER}, @insurer2.test.example`, valueType: 'טקסט' }]);
  fake.insert('Customers', [{ customerCode: CODE, customerName: NAME, source: 'test-fixture' }]);
  fake.insert('CustomerOwners', [{ customerCode: CODE, bookkeeperName: 'בודקת', setAt: '2026-10-01T08:00:00.000Z' }]);
  fake.insert('CustomerContacts', [
    { contactKey: `${CODE}-1`, customerCode: CODE, contactName: 'רות', email: 'ruth@even.test.example', roleFlags: 'הנהלת חשבונות', isApContact: true, source: 'test-fixture' },
    { contactKey: `${CODE}-2`, customerCode: CODE, contactName: 'קובי', email: 'kobi@even.test.example', roleFlags: 'רכש', isApContact: false, source: 'test-fixture' },
  ]);
  fake.insert('Invoices', [
    { customerCode: CODE, invoiceNumber: 'TEST-INV-081-1', documentType: 'חשבונית', dueDate: '2026-10-01', amount: 5000, openAmount: 5000 },
    { customerCode: CODE, invoiceNumber: 'TEST-INV-081-2', documentType: 'חשבונית', dueDate: '2026-10-10', amount: 3000, openAmount: 3000 },
  ]);
  current = fake.client();
});

describe('insurer answers (אישור ביטוח אשראי)', () => {
  it('helpers: insurer addresses / domains, company ids, the open request by ח.פ, customer, or name', () => {
    const settings = new Map([['insurerSenders', `${INSURER}, @insurer2.test.example`]]);
    expect(isInsurerSender(`BSCH <${INSURER.toUpperCase()}>`, settings)).toBe(true);
    expect(isInsurerSender('anyone@insurer2.test.example', settings)).toBe(true);
    expect(isInsurerSender('ruth@even.test.example', settings)).toBe(false);
    expect(companyIdsIn('ח.פ 51-474581-9 וגם 514745819, טלפון 04-8460570')).toEqual(['514745819']);
    const reqs = [
      { id: '1', customerCode: 'A', customerName: 'אבן הגליל', companyId: '511111111', status: 'הוגשה למבטח', submittedAt: '2026-10-01' },
      { id: '2', customerCode: 'B', customerName: 'גשר', companyId: '522222222', status: 'ממתינה להגשה', requestCreatedAt: '2026-10-02' },
      { id: '3', customerCode: 'A', customerName: 'אבן הגליל', companyId: '511111111', status: 'אושרה' },
    ];
    expect(findInsuranceRequest(reqs, { customerCode: null, text: 'אושרה מסגרת לח.פ 522222222' })).toMatchObject({ request: { id: '2' }, matchedBy: 'ח.פ' });
    expect(findInsuranceRequest(reqs, { customerCode: 'A', text: 'אושר' })).toMatchObject({ request: { id: '1' }, matchedBy: 'קוד לקוח' });
    expect(findInsuranceRequest(reqs, { customerCode: null, text: 'בעניין אבן הגליל בע"מ' })).toMatchObject({ request: { id: '1' }, matchedBy: 'שם לקוח' });
    expect(findInsuranceRequest(reqs, { customerCode: 'C', text: 'שום דבר' })).toBeNull();
  });

  it('links the mail to the open request (by ח.פ) – ממתין לאישור סכום, no approval written, no draft, no inbox task', async () => {
    const [req] = fake.insert('CreditLimitRequests', [
      { customerCode: CODE, customerName: NAME, companyId: '514000081', status: 'הוגשה למבטח', requestedLimit: 200000, currentLimit: 100000, isTestFixture: true },
    ]);
    const body = 'שלום קרן,\nאושרה הגדלת מסגרת ללקוח ח.פ 514000081 בסך 150,000 ש"ח.\nבברכה, בסס"ח';
    const e = addEmail({ subject: 'תשובת מבטח', bodyText: body, fromAddress: INSURER, fromName: 'בסס"ח', classificationQuotes: { candidates: [] } });
    const r = await apply(
      {
        inboundEmailId: e.id,
        classification: { types: [{ type: 'אישור ביטוח אשראי', quote: 'אושרה הגדלת מסגרת ללקוח' }], customerCode: null, senderRole: 'אחר', invoices: [], promise: null, dispute: null, summary: 'אישור הגדלה', signature: null },
      },
      {},
    );
    expect(r.errors).toEqual([]);
    expect(r.categories).toEqual(['אישור ביטוח אשראי']);
    const back = email(e.id);
    expect(back).toMatchObject({
      category: 'אישור ביטוח אשראי',
      customerCode: CODE,
      linkedTable: 'CreditLimitRequests',
      linkedId: req.id,
      handlingState: 'ממתין',
      waitingFor: 'ממתין לאישור סכום בבקשת הביטוח',
    });
    expect(back.classificationQuotes.insurance).toMatchObject({ requestId: req.id, matchedBy: 'ח.פ', status: 'הוגשה למבטח', fromInsurerSender: true });
    // no automatic approval
    expect(fake.rows('CreditLimitRequests')[0]).toMatchObject({ status: 'הוגשה למבטח' });
    expect(fake.rows('CreditLimitRequests')[0].approvedAmount).toBeUndefined();
    expect(fake.rows('Approvals')).toHaveLength(0);
    expect(tasks().filter((t) => t.relatedId === e.id && ['ממתין', 'בטיפול'].includes(t.status))).toHaveLength(0);
  });

  it('a mail from an insurer address is an insurance answer even when Maya said אחר; no open request → one manual task (אחר, ביטוח)', async () => {
    const e = addEmail({ subject: 'עדכון', bodyText: 'עדכון לגבי לקוח ח.פ 599999999', fromAddress: 'desk@insurer2.test.example', classificationQuotes: { candidates: [] } });
    const c = { types: [{ type: 'אחר', quote: 'עדכון לגבי לקוח' }], customerCode: null, senderRole: 'אחר', invoices: [], promise: null, dispute: null, summary: 'עדכון מהמבטח', signature: null };
    const r = await apply({ inboundEmailId: e.id, classification: c }, {});
    expect(r.categories).toEqual(['אישור ביטוח אשראי']);
    expect(email(e.id)).toMatchObject({ category: 'אישור ביטוח אשראי', handlingState: 'לא טופל', suggestedCustomerCode: null });
    const manual = tasks().filter((t) => t.taskKey === `manual:insurance-unlinked:${e.id}`);
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ taskType: 'אחר', source: 'ביטוח', status: 'ממתין', relatedTable: 'InboundEmails', relatedId: e.id });
    expect(manual[0].reasons).toContain('ח.פ במייל: 599999999');
    expect(email(e.id).classificationQuotes.manualTasks).toEqual([{ taskKey: `manual:insurance-unlinked:${e.id}`, taskId: manual[0].id, taskType: 'אחר' }]);
    // the manual task is the email's task: no second inbox:<id> task (also on the 06:00 scan)
    await syncTasks(current, { dryRun: false, scope: { emailIds: [e.id] } });
    expect(tasks().filter((t) => t.taskKey === `inbox:${e.id}` && t.status === 'ממתין')).toHaveLength(0);
    // rerun: still one task
    await apply({ inboundEmailId: e.id, classification: c }, {});
    expect(tasks().filter((t) => t.taskKey === `manual:insurance-unlinked:${e.id}`)).toHaveLength(1);
  });
});

describe('documents / price: only a manual task', () => {
  const docsBody = 'שלום, חסרות לנו תעודות משלוח לחשבונית TEST-INV-081-1. תודה, רות';
  const docs = {
    types: [{ type: 'תעודות וחשבוניות חסרות', quote: 'חסרות לנו תעודות משלוח לחשבונית TEST-INV-081-1' }],
    customerCode: CODE,
    senderRole: 'איש קשר של הלקוח',
    invoices: [{ invoiceNumber: 'TEST-INV-081-1', quote: 'לחשבונית TEST-INV-081-1' }],
    promise: null,
    dispute: null,
    summary: 'רות מבקשת תעודות משלוח',
    signature: null,
  };

  it('documents: the manual task with the quote and invoice numbers; no case, no draft, no aging note; stays לא טופל', async () => {
    const e = addEmail({ subject: 'תעודות', bodyText: docsBody, fromAddress: 'ruth@even.test.example', customerCode: CODE, classificationQuotes: { candidates: [{ customerCode: CODE, customerName: NAME, method: 'כתובת השולח' }] } });
    const r = await apply({ inboundEmailId: e.id, classification: docs }, {});
    expect(r.errors).toEqual([]);
    const [t] = tasks().filter((x) => x.taskKey === `manual:docs-manual:${e.id}`);
    expect(t).toMatchObject({
      taskType: 'תעודות / חשבוניות חסרות – טיפול ידני',
      status: 'ממתין',
      customerCode: CODE,
      assignedBookkeeperName: 'בודקת',
      relatedTable: 'InboundEmails',
      relatedId: e.id,
      invoiceNumbers: 'TEST-INV-081-1',
      source: 'פניות',
    });
    expect(t.reasons).toContain('"חסרות לנו תעודות משלוח לחשבונית TEST-INV-081-1"');
    expect(t.reasons).toContain('TEST-INV-081-1 ("לחשבונית TEST-INV-081-1")');
    expect(fake.rows('Disputes')).toHaveLength(0);
    expect(fake.rows('Approvals')).toHaveLength(0);
    expect(fake.rows('CustomerNotes')).toHaveLength(0);
    expect(email(e.id)).toMatchObject({ handlingState: 'לא טופל', senderVerification: 'מאומת', identifiedBy: 'כתובת' });
    expect(email(e.id).classificationQuotes.manualTasks).toHaveLength(1);
    expect(tasks().filter((x) => x.taskKey === `inbox:${e.id}` && x.status === 'ממתין')).toHaveLength(0);
    // rerun keeps one task; a task a person closed is not reopened
    await apply({ inboundEmailId: e.id, classification: docs }, {});
    expect(tasks().filter((x) => x.taskKey === `manual:docs-manual:${e.id}`)).toHaveLength(1);
    t.status = 'טופל';
    await apply({ inboundEmailId: e.id, classification: docs }, {});
    expect(tasks().filter((x) => x.taskKey === `manual:docs-manual:${e.id}`).map((x) => x.status)).toEqual(['טופל']);
  });

  it('price: the זיכוי / הפרש מחיר task; a purchasing contact (not isApContact) is לבדיקה', async () => {
    const body = 'המחיר בחשבונית TEST-INV-081-2 גבוה ממה שסוכם. קובי';
    const e = addEmail({ subject: 'מחיר', bodyText: body, fromAddress: 'kobi@even.test.example', customerCode: CODE, classificationQuotes: { candidates: [{ customerCode: CODE, customerName: NAME, method: 'כתובת השולח' }] } });
    const c = {
      types: [{ type: 'הפרש מחיר', quote: 'המחיר בחשבונית TEST-INV-081-2 גבוה ממה שסוכם' }],
      customerCode: CODE,
      senderRole: null,
      invoices: [{ invoiceNumber: 'TEST-INV-081-2', quote: 'בחשבונית TEST-INV-081-2' }],
      promise: null,
      dispute: null,
      summary: 'טענת מחיר',
      signature: null,
    };
    const r = await apply({ inboundEmailId: e.id, classification: c }, {});
    expect(r.errors).toEqual([]);
    const [t] = tasks().filter((x) => x.taskKey === `manual:price-manual:${e.id}`);
    expect(t).toMatchObject({ taskType: 'זיכוי / הפרש מחיר – טיפול ידני', recommendedAction: 'לטפל במחלוקת', invoiceNumbers: 'TEST-INV-081-2' });
    expect(fake.rows('Disputes')).toHaveLength(0);
    expect(fake.rows('Approvals')).toHaveLength(0);
    expect(email(e.id)).toMatchObject({ handlingState: 'לא טופל', senderVerification: 'לבדיקה', identifiedBy: null });
  });

  it('a mail with a ledger request and documents: the ledger route runs, documents only add the manual task', async () => {
    const body = 'שלום, נא לשלוח כרטסת. בנוסף חסרות תעודות לחשבונית TEST-INV-081-1. רות';
    const e = addEmail({ subject: 'כרטסת ותעודות', bodyText: body, fromAddress: 'unknown@elsewhere.test.example', customerCode: CODE, classificationQuotes: { candidates: [{ customerCode: CODE, customerName: NAME, method: 'שם בתוכן' }] } });
    const c = {
      ...docs,
      types: [
        { type: 'כרטסת', quote: 'נא לשלוח כרטסת' },
        { type: 'תעודות וחשבוניות חסרות', quote: 'חסרות תעודות לחשבונית TEST-INV-081-1' },
      ],
      invoices: [{ invoiceNumber: 'TEST-INV-081-1', quote: 'לחשבונית TEST-INV-081-1' }],
    };
    const r = await apply({ inboundEmailId: e.id, classification: c }, {});
    expect(r.categories).toEqual(['כרטסת', 'תעודות וחשבוניות חסרות']);
    // unknown sender → verify task, no PDF; documents → manual task; the email keeps its own inbox handling
    expect(tasks().filter((x) => x.taskKey === `verify-sender:${e.id}` && x.status === 'ממתין')).toHaveLength(1);
    expect(tasks().filter((x) => x.taskKey === `manual:docs-manual:${e.id}`)).toHaveLength(1);
    expect(fake.rows('Approvals')).toHaveLength(0);
  });
});
