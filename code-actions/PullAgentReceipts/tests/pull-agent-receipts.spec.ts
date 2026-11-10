import { describe, expect, it, vi } from 'vitest';
import { allocationWorld, allocs, C1, C2, NOW, rec, T, tasks } from '../../shared/fake-allocation.ts';
import { PLAN_SETTINGS } from '../../shared/plan-settings.ts';
import { agentReceiptKey, notesToClose, paidMonthsOf, pullAgentReceipts } from '../../shared/collections-agent-receipts.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

const CTX = { appId: 'test', token: 't' };
const AGENT = 'בדיקה – סוכן צפון';
const KEY = agentReceiptKey('P-1');

// C1's open debt (fake-allocation): Aug 3,000 (A-1 1,000 + A-2 2,000), Sep 1,000 (A-3 1,500 − credit 500), Oct 2,500 (A-4)
const payment = (ref: string, amount: number, extra: any = {}) => ({
  paymentRef: ref,
  receiptNumber: `R-${ref}`,
  customerCode: C1,
  customerName: 'בדיקה – אלפא',
  paymentDate: '2026-11-03',
  amount,
  method: 'צ׳ק',
  checkDueDate: null,
  matchedInvoiceNumbers: null,
  matchStatus: 'לא מותאם',
  bankLineId: null,
  collectedBy: AGENT,
  source: 'test-fixture',
  ...extra,
});
const note = (dueMonth: string, extra: any = {}) => ({
  customer: 1,
  customerCode: C1,
  customerName: 'בדיקה – אלפא',
  noteCreatedAt: '2026-10-28T08:00:00.000Z',
  dueMonth,
  noteType: 'צ׳ק אצל סוכן',
  noteText: 'הסוכן אסף צ׳ק',
  actionDate: '2026-10-30',
  status: 'פעילה',
  authorName: 'בודקת',
  noteSource: 'צוות',
  isTestFixture: true,
  ...extra,
});

function world(opts: { payments?: any[]; notes?: any[]; settings?: Record<string, string>; receipts?: any[] } = {}) {
  const w = allocationWorld({ settings: opts.settings, receipts: opts.receipts });
  w.fake.insert('Payments', opts.payments ?? [payment('P-1', 3000)]);
  w.fake.insert('CustomerNotes', opts.notes ?? []);
  current = w.client;
  return w;
}
const run = (w: any, input: any = {}) => pullAgentReceipts(w.client, { asOfDate: T, ...input }, { nowIso: NOW });
const notesOf = (w: any) => w.fake.rows('CustomerNotes');

