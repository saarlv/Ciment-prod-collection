import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as del } from '../../DeleteTestFixtures/code.ts';
import { invoke as decide } from '../../DecideInsuranceRequest/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};
const T = '2026-10-22';
const NOW = Date.parse('2026-10-22T06:00:00.000Z');

describe('ProposeInsuranceRequests on the seeded fixtures (2026-10-22)', () => {
  const w = makeWorld({ inboxActions: true });
  const cust = (code: string) => w.fake.rows('Customers').find((c) => c.customerCode === code)!;
  // since 27.10 the insurance values live in CreditCovers / CustomerExposure, not on Customers
  const cover = (code: string) => w.fake.rows('CreditCovers').find((c) => c.customerCode === code)!;
  const exposure = (code: string) => w.fake.rows('CustomerExposure').find((c) => c.customerCode === code)!;
  const requests = () => w.fake.rows('CreditLimitRequests');
  /** TEST-009's request (since 27.10 TEST-011, 87.5%, is proposed as well) */
  const req9 = () => requests().find((r) => r.customerCode === 'TEST-009')!;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    current = w.client;
    const s = await seed({ dryRun: false, asOfDate: T }, ctx);
    expect(s.writeVerified).toBe(true);
  });
  afterAll(() => vi.useRealTimers());

  it('the seed: TEST-009 keeps its cover number and every test customer has an address', () => {
    expect(cust('TEST-009')).toMatchObject({ address: 'רח׳ הבדיקה 9, הוד השרון' });
    expect(cover('TEST-009')).toMatchObject({ coverNo: 'TEST-ICIC-009', insuredAmount: 200000, status: 'תקף' });
    expect(exposure('TEST-009')).toMatchObject({ obligoTotal: 180000 });
    const test = w.fake.rows('Customers').filter((c) => c.source === 'test-fixture');
    expect(test).toHaveLength(20);
    for (const c of test) expect(c.address).toMatch(/^רח׳ הבדיקה \d+, /);
  });

  it('dryRun: TEST-009 (90%) and TEST-011 (87.5%) are the fixture customers at or over 80%; the full ICIC preview; nothing written', async () => {
    const before = w.fake.calls.length;
    const r = await invoke({ asOfDate: T, dryRun: true }, ctx);
    expect(writesSince(w.fake, before)).toHaveLength(0);
    // 20 test customers, TEST-014 has no cover → 19 checked
    expect(r).toMatchObject({ dryRun: true, asOfDate: T, thresholdPct: 80, increasePct: 50, checked: 19, created: 0, writeVerified: false, errors: [] });
    const over = r.customers.filter((c: any) => c.customerCode.startsWith('TEST-') && c.usePct >= 80);
    expect(over.map((c: any) => [c.customerCode, c.usePct, c.outcome])).toEqual([
      ['TEST-009', 90, 'הוצעה'],
      ['TEST-011', 87.5, 'הוצעה'],
    ]);
    expect(r.customers.filter((c: any) => c.outcome === 'מתחת לסף')).toHaveLength(17);
    expect(r.proposals.map((x: any) => x.customerCode)).toEqual(['TEST-009', 'TEST-011']);
    const p = r.proposals.find((x: any) => x.customerCode === 'TEST-009');
    expect(p).toMatchObject({
      customerCode: 'TEST-009',
      customerName: 'בדיקה – מגדלי השרון',
      currentLimit: 200000,
      obligoPct: 90,
      requestedLimit: 300000,
      status: 'הוצעה ע״י הסוכנת',
      triggeredAtPct: 90,
      companyId: 'TEST-513000009',
      currency: 'ILS',
      insuredLimitAtRequest: 200000,
      assignedBookkeeperName: 'בדיקה – אחראית א',
      proposedBy: 'נינה',
      isTestFixture: true,
      requestCreatedAt: new Date(NOW).toISOString(),
    });
    expect(p.justification).toBe('ניצול 90% מהמסגרת המבוטחת (180,000 מתוך 200,000 ש״ח) – מעל סף 80%. מוצעת הגדלה של 50% ל-300,000 ש״ח. פיגור בדוח הגיול: כן.');
    expect(p.insurerFields).toMatchObject({ api: 'ICIC', requestType: 'הגדלת מכסה', missingFields: ['CREDIT_DAYS', 'PAYTERMS_CODE'] });
    expect(p.insurerFields.fields.map((f: any) => [f.name, f.label, f.value, f.status])).toEqual([
      ['REGISTERED_NO', 'ח״פ', 'TEST-513000009', 'מהנתונים'],
      ['BUYER_NAME', 'שם הקונה', 'בדיקה – מגדלי השרון', 'מהנתונים'],
      ['BUYER_ADDRESS', 'כתובת הקונה', 'רח׳ הבדיקה 9, הוד השרון', 'מהנתונים'],
      ['COUNTRY_NO', 'ארץ', 916, 'קבוע'],
      ['CURRENCY_CODE', 'מטבע', 'NIS', 'קבוע'],
      ['PRODUCT_TYPE', 'סוג מוצר', 1, 'קבוע'],
      ['SUM_REQUESTED', 'סכום מבוקש', 300000, 'מהנתונים'],
      ['ORIG_COVER_NO', 'מספר מכסה קיימת', 'TEST-ICIC-009', 'מהנתונים'],
      ['IND_DEBTS', 'פיגור בחובות', 'Y', 'מהנתונים'],
      ['CREDIT_DAYS', 'ימי אשראי', null, 'לא ידוע'],
      ['PAYTERMS_CODE', 'קוד תנאי תשלום', null, 'לא ידוע'],
    ]);
    const f = (n: string) => p.insurerFields.fields.find((x: any) => x.name === n);
    expect(f('COUNTRY_NO').note).toBe('ישראל');
    expect(f('IND_DEBTS').source).toBe('דוח הגיול נכון ל-22.10.2026');
    expect(f('CREDIT_DAYS').note).toBe('לא ידוע – לברר עם יניב');
    expect(f('PAYTERMS_CODE').note).toBe('לא ידוע – לברר עם יניב');
  });

  it('real run writes one verified row per proposal; a second run is blocked by the open requests', async () => {
    const r = await invoke({ asOfDate: T }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(r.created).toBe(2);
    expect(requests().map((x) => x.customerCode).sort()).toEqual(['TEST-009', 'TEST-011']);
    expect(req9()).toMatchObject({ customerCode: 'TEST-009', status: 'הוצעה ע״י הסוכנת', requestedLimit: 300000, isTestFixture: true });
    expect(r.customers.find((c: any) => c.customerCode === 'TEST-009').requestId).toBe(req9().id);
    const again = await invoke({ asOfDate: T }, ctx);
    expect(again.created).toBe(0);
    expect(again.writeVerified).toBe(true);
    expect(again.customers.find((c: any) => c.customerCode === 'TEST-009')).toMatchObject({ outcome: 'יש בקשה פתוחה', openRequestId: req9().id, openRequestStatus: 'הוצעה ע״י הסוכנת' });
    expect(requests()).toHaveLength(2);
  });

  it('DecideInsuranceRequest: approves once to אושר – לא הוגש, refuses the second time; dryRun writes nothing', async () => {
    const id = req9().id;
    expect((await decide({ requestId: id }, ctx))).toMatchObject({ refused: true, reason: 'חסר שם המאשר (decidedBy)' });
    expect((await decide({ requestId: 'nope', decidedBy: 'סער' }, ctx))).toMatchObject({ refused: true, reason: 'הבקשה nope לא נמצאה' });
    const before = w.fake.calls.length;
    const dry = await decide({ requestId: id, decidedBy: 'סער', dryRun: true }, ctx);
    expect(dry).toMatchObject({ refused: false, request: { status: 'אושר – לא הוגש', decidedBy: 'סער' } });
    expect(writesSince(w.fake, before)).toHaveLength(0);
    const ok = await decide({ requestId: id, decidedBy: 'סער' }, ctx);
    expect(ok).toMatchObject({ refused: false, writeVerified: true, errors: [] });
    expect(req9()).toMatchObject({ status: 'אושר – לא הוגש', decidedBy: 'סער', decidedAt: new Date(NOW).toISOString() });
    const twice = await decide({ requestId: id, decidedBy: 'מישהו אחר' }, ctx);
    expect(twice.refused).toBe(true);
    expect(twice.reason).toBe('הבקשה של בדיקה – מגדלי השרון בסטטוס "אושר – לא הוגש" (החליט/ה: סער) – אפשר לאשר רק בקשה ב"הוצעה ע״י הסוכנת"');
    expect(req9().decidedBy).toBe('סער');
    // still open after approval (not submitted): no second proposal
    const r = await invoke({ asOfDate: T, customerCodes: ['TEST-009'], dryRun: true }, ctx);
    expect(r.customers[0].outcome).toBe('יש בקשה פתוחה');
    // a closed request does not block a new proposal
    req9().status = 'אושרה';
    expect((await invoke({ asOfDate: T, customerCodes: ['TEST-009'], dryRun: true }, ctx)).customers[0].outcome).toBe('הוצעה');
    req9().status = 'אושר – לא הוגש';
  });

  it('threshold edge: exactly 80% is proposed, 79.9% is not', async () => {
    exposure('TEST-001').obligoTotal = 120000; // 120,000 / 150,000 = 80%
    const at = await invoke({ asOfDate: T, customerCodes: ['TEST-001'], dryRun: true }, ctx);
    expect(at.customers[0]).toMatchObject({ usePct: 80, outcome: 'הוצעה', requestedLimit: 225000 });
    expect(at.proposals[0].justification).toContain('– הגיע לסף 80%.');
    exposure('TEST-001').obligoTotal = 119850; // 79.9%
    const below = await invoke({ asOfDate: T, customerCodes: ['TEST-001'], dryRun: true }, ctx);
    expect(below.customers[0]).toMatchObject({ usePct: 79.9, outcome: 'מתחת לסף' });
    expect(below.proposals).toEqual([]);
  });

  it('missing address and cover number → חסר; IND_DEBTS Y with an overdue invoice, N when only a credit note is open', async () => {
    Object.assign(cust('TEST-001'), { address: null });
    exposure('TEST-001').obligoTotal = 135000;
    cover('TEST-001').coverNo = '';
    const r1 = await invoke({ asOfDate: T, customerCodes: ['TEST-001'], dryRun: true }, ctx);
    const f1 = (n: string) => r1.proposals[0].insurerFields.fields.find((x: any) => x.name === n);
    expect(f1('BUYER_ADDRESS')).toMatchObject({ value: null, status: 'חסר', note: 'חסר בכרטיס הלקוח' });
    expect(f1('ORIG_COVER_NO')).toMatchObject({ value: null, status: 'חסר', note: 'חסר בכרטיס הלקוח' });
    expect(r1.proposals[0].insurerFields.missingFields).toEqual(['BUYER_ADDRESS', 'ORIG_COVER_NO', 'CREDIT_DAYS', 'PAYTERMS_CODE']);
    // TEST-INV-001-1 (due 30.09) is open
    expect(f1('IND_DEBTS').value).toBe('Y');
    expect(f1('IND_DEBTS').note).toContain('TEST-INV-001-1');

    // TEST-010: its only open document is a credit note (-8,000) → no overdue debt
    cover('TEST-010').insuredAmount = 10000;
    exposure('TEST-010').obligoTotal = 9000;
    const r2 = await invoke({ asOfDate: T, customerCodes: ['TEST-010'], dryRun: true }, ctx);
    const f2 = r2.proposals[0].insurerFields.fields.find((x: any) => x.name === 'IND_DEBTS');
    expect(f2).toMatchObject({ value: 'N', note: 'אין חשבונית פתוחה שמועד פירעונה עבר' });
    expect(r2.proposals[0].justification.endsWith('פיגור בדוח הגיול: לא.')).toBe(true);
    // a due date on asOfDate itself is not overdue yet
    w.fake.insert('Invoices', [{ invoiceNumber: 'TEST-INV-010-X', customerCode: 'TEST-010', documentType: 'חשבונית', dueDate: T, amount: 100, openAmount: 100, source: 'test-fixture' }]);
    expect((await invoke({ asOfDate: T, customerCodes: ['TEST-010'], dryRun: true }, ctx)).proposals[0].insurerFields.fields[8].value).toBe('N');
    expect((await invoke({ asOfDate: '2026-10-23', customerCodes: ['TEST-010'], dryRun: true }, ctx)).proposals[0].insurerFields.fields[8].value).toBe('Y');
  });

  it('settings, unknown customers, no cover, bad date', async () => {
    w.fake.insert('AgentSettings', [
      { settingKey: 'insuranceThresholdPct', value: '86', valueType: 'מספר', isTestFixture: true },
      { settingKey: 'insuranceIncreasePct', value: '25', valueType: 'מספר', isTestFixture: true },
    ]);
    const r = await invoke({ asOfDate: T, customerCodes: ['TEST-010', 'TEST-002', 'NOPE'], dryRun: true }, ctx);
    expect(r).toMatchObject({ thresholdPct: 86, increasePct: 25 });
    expect(r.errors).toEqual(['לקוח NOPE לא נמצא']);
    expect(r.customers.find((c: any) => c.customerCode === 'TEST-010')).toMatchObject({ usePct: 90, outcome: 'הוצעה', requestedLimit: 12500 });
    expect(r.customers.find((c: any) => c.customerCode === 'TEST-002').outcome).toBe('מתחת לסף');
    cover('TEST-002').insuredAmount = 0;
    const none = await invoke({ asOfDate: T, customerCodes: ['TEST-002'], dryRun: true }, ctx);
    expect(none).toMatchObject({ checked: 0, proposals: [] });
    expect(none.customers[0]).toMatchObject({ outcome: 'אין מסגרת מבוטחת', usePct: null });
    expect((await invoke({ asOfDate: '2026-02-30' }, ctx)).errors[0]).toContain('asOfDate');
  });

  it('DeleteTestFixtures removes the test requests', async () => {
    const r = await del({ dryRun: false }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.counts.CreditLimitRequests).toBe(2);
    expect(requests()).toHaveLength(0);
  });
});
