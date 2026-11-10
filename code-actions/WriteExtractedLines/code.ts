import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { toIsraelDate } from '../shared/collections-dates.ts';
import { createInChunks, deleteByIds, errText, readAll, readByIds, readWhereIn, round2, str } from '../shared/collections-data.ts';
import {
  ACTOR_READER,
  bankNameOf,
  CS_PENDING,
  creditTotals,
  dupKey,
  EX_FAILED,
  EX_TO_VERIFY,
  EX_VERIFIED,
  type ExtractedLine,
  FLAG_MISSING,
  normaliseExtraction,
  parseExtraction,
  R_READ,
  READER_AGENT,
  READER_DISPLAY,
  RES_FOUND,
  RES_NOT_FOUND,
  ST_READ,
  totalsCheckOf,
  totalsSentence,
} from '../shared/collections-receipts.ts';

// Step 3 of ReadBankFile. Takes the reader agent's structured output (object or JSON string), runs the
// deterministic checks (required fields → שדה חסר, low legibility → קריאות נמוכה, duplicates against
// BankLines of other files → reported and not written, the file's own credit summary → totalsCheck),
// then writes the lines (status חדשה, checkStage ממתינה לבדיקה), reads them back, updates the batch to
// נקרא – לאימות (or נכשל with the reason) and logs one ReceiptCheckSteps step (stage קריאה). Lines are
// written only after every check ran. A re-read of a batch replaces its own unchecked lines.
const LINE_BATCH_LOCKED = (l: Item) => str(l.status) !== 'חדשה' || (str(l.checkStage) && str(l.checkStage) !== CS_PENDING);

