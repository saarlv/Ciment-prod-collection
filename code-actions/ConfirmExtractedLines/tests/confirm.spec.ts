import { describe, expect, it, vi } from 'vitest';
import { CTX, receiptsWorld } from '../../shared/fake-receipts.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

const T = '2026-10-21';

describe('ConfirmExtractedLines (bankLinesSource קובץ) → IdentifyCustomers on the file\'s lines', () => {
  it('confirming the file identifies its העברה / זיכוי בנק lines and returns identify', async () => {
    const w = await receiptsWorld(T, (c) => (current = c), { confirm: false });
    const r = await invoke({ importBatchId: w.batchId, verifiedBy: 'בדיקה – אחראית א' }, CTX);
    expect(r.ok).toBe(true);
    expect(r.identify).toMatchObject({ ok: true, dryRun: false, certainAt: 90 });
    const counts = r.identify!.counts;
    expect(counts.lines).toBe(r.lineCount);
    expect(counts.certain + counts.uncertain + counts.unidentified + counts.skipped).toBe(counts.lines);
    // every identified line has its one draft receipt, waiting for approval
    const identified = r.identify!.lines.filter((l: any) => ['ודאי', 'לא ודאי'].includes(l.identifyStatus));
    expect(identified.length).toBeGreaterThan(0);
    for (const l of identified) {
      const receipts = w.fake.rows('Receipts').filter((x) => x.receiptKey === `RCPT-${l.bankLineId}`);
      expect(receipts).toEqual([expect.objectContaining({ receiptStatus: 'טיוטה – ממתינה לאישור', identifyStatus: l.identifyStatus, customerCode: l.customerCode })]);
      expect(w.fake.rows('BankLines').find((b) => b.bankLineId === l.bankLineId)!.checkStage).toBe('ממתינה לאישור');
    }
    expect(w.fake.rows('ImportBatches').find((b) => b.id === w.batchId)).toMatchObject({ extractionStatus: 'אומת', verifiedBy: 'בדיקה – אחראית א' });
    // confirming again is idempotent and does not identify again
    const again = await invoke({ importBatchId: w.batchId, verifiedBy: 'בדיקה – אחראית א' }, CTX);
    expect(again).toMatchObject({ ok: true, alreadyVerified: true, identify: null });
  });

  it('dryRun reports the identification it would make and writes no receipt', async () => {
    const w = await receiptsWorld(T, (c) => (current = c), { confirm: false });
    const before = w.fake.rows('Receipts').length;
    const r = await invoke({ importBatchId: w.batchId, verifiedBy: 'בדיקה – אחראית א', dryRun: true }, CTX);
    expect(r.ok).toBe(true);
    expect(r.identify).toMatchObject({ ok: true, dryRun: true });
    expect(w.fake.rows('Receipts')).toHaveLength(before);
  });
});
