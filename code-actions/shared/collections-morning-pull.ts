// The morning pull from Priority – plan 04.11 part A. One implementation for the three Pull actions
// (PullPriorityCustomers, PullOpenMovements, PullOpenOrders) and RunDaySchedule's 06:00 phase: code actions cannot call
// each other cheaply, so they all import these functions.
//
//   pullPriorityCustomers  Customers: upsert by customerCode writing ONLY the Priority columns (PRIORITY_CUSTOMER_COLUMNS,
//                          companyId only when Priority has one, source, syncedAt). Our columns (OUR_CUSTOMER_COLUMNS)
//                          are never written on an existing row. A covered customer that is not returned → priorityStatus
//                          לא פעיל בפריוריטי (never deleted); returned again → its Priority status. Empty source = failed.
//   pullOpenMovements      OpenMovements: replaces the snapshot of every customer the source covers (upsert by
//                          customerCode + movementId, the customer's rows not returned are deleted). Empty source =
//                          failed, nothing written or deleted. Codes not in Customers are skipped and listed.
//   pullOpenOrders         CustomerExposure + ExposureItems: upsert by the mirror keys per returned customer (items of that
//                          customer not returned are deleted). Empty source changes nothing.
//
// Each takes dryRun (default true: only report) and an optional importBatchId of the run it belongs to. Every write is
// read back. Never writes to Priority and never contacts anyone.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { monthKeyOf, toIsraelDate } from './collections-dates.ts';
import { createInChunks, deleteByIds, errText, mapLimit, num, numOrNull, readAll, readWhereIn, round2, str } from './collections-data.ts';
import { type CustomersSource, customersSource, INACTIVE_IN_PRIORITY, type PriorityCustomer } from './priority-customers-source.ts';
import { DOC_OTHER, DOC_TYPES, type MovementsSource, movementsSource, type PriorityMovement } from './priority-movements-source.ts';
import { type ExposureSource, exposureSource, type PriorityExposure } from './priority-orders-source.ts';
import { PRIORITY_NOT_CONNECTED } from './priority-connection.ts';

// ---------- shared ----------
export interface PullDeps {
  /** real time of the pull (syncedAt) */
  nowIso?: string;
}

const same = (a: unknown, b: unknown) => {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return true;
  if (typeof a === 'number' || typeof b === 'number') return numOrNull(a) !== null && numOrNull(b) !== null && Math.abs(num(a) - num(b)) < 0.005;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  return str(a).trim() === str(b).trim();
};
const sameDate = (a: unknown, b: unknown) => (toIsraelDate(a) ?? '') === (toIsraelDate(b) ?? '');

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

const byLowestId = (a: Item, b: Item) => Number(a.id ?? 0) - Number(b.id ?? 0);
/** A reference column value: the platform row id as a number when it is one. */
export const refId = (id: unknown): number | string | null => {
  const s = str(id).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
};

// =====================================================================================================================
// Customers
// =====================================================================================================================

/** The Priority columns of Customers – the ONLY columns the pull writes (plus companyId when Priority has one, source, syncedAt). */
export const PRIORITY_CUSTOMER_COLUMNS = [
  'customerName',
  'customerType',
  'priorityStatus',
  'paymentTermsDays',
  'paymentTermsLabel',
  'creditLimit',
  'salesAgentName',
  'salesAgentPhone',
  'apContactName',
  'apContactEmail',
  'apContactPhone',
  'procurementContactName',
  'procurementContactEmail',
  'procurementContactPhone',
  'primaryEmail',
  'priceListCode',
  'ledgerBalance',
  'address',
  'paymentMethod',
] as const;
const MONEY_COLUMNS = new Set(['creditLimit', 'ledgerBalance']);

/** Our enrichment columns of Customers: never written by the pull on an existing row (a new row gets empty values). */
export const OUR_CUSTOMER_COLUMNS = [
  'checkRemittanceMail',
  'remittanceSenders',
  'assignedBookkeeperName',
  'preferredChannel',
  'doNotContact',
  'collectionStage',
  'internalNotes',
  'collectionNote',
  'lastPaymentDate',
] as const;

/** The values a brand-new customer gets for our columns (no column defaults on the platform). */
const NEW_CUSTOMER_OURS: Item = {
  checkRemittanceMail: false,
  remittanceSenders: null,
  assignedBookkeeperName: null,
  preferredChannel: null,
  doNotContact: false,
  collectionStage: 'תקין',
  internalNotes: null,
  collectionNote: null,
  lastPaymentDate: null,
};

