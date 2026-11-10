import { describe, expect, it, vi } from 'vitest';
import { identifyWorld, L, lineRow, NOW, openTask, receiptRow, T, taskRows } from '../../shared/fake-identify.ts';
import { writesSince } from '../../shared/fake-world.ts';
import { IDENTIFY_CONFIDENCE } from '../../shared/collections-identify-confidence.ts';
import { syncTasks } from '../../shared/collections-task-upsert.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { identifyCustomers } from '../../shared/collections-identify-customers.ts';
import { issueReceipts } from '../../shared/collections-issue-receipt.ts';

const CTX = { appId: 'test', token: 't' };
const run = (w: any, input: any = {}) => identifyCustomers(w.client, { asOfDate: T, ...input }, { nowIso: NOW });
const lineOut = (r: any, id: string) => r.lines.find((l: any) => l.bankLineId === id);

describe('IdentifyCustomers – the confidence table', () => {
  it('one exported table, one number per rung', () => {
    expect(IDENTIFY_CONFIDENCE).toEqual({ companyId: 100, alias: 95, exactName: 95, contact: 85, recentMail: 80, partialName: 70, ambiguous: 50, none: 0 });
  });

  it('dryRun (the default) gives each rung its confidence, method and evidence, and writes nothing', async () => {
    const w = identifyWorld();
    current = w.client;
    const mark = w.fake.calls.length;
    const r = await invoke({ asOfDate: T }, CTX);
    expect(writesSince(w.fake, mark)).toEqual([]);
    expect(r).toMatchObject({ ok: true, dryRun: true, certainAt: 90, writeVerified: false });
    expect(r.autoApproveAt).toBeUndefined(); // customerAutoApproveAt empty = off
    const pick = (id: string) => {
      const l = lineOut(r, id);
      return [l.customerCode, l.confidence, l.method, l.identifyStatus];
    };
    expect(pick(L.companyId)).toEqual(['TEST-101', 100, 'ח״פ', 'ודאי']);
    expect(pick(L.alias)).toEqual(['TEST-102', 95, 'כינוי', 'ודאי']);
    expect(pick(L.exactName)).toEqual(['TEST-103', 95, 'שם זהה', 'ודאי']);
    expect(pick(L.contact)).toEqual(['TEST-106', 85, 'איש קשר', 'לא ודאי']);
    expect(pick(L.mail)).toEqual(['TEST-107', 80, 'מייל', 'לא ודאי']);
    expect(pick(L.partial)).toEqual(['TEST-108', 70, 'שם חלקי', 'לא ודאי']);
    expect(pick(L.ambiguous)).toEqual(['TEST-104', 50, 'דו-משמעי', 'לא ודאי']);
    expect(pick(L.unknown)).toEqual(['', 0, '', 'לא זוהה']);
    expect(lineOut(r, L.ambiguous).candidates).toEqual([
      { customerCode: 'TEST-104', customerName: 'בדיקה – דקל אחזקות', confidence: 50, method: 'שם חלקי' },
      { customerCode: 'TEST-105', customerName: 'בדיקה – דקל השקעות', confidence: 50, method: 'שם חלקי' },
    ]);
    expect(lineOut(r, L.companyId).evidence).toContain('ח״פ TEST-513000101 מופיע באסמכתא');
    expect(lineOut(r, L.mail).evidence).toContain('12,345');
    // not money-in / returned cheque: skipped, no identification
    expect(lineOut(r, L.chequeCleared)).toMatchObject({ identifyStatus: '', skippedReason: expect.stringContaining('פירעון צ׳ק') });
    expect(lineOut(r, L.bounced)).toMatchObject({ identifyStatus: '', skippedReason: expect.stringContaining('צ׳ק חוזר') });
    expect(r.counts).toEqual({ lines: 10, certain: 3, uncertain: 4, unidentified: 1, skipped: 2, autoApproved: 0 });
    // planned keys
    expect(lineOut(r, L.contact)).toMatchObject({ receiptKey: `RCPT-${L.contact}`, taskKey: `identify:${L.contact}` });
    expect(lineOut(r, L.exactName)).toMatchObject({ receiptKey: `RCPT-${L.exactName}`, taskKey: '' });
    expect(lineOut(r, L.unknown)).toMatchObject({ receiptKey: '', taskKey: `receipt-customer:${L.unknown}` });
  });

  it('certain = confidence ≥ identifyCertainAt from AgentSettings (80 → the contact and mail rungs become certain)', async () => {
    const w = identifyWorld({ identifyCertainAt: '80' });
    const r = await run(w);
    expect(r.certainAt).toBe(80);
    expect(lineOut(r, L.contact).identifyStatus).toBe('ודאי');
    expect(lineOut(r, L.mail).identifyStatus).toBe('ודאי');
    expect(lineOut(r, L.partial).identifyStatus).toBe('לא ודאי');
    expect(r.counts).toMatchObject({ certain: 5, uncertain: 2 });
  });
});

