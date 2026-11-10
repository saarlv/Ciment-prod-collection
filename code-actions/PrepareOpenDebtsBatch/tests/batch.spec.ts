import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { pullOpenMovements } from '../../shared/collections-morning-pull.ts';
import { invoke as decide } from '../../DecideApproval/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};
const T = '2026-10-21';
const reasons = (r: any) => Object.fromEntries(r.excluded.map((e: any) => [e.customerCode, e.reason]));
// every test customer with a registered accounts contact and a debit balance (TEST-011..015 since 27.10, 016..019 since 02.11)
const ELIGIBLE = ['TEST-002', 'TEST-004', 'TEST-007', 'TEST-011', 'TEST-013', 'TEST-014', 'TEST-015', 'TEST-016', 'TEST-017', 'TEST-018', 'TEST-019'];

describe('PrepareOpenDebtsBatch', () => {
  const fake = new FakeBlocks();
  const pdfCalls: any[] = [];
  beforeAll(async () => {
    seedRealWorld(fake);
    current = {
      ...fake.client(),
      invokeAction: vi.fn(async (name: string, input: any) => {
        if (name === 'ProcessInboundEmail') return fake.processInboundEmail(current, input);
        // the seed's inbox fixtures (since 28.10) call other actions too: answered as the plain fake does
        if (name !== 'HtmlToPdf') return {};
        pdfCalls.push({ name, input });
        return { url: `https://files.example/protected/${pdfCalls.length}/${input.pdfFilename}` };
      }),
    };
    await seed({ dryRun: false, asOfDate: T }, ctx);
    // the open debts come from OpenMovements (plan 04.11 r2 stage 9): the test source derives them from the seed
    expect((await pullOpenMovements(current, { dryRun: false }, { nowIso: `${T}T04:00:00.000Z` })).ok).toBe(true);
    fake.insert('TeamMembers', [{ name: 'בדיקה – אחראית א', role: 'מנהלת חשבונות', email: 'Bk.A@ciment.example', active: true }]);
  });

  it('scheduled is accepted and ignored (since 28.10 the schedule lives in MailAutomations)', async () => {
    const r = await invoke({ scheduled: true, asOfDate: T }, ctx);
    expect(r).toMatchObject({ dryRun: true, skipped: false, skipReason: '', batchId: 'open-debts-2026-10' });
    expect(r.eligible.map((e: any) => e.customerCode)).toEqual((await invoke({ asOfDate: T }, ctx)).eligible.map((e: any) => e.customerCode));
    expect(fake.rows('Approvals')).toHaveLength(1); // only the real-world row
    expect(pdfCalls).toHaveLength(0);
    const nextMonth = await invoke({ scheduled: true, asOfDate: '2026-11-01' }, ctx);
    expect(nextMonth.skipped).toBe(false);
    expect(nextMonth.batchId).toBe('open-debts-2026-11');
  });

  it('dry run: eligible vs excluded with reasons, no PDFs, nothing written', async () => {
    const r = await invoke({ asOfDate: T }, ctx);
    expect(r.dryRun).toBe(true);
    expect(r.batchId).toBe('open-debts-2026-10');
    expect(r.eligible.map((e: any) => [e.customerCode, e.balance, e.balanceSource, e.recipientContact])).toEqual([
      ['TEST-002', 24674, 'כרטסת', 'ronit@alon.test.example'],
      ['TEST-004', 111500, 'כרטסת', 'saarlevi14@gmail.com'],
      ['TEST-007', 24800, 'כרטיס לקוח', 'sharon@dekel.test.example'],
      ['TEST-011', 165200, 'כרטיס לקוח', 'hila@ofek.test.example'],
      ['TEST-013', 58000, 'כרטיס לקוח', 'amit@maalot.test.example'],
      ['TEST-014', 26350, 'כרטיס לקוח', 'liat@shaked.test.example'],
      ['TEST-015', 102500, 'כרטיס לקוח', 'moran@rimon.test.example'],
      ['TEST-016', 44000, 'כרטיס לקוח', 'ido@erez.test.example'],
      ['TEST-017', 9000, 'כרטיס לקוח', 'rinat@carmel.test.example'],
      ['TEST-018', 28000, 'כרטיס לקוח', 'uri@sorek.test.example'],
      ['TEST-019', 22200, 'כרטיס לקוח', 'dana@afikim.test.example'],
    ]);
    expect(reasons(r)).toEqual({
      '10001': 'אין איש קשר רשום להנהלת חשבונות',
      'TEST-001': 'אין איש קשר רשום להנהלת חשבונות',
      'TEST-003': 'אין איש קשר רשום להנהלת חשבונות',
      'TEST-005': 'אין איש קשר רשום להנהלת חשבונות',
      'TEST-006': 'אין איש קשר רשום להנהלת חשבונות',
      'TEST-008': 'אין איש קשר רשום להנהלת חשבונות',
      'TEST-009': 'אין איש קשר רשום להנהלת חשבונות',
      'TEST-010': 'יתרת זכות',
      // a transfer waiting for the customer's detail (TEST-BL-HIST-12) / a proposal awaiting approval (TEST-BL-020-1)
      'TEST-012': 'תקבולים פתוחים להתאמה',
      'TEST-020': 'תקבולים פתוחים להתאמה',
    });
    expect(r.excluded.find((e: any) => e.customerCode === 'TEST-010').balance).toBe(-8000);
    expect(pdfCalls).toHaveLength(0);
    expect(fake.rows('Approvals')).toHaveLength(1);
  });

  it('undecided match proposals exclude the customer (תקבולים פתוחים להתאמה)', async () => {
    fake.insert('MatchProposals', [{ bankLineId: 'TEST-BL-PBD-02', customerCode: 'TEST-002', amount: 17424, valueDate: '2026-10-20', status: 'מוצעת', isTestFixture: true }]);
    const r = await invoke({ asOfDate: T }, ctx);
    expect(reasons(r)['TEST-002']).toBe('תקבולים פתוחים להתאמה');
    expect(r.excluded.find((e: any) => e.customerCode === 'TEST-002').openReceipts).toEqual([
      { bankLineId: 'TEST-BL-PBD-02', amount: 17424, valueDate: '2026-10-20', source: 'הצעת התאמה' },
    ]);
    expect(r.eligible.map((e: any) => e.customerCode)).toEqual(ELIGIBLE.filter((c) => c !== 'TEST-002'));
  });

  it('real run: one PDF + one pending draft per eligible customer; a re-run replaces, never duplicates', async () => {
    const r = await invoke({ asOfDate: T, dryRun: false, requestedBy: 'נינה' }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    const drafted = ELIGIBLE.filter((c) => c !== 'TEST-002');
    expect(pdfCalls.map((c) => [c.name, c.input.pdfFilename])).toEqual(drafted.map((c) => ['HtmlToPdf', `open-debts-${c}-2026-10-21.pdf`]));
    const drafts = fake.rows('Approvals').filter((a) => a.batchId === 'open-debts-2026-10');
    expect(drafts.map((d) => d.customerCode).sort()).toEqual(drafted);
    const d4 = drafts.find((d) => d.customerCode === 'TEST-004')!;
    expect(d4).toMatchObject({
      kind: 'מנת חובות פתוחים',
      status: 'ממתין',
      relatedTable: 'Customers',
      relatedId: 'TEST-004',
      recipientName: 'מיכל לוי',
      recipientContact: 'saarlevi14@gmail.com',
      fromMailbox: 'bk.a@ciment.example',
      draftedBy: 'מאיה',
      // DEFAULT_SUBJECT_TEMPLATE (component 04, also the mail automation's) + the draft's CIM reference
      subject: `חובות פתוחים – בדיקה – רמות בנייה ופיתוח – נכון ל-21.10.2026 [CIM-${d4.id}]`,
      isTestFixture: true,
    });
    expect(d4.attachmentUrls).toMatch(/open-debts-TEST-004-2026-10-21\.pdf$/);
    const html4 = pdfCalls.find((c) => c.input.pdfFilename === 'open-debts-TEST-004-2026-10-21.pdf')!.input.html as string;
    // the balance and the overdue part are in the PDF; the mail is DEFAULT_BODY_TEMPLATE, which signs itself (the
    // bookkeeper has no phone in TeamMembers, so the phone part is dropped)
    expect(html4).toContain('111,500');
    expect(html4).toContain('86,330');
    expect(d4.body).toBe('שלום מיכל לוי,\n\nמצורף דוח חשבוניות פתוחות לבדיקה התאמה ומועדי תשלום.\nלבירורים ניתן לפנות בחזרה למייל\n\nבדיקה – אחראית א - מנהלת חשבונות\nסימנט אי.אס. בע״מ');

    // TEST-007 gets a receipt waiting for a match → its pending draft is removed; TEST-004's is replaced
    fake.insert('BankLines', [{ bankLineId: 'X-7', customerCode: 'TEST-007', amount: 8000, valueDate: '2026-10-20', status: 'חדשה', source: 'test-fixture' }]);
    const again = await invoke({ asOfDate: T, dryRun: false }, ctx);
    expect(again.writeVerified).toBe(true);
    expect([again.draftsReplaced, again.draftsRemoved]).toEqual([drafted.length - 1, 1]);
    const after = fake.rows('Approvals').filter((a) => a.batchId === 'open-debts-2026-10');
    expect(after).toHaveLength(drafted.length - 1);
    expect(after.find((a) => a.customerCode === 'TEST-004')!.id).toBe(d4.id);
    expect(after.some((a) => a.customerCode === 'TEST-007')).toBe(false);

    // a decided draft is kept and the customer is not drafted again
    await decide({ decision: 'approve', decidedBy: 'נינה', batchId: 'open-debts-2026-10' }, ctx);
    const third = await invoke({ asOfDate: T, dryRun: false }, ctx);
    expect(third.draftsCreated).toHaveLength(0);
    expect(reasons(third)['TEST-004']).toBe('כבר הוחלט על הטיוטה במנה הזו (אושר – לא נשלח)');
    expect(new Set(fake.rows('Approvals').filter((a) => a.batchId === 'open-debts-2026-10').map((a) => a.status))).toEqual(new Set(['אושר – לא נשלח']));
  });
});

describe('PrepareOpenDebtsBatch – OpenMovements not pulled yet', () => {
  it('an empty OpenMovements table: no PDF and no draft (the debts are unknown), an error says why', async () => {
    const fake = new FakeBlocks();
    seedRealWorld(fake);
    const pdf: any[] = [];
    current = {
      ...fake.client(),
      invokeAction: vi.fn(async (name: string, input: any) => {
        if (name === 'ProcessInboundEmail') return fake.processInboundEmail(current, input);
        if (name === 'HtmlToPdf') pdf.push(input);
        return name === 'HtmlToPdf' ? { url: 'https://files.example/x.pdf' } : {};
      }),
    };
    await seed({ dryRun: false, asOfDate: T }, ctx);
    const before = fake.rows('Approvals').length;
    const r = await invoke({ asOfDate: T, dryRun: false }, ctx);
    expect(r.eligible.length).toBeGreaterThan(0);
    expect(r.draftsCreated).toHaveLength(0);
    expect(r.errors.join(' ')).toContain('OpenMovements ריקה');
    expect(pdf).toHaveLength(0);
    expect(fake.rows('Approvals')).toHaveLength(before);
  });
});
