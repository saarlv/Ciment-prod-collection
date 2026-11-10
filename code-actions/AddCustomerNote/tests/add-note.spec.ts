import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as addNote } from '../code.ts';
import { invoke as updateNote } from '../../UpdateCustomerNote/code.ts';

const CODE = 'TEST-071';
const NOW = '2026-11-11T08:00:00.000Z'; // Wednesday 10:00 Israel
let fake: FakeBlocks;
let customerId = '';

const mv = (movementId: string, dueMonth: string, amount: number, docNumber = movementId) => ({ movementId, customerCode: CODE, customerName: 'בדיקה – בטון', docType: 'חשבונית', docNumber, dueMonth, amount, source: 'test-fixture' });
const notes = () => fake.rows('CustomerNotes');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(NOW));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  fake = new FakeBlocks();
  [{ id: customerId }] = fake.insert('Customers', [{ customerCode: CODE, customerName: 'בדיקה – בטון', source: 'test-fixture' }]);
  fake.insert('OpenMovements', [mv('M-1', '2026-09', 4000), mv('M-2', '2026-09', -500), mv('M-3', '2026-10', 6000, 'INV-10')]);
  current = fake.client();
});

describe('AddCustomerNote', () => {
  it('writes one row: customer reference, balanceAtNote from OpenMovements, a commitment starts פתוחה; taskPreview says when the task opens', async () => {
    const r = await addNote({ customerCode: CODE, dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-11', noteText: 'משה, בטלפון' }, {});
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ refused: false, dryRun: false, writeVerified: true });
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toMatchObject({
      customer: Number(customerId),
      customerCode: CODE,
      customerName: 'בדיקה – בטון',
      noteCreatedAt: NOW,
      dueMonth: '2026-09',
      noteType: 'התחייבות לתשלום',
      customTypeLabel: null,
      actionDate: '2026-11-11',
      amount: null,
      balanceAtNote: 3500,
      authorName: 'בודק',
      noteSource: 'צוות',
      status: 'פעילה',
      outcome: 'פתוחה',
      amountReceived: null,
      isTestFixture: true,
    });
    expect(r.taskPreview).toBe('תיפתח משימה "התחייבויות שלא קוימו – ליצור קשר" ב-12.11 אחרי ריצת התקבולים, אם ההתחייבות לא תקוים והחודש לא יתאפס');
    expect(r.taskSync).toBeTruthy();
  });

  it('a card payment opens on the day; a cheque with the agent after agentChequeDays (a Saturday → Sunday); a reminder adds its line; אחר has no outcome', async () => {
    const card = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'תשלום באשראי', actionDate: '2026-11-12', reminderDate: '2026-11-13', amount: 2500, noteSource: 'תמר בכרטיס', authorName: 'דנה' }, {});
    expect(card.taskPreview).toBe('תיפתח משימה "להתקשר לפרטי אשראי" ב-12.11 אם החודש לא יתאפס · תזכורת: תיפתח משימה "תזכורות" ב-15.11 אם החודש לא יתאפס'); // 13.11 is a Friday
    expect(card.note).toMatchObject({ noteSource: 'תמר בכרטיס', authorName: 'דנה', amount: 2500, outcome: null, balanceAtNote: 6000 });
    const cheque = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'צ׳ק אצל סוכן', actionDate: '2026-11-12' }, {});
    expect(cheque.taskPreview).toBe('תיפתח משימה "צ׳ק אצל סוכן – אין קבלה" ב-15.11 אם החודש לא יתאפס');
    const other = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'אחר', customTypeLabel: 'בירור – מחיר', noteText: 'טוענים שהמחיר שגוי' }, {});
    expect(other.note).toMatchObject({ customTypeLabel: 'בירור – מחיר', outcome: null, actionDate: null });
    expect(other.taskPreview).toBe('הערה בלי משימה – נשמרת בהיסטוריה של החודש');
    // a month with no movements has balance 0
    const empty = await addNote({ customerCode: CODE, dueMonth: '2026-12', noteType: 'חזור אליי', actionDate: '2026-11-20' }, {});
    expect(empty.note.balanceAtNote).toBe(0);
  });

  it('refuses (writes nothing): unknown customer, bad month, an active type without a date, אחר without text, a negative amount, an unknown type', async () => {
    const cases: [any, string][] = [
      [{ customerCode: 'NOPE', dueMonth: '2026-09', noteType: 'חזור אליי', actionDate: '2026-11-12' }, 'לקוח NOPE לא נמצא'],
      [{ customerCode: CODE, dueMonth: '09/2026', noteType: 'חזור אליי', actionDate: '2026-11-12' }, 'חודש הפירעון חייב להיות בפורמט YYYY-MM'],
      [{ customerCode: CODE, dueMonth: '2026-09', noteType: 'תשלום באשראי' }, 'בהערה מסוג "תשלום באשראי" חובה לבחור תאריך'],
      [{ customerCode: CODE, dueMonth: '2026-09', noteType: 'אחר', customTypeLabel: 'כללי' }, 'בהערה מסוג "אחר" חובה לכתוב תוכן'],
      [{ customerCode: CODE, dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-12', amount: -5 }, 'הסכום לא יכול להיות שלילי'],
      [{ customerCode: CODE, dueMonth: '2026-09', noteType: 'הבטחת תשלום', actionDate: '2026-11-12' }, 'סוג הערה לא מוכר'],
      [{ customerCode: CODE, dueMonth: '2026-09', noteType: 'חזור אליי', actionDate: '12.11.2026' }, 'התאריך אינו תאריך תקין'],
    ];
    for (const [input, msg] of cases) {
      const r = await addNote(input, {});
      expect(r.refused).toBe(true);
      expect(String(r.refusalReason)).toContain(msg);
      expect(r.note).toBeNull();
    }
    expect(notes()).toEqual([]);
  });

  it('dryRun reports the planned row and writes nothing', async () => {
    const mark = fake.calls.length;
    const r = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'חזור אליי', actionDate: '2026-11-12', dryRun: true }, {});
    expect(r).toMatchObject({ dryRun: true, writeVerified: false, note: { dueMonth: '2026-10', balanceAtNote: 6000, status: 'פעילה' } });
    expect(fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method))).toEqual([]);
  });
});

