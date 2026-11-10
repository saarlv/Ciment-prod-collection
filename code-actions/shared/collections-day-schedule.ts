// The work-day decision – plan 04.11 part A (RunDaySchedule, called every round hour 06:00–12:00 Sun–Thu by DayRunner and
// by the button "משוך עכשיו מפריוריטי").
//
// 1. Settings: every AgentSettings row of the plan exists (shared/plan-settings.ts ensurePlanSettings – a missing row is
//    inserted once from the plan default, never overwritten; bankRecheckAt takes receiptsReadyBy's value).
// 2. Decision: a phase is due when the clock has reached the round hour its setting runs at (an hour with minutes runs
//    at the next round hour) and today's ImportBatches has no successful (נכתב) row of that runPhase. The phases:
//      06:00 morningPullAt  משיכת בוקר – Priority
//      09:00 bankCheckAt    בדיקת דף בנק   (not due once a 10:00 check succeeded today)
//      10:00 bankRecheckAt  בדיקת דף בנק   (not due when today's 09:00 check found the bank statement – reported)
//    Both bank checks due in one run (a missed hour) → ONE check, as 10:00. The bank check runs after a successful (or
//    earlier) 06:00 phase only; a 06:00 phase that fails in this run leaves the bank check to the next hour.
//    mode ידני (the button) runs only the 06:00 phase now, whatever the hour and even if it already ran today.
// 3. The 06:00 phase: PullPriorityCustomers → PullOpenMovements → PullOpenOrders (collections-morning-pull.ts) →
//    CloseSettledNotes (months at 0 ₪ close their notes) → the morning task scan (RefreshInvoiceLayer → BuildTasks, which also builds the grouped note tasks whose runAt is morningPullAt), and ONE ImportBatches row (kind
//    משיכת בוקר – Priority, runMode בוקר / ידני, runPhase 06:00, runSummary per step). Created first (נקרא) so every pull
//    carries its id, finished at the end (נכתב / נכשל).
// 4. Failure: a failed step stops the phase (nothing after it runs, so nothing is deleted or closed), the row ends נכשל
//    (not counted – the next hour retries), and the task day-pull-failed:<date> is opened; a successful phase closes it.
// 5. The bank-check phase (09:00 / 10:00), one ImportBatches row (kind בדיקת דף בנק, runPhase, bankLoaded): is the bank
//    statement in Priority (collections-bank-check.ts – the bank-lines test source until the API)? Loaded → the existing
//    receipts run (SyncPriorityBankLines' shared pull, in-process, its own day rule skipped) → the field agents' cheques
//    (PullAgentReceipts – collections-agent-receipts.ts; a failure is recorded in runSummary, the phase goes on) → PullOpenMovements →
//    CloseSettledNotes → CheckCommitments → the grouped commitment task (BuildTasks phase 09:00) → the urgent task
//    bank-missing:<date> closes. Not loaded at 09:00 → recorded (bankLoaded false), nothing else. Not loaded at 10:00 →
//    the urgent task דף הבנק לא עלה לפריוריטי opens and no commitment is checked today (they are checked on the next day
//    the bank loads). A failed step → נכשל, retried next hour.
// dryRun (default true): settings are not inserted, every step runs in its own dryRun, nothing is written.
// Never writes to Priority and never contacts anyone.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { formatDateHe, israelToday, resolveAsOf, toIsraelDate, TZ } from './collections-dates.ts';
import { errText, num, readAll, readByIds, str } from './collections-data.ts';
import { layerSummary, refreshInvoiceLayer } from './collections-invoice-layer.ts';
import { pullOpenMovements, pullOpenOrders, pullPriorityCustomers } from './collections-morning-pull.ts';
import { SEV_HIGH, severityConfigFrom } from './collections-severity.ts';
import { closeKeyedTasks, openKeyedTask } from './collections-task-upsert.ts';
import { bankMissingKey, buildTaskRow, dayPullFailedKey, TT_BANK_MISSING, TT_BANK_NOT_IN_PRIORITY, TT_DAY_PULL_FAILED } from './collections-tasks.ts';
import { bankNotInPriorityRow, checkBankStatementInPriority } from './collections-bank-check.ts';
import { checkCommitments, closeSettledNotes } from './collections-note-runs.ts';
import { PHASE_BANK_CHECK as NOTE_PHASE_BANK, PHASE_MORNING as NOTE_PHASE_MORNING, runBuildTasks } from './collections-note-tasks.ts';
import { syncPriorityBankLines } from './priority-bank-sync.ts';
import { agentStepCounts, pullAgentReceipts } from './collections-agent-receipts.ts';
import type { BankStatementSource } from './priority-bank-source.ts';
import { ensurePlanSettings, hourSetting, S_BANK_CHECK_AT, S_BANK_RECHECK_AT, S_MORNING_PULL_AT } from './plan-settings.ts';
import type { CustomersSource } from './priority-customers-source.ts';
import type { MovementsSource } from './priority-movements-source.ts';
import type { ExposureSource } from './priority-orders-source.ts';

