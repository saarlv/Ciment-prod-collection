import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as prepare } from '../../PrepareCustomerSummaries/code.ts';
import { invoke as write } from '../code.ts';

const T = '2026-11-02';
let fake: FakeBlocks;
let facts: any[];

const inv = (customerCode: string, invoiceNumber: string, dueDate: string, openAmount: number) => ({
  customerCode,
  invoiceNumber,
  documentType: 'חשבונית',
  dueDate,
  amount: openAmount,
  openAmount,
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-11-02T04:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

beforeEach(async () => {
  fake = new FakeBlocks();
  fake.insert('Customers', [
    { customerCode: 'TEST-004', customerName: 'בדיקה – לקוח 4', source: 'test-fixture' },
    { customerCode: 'TEST-006', customerName: 'בדיקה – לקוח 6', source: 'test-fixture' },
  ]);
  fake.insert('Invoices', [inv('TEST-004', 'S-1', '2026-08-30', 31000), inv('TEST-004', 'S-2', '2026-11-20', 17200)]);
  fake.insert('CustomerNotes', [
    { customerCode: 'TEST-004', dueMonth: '2026-08', noteType: 'התחייבות לתשלום', actionDate: '2026-10-15', amount: 20000, status: 'פעילה', outcome: 'לא קוימה', amountReceived: 0, noteCreatedAt: '2026-10-08T09:00:00.000Z' },
  ]);
  fake.insert('InboundEmails', [
    { customerCode: 'TEST-006', receivedAt: '2026-11-01T07:00:00.000Z', classificationQuotes: { promise: { amount: 3000, status: 'ממתינה לאישור' } } },
  ]);
  current = fake.client();
  facts = (await prepare({ asOfDate: T }, {})).facts;
});

const rows = () => fake.rows('CustomerDailySummaries');
const AGENT_4 = { customerCode: 'TEST-004', summary: 'יתרה 48,200 ₪, מתוכה 31,000 ₪ בפיגור. הבטחה של 20,000 ₪ הופרה ב-15.10.', suggestedAction: 'להתקשר ללקוח היום.', actionType: 'להתקשר' };

describe('WriteCustomerSummaries', () => {
  it('keeps valid agent entries, rejects the rest, falls back by the rules, and verifies the writes', async () => {
    const r = await write(
      {
        asOfDate: T,
        facts,
        agentResult: {
          summaries: [AGENT_4, { ...AGENT_4, customerCode: 'TEST-999' }, { customerCode: 'TEST-006', summary: 'x', suggestedAction: 'y', actionType: 'לחגוג' }],
        },
      },
      {},
    );
    expect(r).toMatchObject({ summaryDate: T, written: 2, byAgent: 1, byFallback: 1, writeVerified: true, errors: [] });
    expect(r.rejected).toEqual(['TEST-999: הלקוח לא ברשימה', 'TEST-006: סוג פעולה לא מוכר "לחגוג"']);
    const r4 = rows().find((x) => x.customerCode === 'TEST-004')!;
    expect(r4).toMatchObject({ summaryDate: T, writtenBy: 'סוכן', actionType: 'להתקשר', customerName: 'בדיקה – לקוח 4', isTestFixture: true });
    expect(r4.basis).toMatchObject({ openBalance: 48200, overdueAmount: 31000, brokenPromises: 1 });
    const r6 = rows().find((x) => x.customerCode === 'TEST-006')!;
    expect(r6).toMatchObject({ writtenBy: 'קוד (גיבוי)', actionType: 'לאשר הבטחה', suggestedAction: 'לאשר את הצעת ההבטחה מהמייל בדואר הנכנס.' });
    expect(r6.summary).toBe('אין יתרה פתוחה. הצעת הבטחה ממייל ממתינה לאישור; משימות פתוחות: לאשר הבטחה מהמייל.');
  });

  it('a rerun the same day replaces the rows; a wrapped JSON string is read', async () => {
    await write({ asOfDate: T, facts }, {});
    expect(rows()).toHaveLength(2);
    expect(rows().every((x) => x.writtenBy === 'קוד (גיבוי)')).toBe(true);
    expect(rows().find((x) => x.customerCode === 'TEST-004')).toMatchObject({ actionType: 'להתקשר' });
    expect(rows().find((x) => x.customerCode === 'TEST-004')!.summary).toBe(
      'יתרה פתוחה 48,200 ₪, מתוכה 31,000 ₪ בפיגור (הוותיקה 64 ימים). התחייבות לא קוימה (15.10, 20,000 ₪, נכנסו 0 ₪); אין קשר מתועד.',
    );

    const wrapped = { output: '```json\n' + JSON.stringify({ summaries: [AGENT_4] }) + '\n```' };
    const r = await write({ asOfDate: T, facts, agentResult: wrapped }, {});
    expect(r).toMatchObject({ written: 2, byAgent: 1, byFallback: 1, writeVerified: true });
    expect(rows()).toHaveLength(2);
    expect(rows().find((x) => x.customerCode === 'TEST-004')).toMatchObject({ writtenBy: 'סוכן', summary: AGENT_4.summary });
  });

  it('an unreadable answer and empty facts', async () => {
    const r = await write({ asOfDate: T, facts, agentResult: { text: 'סליחה, לא הצלחתי' } }, {});
    expect(r.byFallback).toBe(2);
    expect(r.rejected).toEqual(['תשובת הסוכנת לא נקראה (אין בה רשימת summaries)']);
    expect(await write({ asOfDate: T, facts: [] }, {})).toMatchObject({ written: 0, writeVerified: true });
  });
});