describe('AddCustomerNote – approving Maya’s promise from an email', () => {
  let emailId = '';
  beforeEach(() => {
    const [e] = fake.insert('InboundEmails', [
      {
        subject: 'תשלום',
        bodyText: 'נעביר 6,000 עד 20.11 עבור INV-10',
        customerCode: CODE,
        messageId: '<p@x>',
        receivedAt: '2026-11-10T06:00:00.000Z',
        handlingState: 'לא טופל',
        waitingFor: 'ממתין לאישור הבטחה',
        classificationQuotes: { promise: { amount: 6000, date: '2026-11-20', quote: 'נעביר 6,000 עד 20.11', verified: true, invoiceNumbers: ['INV-10'], status: 'ממתינה לאישור' } },
        isTestFixture: true,
      },
    ]);
    emailId = e.id;
  });

  it('one commitment (מאיה ממייל), month = the quoted invoice’s due month; the proposal אושרה with approvedNoteId, the email טופל; a second approval is refused', async () => {
    const r = await addNote({ customerCode: CODE, noteType: 'התחייבות לתשלום', sourceEmailId: emailId, authorName: 'רותי' }, {});
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toMatchObject({ dueMonth: '2026-10', noteSource: 'מאיה ממייל', sourceEmailId: emailId, amount: 6000, actionDate: '2026-11-20', outcome: 'פתוחה', authorName: 'רותי' });
    expect(String(notes()[0].noteText)).toContain('חשבוניות: INV-10');
    const e = fake.rows('InboundEmails')[0];
    expect(e).toMatchObject({ handlingState: 'טופל', handledBy: 'רותי', waitingFor: null });
    expect(e.classificationQuotes.promise).toMatchObject({ status: 'אושרה', approvedNoteId: notes()[0].id, approvedPromiseId: notes()[0].id, approvedBy: 'רותי' });

    const again = await addNote({ customerCode: CODE, noteType: 'התחייבות לתשלום', sourceEmailId: emailId }, {});
    expect(again).toMatchObject({ refused: true, refusalReason: 'ההבטחה מהמייל הזה כבר אושרה', existingNoteId: notes()[0].id, note: null });
    expect(notes()).toHaveLength(1);
  });

  it('a second approval is refused also when the proposal was not marked (a commitment from this email exists)', async () => {
    fake.insert('CustomerNotes', [{ customerCode: CODE, noteType: 'התחייבות לתשלום', sourceEmailId: emailId, status: 'פעילה', dueMonth: '2026-10' }]);
    const r = await addNote({ customerCode: CODE, noteType: 'התחייבות לתשלום', sourceEmailId: emailId }, {});
    expect(r).toMatchObject({ refused: true, refusalReason: 'ההבטחה מהמייל הזה כבר אושרה' });
    expect(notes()).toHaveLength(1);
  });

  it('no quoted invoice found → the customer’s oldest open month; only a commitment can be approved from an email', async () => {
    const q = fake.rows('InboundEmails')[0].classificationQuotes;
    q.promise.invoiceNumbers = ['UNKNOWN-1'];
    const r = await addNote({ customerCode: CODE, sourceEmailId: emailId, noteType: 'התחייבות לתשלום' }, {});
    expect(r.note.dueMonth).toBe('2026-09');
    fake.tables.set('CustomerNotes', []);
    fake.rows('InboundEmails')[0].classificationQuotes = { promise: { ...q.promise, status: 'ממתינה לאישור' } };
    const wrong = await addNote({ customerCode: CODE, sourceEmailId: emailId, noteType: 'חזור אליי', actionDate: '2026-11-12' }, {});
    expect(wrong.refused).toBe(true);
    expect(String(wrong.refusalReason)).toContain('מהמייל אפשר לאשר רק הערה מסוג "התחייבות לתשלום"');
  });
});

