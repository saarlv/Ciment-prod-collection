import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../shared/blocks/blocks-client.ts';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as decide } from '../code.ts';

// Since 08.11 DecideMatchProposal has one decision: priorityDone – an approved receipt is marked issued in Priority, by
// receiptId (agent cheques too) or by proposalIds (the receipts panel). Every other decision is refused.
const T = '2026-10-21';
const BK = 'בדיקה – אחראית א';
const CTX: any = { token: 't', appId: 'a', userId: 1, accountId: 1, secrets: {}, mainWorkflowId: 'w' };
const LINE = 'TEST-BL-77-1';
const KEY = `RCPT-${LINE}`;
const WRITES = /^(create|update|delete)/;

describe('DecideMatchProposal – priorityDone', () => {
  let fake: FakeBlocks;
  const row = (t: string, pred: (r: Item) => boolean) => fake.rows(t).find(pred)!;
  const lineRow = () => row('BankLines', (b) => b.bankLineId === LINE);
  const receipt = () => row('Receipts', (r) => r.receiptKey === KEY);
  const writesSince = (mark: number) => fake.calls.slice(mark).filter((c) => WRITES.test(c.method));
  const stepsOf = () => fake.rows('ReceiptCheckSteps').filter((s) => s.bankLineId === LINE && s.stage === 'החלטה');

  /** One approved bank receipt (IssueReceipt ran), its approved customer proposal and one allocation line. */
  function world(o: { proposal?: Item; receipt?: Item; line?: Item } = {}) {
    fake = new FakeBlocks();
    const [batch] = fake.insert('ImportBatches', [{ fileName: 'bank.pdf', kind: 'קובץ בנק', workDay: T, checkStatus: 'הושלמה', isTestFixture: true }]);
    fake.insert('Customers', [{ customerCode: 'TEST-002', customerName: 'בדיקה – אלון יזמות', source: 'test-fixture' }]);
    fake.insert('BankLines', [
      { bankLineId: LINE, importBatchId: batch.id, valueDate: '2026-10-20', amount: 17424, payerName: 'אלון יזמות בע״מ', lineType: 'העברה', status: 'חדשה', checkStage: 'אושרה', receiptKey: KEY, lastCheckRunId: `run-${LINE}-1`, source: 'test-fixture', ...o.line },
    ]);
    const [p] = fake.insert('MatchProposals', [
      { bankLineId: LINE, importBatchId: batch.id, customerCode: 'TEST-002', customerName: 'בדיקה – אלון יזמות', status: 'אושרה – לביצוע ב-Priority', confidence: 'ודאי', receiptKey: KEY, isTestFixture: true, ...o.proposal },
    ]);
    const [r] = fake.insert('Receipts', [
      { receiptKey: KEY, bankLineId: LINE, importBatchId: batch.id, customerCode: 'TEST-002', customerName: 'בדיקה – אלון יזמות', amount: 17424, allocatedAmount: 17424, unallocatedAmount: 0, receiptStatus: 'אושרה – לא נשלחה', matchStatus: 'מפוזרת', receiptSource: 'דף בנק', isTestFixture: true, ...o.receipt },
    ]);
    fake.insert('ReceiptAllocations', [{ receiptKey: KEY, bankLineId: LINE, invoiceNumber: 'TEST-INV-002-1', customerCode: 'TEST-002', amount: 17424, openBefore: 17424, kind: 'מלאה', source: 'סכום', status: 'מוכנה', isTestFixture: true }]);
    fake.insert('ReceiptCheckSteps', [{ bankLineId: LINE, importBatchId: batch.id, checkRunId: `run-${LINE}-1`, stepNo: 1, stage: 'זיהוי לקוח', rung: 'כרטיס לקוח', result: 'נמצא' }]);
    current = fake.client();
    return { proposal: p, receipt: r };
  }

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  beforeEach(() => {
    vi.setSystemTime(Date.parse(`${T}T07:00:00.000Z`));
  });
  afterAll(() => vi.useRealTimers());

  it('requires decidedBy and a receipt or proposal; old decisions are refused; nothing is written', async () => {
    world();
    const mark = fake.calls.length;
    expect((await decide({ decision: 'priorityDone', proposalIds: ['1'] }, CTX)).errors).toEqual(['חסר שם המחליט (decidedBy)']);
    expect((await decide({ decision: 'nope', decidedBy: BK }, CTX)).errors[0]).toContain('החלטה לא מוכרת');
    expect((await decide({ decision: 'priorityDone', decidedBy: BK }, CTX)).errors).toEqual(['חסרה קבלה (receiptId) או הצעה (proposalIds)']);
    expect((await decide({ decision: 'priorityDone', decidedBy: BK, proposalIds: ['999'] }, CTX)).errors).toEqual(['הצעות לא נמצאו: 999']);
    for (const d of ['approve', 'correct', 'reject', 'skip', 'approveReceipt', 'resolveCustomer', 'approveAlias']) {
      const r = await decide({ decision: d, decidedBy: BK, proposalIds: ['1'] }, CTX);
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toContain('ההחלטה הזו הוסרה');
    }
    expect(writesSince(mark)).toEqual([]);
  });

  it('by proposalIds (the receipts panel): receipt and allocations הונפקה ב-Priority with the number, proposal בוצעה, line קבלה הונפקה, a decision step', async () => {
    const { proposal } = world();
    const r = await decide({ decision: 'priorityDone', decidedBy: BK, proposalIds: [proposal.id], priorityReceiptNumber: 'RC-5512' }, CTX);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ ok: true, writeVerified: true });
    expect(receipt()).toMatchObject({ receiptStatus: 'הונפקה ב-Priority', issuedBy: BK, issuedAt: `${T}T07:00:00.000Z`, priorityReceiptNumber: 'RC-5512' });
    expect(fake.rows('ReceiptAllocations').map((a) => a.status)).toEqual(['הונפקה ב-Priority']);
    expect(row('MatchProposals', (x) => x.id === proposal.id)).toMatchObject({ status: 'בוצעה ב-Priority', priorityDoneBy: BK });
    expect(lineRow()).toMatchObject({ status: 'קבלה הונפקה', customerCode: 'TEST-002' });
    expect(stepsOf()).toEqual([expect.objectContaining({ rung: 'אישור', result: 'נמצא', actor: 'משתמש', actorName: BK, stepNo: 2, checkRunId: `run-${LINE}-1` })]);
    expect(r.receipt).toMatchObject({ receiptKey: KEY, receiptStatus: 'הונפקה ב-Priority', priorityReceiptNumber: 'RC-5512', issuedBy: BK });
    expect(r.priorityInstruction).toContain('חשבונית TEST-INV-002-1');
  });

  it('by receiptId: finds the line and its approved proposal itself', async () => {
    const { receipt: rc, proposal } = world();
    const r = await decide({ decision: 'priorityDone', decidedBy: BK, receiptId: rc.id }, CTX);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(receipt().receiptStatus).toBe('הונפקה ב-Priority');
    expect(row('MatchProposals', (x) => x.id === proposal.id).status).toBe('בוצעה ב-Priority');
    expect(lineRow().status).toBe('קבלה הונפקה');
  });

  it('an agent cheque (no bank line, no proposal) is marked by receiptId', async () => {
    fake = new FakeBlocks();
    const [rc] = fake.insert('Receipts', [
      { receiptKey: 'RCPT-AGT-P-9', customerCode: 'TEST-002', customerName: 'בדיקה – אלון יזמות', amount: 5000, receiptStatus: 'אושרה – לא נשלחה', receiptSource: 'צ׳ק סוכן', isTestFixture: true },
    ]);
    current = fake.client();
    const r = await decide({ decision: 'priorityDone', decidedBy: BK, receiptId: rc.id, priorityReceiptNumber: '7781' }, CTX);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(fake.rows('Receipts')[0]).toMatchObject({ receiptStatus: 'הונפקה ב-Priority', priorityReceiptNumber: '7781', issuedBy: BK });
    expect(fake.rows('ReceiptCheckSteps')).toEqual([]);
    expect(r.results[0]).toMatchObject({ bankLine: null, proposal: null, receiptSource: 'צ׳ק סוכן' });
  });

  it('a draft receipt and an issued receipt are refused with a Hebrew reason and nothing is written', async () => {
    const { receipt: rc } = world({ receipt: { receiptStatus: 'טיוטה – ממתינה לאישור' } });
    let mark = fake.calls.length;
    let r = await decide({ decision: 'priorityDone', decidedBy: BK, receiptId: rc.id }, CTX);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([expect.stringContaining('עדיין טיוטה')]);
    expect(writesSince(mark)).toEqual([]);
    const w = world({ receipt: { receiptStatus: 'הונפקה ב-Priority', priorityReceiptNumber: 'RC-1' } });
    mark = fake.calls.length;
    r = await decide({ decision: 'priorityDone', decidedBy: BK, proposalIds: [w.proposal.id] }, CTX);
    expect(r.errors).toEqual([`הקבלה ${KEY} כבר הונפקה ב-Priority (מספר RC-1)`]);
    expect(writesSince(mark)).toEqual([]);
  });

  it('dryRun reports the planned writes and writes nothing', async () => {
    const { proposal } = world();
    const mark = fake.calls.length;
    const r: any = await decide({ decision: 'priorityDone', decidedBy: BK, proposalIds: [proposal.id], dryRun: true }, CTX);
    expect(r.ok).toBe(true);
    expect(r.writeVerified).toBe(false);
    expect(r.plannedWrites.map((w: Item) => w.table)).toEqual(['ReceiptAllocations', 'MatchProposals', 'BankLines', 'Receipts']);
    expect(r.plannedCreates).toHaveLength(1);
    expect(writesSince(mark)).toEqual([]);
  });

  it('a failed write rolls everything back', async () => {
    const { proposal } = world();
    fake.failOn = (method, table) => method === 'updateItem' && table === 'BankLines';
    const r = await decide({ decision: 'priorityDone', decidedBy: BK, proposalIds: [proposal.id] }, CTX);
    fake.failOn = null;
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('הסימון לא נשמר במלואו – מה שנכתב בוטל');
    expect(receipt().receiptStatus).toBe('אושרה – לא נשלחה');
    expect(fake.rows('ReceiptAllocations')[0].status).toBe('מוכנה');
    expect(row('MatchProposals', (x) => x.id === proposal.id).status).toBe('אושרה – לביצוע ב-Priority');
  });
});
