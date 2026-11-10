// The task upsert / close engine against CollectionQueue (the I/O half of collections-tasks.ts).
//
// syncTasks reads the sources in scope, computes the open problems (collections-tasks.ts), loads the existing rows by
// taskKey and reconciles them:
//   - a new problem → a new task (ממתין)
//   - an open task (ממתין / בטיפול) whose problem lasts → refreshed: title, severity, amount, invoiceNumbers, reasons…
//     and lastCheckedAt; openedAt and status stay
//   - a task a person closed (טופל / נדחה) stays closed while the same problem lasts (keptClosedByPerson)
//   - a task closed automatically whose problem returns → reopened (ממתין, new openedAt, resolvedAt/Reason cleared)
//   - an open task whose problem is gone → נסגר אוטומטית with resolvedAt and a Hebrew resolvedReason
// A source that failed to read closes nothing; a scoped run (customerCode, bankLineIds, emailIds, approvalIds,
// sources) opens and closes only keys inside its scope; rows with no taskKey, or a key that is not one of ours
// (manual:…), are never touched. A problem already carried by an open row without a key (written before keys
// existed, same relatedTable / relatedId / taskType) is not opened again. dryRun only reports. Never writes to
// Priority and never contacts anyone.
//
// A returned cheque (receipt-bounced:cheque:<account>:<number>) carries the old line keys of its lines as aliasKeys: an
// open row under an old key is RE-KEYED (status, openedAt, handledBy kept) when the cheque key has no row yet, other open
// old-key rows close as duplicates, and closed old-key rows are never reopened. A scoped run on one of the cheque's
// lines loads the cheque's other lines too, so the task keeps the earliest line as relatedId.
//
// Later writers call syncTasks(client, { scope: { emailIds: [id] }, dryRun: false }) after they change a record.
import type { BlocksClient, Item, WhereClause } from './blocks/blocks-client.ts';
import { israelToday, resolveAsOf } from './collections-dates.ts';
import { createInChunks, errText, mapLimit, num, numOrNull, readAll, readByIds, readSettings, readWhereIn, str } from './collections-data.ts';
import {
  agingTasks,
  AGING_NOTE_TYPES,
  type DesiredTask,
  docCandidate,
  inboxTasks,
  OPEN_TASK_STATUSES,
  parseTaskKey,
  PERSON_CLOSED_STATUSES,
  promiseTasks,
  RECEIPT_KINDS,
  RECEIPT_TASK_CHECK_STAGES,
  RECEIPT_TASK_LINE_STATUSES,
  BOUNCED_LINE_TYPE,
  bouncedTaskId,
  isChequeTaskId,
  receiptTasks,
  REFRESH_FIELDS,
  SCAN_SOURCES,
  type ScopeGroup,
  type SourceTasks,
  SRC_AGING,
  SRC_INBOX,
  SRC_PROMISES,
  SRC_RECEIPTS,
  TASK_KINDS,
  type TaskKind,
  taskContext,
  taskKeyOf,
  TS_AUTO_CLOSED,
  TS_OPEN,
  HS_OPEN,
  HS_WAITING,
} from './collections-tasks.ts';

const TABLE = 'CollectionQueue';

// ---------- scope ----------
export interface TaskScope {
  sources?: string[] | null;
  customerCode?: string | null;
  bankLineIds?: string[] | null;
  emailIds?: string[] | null;
  approvalIds?: string[] | null;
}

export interface NormalScope {
  sources: Set<string>;
  customerCode: string | null;
  groups: Set<ScopeGroup>;
  ids: Partial<Record<ScopeGroup, Set<string>>>;
  /** true when the run covers everything (no filter at all) */
  full: boolean;
}

const idList = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map((x) => str(x).trim()).filter(Boolean))];
  return out.length ? out : null;
};

/**
 * The run's scope. Id lists limit their kinds (bankLineIds → receipt tasks, emailIds → inbox + verify-sender,
 * approvalIds → draft) and, when any is given, only those kinds run; customerCode limits every kind to that customer.
 */
export function normaliseScope(s: TaskScope = {}): NormalScope {
  const given = Array.isArray(s.sources) ? s.sources.map((x) => str(x).trim()).filter((x) => SCAN_SOURCES.includes(x)) : [];
  const sources = new Set(given.length ? given : SCAN_SOURCES);
  const bank = idList(s.bankLineIds);
  const emails = idList(s.emailIds);
  const approvals = idList(s.approvalIds);
  const ids: NormalScope['ids'] = {};
  let groups: Set<ScopeGroup>;
  if (bank || emails || approvals) {
    groups = new Set();
    if (bank) {
      groups.add('receipt');
      ids.receipt = new Set(bank);
    }
    if (emails) {
      groups.add('inbox');
      ids.inbox = new Set(emails);
    }
    if (approvals) {
      groups.add('draft');
      ids.draft = new Set(approvals);
    }
  } else groups = new Set<ScopeGroup>(['aging', 'promise', 'inbox', 'draft', 'receipt']);
  const customerCode = str(s.customerCode).trim() || null;
  return { sources, customerCode, groups, ids, full: !customerCode && groups.size === 5 && sources.size === SCAN_SOURCES.length };
}

