import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';
import { seedTablesOk } from '../../shared/fake-receipts.ts';
import { pullOpenMovements } from '../../shared/collections-morning-pull.ts';
import { DOC_TYPES, type MovementsSource, testMovementsSource } from '../../shared/priority-movements-source.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as seedReceiptFirst } from '../../SeedReceiptFirstFixtures/code.ts';
import { invoke as customer360 } from '../../GetCustomer360/code.ts';
import { invoke } from '../code.ts';

const T = '2026-11-04';
const NOW = '2026-11-04T04:05:00.000Z';
const LATER = '2026-11-05T04:05:00.000Z';
const ctx: any = {};

describe('PullOpenMovements (test source derived from TEST-001..029)', () => {
  const w = makeWorld({ inboxActions: true });
  const movements = () => w.fake.rows('OpenMovements');
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(NOW));
    current = w.client;
    expect(seedTablesOk(await seed({ dryRun: false, asOfDate: T }, ctx))).toBe(true);
    expect((await seedReceiptFirst({ dryRun: false, asOfDate: T }, ctx)).ok).toBe(true);
    // a real customer's movement: never touched by the test source
    w.fake.insert('OpenMovements', [{ movementId: 'R-1', customerCode: '10001', customerName: 'אלון יזמות בע״מ', docType: 'חשבונית', amount: 5000, dueMonth: '2026-09', source: 'priority-api' }]);
  });
  afterAll(() => vi.useRealTimers());

  it('dryRun is the default (invoke): reports the plan, writes nothing', async () => {
    const mark = w.fake.calls.length;
    const r = await invoke({}, ctx);
    expect(r.dryRun).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.fromSource).toBeGreaterThan(20);
    expect(r.written).toBe(r.fromSource);
    expect(writesSince(w.fake, mark)).toEqual([]);
  });

  it('writes every movement with the real customer link, valid docType / dueMonth, 2-decimal amounts and source test-fixture', async () => {
    const r = await pullOpenMovements(w.client, { dryRun: false, importBatchId: '501' }, { nowIso: NOW });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.writeVerified).toBe(true);
    expect(r.unknownCustomers).toEqual([]);
    const rows = movements().filter((m) => String(m.customerCode).startsWith('TEST-'));
    expect(rows).toHaveLength(r.fromSource);
    const customers = w.fake.rows('Customers');
    for (const m of rows) {
      const c = customers.find((x) => x.customerCode === m.customerCode)!;
      expect(m.customer).toBe(Number(c.id));
      expect(DOC_TYPES).toContain(m.docType);
      expect(m.dueMonth).toBe(String(m.dueDate).slice(0, 7));
      expect(Math.round(m.amount * 100) / 100).toBe(m.amount);
      expect([m.source, m.importBatchId, m.syncedAt]).toEqual(['test-fixture', '501', NOW]);
    }
    expect(rows.some((m) => m.docType === 'קבלה' && m.amount < 0) || rows.every((m) => m.docType !== 'קבלה')).toBe(true);
    expect(movements().find((m) => m.movementId === 'R-1')).toBeTruthy();
  });

  it('per customer, the movements total equals the customer card aging total (GetCustomer360)', async () => {
    const r = await pullOpenMovements(w.client, { dryRun: true }, { nowIso: NOW });
    const codes = Object.keys(r.totalsByCustomer);
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) {
      const card = await customer360({ customerCode: code, asOfDate: T }, ctx);
      const total = Object.values(r.totalsByCustomer[code]).reduce((s: number, v: any) => s + Number(v), 0);
      expect([code, Math.round(total * 100) / 100]).toEqual([code, Math.round(Number(card.aging?.total ?? 0) * 100) / 100]);
    }
  });

  it('a second pull replaces the snapshot: same rows, no duplicates, a stale row of a covered customer is deleted', async () => {
    const count = movements().length;
    w.fake.insert('OpenMovements', [{ movementId: 'INV-GONE', customerCode: 'TEST-001', customerName: 'x', docType: 'חשבונית', amount: 10, source: 'test-fixture' }]);
    const r = await pullOpenMovements(w.client, { dryRun: false }, { nowIso: LATER });
    expect(r.ok).toBe(true);
    expect(r.deleted).toBe(1);
    expect(r.created).toBe(0);
    expect(movements()).toHaveLength(count);
    expect(movements().find((m) => m.movementId === 'INV-GONE')).toBeUndefined();
    expect(movements().filter((m) => String(m.customerCode).startsWith('TEST-')).every((m) => m.syncedAt === LATER)).toBe(true);
    const keys = movements().map((m) => `${m.customerCode}|${m.movementId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('customerCodes limits the pull to those customers', async () => {
    const r = await pullOpenMovements(w.client, { dryRun: true, customerCodes: ['TEST-001'] }, { nowIso: LATER });
    expect(r.customers).toBe(1);
    expect(Object.keys(r.totalsByCustomer)).toEqual(['TEST-001']);
  });

  it('an empty or failing source never empties the table; unknown customer codes are skipped and listed', async () => {
    const before = JSON.stringify(movements());
    for (const source of [
      { ...testMovementsSource, fetchOpenMovements: async () => ({ customers: ['TEST-001', 'TEST-002'], movements: [] }) },
      { ...testMovementsSource, fetchOpenMovements: async () => Promise.reject(new Error('Priority down')) },
    ] as MovementsSource[]) {
      const mark = w.fake.calls.length;
      const r = await pullOpenMovements(w.client, { dryRun: false }, { nowIso: LATER, source });
      expect(r.ok).toBe(false);
      expect(writesSince(w.fake, mark)).toEqual([]);
      expect(JSON.stringify(movements())).toBe(before);
    }
    const unknown: MovementsSource = {
      ...testMovementsSource,
      fetchOpenMovements: async () => ({ customers: ['NOPE-1'], movements: [{ customerCode: 'NOPE-1', movementId: 'X', docType: 'חשבונית', docNumber: 'X', docDate: T, dueDate: T, amount: 1, details: null }] }),
    };
    const r = await pullOpenMovements(w.client, { dryRun: false }, { nowIso: LATER, source: unknown });
    expect(r.unknownCustomers).toEqual(['NOPE-1']);
    expect(r.written).toBe(0);
    expect(JSON.stringify(movements())).toBe(before);
  });
});

describe('movementsFromData (the test source rules)', () => {
  it('invoice at its open amount net of seen payments, credit note negative, approved receipt on account negative at its value date', async () => {
    const { movementsFromData } = await import('../../shared/priority-movements-source.ts');
    const m = movementsFromData({
      invoices: [
        { invoiceNumber: 'A1', customerCode: 'C1', documentType: 'חשבונית', invoiceDate: '2026-08-01', dueDate: '2026-09-30', amount: 1000, openAmount: 1000, paidPendingAmount: 400 },
        { invoiceNumber: 'Z1', customerCode: 'C1', documentType: 'חשבונית זיכוי', invoiceDate: '2026-08-05', dueDate: '2026-08-05', amount: -200, openAmount: -200 },
        { invoiceNumber: 'P1', customerCode: 'C1', documentType: 'חשבונית', dueDate: '2026-09-30', amount: 500, openAmount: 500, paidPendingAmount: 500 },
      ],
      receipts: [
        { receiptKey: 'RCPT-1', customerCode: 'C1', receiptStatus: 'אושרה – לא נשלחה', unallocatedAmount: 150.5, valueDate: '2026-11-02', payerName: 'לקוח' },
        { receiptKey: 'RCPT-2', customerCode: 'C1', receiptStatus: 'טיוטה – ממתינה לאישור', unallocatedAmount: 99, valueDate: '2026-11-02' },
      ],
    });
    expect(m.map((x) => [x.movementId, x.docType, x.amount, x.dueDate])).toEqual([
      ['INV-A1', 'חשבונית', 600, '2026-09-30'],
      ['CRN-Z1', 'זיכוי', -200, '2026-08-05'],
      ['REC-RCPT-1', 'קבלה', -150.5, '2026-11-02'],
    ]);
    expect(m[0].details).toContain('יתרה חלקית');
  });
});