describe('UpdateCustomerNote', () => {
  const add = async (extra: any = {}) => (await addNote({ customerCode: CODE, dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-05', amount: 3000, ...extra }, {})).note;

  it('a new date on a checked commitment resets it (outcome פתוחה, received / remaining / checkedAt cleared); a new month re-reads balanceAtNote', async () => {
    const n = await add();
    Object.assign(fake.rows('CustomerNotes')[0], { outcome: 'לא קוימה', amountReceived: 0, amountRemaining: 3000, checkedAt: NOW });
    const r = await updateNote({ noteId: n.id, actionDate: '2026-11-15' }, {});
    expect(r.errors).toEqual([]);
    expect(r.changed.sort()).toEqual(['actionDate', 'amountReceived', 'amountRemaining', 'checkedAt', 'outcome']);
    expect(notes()[0]).toMatchObject({ actionDate: '2026-11-15', outcome: 'פתוחה', amountReceived: null, amountRemaining: null, checkedAt: null });
    const m = await updateNote({ noteId: n.id, dueMonth: '2026-10' }, {});
    expect(m.changed).toContain('balanceAtNote');
    expect(notes()[0]).toMatchObject({ dueMonth: '2026-10', balanceAtNote: 6000 });
    expect(m.writeVerified).toBe(true);
  });

  it('keeps the rules: an active type keeps its date, customTypeLabel only on אחר, never a negative amount', async () => {
    const n = await add();
    expect((await updateNote({ noteId: n.id, actionDate: '' }, {})).errors[0]).toContain('חובה לבחור תאריך');
    expect((await updateNote({ noteId: n.id, customTypeLabel: 'x' }, {})).errors[0]).toContain('רק בהערה מסוג "אחר"');
    expect((await updateNote({ noteId: n.id, amount: -1 }, {})).errors[0]).toContain('שלילי');
    expect(notes()[0]).toMatchObject({ actionDate: '2026-11-05', amount: 3000 });
    // reminderDate '' clears it
    await updateNote({ noteId: n.id, reminderDate: '2026-11-20' }, {});
    expect(notes()[0].reminderDate).toBe('2026-11-20');
    await updateNote({ noteId: n.id, reminderDate: '' }, {});
    expect(notes()[0].reminderDate).toBeNull();
  });

  it('close → נסגרה ידנית; closing again is reported; reopen → פעילה; a note closed by a month at 0 is never reopened', async () => {
    const n = await add();
    const c = await updateNote({ noteId: n.id, close: true }, {});
    expect(notes()[0]).toMatchObject({ status: 'נסגרה ידנית', closedAt: NOW });
    expect(c.changed.sort()).toEqual(['closedAt', 'status']);
    expect((await updateNote({ noteId: n.id, close: true }, {})).notice).toContain('כבר סגורה');
    await updateNote({ noteId: n.id, reopen: true }, {});
    expect(notes()[0]).toMatchObject({ status: 'פעילה', closedAt: null });
    notes()[0].status = 'נסגרה – החודש התאפס';
    const r = await updateNote({ noteId: n.id, reopen: true }, {});
    expect(r.notice).toContain('לא נפתחת מחדש');
    expect(notes()[0].status).toBe('נסגרה – החודש התאפס');
    expect((await updateNote({ noteId: 'missing' }, {})).errors[0]).toContain('לא נמצאה');
  });
});

describe('a note written after its phase already ran today joins today’s grouped task right away', () => {
  const T = '2026-11-11';
  const morningRan = () => fake.insert('ImportBatches', [{ kind: 'משיכת בוקר – Priority', runPhase: '06:00', dataDate: T, status: 'נכתב' }]);
  const bankRan = (bankLoaded = true) =>
    fake.insert('ImportBatches', [{ kind: 'בדיקת דף בנק', runPhase: '09:00', dataDate: T, status: 'נכתב', bankLoaded, runSummary: [{ step: 'CheckCommitments', ok: true }] }]);
  const grouped = (prefix = 'notes:') => fake.rows('CollectionQueue').filter((t) => String(t.taskKey).startsWith(prefix));

  it('a 06:00 type written at 10:00 with today’s date joins today’s task (and a reminder for today too); the same note is never added twice', async () => {
    morningRan();
    const r = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'חזור אליי', actionDate: T, reminderDate: T }, {});
    expect(r.errors).toEqual([]);
    expect(r.taskSync).toMatchObject({ joinedToday: true, created: 2 });
    expect(grouped().map((t) => t.taskKey).sort()).toEqual([`notes:callBack:${T}:ללא`, `notes:reminder:${T}:ללא`]);
    expect(grouped(`notes:callBack:`)[0].itemsJson[0]).toMatchObject({ customerCode: CODE, dueMonth: '2026-10', noteIds: [r.note.id] });
    // a second note of the same customer + month joins the same row of the same task
    const r2 = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'חזור אליי', actionDate: '2026-11-10' }, {});
    expect(r2.taskSync).toMatchObject({ created: 0, refreshed: 1 });
    expect(grouped(`notes:callBack:`)).toHaveLength(1);
    expect(grouped(`notes:callBack:`)[0].itemsJson[0].noteIds).toHaveLength(2);
    // a future date waits for its day
    await addNote({ customerCode: CODE, dueMonth: '2026-09', noteType: 'תשלום באשראי', actionDate: '2026-11-12' }, {});
    expect(grouped('notes:creditCard:')).toEqual([]);
  });

  it('written before the 06:00 run: the writer adds nothing – the 06:00 run picks it up', async () => {
    const { syncNoteTasks } = await import('../../shared/collections-note-tasks.ts');
    const r = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'חזור אליי', actionDate: T }, {});
    expect(r.taskSync).toMatchObject({ joinedToday: false, created: 0 });
    expect(grouped()).toEqual([]);
    await syncNoteTasks(fake.client(), { asOfDate: T, dryRun: false, phase: '06:00' });
    expect(grouped().map((t) => t.taskKey)).toEqual([`notes:callBack:${T}:ללא`]);
  });

  it('a commitment written before the bank statement loaded is not added; after the bank check it is checked first and then joins', async () => {
    morningRan();
    const before = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'התחייבות לתשלום', actionDate: '2026-11-09', amount: 5000 }, {});
    expect(before.taskSync).toMatchObject({ phasesRanToday: { morning: true, bank: false } });
    expect(notes()[0].outcome).toBe('פתוחה');
    expect(grouped()).toEqual([]);
    // a bank check that did not find the statement does not count
    bankRan(false);
    await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'התחייבות לתשלום', actionDate: '2026-11-09', amount: 5000 }, {});
    expect(grouped()).toEqual([]);
    bankRan(true);
    const after = await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'התחייבות לתשלום', actionDate: '2026-11-09', amount: 5000 }, {});
    expect(after.taskSync).toMatchObject({ phasesRanToday: { morning: true, bank: true }, checkCommitments: { checked: 1, notKept: 1 } });
    expect(notes().find((n) => n.id === after.note.id)).toMatchObject({ outcome: 'לא קוימה', amountRemaining: 5000 });
    const p = grouped('notes:promise:');
    expect(p.map((t) => t.taskKey)).toEqual([`notes:promise:${T}:ללא`]);
    expect(p[0].itemsJson[0].noteIds).toEqual([after.note.id]);
  });

  it('UpdateCustomerNote: moving a note’s date to today after the 06:00 run joins today’s task', async () => {
    const n = (await addNote({ customerCode: CODE, dueMonth: '2026-10', noteType: 'תשלום באשראי', actionDate: '2026-11-20' }, {})).note;
    morningRan();
    const r = await updateNote({ noteId: n.id, actionDate: T }, {});
    expect(r.taskSync).toMatchObject({ joinedToday: true, created: 1 });
    expect(grouped().map((t) => t.taskKey)).toEqual([`notes:creditCard:${T}:ללא`]);
  });
});
