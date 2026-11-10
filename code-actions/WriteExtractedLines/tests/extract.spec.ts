import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { CTX, sampleExtraction } from '../../shared/fake-receipts.ts';
import { invoke as createBatch } from '../../CreateImportBatch/code.ts';
import { invoke as write } from '../code.ts';
import { invoke as confirm } from '../../ConfirmExtractedLines/code.ts';
import { invoke as feedback } from '../../RecordAgentFeedback/code.ts';

const T = '2026-10-21';
let fake: FakeBlocks;
const newBatch = async (fileName = 'בדיקה – תנועות.pdf', fileSize = 100) =>
  (await createBatch({ fileUrl: 'https://files.example/protected/f.pdf', fileName, fileSize, fileType: 'application/pdf', uploadedBy: 'רינה', asOfDate: T }, CTX)).importBatchId as string;
const batchRow = (id: string) => fake.rows('ImportBatches').find((b) => b.id === id)!;
const linesOf = (id: string) => fake.rows('BankLines').filter((b) => b.importBatchId === id).sort((a, b) => a.lineNo - b.lineNo);

beforeEach(() => {
  fake = new FakeBlocks();
  current = fake.client();
});

describe('WriteExtractedLines', () => {
  it('the sample file as a JSON string: 9 lines written, credits 8 / 211,617 = the file summary → תואם; one reader step', async () => {
    const id = await newBatch();
    const r = await write({ importBatchId: id, extraction: JSON.stringify(sampleExtraction(T)) }, CTX);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ extractionStatus: 'נקרא – לאימות', extractedLineCount: 8, extractedTotal: 211617, linesInFile: 8, totalInFile: 211617, totalsCheck: 'תואם', duplicates: 0, flagged: 0, writeVerified: true });
    const lines = linesOf(id);
    expect(lines.map((l) => [l.bankLineId, l.amount, l.checkStage, l.status, l.source])).toEqual(
      [12000, 17424, 9360, 82880, -14500, 3333, 8000, 50000, 28620].map((a, i) => [`TEST-BL-${id}-${i + 1}`, a, 'ממתינה לבדיקה', 'חדשה', 'test-fixture']),
    );
    expect(lines[4]).toMatchObject({ lineType: 'צ׳ק חוזר', reference: 'צ׳ק 004512 חזר – אין כיסוי מספיק', sourceRef: 'p1:r5', bankName: 'מזרחי', bankAccount: 'TEST-ACC-1 (בדיקה)', legibility: 'טובה' });
    expect(batchRow(id)).toMatchObject({ extractionStatus: 'נקרא – לאימות', status: 'נקרא', rowsRead: 9, rowsWritten: 9, totalsCheck: 'תואם', isTestFixture: true, dataDate: '2026-10-20', readerAgent: 'BankFileReader' });
    const steps = fake.rows('ReceiptCheckSteps');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ importBatchId: id, bankLineId: null, stepNo: 1, stage: 'קריאה', rung: 'קריאת הקובץ', result: 'נמצא', actor: 'סוכן הקריאה', actorName: 'סוכן הקריאה', isTestFixture: true });
    expect(steps[0].detail).toBe('נקראו 9 שורות (8 זיכויים), סה״כ 211,617. תואם לסיכום בקובץ');
  });

  it('the same output as an object (or wrapped in the step output) is read the same way', async () => {
    const a = await newBatch('בדיקה – א.pdf');
    expect((await write({ importBatchId: a, extraction: sampleExtraction(T) }, CTX)).writeVerified).toBe(true);
    const b = await newBatch('בדיקה – ב.pdf');
    // the same lines again are duplicates of batch a → all duplicates → נכשל (nothing new)
    const dup = await write({ importBatchId: b, extraction: { structuredOutput: sampleExtraction(T) } }, CTX);
    expect(dup.extractionStatus).toBe('נכשל');
    // the sample file has 9 lines since 28.10 (08 מגדלי השרון 50,000, 09 רמות 28,620)
    expect(dup.duplicates).toBe(9);
    expect(dup.errors[0]).toBe('כל 9 השורות כבר קיימות מקבצים קודמים – לא נכתבו שורות חדשות');
    expect(linesOf(b)).toHaveLength(0);
  });

  it('missing or empty extraction → batch נכשל with the reason, no lines', async () => {
    for (const extraction of [undefined, '', '{{ReadStepReader}}', { lines: [] }]) {
      fake = new FakeBlocks();
      current = fake.client();
      const id = await newBatch();
      const r = await write({ importBatchId: id, extraction }, CTX);
      expect(r.extractionStatus).toBe('נכשל');
      expect(batchRow(id)).toMatchObject({ extractionStatus: 'נכשל', status: 'נכשל' });
      expect(String(batchRow(id).errors)).toMatch(/סוכן הקריאה (לא החזיר פלט מובנה|לא מצא תנועות)/);
      expect(fake.rows('BankLines')).toHaveLength(0);
      expect(fake.rows('ReceiptCheckSteps')[0]).toMatchObject({ result: 'לא נמצא', stage: 'קריאה' });
    }
  });

  it('required fields, legibility, duplicates against another file, and totals (tolerance 0.01)', async () => {
    fake.insert('BankLines', [{ bankLineId: 'BL-OLD-1', importBatchId: 'old', valueDate: '2026-10-20', amount: 500, payerName: 'לקוח א בע״מ', reference: 'אסמכתא 1', status: 'קבלה הונפקה', source: 'priority-file' }]);
    const id = await newBatch('mizrahi.pdf', 7);
    const ex = {
      account: '123-456789',
      bankName: 'בנק מזרחי טפחות',
      periodFrom: '2026-10-20',
      periodTo: '2026-10-20',
      linesInFile: 4,
      totalInFile: 2700.005,
      lines: [
        { lineNo: 1, valueDate: '2026-10-20', amount: 1000, payerName: 'לקוח ב', reference: '', lineType: 'העברה', sourceRef: 'p1:r1', rawText: 'r1', legibility: 'טובה' },
        { lineNo: 2, valueDate: '20/10/2026', amount: null, payerName: 'לקוח ג', reference: '', lineType: 'העברה', sourceRef: 'p1:r2', rawText: 'r2', legibility: 'נמוכה' },
        { lineNo: 3, valueDate: '', amount: 1200, payerName: '', reference: '', lineType: "צ'ק", sourceRef: 'p1:r3', rawText: 'r3', legibility: 'בינונית' },
        { lineNo: 4, valueDate: '2026-10-20', amount: 500, payerName: 'לקוח א בע"מ', reference: 'אסמכתא  1', lineType: 'העברה', sourceRef: 'p1:r4', rawText: 'r4', legibility: 'טובה' },
      ],
      warnings: ['עמוד 2 מטושטש'],
    };
    const r = await write({ importBatchId: id, extraction: ex }, CTX);
    expect(r.errors).toEqual([]);
    // credits: 1000 + 1200 + 500 (the null amount is never counted) = 3 lines, 2,700 ≠ 4 lines
    expect(r).toMatchObject({ extractedLineCount: 3, extractedTotal: 2700, totalsCheck: 'לא תואם', duplicates: 1, flagged: 2 });
    const lines = linesOf(id);
    expect(lines.map((l) => [l.bankLineId, l.amount, l.extractionFlags, l.valueDate ?? null, l.source, l.lineType])).toEqual([
      [`BL-${id}-1`, 1000, null, '2026-10-20', 'priority-file', 'העברה'],
      [`BL-${id}-2`, 0, 'שדה חסר, קריאות נמוכה', '2026-10-20', 'priority-file', 'העברה'],
      [`BL-${id}-3`, 1200, 'שדה חסר', null, 'priority-file', 'צ׳ק'],
    ]);
    expect(batchRow(id)).toMatchObject({ isTestFixture: false, totalsCheck: 'לא תואם', rowsRead: 4, rowsWritten: 3 });
    expect(r.warnings).toEqual([
      'עמוד 2 מטושטש',
      '2 שורות עם שדה חסר (2, 3) – לתיקון באימות',
      '1 שורות בקריאות נמוכה (2)',
      '1 שורות כבר קיימות מקובץ קודם ולא נכתבו שוב: שורה 4 (BL-OLD-1)',
      'נקראו 4 שורות (3 זיכויים), סה״כ 2,700. לא תואם: בקובץ 4 תנועות, 2,700.01',
    ]);

    // the person must tick "בדקתי מול הבנק" before starting
    expect((await confirm({ importBatchId: id, verifiedBy: 'רינה' }, CTX)).errors[0]).toContain('בדקתי מול הבנק');

    // fixing the misread amount (reader feedback טעה + correction) clears the flags and recomputes the totals
    const fb = await feedback({ agentName: 'BankFileReader', bankLineId: `BL-${id}-2`, verdict: 'טעה', field: 'amount', valueCorrect: '1,000', byName: 'רינה', byEmail: 'rina@ciment.example' }, CTX);
    expect(fb.errors).toEqual([]);
    expect(fb.lineUpdated).toBe(true);
    expect(fb.batch).toEqual({ extractedLineCount: 4, extractedTotal: 3700, totalsCheck: 'לא תואם' });
    expect(linesOf(id)[1]).toMatchObject({ amount: 1000, extractionFlags: null, correctedBy: 'רינה' });
    expect(fake.rows('AgentFeedback')[0]).toMatchObject({ agentName: 'BankFileReader', verdict: 'טעה', field: 'amount', valueGiven: '0', valueCorrect: '1,000', importBatchId: id, isTestFixture: false });
    // the same person changes their mind on the same field → replaced, not added
    const again = await feedback({ agentName: 'BankFileReader', bankLineId: `BL-${id}-2`, verdict: 'צדק', field: 'amount', byName: 'רינה' }, CTX);
    expect(again.replacedId).toBe(fb.feedbackId);
    expect(fake.rows('AgentFeedback').map((f) => f.verdict)).toEqual(['צדק']);
    // comments always add a row
    await feedback({ agentName: 'BankFileReader', importBatchId: id, verdict: 'הערה', comment: 'עמוד 2 מטושטש', byName: 'רינה' }, CTX);
    await feedback({ agentName: 'BankFileReader', importBatchId: id, verdict: 'הערה', comment: 'בדקתי מול הבנק', byName: 'רינה' }, CTX);
    expect(fake.rows('AgentFeedback')).toHaveLength(3);

    const ok = await confirm({ importBatchId: id, verifiedBy: 'רינה', totalsAcknowledged: true }, CTX);
    // plan 04.11 stage 4: confirming runs IdentifyCustomers on the file's lines, so none is left waiting for a check
    expect(ok).toMatchObject({ ok: true, lineCount: 3, firstBankLineId: '' });
    expect(ok.identify).toMatchObject({ ok: true, dryRun: false, counts: { lines: 3 } });
    // the three real payers match no customer: each line ends לא מזוהה (with its לא זוהה task), so the check is done
    expect(batchRow(id)).toMatchObject({ extractionStatus: 'אומת', status: 'נכתב', checkStatus: 'הושלמה', verifiedBy: 'רינה', checkStartedBy: 'רינה', totalsAcknowledged: true });
    expect(ok.identify.counts).toMatchObject({ unidentified: 3 });
    // confirmed is idempotent, and a confirmed file is not re-read
    expect((await confirm({ importBatchId: id, verifiedBy: 'רינה' }, CTX)).ok).toBe(true);
    expect((await write({ importBatchId: id, extraction: ex }, CTX)).errors).toEqual(['השורות של הקובץ כבר אומתו – לא נכתב דבר']);
  });

  it('no summary in the file → אין סיכום בקובץ; dryRun writes nothing', async () => {
    const id = await newBatch();
    const ex = { ...sampleExtraction(T), linesInFile: null, totalInFile: null };
    const mark = fake.calls.length;
    const dry = await write({ importBatchId: id, extraction: ex, dryRun: true }, CTX);
    expect(dry.totalsCheck).toBe('אין סיכום בקובץ');
    expect(dry.plannedLines).toHaveLength(9);
    expect(fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method))).toHaveLength(0);
  });

  it('a re-read of a failed batch replaces its own unchecked lines', async () => {
    const id = await newBatch();
    expect((await write({ importBatchId: id, extraction: sampleExtraction(T) }, CTX)).writeVerified).toBe(true);
    const again = await write({ importBatchId: id, extraction: sampleExtraction(T) }, CTX);
    expect(again.writeVerified).toBe(true);
    expect(again.duplicates).toBe(0);
    expect(linesOf(id)).toHaveLength(9);
  });
});

