import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { writesSince } from '../../shared/fake-world.ts';
import { OUR_CUSTOMER_COLUMNS, PRIORITY_CUSTOMER_COLUMNS, pullPriorityCustomers } from '../../shared/collections-morning-pull.ts';
import { customerAsPriority, type CustomersSource, testCustomersSource } from '../../shared/priority-customers-source.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

const NOW = '2026-11-04T04:05:00.000Z';
const LATER = '2026-11-05T04:05:00.000Z';

const ours = (n: number) => ({
  checkRemittanceMail: true,
  remittanceSenders: `ap${n}@example.com`,
  assignedBookkeeperName: 'בדיקה – אחראית א',
  preferredChannel: 'דואל',
  doNotContact: n === 2,
  collectionStage: 'שיחה',
  internalNotes: `הערה פנימית ${n}`,
  collectionNote: `הערה לגבייה ${n}`,
  lastPaymentDate: '2026-10-01',
});

function world() {
  const fake = new FakeBlocks();
  fake.insert('Customers', [
    {
      customerCode: 'TEST-001',
      customerName: 'בדיקה – אגם',
      customerType: 'אשראי',
      priorityStatus: 'פעיל',
      paymentTermsDays: 60,
      paymentTermsLabel: 'שוטף + 60',
      creditLimit: 100000,
      salesAgentName: 'בדיקה – סוכן',
      ledgerBalance: 12345.67,
      address: 'רח׳ הבדיקה 1',
      paymentMethod: 'העברה בנקאית',
      companyId: 'TEST-513000001',
      source: 'test-fixture',
      syncedAt: '2026-11-01T04:00:00.000Z',
      ...ours(1),
    },
    { customerCode: 'TEST-002', customerName: 'בדיקה – ברוש', priorityStatus: 'חסום', creditLimit: 5000, companyId: 'OUR-ID-2', source: 'test-fixture', ...ours(2) },
    { customerCode: '10001', customerName: 'אלון יזמות בע״מ', priorityStatus: 'פעיל', source: 'priority-file', ...ours(3) },
  ]);
  current = fake.client();
  return { fake, client: current };
}

/** The test source with the given changes. */
const sourceWith = (change: (cards: ReturnType<typeof customerAsPriority>[]) => ReturnType<typeof customerAsPriority>[]): CustomersSource => ({
  ...testCustomersSource,
  fetchCustomers: async (q) => change(await testCustomersSource.fetchCustomers(q)),
});
const row = (fake: FakeBlocks, code: string) => fake.rows('Customers').find((c) => c.customerCode === code)!;

describe('PullPriorityCustomers (test source in Priority shape)', () => {
  it('the column lists: Priority columns and our columns never overlap', () => {
    for (const k of OUR_CUSTOMER_COLUMNS) expect(PRIORITY_CUSTOMER_COLUMNS as readonly string[]).not.toContain(k);
    expect(PRIORITY_CUSTOMER_COLUMNS as readonly string[]).not.toContain('companyId');
  });

  it('dryRun is the default (invoke): reports, writes nothing', async () => {
    const { fake } = world();
    const mark = fake.calls.length;
    const r = await invoke({}, {});
    expect(r.dryRun).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.fromSource).toBe(2);
    expect(r.source).toBe('test-fixture');
    expect(writesSince(fake, mark)).toEqual([]);
  });

  it('the test source returns the TEST customers as they are: only syncedAt moves, our columns and real customers untouched', async () => {
    const { fake, client } = world();
    const before = JSON.parse(JSON.stringify(fake.rows('Customers')));
    const r = await pullPriorityCustomers(client, { dryRun: false, importBatchId: '77' }, { nowIso: NOW });
    expect(r.ok).toBe(true);
    expect(r.writeVerified).toBe(true);
    expect([r.created, r.updated, r.unchanged]).toEqual([0, 0, 2]);
    expect(r.markedInactive).toEqual([]);
    for (const code of ['TEST-001', 'TEST-002']) {
      const b = before.find((c: any) => c.customerCode === code);
      const a = row(fake, code);
      expect(a.syncedAt).toBe(NOW);
      for (const k of [...PRIORITY_CUSTOMER_COLUMNS, ...OUR_CUSTOMER_COLUMNS, 'companyId', 'source']) expect([k, a[k] ?? null]).toEqual([k, b[k] ?? null]);
    }
    expect(row(fake, '10001')).toEqual(before.find((c: any) => c.customerCode === '10001'));
  });

  it('upserts only the Priority columns; companyId only when Priority has one; a covered customer not returned → לא פעיל בפריוריטי; a new one is created', async () => {
    const { fake, client } = world();
    const source = sourceWith((cards) => [
      { ...cards.find((c) => c.customerCode === 'TEST-001')!, customerName: 'בדיקה – אגם (שם חדש)', creditLimit: 120000.456, companyId: null, salesAgentPhone: '050-0000000' },
      { ...cards[0], customerCode: 'TEST-003', customerName: 'בדיקה – גפן', companyId: 'TEST-513000003', priorityStatus: 'זמני' },
    ]);
    const r = await pullPriorityCustomers(client, { dryRun: false }, { nowIso: NOW, source });
    expect(r.ok).toBe(true);
    expect(r.created).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.changes[0].customerCode).toBe('TEST-001');
    expect(r.changes[0].fields.sort()).toEqual(['creditLimit', 'customerName', 'salesAgentPhone']);
    expect(r.markedInactive).toEqual(['TEST-002']);

    const a = row(fake, 'TEST-001');
    expect(a.customerName).toBe('בדיקה – אגם (שם חדש)');
    expect(a.creditLimit).toBe(120000.46);
    expect(a.companyId).toBe('TEST-513000001'); // Priority sent none: ours kept
    for (const [k, v] of Object.entries(ours(1))) expect([k, a[k]]).toEqual([k, v]);

    const b = row(fake, 'TEST-002');
    expect(b.priorityStatus).toBe('לא פעיל בפריוריטי');
    for (const [k, v] of Object.entries(ours(2))) expect([k, b[k]]).toEqual([k, v]);
    expect(fake.rows('Customers').filter((c) => c.customerCode === 'TEST-002')).toHaveLength(1); // never deleted

    const c = row(fake, 'TEST-003');
    expect(c).toMatchObject({ customerName: 'בדיקה – גפן', priorityStatus: 'זמני', companyId: 'TEST-513000003', source: 'test-fixture', syncedAt: NOW, checkRemittanceMail: false, doNotContact: false, collectionStage: 'תקין', remittanceSenders: null });

    // the real customer is not covered by the test source: never marked
    expect(row(fake, '10001').priorityStatus).toBe('פעיל');

    // returned again → back to its Priority status
    const r2 = await pullPriorityCustomers(client, { dryRun: false }, { nowIso: LATER });
    expect(r2.reactivated).toEqual(['TEST-002']);
    expect(row(fake, 'TEST-002').priorityStatus).toBe('פעיל');
    expect(row(fake, 'TEST-002').companyId).toBe('OUR-ID-2');
  });

  it('an empty or failing source is a failed pull: nothing is marked or written', async () => {
    for (const source of [sourceWith(() => []), { ...testCustomersSource, fetchCustomers: async () => Promise.reject(new Error('timeout')) }]) {
      const { fake, client } = world();
      const mark = fake.calls.length;
      const r = await pullPriorityCustomers(client, { dryRun: false }, { nowIso: NOW, source });
      expect(r.ok).toBe(false);
      expect(r.markedInactive).toEqual([]);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(writesSince(fake, mark)).toEqual([]);
    }
  });
});
