import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// WriteBriefing on a receipt-first morning: yesterday's bank file went through IdentifyCustomers (draft receipts with
// ודאי / לא ודאי, unknown payers), the seeded TEST-012 receipt is approved and waits for its allocation.
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';
import { insertYesterdayBankFile } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { identifyCustomers } from '../../shared/collections-identify-customers.ts';
import { briefingBatches, invoke } from '../code.ts';

const T = '2026-10-21';
const ctx: any = {};
const COUNT_KEYS = [
  'bankLines',
  'certainMatches',
  'toReview',
  'unidentified',
  'receiptsApprovedToday',
  'debtClosedZero',
  'debtToClarify',
  'waitingAllocation',
  'bouncedChecks',
  'promisesDue',
  'promisesSeen',
  'promisesKept',
  'promisesPartial',
  'promisesBroken',
  'insuranceAlerts',
  'inboxDueSoon',
  'openTasks',
  'escalatedDocumentCases',
];

describe('WriteBriefing on the seeded bank import', () => {
  const fake = new FakeBlocks();
  let first: any;
  let identified: any;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T05:00:00.000Z'));
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: T }, ctx);
    const batch = insertYesterdayBankFile(fake, T); // Iteration 9: no longer seeded (the sample file is uploaded instead)
    identified = await identifyCustomers(fake.client(), { importBatchId: batch.id, asOfDate: T, dryRun: false });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('one briefing per bookkeeper + כולם, counts schema, headline, body order', async () => {
    first = await invoke({ asOfDate: T }, ctx);
    expect(first.writeVerified).toBe(true);
    expect(first.isTestFixture).toBe(true);
    expect(first.briefings.map((b: any) => [b.audience, b.action])).toEqual([
      ['בדיקה – אחראית א', 'נוצר'],
      ['בדיקה – אחראית ב', 'נוצר'],
      ['כולם', 'נוצר'],
    ]);
    const all = first.briefings[2];
    expect(Object.keys(all.counts)).toEqual(COUNT_KEYS);
    expect(all.counts).toEqual({
      bankLines: 6,
      // identified ודאי by the customer card (02, 03, 04): drafts waiting for "אשר את כל הוודאיים"; 01 (by a recent mail) to review
      certainMatches: 3,
      toReview: 1,
      unidentified: 1,
      receiptsApprovedToday: 0,
      debtClosedZero: 0,
      debtToClarify: 0,
      // the seeded TEST-012 receipt: approved, on account, waiting for its allocation
      waitingAllocation: 1,
      bouncedChecks: 1,
      // wave 3: commitments are CustomerNotes – none of the seeded ones is due, checked or closed on T
      promisesDue: 0,
      promisesSeen: 0,
      promisesKept: 0,
      promisesPartial: 0,
      promisesBroken: 0,
      insuranceAlerts: 0,
      inboxDueSoon: 0,
      // TEST-005's bounced cheque, the open bank file's bounced cheque (TEST-BL-020-2) and line 01's identification task
      openTasks: 3,
      escalatedDocumentCases: 0,
    });
    expect(all.headline).toBe('נכנסו 5 העברות, 124,997 ש״ח · 3 זיהויים ודאיים מחכים לאישור במנה · קבלה אחת מחכה לפיזור · צ׳ק חוזר אחד');
    expect(all.agentName).toBe('נינה');
    expect(all.briefingDate).toBe(T);
    const order = ['צ׳קים חוזרים', 'זוהו בוודאות', 'זיהוי לבדיקה', 'לא מזוהה', 'מחכות לפיזור', 'משימות פתוחות'].map((k) => all.body.indexOf(`**${k}`));
    expect(order.every((i: number) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(first.items.certain.map((l: any) => [l.receiptStatus, l.identifyStatus])).toEqual(Array(3).fill(['טיוטה – ממתינה לאישור', 'ודאי']));
    expect(first.items.waitingAllocation).toEqual([expect.objectContaining({ receiptKey: 'RCPT-TEST-BL-HIST-12', customerCode: 'TEST-012', matchStatus: 'על חשבון – צריך פיזור' })]);
    expect(identified.errors).toEqual([]);
    expect(first.items.unidentified[0]).toMatchObject({ payerName: 'י.ד. השקעות', amount: 3333, customerCode: null });
    // a returned cheque is not identified (IdentifyCustomers skips it); its urgent task carries the reason
    expect(first.items.bouncedChecks[0]).toMatchObject({ payerName: 'גל מתכת', reasoning: expect.stringContaining('צ׳ק 004512 חזר – אין כיסוי מספיק, 14,500 ש״ח') });
    // the bookkeeper view only holds her own lines (plus the shared unidentified queue)
    const a = first.briefings[0];
    expect(a.counts.bankLines + first.briefings[1].counts.bankLines).toBeGreaterThanOrEqual(6);
    expect(a.counts.unidentified).toBe(1);
  });

  it('a re-run updates that day\'s rows in place', async () => {
    const again = await invoke({ asOfDate: T }, ctx);
    expect(again.writeVerified).toBe(true);
    expect(again.briefings.map((b: any) => b.action)).toEqual(['עודכן', 'עודכן', 'עודכן']);
    expect(again.briefings.map((b: any) => b.id)).toEqual(first.briefings.map((b: any) => b.id));
    expect(fake.rows('AgentBriefings')).toHaveLength(3);
  });

  it('audience filter and dryRun', async () => {
    const mark = fake.calls.length;
    const r = await invoke({ asOfDate: T, audience: 'בדיקה – אחראית ב', dryRun: true }, ctx);
    expect(r.briefings.map((b: any) => b.audience)).toEqual(['בדיקה – אחראית ב']);
    expect(r.items.audience).toBe('בדיקה – אחראית ב');
    expect(fake.calls.slice(mark).filter((c) => /^(create|update)/.test(c.method))).toHaveLength(0);
  });

  it('bug fix: without importBatchId every written batch of today / the previous business day is covered', async () => {
    // a second bank file of the same morning (בינלאומי) with 2 more transfers
    const [b2] = fake.insert('ImportBatches', [
      { fileName: 'test-bank-beinleumi-2026-10-20.csv', kind: 'קובץ בנק', dataDate: '2026-10-20', uploadedAt: '2026-10-21T04:50:00.000Z', status: 'נכתב', isTestFixture: true },
    ]);
    fake.insert('BankLines', [
      { bankLineId: 'TEST-BL-B-01', bankName: 'בינלאומי', valueDate: '2026-10-20', amount: 1000, payerName: 'פלוני', lineType: 'העברה', importBatchId: b2.id, status: 'לא מזוהה', source: 'test-fixture' },
      { bankLineId: 'TEST-BL-B-02', bankName: 'בינלאומי', valueDate: '2026-10-20', amount: 2000, payerName: 'אלמוני', lineType: 'העברה', importBatchId: b2.id, status: 'לא מזוהה', source: 'test-fixture' },
    ]);
    const r = await invoke({ asOfDate: T, dryRun: true }, ctx);
    expect(r.importBatchIds).toHaveLength(2);
    const all = r.briefings.find((b: any) => b.audience === 'כולם');
    expect(all.counts).toMatchObject({ bankLines: 8, unidentified: 3, certainMatches: 3 });
    expect(all.headline.startsWith('נכנסו 7 העברות, 127,997 ש״ח')).toBe(true);
    // importBatchId keeps the single-batch behaviour
    const one = await invoke({ asOfDate: T, dryRun: true, importBatchId: b2.id }, ctx);
    expect(one.briefings.find((b: any) => b.audience === 'כולם').counts.bankLines).toBe(2);
    // last month's batch and a real batch are never mixed in
    const sel = briefingBatches(
      [
        { id: '1', status: 'נכתב', dataDate: '2026-10-20', uploadedAt: '2026-10-21T04:45:00.000Z', isTestFixture: true },
        { id: '2', status: 'נכתב', dataDate: '2026-09-14', uploadedAt: '2026-09-15T04:45:00.000Z', isTestFixture: true },
        { id: '3', status: 'נכתב', dataDate: '2026-10-20', uploadedAt: '2026-10-21T04:40:00.000Z', isTestFixture: false },
        { id: '4', status: 'נכשל', dataDate: '2026-10-20', uploadedAt: '2026-10-21T04:46:00.000Z', isTestFixture: true },
      ],
      T,
    );
    expect(sel.covered.map((b) => b.id)).toEqual(['1']);
    // no batch in the window → the latest written one, as before
    expect(briefingBatches([{ id: '2', status: 'נכתב', dataDate: '2026-09-14', uploadedAt: '2026-09-15T04:45:00.000Z' }], T).covered.map((b) => b.id)).toEqual(['2']);
  });
});

