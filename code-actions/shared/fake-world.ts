// Offline spec helper (never imported by a Lambda handler): an in-memory platform with the real-world
// rows, whose HtmlToPdf returns a protected url per file name and whose ProcessInboundEmail runs the ingest step. The spec points its BlocksClient mock at
// `client`, then runs SeedTestFixtures for the TEST- set.
import type { Item } from './blocks/blocks-client.ts';
import { FakeBlocks, seedRealWorld } from './fake-blocks.ts';
import { sampleBankFile } from './fake-sample-bank.ts';
import { israelLocalToUtcIso } from './collections-dates.ts';

/**
 * The sample bank file's lines (BuildSampleBankFile) as bank-line rows under the pre-Iteration-9 seed ids
 * TEST-BL-PBD-01…07 – for specs of the old matching engine, which the seed no longer feeds.
 */
export function samplePbdLines(T: string, keys?: string[], extra: Item = {}): Item[] {
  const f = sampleBankFile(T);
  return f.lines
    .filter((l) => !keys || keys.includes(l.key))
    .map((l) => ({
      bankLineId: `TEST-BL-PBD-${l.key}`,
      bankName: 'מזרחי',
      valueDate: l.valueDate,
      amount: l.amount,
      payerName: l.payerName,
      reference: l.reference,
      bankAccount: f.account,
      lineType: l.lineType,
      customerCode: null,
      customerName: null,
      importBatchId: null,
      status: 'חדשה',
      source: 'test-fixture',
      lineNo: l.lineNo,
      ...extra,
    }));
}

/**
 * The pre-Iteration-9 "yesterday" bank batch (test-bank-<PBD>.csv, נכתב at 07:45 on T) with the sample file's
 * first six lines under TEST-BL-PBD-01…06 – what the seed used to write, for specs of the briefing and the
 * old matching engine.
 */
export function insertYesterdayBankFile(fake: FakeBlocks, T: string): Item {
  const lines = samplePbdLines(T, ['01', '02', '03', '04', '05', '06']);
  const pbd = String(lines[0].valueDate);
  const [batch] = fake.insert('ImportBatches', [
    {
      fileName: `test-bank-${pbd}.csv`,
      fileUrl: null,
      kind: 'קובץ בנק',
      dataDate: pbd,
      uploadedBy: 'בדיקה – אחראית א',
      uploadedAt: israelLocalToUtcIso(T, 7, 45),
      rowsRead: 6,
      rowsWritten: 6,
      status: 'נכתב',
      errors: null,
      isTestFixture: true,
    },
  ]);
  fake.insert('BankLines', lines.map((l) => ({ ...l, importBatchId: batch.id })));
  return batch;
}

export interface World {
  fake: FakeBlocks;
  client: any;
  pdfs: { file: string; html: string }[];
}

/**
 * Actions the seed's inbox fixtures call (since 28.10), played by their real code. Each builds `new BlocksClient(ctx)`,
 * which every world spec mocks to return the world's client (`current = w.client`), so they run on this platform.
 */
const ROUTED_ACTIONS: Record<string, () => Promise<{ invoke: (input: any, context: any) => Promise<any> }>> = {
  ApplyMailClassification: () => import('../ApplyMailClassification/code.ts'),
  AttachThreadReply: () => import('../AttachThreadReply/code.ts'),
};

/**
 * inboxActions: play the actions the seed's inbox fixtures call with their real code, so the seed finishes (and
 * verifies) as it does on the platform – with the cases, drafts, notes and tasks those mails produce. Off by default:
 * a spec of another action keeps the seeded tables without what the inbox mails add.
 */
export function makeWorld(opts: { inboxActions?: boolean } = {}): World {
  const fake = new FakeBlocks();
  seedRealWorld(fake);
  const pdfs: { file: string; html: string }[] = [];
  const client: any = {
    ...fake.client(),
    invokeAction: async (name: string, input: any) => {
      if (name === 'ProcessInboundEmail') return fake.processInboundEmail(client, input);
      if (opts.inboxActions && ROUTED_ACTIONS[name]) {
        fake.calls.push({ method: 'invokeAction', table: name, depth: 0 });
        return (await ROUTED_ACTIONS[name]()).invoke(input, { secrets: {}, token: 't', appId: 'a', userId: 1, accountId: 1 });
      }
      if (name !== 'HtmlToPdf') throw new Error(`unexpected action ${name}`);
      pdfs.push({ file: input.pdfFilename, html: input.html });
      return { url: `https://files.example/protected/${input.pdfFilename}` };
    },
  };
  return { fake, client, pdfs };
}

/** Rows written (create / update / delete calls) since call index `mark`. */
export const writesSince = (fake: FakeBlocks, mark: number) => fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method));