export const MODE_SCHEDULED = 'מתוזמן';
export const MODE_MANUAL = 'ידני';
export const RUN_MODE_MORNING = 'בוקר';
export const RUN_MODE_MANUAL = 'ידני';
export const KIND_MORNING_PULL = 'משיכת בוקר – Priority';
export const KIND_BANK_CHECK = 'בדיקת דף בנק';
export const PHASE_MORNING = '06:00';
export const PHASE_BANK_CHECK = '09:00';
export const PHASE_BANK_RECHECK = '10:00';
export const BATCH_READ = 'נקרא';
export const BATCH_WRITTEN = 'נכתב';
export const BATCH_FAILED = 'נכשל';
export const SYSTEM_ACTOR = 'יום העבודה (מערכת)';
const ESCALATE = 'להסלים למנהל';
const FAILED_KEY_PREFIX = 'day-pull-failed:';

/** The phases of the day: runPhase (ImportBatches enum label) → the hour setting it runs at, and its kind. */
export const PHASES = [
  { phase: PHASE_MORNING, settingKey: S_MORNING_PULL_AT, kind: KIND_MORNING_PULL, built: true },
  { phase: PHASE_BANK_CHECK, settingKey: S_BANK_CHECK_AT, kind: KIND_BANK_CHECK, built: true },
  { phase: PHASE_BANK_RECHECK, settingKey: S_BANK_RECHECK_AT, kind: KIND_BANK_CHECK, built: true },
] as const;
/** the 06:00 phase's steps, in order (the phase succeeds only when all ran and succeeded) */
export const MORNING_STEPS = ['PullPriorityCustomers', 'PullOpenMovements', 'PullOpenOrders', 'CloseSettledNotes', 'RefreshInvoiceLayer', 'BuildTasks'];
const BANK_KEY_PREFIX = 'bank-missing:';
/** the bank-check phase's agent-cheque step (stage 7) – never stops the phase */
export const STEP_AGENT_RECEIPTS = 'PullAgentReceipts';

export interface StepSummary {
  step: string;
  ok: boolean;
  rowsRead: number;
  rowsWritten: number;
  note: string;
  error: string;
  /** the step's full report (not stored in runSummary) */
  result?: Item;
}

