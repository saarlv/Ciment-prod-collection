import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as apply } from '../code.ts';
import { syncTasks } from '../../shared/collections-task-upsert.ts';
import { invoke as addNote } from '../../AddCustomerNote/code.ts';

const CODE = 'TEST-061';
let fake: FakeBlocks;

const inv = (invoiceNumber: string, dueDate: string, openAmount: number) => ({
  customerCode: CODE,
  invoiceNumber,
  documentType: 'חשבונית',
  dueDate,
  amount: openAmount,
  openAmount,
  syncedAt: '2026-10-21T04:00:00.000Z',
});

function addEmail(body: string, extra: Record<string, unknown> = {}) {
  const [e] = fake.insert('InboundEmails', [
    {
      subject: 'בעניין התשלום',
      bodyText: body,
      bodyStored: true,
      fromAddress: 'moshe@tiach.co.il',
      fromName: 'משה לוי',
      customerCode: CODE,
      customerName: 'בדיקה – טיח',
      messageId: `<m-${Math.random().toString(36).slice(2)}@x>`,
      receivedAt: '2026-10-21T06:00:00.000Z',
      handlingState: 'לא טופל',
      status: 'חדש',
      classificationQuotes: { candidates: [{ customerCode: CODE, customerName: 'בדיקה – טיח', method: 'כתובת' }] },
      isTestFixture: true,
      ...extra,
    },
  ]);
  return e;
}

const email = (id: string) => fake.rows('InboundEmails').find((e) => e.id === id)!;
const inboxTask = (id: string) => fake.rows('CollectionQueue').find((t) => t.taskKey === `inbox:${id}`);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-10-21T08:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  fake = new FakeBlocks();
  fake.insert('Customers', [{ customerCode: CODE, customerName: 'בדיקה – טיח', source: 'test-fixture' }]);
  fake.insert('CustomerOwners', [{ customerCode: CODE, bookkeeperName: 'בודקת', setAt: '2026-10-01T08:00:00.000Z' }]);
  fake.insert('Invoices', [inv('P-1', '2026-09-15', 4000), inv('P-2', '2026-10-10', 6000), inv('P-3', '2026-10-20', 3000)]);
  current = fake.client();
});

