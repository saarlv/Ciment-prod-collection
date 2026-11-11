// PullOpenMovements on the real source (priorityMovementsSource) with a fake priorityRead: no Priority call, no
// SeedTestFixtures. Covers the 6b rules – completed customers with no open line are a success (their old rows are
// cleared), incomplete customers keep their rows, a pass that read no customer fails, and a real run sets
// Customers.movementsSyncedAt and refreshes the calc layer (RefreshCustomerAggregates + RefreshInvoiceLayer).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { refreshCustomerAggregates } from '../../shared/collections-customer-aggregates.ts';
import { refreshInvoiceLayer } from '../../shared/collections-invoice-layer.ts';

/** FNCTRANS headers per customer code; a code in `failing` throws like a 400 from Priority. */
const ledger: Record<string, any[]> = {};
const failing = new Set<string>();
const reads: string[] = [];
vi.mock('../../shared/priority-direct.ts', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    priorityRead: vi.fn(async (_client: any, input: any) => {
      const code = /ACCNAME1 eq '([^']+)'/.exec(input.filter)?.[1] ?? '';
      reads.push(code);
      if (failing.has(code)) throw Object.assign(new Error(`FNCTRANS ${code}: 400 bad request`), { statusCode: 400 });
      return input.skip ? [] : (ledger[code] ?? []);
    }),
  };
});

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

const ctx: any = {};
const C = '121205';
const writes = (fake: FakeBlocks, mark: number) => fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method));

const receipt25028956 = {
  FNCNUM: '25028956', BALDATE: '2025-11-12T00:00:00+02:00', FNCDATE: '2025-11-12T00:00:00+02:00', DETAILS: 'קבלה',
  FNCITEMS_SUBFORM: [
    { KLINE: 5, ACCNAME: C, FNCIREF1: null, DEBIT1: 0, CREDIT1: 61820.6, FRECONNUM: 0, DETAILS: 'קבלה', FNCDATE: '2025-11-30T00:00:00+02:00' },
    { KLINE: 6, ACCNAME: C, FNCIREF1: null, DEBIT1: 0, CREDIT1: 61820.6, FRECONNUM: 0, DETAILS: 'קבלה', FNCDATE: '2025-12-05T00:00:00+02:00' },
  ],
};
const invoiceCF251816 = {
  FNCNUM: '25027001', BALDATE: '2025-11-15T00:00:00+02:00', FNCDATE: '2025-12-15T00:00:00+02:00', DETAILS: 'חשבונית',
  FNCITEMS_SUBFORM: [{ KLINE: 1, ACCNAME: C, FNCIREF1: 'CF251816', DEBIT1: 160975.6, CREDIT1: 0, FRECONNUM: 0, DETAILS: null, FNCDATE: '2025-12-15T00:00:00+02:00' }],
};