describe('CreateImportBatch', () => {
  it('work day, the same file returns the existing batch, a failed one is re-opened', async () => {
    const r = await createBatch({ fileUrl: 'u1', fileName: 'בנק.pdf', fileSize: 10, asOfDate: '2026-10-23' }, CTX); // Friday
    expect(r).toMatchObject({ workDay: '2026-10-22', isDuplicate: false, shouldRead: true, extractionStatus: 'בקריאה' });
    expect(batchRow(r.importBatchId)).toMatchObject({ kind: 'קובץ בנק', status: 'נקרא', extractionStatus: 'בקריאה', readerAgent: 'BankFileReader', checkStatus: 'טרם התחילו', isTestFixture: false, totalsAcknowledged: false });
    const same = await createBatch({ fileUrl: 'u2', fileName: 'בנק.pdf', fileSize: 10, asOfDate: '2026-10-22' }, CTX);
    expect(same).toMatchObject({ importBatchId: r.importBatchId, isDuplicate: true, shouldRead: false, extractionStatus: 'בקריאה' });
    const otherSize = await createBatch({ fileUrl: 'u3', fileName: 'בנק.pdf', fileSize: 11, asOfDate: '2026-10-22' }, CTX);
    expect(otherSize.importBatchId).not.toBe(r.importBatchId);
    expect((await createBatch({ fileUrl: 'u4', fileName: 'בדיקה – x.pdf', asOfDate: '2026-10-22' }, CTX)).shouldRead).toBe(true);
    expect(fake.rows('ImportBatches').find((b) => b.fileName === 'בדיקה – x.pdf')!.isTestFixture).toBe(true);

    fake.rows('ImportBatches').find((b) => b.id === r.importBatchId)!.extractionStatus = 'נכשל';
    const retry = await createBatch({ fileUrl: 'u5', fileName: 'בנק.pdf', fileSize: 10, asOfDate: '2026-10-22' }, CTX);
    expect(retry).toMatchObject({ importBatchId: r.importBatchId, isDuplicate: true, shouldRead: true });
    expect(batchRow(r.importBatchId)).toMatchObject({ extractionStatus: 'בקריאה', fileUrl: 'u5', errors: null });
    // explicit retry of a batch that is fine is refused
    const refused = await createBatch({ importBatchId: r.importBatchId, fileUrl: 'u6', fileName: 'בנק.pdf' }, CTX);
    expect(refused.shouldRead).toBe(false);
    expect(refused.errors[0]).toContain('קריאה חוזרת רק לקובץ שנכשל או שנתקע בקריאה');
  });
});
