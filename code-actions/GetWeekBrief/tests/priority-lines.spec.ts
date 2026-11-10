import { describe, expect, it } from 'vitest';
import { receiptsOfDay } from '../brief.ts';

const TUE = '2026-11-03';
const pull = { id: 'P1', kind: 'שורות דפי בנק – Priority', fileName: 'Priority – שורות דפי בנק 03.11.2026 09:30', dataDate: TUE, workDay: TUE, uploadedAt: '2026-11-03T07:30:00.000Z', status: 'נכתב', checkStatus: 'בבדיקה' };
const file = { id: 'F1', kind: 'קובץ בנק', fileName: 'bank.pdf', workDay: TUE, uploadedAt: '2026-11-03T05:00:00.000Z', extractionStatus: 'אומת', checkStatus: 'הושלמה' };
const line = (id: string, importBatchId: string, amount: number, lineType: string | null, extra: any = {}) => ({ bankLineId: id, importBatchId, amount, lineType, checkStage: 'לא מזוהה', status: 'לא מזוהה', ...extra });
const of = (batches: any[], lines: any[]) => receiptsOfDay({ batches, lines, lineProposals: [] } as any, TUE, () => true);

describe('GetWeekBrief – receipts: only money received counts (plan r3 stage 2)', () => {
  it('counts העברה / זיכוי בנק and legacy צ׳ק / untyped lines; never פירעון צ׳ק, אחר or צ׳ק חוזר; reads Priority pulls', () => {
    const r = of(
      [pull, file],
      [
        line('PL-1', 'P1', 1000, 'העברה'),
        line('PL-2', 'P1', 500, 'זיכוי בנק'),
        line('PL-3', 'P1', 7000, 'פירעון צ׳ק', { checkStage: null, status: 'חדשה' }),
        line('PL-4', 'P1', 42.1, 'אחר', { checkStage: null, status: 'חדשה' }),
        line('BL-1', 'F1', 300, 'צ׳ק'),
        line('BL-2', 'F1', 200, null),
        line('BL-3', 'F1', -100, 'צ׳ק חוזר', { checkStage: null }),
      ],
    );
    expect(r).toMatchObject({ pulled: 4, pulledAmount: 2000, toMatch: 4, unidentified: 4, notChecked: 0, bounced: 1 });
    expect(r.files.map((f: any) => f.id)).toEqual(['F1', 'P1']);
    expect(r.summary).toBe('נמשכו היום 4 העברות, 2,000 ₪. עוד לא תואמה אף אחת.');
  });

  it('a Priority pull has no reading step: its lines count as verified; a line still ממתינה לבדיקה is "not checked"', () => {
    const r = of([pull], [line('PL-1', 'P1', 1000, 'העברה', { checkStage: 'ממתינה לבדיקה', status: 'חדשה' }), line('PL-2', 'P1', 800, 'העברה')]);
    expect(r).toMatchObject({ pulled: 2, notChecked: 1 });
  });

  it('a pull with only פירעון צ׳ק / אחר lines: no money in (never "not verified yet")', () => {
    const r = of([pull], [line('PL-3', 'P1', 7000, 'פירעון צ׳ק'), line('PL-4', 'P1', 42.1, 'אחר')]);
    expect(r).toMatchObject({ pulled: 0, pulledAmount: 0 });
    expect(r.summary).toBe('בקובץ הבנק של היום אין העברות נכנסות.');
  });
});
