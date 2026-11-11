import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { ledgerOfInvoices } from '../../shared/collections-invoice-layer.ts';

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
    expect(f.get('CF251816')).toEqual({ openAmount: 160975.6, dueDate: '2025-12-15', dueMonth: '2025-12' });
    expect(f.get('CF252056')).toEqual({ openAmount: 5000, dueDate: '2026-01-15', dueMonth: '2026-01' });
    expect(f.get('CF2599')).toEqual({ openAmount: 0 });
    expect(f.get('X1')).toEqual({ openAmount: null });
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

  it('GetCustomer360 (live, before any refresh): CF251816 open, not paid, from the ledger', async () => {
    const card = await customer360({ customerCode: C, asOfDate: '2025-12-01' }, ctx);
    const inv = card.invoices.find((i: any) => i.invoiceNumber === 'CF251816');
    expect(inv).toMatchObject({ openAmount: 160975.6, dueDate: '2025-12-15', isPaid: false, isOpen: true, openAmountKnown: true, remainingAmount: 160975.6 });
    expect(card.invoices.find((i: any) => i.invoiceNumber === 'CF2599')).toMatchObject({ openAmount: 0, isPaid: true, isOpen: false });
    expect(card.kpis.openBalance).toBe(165975.6);
  });
});