describe('commitments (CustomerNotes) due, checked or closed today', () => {
  it('counts and lists them by outcome; the headline names the ones not kept', async () => {
    const fake = new FakeBlocks();
    seedRealWorld(fake);
    current = fake.client();
    const note = (code: string, fields: any) => ({ customerCode: code, customerName: `בדיקה – ${code}`, noteType: 'התחייבות לתשלום', dueMonth: '2026-09', status: 'פעילה', isTestFixture: true, ...fields });
    fake.insert('Customers', [{ customerCode: 'TEST-071', customerName: 'בדיקה – TEST-071', source: 'test-fixture' }]);
    fake.insert('CustomerNotes', [
      note('TEST-071', { actionDate: T, amount: 5000, outcome: 'פתוחה' }),
      note('TEST-071', { actionDate: '2026-10-19', amount: 3000, outcome: 'לא קוימה', amountReceived: 0, checkedAt: '2026-10-21T06:30:00.000Z' }),
      note('TEST-071', { actionDate: '2026-10-19', amount: 2000, outcome: 'קוימה', amountReceived: 2000, checkedAt: '2026-10-21T06:30:00.000Z' }),
      note('TEST-071', { actionDate: '2026-10-10', amount: 9000, outcome: 'לא קוימה', checkedAt: '2026-10-12T06:30:00.000Z' }),
      { ...note('TEST-071', { actionDate: T, outcome: null }), noteType: 'חזור אליי' },
    ]);
    fake.insert('ImportBatches', [{ fileName: 'test-bank-x.csv', kind: 'קובץ בנק', dataDate: '2026-10-20', uploadedAt: '2026-10-21T04:50:00.000Z', status: 'נכתב', isTestFixture: true }]);
    const r = await invoke({ asOfDate: T, dryRun: true }, ctx);
    const all = r.briefings.find((b: any) => b.audience === 'כולם');
    expect(all.counts).toMatchObject({ promisesDue: 1, promisesSeen: 0, promisesKept: 1, promisesPartial: 0, promisesBroken: 1 });
    expect(all.headline).toContain('התחייבות אחת לא קוימה');
    expect(all.body).toContain('**התחייבויות לתשלום:** קוימה 1 · לא קוימה 1 · מועדן היום 1');
  });
});
