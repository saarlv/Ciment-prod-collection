import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { computeInvoiceLayer, effectiveOpen, LAYER_FIELDS, proposalAllocations } from '../../shared/collections-invoice-layer.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as refresh } from '../code.ts';

const ctx: any = {};
const C = 'TEST-060';
const APPROVED = 'אושרה – לביצוע ב-Priority';
const DONE = 'בוצעה ב-Priority';
const inv = (no: string, openAmount: number, dueDate: string, extra: any = {}) => ({
  invoiceNumber: no,
  customerCode: C,
  documentType: 'חשבונית',
  amount: openAmount,
  openAmount,
  dueDate,
  syncedAt: '2026-10-21T03:00:00.000Z',
  source: 'test-fixture',
  ...extra,
});

describe('computeInvoiceLayer / effectiveOpen (pure)', () => {
  const invoices = [inv('A', 5000, '2026-09-30'), inv('B', 3000, '2026-10-15'), inv('C', 2000, '2026-10-31'), inv('CR', -400, '2026-10-01', { documentType: 'חשבונית זיכוי' })];

  it('payments: allocations, else the amount split by open amount oldest due first; state by the matches', () => {
    const ps = [
      { id: '1', bankLineId: 'BL-1', customerCode: C, status: APPROVED, decidedAt: '2026-10-20T09:00:00.000Z', allocations: { lines: [{ invoiceNumber: 'A', amount: 2000 }] } },
      { id: '2', bankLineId: 'BL-2', customerCode: C, status: DONE, decidedAt: '2026-10-21T09:00:00.000Z', priorityDoneAt: '2026-10-21T12:00:00.000Z', amount: 4000, invoiceNumbers: 'C,B' },
      { id: '3', bankLineId: 'BL-3', customerCode: C, status: 'מוצעת', allocations: { lines: [{ invoiceNumber: 'A', amount: 3000 }] } },
      { id: '4', bankLineId: 'BL-4', customerCode: 'OTHER', status: APPROVED, allocations: { lines: [{ invoiceNumber: 'A', amount: 999 }] } },
    ];
    expect(proposalAllocations(ps[1], new Map(invoices.map((i) => [i.invoiceNumber, i])))).toEqual([
      { invoiceNumber: 'B', amount: 3000 },
      { invoiceNumber: 'C', amount: 1000 },
    ]);
    const l = computeInvoiceLayer(invoices, ps);
    expect(l.get('A')).toMatchObject({ paymentState: 'נראה תשלום', paidSeenAmount: 2000, paidSeenBankLineIds: 'BL-1', paidPriorityDoneAt: null, paidPendingAmount: 2000 });
    expect(l.get('B')).toMatchObject({ paymentState: 'נקלט ב-Priority', paidSeenAmount: 3000, paidSeenAt: '2026-10-21T09:00:00.000Z', paidPriorityDoneAt: '2026-10-21T12:00:00.000Z', paidPendingAmount: 3000 });
    expect(l.get('CR')).toMatchObject({ paymentState: null, paidSeenAmount: null, paidPendingAmount: 0 });
    expect('latestNoteType' in l.get('A')!).toBe(false); // the old note fields are gone (wave 3)
  });

  it('effectiveOpen: נראה תשלום subtracts; נקלט ב-Priority only until Priority syncs after it; floored at 0; credit notes untouched', () => {
    expect(effectiveOpen({ openAmount: 5000, paymentState: 'נראה תשלום', paidSeenAmount: 2000 })).toBe(3000);
    expect(effectiveOpen({ openAmount: 5000, paymentState: 'נראה תשלום', paidSeenAmount: 7000 })).toBe(0);
    const done = { openAmount: 5000, paymentState: 'נקלט ב-Priority', paidSeenAmount: 5000, paidPriorityDoneAt: '2026-10-21T12:00:00.000Z' };
    expect(effectiveOpen({ ...done, syncedAt: '2026-10-21T03:00:00.000Z' })).toBe(0);
    expect(effectiveOpen({ ...done, syncedAt: null })).toBe(0);
    expect(effectiveOpen({ ...done, syncedAt: '2026-10-22T03:00:00.000Z' })).toBe(5000);
    expect(effectiveOpen({ openAmount: -400, paymentState: 'נראה תשלום', paidSeenAmount: 400 })).toBe(-400);
    expect(effectiveOpen({ openAmount: 5000 })).toBe(5000);
    // the live value wins over the stored columns
    expect(effectiveOpen({ openAmount: 5000, paymentState: 'נראה תשלום', paidSeenAmount: 5000, paidPendingAmount: 0 })).toBe(5000);
  });
});

