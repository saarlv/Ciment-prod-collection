import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as weekBrief } from '../code.ts';

const ctx: any = {};
const TUE = '2026-10-27'; // week 25.10 (Sun) – 31.10 (Sat)
const C1 = 'TEST-101';
const C2 = 'TEST-102';
const C3 = 'TEST-103';
let fake: FakeBlocks;

const inv = (customerCode: string, invoiceNumber: string, openAmount: number, dueDate: string, extra: any = {}) => ({
  customerCode,
  invoiceNumber,
  documentType: 'חשבונית',
  amount: openAmount,
  openAmount,
  dueDate,
  status: 'פתוחה',
  source: 'test-fixture',
  syncedAt: '2026-10-27T03:00:00.000Z',
  ...extra,
});

beforeEach(() => {
  fake = new FakeBlocks();
  fake.insert('Customers', [
    { customerCode: C1, customerName: 'בדיקה – אלף', assignedBookkeeperName: 'דנה', source: 'test-fixture' },
    { customerCode: C2, customerName: 'בדיקה – בית', assignedBookkeeperName: 'רינה', source: 'test-fixture' },
    { customerCode: C3, customerName: 'בדיקה – גימל', assignedBookkeeperName: 'רינה', source: 'test-fixture' },
  ]);
  // CustomerOwners override: C2 belongs to דנה
  fake.insert('CustomerOwners', [{ customerCode: C2, bookkeeperName: 'דנה', setAt: '2026-10-01T08:00:00.000Z', isTestFixture: true }]);
  fake.insert('Invoices', [
    inv(C1, 'I-1', 5000, '2026-10-27'),
    inv(C1, 'I-2', 3000, '2026-10-27'),
    inv(C1, 'I-3', 2000, '2026-10-29'), // paid by an approved match → not due any more
    inv(C1, 'I-4', 1000, '2026-10-31'), // Saturday, last day of the week
    inv(C1, 'I-5', 4000, '2026-10-24'), // Saturday before the week → overdue
    inv(C1, 'I-6', 1500, '2026-11-01'), // next Sunday
    inv(C2, 'J-1', 9360, '2026-10-26'),
    inv(C2, 'J-2', 6000, '2026-09-30'),
    inv(C3, 'K-1', 7000, '2026-10-10'),
  ]);
  fake.insert('MatchProposals', [
    {
      bankLineId: 'TEST-BL-X-1',
      customerCode: C1,
      status: 'אושרה – לביצוע ב-Priority',
      decidedAt: '2026-10-26T09:00:00.000Z',
      invoiceNumbers: 'I-3',
      allocations: { lines: [{ invoiceNumber: 'I-3', amount: 2000 }] },
      isTestFixture: true,
    },
  ]);
  // CustomerNotes (one customer + one due month): commitments with their outcome, a בירור note, a call-back
  const cn = (customerCode: string, fields: any) => ({ customerCode, customerName: customerCode === C3 ? 'בדיקה – גימל' : 'בדיקה – בית', status: 'פעילה', isTestFixture: true, ...fields });
  fake.insert('CustomerNotes', [
    cn(C3, { dueMonth: '2026-10', noteType: 'התחייבות לתשלום', amount: 7000, actionDate: '2026-10-15', outcome: 'לא קוימה', amountReceived: 0, noteText: 'יעביר 7,000', authorName: 'רינה', noteCreatedAt: '2026-10-08T08:00:00.000Z' }),
    cn(C3, { dueMonth: '2026-10', noteType: 'התחייבות לתשלום', amount: 3000, actionDate: '2026-10-28', outcome: 'קוימה', amountReceived: 3000, noteText: 'יעביר 3,000 ב-28.10', authorName: 'רינה', noteCreatedAt: '2026-10-19T08:00:00.000Z' }),
    cn(C3, { dueMonth: '2026-10', noteType: 'התחייבות לתשלום', amount: 500, actionDate: '2026-10-05', outcome: 'לא קוימה', noteText: 'ישן', authorName: 'רינה', noteCreatedAt: '2026-10-01T08:00:00.000Z' }), // not kept too long ago
    cn(C3, { dueMonth: '2026-10', noteType: 'אחר', customTypeLabel: 'בירור – מחיר', noteText: 'בבירור – מחלוקת: מחיר', actionDate: '2026-10-28', amount: 7000, authorName: 'רינה', noteCreatedAt: '2026-10-20T08:00:00.000Z' }),
    cn(C2, { dueMonth: '2026-10', noteType: 'חזור אליי', noteText: 'ביקש שנחזור אליו אחרי בדיקה', actionDate: '2026-10-26', authorName: 'דנה', noteCreatedAt: '2026-10-10T08:00:00.000Z' }),
  ]);
  // receipts: Tuesday's bank file + an older one
  const [b1] = fake.insert('ImportBatches', [
    { kind: 'קובץ בנק', fileName: 'bank-27.pdf', workDay: '2026-10-27', uploadedAt: '2026-10-27T06:00:00.000Z', extractionStatus: 'אומת', checkStatus: 'בבדיקה', isTestFixture: true },
    { kind: 'קובץ בנק', fileName: 'bank-26.pdf', workDay: '2026-10-26', uploadedAt: '2026-10-26T06:00:00.000Z', extractionStatus: 'אומת', checkStatus: 'הושלמה', isTestFixture: true },
    { kind: 'דוח גיול', fileName: 'aging.xlsx', workDay: '2026-10-27', uploadedAt: '2026-10-27T06:00:00.000Z', isTestFixture: true },
  ]);
  const line = (n: number, amount: number, extra: any) => ({ bankLineId: `TEST-BL-${b1.id}-${n}`, importBatchId: b1.id, amount, lineType: 'העברה', source: 'test-fixture', ...extra });
  fake.insert('BankLines', [
    line(1, 5000, { status: 'חדשה', checkStage: 'אושרה', customerCode: C1 }),
    line(2, 3000, { status: 'חדשה', checkStage: 'ממתינה לאישור' }),
    line(3, 2000, { status: 'לא מזוהה', checkStage: 'לא מזוהה' }),
    line(4, -1000, { lineType: 'צ׳ק חוזר', status: 'חדשה', checkStage: null }),
    line(5, 1500, { status: 'חדשה', checkStage: 'ממתינה לבדיקה' }),
  ]);
  fake.insert('MatchProposals', [{ bankLineId: `TEST-BL-${b1.id}-2`, importBatchId: b1.id, customerCode: C3, status: 'מוצעת', proposedAt: '2026-10-27T07:00:00.000Z', isTestFixture: true }]);
  current = fake.client();
});

