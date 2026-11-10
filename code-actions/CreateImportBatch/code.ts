import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { israelDateOfInstant, resolveAsOf } from '../shared/collections-dates.ts';
import { errText, num, readAll, readByIds, str } from '../shared/collections-data.ts';
import { BANK_KIND, CK_NOT_STARTED, EX_FAILED, EX_READING, READER_AGENT, workDayOf } from '../shared/collections-receipts.ts';

// Step 1 of ReadBankFile: the ImportBatches row of an uploaded bank file (kind קובץ בנק, extractionStatus
// בקריאה, readerAgent BankFileReader, checkStatus טרם התחילו). workDay = the Israel upload date, a
// Friday/Saturday upload counts for that week's Thursday. The same file (name + size on the same work
// day) returns the existing batch with shouldRead=false, unless it failed or is stuck in בקריאה for more
// than 5 minutes (then it is re-opened for another read). With importBatchId: retry of that batch under
// the same rule. Writes only ImportBatches.
const STUCK_MS = 5 * 60 * 1000;
const sizeOf = (v: unknown) => (v === null || v === undefined || v === '' ? null : num(v));

export const invoke = async (input: any, context: any) => {
  const fileUrl = str(input?.fileUrl).trim();
  const fileName = str(input?.fileName).trim();
  const fileSize = sizeOf(input?.fileSize);
  const fileType = str(input?.fileType).trim() || null;
  const uploadedBy = str(input?.uploadedBy).trim() || null;
  const retryId = str(input?.importBatchId).trim();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const out = { importBatchId: '', workDay: '', isDuplicate: false, shouldRead: false, extractionStatus: '', errors: [] as string[] };
  const fail = (...errors: string[]) => ({ ...out, errors });

  let uploadDate: string;
  try {
    uploadDate = input?.asOfDate ? resolveAsOf(input.asOfDate) : israelDateOfInstant(new Date(nowMs));
  } catch (e) {
    return fail(errText(e));
  }
  const workDay = workDayOf(uploadDate);
  out.workDay = workDay;
  const client = new BlocksClient(context);

  const stuck = (b: Item) => str(b.extractionStatus) === EX_READING && nowMs - Date.parse(str(b.uploadedAt) || '1970-01-01') > STUCK_MS;
  const reopen = async (b: Item, isDuplicate: boolean) => {
    const fields: Item = {
      extractionStatus: EX_READING,
      status: 'נקרא',
      errors: null,
      readerWarnings: null,
      uploadedAt: nowIso,
      ...(fileUrl ? { fileUrl } : {}),
      ...(fileName ? { fileName } : {}),
      ...(fileSize !== null ? { fileSize } : {}),
      ...(fileType ? { fileType } : {}),
      ...(uploadedBy ? { uploadedBy } : {}),
    };
    try {
      await client.updateItem('ImportBatches', str(b.id), fields);
    } catch (e) {
      return fail(`ImportBatches ${str(b.id)}: ${errText(e)}`);
    }
    const [back] = await readByIds(client, 'ImportBatches', [str(b.id)]);
    if (!back || str(back.extractionStatus) !== EX_READING) return fail('הקובץ לא נפתח לקריאה חוזרת (לא נקרא בחזרה)');
    return { ...out, importBatchId: str(b.id), workDay: str(back.workDay) || workDay, isDuplicate, shouldRead: true, extractionStatus: EX_READING };
  };

  // ---------- retry of a given batch ----------
  if (retryId) {
    const [b] = await readByIds(client, 'ImportBatches', [retryId]);
    if (!b) return fail(`קובץ ${retryId} לא נמצא`);
    if (str(b.kind) !== BANK_KIND) return fail('אפשר לקרוא שוב רק קובץ בנק');
    if (str(b.extractionStatus) === EX_FAILED || stuck(b)) return reopen(b, false);
    return {
      ...out,
      importBatchId: str(b.id),
      workDay: str(b.workDay) || workDay,
      shouldRead: false,
      extractionStatus: str(b.extractionStatus),
      errors: [`הקובץ במצב "${str(b.extractionStatus)}" – קריאה חוזרת רק לקובץ שנכשל או שנתקע בקריאה`],
    };
  }

  if (!fileUrl) return fail('חסר קישור לקובץ (fileUrl)');
  if (!fileName) return fail('חסר שם קובץ (fileName)');

  // ---------- the same file on the same work day ----------
  const sameName = await readAll(client, 'ImportBatches', { and: [{ column: 'kind', value: BANK_KIND }, { column: 'fileName', value: fileName }] });
  const same = sameName
    .filter((b) => str(b.workDay).slice(0, 10) === workDay && sizeOf(b.fileSize) === fileSize)
    .sort((a, b) => Number(b.id) - Number(a.id) || str(b.id).localeCompare(str(a.id)))[0];
  if (same) {
    if (str(same.extractionStatus) === EX_FAILED || stuck(same)) return reopen(same, true);
    return { ...out, importBatchId: str(same.id), workDay, isDuplicate: true, shouldRead: false, extractionStatus: str(same.extractionStatus) };
  }

  // ---------- a new batch ----------
  const row: Item = {
    fileName,
    fileUrl,
    kind: BANK_KIND,
    dataDate: null,
    uploadedBy,
    uploadedAt: nowIso,
    rowsRead: 0,
    rowsWritten: 0,
    status: 'נקרא',
    errors: null,
    isTestFixture: false,
    workDay,
    fileSize,
    fileType,
    extractionStatus: EX_READING,
    readerAgent: READER_AGENT,
    linesInFile: null,
    totalInFile: null,
    extractedLineCount: null,
    extractedTotal: null,
    totalsCheck: null,
    readerWarnings: null,
    totalsAcknowledged: false,
    verifiedBy: null,
    verifiedAt: null,
    checkStatus: CK_NOT_STARTED,
    checkStartedBy: null,
    checkStartedAt: null,
  };
  let created: Item | null = null;
  try {
    created = (await client.createItem('ImportBatches', row)).item ?? null;
  } catch (e) {
    return fail(`ImportBatches: ${errText(e)}`);
  }
  const id = str(created?.id);
  if (!id) return fail('ImportBatches: השורה נוצרה בלי מזהה');
  const [back] = await readByIds(client, 'ImportBatches', [id]);
  if (!back || str(back.extractionStatus) !== EX_READING) return { ...out, importBatchId: id, errors: ['שורת הקובץ לא נקראה בחזרה'] };
  return { ...out, importBatchId: id, workDay, isDuplicate: false, shouldRead: true, extractionStatus: EX_READING };
};