describe('PullAgentReceipts – agent cheque → receipt, debt check, proposal', () => {
  it('one receipt per agent cheque (customer known, no identification, no mail), then the debt check and the proposal', async () => {
    const w = world();
    const r = await invoke({ asOfDate: T }, CTX);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ ok: true, dryRun: false, found: 1, created: 1, skipped: 0, writeVerified: true });
    expect(rec(w.fake, KEY)).toMatchObject({
      receiptKey: KEY,
      bankLineId: null,
      customerCode: C1,
      customerName: 'בדיקה – אלפא',
      amount: 3000,
      receiptSource: 'צ׳ק סוכן',
      identifyStatus: 'אושר',
      identifyConfidence: 100,
      receiptStatus: 'אושרה – לא נשלחה',
      priorityReceiptNumber: 'R-P-1',
      preparedBy: AGENT,
      valueDate: '2026-11-03',
      isTestFixture: true,
      sendStatus: null,
      // debt check: Aug 3,000 = the cumulative balance through Aug
      debtCheckResult: 'נסגר לאפס – מצטבר',
      debtCheckMonths: '2026-08',
      // proposal: A-1 + A-2 exactly, waiting for a person (threshold off)
      allocationConfidence: 100,
      matchStatus: 'פיזור מוצע – לאישור',
    });
    expect(r.receipts[0]).toMatchObject({ paymentRef: 'P-1', receiptKey: KEY, status: 'נוצרה', debtCheckResult: 'נסגר לאפס – מצטבר', allocationConfidence: 100, autoAllocated: false, allocateTaskKey: `allocate:${KEY}`, paidMonths: ['2026-08'] });
    expect(tasks(w.fake, `debt-zero:${KEY}`)).toHaveLength(1);
    expect(tasks(w.fake, `allocate:${KEY}`)[0]).toMatchObject({ taskType: 'קבלה – צריך פיזור', status: 'ממתין' });
    expect(allocs(w.fake, KEY)).toEqual([]);
    // no identification step, no customer proposal, no mail draft
    expect(w.fake.rows('MatchProposals')).toEqual([]);
    expect(w.fake.rows('ReceiptCheckSteps')).toEqual([]);
    expect(w.fake.rows('Approvals')).toEqual([]);
    expect(r.summary).toContain('1 נקלטו כקבלות');
  });

  it('idempotent: a rerun creates nothing and writes nothing to Receipts', async () => {
    const w = world();
    await run(w);
    const mark = w.fake.calls.length;
    const again = await run(w);
    expect(again.errors).toEqual([]);
    expect(again).toMatchObject({ ok: true, found: 1, created: 0, skipped: 1, rechecked: 0 });
    expect(again.receipts[0]).toMatchObject({ status: 'קיימת', skippedReason: 'הקבלה כבר נקלטה' });
    expect(w.fake.rows('Receipts').filter((x: any) => x.receiptKey === KEY)).toHaveLength(1);
    expect(w.fake.calls.slice(mark).filter((c: any) => /^(create|update|delete)/.test(c.method))).toEqual([]);
  });

  it('skips non-agent payments: a transfer, a cheque without an agent, a card, a cheque outside the window', async () => {
    const w = world({
      payments: [
        payment('P-1', 3000),
        payment('P-T', 1000, { method: 'העברה בנקאית' }),
        payment('P-N', 1000, { collectedBy: null }),
        payment('P-E', 1000, { collectedBy: '  ' }),
        payment('P-C', 1000, { method: 'כרטיס אשראי' }),
        payment('P-OLD', 1000, { paymentDate: '2026-10-01' }),
      ],
    });
    const r = await run(w);
    expect(r).toMatchObject({ found: 1, created: 1 });
    expect(w.fake.rows('Receipts').map((x: any) => x.receiptKey)).toEqual([KEY]);
    // a wider window takes the older agent cheque too
    const wide = await run(w, { sinceDays: 60 });
    expect(wide).toMatchObject({ found: 2, created: 1, skipped: 1 });
    expect(w.fake.rows('Receipts').map((x: any) => x.receiptKey).sort()).toEqual([KEY, agentReceiptKey('P-OLD')].sort());
  });

  it('skips an unknown customer and the Priority copy of a receipt we already hold', async () => {
    const w = world({
      payments: [payment('P-X', 1000, { customerCode: 'TEST-999' }), payment('P-2', 2500, { receiptNumber: 'PR-77' })],
      receipts: [{ receiptKey: 'RCPT-BL-9', customerCode: C1, amount: 2500, receiptStatus: 'אושרה – לא נשלחה', priorityReceiptNumber: 'PR-77', receiptSource: 'דף בנק', isTestFixture: true }],
    });
    const r = await run(w);
    expect(r).toMatchObject({ ok: true, found: 2, created: 0, skipped: 2 });
    expect(r.receipts.map((x: any) => x.skippedReason)).toEqual([expect.stringContaining('לא נמצא בכרטיסי הלקוחות'), expect.stringContaining('PR-77 כבר רשומה אצלנו')]);
    expect(w.fake.rows('Receipts')).toHaveLength(1);
  });

  it('a post-dated cheque already in Priority: its own קבלה movement is not counted against it', async () => {
    const w = world({ payments: [payment('P-1', 3000, { method: 'צ׳ק דחוי', checkDueDate: '2026-12-15' })] });
    // the mirror already holds the agent's receipt as an unallocated credit in Aug – without the rule Aug would be 0
    w.fake.insert('OpenMovements', [{ movementId: 'REC-R-P-1', customerCode: C1, docType: 'קבלה', docNumber: 'R-P-1', dueDate: '2026-08-31', dueMonth: '2026-08', amount: -3000, source: 'test-fixture' }]);
    const r = await run(w);
    expect(r.errors).toEqual([]);
    expect(rec(w.fake, KEY)).toMatchObject({ debtCheckResult: 'נסגר לאפס – מצטבר', debtCheckMonths: '2026-08' });
    expect(String(rec(w.fake, KEY).reference)).toContain('לפירעון 15.12.2026');
  });

  it('an empty OpenMovements mirror: the receipt stays, the check is reported; the next run runs only the missing check', async () => {
    const w = world();
    const saved = w.fake.rows('OpenMovements').map((m: any) => ({ ...m }));
    for (const m of w.fake.rows('OpenMovements')) await w.client.deleteItem('OpenMovements', String(m.id));
    const r = await run(w);
    expect(r).toMatchObject({ ok: true, created: 1 });
    expect(r.errors.join(' ')).toContain('OpenMovements ריקה');
    expect(rec(w.fake, KEY).debtCheckResult ?? null).toBeNull();
    w.fake.insert('OpenMovements', saved.map(({ id, ...m }: any) => m));
    const again = await run(w);
    expect(again.errors).toEqual([]);
    expect(again).toMatchObject({ created: 0, rechecked: 1 });
    expect(again.receipts[0]).toMatchObject({ status: 'נבדקה שוב', debtCheckResult: 'נסגר לאפס – מצטבר' });
    expect(w.fake.rows('Receipts').filter((x: any) => x.receiptKey === KEY)).toHaveLength(1);
  });

  it('dryRun writes nothing and previews the debt check and the notes', async () => {
    const w = world({ notes: [note('2026-08')] });
    const mark = w.fake.calls.length;
    const r = await run(w, { dryRun: true });
    expect(r).toMatchObject({ ok: true, dryRun: true, created: 1 });
    expect(r.receipts[0]).toMatchObject({ debtCheckResult: 'נסגר לאפס – מצטבר', debtCheckMonths: '2026-08' });
    expect(r.notesClosed).toHaveLength(1);
    expect(w.fake.calls.slice(mark).filter((c: any) => /^(create|update|delete)/.test(c.method))).toEqual([]);
    expect(notesOf(w)[0].status).toBe('פעילה');
  });
});

