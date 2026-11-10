// The GROUPED note tasks – plan 04.11 part A, stage 2. One CollectionQueue task per note type + date + bookkeeper,
// key notes:<type>:<YYYY-MM-DD>:<bookkeeper>, one row per customer + due month in itemsJson.
//
//   type        promise / creditCard / agentCheque / callBack / reminder (plan-settings NOTE_TASK_TYPES keys)
//   bookkeeper  the customer's owner as every task identifies it (CustomerOwners, else Customers.assignedBookkeeperName),
//               ללא when none
//   taskType, offset, phase   AgentSettings noteTask.<type>.* through noteTaskRule – nothing hard-coded here; the phase a
//               type is built in is its runAt: morningPullAt → the 06:00 phase, bankCheckAt → the bank-check phase (09:00)
//
// Joining (build, in the type's phase only): an ACTIVE note joins the task of the run day once its trigger date (actionDate,
// reminder: reminderDate, + offsetDays) is reached – a trigger that fell on a weekend is caught up on the next run – and
// only while its month is above 0 ₪ (OpenMovements). The commitment task takes only commitments whose outcome is קוימה
// חלקית / לא קוימה. ONCE: a note whose <noteId>@<date> already appears in a notes:<type>:* task (open or closed) is
// never added again (a re-dated commitment is a new date, so it may join again).
// Refreshing (every build, and after every note write, scoped to the notes written): rows whose notes closed, whose month
// reached 0, or whose commitment became קוימה leave; numbers refresh; handledBy / handledAt of a row are kept (the screen
// sets them). A task left with no rows → נסגר אוטומטית with a Hebrew resolvedReason; a task a person closed (טופל / נדחה)
// is never touched; today's task closed automatically reopens when new notes join it.
// Guard: an empty OpenMovements mirror (pull never ran / failed) judges no balance – nothing joins for its balance and no
// row leaves for it.
// The per-problem scan (collections-task-upsert.ts syncTasks) never touches notes:* keys (parseTaskKey ignores the kind).
// Never writes to Priority and never contacts anyone.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';
import { addDays, diffDays, formatShortDate, hebrewMonthLabel, israelLocalToUtcIso, israelToday, isValidDate, lastOfMonth, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, errText, formatIls, isTestCode, mapLimit, num, numOrNull, ownerOf, readAll, readByIds, readSettings, readWhereIn, round2, str } from './collections-data.ts';
import {
  balanceOf,
  hasAnyMovement,
  monthBalances,
  NOTE_TYPE_TASK_KEY,
  noteTypeLabel,
  NT_COMMITMENT,
  OUT_NOT_KEPT,
  OUT_PARTLY,
  promisedOf,
  ST_ACTIVE,
} from './collections-notes.ts';
import { computeSeverity, severityConfigFrom } from './collections-severity.ts';
import { syncTasks, type SyncResult, type TaskScope } from './collections-task-upsert.ts';
import { A_AGENT, A_CALL, A_REMIND, buildTaskRow, OPEN_TASK_STATUSES, PERSON_CLOSED_STATUSES, REFRESH_FIELDS, SRC_AGING, TS_AUTO_CLOSED, TS_OPEN } from './collections-tasks.ts';
import { type NoteTaskKey, noteTaskRule, type NoteTaskRule, S_BANK_CHECK_AT, S_MORNING_PULL_AT } from './plan-settings.ts';

const TABLE = 'CollectionQueue';
const EPS = 0.005;
export const NOTES_KIND = 'notes';
export const NOTE_TASK_KEYS: NoteTaskKey[] = ['promise', 'creditCard', 'agentCheque', 'callBack', 'reminder'];
export const NO_OWNER = 'ללא';
export const PHASE_MORNING = '06:00';
export const PHASE_BANK_CHECK = '09:00';
export type NotePhase = typeof PHASE_MORNING | typeof PHASE_BANK_CHECK;
const MAX_REASON_ROWS = 25;
const PROMISE_ROW_OUTCOMES = [OUT_PARTLY, OUT_NOT_KEPT];

const RECOMMENDED: Record<NoteTaskKey, string> = {
  promise: A_CALL,
  creditCard: A_CALL,
  agentCheque: A_AGENT,
  callBack: A_CALL,
  reminder: A_REMIND,
};

export const noteTaskId = (type: string, date: string, owner: string) => `${type}:${date}:${str(owner).trim() || NO_OWNER}`;
export const noteTaskKey = (type: string, date: string, owner: string) => `${NOTES_KIND}:${noteTaskId(type, date, owner)}`;

