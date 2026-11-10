import { describe, expect, it } from 'vitest';
import { receiptKeyOf, receiptLineIdOf, receiptRecordHref, receiptTaskKind, sourceKindOf, tabOf } from '@/utils/Tasks';
import type { Task } from '@/utils/Tasks';

const task = (t: Partial<Task>): Task => ({ id: t.id ?? 't1', ...t }) as Task;

describe('receipts tasks', () => {
  it('reads a returned cheque\'s bank line from relatedId, never from its cheque key', () => {
    const cheque = task({ taskKey: 'receipt-bounced:cheque:TEST-ACC-1 (בדיקה):004512', taskType: 'צ׳ק חוזר', relatedTable: 'BankLines', relatedId: 'BL-17' });
    expect(receiptLineIdOf(cheque)).toBe('BL-17');
    expect(receiptTaskKind(cheque)).toBeNull();
    expect(receiptLineIdOf(task({ taskKey: 'receipt-bounced:cheque:ACC:1', relatedTable: 'Receipts', relatedId: 'R1' }))).toBeNull();
  });

  it('puts "דפי בנק לא נטענו" under תקבולים and sends it to the receipts screen', () => {
    const missing = task({ taskKey: 'bank-missing:2026-11-03', taskType: 'דפי בנק לא נטענו', relatedTable: 'ImportBatches', relatedId: 'B1', source: 'תקבולים' });
    expect(tabOf(missing)).toBe('receipts');
    expect(sourceKindOf(missing)).toBe('bankDay');
    expect(receiptLineIdOf(missing)).toBeNull();
  });

  it('opens the identification tasks on their line, under תקבולים', () => {
    const identify = task({ taskKey: 'identify:PL-TEST-7', taskType: 'זיהוי לקוח – לאישור', relatedTable: 'BankLines', relatedId: 'PL-TEST-7', source: 'תקבולים' });
    expect(tabOf(identify)).toBe('receipts');
    expect(sourceKindOf(identify)).toBe('receipt');
    expect(receiptTaskKind(identify)).toBe('identify');
    expect(receiptLineIdOf(identify)).toBe('PL-TEST-7');
    expect(receiptKeyOf(identify)).toBeNull();
    expect(receiptTaskKind(task({ taskKey: 'receipt-customer:PL-9', taskType: 'לא זוהה' }))).toBe('customer');
    expect(receiptLineIdOf(task({ taskKey: 'receipt-customer:PL-9' }))).toBe('PL-9');
    const missingAp = task({ taskKey: 'missing-ap:TEST-001', taskType: 'חסר איש קשר הנהלת חשבונות', relatedTable: 'Receipts', relatedId: 'RCPT-PL-TEST-7', customerCode: 'TEST-001', source: 'תקבולים' });
    expect(tabOf(missingAp)).toBe('receipts');
    expect(sourceKindOf(missingAp)).toBe('customer');
  });

  it('opens the allocation and debt-check tasks on their receipt (?receipt=)', () => {
    const allocate = task({ taskKey: 'allocate:RCPT-PL-3', taskType: 'קבלה – צריך פיזור', relatedTable: 'Receipts', relatedId: 'RCPT-PL-3' });
    expect(tabOf(allocate)).toBe('receipts');
    expect(receiptTaskKind(allocate)).toBe('allocate');
    expect(receiptKeyOf(allocate)).toBe('RCPT-PL-3');
    expect(receiptRecordHref(allocate)).toBe('/collections/receipts?receipt=RCPT-PL-3');
    const debt = task({ taskKey: 'debt-check:RCPT-PL-4', taskType: 'לברר מול הלקוח – סכום לא סוגר חודש' });
    expect(tabOf(debt)).toBe('receipts');
    expect(receiptTaskKind(debt)).toBe('debt-check');
    expect(receiptKeyOf(debt)).toBe('RCPT-PL-4');
    const zero = task({ taskKey: 'debt-zero:RCPT-PL-5', taskType: 'נסגר לאפס', isAlert: true });
    expect(tabOf(zero)).toBe('receipts');
    expect(receiptTaskKind(zero)).toBe('debt-zero');
    expect(receiptRecordHref(task({ taskKey: 'identify:PL-1' }))).toBeNull();
  });
});