export interface CustomersPullResult {
  ok: boolean;
  /** why nothing ran (e.g. Priority not connected) */
  reason?: string;
  dryRun: boolean;
  source: string;
  fromSource: number;
  created: number;
  updated: number;
  unchanged: number;
  markedInactive: string[];
  reactivated: string[];
  /** customer codes created */
  createdCodes: string[];
  /** per updated customer: the Priority columns that changed */
  changes: { customerCode: string; fields: string[] }[];
  importBatchId: string | null;
  syncedAt: string;
  writeVerified: boolean;
  errors: string[];
}

/** The Priority columns of a source card as they are written (money 2 decimals; companyId only when given). */
export function priorityFieldsOf(c: PriorityCustomer): Item {
  const out: Item = {};
  for (const k of PRIORITY_CUSTOMER_COLUMNS) {
    const v = (c as unknown as Item)[k];
    if (MONEY_COLUMNS.has(k)) out[k] = numOrNull(v) === null ? null : round2(num(v));
    else if (k === 'paymentTermsDays') out[k] = numOrNull(v);
    else out[k] = str(v).trim() ? str(v).trim() : null;
  }
  if (str(c.companyId).trim()) out.companyId = str(c.companyId).trim();
  return out;
}

export async function pullPriorityCustomers(
  client: BlocksClient,
  input: { dryRun?: unknown; importBatchId?: unknown } = {},
  deps: PullDeps & { source?: CustomersSource } = {},
): Promise<CustomersPullResult> {
  const source = deps.source ?? customersSource;
  const syncedAt = deps.nowIso ?? new Date().toISOString();
  const dryRun = input.dryRun !== false && input.dryRun !== 'false';
  const errors: string[] = [];
  const out: CustomersPullResult = {
    ok: false,
    dryRun,
    source: source.name,
    fromSource: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    markedInactive: [],
    reactivated: [],
    createdCodes: [],
    changes: [],
    importBatchId: str(input.importBatchId).trim() || null,
    syncedAt,
    writeVerified: false,
    errors,
  };

  if (source.connected === false) {
    out.reason = PRIORITY_NOT_CONNECTED;
    errors.push(PRIORITY_NOT_CONNECTED);
    return out;
  }
  // ---------- the source ----------
  let cards: PriorityCustomer[];
  try {
    cards = await source.fetchCustomers({ client });
  } catch (e) {
    errors.push(`מקור כרטיסי הלקוח נכשל: ${errText(e)} – לא נכתב דבר`);
    return out;
  }
  const seen = new Set<string>();
  cards = (cards ?? []).filter((c) => {
    const code = str(c?.customerCode).trim();
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
  out.fromSource = cards.length;
  if (!cards.length) {
    errors.push('המקור החזיר 0 לקוחות – המשיכה נחשבת כנכשלה, אף לקוח לא סומן כלא פעיל');
    return out;
  }

  // ---------- plan ----------
  let existing: Item[];
  try {
    existing = await readAll(client, 'Customers');
  } catch (e) {
    errors.push(`Customers: ${errText(e)}`);
    return out;
  }
  const byCode = new Map<string, Item>();
  for (const r of [...existing].sort(byLowestId)) {
    const code = str(r.customerCode).trim();
    if (code && !byCode.has(code)) byCode.set(code, r);
  }
  const creates: Item[] = [];
  const updates: Item[] = [];
  for (const c of cards) {
    const code = str(c.customerCode).trim();
    const fields = priorityFieldsOf(c);
    const row = byCode.get(code);
    if (!row) {
      creates.push({ customerCode: code, ...fields, ...(fields.companyId ? {} : { companyId: null }), ...NEW_CUSTOMER_OURS, source: source.name, syncedAt });
      out.createdCodes.push(code);
      continue;
    }
    const changed = Object.keys(fields).filter((k) => !same(row[k], fields[k]));
    if (!same(row.source, source.name)) changed.push('source');
    if (str(row.priorityStatus).trim() === INACTIVE_IN_PRIORITY && str(fields.priorityStatus) !== INACTIVE_IN_PRIORITY) out.reactivated.push(code);
    updates.push({ id: str(row.id), ...fields, source: source.name, syncedAt });
    if (changed.length) out.changes.push({ customerCode: code, fields: changed });
  }
  const inactive = existing.filter((r) => {
    const code = str(r.customerCode).trim();
    return code && !seen.has(code) && byCode.get(code) === r && source.covers(r) && str(r.priorityStatus).trim() !== INACTIVE_IN_PRIORITY;
  });
  out.markedInactive = inactive.map((r) => str(r.customerCode).trim());
  out.created = creates.length;
  out.updated = out.changes.length;
  out.unchanged = updates.length - out.changes.length;

  if (dryRun) {
    out.ok = true;
    return out;
  }

  // ---------- write ----------
  if (creates.length) {
    try {
      await createInChunks(client, 'Customers', creates);
    } catch (e) {
      errors.push(`Customers: ${errText(e)}`);
    }
  }
  await writeUpdates(client, 'Customers', [...updates, ...inactive.map((r) => ({ id: str(r.id), priorityStatus: INACTIVE_IN_PRIORITY }))], errors);

  // ---------- read back ----------
  try {
    const codes = [...cards.map((c) => str(c.customerCode).trim()), ...out.markedInactive];
    const back = await readWhereIn(client, 'Customers', 'customerCode', codes);
    const backByCode = new Map<string, Item>();
    for (const r of back.sort(byLowestId)) if (!backByCode.has(str(r.customerCode).trim())) backByCode.set(str(r.customerCode).trim(), r);
    for (const c of cards) {
      const b = backByCode.get(str(c.customerCode).trim());
      const f = priorityFieldsOf(c);
      if (!b || str(b.syncedAt) !== syncedAt || !same(b.priorityStatus, f.priorityStatus) || !same(b.customerName, f.customerName)) {
        errors.push(`Customers ${c.customerCode}: לא נקרא בחזרה כפי שנכתב`);
      }
    }
    for (const code of out.markedInactive) {
      if (str(backByCode.get(code)?.priorityStatus) !== INACTIVE_IN_PRIORITY) errors.push(`Customers ${code}: הסימון "${INACTIVE_IN_PRIORITY}" לא נקרא בחזרה`);
    }
  } catch (e) {
    errors.push(`Customers: קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  out.writeVerified = errors.length === 0;
  out.ok = errors.length === 0;
  return out;
}

// =====================================================================================================================
// Open movements
// =====================================================================================================================

export interface MovementsPullResult {
  ok: boolean;
  /** why nothing ran (e.g. Priority not connected) */
  reason?: string;
  dryRun: boolean;
  source: string;
  /** customers whose snapshot was (or would be) replaced */
  customers: number;
  fromSource: number;
  written: number;
  deleted: number;
  created: number;
  updated: number;
  unknownCustomers: string[];
  totalsByCustomer: Record<string, Record<string, number>>;
  importBatchId: string | null;
  syncedAt: string;
  writeVerified: boolean;
  errors: string[];
}

const movementKey = (code: unknown, id: unknown) => `${str(code).trim()}|${str(id).trim()}`;

export async function pullOpenMovements(
  client: BlocksClient,
  input: { dryRun?: unknown; customerCodes?: unknown; importBatchId?: unknown } = {},
  deps: PullDeps & { source?: MovementsSource } = {},
): Promise<MovementsPullResult> {
  const source = deps.source ?? movementsSource;
  const syncedAt = deps.nowIso ?? new Date().toISOString();
  const dryRun = input.dryRun !== false && input.dryRun !== 'false';
  const only = Array.isArray(input.customerCodes) ? [...new Set(input.customerCodes.map((c) => str(c).trim()).filter(Boolean))] : [];
  const importBatchId = str(input.importBatchId).trim() || null;
  const errors: string[] = [];
  const out: MovementsPullResult = {
    ok: false,
    dryRun,
    source: source.name,
    customers: 0,
    fromSource: 0,
    written: 0,
    deleted: 0,
    created: 0,
    updated: 0,
    unknownCustomers: [],
    totalsByCustomer: {},
    importBatchId,
    syncedAt,
    writeVerified: false,
    errors,
  };

  if (source.connected === false) {
    out.reason = PRIORITY_NOT_CONNECTED;
    errors.push(PRIORITY_NOT_CONNECTED);
    return out;
  }
  // ---------- the source ----------
  let answer: { customers: string[]; movements: PriorityMovement[] };
  try {
    answer = await source.fetchOpenMovements({ client, customerCodes: only.length ? only : null });
  } catch (e) {
    errors.push(`מקור התנועות הפתוחות נכשל: ${errText(e)} – לא נכתב ולא נמחק דבר`);
    return out;
  }
  const inScope = (code: string) => !only.length || only.includes(code);
  const seen = new Set<string>();
  const movements = (answer?.movements ?? []).filter((m) => {
    const code = str(m?.customerCode).trim();
    const id = str(m?.movementId).trim();
    if (!code || !id || !inScope(code)) return false;
    const k = movementKey(code, id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  out.fromSource = movements.length;
  if (!movements.length) {
    errors.push('המקור החזיר 0 תנועות – המשיכה נחשבת כנכשלה, הטבלה לא רוקנה');
    return out;
  }
  const coveredCodes = [...new Set([...(answer.customers ?? []).map((c) => str(c).trim()).filter(Boolean), ...movements.map((m) => str(m.customerCode).trim())])].filter(inScope);

  // ---------- customers + the current snapshot ----------
  let customers: Item[];
  let existing: Item[];
  try {
    [customers, existing] = await Promise.all([readWhereIn(client, 'Customers', 'customerCode', coveredCodes), readWhereIn(client, 'OpenMovements', 'customerCode', coveredCodes)]);
  } catch (e) {
    errors.push(`קריאה נכשלה: ${errText(e)} – לא נכתב ולא נמחק דבר`);
    return out;
  }
  const customerByCode = new Map<string, Item>();
  for (const c of customers.sort(byLowestId)) if (!customerByCode.has(str(c.customerCode).trim())) customerByCode.set(str(c.customerCode).trim(), c);
  out.unknownCustomers = coveredCodes.filter((c) => !customerByCode.has(c)).sort();
  const known = new Set(coveredCodes.filter((c) => customerByCode.has(c)));
  out.customers = known.size;

  const existingByKey = new Map<string, Item>();
  const dupIds: string[] = [];
  for (const r of existing.sort(byLowestId)) {
    const k = movementKey(r.customerCode, r.movementId);
    if (existingByKey.has(k)) dupIds.push(str(r.id));
    else existingByKey.set(k, r);
  }

  const creates: Item[] = [];
  const updates: Item[] = [];
  const returnedKeys = new Set<string>();
  for (const m of movements) {
    const code = str(m.customerCode).trim();
    if (!known.has(code)) continue;
    const customer = customerByCode.get(code)!;
    const dueDate = toIsraelDate(m.dueDate) ?? toIsraelDate(m.docDate);
    const docType = DOC_TYPES.includes(str(m.docType).trim()) ? str(m.docType).trim() : DOC_OTHER;
    const amount = round2(num(m.amount));
    const row: Item = {
      movementId: str(m.movementId).trim(),
      customer: refId(customer.id),
      customerCode: code,
      customerName: str(customer.customerName).trim() || str(m.customerName).trim() || code,
      docType,
      docNumber: str(m.docNumber).trim() || null,
      docDate: toIsraelDate(m.docDate),
      dueDate,
      dueMonth: dueDate ? monthKeyOf(dueDate) : null,
      amount,
      details: str(m.details).trim() || null,
      source: source.name,
      importBatchId,
      syncedAt,
    };
    const k = movementKey(code, row.movementId);
    returnedKeys.add(k);
    const old = existingByKey.get(k);
    if (old) updates.push({ id: str(old.id), ...row });
    else creates.push(row);
    const month = row.dueMonth ?? 'ללא חודש';
    out.totalsByCustomer[code] ??= {};
    out.totalsByCustomer[code][month] = round2((out.totalsByCustomer[code][month] ?? 0) + amount);
  }
  const deletes = [
    ...[...existingByKey.entries()].filter(([k, r]) => known.has(str(r.customerCode).trim()) && !returnedKeys.has(k)).map(([, r]) => str(r.id)),
    ...dupIds,
  ];
  out.created = creates.length;
  out.updated = updates.length;
  out.written = creates.length + updates.length;
  out.deleted = deletes.length;

  if (dryRun) {
    out.ok = true;
    return out;
  }

  // ---------- write ----------
  let createFailed = false;
  if (creates.length) {
    try {
      await createInChunks(client, 'OpenMovements', creates);
    } catch (e) {
      createFailed = true;
      errors.push(`OpenMovements: ${errText(e)}`);
    }
  }
  await writeUpdates(client, 'OpenMovements', updates, errors);
  // stale rows go only once every returned row is written (a failed write never leaves a customer emptier than before)
  if (!createFailed && errors.length === 0 && deletes.length) {
    try {
      out.deleted = await deleteByIds(client, 'OpenMovements', deletes);
    } catch (e) {
      errors.push(`OpenMovements (מחיקה): ${errText(e)}`);
    }
  } else if (deletes.length) {
    out.deleted = 0;
    errors.push('הכתיבה לא הושלמה – תנועות ישנות לא נמחקו');
  }

  // ---------- read back ----------
  try {
    const back = await readWhereIn(client, 'OpenMovements', 'customerCode', [...known]);
    const backKeys = new Map(back.map((r) => [movementKey(r.customerCode, r.movementId), r]));
    for (const k of returnedKeys) {
      const b = backKeys.get(k);
      if (!b || str(b.syncedAt) !== syncedAt) errors.push(`OpenMovements ${k}: לא נקרא בחזרה כפי שנכתב`);
    }
    const extra = back.filter((r) => !returnedKeys.has(movementKey(r.customerCode, r.movementId)));
    if (extra.length && out.deleted > 0) errors.push(`OpenMovements: ${extra.length} תנועות ישנות לא נמחקו`);
  } catch (e) {
    errors.push(`OpenMovements: קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  out.writeVerified = errors.length === 0;
  out.ok = errors.length === 0;
  return out;
}

// =====================================================================================================================
// Open orders / exposure
// =====================================================================================================================

export interface OrdersPullResult {
  ok: boolean;
  /** why nothing ran (e.g. Priority not connected) */
  reason?: string;
  dryRun: boolean;
  source: string;
  customers: number;
  itemsFromSource: number;
  written: number;
  deleted: number;
  /** rows whose values (other than syncedAt) changed */
  changed: number;
  importBatchId: string | null;
  syncedAt: string;
  note: string;
  writeVerified: boolean;
  errors: string[];
}

const itemKey = (code: unknown, type: unknown, ref: unknown) => `${str(code).trim()}|${str(type).trim()}|${str(ref).trim()}`;

export async function pullOpenOrders(
  client: BlocksClient,
  input: { dryRun?: unknown; importBatchId?: unknown } = {},
  deps: PullDeps & { source?: ExposureSource } = {},
): Promise<OrdersPullResult> {
  const source = deps.source ?? exposureSource;
  const syncedAt = deps.nowIso ?? new Date().toISOString();
  const dryRun = input.dryRun !== false && input.dryRun !== 'false';
  const errors: string[] = [];
  const out: OrdersPullResult = {
    ok: false,
    dryRun,
    source: source.name,
    customers: 0,
    itemsFromSource: 0,
    written: 0,
    deleted: 0,
    changed: 0,
    importBatchId: str(input.importBatchId).trim() || null,
    syncedAt,
    note: '',
    writeVerified: false,
    errors,
  };

  if (source.connected === false) {
    out.reason = PRIORITY_NOT_CONNECTED;
    errors.push(PRIORITY_NOT_CONNECTED);
    return out;
  }
  let answer: PriorityExposure[];
  try {
    answer = await source.fetchExposure({ client });
  } catch (e) {
    errors.push(`מקור החשיפה (אובליגו) נכשל: ${errText(e)} – לא נכתב דבר`);
    return out;
  }
  const seenCodes = new Set<string>();
  answer = (answer ?? []).filter((e) => {
    const code = str(e?.customerCode).trim();
    if (!code || seenCodes.has(code)) return false;
    seenCodes.add(code);
    return true;
  });
  out.customers = answer.length;
  out.itemsFromSource = answer.reduce((s, e) => s + (e.items?.length ?? 0), 0);
  if (!answer.length) {
    out.ok = true;
    out.writeVerified = true;
    out.note = 'המקור לא החזיר חשיפה – לא שונה דבר';
    return out;
  }
  const codes = [...seenCodes];
  let exposures: Item[];
  let items: Item[];
  try {
    [exposures, items] = await Promise.all([readWhereIn(client, 'CustomerExposure', 'customerCode', codes), readWhereIn(client, 'ExposureItems', 'customerCode', codes)]);
  } catch (e) {
    errors.push(`קריאה נכשלה: ${errText(e)} – לא נכתב דבר`);
    return out;
  }
  const exposureByCode = new Map<string, Item>();
  for (const r of exposures.sort(byLowestId)) if (!exposureByCode.has(str(r.customerCode).trim())) exposureByCode.set(str(r.customerCode).trim(), r);
  const itemByKey = new Map<string, Item>();
  const dupItemIds: string[] = [];
  for (const r of items.sort(byLowestId)) {
    const k = itemKey(r.customerCode, r.itemType, r.reference);
    if (itemByKey.has(k)) dupItemIds.push(str(r.id));
    else itemByKey.set(k, r);
  }

  const expCreates: Item[] = [];
  const expUpdates: Item[] = [];
  const itemCreates: Item[] = [];
  const itemUpdates: Item[] = [];
  const returnedItems = new Set<string>();
  let changed = 0;
  for (const e of answer) {
    const code = str(e.customerCode).trim();
    const exp: Item = { customerCode: code, customerName: str(e.customerName).trim() || null, obligoTotal: round2(num(e.obligoTotal)), asOf: e.asOf ?? syncedAt, source: source.name, syncedAt };
    const old = exposureByCode.get(code);
    if (old) {
      if (!same(old.customerName, exp.customerName) || !same(old.obligoTotal, exp.obligoTotal) || !same(old.asOf, exp.asOf) || !same(old.source, exp.source)) changed += 1;
      expUpdates.push({ id: str(old.id), ...exp });
    } else {
      changed += 1;
      expCreates.push(exp);
    }
    for (const i of e.items ?? []) {
      const k = itemKey(code, i.itemType, i.reference);
      if (!str(i.itemType).trim() || returnedItems.has(k)) continue;
      returnedItems.add(k);
      const row: Item = {
        customerCode: code,
        customerName: exp.customerName,
        itemType: str(i.itemType).trim(),
        reference: str(i.reference).trim() || null,
        amount: round2(num(i.amount)),
        docDate: toIsraelDate(i.docDate),
        dueDate: toIsraelDate(i.dueDate),
        asOf: i.asOf ?? exp.asOf,
        source: source.name,
        syncedAt,
      };
      const oldItem = itemByKey.get(k);
      if (oldItem) {
        if (!same(oldItem.amount, row.amount) || !sameDate(oldItem.docDate, row.docDate) || !sameDate(oldItem.dueDate, row.dueDate) || !same(oldItem.source, row.source)) changed += 1;
        itemUpdates.push({ id: str(oldItem.id), ...row });
      } else {
        changed += 1;
        itemCreates.push(row);
      }
    }
  }
  const itemDeletes = [...[...itemByKey.entries()].filter(([k]) => !returnedItems.has(k)).map(([, r]) => str(r.id)), ...dupItemIds];
  out.changed = changed + itemDeletes.length;
  out.written = expCreates.length + expUpdates.length + itemCreates.length + itemUpdates.length;
  out.deleted = itemDeletes.length;

  if (dryRun) {
    out.ok = true;
    return out;
  }

  for (const [table, rows] of [['CustomerExposure', expCreates], ['ExposureItems', itemCreates]] as const) {
    if (!rows.length) continue;
    try {
      await createInChunks(client, table, rows);
    } catch (e) {
      errors.push(`${table}: ${errText(e)}`);
    }
  }
  await writeUpdates(client, 'CustomerExposure', expUpdates, errors);
  await writeUpdates(client, 'ExposureItems', itemUpdates, errors);
  if (itemDeletes.length) {
    if (errors.length === 0) {
      try {
        out.deleted = await deleteByIds(client, 'ExposureItems', itemDeletes);
      } catch (e) {
        errors.push(`ExposureItems (מחיקה): ${errText(e)}`);
      }
    } else {
      out.deleted = 0;
      errors.push('הכתיבה לא הושלמה – פריטי חשיפה ישנים לא נמחקו');
    }
  }

  try {
    const [expBack, itemBack] = await Promise.all([readWhereIn(client, 'CustomerExposure', 'customerCode', codes), readWhereIn(client, 'ExposureItems', 'customerCode', codes)]);
    for (const code of codes) if (!expBack.some((r) => str(r.customerCode).trim() === code && str(r.syncedAt) === syncedAt)) errors.push(`CustomerExposure ${code}: לא נקרא בחזרה כפי שנכתב`);
    const backKeys = new Set(itemBack.filter((r) => str(r.syncedAt) === syncedAt).map((r) => itemKey(r.customerCode, r.itemType, r.reference)));
    for (const k of returnedItems) if (!backKeys.has(k)) errors.push(`ExposureItems ${k}: לא נקרא בחזרה כפי שנכתב`);
  } catch (e) {
    errors.push(`קריאה חוזרת נכשלה – ${errText(e)}`);
  }
  out.writeVerified = errors.length === 0;
  out.ok = errors.length === 0;
  return out;
}