/** Is this key (and its row's customer) inside the run's scope? Unmanaged keys never are. */
export function keyInScope(scope: NormalScope, key: unknown, row?: Item | null): boolean {
  const p = parseTaskKey(key);
  if (!p) return false;
  const meta = TASK_KINDS[p.kind];
  if (!scope.sources.has(meta.source) || !scope.groups.has(meta.group)) return false;
  const ids = scope.ids[meta.group];
  if (ids && !ids.has(p.id)) return false;
  if (scope.customerCode && str(row?.customerCode).trim() !== scope.customerCode) return false;
  return true;
}

const groupActive = (scope: NormalScope, source: string, group: ScopeGroup) => scope.sources.has(source) && scope.groups.has(group);

// ---------- the plan ----------
export type ChangeKind = 'created' | 'refreshed' | 'reopened' | 'autoClosed' | 'keptClosed' | 'rekeyed';

export interface TaskChange {
  taskKey: string;
  change: ChangeKind;
  taskType: string | null;
  severity: string | null;
  customerCode: string | null;
  title: string | null;
  resolvedReason: string | null;
}

export interface SourceStats {
  found: number;
  created: number;
  refreshed: number;
  reopened: number;
  autoClosed: number;
  keptClosedByPerson: number;
  /** open rows without a key already carrying the problem (not opened again) */
  coveredByUnkeyed: number;
  readFailed: string | null;
}

export interface TaskPlan {
  creates: { key: string; row: Item }[];
  updates: { id: string; key: string; fields: Item }[];
  changes: TaskChange[];
  bySource: Record<string, SourceStats>;
  totals: { found: number; created: number; refreshed: number; reopened: number; autoClosed: number; keptClosedByPerson: number };
}

const isOpenStatus = (s: unknown) => !str(s).trim() || OPEN_TASK_STATUSES.includes(str(s).trim());
const isPersonClosed = (s: unknown) => PERSON_CLOSED_STATUSES.includes(str(s).trim());
const recency = (r: Item) => Date.parse(str(r.openedAt) || str(r.createdAt)) || Number(r.id ?? 0);
/** The old-key row a re-key keeps: one a person is working on (בטיפול), else the oldest open one. */
const rekeyOrder = (a: Item, b: Item) =>
  Number(str(b.status).trim() === OPEN_TASK_STATUSES[1]) - Number(str(a.status).trim() === OPEN_TASK_STATUSES[1]) ||
  (Date.parse(str(a.openedAt) || str(a.createdAt)) || 0) - (Date.parse(str(b.openedAt) || str(b.createdAt)) || 0) ||
  Number(a.id ?? 0) - Number(b.id ?? 0);

/** The row a key is tracked on: the newest open row, else the newest row. */
function primaryOf(rows: Item[]): Item | null {
  if (!rows.length) return null;
  const open = rows.filter((r) => isOpenStatus(r.status));
  const pool = open.length ? open : rows;
  return [...pool].sort((a, b) => recency(b) - recency(a) || Number(b.id ?? 0) - Number(a.id ?? 0))[0];
}

const unkeyedSignature = (relatedTable: unknown, relatedId: unknown, taskType: unknown) => `${str(relatedTable).trim()}|${str(relatedId).trim()}|${str(taskType).trim()}`;

/**
 * Pure reconciliation of the desired tasks against the existing rows. `existing` = rows with a taskKey (any status);
 * `unkeyedOpen` = open rows without a key; `failed` = sources whose read failed (none of their keys is closed).
 */
