import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as prepare } from '../code.ts';
import { chooseAction, fallbackSummary } from '../../shared/collections-customer-summary.ts';

const T = '2026-11-02';
let fake: FakeBlocks;
const inv = (customerCode: string, invoiceNumber: string, dueDate: string, openAmount: number) => ({
  customerCode,
  invoiceNumber,
  documentType: 'חשבונית',
  dueDate,
  amount: openAmount,
  openAmount,
});

function seedSummaryWorld(f: FakeBlocks) {
  f.insert('Customers', [
    { customerCode: 'TEST-004', customerName: 'בדיקה – לקוח 4', source: 'test-fixture' },
    { customerCode: 'TEST-005', customerName: 'בדיקה – לקוח 5', source: 'test-fixture' },
    { customerCode: 'TEST-006', customerName: 'בדיקה – לקוח 6', source: 'test-fixture' },
  ]);
  f.insert('Invoices', [inv('TEST-004', 'S-1', '2026-08-30', 31000), inv('TEST-004', 'S-2', '2026-11-20', 17200), inv('TEST-005', 'S-9', '2026-10-01', 0)]);
  // a commitment not kept (CustomerNotes), and the call it was given on
  f.insert('CustomerNotes', [
    { customerCode: 'TEST-004', dueMonth: '2026-08', noteType: 'התחייבות לתשלום', actionDate: '2026-10-15', amount: 20000, status: 'פעילה', outcome: 'לא קוימה', amountReceived: 0, amountRemaining: 20000, noteCreatedAt: '2026-10-08T09:00:00.000Z', noteText: 'x' },
    { customerCode: 'TEST-004', dueMonth: '2026-06', noteType: 'התחייבות לתשלום', actionDate: '2026-06-01', amount: 5000, status: 'נסגרה – החודש התאפס', outcome: 'לא קוימה', noteCreatedAt: '2026-05-20T09:00:00.000Z', noteText: 'closed' },
  ]);
  f.insert('Interactions', [{ customerCode: 'TEST-004', type: 'שיחה', direction: 'יוצא', occurredAt: '2026-10-08T09:00:00.000Z', summary: 'שיחה' }]);
  f.insert('CollectionQueue', [
    { customerCode: 'TEST-004', title: 'הבטחה הופרה', status: 'ממתין', taskType: 'הבטחה הופרה', priorityScore: 80 },
    { customerCode: 'TEST-004', title: 'ישן', status: 'טופל' },
  ]);
  f.insert('InboundEmails', [
    {
      customerCode: 'TEST-006',
      receivedAt: '2026-11-01T07:00:00.000Z',
      classificationQuotes: { promise: { amount: 3000, date: '2026-11-10', status: 'ממתינה לאישור', invoiceNumbers: [] } },
    },
  ]);
}

beforeEach(() => {
  fake = new FakeBlocks();
  seedSummaryWorld(fake);
  current = fake.client();
});

