import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { pullOpenMovements } from '../shared/collections-morning-pull.ts';
import { errText, readByIds, readWhereIn, str } from '../shared/collections-data.ts';
import { priorityMovementsSource } from '../shared/priority-movements-source.ts';

// Morning pull, step 2: Priority's unmatched customer movements (FNCTRANS → FNCITEMS_SUBFORM, FRECONNUM = 0) →
// OpenMovements, source "priority-direct" (shared/priority-movements-source.ts + shared/collections-morning-pull.ts).
// GET only against Priority — never writes to it. dryRun defaults to true and writes nothing (not even the cursor).
// A real run without importBatchId gets its own ImportBatches row. Reads stop after READ_BUDGET_MS so the writes fit
// in the 12-minute run budget; resume (default true) continues the unfinished pass from the next customer.
const READ_BUDGET_MS = 10 * 60 * 1000;
/** The whole run's budget: the calc-layer follow-ups start only while there is time left. */
const RUN_BUDGET_MS = 12 * 60 * 1000;
/** A follow-up action needs at least this much time left, or it is skipped with a note. */
const FOLLOW_UP_MIN_MS = 45 * 1000;

/** invokeAction bounded by the run budget: 'timeout' when the deadline comes first (the action itself keeps running). */
async function invokeBounded(client: BlocksClient, name: string, input: any, deadline: number): Promise<any | 'timeout'> {
  const left = deadline - Date.now();
  let timer: any;
  const timeout = new Promise<'timeout'>((r) => {
    timer = setTimeout(() => r('timeout'), Math.max(0, left));
  });
  try {
    return await Promise.race([client.invokeAction(name, input), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 6b, real run only: the customers whose ledger read completed get Customers.movementsSyncedAt = syncedAt (read back),
 * then their calc layer is refreshed – RefreshCustomerAggregates and RefreshInvoiceLayer for those customers. Each step
 * is skipped with a note when the run budget is spent. 6d: a fullHistory run (no BALDATE filter) also sets
 * Customers.fullHistorySyncedAt = syncedAt for those customers, so their invoices dated before the cutoff with no open
 * movement count as closed (0) instead of unknown (null).
 */
async function afterPull(client: BlocksClient, codes: string[], syncedAt: string, deadline: number, notes: string[], errors: string[], fullHistory = false) {
  if (!codes.length) return;
  // 1. movementsSyncedAt (+ fullHistorySyncedAt on a full-history read)
  const stamp: Record<string, string> = fullHistory ? { movementsSyncedAt: syncedAt, fullHistorySyncedAt: syncedAt } : { movementsSyncedAt: syncedAt };
  const fieldsLabel = Object.keys(stamp).join(' + ');
  try {
    const rows = await readWhereIn(client, 'Customers', 'customerCode', codes);
    const ids = rows.map((r) => str(r.id)).filter(Boolean);
    for (let i = 0; i < ids.length; i += 100) {
      await client.updateItems('Customers', ids.slice(i, i + 100).map((id) => ({ id, ...stamp })));
    }
    const back = await readByIds(client, 'Customers', ids);
    const missed = back.filter((r) => Object.keys(stamp).some((f) => Date.parse(str(r[f])) !== Date.parse(syncedAt))).map((r) => str(r.customerCode));
    if (missed.length || back.length !== ids.length) {
      errors.push(`Customers.${fieldsLabel}: לא נשמר ל-${missed.length || ids.length - back.length} לקוחות (${missed.slice(0, 10).join(', ')})`);
      return;
    }
    notes.push(`${fieldsLabel} עודכן ל-${ids.length} לקוחות`);
    console.log(`[PullOpenMovements] ${fieldsLabel} set for ${ids.length} customers`);
  } catch (e) {
    errors.push(`Customers.${fieldsLabel}: ${errText(e)}`);
    return;
  }
  // 2. customer aggregates, 3. invoice layer – both for these customers only
  for (const name of ['RefreshCustomerAggregates', 'RefreshInvoiceLayer']) {
    if (deadline - Date.now() < FOLLOW_UP_MIN_MS) {
      notes.push(`${name}: לא הספיק בזמן ההרצה – ירוץ ברענון הבא`);
      continue;
    }
    try {
      const r = await invokeBounded(client, name, { customerCodes: codes, dryRun: false }, deadline);
      if (r === 'timeout') {
        notes.push(`${name}: לא הסתיים בזמן ההרצה (ממשיך ברקע)`);
        continue;
      }
      const o = r?.output ?? r ?? {};
      const changed = o.customersChanged ?? o.invoicesChanged ?? 0;
      notes.push(`${name}: ${changed} שורות עודכנו, writeVerified=${o.writeVerified === true}`);
      if (Array.isArray(o.errors) && o.errors.length) errors.push(...o.errors.slice(0, 10).map((x: unknown) => `${name}: ${str(x)}`));
      console.log(`[PullOpenMovements] ${name}: changed=${changed} writeVerified=${o.writeVerified}`);
    } catch (e) {
      errors.push(`${name}: ${errText(e)}`);
    }
  }
}

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const started = Date.now();
  const dryRun = input?.dryRun !== false && input?.dryRun !== 'false';
  const nowIso = new Date(started).toISOString();
  let importBatchId = str(input?.importBatchId).trim() || null;
  let ownBatch = false;
  const batchErrors: string[] = [];

  if (!dryRun && !importBatchId) {
    try {
      const day = nowIso.slice(0, 10);
      const created = await client.createItem('ImportBatches', {
        fileName: `תנועות פתוחות מפריוריטי ${day}`,
        fileUrl: null,
        kind: 'משיכת בוקר – Priority',
        dataDate: day,
        workDay: day,
        uploadedAt: nowIso,
        rowsRead: 0,
        rowsWritten: 0,
        status: 'נקרא',
        errors: null,
        runMode: 'ידני',
        runSummary: [],
        isTestFixture: false,
      });
      importBatchId = str(created?.item?.id) || null;
      ownBatch = !!importBatchId;
    } catch (e) {
      batchErrors.push(`ImportBatches: ${errText(e)}`);
    }
  }
  console.log(`[PullOpenMovements] dryRun=${dryRun} fullHistory=${input?.fullHistory === true} resume=${input?.resume !== false} batch=${importBatchId ?? '-'} codes=${Array.isArray(input?.customerCodes) ? input.customerCodes.length : 'all'}`);

  const r = await pullOpenMovements(
    client,
    { dryRun, customerCodes: input?.customerCodes, importBatchId, fullHistory: input?.fullHistory, resume: input?.resume },
    { nowIso, source: priorityMovementsSource, readDeadline: started + READ_BUDGET_MS },
  );
  r.errors.push(...batchErrors);
  const completed = r.completedCodes ?? [];
  delete r.completedCodes;
  if (!dryRun && r.ok && completed.length) {
    // the pull itself succeeded; a follow-up problem is reported in errors / notes without failing it
    await afterPull(client, completed, r.syncedAt, started + RUN_BUDGET_MS, r.notes, r.errors, r.fullHistory === true);
  }

  if (ownBatch && importBatchId) {
    try {
      await client.updateItem('ImportBatches', importBatchId, {
        status: r.ok ? 'נכתב' : 'נכשל',
        rowsRead: r.fromSource,
        rowsWritten: r.written + r.deleted,
        errors: [...r.errors, ...r.customersIncomplete.map((c) => `${c.customerCode}: ${c.error}`)].join('\n').slice(0, 4000) || null,
        runSummary: [{
          step: 'PullOpenMovements', ok: r.ok, rowsRead: r.fromSource, rowsWritten: r.written + r.deleted,
          note: `${r.customersRead} לקוחות נקראו, ${r.customersIncomplete.length} לא הושלמו, ${r.remaining} נשארו להרצה הבאה`,
          error: r.errors[0] ?? null,
        }],
      });
    } catch (e) {
      r.errors.push(`ImportBatches ${importBatchId}: ${errText(e)}`);
    }
  }
  console.log(`[PullOpenMovements] ok=${r.ok} read=${r.customersRead} incomplete=${r.customersIncomplete.length} remaining=${r.remaining} movements=${r.movements} written=${r.written} deleted=${r.deleted} in ${Date.now() - started}ms`);
  return r;
};
