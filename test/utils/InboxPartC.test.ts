import { describe, expect, it } from 'vitest';
import { foldersOf, insuranceOf, manualTasksOf, needsSenderCard, senderDecisionOf, signatureOf } from '@/utils/Inbox';
import { sourceKindOf, tabOf } from '@/utils/Tasks';
import type { Task } from '@/utils/Tasks';

const quotes = {
  signature: { companyName: 'בטון הצפון', personName: 'דנה', title: 'מנהלת חשבונות', quote: 'דנה\nבטון הצפון', verified: true, suggestion: { customerCode: 'C100', customerName: 'בטון הצפון בע״מ', how: 'שם החברה' } },
  insurance: { requestId: 'r1', requestedLimit: '250000', status: 'הוגשה למבטח' },
  manualTasks: [{ taskKey: 'manual:docs-manual:e1', taskId: 't1', taskType: 'תעודות / חשבוניות חסרות – טיפול ידני' }, 'junk'],
};

describe('part C mail helpers', () => {
  it('reads signature, insurance and manual tasks (also from a JSON string)', () => {
    expect(signatureOf(JSON.stringify(quotes))?.suggestion?.customerCode).toBe('C100');
    expect(insuranceOf(quotes)?.requestedLimit).toBe(250000);
    expect(manualTasksOf(quotes)).toHaveLength(1);
    expect(senderDecisionOf(quotes)).toBeNull();
  });
  it('shows the sender card only for an unverified mail with a signature, or after a decision', () => {
    expect(needsSenderCard({ senderVerification: 'לא מאומת', suggestedCustomerCode: null, classificationQuotes: quotes })).toBe(true);
    expect(needsSenderCard({ senderVerification: 'מאומת', suggestedCustomerCode: 'C1', classificationQuotes: {} })).toBe(false);
    expect(needsSenderCard({ senderVerification: 'מאומת', classificationQuotes: { senderDecision: { mode: 'confirm' } } })).toBe(true);
    expect(needsSenderCard({ senderVerification: 'לבדיקה', classificationQuotes: {} })).toBe(false);
  });
  it('puts insurance approvals in their own folder after פירוט תשלום', () => {
    expect(foldersOf({ categories: 'אישור ביטוח אשראי, פירוט תשלום' })).toEqual(['5', '6']);
  });
});

describe('part C tasks', () => {
  it('manual tasks go to the inbox tab and open their source', () => {
    const contact = { taskKey: 'manual:priority-contact:ours:C1:a@b.co', relatedTable: 'CustomerContacts', customerCode: 'C1' } as Task;
    expect(tabOf(contact)).toBe('inbox');
    expect(sourceKindOf(contact)).toBe('contact');
    const docs = { taskKey: 'manual:docs-manual:e1', relatedTable: 'InboundEmails', relatedId: 'e1', invoiceNumbers: 'IN1' } as Task;
    expect(sourceKindOf(docs)).toBe('email');
    expect(tabOf({ taskType: 'זיכוי / הפרש מחיר – טיפול ידני' } as Task)).toBe('inbox');
  });
});