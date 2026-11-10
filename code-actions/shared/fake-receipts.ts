// Offline spec helper (never imported by a Lambda handler): seeds the TEST- set on an in-memory platform and
// runs the receipts screen's read flow on the sample bank file through the real actions (CreateImportBatch →
// the reader's structured output → WriteExtractedLines → ConfirmExtractedLines). Each spec mocks
// shared/blocks/blocks-client.ts to return `fake.client()` before calling these.
import type { Item } from './blocks/blocks-client.ts';
import { sampleBankFile } from './fake-sample-bank.ts';
import { FakeBlocks, seedRealWorld } from './fake-blocks.ts';
import { invoke as seed } from '../SeedTestFixtures/code.ts';
import { invoke as createBatch } from '../CreateImportBatch/code.ts';
import { invoke as writeLines } from '../WriteExtractedLines/code.ts';
import { invoke as confirm } from '../ConfirmExtractedLines/code.ts';

export const CTX: any = { token: 't', appId: 'a', userId: 1, accountId: 1, secrets: {}, mainWorkflowId: 'w' };

/** What BankFileReader returns for the sample file (the structured output schema of ReadBankFile). */
export function sampleExtraction(T: string): Item {
  const f = sampleBankFile(T);
  return {
    account: `${f.account} (בדיקה)`,
    bankName: 'בנק מזרחי טפחות',
    periodFrom: f.valueDate,
    periodTo: f.valueDate,
    linesInFile: f.creditCount,
    totalInFile: f.creditTotal,
    lines: f.lines.map((l) => ({
      lineNo: l.lineNo,
      valueDate: l.valueDate,
      amount: l.amount,
      payerName: l.payerName,
      reference: l.reference,
      lineType: l.lineType,
      sourceRef: `p1:r${l.lineNo}`,
      rawText: `${l.valueDate} ${l.lineType} ${l.payerName} ${l.reference} ${l.amount}`,
      legibility: 'טובה',
    })),
    warnings: [],
  };
}

export interface ReceiptsWorld {
  fake: FakeBlocks;
  batchId: string;
  /** sample key ('01'…'07') → bankLineId */
  lineId: Record<string, string>;
}

/** The seed wrote and verified every table (offline the inbox fixtures' agent steps do not run, so they are not required). */
export function seedTablesOk(s: Item): boolean {
  if (s.writeVerified) return true;
  const v = s.verifyDetails ?? {};
  return !(v.insertErrors ?? []).length && Object.values(v.perTable ?? {}).every((t: any) => t.ok) && v.invoiceLayer?.writeVerified !== false;
}

/** Seed + upload/read/confirm the sample bank file (identify: also run IdentifyCustomers on confirm). The spec's BlocksClient mock must return `getClient()`. */
export async function receiptsWorld(T: string, setClient: (c: any) => void, opts: { confirm?: boolean; identify?: boolean } = {}): Promise<ReceiptsWorld> {
  const fake = new FakeBlocks();
  seedRealWorld(fake);
  fake.insert('AgentSettings', [
    { settingKey: 'nearDueDays', value: '14', valueType: 'מספר', basis: 'הנחה', isTestFixture: false },
    { settingKey: 'mailLookbackDays', value: '7', valueType: 'מספר', basis: 'החלטה', isTestFixture: false },
  ]);
  setClient(fake.client());
  const s = await seed({ dryRun: false, asOfDate: T }, CTX);
  if (!seedTablesOk(s)) throw new Error(`seed failed: ${JSON.stringify(s.verifyDetails)}`);
  const f = sampleBankFile(T);
  const b = await createBatch({ fileUrl: 'https://files.example/protected/test-bank-statement.pdf', fileName: `בדיקה – תנועות בנק ${f.valueDate}.pdf`, fileSize: 4321, fileType: 'application/pdf', uploadedBy: 'בדיקה – אחראית א', asOfDate: T }, CTX);
  if (!b.shouldRead) throw new Error(`CreateImportBatch: ${JSON.stringify(b)}`);
  const w = await writeLines({ importBatchId: b.importBatchId, extraction: JSON.stringify(sampleExtraction(T)) }, CTX);
  if (!w.writeVerified) throw new Error(`WriteExtractedLines: ${JSON.stringify(w)}`);
  if (opts.confirm !== false) {
    // the confirm's identification run (plan 04.11 stage 4) only on request
    const c = await confirm({ importBatchId: b.importBatchId, verifiedBy: 'בדיקה – אחראית א', runIdentify: opts.identify === true }, CTX);
    if (!c.ok) throw new Error(`ConfirmExtractedLines: ${JSON.stringify(c)}`);
  }
  const lineId: Record<string, string> = {};
  for (const l of f.lines) lineId[l.key] = `TEST-BL-${b.importBatchId}-${l.lineNo}`;
  return { fake, batchId: b.importBatchId, lineId };
}
