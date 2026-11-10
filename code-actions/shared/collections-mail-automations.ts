// Mail automations (component 04 · פניות, tab אוטומציות), shared by RunMailAutomation (הרץ עכשיו / preview) and
// RunDueAutomations (the hourly MailAutomationsRunner workflow). Today the only kind is the monthly open-debts mail
// (חובות פתוחים חודשי): it runs the shared open-debts batch (collections-open-debts-batch.ts) with the automation's
// audience, templates and mailbox. A real run writes the drafts to the outbox (Approvals, component מנה חודשית),
// one MailAutomationRuns row, and lastRunAt / lastRunSummary on the automation. A failed run is recorded with
// status נכשלה and never thrown. Nothing is sent.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { israelDateOfInstant, israelLocalToUtcIso, lastOfMonth, resolveAsOf, TZ } from './collections-dates.ts';
import { errText, readAll, readByIds, splitList, str } from './collections-data.ts';
import { allTestCodes, excludedSummaryOf, runOpenDebtsBatch } from './collections-open-debts-batch.ts';

export const KIND_MONTHLY_OPEN_DEBTS = 'חובות פתוחים חודשי';
export const AUDIENCE_ALL = 'כל הלקוחות ביתרת חובה';
export const AUDIENCE_SELECTED = 'לקוחות נבחרים';
export const TRIGGER_SCHEDULED = 'מתוזמן';
export const TRIGGER_MANUAL = 'ידני';
export const RUN_DONE = 'הושלמה';
export const RUN_FAILED = 'נכשלה';
export const SCHEDULED_BY = 'ריצה מתוזמנת';
const DEFAULT_HOUR = 8;

const truthy = (v: unknown) => v === true || v === 'true';
const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export interface RunInput {
  automationId: string;
  dryRun: boolean;
  trigger: string;
  requestedBy: string;
  asOfDate?: string | null;
  previewCustomerCode?: string | null;
  subjectOverride?: string | null;
  bodyOverride?: string | null;
}

export interface RunOutput {
  dryRun: boolean;
  automationId: string;
  automationName: string;
  batchId: string;
  eligible: Item[];
  excluded: Item[];
  preview: Item | null;
  draftsCreated: number;
  draftIds: string[];
  runId: string;
  status: string;
  summary: string;
  errors: string[];
}

const many = (n: number, one: string, several: string) => (n === 1 ? one : several.replace('#', String(n)));

/** Reads the input of RunMailAutomation (strings from a workflow are tolerated). */
export function runInputOf(input: any): RunInput {
  const trigger = str(input?.trigger).trim() === TRIGGER_SCHEDULED ? TRIGGER_SCHEDULED : TRIGGER_MANUAL;
  return {
    automationId: str(input?.automationId).trim(),
    dryRun: !(input?.dryRun === false || input?.dryRun === 'false'),
    trigger,
    requestedBy: str(input?.requestedBy).trim(),
    asOfDate: str(input?.asOfDate).trim() || null,
    previewCustomerCode: str(input?.previewCustomerCode).trim() || null,
    subjectOverride: nonEmpty(input?.subjectOverride) ? String(input.subjectOverride) : null,
    bodyOverride: nonEmpty(input?.bodyOverride) ? String(input.bodyOverride) : null,
  };
}