describe('ApplyMailClassification – a payment promise is only a proposal', () => {
  const body = 'שלום, נעביר 10,000 ש"ח עד 30.10.2026 בהעברה עבור חשבוניות P-1 ו-P-2. תודה, משה';
  const classification = {
    types: [{ type: 'הבטחת תשלום', quote: 'נעביר 10,000 ש"ח עד 30.10.2026' }],
    customerCode: CODE,
    senderRole: null,
    invoices: [{ invoiceNumber: 'P-1', quote: 'חשבוניות P-1 ו-P-2' }],
    promise: { amount: 10000, date: '2026-10-30', method: 'העברה בנקאית', quote: 'נעביר 10,000 ש"ח עד 30.10.2026', invoiceNumbers: ['P-1', 'P-2', 'P-9'] },
    summary: 'הלקוח מבטיח להעביר 10,000 ש"ח עד 30.10',
    dispute: null,
  };

  it('stores the proposal, records no promise, writes no draft; the email stays לא טופל and its task asks for approval', async () => {
    const e = addEmail(body);
    const r = await apply({ inboundEmailId: e.id, classification: JSON.stringify(classification) }, {});
    expect(r.errors).toEqual([]);
    expect(r.handlingState).toBe('לא טופל');
    expect(r.waitingFor).toBe('ממתין לאישור הבטחה');

    const row = email(e.id);
    expect(row.classificationQuotes.promise).toEqual({
      amount: 10000,
      date: '2026-10-30',
      method: 'העברה בנקאית',
      quote: 'נעביר 10,000 ש"ח עד 30.10.2026',
      verified: true,
      invoiceNumbers: ['P-1', 'P-2'], // P-9 is not in the mail → rejected
      status: 'ממתינה לאישור',
    });
    expect(row.classificationQuotes.rejected.some((x: any) => x.field === 'promise' && x.value === 'P-9')).toBe(true);
    expect(row).toMatchObject({ handlingState: 'לא טופל', waitingFor: 'ממתין לאישור הבטחה' });
    // nothing is recorded before a person approves: no customer note
    expect(fake.rows('CustomerNotes')).toHaveLength(0);
    expect(fake.rows('Approvals')).toHaveLength(0);

    const task = inboxTask(e.id)!;
    expect(task).toBeDefined();
    expect(task.status).toBe('ממתין');
    expect(String(task.title).startsWith('לאשר הבטחה מהמייל – ')).toBe(true);
    expect(String(task.reasons)).toContain('מאיה מצאה הבטחת תשלום');

    // a rerun keeps one proposal and still no promise
    const again = await apply({ inboundEmailId: e.id, classification }, {});
    expect(again.errors).toEqual([]);
    expect(fake.rows('CustomerNotes')).toHaveLength(0);
    expect(fake.rows('CollectionQueue').filter((t) => t.taskKey === `inbox:${e.id}`)).toHaveLength(1);
  });

  it('"אשר הבטחה" (AddCustomerNote with sourceEmailId): one התחייבות לתשלום note on the oldest month of the quoted invoices; the email is handled; a second approval writes nothing', async () => {
    const e = addEmail(body);
    await apply({ inboundEmailId: e.id, classification }, {});
    const ok = await addNote({ customerCode: CODE, noteType: 'התחייבות לתשלום', sourceEmailId: e.id, authorName: 'בודקת' }, {});
    expect(ok.errors).toEqual([]);
    expect(ok.refused).toBe(false);
    expect(ok.writeVerified).toBe(true);
    const notes = fake.rows('CustomerNotes');
    expect(notes).toHaveLength(1);
    // P-1 (due 15.09) and P-2 (due 10.10) were quoted: the oldest due month
    expect(notes[0]).toMatchObject({ customerCode: CODE, dueMonth: '2026-09', noteType: 'התחייבות לתשלום', amount: 10000, actionDate: '2026-10-30', noteSource: 'מאיה ממייל', sourceEmailId: e.id, outcome: 'פתוחה', status: 'פעילה' });
    expect(String(notes[0].noteText)).toContain('P-1, P-2');
    expect(email(e.id)).toMatchObject({ handlingState: 'טופל', handledBy: 'בודקת' });
    expect(email(e.id).classificationQuotes.promise).toMatchObject({ status: 'אושרה', approvedNoteId: notes[0].id });
    expect(inboxTask(e.id)?.status ?? 'none').not.toBe('ממתין');
    const again = await addNote({ customerCode: CODE, noteType: 'התחייבות לתשלום', sourceEmailId: e.id }, {});
    expect(again).toMatchObject({ refused: true, existingNoteId: notes[0].id });
    expect(fake.rows('CustomerNotes')).toHaveLength(1);
  });

  it('a promise whose amount is not in the quote is rejected – no proposal, plain inbox task', async () => {
    const e = addEmail(body);
    const r = await apply({ inboundEmailId: e.id, classification: { ...classification, promise: { ...classification.promise, amount: 12000 } } }, {});
    expect(r.errors).toEqual([]);
    expect(email(e.id).classificationQuotes.promise).toBeUndefined();
    expect(email(e.id).classificationQuotes.rejected.some((x: any) => x.field === 'promise')).toBe(true);
    expect(email(e.id).waitingFor ?? null).toBeNull();
    expect(String(inboxTask(e.id)!.title).startsWith('מייל לטיפול – ')).toBe(true);
  });

  it('a pending proposal keeps the inbox task even when the email is ממתין; an approved one does not', async () => {
    const pending = addEmail(body, {
      handlingState: 'ממתין',
      waitingFor: 'ממתין להתאמת התקבול',
      category: 'הבטחת תשלום',
      classificationQuotes: { promise: { amount: 500, date: '2026-10-30', status: 'ממתינה לאישור', invoiceNumbers: ['P-1'] } },
    });
    const approved = addEmail(body, {
      handlingState: 'ממתין',
      category: 'הבטחת תשלום',
      classificationQuotes: { promise: { amount: 500, date: '2026-10-30', status: 'אושרה', approvedPromiseId: '77', invoiceNumbers: ['P-1'] } },
    });
    await syncTasks(fake.client(), { dryRun: false, scope: { emailIds: [pending.id, approved.id] } });
    expect(inboxTask(pending.id)).toMatchObject({ status: 'ממתין', taskType: 'מייל לטיפול' });
    expect(String(inboxTask(pending.id)!.title)).toMatch(/^לאשר הבטחה מהמייל – משה לוי: /);
    expect(inboxTask(approved.id)).toBeUndefined();
  });
});

