import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { computeInvoiceLayer, invoiceKey, ledgerOfInvoices } from '../../shared/collections-invoice-layer.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as refresh } from '../code.ts';
import { invoke as customer360 } from '../../GetCustomer360/code.ts';

const ctx: any = {};
const C = '121205';
// what made CF251816 / CF252056 look paid before 6b: a reconciliation date and a stale Invoices.status 'שולמה'
const invoice = (invoiceNumber: string, amount: number, extra: any = {}) => ({
  invoiceNumber, customerCode: C, customerName: 'לקוח 121205', documentType: 'חשבונית', invoiceDate: '2025-11-15', amount,
  status: 'שולמה', reconciledDate: '2025-11-20', priorityDocStatus: 'סופית', openAmount: null, dueDate: null, ...extra,
});
const mv = (docNumber: string, amount: number, dueDate: string, movementId: string) => ({ customerCode: C, docType: 'חשבונית', docNumber, amount, dueDate, dueMonth: dueDate.slice(0, 7), movementId });

describe('ledger rule (pure)', () => {
  it('open movements → sum + earliest due; none → 0 when the ledger was read; null when it was not', () => {
    const invs = [invoice('CF251816', 160975.6), invoice('CF252056', 5000), invoice('CF2599', 10), { invoiceNumber: 'X1', customerCode: 'OTHER' }];
    const moves = [mv('CF251816', 100000, '2025-12-20', 'A:1'), mv('CF251816', 60975.6, '2025-12-15', 'A:2'), mv('CF252056', 5000, '2026-01-15', 'B:1')];
    const f = ledgerOfInvoices(invs, moves, new Set([C]));
    expect(f.get(`${C}|CF251816`)).toEqual({ openAmount: 160975.6, dueDate: '2025-12-15', dueMonth: '2025-12' });
    expect(f.get(`${C}|CF252056`)).toEqual({ openAmount: 5000, dueDate: '2026-01-15', dueMonth: '2026-01' });
    expect(f.get(`${C}|CF2599`)).toEqual({ openAmount: 0 });
    expect(f.get('OTHER|X1')).toEqual({ openAmount: null });
  });

  it('6d: the same invoice number for two customers (C18F0001: CINVOICES of 131009, AINVOICES of 221134) – each row gets its own facts', () => {
    const invs = [
      { invoiceNumber: 'C18F0001', customerCode: '131009', invoiceDate: '2025-06-01', amount: 1000 }, // ledger never read → unknown
      { invoiceNumber: 'C18F0001', customerCode: '221134', invoiceDate: '2025-06-01', amount: 2500 }, // ledger read, open
      { invoiceNumber: 'C18F0003', customerCode: '121087', invoiceDate: '2025-06-01', amount: 300 }, // ledger read, nothing open → 0
      { invoiceNumber: 'C18F0003', customerCode: '221135', invoiceDate: '2025-06-01', amount: 400 }, // ledger never read
    ];
    const moves = [{ customerCode: '221134', docType: 'חשבונית', docNumber: 'C18F0001', amount: 2500, dueDate: '2025-07-31', movementId: 'F:1' }];
    const f = ledgerOfInvoices(invs, moves, new Set(['221134', '121087']));
    expect(f.get('131009|C18F0001')).toEqual({ openAmount: null });
    expect(f.get('221134|C18F0001')).toEqual({ openAmount: 2500, dueDate: '2025-07-31', dueMonth: '2025-07' });
    expect(f.get('121087|C18F0003')).toEqual({ openAmount: 0 });
    expect(f.get('221135|C18F0003')).toEqual({ openAmount: null });
    // order does not matter: the first-seen row no longer decides for the other customer
    const g = ledgerOfInvoices([...invs].reverse(), moves, new Set(['221134', '121087']));
    expect(g.get('221134|C18F0001')).toEqual(f.get('221134|C18F0001'));
    expect(g.get('131009|C18F0001')).toEqual({ openAmount: null });
    // the live layer too: a payment of 221134 never lands on 131009's row of the same number
    const ledgered = invs.map((i) => ({ ...i, ...f.get(invoiceKey(i)) }));
    const l = computeInvoiceLayer(ledgered, { proposals: [], receipts: [], allocations: [{ receiptKey: 'R1', invoiceNumber: 'C18F0001', customerCode: '221134', amount: 1000, status: 'מוכנה' }] });
    expect(l.get('221134|C18F0001')).toMatchObject({ paidSeenAmount: 1000, remainingAmount: 1500, paymentStatus: 'שולמה חלקית' });
    expect(l.get('131009|C18F0001')).toMatchObject({ paidSeenAmount: null, paymentStatus: null, remainingAmount: null });
  });

  it('6d pre-cutoff: no open movement before the cutoff → null unless the full history was read; on/after the cutoff → 0', () => {
    const invs = [
      { invoiceNumber: 'OLD1', customerCode: C, invoiceDate: '2023-11-30', amount: 100 },
      { invoiceNumber: 'NEW1', customerCode: C, invoiceDate: '2024-01-01', amount: 100 },
      { invoiceNumber: 'OLD2', customerCode: C, invoiceDate: '2023-05-01', amount: 50 },
    ];
    const moves = [{ customerCode: C, docType: 'חשבונית', docNumber: 'OLD2', amount: 50, dueDate: '2023-06-30', movementId: 'O:1' }];
    const f = ledgerOfInvoices(invs, moves, new Set([C]), { cutoff: '2024-01-01' });
    expect(f.get(`${C}|OLD1`)).toEqual({ openAmount: null });
    expect(f.get(`${C}|NEW1`)).toEqual({ openAmount: 0 });
    expect(f.get(`${C}|OLD2`)).toMatchObject({ openAmount: 50 }); // an open movement still counts
    const full = ledgerOfInvoices(invs, moves, new Set([C]), { cutoff: '2024-01-01', fullHistoryCodes: new Set([C]) });
    expect(full.get(`${C}|OLD1`)).toEqual({ openAmount: 0 });
  });
});