describe('PullAgentReceipts – the צ׳ק אצל סוכן notes', () => {
  it('closes the active note of the month the cheque pays, through the notes engine; other months, types and larger amounts stay', async () => {
    const w = world({
      notes: [
        note('2026-08'),
        note('2026-10'),
        note('2026-08', { noteType: 'חזור אליי', noteText: 'לחזור' }),
        note('2026-08', { amount: 5000 }),
        note('2026-08', { status: 'נסגרה ידנית' }),
        note('2026-08', { customerCode: C2 }),
      ],
    });
    const r = await run(w);
    expect(r.errors).toEqual([]);
    const [aug, oct, callBack, bigger, closedBefore, other] = notesOf(w);
    expect(aug).toMatchObject({ status: 'נסגרה ידנית', closedAt: expect.any(String) });
    expect(String(aug.noteText)).toMatch(/^הסוכן אסף צ׳ק · נסגרה: הצ׳ק התקבל – קבלה R-P-1 ב-Priority, 3,000 ש״ח מהסוכן בדיקה – סוכן צפון/);
    expect([oct, callBack, bigger, other].map((n: any) => n.status)).toEqual(['פעילה', 'פעילה', 'פעילה', 'פעילה']);
    expect(closedBefore.closedAt ?? null).toBeNull();
    expect(r.notesClosed).toEqual([String(aug.id)]);
    expect(r.receipts[0].notesClosed).toEqual([String(aug.id)]);
    expect(r.notesKept).toEqual([{ noteId: String(bigger.id), reason: expect.stringContaining('קטן מהסכום שבהערה') }]);
    // a rerun closes nothing more
    const again = await run(w);
    expect(again.notesClosed).toEqual([]);
  });

  it('a cheque that closes no month still closes the note of a month its proposal pays (לברר מול הלקוח, Aug + part of Sep)', async () => {
    const w = world({ payments: [payment('P-1', 3500)], notes: [note('2026-09'), note('2026-10')] });
    const r = await run(w);
    expect(rec(w.fake, KEY)).toMatchObject({ debtCheckResult: 'לברר מול הלקוח' });
    expect(r.receipts[0].paidMonths).toEqual(['2026-08', '2026-09']);
    expect(notesOf(w).map((n: any) => n.status)).toEqual(['נסגרה ידנית', 'פעילה']);
  });

  it('pure rules', () => {
    expect(paidMonthsOf({ debtCheckResult: 'נסגר לאפס – חודש אחד', debtCheckMonths: '2026-10', proposalMonths: [{ dueMonth: '2026-08', invoices: [{ proposed: 0 }] }] })).toEqual(['2026-10']);
    expect(paidMonthsOf({ debtCheckResult: 'לברר מול הלקוח', debtCheckMonths: '2026-10' })).toEqual([]);
    const n = [{ id: 1, customerCode: C1, noteType: 'צ׳ק אצל סוכן', status: 'פעילה', dueMonth: '2026-08', amount: 3000 }];
    expect(notesToClose(n, { customerCode: C1, months: ['2026-08'], amount: 2999.995 }).close).toHaveLength(1);
    expect(notesToClose(n, { customerCode: C1, months: ['2026-08'], amount: 2900 }).kept).toHaveLength(1);
  });
});