/** Runs one automation now (or previews it). Never throws: a failure is returned and, on a real run, recorded. */
export async function runMailAutomation(client: BlocksClient, inp: RunInput, nowIso = new Date().toISOString()): Promise<RunOutput> {
  const out: RunOutput = {
    dryRun: inp.dryRun,
    automationId: inp.automationId,
    automationName: '',
    batchId: '',
    eligible: [],
    excluded: [],
    preview: null,
    draftsCreated: 0,
    draftIds: [],
    runId: '',
    status: '',
    summary: '',
    errors: [],
  };
  if (!inp.automationId) return { ...out, errors: ['חסר מזהה אוטומציה (automationId)'], summary: 'לא הורץ – חסר מזהה אוטומציה' };

  let automation: Item | null = null;
  try {
    [automation] = await readByIds(client, 'MailAutomations', [inp.automationId]);
  } catch (e) {
    return { ...out, errors: [`MailAutomations: ${errText(e)}`], summary: 'לא הורץ – קריאת האוטומציה נכשלה' };
  }
  if (!automation) return { ...out, errors: [`האוטומציה ${inp.automationId} לא נמצאה`], summary: 'לא הורץ – האוטומציה לא נמצאה' };
  out.automationName = str(automation.name);

  let asOf: string;
  try {
    asOf = resolveAsOf(inp.asOfDate || israelDateOfInstant(new Date(nowIso)));
  } catch (e) {
    return { ...out, errors: [errText(e)], summary: 'לא הורץ – תאריך לא תקין' };
  }

  const kind = str(automation.kind).trim() || KIND_MONTHLY_OPEN_DEBTS;
  const audience = str(automation.audience).trim() || AUDIENCE_ALL;
  const codes = audience === AUDIENCE_SELECTED ? splitList(automation.customerCodes) : [];
  const problems: string[] = [];
  if (kind !== KIND_MONTHLY_OPEN_DEBTS) problems.push(`סוג אוטומציה לא מוכר: "${kind}"`);
  if (audience === AUDIENCE_SELECTED && !codes.length) problems.push('הנמענים הם "לקוחות נבחרים" אבל לא נבחר אף לקוח');

  let batch: Awaited<ReturnType<typeof runOpenDebtsBatch>> | null = null;
  if (!problems.length) {
    try {
      batch = await runOpenDebtsBatch(client, {
        asOf,
        dryRun: inp.dryRun,
        customerCodes: codes,
        subjectTemplate: inp.subjectOverride ?? (str(automation.subjectTemplate) || null),
        bodyTemplate: inp.bodyOverride ?? (str(automation.bodyTemplate) || null),
        automationId: inp.automationId,
        automationName: out.automationName,
        mailboxId: str(automation.mailboxId).trim() || null,
        requestedBy: inp.requestedBy || null,
        previewCustomerCode: inp.dryRun ? inp.previewCustomerCode : null,
      });
    } catch (e) {
      problems.push(`הרצת המנה נכשלה: ${errText(e)}`);
    }
  }

  const eligible = (batch?.eligible ?? []).map((e) => ({
    customerCode: e.customerCode,
    customerName: e.customerName,
    contactName: e.contactName,
    contactEmail: e.contactEmail,
    openTotal: e.openTotal,
    bookkeeperName: e.bookkeeperName,
    bookkeeperPhone: e.bookkeeperPhone,
    pendingDraftId: e.pendingDraftId,
  }));
  const excluded = (batch?.excluded ?? []).map((e) => ({ customerCode: str(e.customerCode), customerName: str(e.customerName), reason: str(e.reason) }));
  const errors = [...problems, ...(batch?.errors ?? [])];
  Object.assign(out, { batchId: batch?.batchId ?? '', eligible, excluded, errors });

  if (inp.dryRun) {
    out.preview = batch?.preview ?? null;
    out.summary = problems.length
      ? `תצוגה מקדימה לא הופקה: ${problems.join('; ')}`
      : `תצוגה מקדימה: ${many(eligible.length, 'לקוח אחד יקבל', '# לקוחות יקבלו')} מייל, ${many(excluded.length, 'לקוח אחד הוחרג', '# לקוחות הוחרגו')} – לא נכתב דבר`;
    return out;
  }

  const created = (batch?.draftsCreated ?? []) as Item[];
  out.draftsCreated = created.length;
  out.draftIds = created.map((d) => str(d.approvalId));
  const failed = !batch || (created.length === 0 && eligible.length > 0);
  out.status = failed ? RUN_FAILED : RUN_DONE;
  out.summary = failed
    ? `ההרצה נכשלה: ${errors[0] ?? 'לא נוצרו טיוטות'}`
    : `נוצרו ${many(created.length, 'טיוטה אחת', '# טיוטות')} בדואר היוצא (לא נשלחו), ${many(excluded.length, 'לקוח אחד הוחרג', '# לקוחות הוחרגו')}${errors.length ? `, ${many(errors.length, 'שגיאה אחת', '# שגיאות')}` : ''}`;

  // the run row, then the automation's last run
  const runCodes = [...eligible.map((e) => str(e.customerCode)), ...(codes.length ? codes : [])];
  const testOnly = batch ? (batch.eligible as Item[]).length > 0 && (batch.eligible as Item[]).every((e) => e.isTestFixture === true) : allTestCodes(codes);
  const runRow: Item = {
    automationId: inp.automationId,
    automationName: out.automationName || null,
    ranAt: nowIso,
    trigger: inp.trigger,
    requestedBy: inp.requestedBy || (inp.trigger === TRIGGER_SCHEDULED ? SCHEDULED_BY : null),
    batchId: out.batchId || null,
    draftsCreated: created.length,
    excludedCount: excluded.length,
    excludedSummary: excludedSummaryOf(excluded) || null,
    status: out.status,
    errors: errors.length ? errors.join('\n') : null,
    isTestFixture: testOnly || (runCodes.length > 0 && allTestCodes(runCodes)),
  };
  try {
    out.runId = str((await client.createItem('MailAutomationRuns', runRow)).item?.id);
  } catch (e) {
    out.errors.push(`MailAutomationRuns: ${errText(e)}`);
  }
  try {
    await client.updateItem('MailAutomations', inp.automationId, { lastRunAt: nowIso, lastRunSummary: out.summary });
  } catch (e) {
    out.errors.push(`MailAutomations: ${errText(e)}`);
  }
  return out;
}