describe('IdentifyCustomers – a real run', () => {
  it('writes the draft receipt, the step, the customer proposal and the stage per line; tasks only for uncertain / unknown', async () => {
    const w = identifyWorld();
    const r = await run(w, { dryRun: false, checkedBy: 'דנה' });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.writeVerified).toBe(true);
    // the draft receipt (status fields last, matchStatus empty)
    expect(receiptRow(w, L.contact)).toMatchObject({
      receiptKey: `RCPT-${L.contact}`,
      bankLineId: L.contact,
      importBatchId: w.batchId,
      receiptStatus: 'טיוטה – ממתינה לאישור',
      identifyStatus: 'לא ודאי',
      identifyConfidence: 85,
      receiptSource: 'דף בנק',
      customerCode: 'TEST-106',
      customerName: 'בדיקה – זוהר הנדסה',
      amount: 5100,
      payerName: 'רונית זוהרי',
      reference: 'העברה',
      valueDate: T,
      matchStatus: null,
      isTestFixture: true,
    });
    expect(receiptRow(w, L.companyId)).toMatchObject({ identifyStatus: 'ודאי', identifyConfidence: 100 });
    expect(receiptRow(w, L.unknown)).toBeUndefined();
    expect(w.fake.rows('Receipts').filter((x) => String(x.receiptKey).startsWith('RCPT-TEST-BL-ID-'))).toHaveLength(7);
    // the step
    const step = w.fake.rows('ReceiptCheckSteps').find((s) => s.bankLineId === L.ambiguous)!;
    expect(step).toMatchObject({ stage: 'זיהוי לקוח', rung: 'כרטיס לקוח', result: 'דו-משמעי', actor: 'מערכת', actorName: 'דנה', stepNo: 1 });
    expect(step.evidence).toMatchObject({ confidence: 50, method: 'דו-משמעי', identifyStatus: 'לא ודאי', certainAt: 90 });
    expect(step.evidence.candidates).toHaveLength(2);
    expect(w.fake.rows('ReceiptCheckSteps').find((s) => s.bankLineId === L.mail)).toMatchObject({ rung: 'מיילים 7 ימים', result: 'נמצא' });
    expect(w.fake.rows('ReceiptCheckSteps').find((s) => s.bankLineId === L.unknown)).toMatchObject({ result: 'לא נמצא' });
    // the customer proposal: no invoices
    const prop = w.fake.rows('MatchProposals').filter((p) => p.bankLineId === L.alias);
    expect(prop).toEqual([expect.objectContaining({ status: 'מוצעת', customerCode: 'TEST-102', customerIdMethod: 'כינוי', confidence: 'ודאי', invoiceNumbers: null, receiptKey: `RCPT-${L.alias}` })]);
    expect(receiptRow(w, L.alias)!.matchProposalId).toBe(prop[0].id);
    // the stage
    expect(lineRow(w, L.companyId).checkStage).toBe('ממתינה לאישור');
    expect(lineRow(w, L.unknown).checkStage).toBe('לא מזוהה');
    expect(lineRow(w, L.chequeCleared).checkStage).toBeNull();
    // tasks: uncertain → identify:<id>; certain → none; unknown → לא זוהה; the returned cheque keeps its urgent task
    for (const id of [L.contact, L.mail, L.partial, L.ambiguous]) {
      expect(openTask(w, `identify:${id}`)).toMatchObject({ taskType: 'זיהוי לקוח – לאישור', source: 'תקבולים', relatedTable: 'BankLines', relatedId: id, isAlert: false });
    }
    expect(openTask(w, `identify:${L.contact}`)!.title).toBe('זיהוי לקוח – לאישור – רונית זוהרי: 5,100 ש״ח → בדיקה – זוהר הנדסה (85)');
    for (const id of [L.companyId, L.alias, L.exactName]) expect(taskRows(w, `identify:${id}`)).toEqual([]);
    expect(openTask(w, `receipt-customer:${L.unknown}`)).toMatchObject({ taskType: 'לא זוהה' });
    expect(w.fake.rows('CollectionQueue').some((t) => String(t.taskKey).startsWith('receipt-bounced:') && t.taskType === 'צ׳ק חוזר')).toBe(true);
    // no old-ladder task for the identified lines
    expect(w.fake.rows('CollectionQueue').filter((t) => /^receipt-(match|proposal|unmatched):/.test(String(t.taskKey)))).toEqual([]);
    // the 06:00 scan leaves the new tasks alone
    const scan = await syncTasks(w.client, { asOfDate: T, dryRun: false, nowIso: '2026-11-05T04:00:00.000Z' });
    expect(scan.changes.filter((c) => c.taskKey.startsWith('identify:') || /^receipt-(match|proposal|unmatched):TEST-BL-ID/.test(c.taskKey))).toEqual([]);
    expect(openTask(w, `identify:${L.contact}`)).toBeTruthy();
  });

  it('a re-run replaces the identification (no duplicate receipt / proposal / task) and never touches an approved receipt', async () => {
    const w = identifyWorld();
    await run(w, { dryRun: false });
    // the person adds an alias for the contact-rung payer: the re-run makes the line certain and closes its task
    w.fake.insert('BankAliases', [{ bankName: 'רונית זוהרי', customerCode: 'TEST-106', customerName: 'בדיקה – זוהר הנדסה', status: 'מאושר', isTestFixture: true }]);
    const r2 = await run(w, { dryRun: false });
    expect(r2.errors).toEqual([]);
    expect(lineOut(r2, L.contact)).toMatchObject({ confidence: 95, method: 'כינוי', identifyStatus: 'ודאי', taskKey: '' });
    expect(w.fake.rows('Receipts').filter((x) => x.receiptKey === `RCPT-${L.contact}`)).toHaveLength(1);
    expect(receiptRow(w, L.contact)).toMatchObject({ identifyStatus: 'ודאי', identifyConfidence: 95 });
    expect(w.fake.rows('MatchProposals').filter((p) => p.bankLineId === L.contact && p.status === 'מוצעת')).toHaveLength(1);
    expect(w.fake.rows('MatchProposals').filter((p) => p.bankLineId === L.contact)).toHaveLength(1);
    expect(taskRows(w, `identify:${L.contact}`)).toEqual([expect.objectContaining({ status: 'נסגר אוטומטית' })]);
    expect(taskRows(w, `identify:${L.mail}`)).toHaveLength(1);
    // approve one, then re-run: skipped, untouched
    const issued = await issueReceipts(w.client, { mode: 'one', bankLineIds: [L.exactName], approvedBy: 'דנה', asOfDate: T }, { nowIso: NOW });
    expect(issued.issued).toHaveLength(1);
    const before = { ...receiptRow(w, L.exactName) };
    const r3 = await run(w, { dryRun: false });
    expect(lineOut(r3, L.exactName)).toMatchObject({ skippedReason: expect.stringContaining('אושרה'), identifyStatus: '', receiptKey: `RCPT-${L.exactName}` });
    expect(receiptRow(w, L.exactName)).toEqual(before);
  });

  it('a failed write rolls back everything the run wrote for that line', async () => {
    const w = identifyWorld();
    const steps = w.fake.rows('ReceiptCheckSteps').length;
    // the receipt's status write (the last write of an identified line) fails
    w.fake.failOn = (method, table) => method === 'updateItem' && table === 'Receipts';
    const r = await run(w, { dryRun: false, bankLineIds: [L.companyId] });
    w.fake.failOn = null;
    expect(r.ok).toBe(false);
    expect(r.writeVerified).toBe(false);
    expect(r.errors.join(' ')).toContain('בוטל');
    expect(receiptRow(w, L.companyId)).toBeUndefined();
    expect(w.fake.rows('ReceiptCheckSteps')).toHaveLength(steps);
    expect(w.fake.rows('MatchProposals').filter((p) => p.bankLineId === L.companyId)).toEqual([]);
    expect(lineRow(w, L.companyId)).toMatchObject({ checkStage: 'ממתינה לבדיקה', receiptKey: null });
    expect(lineOut(r, L.companyId)).toMatchObject({ receiptKey: '', taskKey: '' });
  });
});