export const invoke = async (input: any, context: any) => {
  const importBatchId = str(input?.importBatchId).trim();
  const dryRun = input?.dryRun === true;
  const nowIso = new Date().toISOString();
  const out = {
    dryRun,
    importBatchId,
    extractionStatus: '',
    extractedLineCount: 0,
    extractedTotal: 0,
    linesInFile: null as number | null,
    totalInFile: null as number | null,
    totalsCheck: '',
    duplicates: 0,
    flagged: 0,
    writeVerified: false,
    warnings: [] as string[],
    errors: [] as string[],
  };
  if (!importBatchId) return { ...out, errors: ['חסר מזהה קובץ (importBatchId)'] };
  const client = new BlocksClient(context);
  const [batch] = await readByIds(client, 'ImportBatches', [importBatchId]);
  if (!batch) return { ...out, errors: [`קובץ ${importBatchId} לא נמצא`] };
  if (str(batch.extractionStatus) === EX_VERIFIED) return { ...out, extractionStatus: EX_VERIFIED, errors: ['השורות של הקובץ כבר אומתו – לא נכתב דבר'] };
  const checkRunId = `read-${importBatchId}-${Date.now()}`;

  const step = (result: string, detail: string, evidence: Item, isTest: boolean): Item => ({
    importBatchId,
    bankLineId: null,
    checkRunId,
    stepNo: 1,
    stage: ST_READ,
    rung: R_READ,
    result,
    detail,
    evidence,
    actor: ACTOR_READER,
    actorName: READER_DISPLAY,
    at: nowIso,
    isTestFixture: isTest,
  });

  /** The batch → נכשל with the reason (and the failed step). */
  const failBatch = async (reason: string, isTest: boolean, extra: Item = {}) => {
    const res = { ...out, ...extra, extractionStatus: EX_FAILED, errors: [reason] };
    if (dryRun) return res;
    const errs: string[] = [];
    try {
      await client.updateItem('ImportBatches', importBatchId, { extractionStatus: EX_FAILED, status: 'נכשל', errors: reason, readerAgent: READER_AGENT, isTestFixture: isTest });
    } catch (e) {
      errs.push(`ImportBatches: ${errText(e)}`);
    }
    try {
      await client.createItem('ReceiptCheckSteps', step(RES_NOT_FOUND, `הקריאה נכשלה: ${reason}`, {}, isTest));
    } catch (e) {
      errs.push(`ReceiptCheckSteps: ${errText(e)}`);
    }
    return { ...res, errors: [reason, ...errs] };
  };

  const batchTest = batch.isTestFixture === true || batch.isTestFixture === 'true';
  const raw = parseExtraction(input?.extraction);
  if (!raw) return failBatch('סוכן הקריאה לא החזיר פלט מובנה (extraction ריק או לא תקין)', batchTest);
  const x = normaliseExtraction(raw);
  const isTest = false;
  if (!x.lines.length) return failBatch(`סוכן הקריאה לא מצא תנועות בקובץ${x.warnings.length ? ` (${x.warnings.join('; ')})` : ''}`, isTest);

  // ---------- checks ----------
  const totals = creditTotals(x.lines);
  const totalsCheck = totalsCheckOf(totals.count, totals.total, x.linesInFile, x.totalInFile);
  out.linesInFile = x.linesInFile;
  out.totalInFile = x.totalInFile;
  out.extractedLineCount = totals.count;
  out.extractedTotal = totals.total;
  out.totalsCheck = totalsCheck;

  const ownLines = await readAll(client, 'BankLines', { column: 'importBatchId', value: importBatchId });
  if (ownLines.some(LINE_BATCH_LOCKED)) {
    return { ...out, extractionStatus: str(batch.extractionStatus), errors: ['בקובץ יש שורות שכבר נבדקו או אושרו – אי אפשר לקרוא אותו מחדש'] };
  }
  const amounts = [...new Set(x.lines.map((l) => round2(l.amount ?? 0)).filter((a) => a !== 0))];
  const others = amounts.length ? (await readAll(client, 'BankLines', { column: 'amount', operator: 'in', value: amounts })).filter((l) => str(l.importBatchId) !== importBatchId) : [];
  const existingKeys = new Map<string, Item>();
  for (const l of others) existingKeys.set(dupKey(l.valueDate, l.amount, l.payerName, l.reference), l);
  const dups: { line: ExtractedLine; existing: Item }[] = [];
  const toWrite: ExtractedLine[] = [];
  for (const l of x.lines) {
    const hit = l.valueDate && l.amount ? existingKeys.get(dupKey(l.valueDate, l.amount, l.payerName, l.reference)) : undefined;
    if (hit) dups.push({ line: l, existing: hit });
    else toWrite.push(l);
  }
  const flagged = x.lines.filter((l) => l.flags.length).length;
  out.duplicates = dups.length;
  out.flagged = flagged;

  const warnings: string[] = [...x.warnings];
  const missing = x.lines.filter((l) => l.flags.includes(FLAG_MISSING));
  const low = x.lines.filter((l) => l.flags.includes('קריאות נמוכה'));
  if (missing.length) warnings.push(`${missing.length} שורות עם שדה חסר (${missing.map((l) => l.lineNo).join(', ')}) – לתיקון באימות`);
  if (low.length) warnings.push(`${low.length} שורות בקריאות נמוכה (${low.map((l) => l.lineNo).join(', ')})`);
  if (dups.length) {
    warnings.push(
      `${dups.length} שורות כבר קיימות מקובץ קודם ולא נכתבו שוב: ${dups.map((d) => `שורה ${d.line.lineNo} (${str(d.existing.bankLineId)})`).join(', ')}`,
    );
  }
  const sentence = totalsSentence(x.lines.length, totals.count, totals.total, totalsCheck, x.linesInFile, x.totalInFile);
  if (totalsCheck !== 'תואם') warnings.push(sentence);
  out.warnings = warnings;

  if (!toWrite.length) {
    return failBatch(`כל ${x.lines.length} השורות כבר קיימות מקבצים קודמים – לא נכתבו שורות חדשות`, isTest, { duplicates: dups.length, flagged, warnings });
  }

  const dates = x.lines.map((l) => l.valueDate).filter(Boolean) as string[];
  const dataDate = x.periodTo ?? (dates.length ? dates.sort().at(-1)! : null);
  const prefix = `BL-${importBatchId}`;
  const rows: Item[] = toWrite.map((l) => ({
    bankLineId: `${prefix}-${l.lineNo}`,
    bankName: bankNameOf(x.bankName),
    valueDate: l.valueDate,
    amount: l.amount ?? 0,
    payerName: l.payerName || null,
    reference: l.reference || null,
    bankAccount: x.account || null,
    lineType: l.lineType,
    customerCode: null,
    customerName: null,
    importBatchId,
    status: 'חדשה',
    source: 'priority-file',
    syncedAt: nowIso,
    lineNo: l.lineNo,
    sourceRef: l.sourceRef || null,
    rawText: l.rawText || null,
    legibility: l.legibility,
    extractionFlags: l.flags.length ? l.flags.join(', ') : null,
    correctedBy: null,
    correctedAt: null,
    checkStage: CS_PENDING,
    lastCheckRunId: null,
    lastCheckedAt: null,
  }));
  const batchFields: Item = {
    dataDate,
    rowsRead: x.lines.length,
    rowsWritten: rows.length,
    linesInFile: x.linesInFile,
    totalInFile: x.totalInFile,
    extractedLineCount: totals.count,
    extractedTotal: totals.total,
    totalsCheck,
    readerWarnings: warnings.length ? warnings.join('\n') : null,
    readerAgent: READER_AGENT,
    extractionStatus: EX_TO_VERIFY,
    status: 'נקרא',
    errors: null,
    isTestFixture: isTest,
  };
  const evidence = {
    account: x.account || null,
    bankName: x.bankName || null,
    periodFrom: x.periodFrom,
    periodTo: x.periodTo,
    linesInFile: x.linesInFile,
    totalInFile: x.totalInFile,
    extractedLineCount: totals.count,
    extractedTotal: totals.total,
    rowsRead: x.lines.length,
    totalsCheck,
    duplicates: dups.map((d) => ({ lineNo: d.line.lineNo, existingBankLineId: str(d.existing.bankLineId) })),
    flagged: x.lines.filter((l) => l.flags.length).map((l) => ({ lineNo: l.lineNo, flags: l.flags })),
    warnings,
  };

  if (dryRun) {
    return { ...out, extractionStatus: EX_TO_VERIFY, plannedLines: rows, plannedBatch: batchFields, plannedStep: step(RES_FOUND, sentence, evidence, isTest) };
  }

  // ---------- write: replace this batch's own unchecked lines (re-read), then the new lines ----------
  const errors: string[] = [];
  if (ownLines.length) {
    const n = await deleteByIds(client, 'BankLines', ownLines.map((l) => str(l.id)));
    if (n !== ownLines.length) return failBatch('השורות הקודמות של הקובץ לא נמחקו – הקריאה לא נכתבה', isTest);
  }
  try {
    await createInChunks(client, 'BankLines', rows);
  } catch (e) {
    errors.push(`BankLines: ${errText(e)}`);
  }
  const back = await readWhereIn(client, 'BankLines', 'bankLineId', rows.map((r) => str(r.bankLineId)));
  const backById = new Map(back.map((b) => [str(b.bankLineId), b]));
  const missingBack: string[] = [];
  for (const r of rows) {
    const b = backById.get(str(r.bankLineId));
    if (!b || str(b.importBatchId) !== importBatchId || Math.abs(Number(b.amount) - Number(r.amount)) > 0.001 || (r.valueDate && toIsraelDate(b.valueDate) !== r.valueDate)) {
      missingBack.push(str(r.bankLineId));
    }
  }
  const writeVerified = errors.length === 0 && missingBack.length === 0;
  if (!writeVerified) {
    // no half-written file: remove whatever got in, then fail the batch with the reason
    const got = back.filter((b) => str(b.importBatchId) === importBatchId).map((b) => str(b.id));
    if (got.length) await deleteByIds(client, 'BankLines', got);
    return failBatch(`השורות לא נשמרו כמו שנקראו (${[...errors, missingBack.length ? `לא נקראו בחזרה: ${missingBack.join(', ')}` : ''].filter(Boolean).join('; ')})`, isTest, {
      duplicates: dups.length,
      flagged,
      warnings,
    });
  }
  try {
    await client.updateItem('ImportBatches', importBatchId, batchFields);
  } catch (e) {
    errors.push(`ImportBatches: ${errText(e)}`);
  }
  try {
    await client.createItem('ReceiptCheckSteps', step(RES_FOUND, sentence, evidence, isTest));
  } catch (e) {
    errors.push(`ReceiptCheckSteps: ${errText(e)}`);
  }
  const [batchBack] = await readByIds(client, 'ImportBatches', [importBatchId]);
  const batchOk = !!batchBack && str(batchBack.extractionStatus) === EX_TO_VERIFY && Number(batchBack.rowsWritten) === rows.length;
  return {
    ...out,
    extractionStatus: batchBack ? str(batchBack.extractionStatus) : EX_TO_VERIFY,
    rowsRead: x.lines.length,
    rowsWritten: rows.length,
    bankLineIds: rows.map((r) => r.bankLineId),
    isTestFixture: isTest,
    detail: sentence,
    writeVerified: writeVerified && batchOk && errors.length === 0,
    errors,
  };
};
