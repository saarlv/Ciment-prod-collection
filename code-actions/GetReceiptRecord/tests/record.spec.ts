import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

// The 4-step receipts record for Nina: identify → receipt → debt check → allocation, by bankLineId or receiptId.
const C = 'TEST-096';
const LINE = 'TEST-BL-96';
const KEY = `RCPT-${LINE}`;

function world() {
  const fake = new FakeBlocks();
  fake.insert('BankLines', [
    { bankLineId: LINE, customerCode: C, amount: 3000, valueDate: '2026-11-10', payerName: 'רשומה בע״מ', lineType: 'העברה', status: 'חדשה', checkStage: 'אושרה', receiptKey: KEY, lastCheckRunId: 'run-1', source: 'test-fixture' },
  ]);
  fake.insert('Customers', [{ customerCode: C, customerName: 'בדיקה – רשומה', paymentMethod: 'העברה בנקאית', source: 'test-fixture' }]);
  fake.insert('CustomerContacts', [{ customerCode: C, contactKey: '1', contactName: 'רינה', email: 'ap@x.test', isApContact: true }]);
  fake.insert('ReceiptCheckSteps', [
    { bankLineId: LINE, checkRunId: 'run-1', stepNo: 1, stage: 'זיהוי לקוח', rung: 'כרטיס לקוח', result: 'נמצא', detail: 'שם זהה', actor: 'מערכת', actorName: 'זיהוי לקוח (מערכת)', at: '2026-11-10T06:00:00.000Z', evidence: { confidence: 95, method: 'שם זהה', identifyStatus: 'ודאי', candidates: [{ customerCode: C, customerName: 'בדיקה – רשומה', confidence: 95, method: 'שם זהה' }] } },
    { bankLineId: LINE, checkRunId: 'run-0', stepNo: 1, stage: 'זיהוי לקוח', rung: 'כינוי', result: 'לא נמצא' },
  ]);
  const [r] = fake.insert('Receipts', [
    { receiptKey: KEY, bankLineId: LINE, customerCode: C, customerName: 'בדיקה – רשומה', amount: 3000, valueDate: '2026-11-10', receiptStatus: 'אושרה – לא נשלחה', identifyStatus: 'ודאי', identifyConfidence: 95, receiptSource: 'דף בנק', sendStatus: 'טיוטה – בדיקה', debtCheckResult: 'נסגר לאפס – מצטבר', debtCheckMonths: '2026-09,2026-10', matchStatus: 'מפוזרת', allocatedAmount: 3000, unallocatedAmount: 0, allocationConfidence: 90, preparedBy: 'דנה' },
  ]);
  fake.insert('ReceiptAllocations', [
    { receiptKey: KEY, invoiceNumber: 'R-2', dueDate: '2026-10-10', amount: 2000, openBefore: 2000, openAfter: 0, kind: 'מלאה', source: 'סכום', status: 'מוכנה' },
    { receiptKey: KEY, invoiceNumber: 'R-1', dueDate: '2026-09-10', amount: 1000, openBefore: 1000, openAfter: 0, kind: 'מלאה', source: 'סכום', status: 'מוכנה' },
  ]);
  fake.insert('OpenMovements', [
    { customerCode: C, docType: 'חשבונית', docNumber: 'R-1', amount: 1000, dueMonth: '2026-09' },
    { customerCode: C, docType: 'חשבונית', docNumber: 'R-2', amount: 2000, dueMonth: '2026-10' },
  ]);
  fake.insert('Approvals', [{ relatedTable: 'Receipts', relatedId: KEY, status: 'ממתין', draftedAt: '2026-11-10T06:01:00.000Z' }]);
  fake.insert('CollectionQueue', [{ taskKey: `debt-zero:${KEY}`, status: 'ממתין', taskType: 'נסגר לאפס' }]);
  fake.insert('CustomerNotes', [
    { customerCode: C, dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-09', amount: 1000, status: 'פעילה', outcome: 'פתוחה', authorName: 'דנה', noteText: 'ישלם', noteCreatedAt: '2026-11-01T08:00:00.000Z' },
    { customerCode: C, dueMonth: '2026-09', noteType: 'חזור אליי', status: 'נסגרה ידנית', closedAt: '2026-03-02T08:00:00.000Z' },
  ]);
  current = fake.client();
  return { fake, receipt: r };
}

describe('GetReceiptRecord – the 4-step record', () => {
  it('by bankLineId: line, customer, identify, receipt, debt check, allocation, notes and the Priority instruction', async () => {
    world();
    const r: any = await invoke({ bankLineId: LINE, asOfDate: '2026-11-11' }, {});
    expect(r.errors).toEqual([]);
    expect(r.line).toMatchObject({ bankLineId: LINE, amount: 3000, status: 'חדשה', checkStage: 'אושרה' });
    expect(r.customer).toMatchObject({ customerCode: C, customerName: 'בדיקה – רשומה', paymentMethod: 'העברה בנקאית', apContact: { name: 'רינה', email: 'ap@x.test', phone: null } });
    expect(r.identify).toMatchObject({ status: 'ודאי', confidence: 95, method: 'שם זהה', candidates: [{ customerCode: C, confidence: 95 }] });
    expect(r.identify.steps).toEqual([{ rung: 'כרטיס לקוח', result: 'נמצא', summary: 'שם זהה', actor: 'זיהוי לקוח (מערכת)', at: '2026-11-10T06:00:00.000Z' }]);
    expect(r.receipt).toMatchObject({ receiptKey: KEY, receiptStatus: 'אושרה – לא נשלחה', sendStatus: 'טיוטה – בדיקה', mailApprovalStatus: 'ממתין', receiptSource: 'דף בנק' });
    expect(r.debtCheck).toEqual({
      result: 'נסגר לאפס – מצטבר',
      months: ['2026-09', '2026-10'],
      monthBalances: [
        { dueMonth: '2026-09', openAmount: 1000, cumulative: 1000 },
        { dueMonth: '2026-10', openAmount: 2000, cumulative: 3000 },
      ],
      taskKey: `debt-zero:${KEY}`,
    });
    expect(r.allocation).toMatchObject({ matchStatus: 'מפוזרת', allocatedAmount: 3000, allocationConfidence: 90, taskKey: null });
    expect(r.allocation.rows.map((x: any) => x.invoiceNumber)).toEqual(['R-1', 'R-2']);
    expect(r.customerNotes).toEqual([expect.objectContaining({ dueMonth: '2026-09', noteType: 'התחייבות לתשלום', noteAmount: 1000, outcome: 'פתוחה' })]);
    expect(r.priorityInstruction).toContain('חשבונית R-1');
  });

  it('by receiptId gives the same record; an agent cheque has no line and identify method צ׳ק סוכן', async () => {
    const { fake, receipt } = world();
    const r: any = await invoke({ receiptId: receipt.id, asOfDate: '2026-11-11' }, {});
    expect(r.line.bankLineId).toBe(LINE);
    const [cheque] = fake.insert('Receipts', [{ receiptKey: 'RCPT-AGT-P-1', customerCode: C, amount: 500, receiptStatus: 'טיוטה – ממתינה לאישור', receiptSource: 'צ׳ק סוכן' }]);
    const c: any = await invoke({ receiptId: cheque.id, asOfDate: '2026-11-11' }, {});
    expect(c.errors).toEqual([]);
    expect(c.line).toBeNull();
    expect(c.identify).toMatchObject({ status: null, method: 'צ׳ק סוכן' });
    expect(c.debtCheck).toBeNull();
    expect(c.allocation).toBeNull();
    expect(c.priorityInstruction).toBeNull();
  });

  it('needs exactly one of bankLineId / receiptId', async () => {
    world();
    expect((await invoke({}, {})).errors[0]).toContain('חסר מזהה');
    expect((await invoke({ bankLineId: LINE, receiptId: '1' }, {})).errors[0]).toContain('רק אחד');
    expect((await invoke({ bankLineId: 'NOPE' }, {})).errors[0]).toContain('לא נמצאה');
  });
});