describe('RefreshInvoiceLayer + GetCustomer360 on the ledger (CF251816, customer 121205)', () => {
  let fake: FakeBlocks;
  beforeEach(() => {
    fake = new FakeBlocks();
    current = fake.client();
    fake.insert('Customers', [{ customerCode: C, customerName: 'לקוח 121205', movementsSyncedAt: '2025-12-01T04:00:00.000Z', openBalance: 165975.6 }]);
    fake.insert('Invoices', [invoice('CF251816', 160975.6), invoice('CF252056', 5000), invoice('CF2599', 10, { status: 'פתוחה', reconciledDate: null, openAmount: 10 })]);
    fake.insert('OpenMovements', [mv('CF251816', 160975.6, '2025-12-15', '25028001:1'), mv('CF252056', 5000, '2026-01-15', '25028002:1')]);
  });

  it('CF251816 is open 160,975.60 due 2025-12-15 – not שולמה; an invoice with no open movement is closed (0)', async () => {
    const r = await refresh({ customerCodes: [C], dryRun: false }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    const byNo = new Map(fake.rows('Invoices').map((i) => [i.invoiceNumber, i]));
    expect(byNo.get('CF251816')).toMatchObject({ openAmount: 160975.6, dueDate: '2025-12-15', dueMonth: '2025-12', remainingAmount: 160975.6, paymentStatus: 'פתוחה', subStatus: 'פתוחה' });
    expect(byNo.get('CF252056')).toMatchObject({ openAmount: 5000, dueDate: '2026-01-15', paymentStatus: 'פתוחה', subStatus: 'פתוחה' });
    expect(byNo.get('CF2599')).toMatchObject({ openAmount: 0, remainingAmount: 0, paymentStatus: 'שולמה', subStatus: 'סגורה' });
  });

  it('a customer whose ledger was never read keeps openAmount null (ממתין לתנועות פתוחות)', async () => {
    fake.rows('Customers')[0].movementsSyncedAt = null;
    await refresh({ customerCodes: [C], dryRun: false }, ctx);
    for (const i of fake.rows('Invoices')) expect([i.invoiceNumber, i.openAmount, i.paymentStatus ?? null, i.subStatus ?? null]).toEqual([i.invoiceNumber, null, null, null]);
  });

  it('6d: RefreshInvoiceLayer reads the cutoff setting – a pre-cutoff invoice with no open movement is null, 0 after fullHistorySyncedAt', async () => {
    fake.insert('AgentSettings', [{ settingKey: 'openMovementsFromDate', value: '2024-01-01' }]);
    fake.insert('Invoices', [invoice('CF2301', 700, { invoiceDate: '2023-10-01' })]);
    await refresh({ customerCodes: [C], dryRun: false }, ctx);
    expect(fake.rows('Invoices').find((i) => i.invoiceNumber === 'CF2301')).toMatchObject({ openAmount: null });
    expect(fake.rows('Invoices').find((i) => i.invoiceNumber === 'CF2599')).toMatchObject({ openAmount: 0 });
    fake.rows('Customers')[0].fullHistorySyncedAt = '2025-12-02T04:00:00.000Z';
    await refresh({ customerCodes: [C], dryRun: false }, ctx);
    expect(fake.rows('Invoices').find((i) => i.invoiceNumber === 'CF2301')).toMatchObject({ openAmount: 0, subStatus: 'סגורה' });
  });

  it('GetCustomer360 (live, before any refresh): CF251816 open, not paid, from the ledger', async () => {
    const card = await customer360({ customerCode: C, asOfDate: '2025-12-01' }, ctx);
    const inv = card.invoices.find((i: any) => i.invoiceNumber === 'CF251816');
    expect(inv).toMatchObject({ openAmount: 160975.6, dueDate: '2025-12-15', isPaid: false, isOpen: true, openAmountKnown: true, remainingAmount: 160975.6 });
    expect(card.invoices.find((i: any) => i.invoiceNumber === 'CF2599')).toMatchObject({ openAmount: 0, isPaid: true, isOpen: false });
    expect(card.kpis.openBalance).toBe(165975.6);
  });
});