export interface DayScheduleDeps {
  /** real time of the run */
  nowIso?: string;
  customersSource?: CustomersSource;
  movementsSource?: MovementsSource;
  exposureSource?: ExposureSource;
  /** the bank statement source (check + receipts run); the bank-lines test source by default */
  bankSource?: BankStatementSource;
  /** ms since the run started (the receipts run stops starting line checks near the Lambda limit) */
  elapsedMs?: () => number;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const israelHhmm = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(/^24/, '00');

const firstError = (errors: unknown) => (Array.isArray(errors) && errors.length ? errors.map(String).join('; ') : '');

/** Runs one step; an exception becomes a failed step. */
async function step(name: string, fn: () => Promise<{ ok: boolean; rowsRead: number; rowsWritten: number; note: string; error?: string; result: Item }>): Promise<StepSummary> {
  try {
    const r = await fn();
    return { step: name, ok: r.ok, rowsRead: r.rowsRead, rowsWritten: r.rowsWritten, note: r.note, error: r.ok ? '' : r.error || 'נכשל', result: r.result };
  } catch (e) {
    return { step: name, ok: false, rowsRead: 0, rowsWritten: 0, note: '', error: errText(e) };
  }
}

/** The 06:00 phase's steps (pulls, then the morning task scan). A failed pull stops the rest. */
export async function runMorningPhase(
  client: BlocksClient,
  x: { asOfDate: string; dryRun: boolean; importBatchId: string | null; nowIso: string },
  deps: DayScheduleDeps = {},
): Promise<StepSummary[]> {
  const steps: StepSummary[] = [];
  const base = { dryRun: x.dryRun, importBatchId: x.importBatchId };
  const verb = x.dryRun ? 'ייכתבו' : 'נכתבו';

  const customers = await step('PullPriorityCustomers', async () => {
    const r = await pullPriorityCustomers(client, base, { nowIso: x.nowIso, source: deps.customersSource });
    return {
      ok: r.ok,
      rowsRead: r.fromSource,
      rowsWritten: r.created + r.updated + r.markedInactive.length,
      note: `${r.fromSource} לקוחות מהמקור: ${r.created} חדשים, ${r.updated} עודכנו, ${r.unchanged} ללא שינוי, ${r.markedInactive.length} סומנו לא פעילים, ${r.reactivated.length} חזרו לפעילות`,
      error: firstError(r.errors),
      result: r as unknown as Item,
    };
  });
  steps.push(customers);
  if (!customers.ok) return steps;

  const movements = await step('PullOpenMovements', async () => {
    const r = await pullOpenMovements(client, base, { nowIso: x.nowIso, source: deps.movementsSource });
    return {
      ok: r.ok,
      rowsRead: r.fromSource,
      rowsWritten: r.written + r.deleted,
      note: `${r.fromSource} תנועות פתוחות ל-${r.customers} לקוחות: ${r.written} ${verb}, ${r.deleted} ישנות ${x.dryRun ? 'יימחקו' : 'נמחקו'}${r.unknownCustomers.length ? `, ${r.unknownCustomers.length} קודי לקוח לא מוכרים` : ''}`,
      error: firstError(r.errors),
      result: r as unknown as Item,
    };
  });
  steps.push(movements);
  if (!movements.ok) return steps;

  const orders = await step('PullOpenOrders', async () => {
    const r = await pullOpenOrders(client, base, { nowIso: x.nowIso, source: deps.exposureSource });
    return {
      ok: r.ok,
      rowsRead: r.itemsFromSource,
      rowsWritten: r.written + r.deleted,
      note: r.note || `חשיפה ל-${r.customers} לקוחות, ${r.itemsFromSource} פריטים: ${r.written} שורות ${verb} (${r.changed} עם שינוי מעבר ל-syncedAt)`,
      error: firstError(r.errors),
      result: r as unknown as Item,
    };
  });
  steps.push(orders);
  if (!orders.ok) return steps;

  // months whose open balance reached 0 close their notes (only after a successful pull – never on an empty mirror)
  const settled = await step('CloseSettledNotes', async () => {
    const r = await closeSettledNotes(client, { asOfDate: x.asOfDate, dryRun: x.dryRun, nowIso: x.nowIso, syncTasks: false });
    return {
      ok: r.errors.length === 0,
      rowsRead: r.monthsChecked,
      rowsWritten: r.notesClosed,
      note: `${r.monthsChecked} חודשים עם הערות פעילות: ${r.monthsSettled} התאפסו, ${r.notesClosed} הערות ${x.dryRun ? 'ייסגרו' : 'נסגרו'}${r.commitmentsKept ? ` (${r.commitmentsKept} התחייבויות קוימו)` : ''}${r.skipped.some((s) => !s.dueMonth) ? ' – OpenMovements ריקה, לא נסגר דבר' : ''}`,
      error: firstError(r.errors),
      result: { monthsChecked: r.monthsChecked, monthsSettled: r.monthsSettled, notesClosed: r.notesClosed, commitmentsKept: r.commitmentsKept, writeVerified: r.writeVerified, errors: r.errors },
    };
  });
  steps.push(settled);
  if (!settled.ok) return steps;

  // the morning task scan, same shared code as RefreshInvoiceLayer / BuildTasks (commitments are judged by
  // CheckCommitments in the bank-check phase – the old 06:00 promise scan is gone)
  steps.push(
    await step('RefreshInvoiceLayer', async () => {
      const r = await refreshInvoiceLayer(client, { dryRun: x.dryRun, nowIso: x.nowIso });
      const s = layerSummary(r);
      return {
        ok: r.errors.length === 0,
        rowsRead: r.invoicesChecked,
        rowsWritten: r.invoicesChanged,
        note: `${r.invoicesChecked} חשבוניות נבדקו, ${r.invoicesChanged} ${x.dryRun ? 'ישתנו' : 'עודכנו'}`,
        error: firstError(r.errors),
        result: { invoicesChecked: s.invoicesChecked, invoicesChanged: s.invoicesChanged, writeVerified: s.writeVerified, errors: s.errors },
      };
    }),
  );
  steps.push(
    await step('BuildTasks', async () => {
      const r = await runBuildTasks(client, { asOfDate: x.asOfDate, dryRun: x.dryRun, nowIso: x.nowIso, phase: NOTE_PHASE_MORNING });
      const nt = r.noteTasks;
      return {
        ok: r.errors.length === 0,
        rowsRead: r.found + (nt?.rows ?? 0),
        rowsWritten: r.created + r.refreshed + r.reopened + r.autoClosed + (nt ? nt.created + nt.refreshed + nt.reopened + nt.autoClosed : 0),
        note:
          `${r.found} בעיות פתוחות: ${r.created} משימות חדשות, ${r.refreshed} רועננו, ${r.reopened} נפתחו מחדש, ${r.autoClosed} נסגרו אוטומטית` +
          (nt ? `; משימות מרוכזות: ${nt.created} חדשות, ${nt.refreshed} רועננו, ${nt.autoClosed} נסגרו, ${nt.rows} שורות` : ''),
        error: firstError(r.errors),
        result: {
          found: r.found,
          created: r.created,
          refreshed: r.refreshed,
          reopened: r.reopened,
          autoClosed: r.autoClosed,
          keptClosedByPerson: r.keptClosedByPerson,
          noteTasks: nt ? { created: nt.created, refreshed: nt.refreshed, reopened: nt.reopened, autoClosed: nt.autoClosed, rows: nt.rows, byType: nt.byType } : null,
          writeVerified: r.writeVerified,
          errors: r.errors,
        },
      };
    }),
  );
  return steps;
}

export interface DayScheduleResult {
  ok: boolean;
  dryRun: boolean;
  mode: string;
  asOfDate: string;
  asOfTime: string;
  settings: Item;
  settingsCreated: string[];
  due: string[];
  alreadyRan: string[];
  ran: { phase: string; ok: boolean; importBatchId: string; steps: StepSummary[] }[];
  notBuiltYet: string[];
  pulledAt: string;
  failedTask: Item;
  bankCheck: Item;
  errors: string[];
}

interface RunRow {
  kind: string;
  phase: string;
  runMode: string;
  asOfDate: string;
  asOfTime: string;
  startedAt: string;
  uploadedBy: string;
}

/** The phase's ImportBatches row, created first (נקרא) so its steps can carry its id. */
async function createRunRow(client: BlocksClient, r: RunRow, errors: string[]): Promise<string> {
  try {
    const batch = (
      await client.createItem('ImportBatches', {
        fileName: `${r.kind} ${r.phase} ${formatDateHe(r.asOfDate)} ${r.asOfTime}`,
        fileUrl: null,
        kind: r.kind,
        dataDate: r.asOfDate,
        workDay: r.asOfDate,
        uploadedBy: r.uploadedBy,
        uploadedAt: r.startedAt,
        rowsRead: 0,
        rowsWritten: 0,
        status: BATCH_READ,
        errors: null,
        runMode: r.runMode,
        runPhase: r.phase,
        bankLoaded: null,
        runSummary: [],
        isTestFixture: false,
      })
    )?.item;
    return str(batch?.id);
  } catch (e) {
    errors.push(`ImportBatches: ${errText(e)}`);
    return '';
  }
}

/** Finishes the phase's row: status נכתב / נכשל, counts, runSummary per step (and bankLoaded for a bank check). */
async function finishRunRow(client: BlocksClient, batchId: string, steps: StepSummary[], ok: boolean, extra: Item, errors: string[]) {
  const runSummary = steps.map((s) => ({ step: s.step, ok: s.ok, rowsRead: s.rowsRead, rowsWritten: s.rowsWritten, note: s.note, error: s.error }));
  const status = ok ? BATCH_WRITTEN : BATCH_FAILED;
  const failed = steps.filter((s) => !s.ok);
  try {
    await client.updateItem('ImportBatches', batchId, {
      status,
      rowsRead: steps.reduce((n, s) => n + s.rowsRead, 0),
      rowsWritten: steps.reduce((n, s) => n + s.rowsWritten, 0),
      runSummary,
      errors: failed.length ? failed.map((s) => `${s.step}: ${s.error}`).join('; ') : null,
      ...extra,
    });
    const [back] = await readByIds(client, 'ImportBatches', [batchId]);
    if (!back || str(back.status) !== status) errors.push(`ImportBatches ${batchId}: לא נקרא בחזרה כפי שנכתב`);
  } catch (e) {
    errors.push(`ImportBatches ${batchId}: ${errText(e)}`);
  }
}

// ---------- the bank-check phase ----------
export interface BankPhaseResult {
  steps: StepSummary[];
  ok: boolean;
  loaded: boolean | null;
  linesFound: number;
  receiptsRun: Item | null;
  /** stage 7: PullAgentReceipts' report (null when the phase did not reach it) */
  agentReceipts: Item | null;
  commitments: Item | null;
  urgentTask: 'open' | 'close' | 'none';
  urgentTaskDetail: Item | null;
}

/** The bank-check phase's steps (09:00 / 10:00). A failed step stops the rest. */
export async function runBankCheckPhase(
  client: BlocksClient,
  x: { phase: string; asOfDate: string; asOfTime: string; dryRun: boolean; importBatchId: string | null; nowIso: string; settings: Map<string, string>; readyBy: string },
  deps: DayScheduleDeps = {},
): Promise<BankPhaseResult> {
  const out: BankPhaseResult = { steps: [], ok: false, loaded: null, linesFound: 0, receiptsRun: null, agentReceipts: null, commitments: null, urgentTask: 'none', urgentTaskDetail: null };
  const verb = x.dryRun ? 'ייכתבו' : 'נכתבו';
  const key = bankMissingKey(x.asOfDate);
  const isTest = false;

  const check = await step('CheckBankStatementInPriority', async () => {
    const r = await checkBankStatementInPriority({ loadDate: x.asOfDate, source: deps.bankSource });
    out.loaded = r.error ? null : r.loaded;
    out.linesFound = r.linesFound;
    return {
      ok: !r.error,
      rowsRead: r.linesFound,
      rowsWritten: 0,
      note: r.error ? '' : r.loaded ? `דף הבנק נמצא בפריוריטי (${r.linesFound} שורות)` : `דף הבנק עוד לא עלה לפריוריטי (בדיקה ב-${x.asOfTime})`,
      error: r.error ? `בדיקת דף הבנק נכשלה: ${r.error}` : '',
      result: r as unknown as Item,
    };
  });
  out.steps.push(check);
  if (!check.ok) return out;

  if (!out.loaded) {
    if (x.phase === PHASE_BANK_CHECK) {
      out.ok = true;
      return out;
    }
    // 10:00 and still not loaded: the urgent task, no commitment check today
    const urgent = await step('BankStatementMissingTask', async () => {
      const row = bankNotInPriorityRow({ asOfDate: x.asOfDate, asOfTime: x.asOfTime, readyBy: x.readyBy, relatedId: x.importBatchId ?? '', nowIso: x.nowIso, settings: x.settings, isTest, fromDayRunner: true });
      const r = await openKeyedTask(client, { row, nowIso: x.nowIso, asOfDate: x.asOfDate, dryRun: x.dryRun });
      out.urgentTask = r.change === 'keptClosed' ? 'none' : 'open';
      out.urgentTaskDetail = { taskKey: key, change: r.change, taskIds: r.taskIds };
      return {
        ok: r.errors.length === 0,
        rowsRead: 0,
        rowsWritten: x.dryRun || r.change === 'keptClosed' ? 0 : 1,
        note:
          r.change === 'keptClosed'
            ? 'המשימה הדחופה נסגרה על ידי אדם היום ונשארת סגורה'
            : `משימה דחופה "${TT_BANK_NOT_IN_PRIORITY}" ${x.dryRun ? 'תיפתח' : r.change === 'refreshed' ? 'רועננה' : 'נפתחה'}; משימות ההתחייבות לא נוצרו היום`,
        error: firstError(r.errors),
        result: r as unknown as Item,
      };
    });
    out.steps.push(urgent);
    out.ok = urgent.ok;
    return out;
  }

  const receipts = await step('SyncPriorityBankLines', async () => {
    const r = await syncPriorityBankLines(
      client,
      { dryRun: x.dryRun, asOfDate: x.asOfDate, asOfTime: x.asOfTime },
      { nowIso: x.nowIso, skipDayRule: true, ...(deps.bankSource ? { source: deps.bankSource } : {}), ...(deps.elapsedMs ? { elapsedMs: deps.elapsedMs } : {}) },
    );
    out.receiptsRun = { ok: r.ok, importBatchId: r.importBatchId, linesFromSource: r.linesFromSource, created: r.created, adopted: r.adopted, alreadyThere: r.alreadyThere, checked: (r.checked ?? []).length, checksLeft: (r.checksLeft ?? []).length, writeVerified: r.writeVerified, errors: r.errors };
    return {
      ok: r.ok === true,
      rowsRead: num(r.linesFromSource),
      rowsWritten: num(r.created) + num(r.adopted),
      note: `${num(r.linesFromSource)} שורות דף בנק: ${num(r.created)} חדשות, ${num(r.adopted)} אומצו, ${num(r.alreadyThere)} כבר היו; ${(r.checked ?? []).length} נבדקו${(r.checksLeft ?? []).length ? `, ${(r.checksLeft ?? []).length} ייבדקו בהמשך` : ''}`,
      error: firstError(r.errors),
      result: out.receiptsRun,
    };
  });
  out.steps.push(receipts);
  if (!receipts.ok) return out;

  // stage 7: the field agents' cheques (Payments) → receipts, debt check, proposal, "צ׳ק אצל סוכן" notes. Its failure is
  // recorded in the run summary (ok false + error) but never stops the phase.
  const agents = await step(STEP_AGENT_RECEIPTS, async () => {
    const r = await pullAgentReceipts(client, { asOfDate: x.asOfDate, dryRun: x.dryRun }, { nowIso: x.nowIso, settings: x.settings });
    out.agentReceipts = { ok: r.ok, found: r.found, created: r.created, skipped: r.skipped, rechecked: r.rechecked, notesClosed: r.notesClosed, summary: r.summary, errors: r.errors };
    const errs = (r.errors ?? []) as string[];
    return {
      ok: r.ok === true,
      ...agentStepCounts(r),
      note: `${r.summary}${r.ok && errs.length ? ` (${errs.length === 1 ? 'הערה' : `${errs.length} הערות`}: ${errs.join('; ')})` : ''}`,
      error: firstError(errs),
      result: out.agentReceipts,
    };
  });
  out.steps.push(agents);

  const movements = await step('PullOpenMovements', async () => {
    const r = await pullOpenMovements(client, { dryRun: x.dryRun, importBatchId: x.importBatchId }, { nowIso: x.nowIso });
    return {
      ok: r.ok,
      rowsRead: r.fromSource,
      rowsWritten: r.written + r.deleted,
      note: `משיכה חוזרת: ${r.fromSource} תנועות פתוחות ל-${r.customers} לקוחות, ${r.written} ${verb}`,
      error: firstError(r.errors),
      result: { customers: r.customers, fromSource: r.fromSource, written: r.written, deleted: r.deleted, writeVerified: r.writeVerified, errors: r.errors },
    };
  });
  out.steps.push(movements);
  if (!movements.ok) return out;

  const settled = await step('CloseSettledNotes', async () => {
    const r = await closeSettledNotes(client, { asOfDate: x.asOfDate, dryRun: x.dryRun, nowIso: x.nowIso, syncTasks: false });
    return {
      ok: r.errors.length === 0,
      rowsRead: r.monthsChecked,
      rowsWritten: r.notesClosed,
      note: `${r.monthsSettled} חודשים התאפסו, ${r.notesClosed} הערות ${x.dryRun ? 'ייסגרו' : 'נסגרו'}`,
      error: firstError(r.errors),
      result: { monthsChecked: r.monthsChecked, monthsSettled: r.monthsSettled, notesClosed: r.notesClosed, commitmentsKept: r.commitmentsKept, errors: r.errors },
    };
  });
  out.steps.push(settled);
  if (!settled.ok) return out;

  const commitments = await step('CheckCommitments', async () => {
    const r = await checkCommitments(client, { asOfDate: x.asOfDate, dryRun: x.dryRun, nowIso: x.nowIso, syncTasks: false });
    out.commitments = { checked: r.checked, kept: r.kept, partlyKept: r.partlyKept, notKept: r.notKept };
    return {
      ok: r.errors.length === 0,
      rowsRead: r.checked,
      rowsWritten: x.dryRun ? 0 : r.checked,
      note: `${r.checked} התחייבויות נבדקו: ${r.kept} קוימו, ${r.partlyKept} קוימו חלקית, ${r.notKept} לא קוימו`,
      error: firstError(r.errors),
      result: { ...out.commitments, writeVerified: r.writeVerified, errors: r.errors },
    };
  });
  out.steps.push(commitments);
  if (!commitments.ok) return out;

  const tasks = await step('BuildTasks', async () => {
    const r = await runBuildTasks(client, { asOfDate: x.asOfDate, dryRun: x.dryRun, nowIso: x.nowIso, phase: NOTE_PHASE_BANK });
    const nt = r.noteTasks;
    return {
      ok: r.errors.length === 0,
      rowsRead: nt?.rows ?? 0,
      rowsWritten: nt ? nt.created + nt.refreshed + nt.reopened + nt.autoClosed : 0,
      note: nt ? `משימת ההתחייבויות המרוכזת: ${nt.created} חדשות, ${nt.refreshed} רועננו, ${nt.autoClosed} נסגרו, ${nt.byType?.promise?.rows ?? 0} שורות` : 'לא נבנו משימות מרוכזות',
      error: firstError(r.errors),
      result: { noteTasks: nt ? { created: nt.created, refreshed: nt.refreshed, reopened: nt.reopened, autoClosed: nt.autoClosed, rows: nt.rows, byType: nt.byType } : null, writeVerified: r.writeVerified, errors: r.errors },
    };
  });
  out.steps.push(tasks);
  if (!tasks.ok) return out;

  const close = await step('CloseBankMissingTask', async () => {
    const reason = `דף הבנק נמצא בפריוריטי ב-${formatDateHe(x.asOfDate)} ${x.asOfTime}`;
    const results = await Promise.all(
      [TT_BANK_NOT_IN_PRIORITY, TT_BANK_MISSING].map((taskType) => closeKeyedTasks(client, { taskType, keyPrefix: key, reason, nowIso: x.nowIso, dryRun: x.dryRun })),
    );
    const closedIds = results.flatMap((r) => (r.change === 'closed' ? r.taskIds : []));
    out.urgentTask = closedIds.length ? 'close' : 'none';
    out.urgentTaskDetail = { taskKey: key, taskIds: closedIds };
    const errs = results.flatMap((r) => r.errors);
    return {
      ok: errs.length === 0,
      rowsRead: 0,
      rowsWritten: x.dryRun ? 0 : closedIds.length,
      note: closedIds.length ? `המשימה "${TT_BANK_NOT_IN_PRIORITY}" ${x.dryRun ? 'תיסגר' : 'נסגרה'}` : 'אין משימת דף בנק פתוחה',
      error: errs.join('; '),
      result: { closedIds, errors: errs },
    };
  });
  out.steps.push(close);
  out.ok = close.ok;
  return out;
}

export async function runDaySchedule(client: BlocksClient, input: Item = {}, deps: DayScheduleDeps = {}): Promise<DayScheduleResult> {
  const startedAt = deps.nowIso ?? new Date().toISOString();
  const startedMs = Date.now();
  const elapsedMs = deps.elapsedMs ?? (() => Date.now() - startedMs);
  const dryRun = input?.dryRun !== false && input?.dryRun !== 'false';
  const mode = str(input?.mode).trim() || MODE_MANUAL;
  // input.bankScenario (the old test-source scenario) is still accepted and ignored
  const errors: string[] = [];
  const out: DayScheduleResult = {
    ok: false,
    dryRun,
    mode,
    asOfDate: '',
    asOfTime: '',
    settings: {},
    settingsCreated: [],
    due: [],
    alreadyRan: [],
    ran: [],
    notBuiltYet: [],
    pulledAt: '',
    failedTask: { action: 'none', taskKey: '' },
    bankCheck: { phase: null, ran: false, reason: '' },
    errors,
  };
  if (![MODE_SCHEDULED, MODE_MANUAL].includes(mode)) {
    errors.push(`mode "${mode}" לא מוכר (${MODE_SCHEDULED} / ${MODE_MANUAL})`);
    return out;
  }
  try {
    out.asOfDate = input?.asOfDate ? resolveAsOf(input.asOfDate) : israelToday();
  } catch (e) {
    errors.push(errText(e));
    return out;
  }
  const asOfTime = str(input?.asOfTime).trim() || israelHhmm(startedAt);
  if (!HHMM.test(asOfTime)) {
    errors.push(`asOfTime "${asOfTime}" אינו שעה בפורמט HH:MM`);
    return out;
  }
  out.asOfTime = asOfTime;
  const asOfDate = out.asOfDate;

  // ---------- 1. settings ----------
  const ensured = await ensurePlanSettings(client, { dryRun });
  out.settingsCreated = ensured.created;
  errors.push(...ensured.errors);
  const hours = PHASES.map((p) => ({ ...p, hour: hourSetting(ensured.settings, p.settingKey) }));
  out.settings = {
    ...Object.fromEntries(hours.map((h) => [h.settingKey, h.hour.value])),
    runsAt: Object.fromEntries(hours.map((h) => [h.phase, h.hour.runsAt])),
  };
  for (const h of hours) if (!h.hour.hhmm) errors.push(`${h.settingKey} = "${h.hour.value}" אינו שעה בפורמט HH:MM – שלב ${h.phase} לא נבדק`);

  // ---------- 2. today's runs + the decision ----------
  let todays: Item[];
  try {
    todays = (await readAll(client, 'ImportBatches', { column: 'runPhase', operator: 'in', value: PHASES.map((p) => p.phase) })).filter(
      (r) => toIsraelDate(r.dataDate) === asOfDate,
    );
  } catch (e) {
    errors.push(`ImportBatches: ${errText(e)} – לא ידוע מה כבר רץ היום, לא הורץ דבר`);
    return out;
  }
  const okRows = (p: (typeof PHASES)[number]) => todays.filter((r) => str(r.runPhase) === p.phase && str(r.kind) === p.kind && str(r.status) === BATCH_WRITTEN);
  const ranOk = (p: (typeof PHASES)[number]) => okRows(p).length > 0;
  out.alreadyRan = PHASES.filter(ranOk).map((p) => p.phase);
  const reached = hours.filter((h) => h.hour.runsAt && asOfTime >= h.hour.runsAt).map((h) => h.phase);
  const [pMorning, pBank, pRecheck] = PHASES;
  const loadedAt09 = okRows(pBank).some((r) => r.bankLoaded === true || r.bankLoaded === 'true');
  let bankPhase: string | null = null;
  if (mode === MODE_MANUAL) {
    out.due = [PHASE_MORNING];
  } else {
    const due: string[] = [];
    if (reached.includes(PHASE_MORNING) && !ranOk(pMorning)) due.push(PHASE_MORNING);
    // 09:00 is superseded once a 10:00 check succeeded today
    const due09 = reached.includes(PHASE_BANK_CHECK) && !ranOk(pBank) && !ranOk(pRecheck);
    const recheckReached = reached.includes(PHASE_BANK_RECHECK) && !ranOk(pRecheck);
    const due10 = recheckReached && !loadedAt09;
    if (due09) due.push(PHASE_BANK_CHECK);
    if (due10) due.push(PHASE_BANK_RECHECK);
    out.due = due;
    // both due (a missed hour) → one check, as 10:00
    bankPhase = due10 ? PHASE_BANK_RECHECK : due09 ? PHASE_BANK_CHECK : null;
    if (recheckReached && loadedAt09) {
      out.bankCheck = { phase: PHASE_BANK_RECHECK, ran: false, skipped: true, reason: `דף הבנק נמצא בבדיקת ${PHASE_BANK_CHECK} – הבדיקה החוזרת של ${PHASE_BANK_RECHECK} לא נדרשת היום` };
    }
  }
  out.notBuiltYet = out.due.filter((ph) => !PHASES.find((p) => p.phase === ph)!.built);
  const runMode = mode === MODE_MANUAL ? RUN_MODE_MANUAL : RUN_MODE_MORNING;
  let uploadedBy = SYSTEM_ACTOR;
  if (!dryRun && mode === MODE_MANUAL) {
    try {
      const u = (await client.getCurrentUser())?.user;
      if (str(u?.name).trim()) uploadedBy = str(u?.name).trim();
    } catch {
      // a scheduled-style call without a user: the system name stays
    }
  }

  // ---------- 3. the 06:00 phase ----------
  let morningOk = true;
  if (out.due.includes(PHASE_MORNING)) {
    let batchId = '';
    if (!dryRun) {
      batchId = await createRunRow(client, { kind: KIND_MORNING_PULL, phase: PHASE_MORNING, runMode, asOfDate, asOfTime, startedAt, uploadedBy }, errors);
      if (!batchId) {
        errors.push('שורת הריצה ב-ImportBatches לא נוצרה – שלב 06:00 לא רץ');
        out.ran.push({ phase: PHASE_MORNING, ok: false, importBatchId: '', steps: [] });
        return out;
      }
    }
    const steps = await runMorningPhase(client, { asOfDate, dryRun, importBatchId: batchId || null, nowIso: startedAt }, deps);
    const phaseOk = steps.length === MORNING_STEPS.length && steps.every((s) => s.ok);
    morningOk = phaseOk;
    const pulledAt = deps.nowIso ?? new Date().toISOString();
    for (const s of steps) if (!s.ok) errors.push(`${s.step}: ${s.error}`);
    out.ran.push({ phase: PHASE_MORNING, ok: phaseOk, importBatchId: batchId, steps });
    if (phaseOk) out.pulledAt = pulledAt;
    if (!dryRun) await finishRunRow(client, batchId, steps, phaseOk, {}, errors);

    // ---------- 4. the failed-pull task ----------
    const key = dayPullFailedKey(asOfDate);
    if (phaseOk) {
      const r = await closeKeyedTasks(client, {
        taskType: TT_DAY_PULL_FAILED,
        keyPrefix: FAILED_KEY_PREFIX,
        reason: `משיכת הבוקר מפריוריטי הצליחה ב-${formatDateHe(asOfDate)} ${israelHhmm(pulledAt)}`,
        nowIso: pulledAt,
        dryRun,
      });
      errors.push(...r.errors);
      out.failedTask = { action: r.change === 'closed' ? 'close' : 'none', taskKey: r.change === 'closed' ? r.taskKey : '', taskIds: r.taskIds };
    } else {
      const failedSteps = steps.filter((s) => !s.ok);
      const cfg = severityConfigFrom(ensured.settings);
      const row = buildTaskRow({
        kind: 'day-pull-failed',
        id: asOfDate,
        taskType: TT_DAY_PULL_FAILED,
        title: `משיכת הבוקר מפריוריטי נכשלה – ${formatDateHe(asOfDate)}`,
        reasons:
          `משיכת הבוקר (${runMode === RUN_MODE_MANUAL ? 'ידנית' : 'מתוזמנת'}, ${asOfTime}) לא הושלמה: ` +
          (failedSteps.map((s) => `${s.step} – ${s.error}`).join('; ') || 'שגיאה לא ידועה') +
          '. לא נמחק ולא נסגר דבר; הנתונים מהמשיכה הקודמת נשארו. המשיכה תנוסה שוב בשעה העגולה הבאה, או בכפתור "משוך עכשיו מפריוריטי".',
        recommendedAction: ESCALATE,
        severity: { level: SEV_HIGH, score: Math.round(cfg.scoreHigh) },
        customerCode: null,
        customerName: null,
        owner: null,
        amount: null,
        invoiceNumbers: [],
        relatedTable: 'ImportBatches',
        relatedId: batchId,
        dueAt: new Date(Date.parse(pulledAt) + 60 * 60_000).toISOString(),
        asOfDate,
        nowIso: pulledAt,
        isTestFixture: false,
        needsManagerApproval: false,
        isAlert: false,
      });
      const r = await openKeyedTask(client, { row, nowIso: pulledAt, asOfDate, dryRun });
      errors.push(...r.errors);
      out.failedTask = { action: r.change === 'keptClosed' ? 'none' : 'open', taskKey: key, change: r.change, taskIds: r.taskIds };
    }
  }

  // ---------- 5. the bank-check phase ----------
  if (bankPhase && !morningOk) {
    out.bankCheck = { phase: bankPhase, ran: false, skipped: true, reason: 'משיכת הבוקר לא הושלמה בריצה הזאת – בדיקת דף הבנק תרוץ בשעה העגולה הבאה' };
  } else if (bankPhase) {
    let batchId = '';
    if (!dryRun) {
      batchId = await createRunRow(client, { kind: KIND_BANK_CHECK, phase: bankPhase, runMode, asOfDate, asOfTime, startedAt, uploadedBy }, errors);
      if (!batchId) {
        errors.push(`שורת הריצה ב-ImportBatches לא נוצרה – בדיקת דף הבנק (${bankPhase}) לא רצה`);
        out.ran.push({ phase: bankPhase, ok: false, importBatchId: '', steps: [] });
        out.bankCheck = { phase: bankPhase, ran: false, reason: 'שורת הריצה לא נוצרה' };
      }
    }
    if (dryRun || batchId) {
      const readyBy = hourSetting(ensured.settings, S_BANK_RECHECK_AT).hhmm ?? '';
      const r = await runBankCheckPhase(
        client,
        { phase: bankPhase, asOfDate, asOfTime, dryRun, importBatchId: batchId || null, nowIso: startedAt, settings: ensured.settings, readyBy },
        { ...deps, elapsedMs },
      );
      for (const s of r.steps) if (!s.ok) errors.push(`${s.step}: ${s.error}`);
      out.ran.push({ phase: bankPhase, ok: r.ok, importBatchId: batchId, steps: r.steps });
      if (!dryRun) await finishRunRow(client, batchId, r.steps, r.ok, { bankLoaded: r.loaded }, errors);
      out.bankCheck = {
        phase: bankPhase,
        ran: true,
        ok: r.ok,
        ...(out.due.includes(PHASE_BANK_CHECK) && out.due.includes(PHASE_BANK_RECHECK) ? { merged: true, reason: `${PHASE_BANK_CHECK} ו-${PHASE_BANK_RECHECK} הגיעו יחד – רצה בדיקה אחת כ-${PHASE_BANK_RECHECK}` } : {}),
        loaded: r.loaded,
        linesFound: r.linesFound,
        receiptsRun: r.receiptsRun,
        agentReceipts: r.agentReceipts,
        commitments: r.commitments,
        urgentTask: r.urgentTask,
        urgentTaskDetail: r.urgentTaskDetail,
        importBatchId: batchId,
      };
    }
  }

  out.ok = errors.length === 0 && out.ran.every((r) => r.ok);
  return out;
}