describe('ApplyMailClassification – a conditional payment is a dispute, never a promise', () => {
  const body = 'נשלם 3,000 ש"ח עד 05.11.2026 עבור חשבונית P-3, רק אחרי שתתקנו את המחיר בחשבונית. משה';
  const classification = {
    types: [{ type: 'הבטחת תשלום', quote: 'נשלם 3,000 ש"ח עד 05.11.2026' }],
    customerCode: CODE,
    senderRole: null,
    invoices: [{ invoiceNumber: 'P-3', quote: 'עבור חשבונית P-3' }],
    promise: { amount: 3000, date: '2026-11-05', method: null, quote: 'נשלם 3,000 ש"ח עד 05.11.2026', invoiceNumbers: ['P-3'] },
    summary: 'הלקוח ישלם רק אחרי תיקון המחיר',
    dispute: { reason: 'מחיר', invoiceNumbers: ['P-3'], quote: 'רק אחרי שתתקנו את המחיר בחשבונית' },
  };

  it('writes one CustomerNotes אחר note "בירור – <reason>" per due month of the quoted invoices, no promise and no proposal; idempotent on rerun', async () => {
    const e = addEmail(body);
    const r = await apply({ inboundEmailId: e.id, classification }, {});
    expect(r.errors).toEqual([]);

    const notes = fake.rows('CustomerNotes');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      customerCode: CODE,
      dueMonth: '2026-10',
      noteType: 'אחר',
      customTypeLabel: 'בירור – מחיר',
      noteSource: 'מאיה ממייל',
      sourceEmailId: e.id,
      authorName: 'מאיה',
      status: 'פעילה',
      outcome: null,
    });
    expect(String(notes[0].noteText)).toContain('רק אחרי שתתקנו את המחיר בחשבונית');
    expect(String(notes[0].noteText)).toContain('P-3');
    expect(r.customerNotes).toEqual([notes[0].id]);

    const q = email(e.id).classificationQuotes;
    expect(q.dispute).toEqual({ reason: 'מחיר', quote: 'רק אחרי שתתקנו את המחיר בחשבונית', verified: true, invoiceNumbers: ['P-3'], noteIds: [notes[0].id] });
    expect(q.promise).toBeUndefined();
    expect(fake.rows('CustomerNotes').filter((n) => n.noteType === 'התחייבות לתשלום')).toHaveLength(0);
    expect(email(e.id).handlingState).toBe('לא טופל');
    expect(email(e.id).waitingFor ?? null).toBeNull();

    const again = await apply({ inboundEmailId: e.id, classification }, {});
    expect(again.errors).toEqual([]);
    expect(fake.rows('CustomerNotes')).toHaveLength(1);
    expect(email(e.id).classificationQuotes.dispute.noteIds).toEqual([notes[0].id]);
    expect(fake.rows('CustomerNotes').filter((n) => n.noteType === 'התחייבות לתשלום')).toHaveLength(0);
  });

  it('the dispute takes only its own invoices out of the proposal', async () => {
    const e = addEmail('נעביר 10,000 ש"ח עד 30.10.2026 עבור P-1 ו-P-2. את P-3 נשלם רק אחרי שתתקנו את המחיר');
    const r = await apply(
      {
        inboundEmailId: e.id,
        classification: {
          ...classification,
          types: [{ type: 'הבטחת תשלום', quote: 'נעביר 10,000 ש"ח עד 30.10.2026' }],
          promise: { amount: 10000, date: '2026-10-30', method: null, quote: 'נעביר 10,000 ש"ח עד 30.10.2026', invoiceNumbers: ['P-1', 'P-2', 'P-3'] },
          dispute: { reason: 'מחיר', invoiceNumbers: ['P-3'], quote: 'את P-3 נשלם רק אחרי שתתקנו את המחיר' },
        },
      },
      {},
    );
    expect(r.errors).toEqual([]);
    const q = email(e.id).classificationQuotes;
    expect(q.promise).toMatchObject({ invoiceNumbers: ['P-1', 'P-2'], status: 'ממתינה לאישור' });
    expect(q.dispute.invoiceNumbers).toEqual(['P-3']);
    expect(fake.rows('CustomerNotes').map((n) => [n.dueMonth, n.customTypeLabel])).toEqual([['2026-10', 'בירור – מחיר']]);
    expect(email(e.id).waitingFor).toBe('ממתין לאישור הבטחה');
  });
});