export function planTaskSync(x: {
  existing: Item[];
  unkeyedOpen: Item[];
  results: SourceTasks[];
  failed: Map<string, string>;
  scope: NormalScope;
  nowIso: string;
  asOfDate: string;
}): TaskPlan {
  const { scope, nowIso, asOfDate } = x;
  const bySource: Record<string, SourceStats> = {};
  for (const s of SCAN_SOURCES) {
    if (!scope.sources.has(s)) continue;
    bySource[s] = { found: 0, created: 0, refreshed: 0, reopened: 0, autoClosed: 0, keptClosedByPerson: 0, coveredByUnkeyed: 0, readFailed: x.failed.get(s) ?? null };
  }
  const stat = (key: string) => bySource[TASK_KINDS[parseTaskKey(key)!.kind].source];
  const plan: TaskPlan = { creates: [], updates: [], changes: [], bySource, totals: { found: 0, created: 0, refreshed: 0, reopened: 0, autoClosed: 0, keptClosedByPerson: 0 } };

  const existingByKey = new Map<string, Item[]>();
  for (const r of x.existing) {
    const key = str(r.taskKey).trim();
    if (!keyInScope(scope, key, r)) continue;
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key)!.push(r);
  }
  const unkeyed = new Set(x.unkeyedOpen.map((r) => unkeyedSignature(r.relatedTable, r.relatedId, r.taskType)));
  const reasonOf = new Map<string, (key: string) => string>(x.results.map((r) => [r.source, r.closeReason]));

  const desired = new Map<string, DesiredTask>();
  for (const r of x.results) {
    if (x.failed.has(r.source)) continue;
    for (const t of r.tasks) if (!desired.has(t.key) && keyInScope(scope, t.key, t.row)) desired.set(t.key, t);
  }

  const change = (key: string, kind: ChangeKind, row: Item, resolvedReason: string | null = null) =>
    plan.changes.push({
      taskKey: key,
      change: kind,
      taskType: str(row.taskType) || null,
      severity: str(row.severity) || null,
      customerCode: str(row.customerCode) || null,
      title: str(row.title) || null,
      resolvedReason,
    });
  const autoClose = (key: string, row: Item, reason: string) => {
    const fields = { status: TS_AUTO_CLOSED, resolvedAt: nowIso, resolvedReason: reason, lastCheckedAt: nowIso };
    plan.updates.push({ id: str(row.id), key, fields });
    change(key, 'autoClosed', row, reason);
    stat(key).autoClosed += 1;
    plan.totals.autoClosed += 1;
  };

  /** Applies one desired task; returns whether its task ends up open. */
  const handled = new Set<string>();
  const apply = (t: DesiredTask): boolean => {
    handled.add(t.key);
    const s = stat(t.key);
    s.found += 1;
    plan.totals.found += 1;
    const rows = existingByKey.get(t.key) ?? [];
    const primary = primaryOf(rows);
    for (const dup of rows) if (dup !== primary && isOpenStatus(dup.status)) autoClose(t.key, dup, 'משימה כפולה – המשימה נמשכת ברשומה אחרת');
    // older keys of the same problem (a returned cheque's line keys)
    const aliases = (t.aliasKeys ?? [])
      .filter((k) => k !== t.key)
      .flatMap((k) => {
        handled.add(k);
        return (existingByKey.get(k) ?? []).map((row) => ({ key: k, row }));
      });
    const openAliases = aliases.filter((a) => isOpenStatus(a.row.status));
    const dupReason = (keptId: string) => `${t.aliasReason ?? 'כפילות'} – המשימה נמשכת ברשומה ${keptId}`;
    if (!primary && openAliases.length) {
      const keep = [...openAliases].sort((a, b) => rekeyOrder(a.row, b.row))[0];
      const keepId = str(keep.row.id);
      for (const a of openAliases) if (a !== keep) autoClose(a.key, a.row, dupReason(keepId));
      const fields: Item = {};
      for (const k of REFRESH_FIELDS) fields[k] = t.row[k];
      fields.taskKey = t.key;
      fields.lastCheckedAt = nowIso;
      if (!str(keep.row.status).trim()) fields.status = TS_OPEN;
      if (!str(keep.row.openedAt)) fields.openedAt = str(keep.row.createdAt) || nowIso;
      plan.updates.push({ id: keepId, key: t.key, fields });
      change(t.key, 'rekeyed', { ...keep.row, ...fields });
      s.refreshed += 1;
      plan.totals.refreshed += 1;
      return true;
    }
    if (!primary && aliases.length) {
      // only closed old-key rows: never reopened, never replaced by a new row
      const byPerson = aliases.find((a) => isPersonClosed(a.row.status));
      change(t.key, 'keptClosed', (byPerson ?? aliases[0]).row);
      if (byPerson) {
        s.keptClosedByPerson += 1;
        plan.totals.keptClosedByPerson += 1;
      }
      return false;
    }
    if (primary) for (const a of openAliases) autoClose(a.key, a.row, dupReason(str(primary.id)));
    if (!primary) {
      if (t.refreshOnly) return false;
      if (unkeyed.has(unkeyedSignature(t.row.relatedTable, t.row.relatedId, t.row.taskType))) {
        s.coveredByUnkeyed += 1;
        return true;
      }
      plan.creates.push({ key: t.key, row: t.row });
      change(t.key, 'created', t.row);
      s.created += 1;
      plan.totals.created += 1;
      return true;
    }
    const id = str(primary.id);
    if (isOpenStatus(primary.status)) {
      const fields: Item = {};
      if (t.refreshOnly) fields.lastCheckedAt = nowIso;
      else for (const k of REFRESH_FIELDS) fields[k] = t.row[k];
      fields.lastCheckedAt = nowIso;
      if (!str(primary.status).trim()) fields.status = TS_OPEN;
      if (!str(primary.openedAt)) fields.openedAt = str(primary.createdAt) || nowIso;
      plan.updates.push({ id, key: t.key, fields });
      change(t.key, 'refreshed', { ...primary, ...fields });
      s.refreshed += 1;
      plan.totals.refreshed += 1;
      return true;
    }
    if (isPersonClosed(primary.status)) {
      change(t.key, 'keptClosed', primary);
      s.keptClosedByPerson += 1;
      plan.totals.keptClosedByPerson += 1;
      return false;
    }
    // closed automatically (or an unknown closed status): the problem is back
    if (t.refreshOnly) return false;
    const fields: Item = {};
    for (const k of REFRESH_FIELDS) fields[k] = t.row[k];
    Object.assign(fields, {
      status: TS_OPEN,
      openedAt: nowIso,
      queueDate: asOfDate,
      dueAt: t.row.dueAt,
      handledBy: null,
      handledAt: null,
      resolvedAt: null,
      resolvedReason: null,
      lastCheckedAt: nowIso,
    });
    plan.updates.push({ id, key: t.key, fields });
    change(t.key, 'reopened', { ...primary, ...fields });
    s.reopened += 1;
    plan.totals.reopened += 1;
    return true;
  };

  const suppressedClosed = new Map<string, string>();
  const outcome = new Map<string, boolean>();
  for (const t of desired.values()) if (!t.suppressedBy) outcome.set(t.key, apply(t));
  for (const t of desired.values()) {
    if (!t.suppressedBy) continue;
    if (outcome.get(t.suppressedBy)) suppressedClosed.set(t.key, t.suppressedReason ?? 'הבעיה מטופלת במשימה אחרת');
    else apply(t);
  }

  // keys whose problem is gone (or suppressed): close their open rows, unless the source failed to read
  for (const [key, rows] of existingByKey) {
    if (handled.has(key)) continue;
    const source = TASK_KINDS[parseTaskKey(key)!.kind].source;
    if (x.failed.has(source)) continue;
    const open = rows.filter((r) => isOpenStatus(r.status));
    if (!open.length) continue;
    const reason = suppressedClosed.get(key) ?? reasonOf.get(source)?.(key) ?? 'הבעיה נפתרה';
    for (const r of open) autoClose(key, r, reason);
  }
  return plan;
}