describe('GetWeekBrief – the aging week', () => {
  it('items: due (one per customer per date, paid-seen excluded), commitments, בירור notes, not-kept carry-over; sorted by date then amount', async () => {
    const r = await weekBrief({ asOfDate: TUE }, ctx);
    expect(r.week).toMatchObject({ start: '2026-10-25', end: '2026-10-31', label: '25.10–31.10' });
    expect(r.aging.items.map((i: any) => [i.date, i.kind, i.customerCode, i.invoiceNumbers.join(','), i.amount, i.status])).toEqual([
      ['2026-10-26', 'פירעון', C2, 'J-1', 9360, 'יש הערה'],
      ['2026-10-27', 'פירעון', C1, 'I-1,I-2', 8000, 'פתוחה'],
      ['2026-10-28', 'בירור', C3, 'K-1', 7000, 'לבדיקה חוזרת'],
      ['2026-10-28', 'הבטחת תשלום', C3, '', 3000, 'קוימה'],
      ['2026-10-31', 'פירעון', C1, 'I-4', 1000, 'פתוחה'],
      [null, 'הבטחה שהופרה', C3, '', 7000, 'לא קוימה'],
    ]);
    // the due item shows the newest active note of the customer's due month
    const due = r.aging.items.find((i: any) => i.kind === 'פירעון' && i.customerCode === C2);
    expect(due).toMatchObject({ id: `due|${C2}|2026-10-26`, noteType: 'חזור אליי', noteText: 'ביקש שנחזור אליו אחרי בדיקה', bookkeeperName: 'דנה' });
    const promise = r.aging.items.find((i: any) => i.kind === 'הבטחת תשלום');
    expect(promise).toMatchObject({ noteText: 'יעביר 3,000 ב-28.10', noteType: 'התחייבות לתשלום', bookkeeperName: 'רינה' });
    expect(promise.promiseId).toBeTruthy();
    expect(promise.noteId).toBe(promise.promiseId);
    expect(r.aging.items.find((i: any) => i.kind === 'בירור')).toMatchObject({ noteType: 'בירור – מחיר', noteText: 'בבירור – מחלוקת: מחיר' });
    // the old "claimed paid" note type is gone: no such item
    expect(r.aging.items.some((i: any) => i.kind === 'שולם לטענת הלקוח')).toBe(false);
    // stable ids
    const again = await weekBrief({ asOfDate: TUE }, ctx);
    expect(again.aging.items.map((i: any) => i.id)).toEqual(r.aging.items.map((i: any) => i.id));
  });

  it('days, KPIs, overdue without a note and the Hebrew conclusions', async () => {
    const r = await weekBrief({ asOfDate: TUE }, ctx);
    expect(r.week.days.map((d: any) => [d.weekday, d.isToday, d.isPast, d.itemCount, d.amount])).toEqual([
      ['א׳', false, true, 0, 0],
      ['ב׳', false, true, 1, 9360],
      ['ג׳', true, false, 1, 8000],
      ['ד׳', false, false, 2, 3000],
      ['ה׳', false, false, 0, 0],
      ['ו׳', false, false, 0, 0],
      ['ש׳', false, false, 1, 1000],
    ]);
    expect(r.aging.kpis).toEqual({
      dueThisWeekAmount: 18360,
      dueThisWeekCount: 4,
      dueThisWeekCustomers: 2,
      promisedThisWeekAmount: 3000,
      promisedThisWeekCount: 1,
      promisesSeenAmount: 3000,
      brokenPromisesCount: 1,
      claimedPaidOpenAmount: 0,
      claimedPaidOpenCount: 0,
      disputesFollowUpCount: 1,
      overdueTotal: 26360, // I-5 4,000 + J-1 9,360 + J-2 6,000 + K-1 7,000 (I-3 is paid-seen)
      overdueNoNoteAmount: 19360,
      overdueNoNoteCustomers: 2,
    });
    expect(r.aging.overdueNoNote.map((o: any) => [o.customerCode, o.overdueAmount, o.oldestDueDate, !!o.lastNoteAt])).toEqual([
      [C2, 15360, '2026-09-30', true],
      [C1, 4000, '2026-10-24', false],
    ]);
    expect(r.aging.headline).toBe('התחייבות של בדיקה – גימל על 7,000 ₪ לא קוימה (מועד 15.10).');
    expect(r.aging.conclusions).toEqual([
      'השבוע נכנסות לפירעון 4 חשבוניות של 2 לקוחות, 18,360 ₪.',
      'התחייבות אחת מגיעה השבוע, 3,000 ₪; 3,000 ₪ כבר נכנסו.',
      'בירור אחד לבדיקה ביום ד׳ (בדיקה – גימל).',
      '19,360 ₪ בפיגור בלי הערה בשבועיים האחרונים, אצל 2 לקוחות.',
    ]);
    expect(r.dataAsOf).toBe('2026-10-27T03:00:00.000Z');
  });

  it('bookkeeper filter: CustomerOwners override, else Priority', async () => {
    const r = await weekBrief({ asOfDate: TUE, bookkeeperName: 'דנה' }, ctx);
    expect([...new Set(r.aging.items.map((i: any) => i.customerCode))].sort()).toEqual([C1, C2]);
    expect(r.aging.kpis.brokenPromisesCount).toBe(0);
    expect(r.aging.headline).toBe('השבוע נכנסות לפירעון 4 חשבוניות של 2 לקוחות, 18,360 ₪.');
    const rina = await weekBrief({ asOfDate: TUE, bookkeeperName: 'רינה' }, ctx);
    expect([...new Set(rina.aging.items.map((i: any) => i.customerCode))]).toEqual([C3]);
    expect(rina.aging.kpis.dueThisWeekCount).toBe(0);
  });

  it('week boundaries: Saturday is the last day of its week, Sunday starts the next one (the commitment not kept ages out)', async () => {
    const sat = await weekBrief({ asOfDate: '2026-10-31' }, ctx);
    expect(sat.week).toMatchObject({ start: '2026-10-25', end: '2026-10-31' });
    expect(sat.week.days[6]).toMatchObject({ date: '2026-10-31', isToday: true });
    expect(sat.week.days.slice(0, 6).every((d: any) => d.isPast)).toBe(true);
    const sun = await weekBrief({ asOfDate: '2026-11-01' }, ctx);
    expect(sun.week).toMatchObject({ start: '2026-11-01', end: '2026-11-07', label: '01.11–07.11' });
    expect(sun.week.days[0]).toMatchObject({ weekday: 'א׳', isToday: true, isPast: false });
    expect(sun.aging.items.filter((i: any) => i.kind === 'פירעון').map((i: any) => i.invoiceNumbers)).toEqual([['I-6']]);
    // the 15.10 commitment not kept is out of the 14 days
    expect(sun.aging.items.map((i: any) => [i.kind, i.date])).toEqual([['פירעון', '2026-11-01']]);
  });

  it('a paid-seen invoice is not due and not overdue; once the match is rejected it is back', async () => {
    const before = await weekBrief({ asOfDate: '2026-10-30' }, ctx);
    expect(before.aging.items.some((i: any) => i.invoiceNumbers.includes('I-3'))).toBe(false);
    fake.rows('MatchProposals')[0].status = 'נדחתה';
    const after = await weekBrief({ asOfDate: '2026-10-30' }, ctx);
    expect(after.aging.items.find((i: any) => i.invoiceNumbers.includes('I-3'))).toMatchObject({ kind: 'פירעון', date: '2026-10-29', amount: 2000 });
  });

  it('an empty week says so calmly and names what is awaited', async () => {
    const r = await weekBrief({ asOfDate: '2026-12-15', bookkeeperName: 'רינה' }, ctx);
    expect(r.aging.items).toEqual([]);
    expect(r.aging.headline).toBe('השבוע לא נכנסות חשבוניות לפירעון ואין התחייבויות או בירורים. ממתינים לתשלום על 7,000 ₪ שכבר בפיגור.');
    expect(r.aging.conclusions).toEqual(['7,000 ₪ בפיגור בלי הערה בשבועיים האחרונים, אצל לקוח אחד (בדיקה – גימל).']);
    expect(r.receipts.summary).toBe('עוד לא הועלה קובץ בנק היום.');
    const nobody = await weekBrief({ asOfDate: '2026-12-15', bookkeeperName: 'אף אחת' }, ctx);
    expect(nobody.aging.headline).toBe('השבוע שקט: אין חשבוניות לפירעון, התחייבויות או בירורים. ממתינים לקובץ הבנק הבא.');
  });
});

