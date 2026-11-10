// SyncPriorityBankLines – plan r3 stage 2: pulls the bank statement lines (Priority שורות דפי בנק) into BankLines.
//
// 1. The source (shared/priority-bank-source.ts) returns the load day's lines in Priority's shape. Until the Priority
//    API is connected it reports connected: false and the pull returns ok: false, reason PRIORITY_NOT_CONNECTED,
//    having read and written nothing.
// 2. Per line: a BankLines row with that priorityLineId already exists → "exists" (only syncedAt is stamped). Else an
//    older line WITHOUT a priorityLineId with the same account + valueDate + amount + normalised payer + reference →
//    "adopt" (priorityLineId, source, syncedAt, lineType set; bankLineId, status and its check kept – not checked
//    again). Else "create": bankLineId PL-<priorityLineId>, checkStage ממתינה לבדיקה only for העברה / זיכוי בנק.
// 3. Every non-dry pull writes ONE ImportBatches row (kind שורות דפי בנק – Priority); new lines carry its id.
// 4. The day-not-loaded rule (AgentSettings bankRecheckAt, else the older receiptsReadyBy, HH:MM – no hour in code): from
//    that hour on a business day, when the source returned no lines → one urgent task bank-missing:<date> (דף הבנק לא
//    עלה לפריוריטי, קריטית, shared/collections-bank-check.ts); once lines arrive an open one closes automatically. Neither
//    setting → configError bank-settings-missing, rule skipped. BuildTasks never touches bank-missing:* (parseTaskKey does
//    not know the kind). When the work day (RunDaySchedule's bank-check phase) runs the pull, deps.skipDayRule is set:
//    the runner owns the rule, the pull neither opens nor closes the task.
// 5. runChecks: the NEW העברה / זיכוי בנק lines go to IdentifyCustomers (plan 04.11 stage 4, shared function:
//    customer + confidence, a draft receipt per identified line, its task, and stop – the old per-line ladder is no
//    longer called from here); checked[] is one row per identified line, identify the run's summary. When the run is
//    already close to the Lambda limit the lines stay ממתינה לבדיקה and are listed in checksLeft. The output also
//    reports AgentSettings bankLinesSource (the pull runs from the button in either mode until the Priority API).
// dryRun (default true) only reports. Every write is read back (writeVerified). Never writes to Priority, never sends.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { formatDateHe, israelLocalToUtcIso, israelToday, resolveAsOf, toIsraelDate, TZ, weekday } from './collections-dates.ts';
import { createInChunks, errText, mapLimit, num, readAll, readByIds, readSettings, readWhereIn, round2, str } from './collections-data.ts';
import { normName } from './collections-matching.ts';
import { identifyCustomers } from './collections-identify-customers.ts';
import { PRIORITY_BANK_KIND } from './collections-receipts.ts';
import { bankNotInPriorityRow } from './collections-bank-check.ts';
import { bankMissingKey, OPEN_TASK_STATUSES, PERSON_CLOSED_STATUSES, TS_AUTO_CLOSED, TS_OPEN } from './collections-tasks.ts';
import { S_BANK_RECHECK_AT, settingValue } from './plan-settings.ts';
import {
  type BankStatementSource,
  bankStatementSource,
  CHECKED_LINE_TYPES,
  type PriorityBankLine,
  PULL_LINE_TYPES,
} from './priority-bank-source.ts';
import { PRIORITY_NOT_CONNECTED } from './priority-connection.ts';

export { PRIORITY_BANK_KIND };
export const SYNC_ACTOR = 'סנכרון Priority (מערכת)';
export const SETTING_KEYS = ['bankPollStart', 'bankPollEnd', 'bankPollInterval', 'receiptsReadyBy', S_BANK_RECHECK_AT] as const;
export const CONFIG_BANK_SETTINGS_MISSING = 'bank-settings-missing';
const CS_PENDING = 'ממתינה לבדיקה';
const LINE_NEW = 'חדשה';
/** Lambda runs up to 15 minutes; a check (with the reader agent) can take a minute or two – no new one after this. */
export const CHECK_BUDGET_MS = 11 * 60_000;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const BANK_NAMES = ['מזרחי', 'בינלאומי'];

