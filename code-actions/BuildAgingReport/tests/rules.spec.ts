import { describe, expect, it } from 'vitest';
import {
  businessDaysBefore,
  hebrewMonthLabel,
  israelLocalToUtcIso,
  nextBusinessDay,
  previousBusinessDay,
  toIsraelDate,
} from '../../shared/collections-dates.ts';
import { bucketOfMonth, bucketOfNote, buildWindow, computeAging } from '../../shared/collections-aging.ts';

describe('business days (Sun–Thu)', () => {
  it('previous / next business day', () => {
    expect(previousBusinessDay('2026-10-21')).toBe('2026-10-20'); // Wed → Tue
    expect(previousBusinessDay('2026-10-25')).toBe('2026-10-22'); // Sun → Thu
    expect(previousBusinessDay('2026-10-24')).toBe('2026-10-22'); // Sat → Thu
    expect(nextBusinessDay('2026-10-22')).toBe('2026-10-25'); // Thu → Sun
    expect(nextBusinessDay('2026-10-23')).toBe('2026-10-25'); // Fri → Sun
    expect(businessDaysBefore('2026-10-21', 4)).toBe('2026-10-15');
  });
  it('Israel local time to UTC across the DST change', () => {
    expect(israelLocalToUtcIso('2026-10-21', 8, 30)).toBe('2026-10-21T05:30:00.000Z'); // IDT +3
    expect(israelLocalToUtcIso('2026-10-26', 8, 30)).toBe('2026-10-26T06:30:00.000Z'); // IST +2
    expect(toIsraelDate('2026-10-20T22:30:00.000Z')).toBe('2026-10-21');
    expect(toIsraelDate('2026-10-20T00:00:00.000Z')).toBe('2026-10-20');
  });
});

describe('aging buckets', () => {
  const w = buildWindow('2026-10-21', 3, 0);
  it('window and buckets', () => {
    expect(w.monthKeys).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(bucketOfMonth('2026-06', w)).toEqual({ kind: 'prior' });
    expect(bucketOfMonth('2026-11', w)).toEqual({ kind: 'later', monthKey: '2026-11' });
    expect(bucketOfNote('חוב מאוחר', w)).toEqual({ kind: 'later', monthKey: null });
    expect(bucketOfNote('חוב קודם', w)).toEqual({ kind: 'prior' });
    expect(hebrewMonthLabel('2026-11')).toBe('נובמבר 2026');
  });
  it('only invoices and credit notes create debt; empty type counts as invoice', () => {
    const r = computeAging({
      window: w,
      customers: [{ customerCode: 'C', customerName: 'c', ledgerBalance: 700 }],
      invoices: [
        { customerCode: 'C', documentType: 'חשבונית', openAmount: 500, dueDate: '2026-09-30' },
        { customerCode: 'C', documentType: '', openAmount: 300, dueDate: '2026-12-31' },
        { customerCode: 'C', documentType: 'חשבונית זיכוי', openAmount: -100, dueDate: '2026-01-31' },
        { customerCode: 'C', documentType: 'תעודת משלוח', openAmount: 999, dueDate: '2026-10-01' },
        { customerCode: 'C', documentType: 'חשבונית', openAmount: 0, dueDate: '2026-10-01' },
      ],
      notes: [],
      ownerMap: new Map(),
    });
    const c = r.customers[0];
    expect([c.priorDebt.amount, c.laterDebt.amount, c.total, c.balanceMatches]).toEqual([-100, 300, 700, true]);
  });
});
