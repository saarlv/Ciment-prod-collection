import { agingFileName, agingSheetRows } from '@/utils/AgingExport';
import { DEFAULT_VIEW, bucketsOf } from '@/utils/AgingPanel';
import { isApprovedReceipt, matchStatusOf, receiptStatusOf } from '@/utils/ReceiptRecord';

describe('the receipt statuses (08.11 flow)', () => {
  it('shows the four allocation states as they are, and any older value as "על חשבון – צריך פיזור"', () => {
    expect(matchStatusOf({ matchStatus: 'מפוזרת – עודף על חשבון' })).toBe('מפוזרת – עודף על חשבון');
    expect(matchStatusOf({ matchStatus: 'פיזור מוצע – לאישור' })).toBe('פיזור מוצע – לאישור');
    expect(matchStatusOf({ matchStatus: 'ערך ישן כלשהו' })).toBe('על חשבון – צריך פיזור');
    expect(matchStatusOf({ matchStatus: '' })).toBeNull();
    expect(matchStatusOf(null)).toBeNull();
  });

  it('reads the receipt status and whether it is approved', () => {
    expect(receiptStatusOf({ receiptStatus: 'אושרה – לא נשלחה' })).toBe('אושרה – לא נשלחה');
    expect(receiptStatusOf({ receiptStatus: 'מוכנה' })).toBeNull();
    expect(isApprovedReceipt({ receiptStatus: 'הונפקה ב-Priority' })).toBe(true);
    expect(isApprovedReceipt({ receiptStatus: 'טיוטה – ממתינה לאישור' })).toBe(false);
  });
});

describe('aging export', () => {
  it('exports the table as displayed: customer columns, buckets with negative amounts, totals', () => {
    const buckets = bucketsOf([{ monthKey: '2026-09', label: 'ספטמבר 2026' }, { monthKey: '2026-10', label: 'אוקטובר 2026' }]);
    const rows = agingSheetRows(
      [
        {
          customerCode: 'C-1',
          customerName: 'לקוח',
          priorityStatus: 'פעיל',
          collectionNote: '30 לחודש',
          paymentMethod: 'העברה',
          paymentTermsLabel: 'שוטף + 60',
          salesAgentName: 'דני',
          contact: { name: 'רונית', phone: '050' },
          priorDebt: { amount: 100 },
          months: [
            { monthKey: '2026-09', amount: -260 },
            { monthKey: '2026-10', amount: 4100 },
          ],
          laterDebt: { amount: 0 },
          total: 3940,
        },
      ],
      buckets,
      DEFAULT_VIEW.columns,
      { priorDebt: 100, months: [{ monthKey: '2026-09', amount: -260 }, { monthKey: '2026-10', amount: 4100 }], laterDebt: 0, total: 3940 },
    );
    expect(rows[0]).toEqual([
      'קוד לקוח', 'שם לקוח', 'סטטוס', 'הערה לגבייה', 'אמצעי תשלום', 'תנאי תשלום', 'סוכן מטעם סימנט', 'איש קשר של הלקוח',
      'חוב קודם', 'ספטמבר 2026', 'אוקטובר 2026', 'חוב מאוחר', 'סה״כ',
    ]);
    expect(rows[1]).toEqual(['C-1', 'לקוח', 'פעיל', '30 לחודש', 'העברה', 'שוטף + 60', 'דני', 'רונית · 050', 100, -260, 4100, 0, 3940]);
    expect(rows[2]).toEqual(['סה״כ', null, null, null, null, null, null, null, 100, -260, 4100, 0, 3940]);
    expect(agingFileName('2026-10-26')).toBe('דוח-גיול-2026-10-26.xlsx');
  });
});