// ---------- writing ----------
const same = (a: unknown, b: unknown) => {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return true;
  if (typeof a === 'number' || typeof b === 'number') return numOrNull(a) !== null && numOrNull(b) !== null && Math.abs(num(a) - num(b)) < 0.005;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  return str(a) === str(b);
};
const VERIFY_FIELDS = ['taskKey', 'status', 'title', 'severity', 'severityScore', 'resolvedReason', 'amount', 'needsManagerApproval'];

async function writeUpdates(client: BlocksClient, updates: { id: string; fields: Item }[], errors: string[]) {
  const payload = updates.map((u) => ({ id: u.id, ...u.fields }));
  for (let i = 0; i < payload.length; i += 100) {
    const chunk = payload.slice(i, i + 100);
    try {
      await client.updateItems(TABLE, chunk);
    } catch {
      await mapLimit(chunk, 8, async (item) => {
        const { id, ...fields } = item;
        try {
          await client.updateItem(TABLE, id, fields);
        } catch (e) {
          errors.push(`${TABLE} ${id}: ${errText(e)}`);
        }
      });
    }
  }
}

// ---------- the run ----------
export interface SyncOptions {
  asOfDate?: string | null;
  /** default true: only report */
  dryRun?: boolean;
  scope?: TaskScope;
  /** test clock */
  nowIso?: string;
}

export interface SyncResult {
  asOfDate: string;
  dryRun: boolean;
  found: number;
  created: number;
  refreshed: number;
  reopened: number;
  autoClosed: number;
  keptClosedByPerson: number;
  bySource: Record<string, SourceStats>;
  changes: TaskChange[];
  writeVerified: boolean;
  errors: string[];
}

const EMPTY_TOTALS = { found: 0, created: 0, refreshed: 0, reopened: 0, autoClosed: 0, keptClosedByPerson: 0 };