/** type / date / bookkeeper of a notes:* key; null for any other key. */
export function parseNoteTaskKey(key: unknown): { type: NoteTaskKey; date: string; owner: string } | null {
  const s = str(key).trim();
  if (!s.startsWith(`${NOTES_KIND}:`)) return null;
  const parts = s.split(':');
  if (parts.length < 4) return null;
  const type = parts[1] as NoteTaskKey;
  const date = parts[2];
  const owner = parts.slice(3).join(':');
  if (!NOTE_TASK_KEYS.includes(type) || !isValidDate(date) || !owner) return null;
  return { type, date, owner };
}

/** The phase a type's grouped task is built in, from its runAt setting; null when runAt is not one of the two hours. */
export function phaseOfRule(rule: NoteTaskRule): NotePhase | null {
  if (rule.runAt === S_MORNING_PULL_AT) return PHASE_MORNING;
  if (rule.runAt === S_BANK_CHECK_AT) return PHASE_BANK_CHECK;
  return null;
}

const isOpenStatus = (s: unknown) => !str(s).trim() || OPEN_TASK_STATUSES.includes(str(s).trim());
const isPersonClosed = (s: unknown) => PERSON_CLOSED_STATUSES.includes(str(s).trim());

export interface NoteRow {
  customerId: number | string | null;
  customerCode: string;
  customerName: string;
  dueMonth: string;
  noteIds: string[];
  /** <noteId>@<date the trigger is counted from> – the "once" rule */
  noteKeys: string[];
  noteType: string;
  actionDate: string | null;
  promised: number | null;
  received: number | null;
  remaining: number | null;
  outcome: string | null;
  monthBalance: number | null;
  handledBy: string | null;
  handledAt: string | null;
}

/** itemsJson as stored (array, a JSON string, or {rows}) → rows. */
export function rowsOf(itemsJson: unknown): NoteRow[] {
  let v: unknown = itemsJson;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as Item).rows)) v = (v as Item).rows;
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => r && typeof r === 'object')
    .map((r: Item) => {
      const noteIds = Array.isArray(r.noteIds) ? r.noteIds.map((x: unknown) => str(x).trim()).filter(Boolean) : [];
      const noteKeys = Array.isArray(r.noteKeys) ? r.noteKeys.map((x: unknown) => str(x).trim()).filter(Boolean) : noteIds.map((id: string) => `${id}@${str(r.actionDate)}`);
      return {
        customerId: r.customerId ?? null,
        customerCode: str(r.customerCode).trim(),
        customerName: str(r.customerName),
        dueMonth: str(r.dueMonth).trim(),
        noteIds,
        noteKeys,
        noteType: str(r.noteType),
        actionDate: str(r.actionDate) || null,
        promised: numOrNull(r.promised),
        received: numOrNull(r.received),
        remaining: numOrNull(r.remaining),
        outcome: str(r.outcome) || null,
        monthBalance: numOrNull(r.monthBalance),
        handledBy: str(r.handledBy) || null,
        handledAt: str(r.handledAt) || null,
      };
    });
}

/** The date a note's trigger counts from for a type (actionDate; reminder: reminderDate); null when the note is not of the type. */
export function baseDateOf(type: NoteTaskKey, n: Item): string | null {
  if (type === 'reminder') return toIsraelDate(n.reminderDate);
  if (NOTE_TYPE_TASK_KEY[str(n.noteType).trim()] !== type) return null;
  return toIsraelDate(n.actionDate);
}

// ---------- the pure plan ----------
export interface NoteTaskInput {
  asOfDate: string;
  nowIso: string;
  settings: Map<string, string>;
  /** every note the run knows: the candidates and the notes the tasks reference */
  notes: Map<string, Item>;
  /** notes that may join (build mode); ignored when phase is null */
  candidates: Item[];
  /** null = OpenMovements is empty: no balance is judged */
  balances: Map<string, { total: number; count: number }> | null;
  customersByCode: Map<string, Item>;
  ownerMap: Map<string, string>;
  /** every notes:* CollectionQueue row (any status) */
  tasks: Item[];
  /** build: join the types of this phase; null = refresh only */
  phase: NotePhase | null;
  /** refresh only these task ids (scoped run); null = every open task */
  refreshIds?: Set<string> | null;
}

export interface NoteTaskChange {
  taskKey: string;
  change: 'created' | 'refreshed' | 'reopened' | 'autoClosed' | 'keptClosed';
  taskType: string;
  rows: number;
  joined: number;
  left: number;
  resolvedReason: string | null;
}

export interface NoteTaskPlan {
  creates: Item[];
  updates: { id: string; key: string; fields: Item }[];
  changes: NoteTaskChange[];
  byType: Record<string, { tasks: number; rows: number; joined: number; left: number }>;
  errors: string[];
}