describe('PullAgentReceipts – the two thresholds', () => {
  it('both thresholds exist in the plan settings and are empty (off) by default', () => {
    for (const key of ['customerAutoApproveAt', 'allocationAutoApproveAt']) expect(PLAN_SETTINGS.find((s) => s.settingKey === key)).toMatchObject({ value: '', valueType: 'מספר' });
  });

  it('allocationAutoApproveAt off: the proposal waits for a person', async () => {
    const w = world({ settings: { allocationAutoApproveAt: '' } });
    const r = await run(w);
    expect(r.receipts[0]).toMatchObject({ autoAllocated: false, matchStatus: 'פיזור מוצע – לאישור' });
    expect(allocs(w.fake, KEY)).toEqual([]);
  });

  it('allocationAutoApproveAt on and reached: an agent cheque is allocated at once, recorded אושר אוטומטית', async () => {
    const w = world({ settings: { allocationAutoApproveAt: '90' } });
    const r = await run(w);
    expect(r.errors).toEqual([]);
    expect(r.receipts[0]).toMatchObject({ autoAllocated: true, matchStatus: 'מפוזרת', allocationConfidence: 100 });
    expect(allocs(w.fake, KEY).map((a: any) => [a.invoiceNumber, a.amount, a.sourceRef])).toEqual([
      ['A-1', 1000, 'אושר אוטומטית'],
      ['A-2', 2000, 'אושר אוטומטית'],
    ]);
    expect(rec(w.fake, KEY)).toMatchObject({ allocatedAmount: 3000, unallocatedAmount: 0, matchStatus: 'מפוזרת' });
    expect(tasks(w.fake, `allocate:${KEY}`)).toEqual([]);
  });

  it('allocationAutoApproveAt on but not reached: stays a proposal', async () => {
    const w = world({ payments: [payment('P-1', 3500)], settings: { allocationAutoApproveAt: '90' } });
    const r = await run(w);
    expect(r.receipts[0]).toMatchObject({ autoAllocated: false, allocationConfidence: 30 });
    expect(allocs(w.fake, KEY)).toEqual([]);
  });
});
