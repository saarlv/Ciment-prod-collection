import {
  applyMonthView,
  buildAging,
  chipFacts,
  customLabels,
  indexNotes,
  monthsInBucket,
  normalizeHour,
  notesInBucket,
  pullResultLine,
  reportFacts,
  reportSentences,
  runHour,
  settingsMap,
  taskPreviews,
  toMonthRows,
  windowKeys,
} from '@/utils/AgingMonths';
import type { CustomerNote, CustomerRow, SettingRow } from '@/utils/AgingMonths';
import { DEFAULT_VIEW } from '@/utils/AgingPanel';

const TODAY = '2026-11-05';
const KEYS = windowKeys(TODAY, 3, 0); // 2026-08 … 2026-11

const ROWS = toMonthRows([
  { customerCode: 'C-1', customerName: 'אלפא', dueMonth: '2026-05', openTotal: 1000, movementCount: 1 },
  { customerCode: 'C-1', customerName: 'אלפא', dueMonth: '2026-09', openTotal: 5000, movementCount: 2 },
  { customerCode: 'C-1', customerName: 'אלפא', dueMonth: '2026-11', openTotal: -400, movementCount: 1 },
  { customerCode: 'C-1', customerName: 'אלפא', dueMonth: '2027-01', openTotal: 2000, movementCount: 1 },
  { customerCode: 'C-2', customerName: 'בטא', dueMonth: '2026-10', openTotal: '3000', movementCount: 1 },
  { customerName: 'no code' },
]);

const customer = (code: string, extra: Partial<CustomerRow> = {}) => ({ id: `${code === 'C-1' ? 11 : 12}`, customerCode: code, customerName: code, ...extra }) as CustomerRow;
const note = (extra: Partial<CustomerNote>) => ({ id: Math.random().toString(36), customerCode: 'C-1', status: 'פעילה', noteCreatedAt: '2026-11-01T08:00:00Z', ...extra }) as CustomerNote;