export interface SyncDeps {
  source?: BankStatementSource;
  /** real time of the run (pulledAt, syncedAt, task timestamps) */
  nowIso?: string;
  /** ms since the run started (test clock for the check budget) */
  elapsedMs?: () => number;
  budgetMs?: number;
  /** the work day runs the pull: the day-not-loaded task is the runner's (neither opened nor closed here) */
  skipDayRule?: boolean;
}

const israelHhmm = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(/^24/, '00');
const collapse = (v: unknown) => str(v).replace(/\s+/g, ' ').trim();
const sameMoney = (a: unknown, b: unknown) => Math.abs(num(a) - num(b)) < 0.005;
const isOpen = (s: unknown) => !str(s).trim() || OPEN_TASK_STATUSES.includes(str(s).trim());

/** Adoption key: account + valueDate + amount + normalised payer + reference. */
export const adoptKey = (x: { bankAccount?: unknown; valueDate?: unknown; amount?: unknown; payerName?: unknown; reference?: unknown }) =>
  [collapse(x.bankAccount), toIsraelDate(x.valueDate) ?? '', round2(num(x.amount)).toFixed(2), normName(x.payerName), collapse(x.reference)].join('|');

type LineAction = 'create' | 'adopt' | 'exists';
interface LinePlan {
  src: PriorityBankLine;
  action: LineAction;
  bankLineId: string;
  existing: Item | null;
  willCheck: boolean;
}