/** Reads, plans, writes (unless dryRun) and reads back. */
export async function syncTasks(client: BlocksClient, opts: SyncOptions = {}): Promise<SyncResult> {
  const dryRun = opts.dryRun !== false;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const errors: string[] = [];
  let asOfDate: string;
  try {
    asOfDate = opts.asOfDate ? resolveAsOf(opts.asOfDate) : israelToday();
  } catch (e) {
    return { asOfDate: str(opts.asOfDate), dryRun, ...EMPTY_TOTALS, bySource: {}, changes: [], writeVerified: false, errors: [errText(e)] };
  }
  const scope = normaliseScope(opts.scope);
  const code = scope.customerCode;
  const byCode = (w?: WhereClause): WhereClause | undefined => (code ? (w ? { and: [w, { column: 'customerCode', value: code }] } : { column: 'customerCode', value: code }) : w);
  const fail = (e: unknown) => ({ error: errText(e) });
  const attempt = async <T>(p: Promise<T>): Promise<T | { error: string }> => p.catch(fail);
  const isErr = (v: unknown): v is { error: string } => !!v && typeof v === 'object' && !Array.isArray(v) && 'error' in (v as object);

  const agingOn = groupActive(scope, SRC_AGING, 'aging');
  const promiseOn = groupActive(scope, SRC_PROMISES, 'promise');
  const inboxOn = groupActive(scope, SRC_INBOX, 'inbox');
  const draftOn = groupActive(scope, SRC_INBOX, 'draft');
  const receiptOn = groupActive(scope, SRC_RECEIPTS, 'receipt');

  // keys a scoped id run can touch at all (keeps the CollectionQueue read small for one-record writers)
  const idKeys: string[] | null = scope.groups.size < 5
    ? [
        ...[...(scope.ids.receipt ?? [])].flatMap((id) => RECEIPT_KINDS.map((k) => taskKeyOf(k, id))),
        ...[...(scope.ids.inbox ?? [])].flatMap((id) => (['inbox', 'verify-sender'] as TaskKind[]).map((k) => taskKeyOf(k, id))),
        ...[...(scope.ids.draft ?? [])].map((id) => taskKeyOf('draft', id)),
      ]
    : null;
  const openWhere: WhereClause = { or: [{ column: 'status', operator: 'in', value: OPEN_TASK_STATUSES }, { column: 'status', operator: 'is null' }] };
  const keyedOpenRead = idKeys
    ? readWhereIn(client, TABLE, 'taskKey', idKeys)
    : readAll(client, TABLE, byCode({ and: [{ column: 'taskKey', operator: 'is not null' }, openWhere] }));
  const unkeyedRead = readAll(
    client,
    TABLE,
    byCode({
      and: [
        { or: [{ column: 'taskKey', operator: 'is null' }, { column: 'taskKey', value: '' }] },
        { column: 'status', operator: 'in', value: OPEN_TASK_STATUSES },
        { column: 'relatedTable', operator: 'in', value: ['InboundEmails', 'Approvals', 'BankLines', 'Invoices', 'Disputes'] },
      ],
    }),
  );
  const invoiceWhere: WhereClause = {
    or: [
      { column: 'remainingAmount', operator: '>', value: 0 },
      { and: [{ column: 'remainingAmount', operator: 'is null' }, { column: 'openAmount', operator: '>', value: 0 }] },
    ],
  };
  const none = Promise.resolve([] as Item[]);
  const emailWhere: WhereClause = { column: 'handlingState', operator: 'in', value: [HS_OPEN, HS_WAITING] };
  const lineWhere: WhereClause = {
    or: [
      { column: 'lineType', value: BOUNCED_LINE_TYPE },
      { column: 'status', operator: 'in', value: RECEIPT_TASK_LINE_STATUSES },
      { column: 'checkStage', operator: 'in', value: RECEIPT_TASK_CHECK_STAGES },
    ],
  };
  const withIds = (w: WhereClause, column: string, ids?: Set<string>): WhereClause => (ids ? { and: [w, { column, operator: 'in', value: [...ids] }] } : w);

  const [settings, customers, owners, keyedOpen, unkeyedOpen, invoices, disputes, customerNotes, emails, approvals, linesRead] = await Promise.all([
    readSettings(client),
    attempt(readAll(client, 'Customers', byCode())),
    attempt(readAll(client, 'CustomerOwners', byCode())),
    attempt(keyedOpenRead),
    attempt(unkeyedRead),
    agingOn ? attempt(readAll(client, 'Invoices', byCode(invoiceWhere))) : none,
    agingOn ? attempt(readAll(client, 'Disputes', byCode({ or: [{ column: 'status', operator: '!=', value: 'נסגרה' }, { column: 'status', operator: 'is null' }] }))) : none,
    // active commitments / בירור notes: an overdue invoice in a month the customer committed to pay (or disputes) is not a
    // collection task
    agingOn ? attempt(readAll(client, 'CustomerNotes', byCode({ and: [{ column: 'status', value: 'פעילה' }, { column: 'noteType', operator: 'in', value: AGING_NOTE_TYPES }] }))) : none,
    inboxOn ? attempt(readAll(client, 'InboundEmails', byCode(withIds(emailWhere, 'id', scope.ids.inbox)))) : none,
    draftOn ? attempt(readAll(client, 'Approvals', byCode(withIds({ column: 'status', value: 'ממתין' }, 'id', scope.ids.draft)))) : none,
    receiptOn ? attempt(readAll(client, 'BankLines', byCode(withIds(lineWhere, 'bankLineId', scope.ids.receipt)))) : none,
  ]);
  for (const [name, v] of [['Customers', customers], ['CustomerOwners', owners], [TABLE, keyedOpen], [`${TABLE} (ללא מפתח)`, unkeyedOpen]] as const) {
    if (isErr(v)) errors.push(`${name}: ${v.error}`);
  }
  if (errors.length) {
    return { asOfDate, dryRun, ...EMPTY_TOTALS, bySource: {}, changes: [], writeVerified: false, errors: [`הסריקה לא רצה – קריאה נכשלה. ${errors.join('; ')}`] };
  }
  const ctx = taskContext({ asOfDate, nowIso, settings, customers: customers as Item[], owners: owners as Item[] });
  const failed = new Map<string, string>();
  const results: SourceTasks[] = [];
  const existing: Item[] = [...(keyedOpen as Item[])];

  // a scoped run on a returned cheque's line: the cheque's other lines and its tasks (cheque key + their old line keys)
  let lines: Item[] | { error: string } = linesRead;
  if (receiptOn && scope.ids.receipt && !isErr(linesRead)) {
    const ids = scope.ids.receipt;
    const scopedCheques = (linesRead as Item[]).filter((l) => str(l.lineType).trim() === BOUNCED_LINE_TYPE && isChequeTaskId(bouncedTaskId(l)));
    if (scopedCheques.length) {
      const want = new Set(scopedCheques.map(bouncedTaskId));
      const accounts = [...new Set(scopedCheques.map((l) => str(l.bankAccount).trim()))];
      const siblings = await attempt(readAll(client, 'BankLines', { and: [{ column: 'lineType', value: BOUNCED_LINE_TYPE }, { column: 'bankAccount', operator: 'in', value: accounts }] }));
      if (isErr(siblings)) lines = siblings;
      else {
        const have = new Set((linesRead as Item[]).map((l) => str(l.bankLineId).trim()));
        const extra = (siblings as Item[]).filter((l) => want.has(bouncedTaskId(l)) && !have.has(str(l.bankLineId).trim()));
        lines = [...(linesRead as Item[]), ...extra];
        const chequeLines = [...scopedCheques, ...extra];
        for (const l of chequeLines) ids.add(str(l.bankLineId).trim());
        for (const c of want) ids.add(c);
        const extraKeys = [...[...want].map((c) => taskKeyOf('receipt-bounced', c)), ...chequeLines.map((l) => taskKeyOf('receipt-bounced', str(l.bankLineId).trim()))];
        try {
          const loaded = new Set(existing.map((r) => str(r.id)));
          existing.push(...(await readWhereIn(client, TABLE, 'taskKey', [...new Set(extraKeys)])).filter((r) => !loaded.has(str(r.id))));
        } catch (e) {
          return { asOfDate, dryRun, ...EMPTY_TOTALS, bySource: {}, changes: [], writeVerified: false, errors: [`הסריקה לא רצה – קריאה נכשלה. ${TABLE}: ${errText(e)}`] };
        }
      }
    }
  }

  // round 2: delivery notes of the doc candidates
  const invoiceRows = isErr(invoices) ? null : (invoices as Item[]);
  const docNos = agingOn && invoiceRows ? invoiceRows.filter(docCandidate).map((i) => str(i.invoiceNumber).trim()) : [];
  // the lines' receipts (a line with a receipt has no unknown-payer task)
  const lineRows = receiptOn && !isErr(lines) ? (lines as Item[]) : [];
  const lineIds = [...new Set(lineRows.map((l) => str(l.bankLineId).trim()).filter(Boolean))];
  const [notes, lineReceipts] = await Promise.all([
    docNos.length ? attempt(readWhereIn(client, 'DeliveryNotes', 'invoiceNumber', docNos)) : none,
    lineIds.length ? attempt(readWhereIn(client, 'Receipts', 'receiptKey', lineIds.map((id) => `RCPT-${id}`))) : none,
  ]);

  const run = (source: string, on: boolean, reads: unknown[], build: () => SourceTasks) => {
    if (!on) return;
    const bad = reads.find(isErr) as { error: string } | undefined;
    if (bad) {
      failed.set(source, bad.error);
      errors.push(`${source}: הקריאה נכשלה – לא נסגרה אף משימה של המקור (${bad.error})`);
      return;
    }
    try {
      results.push(build());
    } catch (e) {
      failed.set(source, errText(e));
      errors.push(`${source}: ${errText(e)}`);
    }
  };
  run(SRC_AGING, agingOn, [invoices, disputes, notes, customerNotes], () =>
    agingTasks(ctx, { invoices: invoices as Item[], disputes: disputes as Item[], deliveryNotes: notes as Item[], customerNotes: customerNotes as Item[] }),
  );
  // the old payment promises are gone: the promise source only closes leftover promise-broken tasks
  run(SRC_PROMISES, promiseOn, [], () => promiseTasks());
  if (inboxOn || draftOn) {
    run(SRC_INBOX, true, [emails, approvals], () => inboxTasks(ctx, { emails: emails as Item[], approvals: approvals as Item[] }));
  }
  run(SRC_RECEIPTS, receiptOn, [lines, lineReceipts], () => receiptTasks(ctx, { lines: lines as Item[], receipts: lineReceipts as Item[] }));

  // round 3: closed rows of the problems found (a person-closed task stays closed, an auto-closed one reopens)
  if (!idKeys) {
    const loaded = new Set(existing.map((r) => str(r.taskKey).trim()));
    // with the old line keys of each returned cheque (a closed one must stay closed, never be replaced)
    const wanted = [...new Set(results.flatMap((r) => r.tasks.flatMap((t) => [t.key, ...(t.aliasKeys ?? [])])))].filter((k) => !loaded.has(k));
    if (wanted.length) {
      try {
        existing.push(...(await readWhereIn(client, TABLE, 'taskKey', wanted)));
      } catch (e) {
        return { asOfDate, dryRun, ...EMPTY_TOTALS, bySource: {}, changes: [], writeVerified: false, errors: [...errors, `${TABLE}: ${errText(e)}`] };
      }
    }
  }

  const plan = planTaskSync({ existing, unkeyedOpen: unkeyedOpen as Item[], results, failed, scope, nowIso, asOfDate });
  const out: SyncResult = { asOfDate, dryRun, ...plan.totals, bySource: plan.bySource, changes: plan.changes, writeVerified: false, errors };
  if (dryRun) return out;
  if (!plan.creates.length && !plan.updates.length) {
    out.writeVerified = errors.length === 0;
    return out;
  }

  let created: Item[] = [];
  if (plan.creates.length) {
    try {
      created = await createInChunks(client, TABLE, plan.creates.map((c) => c.row));
    } catch (e) {
      errors.push(`${TABLE}: ${errText(e)}`);
    }
  }
  await writeUpdates(client, plan.updates, errors);

  // read back every written row
  let verified = created.length === plan.creates.length;
  try {
    const ids = [...created.map((r) => str(r.id)), ...plan.updates.map((u) => u.id)].filter(Boolean);
    const back = new Map((await readByIds(client, TABLE, ids)).map((r) => [str(r.id), r]));
    for (const c of plan.creates) {
      const row = created.find((r) => str(r.taskKey) === c.key);
      const b = row ? back.get(str(row.id)) : undefined;
      if (!b || VERIFY_FIELDS.some((f) => !same(b[f], c.row[f]))) {
        verified = false;
        errors.push(`${TABLE}: המשימה ${c.key} לא נקראה בחזרה כפי שנכתבה`);
      }
    }
    for (const u of plan.updates) {
      const b = back.get(u.id);
      if (!b || Object.keys(u.fields).filter((f) => VERIFY_FIELDS.includes(f)).some((f) => !same(b[f], u.fields[f]))) {
        verified = false;
        errors.push(`${TABLE}: העדכון של ${u.key} (${u.id}) לא נקרא בחזרה כפי שנכתב`);
      }
    }
  } catch (e) {
    verified = false;
    errors.push(`${TABLE}: קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  out.writeVerified = verified && errors.length === 0;
  return out;
}

// ---------- one keyed task outside the scan (unmanaged kinds: bank-missing, day-pull-failed) ----------
//
// A writer that owns one task by key (the scan never touches it – parseTaskKey does not know the kind) opens it with
// openKeyedTask and closes it with closeKeyedTasks. Same rules as the scan: an open row is refreshed (REFRESH_FIELDS +
// lastCheckedAt, status and openedAt kept), duplicates close, a row a person closed (טופל / נדחה) stays closed, a row
// closed automatically reopens, otherwise a new row is created. Every write is read back.

export interface KeyedTaskResult {
  taskKey: string;
  change: 'created' | 'refreshed' | 'reopened' | 'keptClosed' | 'closed' | 'none';
  taskIds: string[];
  writeVerified: boolean;
  errors: string[];
}

async function writeAndVerify(client: BlocksClient, writes: { id: string | null; fields: Item }[], key: string, out: KeyedTaskResult) {
  const ids: string[] = [];
  try {
    for (const w of writes) {
      if (w.id) {
        await client.updateItem(TABLE, w.id, w.fields);
        ids.push(w.id);
      } else ids.push(str((await client.createItem(TABLE, w.fields))?.item?.id));
    }
    const back = new Map((await readByIds(client, TABLE, ids.filter(Boolean))).map((r) => [str(r.id), r]));
    const ok = writes.every((w, i) => {
      const b = back.get(ids[i]);
      return !!b && VERIFY_FIELDS.filter((f) => f in w.fields).every((f) => same(b[f], w.fields[f]));
    });
    out.taskIds = ids.filter(Boolean);
    out.writeVerified = ok;
    if (!ok) out.errors.push(`${TABLE} ${key}: לא נקרא בחזרה כפי שנכתב`);
  } catch (e) {
    out.taskIds = ids.filter(Boolean);
    out.errors.push(`${TABLE} ${key}: ${errText(e)}`);
  }
}

/** Opens (creates / refreshes / reopens) the task `row.taskKey`; a task a person closed stays closed. */
export async function openKeyedTask(client: BlocksClient, x: { row: Item; nowIso: string; asOfDate: string; dryRun?: boolean }): Promise<KeyedTaskResult> {
  const key = str(x.row.taskKey).trim();
  const out: KeyedTaskResult = { taskKey: key, change: 'none', taskIds: [], writeVerified: false, errors: [] };
  if (!key) {
    out.errors.push(`${TABLE}: משימה בלי taskKey`);
    return out;
  }
  let rows: Item[];
  try {
    rows = await readWhereIn(client, TABLE, 'taskKey', [key]);
  } catch (e) {
    out.errors.push(`${TABLE}: ${errText(e)}`);
    return out;
  }
  const primary = primaryOf(rows);
  const writes: { id: string | null; fields: Item }[] = [];
  for (const dup of rows) {
    if (dup !== primary && isOpenStatus(dup.status)) {
      writes.push({ id: str(dup.id), fields: { status: TS_AUTO_CLOSED, resolvedAt: x.nowIso, resolvedReason: 'משימה כפולה – המשימה נמשכת ברשומה אחרת', lastCheckedAt: x.nowIso } });
    }
  }
  const refresh: Item = {};
  for (const k of REFRESH_FIELDS) if (k in x.row) refresh[k] = x.row[k];
  refresh.lastCheckedAt = x.nowIso;
  if (!primary) {
    writes.unshift({ id: null, fields: x.row });
    out.change = 'created';
  } else if (isOpenStatus(primary.status)) {
    writes.unshift({ id: str(primary.id), fields: { ...refresh, ...(str(primary.status).trim() ? {} : { status: TS_OPEN }) } });
    out.change = 'refreshed';
  } else if (isPersonClosed(primary.status)) {
    out.change = 'keptClosed';
    out.taskIds = [str(primary.id)];
  } else {
    writes.unshift({
      id: str(primary.id),
      fields: { ...refresh, status: TS_OPEN, openedAt: x.nowIso, queueDate: x.asOfDate, dueAt: x.row.dueAt ?? null, handledBy: null, handledAt: null, resolvedAt: null, resolvedReason: null },
    });
    out.change = 'reopened';
  }
  // dryRun defaults to true: only report
  if (x.dryRun !== false) return out;
  if (!writes.length) {
    out.writeVerified = true;
    return out;
  }
  await writeAndVerify(client, writes, key, out);
  return out;
}

/** Closes (נסגר אוטומטית) every open task of `taskType` whose key starts with `keyPrefix`. */
export async function closeKeyedTasks(
  client: BlocksClient,
  x: { taskType: string; keyPrefix: string; reason: string; nowIso: string; dryRun?: boolean },
): Promise<KeyedTaskResult> {
  const out: KeyedTaskResult = { taskKey: x.keyPrefix, change: 'none', taskIds: [], writeVerified: false, errors: [] };
  let rows: Item[];
  try {
    rows = await readAll(client, TABLE, { and: [{ column: 'taskType', value: x.taskType }, { or: [{ column: 'status', operator: 'in', value: OPEN_TASK_STATUSES }, { column: 'status', operator: 'is null' }] }] });
  } catch (e) {
    out.errors.push(`${TABLE}: ${errText(e)}`);
    return out;
  }
  const open = rows.filter((r) => str(r.taskKey).trim().startsWith(x.keyPrefix) && isOpenStatus(r.status));
  if (!open.length) {
    out.writeVerified = true;
    return out;
  }
  out.change = 'closed';
  out.taskKey = open.map((r) => str(r.taskKey)).join(',');
  out.taskIds = open.map((r) => str(r.id));
  if (x.dryRun !== false) return out;
  await writeAndVerify(
    client,
    open.map((r) => ({ id: str(r.id), fields: { status: TS_AUTO_CLOSED, resolvedAt: x.nowIso, resolvedReason: x.reason, lastCheckedAt: x.nowIso } })),
    x.keyPrefix,
    out,
  );
  return out;
}
