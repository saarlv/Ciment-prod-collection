import { describe, expect, it } from 'vitest';
import { apContactOf, flowStepsOf, monthBalancesOf, priorityInstruction, waitingLineOf } from '@/utils/ReceiptFlow';
import type { FlowAllocation, FlowContact, FlowCustomer, FlowMovement, FlowReceipt } from '@/utils/ReceiptFlow';

const receipt = (r: Partial<FlowReceipt>): FlowReceipt => ({ id: r.id ?? 'r1', ...r }) as FlowReceipt;
const mv = (m: Partial<FlowMovement>): FlowMovement => ({ id: m.id ?? m.docNumber ?? 'm', ...m }) as FlowMovement;
const alloc = (a: Partial<FlowAllocation>): FlowAllocation => ({ id: a.id ?? a.invoiceNumber ?? 'a', ...a }) as FlowAllocation;

describe('the four steps', () => {
  it('waits for the identification, then walks receipt → debt check → allocation', () => {
    expect(flowStepsOf('ממתינה לזיהוי', null)).toEqual({ identify: 'current', receipt: 'waiting', debt: 'waiting', allocation: 'waiting' });
    expect(flowStepsOf('לא ודאי', receipt({ receiptStatus: 'טיוטה – ממתינה לאישור' })).identify).toBe('attention');
    expect(waitingLineOf('receipt', 'לא ודאי', null)).toBe('מחכה לאישור הלקוח');
    const approved = receipt({ receiptStatus: 'אושרה – לא נשלחה', sendStatus: 'טיוטה – בדיקה', matchStatus: 'על חשבון – צריך פיזור' });
    expect(flowStepsOf('אושר', approved)).toEqual({ identify: 'done', receipt: 'current', debt: 'waiting', allocation: 'attention' });
    expect(waitingLineOf('debt', 'אושר', approved)).toBe('מחכה לבדיקת החוב');
    const done = receipt({ receiptStatus: 'הונפקה ב-Priority', debtCheckResult: 'נסגר לאפס – מצטבר', matchStatus: 'מפוזרת' });
    expect(flowStepsOf('אושר', done)).toEqual({ identify: 'done', receipt: 'done', debt: 'done', allocation: 'done' });
    expect(flowStepsOf('אושר', receipt({ receiptStatus: 'אושרה – לא נשלחה', debtCheckResult: 'לברר מול הלקוח', sendStatus: 'חסר איש קשר' }))).toMatchObject({ receipt: 'attention', debt: 'attention' });
  });

  it('starts an agent cheque at the debt check', () => {
    const cheque = receipt({ receiptSource: 'צ׳ק סוכן', receiptStatus: 'אושרה – לא נשלחה', priorityReceiptNumber: 'RC-77', matchStatus: 'פיזור מוצע – לאישור' });
    expect(flowStepsOf(null, cheque)).toEqual({ identify: 'done', receipt: 'done', debt: 'waiting', allocation: 'current' });
  });
});

describe('the debt check table', () => {
  it('sums the open balance per due month, oldest first, with the running total, without the receipt itself', () => {
    const r = receipt({ receiptKey: 'RCPT-1', priorityReceiptNumber: 'RC-9', debtCheckMonths: '2026-08,2026-09' });
    const { months, undated } = monthBalancesOf(
      [
        mv({ docNumber: 'I-2', dueMonth: '2026-09', amount: 3000 }),
        mv({ docNumber: 'I-1', dueDate: '2026-08-31', amount: 5000 }),
        mv({ docNumber: 'I-3', dueMonth: '2026-09', amount: 1000.5 }),
        mv({ docNumber: 'RC-9', docType: 'קבלה', dueMonth: '2026-10', amount: -9000.5 }),
        mv({ docNumber: 'I-4', dueMonth: '2026-10', amount: 700 }),
        mv({ docNumber: 'X', amount: 50 }),
      ],
      r,
    );
    expect(months).toEqual([
      { month: '2026-08', balance: 5000, cumulative: 5000, closed: true },
      { month: '2026-09', balance: 4000.5, cumulative: 9000.5, closed: true },
      { month: '2026-10', balance: 700, cumulative: 9700.5, closed: false },
    ]);
    expect(undated).toBe(1);
  });
});

describe('copying the receipt into Priority', () => {
  it('lists customer, amount, value date, reference, payer, each invoice (full / partial) and what stays on account', () => {
    const r = receipt({ customerCode: 'TEST-001', customerName: 'אבי ובניו', amount: 10_000, valueDate: '2026-10-26', reference: 'REF-5', payerName: 'אבי', unallocatedAmount: 1000 });
    const text = priorityInstruction(r, [alloc({ invoiceNumber: 'INV-2', dueDate: '2026-10-31', amount: 3000, kind: 'חלקית' }), alloc({ invoiceNumber: 'INV-1', dueDate: '2026-09-30', amount: 6000, kind: 'מלאה' })]);
    const lines = text.split('\n');
    expect(lines[0]).toBe('לקוח: TEST-001 אבי ובניו');
    expect(lines[3]).toBe('אסמכתא: REF-5');
    expect(lines[4]).toBe('מעביר: אבי');
    expect(lines[5]).toMatch(/^חשבונית INV-1 – .*6,000.* \(מלאה\)$/);
    expect(lines[6]).toMatch(/^חשבונית INV-2 – .*3,000.* \(חלקית\)$/);
    expect(lines[7]).toMatch(/^על חשבון .*1,000/);
  });
});

describe('the accounts-payable contact', () => {
  it('takes the flagged contact, then the role, then the card', () => {
    const contacts = [{ id: 'c1', contactName: 'רונית', roleFlags: 'הנהלת חשבונות', email: 'r@x.co' }, { id: 'c2', contactName: 'דנה', isApContact: true, email: 'd@x.co' }] as FlowContact[];
    expect(apContactOf(undefined, contacts)?.name).toBe('דנה');
    expect(apContactOf(undefined, [contacts[0]])?.email).toBe('r@x.co');
    expect(apContactOf({ id: 'k', apContactName: 'יוסי' } as FlowCustomer, [])).toEqual({ name: 'יוסי', email: null, phone: null });
    expect(apContactOf(undefined, [])).toBeNull();
  });
});