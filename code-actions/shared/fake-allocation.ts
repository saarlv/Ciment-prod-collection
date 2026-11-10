// Offline spec helper (never imported by a Lambda handler): a small world for the allocation specs (stage 6).
// TEST-301 has four open invoices in OpenMovements (Aug 1,000 + 2,000, Sep 1,500, Oct 2,500) and a credit in Sep that is
// not an invoice; TEST-302 has one invoice of its own. Every receipt is approved unless said otherwise.
import type { Item } from './blocks/blocks-client.ts';
import { FakeBlocks } from './fake-blocks.ts';

export const T = '2026-11-05';
export const NOW = '2026-11-05T07:30:00.000Z';
export const BK = 'בדיקה – אחראית א';
export const C1 = 'TEST-301';
export const C2 = 'TEST-302';

const mv = (code: string, docNumber: string, dueDate: string, amount: number, docType = 'חשבונית'): Item => ({
  movementId: `TEST-MV-${docNumber}`,
  customerCode: code,
  customerName: code,
  docType,
  docNumber,
  docDate: dueDate.slice(0, 8) + '01',
  dueDate,
  dueMonth: dueDate.slice(0, 7),
  amount,
  source: 'test-fixture',
});

export const receipt = (key: string, amount: number, extra: Item = {}): Item => ({
  receiptKey: key,
  bankLineId: key.replace('RCPT-', ''),
  customerCode: C1,
  customerName: 'בדיקה – אלפא',
  amount,
  allocatedAmount: null,
  unallocatedAmount: null,
  receiptStatus: 'אושרה – לא נשלחה',
  identifyStatus: 'אושר',
  matchStatus: 'על חשבון – צריך פיזור',
  debtCheckResult: 'לברר מול הלקוח',
  debtCheckMonths: null,
  allocationConfidence: null,
  receiptSource: 'דף בנק',
  isTestFixture: true,
  ...extra,
});

export function allocationWorld(opts: { settings?: Record<string, string>; receipts?: Item[] } = {}) {
  const fake = new FakeBlocks();
  fake.insert(
    'AgentSettings',
    Object.entries(opts.settings ?? {}).map(([settingKey, value]) => ({ settingKey, value, valueType: 'מספר', isTestFixture: false })),
  );
  fake.insert('Customers', [
    { customerCode: C1, customerName: 'בדיקה – אלפא', assignedBookkeeperName: BK, isTestFixture: true },
    { customerCode: C2, customerName: 'בדיקה – בטא', assignedBookkeeperName: BK, isTestFixture: true },
  ]);
  fake.insert('OpenMovements', [
    mv(C1, 'A-1', '2026-08-10', 1000),
    mv(C1, 'A-2', '2026-08-20', 2000),
    mv(C1, 'A-3', '2026-09-15', 1500),
    mv(C1, 'CR-1', '2026-09-20', -500, 'זיכוי'),
    mv(C1, 'A-4', '2026-10-15', 2500),
    mv(C2, 'B-1', '2026-09-15', 1000),
  ]);
  fake.insert('Invoices', [
    { invoiceNumber: 'A-1', customerCode: C1, invoiceDate: '2026-07-10', dueDate: '2026-08-10', amount: 1200, openAmount: 1000, documentType: 'חשבונית' },
    { invoiceNumber: 'B-1', customerCode: C2, invoiceDate: '2026-08-15', dueDate: '2026-09-15', amount: 1000, openAmount: 1000, documentType: 'חשבונית' },
  ]);
  fake.insert('Receipts', opts.receipts ?? []);
  return { fake, client: fake.client() };
}

export const rec = (fake: FakeBlocks, key: string) => fake.rows('Receipts').find((r) => r.receiptKey === key)!;
export const allocs = (fake: FakeBlocks, key: string) => fake.rows('ReceiptAllocations').filter((r) => r.receiptKey === key);
export const tasks = (fake: FakeBlocks, key: string) => fake.rows('CollectionQueue').filter((t) => t.taskKey === key);
