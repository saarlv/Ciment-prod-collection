import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { errText, mapLimit, readAll, readByIds, str } from '../shared/collections-data.ts';
import { CK_RUNNING, CS_PENDING, EX_TO_VERIFY, EX_VERIFIED, TC_MISMATCH } from '../shared/collections-receipts.ts';
import { identifyCustomers } from '../shared/collections-identify-customers.ts';

// "אישור השורות והתחלת בדיקות": a person confirms the extracted lines of a bank file. Refused when the file
// is not נקרא – לאימות (already אומת is ok, idempotent) or when the totals did not match and the person did
// not tick "בדקתי מול הבנק" (totalsAcknowledged). Sets the batch אומת / נכתב / בבדיקה with who and when,
// every line without a checkStage to ממתינה לבדיקה, and returns the first line to check.
// Plan 04.11 stage 4 (bankLinesSource קובץ): after confirming, the file's העברה / זיכוי בנק lines go to
// IdentifyCustomers (shared function, dryRun as this run: customer + confidence, one draft receipt per identified line,
// and stop) and its result is returned in identify. runIdentify:false (internal; offline specs that check the confirmed lines
// themselves) confirms without identifying.
const firstWaiting = (lines: Item[]) =>
  lines
    .filter((l) => str(l.checkStage) === CS_PENDING)
    .sort((a, b) => (Number(a.lineNo) || 0) - (Number(b.lineNo) || 0) || str(a.bankLineId).localeCompare(str(b.bankLineId)))[0];

/** The identification of the confirmed file's lines; never throws (a failure is the run's error, the file stays confirmed). */
async function identifyFile(client: BlocksClient, importBatchId: string, verifiedBy: string, dryRun: boolean): Promise<Item> {
  try {
    const r = await identifyCustomers(client, { importBatchId, dryRun, checkedBy: verifiedBy });
    return r;
  } catch (e) {
    return { ok: false, dryRun, counts: null, lines: [], writeVerified: false, errors: [`זיהוי לקוח נכשל: ${errText(e)}`] };
  }
}

export const invoke = async (input: any, context: any) => {
  const importBatchId = str(input?.importBatchId).trim();
  const verifiedBy = str(input?.verifiedBy).trim();
  const ack = input?.totalsAcknowledged === true || input?.totalsAcknowledged === 'true';
  const dryRun = input?.dryRun === true;
  const runIdentify = input?.runIdentify !== false && input?.runIdentify !== 'false';
  const nowIso = new Date().toISOString();
  const out = { ok: false, dryRun, importBatchId, lineCount: 0, firstBankLineId: '', identify: null as Item | null, errors: [] as string[] };
  if (!importBatchId) return { ...out, errors: ['חסר מזהה קובץ (importBatchId)'] };
  if (!verifiedBy) return { ...out, errors: ['חסר שם המאשר/ת (verifiedBy)'] };

  const client = new BlocksClient(context);
  const [[batch], lines] = await Promise.all([
    readByIds(client, 'ImportBatches', [importBatchId]),
    readAll(client, 'BankLines', { column: 'importBatchId', value: importBatchId }),
  ]);
  if (!batch) return { ...out, errors: [`קובץ ${importBatchId} לא נמצא`] };
  const status = str(batch.extractionStatus);
  const first = firstWaiting(lines);
  if (status === EX_VERIFIED) {
    return { ...out, ok: true, lineCount: lines.length, firstBankLineId: str(first?.bankLineId), alreadyVerified: true };
  }
  if (status !== EX_TO_VERIFY) return { ...out, errors: [`אפשר לאשר רק קובץ במצב "${EX_TO_VERIFY}" (הקובץ במצב "${status || 'לא ידוע'}")`] };
  if (!lines.length) return { ...out, errors: ['אין שורות בקובץ לאישור'] };
  if (str(batch.totalsCheck) === TC_MISMATCH && !ack) {
    return { ...out, errors: ['הסיכום שנקרא לא תואם לסיכום בקובץ – יש לסמן "בדקתי מול הבנק" לפני ההתחלה'] };
  }

  const batchFields = {
    extractionStatus: EX_VERIFIED,
    status: 'נכתב',
    checkStatus: CK_RUNNING,
    verifiedBy,
    verifiedAt: nowIso,
    checkStartedBy: verifiedBy,
    checkStartedAt: nowIso,
    totalsAcknowledged: ack,
  };
  const unstaged = lines.filter((l) => !str(l.checkStage));
  const firstAfter = firstWaiting(lines.map((l) => (str(l.checkStage) ? l : { ...l, checkStage: CS_PENDING })));
  if (dryRun) {
    const identify = runIdentify ? await identifyFile(client, importBatchId, verifiedBy, true) : null;
    return { ...out, ok: true, lineCount: lines.length, firstBankLineId: str(firstAfter?.bankLineId), plannedBatch: batchFields, plannedLineStages: unstaged.length, identify };
  }

  const errors: string[] = [];
  await mapLimit(unstaged, 8, async (l) => {
    try {
      await client.updateItem('BankLines', str(l.id), { checkStage: CS_PENDING });
    } catch (e) {
      errors.push(`BankLines ${str(l.bankLineId)}: ${errText(e)}`);
    }
  });
  try {
    await client.updateItem('ImportBatches', importBatchId, batchFields);
  } catch (e) {
    errors.push(`ImportBatches: ${errText(e)}`);
  }
  const [[back], linesBack] = await Promise.all([
    readByIds(client, 'ImportBatches', [importBatchId]),
    readAll(client, 'BankLines', { column: 'importBatchId', value: importBatchId }),
  ]);
  const verified = !!back && str(back.extractionStatus) === EX_VERIFIED && str(back.checkStatus) === CK_RUNNING && linesBack.every((l) => !!str(l.checkStage));
  if (!verified) errors.push('הקובץ לא נקרא בחזרה כמאושר');
  if (!verified || !runIdentify) {
    return { ...out, ok: errors.length === 0, lineCount: linesBack.length, firstBankLineId: str(firstWaiting(linesBack)?.bankLineId), errors };
  }

  // the confirmed file's lines: customer + confidence, draft receipts, stop
  const identify = await identifyFile(client, importBatchId, verifiedBy, false);
  if (identify.ok === false) errors.push(...((identify.errors as string[]) ?? []).map((e) => `זיהוי לקוח: ${e}`));
  const linesAfter = await readAll(client, 'BankLines', { column: 'importBatchId', value: importBatchId }).catch(() => linesBack);
  return { ...out, ok: errors.length === 0, lineCount: linesAfter.length, firstBankLineId: str(firstWaiting(linesAfter)?.bankLineId), identify, errors };
};