describe('PrepareCustomerSummaries', () => {
  it('builds the golden line, picks only customers with balance / task / promise, and reads only', async () => {
    const before = fake.calls.length;
    const r = await prepare({ asOfDate: T }, {});
    expect(r.errors).toEqual([]);
    expect(r.hasCustomers).toBe(true);
    expect(r.facts.map((f: any) => f.customerCode)).toEqual(['TEST-004', 'TEST-006']);
    expect(r.prompt.split('\n')).toEqual([
      'משימה: סיכום יומי ללקוחות',
      'תאריך: 2026-11-02',
      'לקוח TEST-004 | בדיקה – לקוח 4 | יתרה 48,200 ₪ | בפיגור 31,000 ₪ (הוותיקה 64 ימים) | התחייבויות פתוחות: אין | לא קוימו: 1 (15.10, 20,000 ₪, נכנסו 0 ₪) | הערות פעילות: 1 | בירורים פתוחים: 0 | משימות פתוחות: הבטחה הופרה | הערה אחרונה: 08.10 התחייבות לתשלום | קשר אחרון: 08.10 שיחה',
      'לקוח TEST-006 | בדיקה – לקוח 6 | יתרה 0 ₪ | בפיגור 0 ₪ | התחייבויות פתוחות: אין | לא קוימו: 0 | הערות פעילות: 0 | בירורים פתוחים: 0 | משימות פתוחות: לאשר הבטחה מהמייל | הערה אחרונה: אין | קשר אחרון: 01.11 דואל',
    ]);
    const f4 = r.facts[0];
    expect(f4).toMatchObject({ customerName: 'בדיקה – לקוח 4', isTestFixture: true });
    expect(f4.basis).toEqual({
      openBalance: 48200,
      overdueAmount: 31000,
      oldestOverdueDays: 64,
      openPromise: null,
      brokenPromises: 1,
      openDisputes: 0,
      openTasks: ['הבטחה הופרה'],
      latestNote: '08.10 התחייבות לתשלום',
      activeNotes: 1,
      lastContact: '08.10 שיחה',
    });
    expect(chooseAction(f4)).toBe('להתקשר');
    expect(chooseAction(r.facts[1])).toBe('לאשר הבטחה');
    expect(fake.calls.slice(before).every((c) => c.method === 'queryTable')).toBe(true);
  });

  it('one customer (the card refresh), even with a clean account', async () => {
    const r = await prepare({ asOfDate: T, customerCode: 'TEST-005' }, {});
    expect(r.customerCount).toBe(1);
    expect(r.facts[0].basis.openBalance).toBe(0);
    expect(fallbackSummary(r.facts[0])).toMatchObject({ actionType: 'אין צורך בפעולה', summary: 'אין יתרה פתוחה. אין קשר מתועד.' });
    const missing = await prepare({ asOfDate: T, customerCode: 'NOPE' }, {});
    expect(missing).toMatchObject({ hasCustomers: false, errors: ['לקוח NOPE לא נמצא'] });
  });

  it('an open promise means waiting for its date', async () => {
    fake.insert('CustomerNotes', [{ customerCode: 'TEST-004', dueMonth: '2026-08', noteType: 'התחייבות לתשלום', actionDate: '2026-11-05', amount: 31000, status: 'פעילה', outcome: 'פתוחה', noteCreatedAt: '2026-10-30T08:00:00.000Z' }]);
    const r = await prepare({ asOfDate: T, customerCode: 'TEST-004' }, {});
    expect(r.facts[0].basis.openPromise).toBe('31,000 ₪ עד 05.11 (חודש 2026-08)');
    expect(chooseAction(r.facts[0])).toBe('לחכות למועד');
  });

  it('CustomerNotes facts: a commitment not kept (received / remaining), an open one, active notes and the latest note', async () => {
    fake.insert('CustomerNotes', [
      { customerCode: 'TEST-005', dueMonth: '2026-10', noteType: 'התחייבות לתשלום', actionDate: '2026-10-20', amount: 9000, status: 'פעילה', outcome: 'קוימה חלקית', amountReceived: 4000, amountRemaining: 5000, noteCreatedAt: '2026-10-10T08:00:00.000Z' },
      { customerCode: 'TEST-005', dueMonth: '2026-11', noteType: 'התחייבות לתשלום', actionDate: '2026-11-15', amount: null, balanceAtNote: 7000, status: 'פעילה', outcome: 'פתוחה', noteCreatedAt: '2026-10-30T08:00:00.000Z' },
      { customerCode: 'TEST-005', dueMonth: '2026-11', noteType: 'אחר', customTypeLabel: 'בירור – מחיר', noteText: 'x', status: 'פעילה', noteCreatedAt: '2026-11-01T08:00:00.000Z' },
      { customerCode: 'TEST-005', dueMonth: '2026-09', noteType: 'חזור אליי', actionDate: '2026-09-10', status: 'נסגרה – החודש התאפס', noteCreatedAt: '2026-09-05T08:00:00.000Z' },
    ]);
    const r = await prepare({ asOfDate: T }, {});
    const f5 = r.facts.find((f: any) => f.customerCode === 'TEST-005')!;
    expect(f5).toBeTruthy(); // an active commitment makes the customer a candidate even with no balance
    expect(f5.basis).toMatchObject({ openPromise: '7,000 ₪ עד 15.11 (חודש 2026-11)', brokenPromises: 1, activeNotes: 3, latestNote: '01.11 בירור – מחיר' });
    expect(f5.signals.brokenDetails).toEqual(['20.10, 9,000 ₪, קוימה חלקית: נכנסו 4,000 ₪, נשארו 5,000 ₪']);
    expect(f5.signals.openPromiseDate).toBe('2026-11-15');
    expect(r.prompt).toContain('לקוח TEST-005 | בדיקה – לקוח 5 | יתרה 0 ₪ | בפיגור 0 ₪ | התחייבויות פתוחות: 7,000 ₪ עד 15.11 (חודש 2026-11) | לא קוימו: 1 (20.10, 9,000 ₪, קוימה חלקית: נכנסו 4,000 ₪, נשארו 5,000 ₪) | הערות פעילות: 3');
  });
});
