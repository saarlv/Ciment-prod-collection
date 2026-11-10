import { describe, expect, it } from 'vitest';
import { bankMissingLine, configErrorText, entersCheck, isPriorityLine, latestPull, legacyLineChip, syncResultLine } from '@/utils/ReceiptsDay';
import type { BankLine, Batch } from '@/utils/ReceiptsDay';

const batch = (b: Partial<Batch>): Batch => ({ id: b.id ?? 'b1', ...b }) as Batch;
const line = (l: Partial<BankLine>): BankLine => ({ id: l.id ?? l.bankLineId ?? 'x', ...l }) as BankLine;

describe('lines pulled from Priority', () => {
  it('tells Priority lines from old file lines, and checks only העברה / זיכוי בנק', () => {
    expect(isPriorityLine(line({ priorityLineId: 'PL-1' }))).toBe(true);
    expect(isPriorityLine(line({ priorityLineId: '' }))).toBe(false);
    expect(isPriorityLine(line({}))).toBe(false);
    expect(entersCheck(line({ lineType: 'העברה' }))).toBe(true);
    expect(entersCheck(line({ lineType: 'זיכוי בנק' }))).toBe(true);
    expect(entersCheck(line({ lineType: 'פירעון צ׳ק' }))).toBe(false);
    expect(entersCheck(line({ lineType: 'אחר' }))).toBe(false);
  });

  it('takes today\'s newest pull, never a bank file or another day', () => {
    const rows = [
      batch({ id: 'a', kind: 'שורות דפי בנק – Priority', dataDate: '2026-11-03', uploadedAt: '2026-11-03T05:00:00.000Z' }),
      batch({ id: 'b', kind: 'שורות דפי בנק – Priority', dataDate: '2026-11-03', uploadedAt: '2026-11-03T07:30:00.000Z' }),
      batch({ id: 'c', kind: 'קובץ בנק', dataDate: '2026-11-03', uploadedAt: '2026-11-03T09:00:00.000Z' }),
      batch({ id: 'd', kind: 'שורות דפי בנק – Priority', dataDate: '2026-11-02', uploadedAt: '2026-11-03T10:00:00.000Z' }),
    ];
    expect(latestPull(rows, '2026-11-03')?.id).toBe('b');
    expect(latestPull(rows, '2026-11-04')).toBeUndefined();
  });

  it('says what a pull did in one line, and names the settings error', () => {
    expect(syncResultLine({ linesFromSource: 15, created: 2, adopted: 13, alreadyThere: 0, checked: [{}, {}] })).toBe('נמשכו 15 שורות: 2 חדשות · 13 שויכו לשורות קיימות מקובץ · 2 זוהו.');
    expect(syncResultLine({ linesFromSource: 3, created: 0, alreadyThere: 3, checked: [], checksLeft: [] })).toBe('נמשכו 3 שורות: 0 חדשות · 3 כבר היו · 0 זוהו.');
    expect(syncResultLine({ linesFromSource: 0 })).toBe('פריוריטי לא החזיר שורות להיום.');
    expect(bankMissingLine({ bankMissingTask: { action: 'open' } })).toBe('נפתחה משימה ״דפי בנק לא נטענו״.');
    expect(bankMissingLine({ bankMissingTask: { action: 'close' } })).toBe('המשימה ״דפי בנק לא נטענו״ נסגרה – השורות הגיעו.');
    expect(bankMissingLine({ bankMissingTask: { action: 'none' } })).toBeNull();
    expect(configErrorText('bank-settings-missing')).toBe('חסרות הגדרות שעות דפי הבנק');
    expect(configErrorText(undefined)).toBeNull();
  });
});

describe('old file lines', () => {
  it('shows a returned cheque, an issued receipt, else the stored status as is', () => {
    expect(legacyLineChip(line({ lineType: 'צ׳ק חוזר', status: 'חדשה' }))).toEqual({ label: 'צ׳ק חוזר', tone: 'critical' });
    expect(legacyLineChip(line({ lineType: 'העברה', receiptKey: 'RCPT-1' }))).toEqual({ label: 'קבלה הונפקה', tone: 'done' });
    expect(legacyLineChip(line({ lineType: 'העברה', status: 'לא מזוהה' }))).toEqual({ label: 'לא מזוהה' });
    expect(legacyLineChip(line({ lineType: 'העברה' }))).toEqual({ label: '—' });
  });
});