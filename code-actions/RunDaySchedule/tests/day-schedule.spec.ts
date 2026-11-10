import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';
import { runDaySchedule } from '../../shared/collections-day-schedule.ts';
import { israelLocalToUtcIso } from '../../shared/collections-dates.ts';
import { noteTaskRule, PLAN_SETTING_KEYS, PLAN_SETTINGS } from '../../shared/plan-settings.ts';
import { type CustomersSource, testCustomersSource } from '../../shared/priority-customers-source.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke } from '../code.ts';

const T = '2026-11-04'; // Wednesday
const T2 = '2026-11-05';
const ctx: any = {};
const at = (date: string, hh: number, mm = 0) => israelLocalToUtcIso(date, hh, mm);
const emptyCustomers: CustomersSource = { ...testCustomersSource, fetchCustomers: async () => [] };

describe('plan settings', () => {
  it('every key is unique, ASCII, with a Hebrew label, a valid valueType and basis', () => {
    expect(new Set(PLAN_SETTING_KEYS).size).toBe(PLAN_SETTING_KEYS.length);
    for (const s of PLAN_SETTINGS) {
      expect(s.settingKey).toMatch(/^[A-Za-z][A-Za-z.]*$/);
      expect(s.label).toMatch(/[֐-׿]/);
      expect(s.description).toMatch(/[֐-׿]/);
      expect(['מספר', 'טקסט', 'כן או לא']).toContain(s.valueType);
      expect(['החלטת יניב', 'הנחה', 'ברירת מחדל']).toContain(s.basis);
      expect(s.value).not.toMatch(/["']/);
    }
  });

  it('the note → task rules resolve their references through the settings', () => {
    const settings = new Map([['agentChequeDays', '3']]);
    expect(noteTaskRule(settings, 'agentCheque')).toMatchObject({ noteType: 'צ׳ק אצל סוכן', taskType: 'צ׳ק אצל סוכן – אין קבלה', offsetDays: 3, runAt: 'morningPullAt' });
    expect(noteTaskRule(new Map(), 'promise')).toMatchObject({ taskType: 'התחייבויות שלא קוימו – ליצור קשר', offsetDays: 1, runAt: 'bankCheckAt' });
    expect(noteTaskRule(new Map(), 'agentCheque').offsetDays).toBe(2);
  });
});

describe('RunDaySchedule', () => {
  const w = makeWorld({ inboxActions: true });
  const batches = () => w.fake.rows('ImportBatches').filter((b) => b.kind === 'משיכת בוקר – Priority');
  const failedTasks = () => w.fake.rows('CollectionQueue').filter((t) => String(t.taskKey).startsWith('day-pull-failed:'));
  const setting = (k: string) => w.fake.rows('AgentSettings').find((s) => s.settingKey === k);
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(at(T, 5, 30)));
    current = w.client;
    expect((await seed({ dryRun: false, asOfDate: T }, ctx)).writeVerified).toBe(true);
    // an older hour row: bankRecheckAt takes its value; an existing plan row is never overwritten
    w.fake.insert('AgentSettings', [
      { settingKey: 'receiptsReadyBy', value: '10:30', valueType: 'טקסט', isTestFixture: false },
      { settingKey: 'identifyCertainAt', value: '85', valueType: 'מספר', basis: 'הוגדר במסך', isTestFixture: false },
    ]);
  });
  afterAll(() => vi.useRealTimers());

  it('dryRun is the default (invoke, mode ידני): reports the decision and every step, writes nothing', async () => {
    const mark = w.fake.calls.length;
    const r = await invoke({}, ctx);
    expect([r.dryRun, r.mode]).toEqual([true, 'ידני']);
    expect(r.due).toEqual(['06:00']);
    expect(r.settingsCreated.length).toBe(PLAN_SETTING_KEYS.length - 1);
    expect(r.ran[0].steps.map((s: any) => s.step)).toEqual(['PullPriorityCustomers', 'PullOpenMovements', 'PullOpenOrders', 'CloseSettledNotes', 'RefreshInvoiceLayer', 'BuildTasks']);
    expect(r.ran[0].steps.every((s: any) => s.ok)).toBe(true);
    expect(writesSince(w.fake, mark)).toEqual([]);
  });

  it('scheduled before the morning hour: settings created once, nothing due', async () => {
    const r = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: false, asOfDate: T, asOfTime: '05:30' }, { nowIso: at(T, 5, 30) });
    expect(r.errors).toEqual([]);
    expect(r.settingsCreated.sort()).toEqual(PLAN_SETTING_KEYS.filter((k) => k !== 'identifyCertainAt').sort());
    expect(setting('bankRecheckAt')?.value).toBe('10:30');
    expect(setting('identifyCertainAt')?.value).toBe('85');
    expect(setting('morningPullAt')).toMatchObject({ value: '06:00', valueType: 'טקסט', basis: 'החלטת יניב', isTestFixture: false });
    expect(setting('customerAutoApproveAt')?.value).toBe('');
    expect(r.settings).toMatchObject({ morningPullAt: '06:00', bankCheckAt: '09:00', bankRecheckAt: '10:30', runsAt: { '06:00': '06:00', '09:00': '09:00', '10:00': '11:00' } });
    expect(r.due).toEqual([]);
    expect(r.ran).toEqual([]);
    const again = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: false, asOfDate: T, asOfTime: '05:45' }, { nowIso: at(T, 5, 45) });
    expect(again.settingsCreated).toEqual([]);
  });

  it('a failed pull: nothing written by the pulls, ImportBatches נכשל, the day-pull-failed task opens; the next hour retries', async () => {
    const movementsBefore = JSON.stringify(w.fake.rows('OpenMovements'));
    const customersBefore = JSON.stringify(w.fake.rows('Customers'));
    const r = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: false, asOfDate: T, asOfTime: '06:00' }, { nowIso: at(T, 6, 0), customersSource: emptyCustomers });
    expect(r.ok).toBe(false);
    expect(r.due).toEqual(['06:00']);
    expect(r.ran[0].ok).toBe(false);
    expect(r.ran[0].steps.map((s: any) => s.step)).toEqual(['PullPriorityCustomers']);
    expect(r.pulledAt).toBe('');
    expect(JSON.stringify(w.fake.rows('OpenMovements'))).toBe(movementsBefore);
    expect(JSON.stringify(w.fake.rows('Customers'))).toBe(customersBefore);
    expect(batches()).toHaveLength(1);
    expect(batches()[0]).toMatchObject({ runMode: 'בוקר', runPhase: '06:00', dataDate: T, status: 'נכשל', isTestFixture: false });
    expect(r.failedTask).toMatchObject({ action: 'open', taskKey: `day-pull-failed:${T}`, change: 'created' });
    expect(failedTasks()).toHaveLength(1);
    expect(failedTasks()[0]).toMatchObject({
      taskType: 'משיכת הבוקר נכשלה',
      source: 'דוח גיול',
      severity: 'גבוהה',
      isAlert: false,
      needsManagerApproval: false,
      isTestFixture: false,
      status: 'ממתין',
      relatedTable: 'ImportBatches',
      relatedId: batches()[0].id,
    });
    // not counted as run: due again at 07:00; failing again refreshes the same task
    const r2 = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: false, asOfDate: T, asOfTime: '07:00' }, { nowIso: at(T, 7, 0), customersSource: emptyCustomers });
    expect(r2.alreadyRan).toEqual([]);
    expect(r2.due).toEqual(['06:00']);
    expect(r2.failedTask.change).toBe('refreshed');
    expect(failedTasks()).toHaveLength(1);
  });

  it('a successful 06:00 phase: one ImportBatches row נכתב with runSummary per step, the failed task closes, no second run that day', async () => {
    const r = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: false, asOfDate: T, asOfTime: '08:00' }, { nowIso: at(T, 8, 0) });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.ran[0].ok).toBe(true);
    expect(r.pulledAt).toBe(at(T, 8, 0));
    const b = batches().find((x) => x.id === r.ran[0].importBatchId)!;
    expect(b).toMatchObject({ kind: 'משיכת בוקר – Priority', runMode: 'בוקר', runPhase: '06:00', dataDate: T, status: 'נכתב', isTestFixture: false, uploadedAt: at(T, 8, 0) });
    expect(b.runSummary.map((s: any) => [s.step, s.ok])).toEqual([
      ['PullPriorityCustomers', true],
      ['PullOpenMovements', true],
      ['PullOpenOrders', true],
      ['CloseSettledNotes', true],
      ['RefreshInvoiceLayer', true],
      ['BuildTasks', true],
    ]);
    for (const s of b.runSummary) expect(Object.keys(s).sort()).toEqual(['error', 'note', 'ok', 'rowsRead', 'rowsWritten', 'step']);
    expect(b.rowsRead).toBeGreaterThan(0);
    expect(w.fake.rows('OpenMovements').length).toBeGreaterThan(20);
    expect(w.fake.rows('OpenMovements').every((m) => m.importBatchId === b.id)).toBe(true);
    expect(r.failedTask).toMatchObject({ action: 'close', taskKey: `day-pull-failed:${T}` });
    expect(failedTasks()[0]).toMatchObject({ status: 'נסגר אוטומטית' });
    // every task the scan opened carries isAlert false
    expect(w.fake.rows('CollectionQueue').filter((t) => t.openedAt === at(T, 8, 0)).every((t) => t.isAlert === false)).toBe(true);

    // since stage 2 the bank checks are built: at 09:00 only the bank check is due (the 06:00 phase does not run again)
    const r2 = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: true, asOfDate: T, asOfTime: '09:00' }, { nowIso: at(T, 9, 0) });
    expect(r2.alreadyRan).toEqual(['06:00']);
    expect(r2.due).toEqual(['09:00']);
    expect(r2.notBuiltYet).toEqual([]);
    expect(r2.ran.map((x: any) => x.phase)).toEqual(['09:00']);
    // a missed hour: both checks due → one check, as 10:00
    const r3 = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: true, asOfDate: T, asOfTime: '11:00' }, { nowIso: at(T, 11, 0) });
    expect(r3.due).toEqual(['09:00', '10:00']);
    expect(r3.notBuiltYet).toEqual([]);
    expect(r3.ran.map((x: any) => x.phase)).toEqual(['10:00']);
    expect(r3.bankCheck).toMatchObject({ phase: '10:00', merged: true });
  });

  it('mode ידני runs the 06:00 phase again now (runMode ידני), whatever the hour', async () => {
    const r = await runDaySchedule(w.client, { mode: 'ידני', dryRun: false, asOfDate: T, asOfTime: '13:20' }, { nowIso: at(T, 13, 20) });
    expect(r.ok).toBe(true);
    expect(r.alreadyRan).toEqual(['06:00']);
    expect(batches().find((x) => x.id === r.ran[0].importBatchId)).toMatchObject({ runMode: 'ידני', status: 'נכתב', uploadedBy: 'בודק' });
  });

  it('an hour with minutes runs at the next round hour; a changed setting needs no code change', async () => {
    w.fake.rows('AgentSettings').find((s) => s.settingKey === 'morningPullAt')!.value = '06:30';
    const early = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: true, asOfDate: T2, asOfTime: '06:45' }, { nowIso: at(T2, 6, 45) });
    expect(early.settings.runsAt['06:00']).toBe('07:00');
    expect(early.due).toEqual([]);
    const onTime = await runDaySchedule(w.client, { mode: 'מתוזמן', dryRun: true, asOfDate: T2, asOfTime: '07:00' }, { nowIso: at(T2, 7, 0) });
    expect(onTime.due).toEqual(['06:00']);
    w.fake.rows('AgentSettings').find((s) => s.settingKey === 'morningPullAt')!.value = '06:00';
  });

  it('rejects a bad mode or clock', async () => {
    expect((await runDaySchedule(w.client, { mode: 'x' })).errors[0]).toContain('mode');
    expect((await runDaySchedule(w.client, { asOfTime: '25:00' })).errors[0]).toContain('asOfTime');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The bank-check phases (09:00 bankCheckAt / 10:00 bankRecheckAt) – plan 04.11 stage 2
// ---------------------------------------------------------------------------------------------------------------------
describe('RunDaySchedule – the bank-check phases', () => {
  const D1 = '2026-11-09'; // Monday
  const D2 = '2026-11-10';
  const D3 = '2026-11-11';
  const w = makeWorld({ inboxActions: true });
  const client = w.client;
  const bankRows = (date: string) => w.fake.rows('ImportBatches').filter((b) => b.kind === 'בדיקת דף בנק' && b.dataDate === date);
  const urgent = (date: string) => w.fake.rows('CollectionQueue').filter((t) => t.taskKey === `bank-missing:${date}`);
  const promiseTasks = (date: string) => w.fake.rows('CollectionQueue').filter((t) => String(t.taskKey).startsWith(`notes:promise:${date}:`));
  const run = (date: string, hh: number, input: any = {}) =>
    runDaySchedule(client, { mode: 'מתוזמן', dryRun: false, asOfDate: date, asOfTime: `${String(hh).padStart(2, '0')}:00`, ...input }, { nowIso: at(date, hh, 0) });
  let noteId = '';
  /** a commitment due for its check (actionDate two days back) on a TEST customer's open month */
  const addCommitment = (actionDate: string) => {
    const totals = new Map<string, number>();
    for (const m of w.fake.rows('OpenMovements')) if (String(m.customerCode).startsWith('TEST-')) totals.set(`${m.customerCode}|${m.dueMonth}`, (totals.get(`${m.customerCode}|${m.dueMonth}`) ?? 0) + Number(m.amount));
    const [cell] = [...totals.entries()].filter(([, v]) => v > 1000).sort(([a], [b]) => a.localeCompare(b));
    const [code, month] = cell[0].split('|');
    const customer = w.fake.rows('Customers').find((c) => c.customerCode === code)!;
    const [n] = w.fake.insert('CustomerNotes', [
      {
        customer: Number(customer.id),
        customerCode: code,
        customerName: customer.customerName,
        noteCreatedAt: at(actionDate, 8, 0),
        dueMonth: month,
        noteType: 'התחייבות לתשלום',
        actionDate,
        amount: 987654,
        balanceAtNote: cell[1],
        authorName: 'בודקת',
        noteSource: 'צוות',
        status: 'פעילה',
        outcome: 'פתוחה',
        isTestFixture: true,
      },
    ]);
    return String(n.id);
  };
  const note = () => w.fake.rows('CustomerNotes').find((n) => n.id === noteId)!;
  const agentReceipts = () => w.fake.rows('Receipts').filter((x) => x.receiptSource === 'צ׳ק סוכן');

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(at(D1, 5, 30)));
    current = client;
    expect((await seed({ dryRun: false, asOfDate: D1 }, ctx)).writeVerified).toBe(true);
    const morning = await run(D1, 6);
    expect(morning.ran[0]).toMatchObject({ phase: '06:00', ok: true });
    noteId = addCommitment('2026-11-05');
  });
  afterAll(() => vi.useRealTimers());

  it('09:00, bank statement not in Priority: one row (bankLoaded false, נכתב), nothing else – no commitment check', async () => {
    const r = await run(D1, 9, { bankScenario: 'יום ריק' });
    expect(r.errors).toEqual([]);
    expect(r.due).toEqual(['09:00']);
    expect(r.ran).toHaveLength(1);
    expect(r.ran[0].steps.map((s: any) => s.step)).toEqual(['CheckBankStatementInPriority']);
    expect(r.bankCheck).toMatchObject({ phase: '09:00', ran: true, ok: true, loaded: false, linesFound: 0, receiptsRun: null, commitments: null, urgentTask: 'none' });
    expect(bankRows(D1)).toEqual([expect.objectContaining({ runPhase: '09:00', runMode: 'בוקר', bankLoaded: false, status: 'נכתב', isTestFixture: false })]);
    expect(note().outcome).toBe('פתוחה');
    expect(urgent(D1)).toEqual([]);
  });

  it('10:00, still not loaded: the urgent task opens and no commitment is checked today', async () => {
    const r = await run(D1, 10, { bankScenario: 'יום ריק' });
    expect(r.errors).toEqual([]);
    expect(r.alreadyRan).toEqual(['06:00', '09:00']);
    expect(r.due).toEqual(['10:00']);
    expect(r.ran[0].steps.map((s: any) => s.step)).toEqual(['CheckBankStatementInPriority', 'BankStatementMissingTask']);
    expect(r.bankCheck).toMatchObject({ phase: '10:00', loaded: false, urgentTask: 'open', commitments: null });
    expect(urgent(D1)).toEqual([
      expect.objectContaining({
        taskType: 'דף הבנק לא עלה לפריוריטי',
        severity: 'קריטית',
        source: 'תקבולים',
        status: 'ממתין',
        isAlert: false,
        relatedTable: 'ImportBatches',
        relatedId: bankRows(D1).find((b) => b.runPhase === '10:00')!.id,
      }),
    ]);
    expect(String(urgent(D1)[0].reasons)).toContain('משימות ההתחייבות לא נוצרו היום; ייבדקו ביום הבא שדף הבנק יעלה');
    expect(bankRows(D1).find((b) => b.runPhase === '10:00')).toMatchObject({ bankLoaded: false, status: 'נכתב' });
    expect(note().outcome).toBe('פתוחה');
    expect(promiseTasks(D1)).toEqual([]);
    // nothing more that day
    const later = await run(D1, 11, { bankScenario: 'יום ריק' });
    expect(later.due).toEqual([]);
    expect(later.ran).toEqual([]);
  });

  it('next day, both checks due in one run (missed hours): ONE check as 10:00 – receipts run, pull, close, commitments, the grouped task; 12:00 runs nothing', async () => {
    expect((await run(D2, 6)).ran[0].ok).toBe(true);
    const r = await run(D2, 11);
    expect(r.errors).toEqual([]);
    expect(r.due).toEqual(['09:00', '10:00']);
    expect(r.ran.map((x: any) => x.phase)).toEqual(['10:00']);
    expect(r.ran[0].steps.map((s: any) => [s.step, s.ok])).toEqual([
      ['CheckBankStatementInPriority', true],
      ['SyncPriorityBankLines', true],
      ['PullAgentReceipts', true],
      ['PullOpenMovements', true],
      ['CloseSettledNotes', true],
      ['CheckCommitments', true],
      ['BuildTasks', true],
      ['CloseBankMissingTask', true],
    ]);
    expect(r.bankCheck).toMatchObject({ phase: '10:00', merged: true, loaded: true, linesFound: 15 });
    expect(r.bankCheck.receiptsRun).toMatchObject({ ok: true, linesFromSource: 15 });
    expect(r.bankCheck.commitments.checked).toBeGreaterThanOrEqual(1);
    // stage 7: the seeded field agents' cheques became receipts (צ׳ק סוכן) with their debt check, right after the receipts run
    expect(r.bankCheck.agentReceipts).toMatchObject({ ok: true, found: 2, created: 2 });
    expect(agentReceipts().map((x) => [x.customerCode, x.receiptStatus, x.identifyStatus, x.debtCheckResult]).sort()).toEqual([
      ['TEST-013', 'אושרה – לא נשלחה', 'אושר', 'נסגר לאפס – חודש אחד'],
      ['TEST-014', 'אושרה – לא נשלחה', 'אושר', 'נסגר לאפס – מצטבר'],
    ]);
    expect(bankRows(D2)[0].runSummary.find((x: any) => x.step === 'PullAgentReceipts')).toMatchObject({ ok: true, rowsRead: 2, rowsWritten: 2 });
    expect(bankRows(D2)).toEqual([expect.objectContaining({ runPhase: '10:00', bankLoaded: true, status: 'נכתב' })]);
    expect(bankRows(D2)[0].runSummary.map((x: any) => x.step)).toContain('CheckCommitments');
    // the commitment was checked (nothing came in for 987,654 ₪) and joined the grouped task of the day
    expect(note()).toMatchObject({ amountRemaining: expect.any(Number) });
    expect(['לא קוימה', 'קוימה חלקית']).toContain(note().outcome);
    // one grouped task per bookkeeper (the seed's own commitments are judged too since wave 3)
    const tasks = promiseTasks(D2);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    for (const t of tasks) expect(t).toMatchObject({ taskType: 'התחייבויות שלא קוימו – ליצור קשר', source: 'דוח גיול', relatedTable: 'CustomerNotes', status: 'ממתין', isAlert: false });
    expect(new Set(tasks.map((t) => t.taskKey)).size).toBe(tasks.length);
    expect(tasks.filter((t) => t.itemsJson.some((row: any) => row.noteIds.includes(noteId)))).toHaveLength(1);
    // the receipts run's own day rule was skipped (the runner owns bank-missing)
    expect(urgent(D2)).toEqual([]);
    const noon = await run(D2, 12);
    expect(noon.due).toEqual([]);
    expect(noon.ran).toEqual([]);
  });

  it('a loaded 09:00 check: the 10:00 recheck is skipped and reported; the urgent task of the day closes', async () => {
    expect((await run(D3, 6)).ran[0].ok).toBe(true);
    // an urgent task opened for the day by the bank-lines pull run by itself (before the statement arrived)
    w.fake.insert('CollectionQueue', [{ taskKey: `bank-missing:${D3}`, taskType: 'דפי בנק לא נטענו', status: 'ממתין', source: 'תקבולים', title: 'x', isAlert: false }]);
    const r = await run(D3, 9);
    expect(r.errors).toEqual([]);
    expect(r.ran[0]).toMatchObject({ phase: '09:00', ok: true });
    expect(r.bankCheck).toMatchObject({ phase: '09:00', loaded: true, urgentTask: 'close' });
    expect(urgent(D3)[0]).toMatchObject({ status: 'נסגר אוטומטית' });
    expect(String(urgent(D3)[0].resolvedReason)).toContain('דף הבנק נמצא בפריוריטי');
    // the agent cheques are taken once
    expect(r.bankCheck.agentReceipts).toMatchObject({ ok: true, created: 0 });
    expect(agentReceipts()).toHaveLength(2);
    // the commitment is in the D2 task already: not added again (once)
    expect(promiseTasks(D3)).toEqual([]);
    const ten = await run(D3, 10);
    expect(ten.alreadyRan).toEqual(['06:00', '09:00']);
    expect(ten.due).toEqual([]);
    expect(ten.ran).toEqual([]);
    expect(ten.bankCheck).toMatchObject({ phase: '10:00', ran: false, skipped: true });
    expect(String(ten.bankCheck.reason)).toContain('הבדיקה החוזרת של 10:00 לא נדרשת');
  });

  it('a failed step leaves the phase uncounted (נכשל) – the next hour retries', async () => {
    const D4 = '2026-11-12';
    expect((await run(D4, 6)).ran[0].ok).toBe(true);
    const failing = { ...client, queryTable: (table: string, q: any) => (table === 'Receipts' ? Promise.reject(new Error('simulated')) : client.queryTable(table, q)) };
    const r = await runDaySchedule(failing, { mode: 'מתוזמן', dryRun: false, asOfDate: D4, asOfTime: '09:00', bankScenario: 'יום מלא' }, { nowIso: at(D4, 9, 0) });
    expect(r.ok).toBe(false);
    expect(r.ran[0].ok).toBe(false);
    expect(bankRows(D4)).toEqual([expect.objectContaining({ runPhase: '09:00', status: 'נכשל' })]);
    const retry = await run(D4, 10);
    expect(retry.due).toEqual(['09:00', '10:00']);
    expect(retry.ran[0]).toMatchObject({ phase: '10:00', ok: true });
  });

  it('the agent-cheque step failing is recorded in the run summary and does not stop the phase', async () => {
    const D5 = '2026-11-15'; // Sunday
    expect((await run(D5, 6)).ran[0].ok).toBe(true);
    const failing = { ...client, queryTable: (table: string, q: any) => (table === 'Payments' && JSON.stringify(q.where ?? {}).includes('collectedBy') ? Promise.reject(new Error('simulated')) : client.queryTable(table, q)) };
    const r = await runDaySchedule(failing, { mode: 'מתוזמן', dryRun: false, asOfDate: D5, asOfTime: '09:00', bankScenario: 'יום מלא' }, { nowIso: at(D5, 9, 0) });
    expect(r.ran[0].steps.map((s: any) => [s.step, s.ok])).toEqual([
      ['CheckBankStatementInPriority', true],
      ['SyncPriorityBankLines', true],
      ['PullAgentReceipts', false],
      ['PullOpenMovements', true],
      ['CloseSettledNotes', true],
      ['CheckCommitments', true],
      ['BuildTasks', true],
      ['CloseBankMissingTask', true],
    ]);
    expect(r.ran[0].ok).toBe(true);
    expect(r.errors).toEqual([expect.stringContaining('PullAgentReceipts: Payments: simulated')]);
    const row = bankRows(D5)[0];
    expect(row).toMatchObject({ runPhase: '09:00', status: 'נכתב' });
    expect(row.runSummary.find((x: any) => x.step === 'PullAgentReceipts')).toMatchObject({ ok: false, error: expect.stringContaining('simulated') });
  });

  it('the agent-cheque step runs only when the phase runs: not when the statement is not in Priority', async () => {
    const D6 = '2026-11-16';
    expect((await run(D6, 6)).ran[0].ok).toBe(true);
    const r = await run(D6, 9, { bankScenario: 'יום ריק' });
    expect(r.ran[0].steps.map((s: any) => s.step)).toEqual(['CheckBankStatementInPriority']);
    expect(r.bankCheck.agentReceipts).toBeNull();
  });
});