/** Plans the grouped tasks (pure). */
export function planNoteTasks(x: NoteTaskInput): NoteTaskPlan {
  const plan: NoteTaskPlan = { creates: [], updates: [], changes: [], byType: {}, errors: [] };
  const cfg = severityConfigFrom(x.settings);
  const rules = new Map<NoteTaskKey, NoteTaskRule>();
  for (const t of NOTE_TASK_KEYS) {
    const rule = noteTaskRule(x.settings, t);
    rules.set(t, rule);
    plan.byType[t] = { tasks: 0, rows: 0, joined: 0, left: 0 };
    if (!rule.taskType) plan.errors.push(`noteTask.${t}.taskType ריק – המשימה המרוכזת לא נבנית`);
    if (rule.offsetDays === null) plan.errors.push(`noteTask.${t}.offsetDays אינו מספר – הערות לא מצטרפות למשימה`);
    if (!phaseOfRule(rule)) plan.errors.push(`noteTask.${t}.runAt = "${rule.runAt}" אינו ${S_MORNING_PULL_AT} / ${S_BANK_CHECK_AT} – הערות לא מצטרפות למשימה`);
  }
  const balanceKnown = x.balances !== null;
  const balance = (code: string, month: string): number | null => (x.balances ? balanceOf(x.balances, code, month) : null);
  /** may a note sit in a task of this type right now (joined or kept)? */
  const valid = (type: NoteTaskKey, n: Item | undefined): string | null => {
    if (!n) return 'ההערה נמחקה';
    if (str(n.status).trim() !== ST_ACTIVE) return 'ההערה נסגרה';
    if (!baseDateOf(type, n)) return type === 'reminder' ? 'תאריך התזכורת הוסר' : 'להערה אין תאריך';
    if (type === 'promise' && !PROMISE_ROW_OUTCOMES.includes(str(n.outcome).trim())) return str(n.outcome).trim() === 'קוימה' ? 'ההתחייבות קוימה' : 'ההתחייבות עוד לא נבדקה';
    const b = balance(str(n.customerCode).trim(), str(n.dueMonth).trim());
    if (b !== null && b <= EPS) return 'החודש התאפס';
    return null;
  };
  const ownerOfCode = (code: string) => ownerOf(code, x.customersByCode.get(code), x.ownerMap) || NO_OWNER;

  // every task of a type, and the note keys any of them ever held (open or closed)
  const tasksByKey = new Map<string, Item[]>();
  const joinedKeys = new Map<NoteTaskKey, Set<string>>(NOTE_TASK_KEYS.map((t) => [t, new Set<string>()]));
  for (const t of x.tasks) {
    const p = parseNoteTaskKey(t.taskKey);
    if (!p) continue;
    const key = str(t.taskKey).trim();
    if (!tasksByKey.has(key)) tasksByKey.set(key, []);
    tasksByKey.get(key)!.push(t);
    for (const r of rowsOf(t.itemsJson)) for (const k of r.noteKeys) joinedKeys.get(p.type)!.add(k);
  }
  const primaryOf = (rows: Item[]) => {
    const open = rows.filter((r) => isOpenStatus(r.status));
    const pool = open.length ? open : rows;
    return [...pool].sort((a, b) => (Date.parse(str(b.openedAt)) || 0) - (Date.parse(str(a.openedAt)) || 0) || Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? null;
  };

  /** the row of one customer + month from its notes (numbers fresh, handled flags from `prev`) */
  const buildRow = (type: NoteTaskKey, notes: Item[], keys: string[], prev: NoteRow | null): NoteRow => {
    const first = notes[0];
    const code = str(first.customerCode).trim();
    const month = str(first.dueMonth).trim();
    const customer = x.customersByCode.get(code);
    const b = balance(code, month);
    const bases = notes.map((n) => baseDateOf(type, n)).filter((d): d is string => !!d).sort();
    const row: NoteRow = {
      customerId: (first.customer ?? customer?.id ?? prev?.customerId ?? null) as NoteRow['customerId'],
      customerCode: code,
      customerName: str(customer?.customerName).trim() || str(first.customerName).trim() || prev?.customerName || code,
      dueMonth: month,
      noteIds: [...new Set(notes.map((n) => str(n.id)))],
      noteKeys: [...new Set(keys)],
      noteType: [...new Set(notes.map(noteTypeLabel))].join(', '),
      actionDate: bases[0] ?? null,
      promised: null,
      received: null,
      remaining: b,
      outcome: null,
      monthBalance: b,
      handledBy: prev?.handledBy ?? null,
      handledAt: prev?.handledAt ?? null,
    };
    if (type === 'promise') {
      row.promised = round2(notes.reduce((s, n) => s + promisedOf(n), 0));
      row.received = round2(notes.reduce((s, n) => s + num(n.amountReceived), 0));
      row.remaining = round2(notes.reduce((s, n) => s + num(n.amountRemaining), 0));
      row.outcome = notes.every((n) => str(n.outcome).trim() === OUT_NOT_KEPT) ? OUT_NOT_KEPT : OUT_PARTLY;
    } else {
      const amounts = notes.map((n) => numOrNull(n.amount)).filter((a): a is number => a !== null);
      row.promised = amounts.length ? round2(amounts.reduce((s, a) => s + a, 0)) : null;
    }
    return row;
  };

  /** the task's fields from its rows */
  const taskFields = (type: NoteTaskKey, date: string, owner: string, rows: NoteRow[]): Item => {
    const rule = rules.get(type)!;
    const sorted = [...rows].sort((a, b) => a.customerName.localeCompare(b.customerName, 'he') || a.dueMonth.localeCompare(b.dueMonth));
    const codes = [...new Set(sorted.map((r) => r.customerCode))];
    const amount = round2(sorted.reduce((s, r) => s + (type === 'promise' ? num(r.remaining) : Math.max(0, num(r.monthBalance))), 0));
    const oldest = sorted.map((r) => r.dueMonth).filter(Boolean).sort()[0];
    const days = oldest ? Math.max(0, diffDays(date, lastOfMonth(oldest))) : 0;
    const who = codes.length === 1 ? 'לקוח אחד' : `${codes.length} לקוחות`;
    const line = (r: NoteRow) => {
      const month = /^\d{4}-\d{2}$/.test(r.dueMonth) ? hebrewMonthLabel(r.dueMonth) : r.dueMonth;
      const money =
        type === 'promise'
          ? `הובטח ${formatIls(num(r.promised))} ₪, נכנסו ${formatIls(num(r.received))} ₪, נשארו ${formatIls(num(r.remaining))} ₪ (${r.outcome})`
          : `${r.monthBalance !== null ? `פתוח בחודש ${formatIls(r.monthBalance)} ₪` : 'יתרת החודש לא ידועה'}${r.promised !== null ? `, סכום בהערה ${formatIls(r.promised)} ₪` : ''}`;
      return `${r.customerName} (${r.customerCode}) · ${month} · ${money}${r.handledBy ? ` · טופל ע״י ${r.handledBy}` : ''}`;
    };
    const lines = sorted.slice(0, MAX_REASON_ROWS).map(line);
    if (sorted.length > MAX_REASON_ROWS) lines.push(`ועוד ${sorted.length - MAX_REASON_ROWS} שורות`);
    const head =
      type === 'promise'
        ? `התחייבויות לתשלום שמועד הבדיקה שלהן הגיע ולא קוימו במלואן (אחרי ריצת התקבולים), ${who}`
        : type === 'reminder'
          ? `תזכורות מהערות הלקוח שהגיע מועדן, ${who}`
          : `הערות "${rule.noteType}" שהגיע מועדן והחודש עוד לא התאפס, ${who}`;
    const single = codes.length === 1 ? sorted[0] : null;
    const row = buildTaskRow({
      kind: NOTES_KIND,
      id: noteTaskId(type, date, owner),
      taskType: rule.taskType,
      title: `${rule.taskType} · ${who} · ${formatShortDate(date)}`,
      reasons: [head, ...lines].join('\n'),
      recommendedAction: RECOMMENDED[type],
      severity: computeSeverity({ amount, daysOverdue: days }, cfg),
      customerCode: single?.customerCode ?? null,
      customerName: single?.customerName ?? null,
      owner: owner === NO_OWNER ? null : owner,
      amount,
      invoiceNumbers: [],
      relatedTable: 'CustomerNotes',
      relatedId: sorted[0]?.noteIds[0] ?? '',
      dueAt: israelLocalToUtcIso(date, 16, 0),
      asOfDate: date,
      nowIso: x.nowIso,
      isTestFixture: sorted.length > 0 && sorted.every((r) => isTestCode(r.customerCode)),
      isAlert: false,
    });
    row.itemsJson = sorted;
    return row;
  };

  /** refreshed rows of an existing task: notes no longer valid leave; numbers refresh; handled flags stay */
  const refreshRows = (type: NoteTaskKey, rows: NoteRow[]): { rows: NoteRow[]; left: number; reasons: string[] } => {
    const out: NoteRow[] = [];
    const reasons: string[] = [];
    let left = 0;
    for (const r of rows) {
      const keep = r.noteIds.map((id) => ({ id, n: x.notes.get(id), why: valid(type, x.notes.get(id)) }));
      const ok = keep.filter((k) => !k.why);
      if (!ok.length) {
        left += 1;
        reasons.push(keep[0]?.why ?? 'ההערה נסגרה');
        continue;
      }
      const keys = r.noteKeys.filter((k) => ok.some((o) => k.startsWith(`${o.id}@`)));
      out.push(buildRow(type, ok.map((o) => o.n!), keys.length ? keys : ok.map((o) => `${o.id}@${baseDateOf(type, o.n!)}`), r));
    }
    return { rows: out, left, reasons };
  };

  const merge = (type: NoteTaskKey, rows: NoteRow[], joins: { n: Item; key: string }[]): NoteRow[] => {
    const byCell = new Map(rows.map((r) => [`${r.customerCode}|${r.dueMonth}`, r]));
    const add = new Map<string, { n: Item; key: string }[]>();
    for (const j of joins) {
      const cell = `${str(j.n.customerCode).trim()}|${str(j.n.dueMonth).trim()}`;
      if (!add.has(cell)) add.set(cell, []);
      add.get(cell)!.push(j);
    }
    for (const [cell, js] of add) {
      const prev = byCell.get(cell) ?? null;
      const notes = [...(prev ? prev.noteIds.map((id) => x.notes.get(id)).filter((n): n is Item => !!n && !valid(type, n)) : []), ...js.map((j) => j.n)];
      const unique = [...new Map(notes.map((n) => [str(n.id), n])).values()];
      byCell.set(cell, buildRow(type, unique, [...(prev?.noteKeys ?? []), ...js.map((j) => j.key)], prev));
    }
    return [...byCell.values()];
  };

  // ---------- joins of the run's phase ----------
  const joinsByKey = new Map<string, { type: NoteTaskKey; owner: string; joins: { n: Item; key: string }[] }>();
  if (x.phase) {
    for (const type of NOTE_TASK_KEYS) {
      const rule = rules.get(type)!;
      if (phaseOfRule(rule) !== x.phase || rule.offsetDays === null || !rule.taskType) continue;
      for (const n of x.candidates) {
        const base = baseDateOf(type, n);
        if (!base || valid(type, n)) continue;
        if (!balanceKnown) continue;
        if (addDays(base, rule.offsetDays) > x.asOfDate) continue;
        const nk = `${str(n.id)}@${base}`;
        if (joinedKeys.get(type)!.has(nk)) continue;
        const owner = ownerOfCode(str(n.customerCode).trim());
        const key = noteTaskKey(type, x.asOfDate, owner);
        if (!joinsByKey.has(key)) joinsByKey.set(key, { type, owner, joins: [] });
        joinsByKey.get(key)!.joins.push({ n, key: nk });
      }
    }
  }

  // ---------- existing tasks: refresh (and take today's joins) ----------
  const handled = new Set<string>();
  for (const [key, rowsOfKey] of tasksByKey) {
    const p = parseNoteTaskKey(key)!;
    const rule = rules.get(p.type)!;
    const primary = primaryOf(rowsOfKey);
    const joining = joinsByKey.get(key);
    const stat = plan.byType[p.type];
    // duplicates of the key close
    for (const dup of rowsOfKey) {
      if (dup !== primary && isOpenStatus(dup.status)) {
        plan.updates.push({ id: str(dup.id), key, fields: { status: TS_AUTO_CLOSED, resolvedAt: x.nowIso, resolvedReason: 'משימה כפולה – המשימה נמשכת ברשומה אחרת', lastCheckedAt: x.nowIso } });
      }
    }
    if (!primary) continue;
    const id = str(primary.id);
    if (isPersonClosed(primary.status)) {
      if (joining) {
        handled.add(key);
        plan.changes.push({ taskKey: key, change: 'keptClosed', taskType: rule.taskType, rows: rowsOf(primary.itemsJson).length, joined: 0, left: 0, resolvedReason: null });
      }
      continue;
    }
    const open = isOpenStatus(primary.status);
    if (!open && !joining) continue; // closed automatically and nothing new: stays closed
    if (open && x.refreshIds && !x.refreshIds.has(id) && !joining) continue;
    handled.add(key);
    const current = open ? rowsOf(primary.itemsJson) : [];
    const refreshed = refreshRows(p.type, current);
    const rows = joining ? merge(p.type, refreshed.rows, joining.joins) : refreshed.rows;
    const joined = joining ? joining.joins.length : 0;
    stat.joined += joined;
    stat.left += refreshed.left;
    if (!rows.length) {
      const reason = `כל השורות יצאו מהמשימה (${[...new Set(refreshed.reasons)].join(', ') || 'ההערות נסגרו'}) – אין עוד לקוחות לטפל בהם`;
      plan.updates.push({ id, key, fields: { status: TS_AUTO_CLOSED, resolvedAt: x.nowIso, resolvedReason: reason, itemsJson: [], lastCheckedAt: x.nowIso } });
      plan.changes.push({ taskKey: key, change: 'autoClosed', taskType: rule.taskType, rows: 0, joined, left: refreshed.left, resolvedReason: reason });
      continue;
    }
    const row = taskFields(p.type, p.date, p.owner, rows);
    const fields: Item = {};
    for (const k of REFRESH_FIELDS) fields[k] = row[k];
    fields.itemsJson = row.itemsJson;
    fields.lastCheckedAt = x.nowIso;
    if (open) {
      if (!str(primary.status).trim()) fields.status = TS_OPEN;
      plan.updates.push({ id, key, fields });
      plan.changes.push({ taskKey: key, change: 'refreshed', taskType: rule.taskType, rows: rows.length, joined, left: refreshed.left, resolvedReason: null });
    } else {
      Object.assign(fields, { status: TS_OPEN, openedAt: x.nowIso, queueDate: p.date, dueAt: row.dueAt, handledBy: null, handledAt: null, resolvedAt: null, resolvedReason: null });
      plan.updates.push({ id, key, fields });
      plan.changes.push({ taskKey: key, change: 'reopened', taskType: rule.taskType, rows: rows.length, joined, left: 0, resolvedReason: null });
    }
    stat.tasks += 1;
    stat.rows += rows.length;
  }

  // ---------- new tasks of today ----------
  for (const [key, j] of joinsByKey) {
    if (handled.has(key)) continue;
    const rows = merge(j.type, [], j.joins);
    if (!rows.length) continue;
    const row = taskFields(j.type, x.asOfDate, j.owner, rows);
    plan.creates.push(row);
    plan.changes.push({ taskKey: key, change: 'created', taskType: row.taskType, rows: rows.length, joined: j.joins.length, left: 0, resolvedReason: null });
    const stat = plan.byType[j.type];
    stat.tasks += 1;
    stat.rows += rows.length;
    stat.joined += j.joins.length;
  }
  return plan;
}

// ---------- the run ----------
export interface NoteTaskOptions {
  asOfDate?: string | null;
  nowIso?: string;
  /** default true: only report */
  dryRun?: boolean;
  /** build the types of this phase (06:00 / 09:00); null / omitted = refresh only */
  phase?: NotePhase | null;
  /** limit to this customer's notes (joins) and the tasks that hold them (refresh) */
  customerCode?: string | null;
  /** limit to these notes and the tasks that hold them */
  noteIds?: string[] | null;
}

export interface NoteTaskResult {
  asOfDate: string;
  dryRun: boolean;
  phase: string | null;
  created: number;
  refreshed: number;
  reopened: number;
  autoClosed: number;
  keptClosedByPerson: number;
  rows: number;
  byType: Record<string, { tasks: number; rows: number; joined: number; left: number }>;
  changes: NoteTaskChange[];
  balancesKnown: boolean;
  /** a guard that held (e.g. OpenMovements empty), not an error */
  notice?: string | null;
  writeVerified: boolean;
  errors: string[];
}

const emptyResult = (asOfDate: string, dryRun: boolean, phase: string | null, errors: string[]): NoteTaskResult => ({
  asOfDate,
  dryRun,
  phase,
  created: 0,
  refreshed: 0,
  reopened: 0,
  autoClosed: 0,
  keptClosedByPerson: 0,
  rows: 0,
  byType: {},
  changes: [],
  balancesKnown: false,
  writeVerified: false,
  errors,
});

/** Reads, plans, writes (unless dryRun) and reads back the grouped note tasks. */
export async function syncNoteTasks(client: BlocksClient, opts: NoteTaskOptions = {}): Promise<NoteTaskResult> {
  const dryRun = opts.dryRun !== false;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const phase = opts.phase ?? null;
  let asOfDate: string;
  try {
    asOfDate = opts.asOfDate ? resolveAsOf(opts.asOfDate) : israelToday();
  } catch (e) {
    return emptyResult(str(opts.asOfDate), dryRun, phase, [errText(e)]);
  }
  const errors: string[] = [];
  const code = str(opts.customerCode).trim() || null;
  const noteIds = Array.isArray(opts.noteIds) ? [...new Set(opts.noteIds.map((x) => str(x).trim()).filter(Boolean))] : [];
  const scoped = !!code || noteIds.length > 0;
  try {
    const settings = await readSettings(client);
    const taskTypes = [...new Set(NOTE_TASK_KEYS.map((t) => noteTaskRule(settings, t).taskType).filter(Boolean))];
    const activeWhere: WhereClause = { column: 'status', value: ST_ACTIVE };
    const [taskRows, candidates] = await Promise.all([
      taskTypes.length ? readAll(client, TABLE, { column: 'taskType', operator: 'in', value: taskTypes }) : Promise.resolve([] as Item[]),
      phase
        ? noteIds.length
          ? readByIds(client, 'CustomerNotes', noteIds)
          : readAll(client, 'CustomerNotes', code ? { and: [activeWhere, { column: 'customerCode', value: code }] } : activeWhere)
        : Promise.resolve([] as Item[]),
    ]);
    const tasks = taskRows.filter((t) => !!parseNoteTaskKey(t.taskKey));
    // the tasks a scoped run refreshes: the open ones holding one of the notes / the customer
    let refreshIds: Set<string> | null = null;
    if (scoped) {
      refreshIds = new Set(
        tasks
          .filter((t) => isOpenStatus(t.status))
          .filter((t) => rowsOf(t.itemsJson).some((r) => (code && r.customerCode === code) || r.noteIds.some((id) => noteIds.includes(id))))
          .map((t) => str(t.id)),
      );
    }
    // tasks a scoped build may join notes into (today's) are read whole too, so their other rows keep their notes
    const joinable = (t: Item) => !!phase && parseNoteTaskKey(t.taskKey)?.date === asOfDate;
    const relevantTasks = tasks.filter((t) => isOpenStatus(t.status) && (!refreshIds || refreshIds.has(str(t.id)) || joinable(t)));
    const notes = new Map<string, Item>(candidates.map((n) => [str(n.id), n]));
    const referenced = [...new Set(relevantTasks.flatMap((t) => rowsOf(t.itemsJson).flatMap((r) => r.noteIds)))].filter((id) => !notes.has(id));
    if (referenced.length) for (const n of await readByIds(client, 'CustomerNotes', referenced)) notes.set(str(n.id), n);
    const codes = [...new Set([...notes.values()].map((n) => str(n.customerCode).trim()).filter(Boolean))];
    const full = !scoped;
    const [movements, customers, owners] = await Promise.all([
      full ? readAll(client, 'OpenMovements') : codes.length ? readWhereIn(client, 'OpenMovements', 'customerCode', codes) : Promise.resolve([] as Item[]),
      full ? readAll(client, 'Customers') : codes.length ? readWhereIn(client, 'Customers', 'customerCode', codes) : Promise.resolve([] as Item[]),
      full ? readAll(client, 'CustomerOwners') : codes.length ? readWhereIn(client, 'CustomerOwners', 'customerCode', codes) : Promise.resolve([] as Item[]),
    ]);
    const balancesKnown = movements.length > 0 || (!full && (await hasAnyMovement(client)));
    const notice = balancesKnown ? null : 'OpenMovements ריקה – יתרות החודשים לא ידועות: אף הערה לא הצטרפה ואף שורה לא יצאה בגלל יתרה';
    const plan = planNoteTasks({
      asOfDate,
      nowIso,
      settings,
      notes,
      candidates: candidates.filter((n) => str(n.status).trim() === ST_ACTIVE),
      balances: balancesKnown ? monthBalances(movements) : null,
      customersByCode: new Map(customers.map((c) => [str(c.customerCode).trim(), c])),
      ownerMap: buildOwnerMap(owners),
      tasks,
      phase,
      refreshIds,
    });
    errors.push(...plan.errors);
    const count = (c: NoteTaskChange['change']) => plan.changes.filter((x) => x.change === c).length;
    const out: NoteTaskResult = {
      asOfDate,
      dryRun,
      phase,
      created: count('created'),
      refreshed: count('refreshed'),
      reopened: count('reopened'),
      autoClosed: count('autoClosed'),
      keptClosedByPerson: count('keptClosed'),
      rows: Object.values(plan.byType).reduce((s, t) => s + t.rows, 0),
      byType: plan.byType,
      changes: plan.changes,
      balancesKnown,
      notice,
      writeVerified: false,
      errors,
    };
    if (dryRun) return out;
    out.writeVerified = await writePlan(client, plan, errors);
    return out;
  } catch (e) {
    errors.push(`המשימות המרוכזות לא נבנו – ${errText(e)}`);
    return { ...emptyResult(asOfDate, dryRun, phase, errors) };
  }
}

async function writePlan(client: BlocksClient, plan: NoteTaskPlan, errors: string[]): Promise<boolean> {
  if (!plan.creates.length && !plan.updates.length) return errors.length === 0;
  const ids: string[] = [];
  const startErrors = errors.length;
  for (const row of plan.creates) {
    try {
      const created = (await client.createItem(TABLE, row))?.item;
      if (created?.id) ids.push(str(created.id));
      else errors.push(`${TABLE} ${row.taskKey}: לא נוצרה`);
    } catch (e) {
      errors.push(`${TABLE} ${row.taskKey}: ${errText(e)}`);
    }
  }
  await mapLimit(plan.updates, 8, async (u) => {
    try {
      await client.updateItem(TABLE, u.id, u.fields);
      ids.push(u.id);
    } catch (e) {
      errors.push(`${TABLE} ${u.key} (${u.id}): ${errText(e)}`);
    }
  });
  try {
    const back = new Map((await readByIds(client, TABLE, ids)).map((r) => [str(r.id), r]));
    const createdBack = [...back.values()];
    for (const row of plan.creates) {
      const b = createdBack.find((r) => str(r.taskKey) === str(row.taskKey) && str(r.status) === TS_OPEN);
      if (!b || rowsOf(b.itemsJson).length !== rowsOf(row.itemsJson).length) errors.push(`${TABLE}: המשימה ${row.taskKey} לא נקראה בחזרה כפי שנכתבה`);
    }
    for (const u of plan.updates) {
      const b = back.get(u.id);
      const ok = !!b && (!('status' in u.fields) || str(b.status) === str(u.fields.status)) && (!('itemsJson' in u.fields) || rowsOf(b.itemsJson).length === rowsOf(u.fields.itemsJson).length);
      if (!ok) errors.push(`${TABLE}: העדכון של ${u.key} (${u.id}) לא נקרא בחזרה כפי שנכתב`);
    }
  } catch (e) {
    errors.push(`${TABLE}: קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  return errors.length === startErrors;
}

/** After a note write: refresh the tasks holding these notes; never throws (errors go in the summary). */
export async function syncNoteTasksAfterWrite(client: BlocksClient, x: { noteIds: string[]; customerCode?: string; asOfDate?: string; nowIso?: string }): Promise<NoteTaskResult> {
  try {
    const r = await syncNoteTasks(client, { dryRun: false, noteIds: x.noteIds, asOfDate: x.asOfDate, nowIso: x.nowIso });
    if (r.errors.length) console.warn(`syncNoteTasksAfterWrite: ${r.errors.join('; ')}`);
    return r;
  } catch (e) {
    return emptyResult(str(x.asOfDate), false, null, [`משימות: עדכון המשימות המרוכזות נכשל – ${errText(e)}`]);
  }
}

// ---------- BuildTasks: the per-problem scan + the grouped note tasks ----------
export interface BuildTasksOptions {
  asOfDate?: string | null;
  dryRun?: boolean;
  nowIso?: string;
  scope?: TaskScope;
  /** 06:00 (default) = the full scan + the morning grouped types; 09:00 = only the commitment grouped task */
  phase?: string | null;
}

export type BuildTasksResult = SyncResult & { phase: string; noteTasks: NoteTaskResult | null };

/** The note tasks run only when the scope allows the aging source and names no id lists (bank lines / emails / approvals). */
const noteScopeOf = (s: TaskScope = {}) => {
  const ids = [s.bankLineIds, s.emailIds, s.approvalIds].some((l) => Array.isArray(l) && l.length > 0);
  const sources = Array.isArray(s.sources) && s.sources.length ? s.sources : null;
  return { on: !ids && (!sources || sources.includes(SRC_AGING)), customerCode: str(s.customerCode).trim() || null };
};

export async function runBuildTasks(client: BlocksClient, opts: BuildTasksOptions = {}): Promise<BuildTasksResult> {
  const phase = str(opts.phase).trim() || PHASE_MORNING;
  const dryRun = opts.dryRun !== false;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  if (phase !== PHASE_MORNING && phase !== PHASE_BANK_CHECK) {
    return {
      asOfDate: str(opts.asOfDate),
      dryRun,
      found: 0,
      created: 0,
      refreshed: 0,
      reopened: 0,
      autoClosed: 0,
      keptClosedByPerson: 0,
      bySource: {},
      changes: [],
      writeVerified: false,
      errors: [`phase "${phase}" לא מוכר (${PHASE_MORNING} / ${PHASE_BANK_CHECK})`],
      phase,
      noteTasks: null,
    };
  }
  const ns = noteScopeOf(opts.scope);
  if (phase === PHASE_BANK_CHECK) {
    const nt = ns.on ? await syncNoteTasks(client, { asOfDate: opts.asOfDate, dryRun, nowIso, phase: PHASE_BANK_CHECK, customerCode: ns.customerCode }) : null;
    return {
      asOfDate: nt?.asOfDate ?? str(opts.asOfDate),
      dryRun,
      found: 0,
      created: 0,
      refreshed: 0,
      reopened: 0,
      autoClosed: 0,
      keptClosedByPerson: 0,
      bySource: {},
      changes: [],
      writeVerified: nt ? nt.writeVerified : !dryRun,
      errors: nt ? nt.errors.map((e) => `משימות מרוכזות: ${e}`) : [],
      phase,
      noteTasks: nt,
    };
  }
  const scan = await syncTasks(client, { asOfDate: opts.asOfDate, dryRun, nowIso, scope: opts.scope });
  const nt = ns.on ? await syncNoteTasks(client, { asOfDate: scan.asOfDate || opts.asOfDate, dryRun, nowIso, phase: PHASE_MORNING, customerCode: ns.customerCode }) : null;
  return {
    ...scan,
    errors: [...scan.errors, ...(nt?.errors ?? []).map((e) => `משימות מרוכזות: ${e}`)],
    writeVerified: scan.writeVerified && (nt ? nt.writeVerified : true),
    phase,
    noteTasks: nt,
  };
}

