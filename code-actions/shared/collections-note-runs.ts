// The two note runs of the work day – plan 04.11 part A, stage 2.
//
// closeSettledNotes (CloseSettledNotes): every customer + due month with active notes whose OpenMovements total is 0 or
//   less (no rows = 0) closes its notes: status נסגרה – החודש התאפס, closedAt; an active commitment whose outcome is not
//   final also gets outcome קוימה, amountRemaining 0, checkedAt. Guard: an EMPTY OpenMovements table (failed pull / empty
//   source) closes nothing and is reported.
// checkCommitments (CheckCommitments): every active commitment whose check day (actionDate + noteTask.promise.offsetDays)
//   has come and whose outcome is פתוחה / קוימה חלקית / לא קוימה (קוימה is final): promised = amount ?? balanceAtNote,
//   received = the customer's receipts dated from the note's day (Payments mirror + our approved Receipts, a receipt in
//   both counted once, never credit notes), outcome by the month balance and received vs promised; writes outcome,
//   amountReceived, amountRemaining, checkedAt.
// Both refresh the grouped note tasks afterwards unless the caller (RunDaySchedule) builds them itself. dryRun defaults
// to true. Never writes to Priority and never contacts anyone.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';
import { addDays, israelToday, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { errText, mapLimit, num, readAll, readByIds, readSettings, readWhereIn, round2, str } from './collections-data.ts';
import { PHASE_BANK_CHECK, PHASE_MORNING, syncNoteTasks, syncNoteTasksAfterWrite, type NoteTaskResult } from './collections-note-tasks.ts';
import { syncTasksAfterWrite } from './collections-task-sync.ts';
import {
  balanceOf,
  commitmentOutcome,
  hasAnyMovement,
  isCommitment,
  monthBalances,
  NT_COMMITMENT,
  OUT_KEPT,
  OUT_NOT_KEPT,
  OUT_OPEN,
  OUT_PARTLY,
  OUTCOMES_TO_CHECK,
  promisedOf,
  receivedSince,
  ST_ACTIVE,
  ST_MONTH_ZERO,
} from './collections-notes.ts';
import { noteTaskRule } from './plan-settings.ts';

const TABLE = 'CustomerNotes';
const EPS = 0.005;

async function writeNotes(client: BlocksClient, patches: { id: string; fields: Item }[], errors: string[]) {
  for (let i = 0; i < patches.length; i += 100) {
    const chunk = patches.slice(i, i + 100);
    try {
      await client.updateItems(TABLE, chunk.map((p) => ({ id: p.id, ...p.fields })));
    } catch {
      await mapLimit(chunk, 8, async (p) => {
        try {
          await client.updateItem(TABLE, p.id, p.fields);
        } catch (e) {
          errors.push(`${TABLE} ${p.id}: ${errText(e)}`);
        }
      });
    }
  }
}

async function verifyNotes(client: BlocksClient, patches: { id: string; fields: Item }[], keys: string[], errors: string[]): Promise<boolean> {
  if (!patches.length) return true;
  try {
    const back = new Map((await readByIds(client, TABLE, patches.map((p) => p.id))).map((r) => [str(r.id), r]));
    let ok = true;
    for (const p of patches) {
      const b = back.get(p.id);
      const same = !!b && keys.filter((k) => k in p.fields).every((k) => (typeof p.fields[k] === 'number' ? Math.abs(num(b[k]) - num(p.fields[k])) < EPS : str(b[k]) === str(p.fields[k])));
      if (!same) {
        ok = false;
        errors.push(`${TABLE} ${p.id}: לא נקרא בחזרה כפי שנכתב`);
      }
    }
    return ok;
  } catch (e) {
    errors.push(`${TABLE}: קריאה חוזרת נכשלה – ${errText(e)}`);
    return false;
  }
}

const taskSummary = (r: NoteTaskResult | null) =>
  r ? { created: r.created, refreshed: r.refreshed, reopened: r.reopened, autoClosed: r.autoClosed, rows: r.rows, changes: r.changes, writeVerified: r.writeVerified, errors: r.errors } : null;

// =====================================================================================================================
// CloseSettledNotes
// =====================================================================================================================
export interface CloseOptions {
  customerCode?: string | null;
  asOfDate?: string | null;
  /** default true */
  dryRun?: boolean;
  nowIso?: string;
  /** refresh the grouped note tasks of the closed notes (default true) */
  syncTasks?: boolean;
}

export interface CloseResult {
  dryRun: boolean;
  asOfDate: string;
  monthsChecked: number;
  monthsSettled: number;
  notesClosed: number;
  commitmentsKept: number;
  closed: Item[];
  skipped: Item[];
  taskSync: Item | null;
  writeVerified: boolean;
  errors: string[];
}

export async function closeSettledNotes(client: BlocksClient, opts: CloseOptions = {}): Promise<CloseResult> {
  const dryRun = opts.dryRun !== false;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const errors: string[] = [];
  const out: CloseResult = { dryRun, asOfDate: '', monthsChecked: 0, monthsSettled: 0, notesClosed: 0, commitmentsKept: 0, closed: [], skipped: [], taskSync: null, writeVerified: false, errors };
  try {
    out.asOfDate = opts.asOfDate ? resolveAsOf(opts.asOfDate) : israelToday();
  } catch (e) {
    errors.push(errText(e));
    return out;
  }
  const code = str(opts.customerCode).trim() || null;
  const where: WhereClause = code ? { and: [{ column: 'status', value: ST_ACTIVE }, { column: 'customerCode', value: code }] } : { column: 'status', value: ST_ACTIVE };
  let notes: Item[];
  let anyMovement: boolean;
  try {
    [notes, anyMovement] = await Promise.all([readAll(client, TABLE, where), hasAnyMovement(client)]);
  } catch (e) {
    errors.push(`הקריאה נכשלה – לא נסגרה אף הערה: ${errText(e)}`);
    return out;
  }
  const cells = new Map<string, Item[]>();
  for (const n of notes) {
    const k = `${str(n.customerCode).trim()}|${str(n.dueMonth).trim()}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(n);
  }
  out.monthsChecked = cells.size;
  if (!anyMovement) {
    out.skipped.push({ customerCode: code, dueMonth: null, reason: 'אין תנועות פתוחות בכלל (OpenMovements ריקה – משיכה שנכשלה או מקור ריק) – לא נסגרה אף הערה' });
    out.writeVerified = true;
    return out;
  }
  const codes = [...new Set(notes.map((n) => str(n.customerCode).trim()).filter(Boolean))];
  let movements: Item[];
  try {
    movements = codes.length ? await readWhereIn(client, 'OpenMovements', 'customerCode', codes) : [];
  } catch (e) {
    errors.push(`OpenMovements: ${errText(e)} – לא נסגרה אף הערה`);
    return out;
  }
  const balances = monthBalances(movements);
  const patches: { id: string; fields: Item }[] = [];
  for (const [k, ns] of [...cells.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [c, month] = k.split('|');
    const balance = balanceOf(balances, c, month);
    if (balance > EPS) {
      out.skipped.push({ customerCode: c, dueMonth: month, reason: `יתרה פתוחה ${balance} ₪ – ההערות נשארות פעילות`, balance });
      continue;
    }
    out.monthsSettled += 1;
    for (const n of ns) {
      const fields: Item = { status: ST_MONTH_ZERO, closedAt: nowIso };
      if (isCommitment(n) && str(n.outcome).trim() !== OUT_KEPT) {
        Object.assign(fields, { outcome: OUT_KEPT, amountRemaining: 0, checkedAt: nowIso });
        out.commitmentsKept += 1;
      }
      patches.push({ id: str(n.id), fields });
      out.closed.push({ noteId: str(n.id), customerCode: c, dueMonth: month, noteType: str(n.noteType), balance });
    }
  }
  out.notesClosed = patches.length;
  if (dryRun) return out;
  await writeNotes(client, patches, errors);
  const verified = await verifyNotes(client, patches, ['status', 'outcome', 'amountRemaining'], errors);
  if (opts.syncTasks !== false && patches.length) {
    out.taskSync = taskSummary(await syncNoteTasksAfterWrite(client, { noteIds: patches.map((p) => p.id), asOfDate: out.asOfDate, nowIso }));
  }
  out.writeVerified = verified && errors.length === 0;
  return out;
}

// =====================================================================================================================
// CheckCommitments
// =====================================================================================================================
export interface CheckOptions {
  customerCode?: string | null;
  noteIds?: string[] | null;
  asOfDate?: string | null;
  /** default true */
  dryRun?: boolean;
  nowIso?: string;
  /** build the commitment grouped task afterwards (default true; RunDaySchedule builds it in its own step) */
  syncTasks?: boolean;
}

export interface CheckResult {
  dryRun: boolean;
  asOfDate: string;
  checked: number;
  kept: number;
  partlyKept: number;
  notKept: number;
  commitments: Item[];
  taskSync: Item | null;
  writeVerified: boolean;
  errors: string[];
}

export async function checkCommitments(client: BlocksClient, opts: CheckOptions = {}): Promise<CheckResult> {
  const dryRun = opts.dryRun !== false;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const errors: string[] = [];
  const out: CheckResult = { dryRun, asOfDate: '', checked: 0, kept: 0, partlyKept: 0, notKept: 0, commitments: [], taskSync: null, writeVerified: false, errors };
  let asOfDate: string;
  try {
    asOfDate = opts.asOfDate ? resolveAsOf(opts.asOfDate) : israelToday();
  } catch (e) {
    errors.push(errText(e));
    return out;
  }
  out.asOfDate = asOfDate;
  const code = str(opts.customerCode).trim() || null;
  const ids = Array.isArray(opts.noteIds) ? [...new Set(opts.noteIds.map((x) => str(x).trim()).filter(Boolean))] : [];
  const base: WhereClause[] = [{ column: 'status', value: ST_ACTIVE }, { column: 'noteType', value: NT_COMMITMENT }];
  if (code) base.push({ column: 'customerCode', value: code });
  let notes: Item[];
  let settings: Map<string, string>;
  try {
    [notes, settings] = await Promise.all([ids.length ? readByIds(client, TABLE, ids) : readAll(client, TABLE, { and: base }), readSettings(client)]);
  } catch (e) {
    errors.push(`הקריאה נכשלה – לא נבדקה אף התחייבות: ${errText(e)}`);
    return out;
  }
  const rule = noteTaskRule(settings, 'promise');
  if (rule.offsetDays === null) {
    errors.push('noteTask.promise.offsetDays אינו מספר – לא ידוע מתי בודקים התחייבות, לא נבדקה אף אחת');
    return out;
  }
  const due = notes.filter((n) => {
    if (str(n.status).trim() !== ST_ACTIVE || !isCommitment(n)) return false;
    if (code && str(n.customerCode).trim() !== code) return false;
    const outcome = str(n.outcome).trim() || OUT_OPEN;
    if (!OUTCOMES_TO_CHECK.includes(outcome)) return false;
    const action = toIsraelDate(n.actionDate);
    return !!action && addDays(action, rule.offsetDays!) <= asOfDate;
  });
  const codes = [...new Set(due.map((n) => str(n.customerCode).trim()).filter(Boolean))];
  let movements: Item[] = [];
  let receipts: Item[] = [];
  let payments: Item[] = [];
  if (codes.length) {
    try {
      [movements, receipts, payments] = await Promise.all([
        readWhereIn(client, 'OpenMovements', 'customerCode', codes),
        readWhereIn(client, 'Receipts', 'customerCode', codes),
        readWhereIn(client, 'Payments', 'customerCode', codes),
      ]);
    } catch (e) {
      errors.push(`הקריאה נכשלה – לא נבדקה אף התחייבות: ${errText(e)}`);
      return out;
    }
  }
  // an empty mirror says nothing about a month: the month-at-0 rule is not used then (only what came in)
  const mirrorKnown = movements.length > 0 || (codes.length > 0 && (await hasAnyMovement(client).catch(() => false)));
  const balances = monthBalances(movements);
  const patches: { id: string; fields: Item }[] = [];
  for (const n of due) {
    const c = str(n.customerCode).trim();
    const month = str(n.dueMonth).trim();
    const promised = promisedOf(n);
    const since = toIsraelDate(n.noteCreatedAt) ?? toIsraelDate(n.createdAt) ?? toIsraelDate(n.actionDate)!;
    const got = receivedSince(c, since, asOfDate, { receipts, payments });
    const monthBalance = balanceOf(balances, c, month);
    const r = commitmentOutcome({ monthBalance: mirrorKnown ? monthBalance : Number.POSITIVE_INFINITY, promised, received: got.total });
    const previousOutcome = str(n.outcome).trim() || OUT_OPEN;
    const fields = { outcome: r.outcome, amountReceived: round2(got.total), amountRemaining: r.remaining, checkedAt: nowIso };
    patches.push({ id: str(n.id), fields });
    out.commitments.push({
      noteId: str(n.id),
      customerCode: c,
      customerName: str(n.customerName),
      dueMonth: month,
      actionDate: toIsraelDate(n.actionDate),
      promised,
      received: round2(got.total),
      remaining: r.remaining,
      monthBalance: mirrorKnown ? monthBalance : null,
      outcome: r.outcome,
      previousOutcome,
      receipts: got.entries,
    });
    if (r.outcome === OUT_KEPT) out.kept += 1;
    else if (r.outcome === OUT_PARTLY) out.partlyKept += 1;
    else if (r.outcome === OUT_NOT_KEPT) out.notKept += 1;
  }
  out.checked = patches.length;
  if (dryRun) return out;
  await writeNotes(client, patches, errors);
  const verified = await verifyNotes(client, patches, ['outcome', 'amountReceived', 'amountRemaining'], errors);
  if (opts.syncTasks !== false) {
    const r = await syncNoteTasks(client, { asOfDate, nowIso, dryRun: false, phase: PHASE_BANK_CHECK, customerCode: code, noteIds: ids.length ? ids : null }).catch(
      (e): NoteTaskResult => ({ asOfDate, dryRun: false, phase: PHASE_BANK_CHECK, created: 0, refreshed: 0, reopened: 0, autoClosed: 0, keptClosedByPerson: 0, rows: 0, byType: {}, changes: [], balancesKnown: false, writeVerified: false, errors: [errText(e)] }),
    );
    out.taskSync = taskSummary(r);
  }
  out.writeVerified = verified && errors.length === 0;
  return out;
}

// =====================================================================================================================
// After a note writer (AddCustomerNote / UpdateCustomerNote / the email approval / Maya's dispute notes)
// =====================================================================================================================
const KIND_MORNING_PULL = 'משיכת בוקר – Priority';
const KIND_BANK_CHECK = 'בדיקת דף בנק';
const BATCH_WRITTEN = 'נכתב';
const isTrue = (v: unknown) => v === true || v === 'true';

/** Which phases already ran successfully today: 06:00 (morning pull נכתב) and the bank check (loaded, CheckCommitments done). */
export async function phasesRanToday(client: BlocksClient, asOfDate: string): Promise<{ morning: boolean; bank: boolean }> {
  const rows = (await readAll(client, 'ImportBatches', { column: 'runPhase', operator: 'in', value: ['06:00', '09:00', '10:00'] })).filter(
    (r) => toIsraelDate(r.dataDate) === asOfDate && str(r.status) === BATCH_WRITTEN,
  );
  const stepDone = (r: Item, step: string) => {
    let summary: unknown = r.runSummary;
    if (typeof summary === 'string') {
      try {
        summary = JSON.parse(summary);
      } catch {
        summary = [];
      }
    }
    return Array.isArray(summary) && summary.some((s: Item) => str(s?.step) === step && s?.ok === true);
  };
  return {
    morning: rows.some((r) => str(r.kind) === KIND_MORNING_PULL && str(r.runPhase) === '06:00'),
    bank: rows.some((r) => str(r.kind) === KIND_BANK_CHECK && isTrue(r.bankLoaded) && stepDone(r, 'CheckCommitments')),
  };
}

/**
 * The grouped-task sync after a note write. Always refreshes the tasks holding the notes. When a note's type phase
 * already ran successfully today (06:00 types: today's morning pull נכתב; the commitment type: today's bank check
 * loaded with its CheckCommitments step done – the note is checked first), a note whose trigger date (actionDate /
 * reminderDate + offset) is today or earlier joins today's notes:<type>:<today>:<bookkeeper> task right away (create or
 * refresh, same once-rule); otherwise it waits for the next run's catch-up. Never throws.
 */
export async function syncNoteTasksAfterNoteWrite(client: BlocksClient, x: { noteIds: string[]; customerCode?: string; asOfDate?: string; nowIso?: string }): Promise<Item> {
  const nowIso = x.nowIso ?? new Date().toISOString();
  const asOfDate = x.asOfDate ? resolveAsOf(x.asOfDate) : israelToday();
  const parts: Item[] = [];
  const errors: string[] = [];
  try {
    let ran = { morning: false, bank: false };
    try {
      ran = await phasesRanToday(client, asOfDate);
    } catch (e) {
      errors.push(`ImportBatches: ${errText(e)} – ההערה תצטרף בריצה הבאה`);
    }
    if (ran.bank) {
      const c = await checkCommitments(client, { noteIds: x.noteIds, asOfDate, nowIso, dryRun: false, syncTasks: false });
      parts.push({ checkCommitments: { checked: c.checked, kept: c.kept, partlyKept: c.partlyKept, notKept: c.notKept } });
      errors.push(...c.errors);
    }
    const phases = [ran.morning ? PHASE_MORNING : null, ran.bank ? PHASE_BANK_CHECK : null].filter((p): p is typeof PHASE_MORNING | typeof PHASE_BANK_CHECK => !!p);
    const runs = phases.length ? phases : [null];
    const results: NoteTaskResult[] = [];
    for (const phase of runs) results.push(await syncNoteTasks(client, { dryRun: false, noteIds: x.noteIds, asOfDate, nowIso, phase }));
    for (const r of results) errors.push(...r.errors);
    const sum = (k: 'created' | 'refreshed' | 'reopened' | 'autoClosed' | 'keptClosedByPerson') => results.reduce((n, r) => n + r[k], 0);
    const out = {
      phasesRanToday: ran,
      joinedToday: phases.length > 0,
      created: sum('created'),
      refreshed: sum('refreshed'),
      reopened: sum('reopened'),
      autoClosed: sum('autoClosed'),
      keptClosedByPerson: sum('keptClosedByPerson'),
      changes: results.flatMap((r) => r.changes),
      ...(parts.length ? { checkCommitments: parts[0].checkCommitments } : {}),
      writeVerified: results.every((r) => r.writeVerified) && errors.length === 0,
      errors,
    };
    if (errors.length) console.warn(`syncNoteTasksAfterNoteWrite: ${errors.join('; ')}`);
    return out;
  } catch (e) {
    return { created: 0, refreshed: 0, autoClosed: 0, changes: [], writeVerified: false, errors: [...errors, `משימות: עדכון המשימות המרוכזות נכשל – ${errText(e)}`] };
  }
}

/** The task syncs every note writer passes to writeCustomerNote / updateCustomerNote (grouped tasks + the email's inbox task). */
export const noteWriteSyncs = (label: string) => ({
  taskSync: (client: BlocksClient, x: { noteIds: string[]; customerCode: string; asOfDate: string; nowIso: string }) => syncNoteTasksAfterNoteWrite(client, x),
  emailTaskSync: (client: BlocksClient, emailId: string) => syncTasksAfterWrite(client, { emailIds: [emailId] }, { label }) as unknown as Promise<Item>,
});