describe('the aging report from movements', () => {
  it('puts months before the window in חוב קודם and after it in חוב מאוחר, so the total is the balance', () => {
    expect(KEYS).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    const { customers, balances, customerIds } = buildAging(ROWS, [customer('C-1', { ledgerBalance: 7600 }), customer('C-2', { ledgerBalance: 3500 })], [], KEYS);
    const a = customers.find((c) => c.customerCode === 'C-1')!;
    expect(a.priorDebt?.amount).toBe(1000);
    expect(a.months?.map((m) => m.amount)).toEqual([0, 5000, 0, -400]);
    expect(a.laterDebt?.amount).toBe(2000);
    expect(a.total).toBe(7600);
    expect(a.balanceMatches).toBe(true);
    const b = customers.find((c) => c.customerCode === 'C-2')!;
    expect(b.total).toBe(3000);
    expect(b.balanceMatches).toBe(false);
    expect(b.balanceDiff).toBe(500);
    expect(monthsInBucket(balances.get('C-1'), 'later', KEYS)).toEqual(['2027-01']);
    expect(customerIds.get('C-1')).toBe('11');
  });

  it('counts active notes per cell with a dot when an active date arrived', () => {
    const notes = indexNotes([
      note({ dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-04', outcome: 'לא קוימה' }),
      note({ dueMonth: '2026-09', noteType: 'אחר', customTypeLabel: 'ממתין לזיכוי', reminderDate: '2026-12-01' }),
      note({ dueMonth: '2026-09', noteType: 'חזור אליי', actionDate: '2026-11-01', status: 'נסגרה ידנית' }),
      note({ dueMonth: '2026-05', noteType: 'אחר', customTypeLabel: 'ממתין לזיכוי' }),
    ]);
    expect(chipFacts(notesInBucket(notes.get('C-1'), '2026-09', KEYS), TODAY)).toEqual({ count: 2, due: true });
    expect(chipFacts(notesInBucket(notes.get('C-1'), 'prior', KEYS), TODAY)).toEqual({ count: 1, due: false });
    expect(customLabels([...(notes.get('C-1') ?? [])])).toEqual(['ממתין לזיכוי']);
  });

  it('filters by notes, unnoted overdue months and commitments, and says what needs attention', () => {
    const { customers, balances } = buildAging(ROWS, [customer('C-1'), customer('C-2')], [], KEYS);
    const notes = indexNotes([note({ dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-04', outcome: 'קוימה חלקית' })]);
    const ctx = { balances, notes, today: TODAY };
    const codes = (filters: typeof DEFAULT_VIEW.filters) => applyMonthView(customers, ctx, { ...DEFAULT_VIEW, filters }, '').map((c) => c.customerCode);
    expect(codes([])).toEqual(['C-1', 'C-2']);
    expect(codes(['withNotes'])).toEqual(['C-1']);
    expect(codes(['broken'])).toEqual(['C-1']);
    expect(codes(['openPromises'])).toEqual([]);
    // C-1: 2026-05 has a balance and no note; C-2: 2026-10 has no note
    expect(codes(['unnotedPast'])).toEqual(['C-1', 'C-2']);
    expect(reportSentences(reportFacts(customers, ctx))).toEqual(['2 חודשים בפיגור עדיין בלי הערה', 'התחייבות אחת לא קוימה במלואה', 'הערה אחת הגיעה למועד']);
  });
});

describe('what a note will open', () => {
  const settings = settingsMap([
    { settingKey: 'agentChequeDays', value: '3' },
    { settingKey: 'noteTask.agentCheque.offsetDays', value: 'agentChequeDays' },
    { settingKey: 'noteTask.agentCheque.taskType', value: 'צ׳ק אצל סוכן – אין קבלה' },
  ] as SettingRow[]);

  it('uses the plan defaults, offsets from settings (a number or a setting key) and the reminder date', () => {
    expect(taskPreviews('התחייבות לתשלום', '2026-11-11', '', settingsMap([]))).toEqual([{ taskType: 'התחייבויות שלא קוימו', date: '2026-11-12' }]);
    expect(taskPreviews('צ׳ק אצל סוכן', '2026-11-11', '', settingsMap([]))[0].date).toBe('2026-11-13');
    expect(taskPreviews('צ׳ק אצל סוכן', '2026-11-11', '', settings)).toEqual([{ taskType: 'צ׳ק אצל סוכן – אין קבלה', date: '2026-11-14' }]);
    expect(taskPreviews('אחר', '', '2026-11-20', settings)).toEqual([{ taskType: 'תזכורות', date: '2026-11-20' }]);
    expect(taskPreviews('חזור אליי', '', '', settings)).toEqual([]);
  });
});

describe('the work-day hours and the pull result', () => {
  it('reads HH:MM and runs an hour with minutes at the next round hour', () => {
    expect(normalizeHour('6:30')).toBe('06:30');
    expect(normalizeHour('25:00')).toBeNull();
    expect(runHour('09:30')).toBe('10:00');
    expect(runHour('09:00')).toBe('09:00');
  });

  it('says what was pulled, or which step failed', () => {
    const ok = pullResultLine({
      ok: true,
      pulledAt: '2026-11-05T05:02:00Z',
      ran: [{ phase: '06:00', ok: true, steps: [{ step: 'PullPriorityCustomers', ok: true, rowsRead: 120 }, { step: 'PullOpenMovements', ok: true, rowsRead: 940 }] }],
    });
    expect(ok.ok).toBe(true);
    expect(ok.text).toContain('120 לקוחות');
    expect(ok.text).toContain('940 תנועות פתוחות');
    const failed = pullResultLine({ ok: false, ran: [{ phase: '06:00', ok: false, steps: [{ step: 'PullOpenMovements', ok: false, error: 'timeout' }] }], failedTask: { action: 'open' } });
    expect(failed).toEqual({ ok: false, text: 'המשיכה לא הושלמה – משיכת התנועות הפתוחות נכשלה: timeout. נפתחה משימה ״משיכת הבוקר נכשלה״, ושום דבר לא נמחק.' });
  });
});