import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { pullOpenMovements } from '../shared/collections-morning-pull.ts';
import { errText, str } from '../shared/collections-data.ts';
import { priorityMovementsSource } from '../shared/priority-movements-source.ts';

// Morning pull, step 2: Priority's unmatched customer movements (FNCTRANS → FNCITEMS_SUBFORM, FRECONNUM = 0) →
// OpenMovements, source "priority-direct" (shared/priority-movements-source.ts + shared/collections-morning-pull.ts).
// GET only against Priority — never writes to it. dryRun defaults to true and writes nothing (not even the cursor).
// A real run without importBatchId gets its own ImportBatches row. Reads stop after READ_BUDGET_MS so the writes fit
// in the 12-minute run budget; resume (default true) continues the unfinished pass from the next customer.
const READ_BUDGET_MS = 10 * 60 * 1000;

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
