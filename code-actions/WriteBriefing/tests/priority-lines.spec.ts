import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { buildBriefings, invoke } from '../code.ts';

const T = '2026-11-03';
const pull = { id: 'P1', kind: 'שורות דפי בנק – Priority', fileName: 'Priority – שורות דפי בנק 03.11.2026 09:30', dataDate: T, workDay: T, uploadedAt: '2026-11-03T07:30:00.000Z', status: 'נכתב', isTestFixture: true };
const line = (id: string, amount: number, lineType: string | null, extra: any = {}) => ({ bankLineId: id, importBatchId: 'P1', amount, lineType, status: 'לא מזוהה', checkStage: 'לא מזוהה', payerName: `משלם ${id}`, ...extra });
const LINES = [
  line('PL-1', 1000, 'העברה'),
  line('PL-2', 500, 'זיכוי בנק'),
  line('PL-3', 7000, 'פירעון צ׳ק', { status: 'חדשה', checkStage: null }),
  line('PL-4', 42.1, 'אחר', { status: 'חדשה', checkStage: null }),
  line('BL-1', 300, 'צ׳ק'),
  line('BL-2', 200, null),
];
const all = (r: any) => r.briefings.find((b: any) => b.audience === 'כולם');

describe('WriteBriefing – money received (plan r3 stage 2)', () => {
  it('counts only העברה / זיכוי בנק (+ legacy צ׳ק and untyped lines); פירעון צ׳ק / אחר are neither money nor unidentified', () => {
    const r = buildBriefings({ asOfDate: T, batch: pull, lines: LINES, customers: [], owners: [], promises: [], tasks: [] });
    const b = all(r);
    expect(b.headline).toContain('נכנסו 4 העברות, 2,000 ש״ח');
    expect(b.counts.unidentified).toBe(4);
    expect(r.items.unidentified.map((l: any) => l.bankLineId).sort()).toEqual(['BL-1', 'BL-2', 'PL-1', 'PL-2']);
  });

  it('reads the Priority pulls (kind שורות דפי בנק – Priority) as bank batches of the day', async () => {
    const fake = new FakeBlocks();
    const [b] = fake.insert('ImportBatches', [pull]);
    fake.insert('BankLines', LINES.map((l) => ({ ...l, importBatchId: b.id })));
    current = fake.client();
    const r = await invoke({ asOfDate: T, dryRun: true }, {});
    expect(r.importBatchIds).toEqual([b.id]);
    expect(r.isTestFixture).toBe(true);
    expect(all(r).headline).toContain('נכנסו 4 העברות, 2,000 ש״ח');
  });
});