describe('GetWeekBrief – receipts of the work day', () => {
  it('pulled / matched / waiting / to match / unidentified / not checked / bounced', async () => {
    const r = await weekBrief({ asOfDate: TUE }, ctx);
    expect(r.receipts).toMatchObject({
      workDay: TUE,
      pulled: 4,
      pulledAmount: 11500,
      matched: 1,
      matchedAmount: 5000,
      waitingDecision: 1,
      toMatch: 3,
      toMatchAmount: 6500,
      unidentified: 1,
      notChecked: 1,
      bounced: 1,
      summary: 'נמשכו היום 4 העברות, 11,500 ₪. אחת תואמה, 3 נשארו לתאם (אחת ממתינה לאישור).',
    });
    expect(r.receipts.files.map((f: any) => f.fileName)).toEqual(['bank-27.pdf']);
    // a bookkeeper sees her customers' lines and the unidentified ones
    const dana = await weekBrief({ asOfDate: TUE, bookkeeperName: 'דנה' }, ctx);
    expect(dana.receipts).toMatchObject({ pulled: 3, matched: 1, waitingDecision: 0, unidentified: 1 });
  });

  it('Friday and Saturday count as Thursday: a file uploaded on Friday shows on Thursday\'s work day', async () => {
    fake.insert('ImportBatches', [{ kind: 'קובץ בנק', fileName: 'bank-fri.pdf', uploadedAt: '2026-10-30T07:00:00.000Z', extractionStatus: 'נקרא – לאימות', checkStatus: 'טרם התחילו', isTestFixture: true }]);
    const fri = await weekBrief({ asOfDate: '2026-10-30' }, ctx);
    expect(fri.receipts.workDay).toBe('2026-10-29');
    expect(fri.receipts.files.map((f: any) => f.fileName)).toEqual(['bank-fri.pdf']);
    expect(fri.receipts.summary).toBe('קובץ הבנק של יום ה׳ עוד לא אומת – אין עדיין העברות לתאם.');
    const sat = await weekBrief({ asOfDate: '2026-10-31' }, ctx);
    expect(sat.receipts.workDay).toBe('2026-10-29');
    const thu = await weekBrief({ asOfDate: '2026-10-29' }, ctx);
    expect(thu.receipts.files.map((f: any) => f.fileName)).toEqual(['bank-fri.pdf']);
  });
});