export async function syncPriorityBankLines(client: BlocksClient, input: Item, deps: SyncDeps = {}): Promise<Item> {
  const source = deps.source ?? bankStatementSource;
  const startedAt = Date.now();
  const elapsed = deps.elapsedMs ?? (() => Date.now() - startedAt);
  const budgetMs = deps.budgetMs ?? CHECK_BUDGET_MS;
  const pulledAt = deps.nowIso ?? new Date().toISOString();
  const dryRun = input?.dryRun !== false && input?.dryRun !== 'false';
  const runChecks = input?.runChecks !== false && input?.runChecks !== 'false';
  const errors: string[] = [];
  const out: Item = {
    ok: false,
    reason: '',
    dryRun,
    importBatchId: '',
    pulledAt,
    asOfDate: '',
    asOfTime: '',
    source: source.name,
    settings: {},
    linesFromSource: 0,
    created: 0,
    adopted: 0,
    alreadyThere: 0,
    byLineType: Object.fromEntries(PULL_LINE_TYPES.map((t) => [t, 0])),
    lines: [],
    checked: [],
    identify: null,
    bankLinesSource: '',
    checksLeft: [],
    bankMissingTask: { action: 'none', taskKey: '', reason: '' },
    configError: '',
    writeVerified: false,
    errors,
  };

  if (source.connected === false) {
    out.reason = PRIORITY_NOT_CONNECTED;
    errors.push(PRIORITY_NOT_CONNECTED);
    return out;
  }

  // ---------- inputs ----------
  try {
    out.asOfDate = input?.asOfDate ? resolveAsOf(input.asOfDate) : israelToday();
  } catch (e) {
    errors.push(errText(e));
    return out;
  }
  const asOfTime = str(input?.asOfTime).trim() || israelHhmm(pulledAt);
  if (!HHMM.test(asOfTime)) {
    errors.push(`asOfTime "${asOfTime}" אינו שעה בפורמט HH:MM`);
    return out;
  }
  out.asOfTime = asOfTime;
  const asOfDate: string = out.asOfDate;

  const settings = await readSettings(client);
  out.bankLinesSource = settingValue(settings, 'bankLinesSource');
  out.settings = Object.fromEntries(SETTING_KEYS.map((k) => [k, settings.has(k) && str(settings.get(k)).trim() ? str(settings.get(k)).trim() : null]));
  // bankRecheckAt (plan 04.11) replaces receiptsReadyBy; the older row is the fallback
  const recheck = str(out.settings[S_BANK_RECHECK_AT]);
  const readyBy = HHMM.test(recheck) ? recheck : str(out.settings.receiptsReadyBy);
  if (!HHMM.test(readyBy)) out.configError = CONFIG_BANK_SETTINGS_MISSING;

  // ---------- the source ----------
  let lines: PriorityBankLine[];
  let sourceFailed = false;
  try {
    lines = await source.fetchBankStatementLines({ loadDate: asOfDate });
  } catch (e) {
    lines = [];
    sourceFailed = true;
    errors.push(`מקור שורות דפי הבנק נכשל: ${errText(e)}`);
  }
  // one line per priorityLineId
  const seenIds = new Set<string>();
  lines = lines.filter((l) => {
    const id = str(l.priorityLineId).trim();
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
  out.linesFromSource = lines.length;

  // ---------- plan: exists / adopt / create ----------
  const plans: LinePlan[] = [];
  if (lines.length) {
    const ids = lines.map((l) => str(l.priorityLineId).trim());
    const accounts = [...new Set(lines.map((l) => collapse(l.bankAccount)).filter(Boolean))];
    const dates = [...new Set(lines.map((l) => toIsraelDate(l.valueDate)).filter((d): d is string => !!d))];
    const [byPriorityId, candidates] = await Promise.all([
      readWhereIn(client, 'BankLines', 'priorityLineId', ids),
      accounts.length && dates.length
        ? readAll(client, 'BankLines', { and: [{ column: 'bankAccount', operator: 'in', value: accounts }, { column: 'valueDate', operator: 'in', value: dates }] })
        : Promise.resolve([] as Item[]),
    ]);
    const existingById = new Map<string, Item>();
    for (const r of byPriorityId.sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))) if (!existingById.has(str(r.priorityLineId))) existingById.set(str(r.priorityLineId), r);
    const adoptable = new Map<string, Item[]>();
    for (const r of candidates.filter((c) => !str(c.priorityLineId).trim()).sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))) {
      const k = adoptKey(r);
      if (!adoptable.has(k)) adoptable.set(k, []);
      adoptable.get(k)!.push(r);
    }
    for (const l of lines) {
      const pid = str(l.priorityLineId).trim();
      const type = str(l.lineType).trim();
      const existing = existingById.get(pid);
      if (existing) {
        plans.push({ src: l, action: 'exists', bankLineId: str(existing.bankLineId), existing, willCheck: false });
        continue;
      }
      const old = adoptable.get(adoptKey(l))?.shift();
      if (old) {
        plans.push({ src: l, action: 'adopt', bankLineId: str(old.bankLineId), existing: old, willCheck: false });
        continue;
      }
      plans.push({ src: l, action: 'create', bankLineId: `PL-${pid}`, existing: null, willCheck: runChecks && CHECKED_LINE_TYPES.includes(type) });
    }
  }
  for (const p of plans) {
    const t = str(p.src.lineType).trim();
    out.byLineType[t] = (out.byLineType[t] ?? 0) + 1;
  }
  out.created = plans.filter((p) => p.action === 'create').length;
  out.adopted = plans.filter((p) => p.action === 'adopt').length;
  out.alreadyThere = plans.filter((p) => p.action === 'exists').length;
  out.lines = plans.map((p) => ({
    priorityLineId: p.src.priorityLineId,
    bankLineId: p.bankLineId,
    lineType: p.src.lineType,
    valueDate: p.src.valueDate,
    amount: round2(num(p.src.amount)),
    payerName: p.src.payerName,
    reference: p.src.reference,
    action: p.action,
    willCheck: p.willCheck,
  }));

  // ---------- the day-not-loaded rule (decided here, written below) ----------
  const key = bankMissingKey(asOfDate);
  const decideMissing = (): { action: 'open' | 'close' | 'none'; reason: string } => {
    if (deps.skipDayRule) return { action: 'none', reason: 'יום העבודה (RunDaySchedule) מנהל את כלל דף הבנק – לא נבדק כאן' };
    if (out.configError) return { action: 'none', reason: 'bankRecheckAt / receiptsReadyBy לא מוגדרים ב-AgentSettings – הכלל לא נבדק' };
    if (sourceFailed) return { action: 'none', reason: 'המקור נכשל – לא ידוע אם הדפים נטענו' };
    if (lines.length) return { action: 'close', reason: `שורות דפי הבנק נמשכו ב-${asOfTime}` };
    if (weekday(asOfDate) >= 5) return { action: 'none', reason: 'שישי / שבת – אין דפי בנק' };
    if (asOfTime < readyBy) return { action: 'none', reason: `לפני ${readyBy} – עוד מוקדם` };
    return { action: 'open', reason: `עד ${readyBy} לא נמשכו שורות דפי בנק ל-${formatDateHe(asOfDate)}` };
  };
  const missing = decideMissing();
  out.bankMissingTask = { action: missing.action, taskKey: missing.action === 'none' ? '' : key, reason: missing.reason };

  if (dryRun) {
    out.ok = !sourceFailed;
    return out;
  }

  // ---------- write: the pull's ImportBatches row, the lines ----------
  const toCheck = plans.filter((p) => p.willCheck);
  const checkable = plans.filter((p) => p.action === 'create' && CHECKED_LINE_TYPES.includes(str(p.src.lineType).trim()));
  let batch: Item | null = null;
  try {
    batch = (
      await client.createItem('ImportBatches', {
        fileName: `Priority – שורות דפי בנק ${formatDateHe(asOfDate)} ${asOfTime}`,
        fileUrl: null,
        kind: PRIORITY_BANK_KIND,
        dataDate: asOfDate,
        workDay: asOfDate,
        uploadedBy: SYNC_ACTOR,
        uploadedAt: pulledAt,
        rowsRead: lines.length,
        rowsWritten: 0,
        status: 'נקרא',
        errors: null,
        checkStatus: checkable.length ? (toCheck.length ? 'בבדיקה' : 'טרם התחילו') : null,
        checkStartedBy: toCheck.length ? SYNC_ACTOR : null,
        checkStartedAt: toCheck.length ? pulledAt : null,
        isTestFixture: false,
      })
    ).item;
  } catch (e) {
    errors.push(`ImportBatches: ${errText(e)}`);
  }
  const batchId = str(batch?.id);
  out.importBatchId = batchId;
  if (!batchId) {
    errors.push('שורת המשיכה ב-ImportBatches לא נוצרה – לא נכתבו שורות');
    return out;
  }

  const bankNameOf = (v: unknown) => (BANK_NAMES.includes(collapse(v)) ? collapse(v) : 'אחר');
  const creates = plans
    .filter((p) => p.action === 'create')
    .map((p, i) => ({
      bankLineId: p.bankLineId,
      priorityLineId: p.src.priorityLineId,
      bankName: bankNameOf(p.src.bankName),
      valueDate: p.src.valueDate,
      amount: round2(num(p.src.amount)),
      payerName: p.src.payerName,
      reference: p.src.reference,
      bankAccount: p.src.bankAccount,
      lineType: p.src.lineType,
      customerCode: null,
      customerName: null,
      importBatchId: batchId,
      status: LINE_NEW,
      source: source.name,
      syncedAt: pulledAt,
      lineNo: i + 1,
      sourceRef: `Priority ${p.src.priorityLineId}`,
      rawText: [p.src.valueDate, collapse(p.src.payerName), round2(num(p.src.amount)), collapse(p.src.reference)].join(' | '),
      checkStage: CHECKED_LINE_TYPES.includes(str(p.src.lineType).trim()) ? CS_PENDING : null,
    }));
  const updates: Item[] = plans
    .filter((p) => p.action !== 'create')
    .map((p) =>
      p.action === 'adopt'
        ? { id: str(p.existing!.id), priorityLineId: p.src.priorityLineId, source: source.name, syncedAt: pulledAt, lineType: p.src.lineType }
        : { id: str(p.existing!.id), syncedAt: pulledAt },
    );
  let createdRows: Item[] = [];
  if (creates.length) {
    try {
      createdRows = await createInChunks(client, 'BankLines', creates);
    } catch (e) {
      errors.push(`BankLines: ${errText(e)}`);
    }
  }
  await writeUpdates(client, 'BankLines', updates, errors);

  // read back every line of the pull by its priorityLineId
  let linesVerified = errors.length === 0;
  try {
    const back = lines.length ? await readWhereIn(client, 'BankLines', 'priorityLineId', lines.map((l) => str(l.priorityLineId))) : [];
    for (const p of plans) {
      const b = back.find((r) => str(r.priorityLineId) === str(p.src.priorityLineId) && str(r.bankLineId) === p.bankLineId);
      const ok = !!b && str(b.syncedAt) === pulledAt && (p.action === 'exists' || (str(b.source) === source.name && str(b.lineType) === str(p.src.lineType)));
      if (!ok) {
        linesVerified = false;
        errors.push(`BankLines ${p.src.priorityLineId}: לא נקרא בחזרה כפי שנכתב`);
      }
    }
  } catch (e) {
    linesVerified = false;
    errors.push(`BankLines: קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  const written = linesVerified ? creates.length + plans.filter((p) => p.action === 'adopt').length : createdRows.length;
  let batchVerified = false;
  try {
    const status = linesVerified ? 'נכתב' : 'נכשל';
    await client.updateItem('ImportBatches', batchId, { rowsWritten: written, status, errors: errors.length ? errors.join('; ') : null });
    const [b] = await readByIds(client, 'ImportBatches', [batchId]);
    batchVerified = !!b && str(b.status) === status && num(b.rowsWritten) === written && str(b.kind) === PRIORITY_BANK_KIND;
    if (!batchVerified) errors.push(`ImportBatches ${batchId}: לא נקרא בחזרה כפי שנכתב`);
  } catch (e) {
    errors.push(`ImportBatches: ${errText(e)}`);
  }

  // ---------- the day-not-loaded task ----------
  const taskVerified = await writeBankMissing(client, { missing, key, asOfDate, asOfTime, readyBy, batchId, pulledAt, settings, isTest: false, out, errors });

  // ---------- identification: the new העברה / זיכוי בנק lines go to IdentifyCustomers (plan 04.11 stage 4) ----------
  let checksVerified = true;
  if (linesVerified && toCheck.length) {
    if (elapsed() >= budgetMs) {
      for (const p of toCheck) out.checksLeft.push({ bankLineId: p.bankLineId, priorityLineId: p.src.priorityLineId, checkStage: CS_PENDING, reason: 'זמן הריצה קרוב למגבלה – תזוהה בריצה הבאה או מהמסך' });
    } else {
      try {
        const res = await identifyCustomers(client, { bankLineIds: toCheck.map((p) => p.bankLineId), dryRun: false, checkedBy: SYNC_ACTOR, asOfDate }, { nowIso: pulledAt });
        out.identify = { ok: res.ok, counts: res.counts, certainAt: res.certainAt, ...(res.autoApproveAt !== undefined ? { autoApproveAt: res.autoApproveAt } : {}), writeVerified: res.writeVerified, errors: res.errors };
        out.checked = (res.lines as Item[])
          .filter((l) => !l.skippedReason)
          .map((l) => ({ bankLineId: l.bankLineId, customerCode: l.customerCode, confidence: l.confidence, identifyStatus: l.identifyStatus, receiptKey: l.receiptKey, taskKey: l.taskKey }));
        if (!res.ok || !res.writeVerified) checksVerified = false;
        errors.push(...(res.errors as string[]).map((e) => `זיהוי לקוח: ${e}`));
      } catch (e) {
        checksVerified = false;
        errors.push(`זיהוי לקוח (IdentifyCustomers) נכשל: ${errText(e)}`);
      }
    }
  }

  out.writeVerified = linesVerified && batchVerified && taskVerified && checksVerified && errors.length === 0;
  out.ok = !sourceFailed && linesVerified && batchVerified;
  return out;
}

async function writeUpdates(client: BlocksClient, table: string, updates: Item[], errors: string[]) {
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    try {
      await client.updateItems(table, chunk);
    } catch {
      await mapLimit(chunk, 8, async (item) => {
        const { id, ...fields } = item;
        try {
          await client.updateItem(table, str(id), fields);
        } catch (e) {
          errors.push(`${table} ${id}: ${errText(e)}`);
        }
      });
    }
  }
}

/** Opens / refreshes / closes bank-missing:<date> (never anything else); returns whether the write read back. */
async function writeBankMissing(
  client: BlocksClient,
  x: {
    missing: { action: 'open' | 'close' | 'none'; reason: string };
    key: string;
    asOfDate: string;
    asOfTime: string;
    readyBy: string;
    batchId: string;
    pulledAt: string;
    settings: Map<string, string>;
    isTest: boolean;
    out: Item;
    errors: string[];
  },
): Promise<boolean> {
  const { missing, key, pulledAt, errors } = x;
  if (missing.action === 'none') return true;
  let rows: Item[];
  try {
    rows = await readWhereIn(client, 'CollectionQueue', 'taskKey', [key]);
  } catch (e) {
    errors.push(`CollectionQueue: ${errText(e)}`);
    return false;
  }
  const open = rows.filter((r) => isOpen(r.status)).sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
  let writes: { id: string | null; fields: Item }[] = [];
  if (missing.action === 'close') {
    writes = open.map((r) => ({ id: str(r.id), fields: { status: TS_AUTO_CLOSED, resolvedAt: pulledAt, resolvedReason: missing.reason, lastCheckedAt: pulledAt } }));
    x.out.bankMissingTask = { ...x.out.bankMissingTask, action: open.length ? 'close' : 'none', reason: open.length ? missing.reason : `${missing.reason} – אין משימה פתוחה` };
  } else {
    const row = bankNotInPriorityRow({ asOfDate: x.asOfDate, asOfTime: x.asOfTime, readyBy: x.readyBy, relatedId: x.batchId, nowIso: pulledAt, settings: x.settings, isTest: x.isTest, fromDayRunner: false });
    const refresh = { taskType: row.taskType, recommendedAction: row.recommendedAction, title: row.title, reasons: row.reasons, severity: row.severity, severityScore: row.severityScore, priorityScore: row.priorityScore, relatedId: row.relatedId, lastCheckedAt: pulledAt };
    const newest = [...rows].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
    if (open.length) {
      writes = [{ id: str(open[0].id), fields: refresh }, ...open.slice(1).map((r) => ({ id: str(r.id), fields: { status: TS_AUTO_CLOSED, resolvedAt: pulledAt, resolvedReason: 'משימה כפולה – המשימה נמשכת ברשומה אחרת', lastCheckedAt: pulledAt } }))];
      x.out.bankMissingTask = { ...x.out.bankMissingTask, action: 'open', change: 'refreshed' };
    } else if (newest && PERSON_CLOSED_STATUSES.includes(str(newest.status).trim())) {
      x.out.bankMissingTask = { ...x.out.bankMissingTask, action: 'none', reason: `${missing.reason} – המשימה נסגרה על ידי ${str(newest.handledBy) || 'אדם'} ונשארת סגורה` };
    } else if (newest) {
      writes = [{ id: str(newest.id), fields: { ...refresh, status: TS_OPEN, openedAt: pulledAt, queueDate: x.asOfDate, dueAt: row.dueAt, handledBy: null, handledAt: null, resolvedAt: null, resolvedReason: null } }];
      x.out.bankMissingTask = { ...x.out.bankMissingTask, action: 'open', change: 'reopened' };
    } else {
      writes = [{ id: null, fields: row }];
      x.out.bankMissingTask = { ...x.out.bankMissingTask, action: 'open', change: 'created' };
    }
  }
  if (!writes.length) return true;
  const ids: string[] = [];
  try {
    for (const w of writes) {
      if (w.id) {
        await client.updateItem('CollectionQueue', w.id, w.fields);
        ids.push(w.id);
      } else ids.push(str((await client.createItem('CollectionQueue', w.fields)).item?.id));
    }
    const back = await readByIds(client, 'CollectionQueue', ids.filter(Boolean));
    const ok = writes.every((w, i) => {
      const b = back.find((r) => str(r.id) === ids[i]);
      return !!b && ['status', 'title', 'resolvedReason', 'taskKey'].filter((f) => f in w.fields).every((f) => str(b[f]) === str(w.fields[f]));
    });
    if (ids[0]) x.out.bankMissingTask = { ...x.out.bankMissingTask, taskId: ids[0] };
    if (!ok) errors.push(`CollectionQueue ${key}: לא נקרא בחזרה כפי שנכתב`);
    return ok;
  } catch (e) {
    errors.push(`CollectionQueue ${key}: ${errText(e)}`);
    return false;
  }
}
