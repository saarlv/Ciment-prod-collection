import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { aggregatesOf, ledgerOverdue } from '../../shared/collections-customer-aggregates.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

const ctx: any = {};
const mv = (customerCode: string, docType: string, amount: number, dueDate: string | null, docNumber = 'X') => ({ customerCode, docType, amount, dueDate, docNumber, movementId: `${docNumber}:${amount}` });

describe('aggregatesOf (pure)', () => {
  const movements = [
    mv('121205', 'חשבונית', 160975.6, '2025-12-15', 'CF251816'),
    mv('121205', 'חשבונית', 1000, '2025-10-31', 'CF250001'),
    mv('121205', 'קבלה', -61820.6, '2025-11-30', '25028956'),
    mv('121205', 'קבלה', -61820.6, '2025-12-05', '25028956'),
    mv('121205', 'זיכוי', -500, '2025-09-30', 'C2570091'),
  ];
  const invoices = [
    { invoiceNumber: 'CF251816', invoiceDate: '2025-11-15' },
    { invoiceNumber: 'CF250001', invoiceDate: '2025-09-01' },
    { invoiceNumber: 'OLD', invoiceDate: '2026-01-01', deletedInSource: true },
  ];

  it('ledger read: balance, debit, on-account credit (קבלה), net overdue before asOf, oldest positive due, count; documents', () => {
    expect(aggregatesOf({ ledgerRead: true, movements, invoices, asOf: '2025-12-01' })).toEqual({
      openBalance: 37834.4,
      openDebit: 161975.6,
      onAccountCredit: -123641.2,
      overdueAmount: 0, // 6d net: 1000 − 61,820.60 − 500 due before 2025-12-01 is negative → 0
      oldestDueDate: '2025-10-31', // 6d: positive movements only (the −500 credit due 2025-09-30 is not "the oldest debt")
      openMovementCount: 5,
      documentCount: 2, // deletedInSource rows do not count
      lastDocumentDate: '2025-11-15',
    });
    // everything due: the net (= the balance) – credits reduce the overdue
    expect(aggregatesOf({ ledgerRead: true, movements, invoices, asOf: '2026-01-01' }).overdueAmount).toBe(37834.4);
  });

  it('6d expected: 121205 – net overdue 668,314.62 (receipts on account reduce it), oldest positive due 2025-12-15', () => {
    // 11 debit lines + receipt 25028956 lines 5 and 6 (2 × −61,820.60, due before the oldest debit)
    const debits = [160975.6, 120000, 95000, 80000, 70000, 60000, 55000, 50000, 45000, 30000, 25980.22];
    const ms = [
      ...debits.map((a, i) => mv('121205', 'חשבונית', a, `2026-0${1 + (i % 2)}-${String(10 + i).padStart(2, '0')}`, `CF${i}`)),
      mv('121205', 'קבלה', -61820.6, '2025-11-30', '25028956'),
      mv('121205', 'קבלה', -61820.6, '2025-12-05', '25028956'),
    ];
    ms[0].dueDate = '2025-12-15';
    const a = aggregatesOf({ ledgerRead: true, movements: ms, invoices: [], asOf: '2026-02-28' });
    expect(a.openMovementCount).toBe(13);
    expect(a.openBalance).toBe(668314.62);
    expect(a.overdueAmount).toBe(668314.62);
    expect(a.oldestDueDate).toBe('2025-12-15');
  });

  it('6d expected: 121117 – all positive, overdue 12,866,910.27, oldest 2026-02-28; part not yet due is excluded; cap at balance', () => {
    const ms = [mv('121117', 'חשבונית', 12000000, '2026-02-28', 'A'), mv('121117', 'חשבונית', 866910.27, '2026-03-31', 'B')];
    expect(ledgerOverdue(ms, '2026-04-01')).toEqual({ overdueAmount: 12866910.27, oldestDueDate: '2026-02-28' });
    expect(ledgerOverdue(ms, '2026-03-01')).toEqual({ overdueAmount: 12000000, oldestDueDate: '2026-02-28' });
    // a credit not yet due lowers the balance below the overdue debit → capped at the balance
    expect(ledgerOverdue([mv('X', 'חשבונית', 1000, '2026-01-31'), mv('X', 'זיכוי', -400, '2026-06-30')], '2026-03-01')).toEqual({ overdueAmount: 600, oldestDueDate: '2026-01-31' });
    // only credits → overdue 0, no oldest date
    expect(ledgerOverdue([mv('X', 'קבלה', -400, '2026-01-31')], '2026-03-01')).toEqual({ overdueAmount: 0, oldestDueDate: null });
  });

  it('ledger read with no open movement: zeros, no oldest due date', () => {
    expect(aggregatesOf({ ledgerRead: true, movements: [], invoices: [], asOf: '2025-12-01' })).toMatchObject({
      openBalance: 0, openDebit: 0, onAccountCredit: 0, overdueAmount: 0, oldestDueDate: null, openMovementCount: 0, documentCount: 0, lastDocumentDate: null,
    });
  });

  it('ledger never read: the ledger columns stay null (not known), documents still counted', () => {
    expect(aggregatesOf({ ledgerRead: false, movements, invoices, asOf: '2025-12-01' })).toEqual({
      openBalance: null, openDebit: null, onAccountCredit: null, overdueAmount: null, oldestDueDate: null, openMovementCount: null,
      documentCount: 2, lastDocumentDate: '2025-11-15',
    });
  });
});