describe('PullOpenMovements (priority-direct source, fake priorityRead)', () => {
  let fake: FakeBlocks;
  beforeEach(() => {
    for (const k of Object.keys(ledger)) delete ledger[k];
    failing.clear();
    reads.length = 0;
    fake = new FakeBlocks();
    const client: any = fake.client();
    // the calc-layer follow-ups run the same shared code as their actions
    client.invokeAction = async (name: string, input: any) => {
      if (name === 'RefreshCustomerAggregates') return refreshCustomerAggregates(client, { ...input, asOf: '2025-12-01' });
      if (name === 'RefreshInvoiceLayer') return refreshInvoiceLayer(client, input);
      return {};
    };
    current = client;
    fake.insert('Customers', [
      { customerCode: C, customerName: 'לקוח 121205' },
      { customerCode: '200', customerName: 'שולם הכל' },
      { customerCode: 'BAD', customerName: 'נכשל' },
    ]);
    fake.insert('Invoices', [{ invoiceNumber: 'CF251816', customerCode: C, documentType: 'חשבונית', invoiceDate: '2025-11-15', amount: 160975.6, status: 'שולמה', reconciledDate: '2025-11-20' }]);
    fake.insert('OpenMovements', [
      { customerCode: '200', movementId: 'OLD:1', docType: 'חשבונית', docNumber: 'IN1', amount: 10, source: 'priority-direct' },
      { customerCode: 'BAD', movementId: 'KEEP:1', docType: 'חשבונית', docNumber: 'IN2', amount: 20, source: 'priority-direct' },
    ]);
    ledger[C] = [receipt25028956, invoiceCF251816];
    ledger['200'] = [];
    failing.add('BAD');
  });

  it('dryRun is the default: reports the plan, writes nothing', async () => {
    const mark = fake.calls.length;
    const r = await invoke({ customerCodes: [C, '200', 'BAD'] }, ctx);
    expect(r).toMatchObject({ ok: true, dryRun: true, customersRead: 2, fromSource: 3, written: 3, deleted: 1 });
    expect(r.customersIncomplete.map((x: any) => x.customerCode)).toEqual(['BAD']);
    expect('completedCodes' in r).toBe(false);
    expect(writes(fake, mark)).toEqual([]);
  });

  it('real run: replaces completed customers, keeps the incomplete one, sets movementsSyncedAt and refreshes the calc layer', async () => {
    const r = await invoke({ dryRun: false, customerCodes: [C, '200', 'BAD'] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.writeVerified).toBe(true);
    const rows = fake.rows('OpenMovements');
    expect(rows.filter((m) => m.customerCode === C).map((m) => [m.movementId, m.docType, m.amount, m.dueDate]).sort()).toEqual([
      ['25027001:1', 'חשבונית', 160975.6, '2025-12-15'],
      ['25028956:5', 'קבלה', -61820.6, '2025-11-30'],
      ['25028956:6', 'קבלה', -61820.6, '2025-12-05'],
    ]);
    expect(rows.find((m) => m.movementId === 'OLD:1')).toBeUndefined(); // 200 completed with no open line → cleared
    expect(rows.find((m) => m.movementId === 'KEEP:1')).toBeTruthy(); // BAD incomplete → kept
    const cust = new Map(fake.rows('Customers').map((c) => [c.customerCode, c]));
    expect(cust.get(C)!.movementsSyncedAt).toBe(r.syncedAt);
    expect(cust.get('200')!.movementsSyncedAt).toBe(r.syncedAt);
    expect(cust.get('BAD')!.movementsSyncedAt).toBeUndefined();
    expect(cust.get(C)).toMatchObject({ openBalance: 37334.4, onAccountCredit: -123641.2, openDebit: 160975.6, openMovementCount: 3, documentCount: 1 });
    expect(cust.get('200')).toMatchObject({ openBalance: 0, openMovementCount: 0 });
    expect(cust.get('BAD')!.openBalance).toBeUndefined();
    expect(fake.rows('Invoices')[0]).toMatchObject({ openAmount: 160975.6, dueDate: '2025-12-15', paymentStatus: 'פתוחה', subStatus: 'פתוחה' });
    expect(r.notes.some((n: string) => n.startsWith('RefreshCustomerAggregates'))).toBe(true);
    expect(r.notes.some((n: string) => n.startsWith('RefreshInvoiceLayer'))).toBe(true);
  });

  it('6d: fullHistory real run also sets fullHistorySyncedAt for the completed customers; a normal run does not', async () => {
    const normal = await invoke({ dryRun: false, customerCodes: [C, '200', 'BAD'] }, ctx);
    expect(normal.ok).toBe(true);
    expect(fake.rows('Customers').every((c) => !c.fullHistorySyncedAt)).toBe(true);
    const r = await invoke({ dryRun: false, fullHistory: true, customerCodes: [C, '200', 'BAD'] }, ctx);
    expect(r.ok).toBe(true);
    const cust = new Map(fake.rows('Customers').map((c) => [c.customerCode, c]));
    expect(cust.get(C)).toMatchObject({ movementsSyncedAt: r.syncedAt, fullHistorySyncedAt: r.syncedAt });
    expect(cust.get('200')).toMatchObject({ fullHistorySyncedAt: r.syncedAt });
    expect(cust.get('BAD')!.fullHistorySyncedAt).toBeUndefined();
    expect(r.notes.some((n: string) => n.startsWith('movementsSyncedAt + fullHistorySyncedAt'))).toBe(true);
  });

  it('6d: fullHistory dryRun writes nothing (no fullHistorySyncedAt)', async () => {
    const mark = fake.calls.length;
    await invoke({ dryRun: true, fullHistory: true, customerCodes: [C, '200'] }, ctx);
    expect(writes(fake, mark)).toEqual([]);
  });

  it('completed customers with no open line at all: success, their old rows cleared', async () => {
    ledger[C] = [];
    const r = await invoke({ dryRun: false, customerCodes: [C, '200'] }, ctx);
    expect(r).toMatchObject({ ok: true, fromSource: 0, customersRead: 2, deleted: 1 });
    expect(fake.rows('OpenMovements').map((m) => m.movementId)).toEqual(['KEEP:1']);
  });

  it('a pass that planned customers and read none fails and changes nothing', async () => {
    failing.add(C).add('200');
    const mark = fake.calls.length;
    const r = await invoke({ dryRun: false, customerCodes: [C, '200', 'BAD'] }, ctx);
    expect(r.ok).toBe(false);
    expect(r.customersRead).toBe(0);
    expect(writes(fake, mark).filter((c) => c.table !== 'ImportBatches')).toEqual([]);
    expect(fake.rows('OpenMovements')).toHaveLength(2);
  });
});