describe('RefreshInvoiceLayer', () => {
  let fake: FakeBlocks;
  beforeEach(() => {
    fake = new FakeBlocks();
    fake.insert('Invoices', [inv('A', 5000, '2026-09-30'), inv('B', 3000, '2026-10-15'), inv('Z', 100, '2026-10-15', { customerCode: 'TEST-061' })]);
    fake.insert('MatchProposals', [{ bankLineId: 'BL-1', customerCode: C, status: APPROVED, decidedAt: '2026-10-20T09:00:00.000Z', allocations: { lines: [{ invoiceNumber: 'A', amount: 5000 }] } }]);
    fake.insert('Disputes', [{ customerCode: C, invoiceNumbers: 'B', status: 'פתוחה', disputeType: 'מחיר', openedAt: '2026-10-19T08:00:00.000Z' }]);
    current = fake.client();
  });
  const writes = (mark: number) => fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method));

  it('dryRun (the default) reports the changes and writes nothing', async () => {
    const mark = fake.calls.length;
    const r = await refresh({ customerCodes: [C] }, ctx);
    expect(r).toMatchObject({ dryRun: true, invoicesChecked: 2, invoicesChanged: 2, writeVerified: false, errors: [] });
    expect(r.changes.map((c: any) => [c.invoiceNumber, Object.keys(c.fields).sort()])).toEqual([
      ['A', ['paidSeenAmount', 'paidSeenAt', 'paidSeenBankLineIds', 'paymentState', 'paymentStatus', 'remainingAmount', 'subStatus']],
      ['B', ['openDisputeId', 'paymentStatus', 'remainingAmount', 'subStatus']],
    ]);
    expect(writes(mark)).toHaveLength(0);
  });

  it('a real run writes only the layer columns of the changed rows, reads them back; a second run writes nothing', async () => {
    let mark = fake.calls.length;
    const r = await refresh({ customerCodes: [C], dryRun: false }, ctx);
    expect(r).toMatchObject({ dryRun: false, invoicesChanged: 2, writeVerified: true, errors: [] });
    const w = writes(mark);
    expect(w.map((c) => [c.method, c.table])).toEqual([['updateItems', 'Invoices']]);
    const a = fake.rows('Invoices').find((i) => i.invoiceNumber === 'A')!;
    expect(a).toMatchObject({ paymentState: 'נראה תשלום', paidSeenAmount: 5000, paymentStatus: 'שולמה', remainingAmount: 0, receiptKeys: null, openAmount: 5000, amount: 5000, dueDate: '2026-09-30', syncedAt: '2026-10-21T03:00:00.000Z' });
    expect(fake.rows('Invoices').find((i) => i.invoiceNumber === 'B')).toMatchObject({ paymentStatus: 'פתוחה', remainingAmount: 3000 });
    expect(a.layerUpdatedAt).toBeTruthy();
    expect(fake.rows('Invoices').find((i) => i.invoiceNumber === 'Z')!.layerUpdatedAt).toBeUndefined();

    mark = fake.calls.length;
    const again = await refresh({ customerCodes: [C], dryRun: false }, ctx);
    expect(again).toMatchObject({ invoicesChanged: 0, writeVerified: true });
    expect(writes(mark)).toHaveLength(0);

    // the match is rejected → the payment fields are cleared on A only
    fake.rows('MatchProposals')[0].status = 'נדחתה';
    const cleared = await refresh({ invoiceNumbers: ['A', 'B'], dryRun: false }, ctx);
    expect(cleared.changes.map((c: any) => c.invoiceNumber)).toEqual(['A']);
    expect(fake.rows('Invoices').find((i) => i.invoiceNumber === 'A')).toMatchObject({ paymentState: null, paidSeenAmount: null, paidSeenAt: null });
  });

  it('invoiceNumbers and customerCodes together select the invoices in both', async () => {
    const r = await refresh({ invoiceNumbers: ['A', 'Z'], customerCodes: [C] }, ctx);
    expect(r.invoicesChecked).toBe(1);
  });
});

describe('layer fields', () => {
  it('are exactly the app-layer columns of Invoices', () => {
    expect([...LAYER_FIELDS]).toEqual([
      'paymentState',
      'paidSeenAmount',
      'paidSeenAt',
      'paidSeenBankLineIds',
      'paidPriorityDoneAt',
      'paymentStatus',
      'remainingAmount',
      'receiptKeys',
      'openDisputeId',
      'subStatus',
    ]);
    // every one is a column of the Invoices artifact (the old note / promise columns were dropped in wave 3)
    const cols = (JSON.parse(readFileSync(new URL('../../../artifacts/tables/Invoices.json', import.meta.url), 'utf8')).columns as { name: string }[]).map((c) => c.name);
    for (const f of LAYER_FIELDS) expect([f, cols.includes(f)]).toEqual([f, true]);
  });
});