describe('IdentifyCustomers – customerAutoApproveAt', () => {
  it("off (empty, today's state): nothing is approved automatically", async () => {
    const w = identifyWorld({ customerAutoApproveAt: '' });
    const r = await run(w, { dryRun: false });
    expect(r.autoApproveAt).toBeUndefined();
    expect(r.counts.autoApproved).toBe(0);
    expect(w.fake.rows('Receipts').filter((x) => x.receiptStatus === 'אושרה – לא נשלחה')).toEqual([]);
    expect(w.fake.rows('Approvals').filter((a) => a.relatedTable === 'Receipts')).toEqual([]);
  });

  it('on (95): lines at or above it are issued at once – אושר אוטומטית, by the automatic actor, with the mail draft', async () => {
    const w = identifyWorld({ customerAutoApproveAt: '95' });
    const r = await run(w, { dryRun: false });
    expect(r.autoApproveAt).toBe(95);
    expect(r.counts.autoApproved).toBe(3);
    for (const id of [L.companyId, L.alias, L.exactName]) {
      expect(lineOut(r, id).identifyStatus).toBe('אושר אוטומטית');
      expect(receiptRow(w, id)).toMatchObject({ receiptStatus: 'אושרה – לא נשלחה', identifyStatus: 'אושר אוטומטית', preparedBy: 'אישור אוטומטי (מערכת)' });
      expect(lineRow(w, id).checkStage).toBe('אושרה');
    }
    // the auto-approval runs the debt check too: TEST-101 closes Aug + Sep, TEST-102 closes Sep, TEST-103 has no open debt
    expect(receiptRow(w, L.companyId)).toMatchObject({ debtCheckResult: 'נסגר לאפס – מצטבר', debtCheckMonths: '2026-08,2026-09', matchStatus: 'פיזור מוצע – לאישור' });
    expect(receiptRow(w, L.alias)).toMatchObject({ debtCheckResult: 'נסגר לאפס – חודש אחד', debtCheckMonths: '2026-09', matchStatus: 'פיזור מוצע – לאישור' });
    expect(receiptRow(w, L.exactName)).toMatchObject({ debtCheckResult: 'לברר מול הלקוח', matchStatus: 'על חשבון – צריך פיזור' });
    expect(receiptRow(w, L.contact)).toMatchObject({ receiptStatus: 'טיוטה – ממתינה לאישור' });
    // TEST-101 / TEST-102 have an AP contact → a draft each; TEST-103 has none → missing-ap
    const drafts = w.fake.rows('Approvals').filter((a) => a.relatedTable === 'Receipts');
    expect(drafts.map((a) => a.relatedId).sort()).toEqual([`RCPT-${L.companyId}`, `RCPT-${L.alias}`].sort());
    expect(drafts.every((a) => a.draftedBy === 'אישור אוטומטי (מערכת)')).toBe(true);
    expect(lineOut(r, L.exactName).taskKey).toBe('missing-ap:TEST-103');
    // the dry run reports the same
    const w2 = identifyWorld({ customerAutoApproveAt: '95' });
    const d = await run(w2);
    expect(d.counts.autoApproved).toBe(3);
    expect(w2.fake.rows('Receipts')).toEqual([]);
  });
});