// ---------- the hourly due check ----------

/** Israel calendar date and hour of an instant. */
export function israelDateHour(at: Date): { date: string; hour: number } {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(at);
  return { date: israelDateOfInstant(at), hour: Number(h) % 24 };
}

/** The day an automation runs this month: dayOfMonth clamped to 1..month length (31 in a 30-day month → 30). */
export function effectiveDay(dayOfMonth: unknown, monthKey: string): number {
  const last = Number(lastOfMonth(monthKey).slice(8, 10));
  const d = Math.trunc(Number(dayOfMonth));
  if (!Number.isFinite(d) || d < 1) return 1;
  return Math.min(d, last);
}

/**
 * Due: active, today is past the run day, or it is the run day and the hour has come, and no completed scheduled run
 * exists this month. Returns null when due, else the Hebrew reason it is skipped.
 */
export function notDueReason(a: Item, today: string, hour: number, runsThisMonth: Item[]): string | null {
  if (!truthy(a.active)) return 'לא פעילה';
  const day = effectiveDay(a.dayOfMonth, today.slice(0, 7));
  const h = Number.isFinite(Number(a.hour)) && str(a.hour) !== '' ? Math.min(23, Math.max(0, Math.trunc(Number(a.hour)))) : DEFAULT_HOUR;
  const todayDay = Number(today.slice(8, 10));
  if (todayDay < day || (todayDay === day && hour < h)) return `מועד ההרצה הבא: ${day} בחודש ב-${String(h).padStart(2, '0')}:00`;
  const done = runsThisMonth.find((r) => str(r.automationId) === str(a.id) && str(r.trigger) === TRIGGER_SCHEDULED && str(r.status) === RUN_DONE);
  if (done) return 'כבר רצה החודש';
  return null;
}

export async function runDueAutomations(client: BlocksClient, input: any) {
  const errors: string[] = [];
  const raw = str(input?.now).trim();
  const parsed = raw ? new Date(/^\d+$/.test(raw) ? Number(raw) : raw) : new Date();
  const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  if (raw && Number.isNaN(parsed.getTime())) errors.push(`now לא תקין ("${raw}") – נבדק מול השעה הנוכחית`);
  const nowIso = now.toISOString();
  const { date: today, hour } = israelDateHour(now);
  const monthStartIso = israelLocalToUtcIso(`${today.slice(0, 7)}-01`, 0, 0);

  const [automations, runs] = await Promise.all([
    readAll(client, 'MailAutomations'),
    readAll(client, 'MailAutomationRuns', { column: 'ranAt', operator: '>=', value: monthStartIso }).catch((e) => {
      errors.push(`MailAutomationRuns: ${errText(e)}`);
      return [] as Item[];
    }),
  ]);
  const ran: Item[] = [];
  const skipped: Item[] = [];
  for (const a of automations.sort((x, y) => Number(x.id) - Number(y.id))) {
    const why = notDueReason(a, today, hour, runs);
    if (why) {
      skipped.push({ automationId: str(a.id), automationName: str(a.name), reason: why });
      continue;
    }
    try {
      const r = await runMailAutomation(client, { automationId: str(a.id), dryRun: false, trigger: TRIGGER_SCHEDULED, requestedBy: SCHEDULED_BY, asOfDate: today }, nowIso);
      ran.push({ automationId: str(a.id), automationName: r.automationName || str(a.name), runId: r.runId, draftsCreated: r.draftsCreated, status: r.status || RUN_FAILED, summary: r.summary });
      errors.push(...r.errors.map((e) => `${str(a.name)}: ${e}`));
    } catch (e) {
      // runMailAutomation records its own failures; this is a failure before it could
      const msg = errText(e);
      errors.push(`${str(a.name)}: ${msg}`);
      let runId = '';
      try {
        runId = str(
          (
            await client.createItem('MailAutomationRuns', {
              automationId: str(a.id),
              automationName: str(a.name) || null,
              ranAt: nowIso,
              trigger: TRIGGER_SCHEDULED,
              requestedBy: SCHEDULED_BY,
              batchId: null,
              draftsCreated: 0,
              excludedCount: 0,
              excludedSummary: null,
              status: RUN_FAILED,
              errors: msg,
              isTestFixture: allTestCodes(splitList(a.customerCodes)),
            })
          ).item?.id,
        );
      } catch (e2) {
        errors.push(`MailAutomationRuns: ${errText(e2)}`);
      }
      ran.push({ automationId: str(a.id), automationName: str(a.name), runId, draftsCreated: 0, status: RUN_FAILED });
    }
  }
  return { checked: automations.length, now: nowIso, israelDate: today, israelHour: hour, ran, skipped, errors };
}