describe('RefreshCustomerAggregates (invoke)', () => {
  let fake: FakeBlocks;
  beforeEach(() => {
    fake = new FakeBlocks();
    current = fake.client();
    fake.insert('AgentSettings', [{ settingKey: 'balanceAsOfDate', value: '2025-12-01' }]);
    fake.insert('Customers', [
      { customerCode: '121205', customerName: 'לקוח', movementsSyncedAt: '2025-12-01T04:00:00.000Z' },
      { customerCode: '300', customerName: 'לא נקרא', movementsSyncedAt: null },
    ]);
    fake.insert('OpenMovements', [mv('121205', 'חשבונית', 160975.6, '2025-12-15', 'CF251816'), mv('121205', 'קבלה', -61820.6, '2025-11-30', '25028956'), mv('300', 'חשבונית', 50, '2025-01-01')]);
    fake.insert('Invoices', [{ invoiceNumber: 'CF251816', customerCode: '121205', invoiceDate: '2025-11-15' }, { invoiceNumber: 'Z1', customerCode: '300', invoiceDate: '2025-02-01' }]);
  });

  it('dryRun is the default: reports, writes nothing', async () => {
    const r = await invoke({}, ctx);
    expect(r).toMatchObject({ ok: true, dryRun: true, asOf: '2025-12-01', customersChecked: 2, customersChanged: 2, writeVerified: false, errors: [] });
    expect(fake.calls.filter((c) => /^(create|update|delete)/.test(c.method))).toEqual([]);
  });

  it('a real run writes only changed rows, reads them back; a second run changes nothing', async () => {
    const r = await invoke({ dryRun: false }, ctx);
    expect(r).toMatchObject({ ok: true, customersChanged: 2, writeVerified: true, errors: [] });
    const [a, b] = fake.rows('Customers');
    expect(a).toMatchObject({ openBalance: 99155, openDebit: 160975.6, onAccountCredit: -61820.6, overdueAmount: 0, oldestDueDate: '2025-12-15', openMovementCount: 2, documentCount: 1, lastDocumentDate: '2025-11-15' });
    expect(a.aggregatesAt).toBeTruthy();
    expect(b).toMatchObject({ openBalance: null, overdueAmount: null, openMovementCount: null, documentCount: 1, lastDocumentDate: '2025-02-01' });
    const again = await invoke({ dryRun: false }, ctx);
    expect(again).toMatchObject({ ok: true, customersChanged: 0, writeVerified: true });
  });

  it('customerCodes limits the run', async () => {
    const r = await invoke({ dryRun: false, customerCodes: ['300'] }, ctx);
    expect(r.customersChecked).toBe(1);
    expect(fake.rows('Customers')[0].documentCount).toBeUndefined();
  });
});
