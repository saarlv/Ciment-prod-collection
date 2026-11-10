import { describe, expect, it, vi } from 'vitest';
import { BK, identifyWorld, L, lineRow, NOW, openTask, receiptRow, T, taskRows } from '../../shared/fake-identify.ts';
import { writesSince } from '../../shared/fake-world.ts';

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
/** The world after a real identification run (drafts, steps, proposals, tasks). */
async function identified(settings: Record<string, string> = {}) {
  const w = identifyWorld(settings);
  current = w.client;
  const r = await identifyCustomers(w.client, { asOfDate: T, dryRun: false }, { nowIso: NOW });
  expect(r.errors).toEqual([]);
  return w;
}
const issue = (w: any, input: any) => issueReceipts(w.client, { asOfDate: T, approvedBy: 'דנה', ...input }, { nowIso: NOW });
const receiptDrafts = (w: any, id: string) => w.fake.rows('Approvals').filter((a: any) => a.relatedTable === 'Receipts' && a.relatedId === `RCPT-${id}`);

describe('IssueReceipt – mode certain ("אשר את כל הוודאיים")', () => {
  it('issues only the certain drafts and returns the rest in skipped', async () => {
    const w = await identified();
    const r = await invoke({ mode: 'certain', bankLineIds: [L.companyId, L.contact, L.unknown], approvedBy: 'דנה', asOfDate: T }, CTX);
    expect(r.ok).toBe(true);
    expect(r.issued.map((x: any) => x.bankLineId)).toEqual([L.companyId]);
    expect(r.skipped).toEqual([
      { bankLineId: L.contact, reason: 'הזיהוי לא ודאי – לאשר אחד-אחד' },
      { bankLineId: L.unknown, reason: 'הזיהוי לא ודאי – לאשר אחד-אחד' },
    ]);
    expect(receiptRow(w, L.contact)).toMatchObject({ receiptStatus: 'טיוטה – ממתינה לאישור' });
    expect(receiptRow(w, L.companyId)).toMatchObject({
      receiptStatus: 'אושרה – לא נשלחה',
      identifyStatus: 'אושר',
      matchStatus: 'פיזור מוצע – לאישור', // the debt check right after: 11,000 closes Aug + Sep (stage 5)
      preparedBy: 'דנה',
      preparedAt: expect.any(String), // the action's real clock
      receiptSource: 'דף בנק',
    });
    expect(lineRow(w, L.companyId)).toMatchObject({ checkStage: 'אושרה', customerCode: 'TEST-101', customerName: 'בדיקה – אורן בנייה', receiptKey: `RCPT-${L.companyId}` });
    expect(w.fake.rows('MatchProposals').find((p) => p.bankLineId === L.companyId)).toMatchObject({ status: 'אושרה – לביצוע ב-Priority', decidedBy: 'דנה' });
  });

  it('re-checks the threshold server-side: a ודאי draft below a raised identifyCertainAt is skipped', async () => {
    const w = await identified();
    w.fake.rows('AgentSettings').push({ id: 'x1', settingKey: 'identifyCertainAt', value: '99' });
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.alias, L.companyId] });
    expect(r.issued.map((x: any) => x.bankLineId)).toEqual([L.companyId]);
    expect(r.skipped).toEqual([{ bankLineId: L.alias, reason: 'רמת הביטחון 95 מתחת לסף 99 – לאשר אחד-אחד' }]);
  });
});

describe('IssueReceipt – the PDF and the mail draft', () => {
  it('AP contact present → one Approvals draft (דואל, תקבולים, ממתין) with the receipt PDF, signed by the bookkeeper', async () => {
    const w = await identified();
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.companyId] });
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    const url = `https://files.example/protected/receipt-RCPT-${L.companyId}.pdf`;
    const [draft] = receiptDrafts(w, L.companyId);
    expect(r.issued[0]).toEqual({
      bankLineId: L.companyId,
      receiptKey: `RCPT-${L.companyId}`,
      customerCode: 'TEST-101',
      customerName: 'בדיקה – אורן בנייה',
      amount: 11000,
      identifyStatus: 'אושר',
      sendStatus: 'טיוטה – בדיקה',
      sentToEmail: 'avi@oren.test.example', // the ראשי AP contact first
      approvalId: draft.id,
      pdfUrl: url,
      aliasSaved: true, // payer "העברה מלקוח" ≠ the customer's name → an approved alias
      taskKey: '',
      debtCheckResult: 'נסגר לאפס – מצטבר',
      debtCheckMonths: '2026-08,2026-09',
      debtTaskKey: `debt-zero:RCPT-${L.companyId}`,
      // stage 6: the allocation proposal right after the debt check
      allocationConfidence: 100,
      autoAllocated: false,
      matchStatus: 'פיזור מוצע – לאישור',
    });
    expect(draft).toMatchObject({
      kind: 'דואל',
      component: 'תקבולים',
      status: 'ממתין',
      relatedTable: 'Receipts',
      relatedId: `RCPT-${L.companyId}`,
      recipientName: 'אבי אורני',
      recipientContact: 'avi@oren.test.example',
      attachmentUrls: url,
      draftedBy: 'דנה',
      customerCode: 'TEST-101',
      referenceCode: `CIM-${draft.id}`,
    });
    expect(draft.subject).toBe(`קבלה על תשלום ₪11,000 – סימנט [CIM-${draft.id}]`);
    expect(draft.body).toContain(`מצורפת קבלה RCPT-${L.companyId} על ההעברה מתאריך 04.11.2026 בסך ₪11,000, אסמכתא ח.פ 513000101.`);
    expect(draft.body).toContain(BK);
    expect(draft.body).toContain('050-1111111');
    expect(receiptRow(w, L.companyId)).toMatchObject({ sendStatus: 'טיוטה – בדיקה', sentToEmail: 'avi@oren.test.example', sentAt: null });
    // the PDF is the shared template: approved → only the "not in Priority" stamp
    const pdf = w.pdfs.find((p) => p.file === `receipt-RCPT-${L.companyId}.pdf`)!;
    expect(pdf.html).toContain('הופק באפליקציה – טרם הונפק ב-Priority');
    expect(pdf.html).not.toContain('טיוטה – ממתינה לאישור');
    expect(pdf.html).toContain('TEST-513000101');
    expect(pdf.html).toContain('על חשבון');
    // the draft has its outbox task; nothing was sent
    expect(openTask(w, `draft:${draft.id}`)).toMatchObject({ taskType: 'טיוטה לאישור' });
  });

  it('no AP contact → no draft, sendStatus חסר איש קשר and one missing-ap task per customer (refreshed, closed once a contact exists)', async () => {
    const w = await identified();
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.exactName] });
    expect(r.ok).toBe(true);
    expect(r.issued[0]).toMatchObject({ sendStatus: 'חסר איש קשר', sentToEmail: '', approvalId: '', pdfUrl: '', taskKey: 'missing-ap:TEST-103' });
    expect(receiptDrafts(w, L.exactName)).toEqual([]);
    expect(receiptRow(w, L.exactName)).toMatchObject({ receiptStatus: 'אושרה – לא נשלחה', sendStatus: 'חסר איש קשר' });
    expect(taskRows(w, 'missing-ap:TEST-103')).toEqual([
      expect.objectContaining({
        status: 'ממתין',
        taskType: 'חסר איש קשר הנהלת חשבונות',
        title: 'חסר איש קשר הנהלת חשבונות – בדיקה – גל שיווק בע״מ',
        source: 'תקבולים',
        relatedTable: 'Receipts',
        relatedId: `RCPT-${L.exactName}`,
        customerCode: 'TEST-103',
        assignedBookkeeperName: BK,
        isTestFixture: true,
      }),
    ]);
    // a second receipt of the same customer refreshes the same task (latest receipt, both counted)
    const line = { ...lineRow(w, L.exactName) };
    delete line.id;
    w.fake.insert('BankLines', [{ ...line, bankLineId: 'TEST-BL-ID-11', amount: 900, checkStage: 'ממתינה לבדיקה', customerCode: null, receiptKey: null, lineNo: 11 }]);
    const r2 = await issue(w, { mode: 'one', bankLineIds: ['TEST-BL-ID-11'], customerCode: 'TEST-103' });
    expect(r2.issued[0].taskKey).toBe('missing-ap:TEST-103');
    const tasks = taskRows(w, 'missing-ap:TEST-103');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ relatedId: 'RCPT-TEST-BL-ID-11', amount: 8200 });
    expect(tasks[0].reasons).toContain('2 קבלות מאושרות');
    // the customer gets an AP contact: the next run closes the task, and asking again drafts the mail
    w.fake.insert('CustomerContacts', [{ contactKey: 'TEST-103-2', customerCode: 'TEST-103', contactName: 'מירב גלי', email: 'ap@gal.test.example', isApContact: true, source: 'test-fixture' }]);
    const again = await issue(w, { mode: 'one', bankLineIds: [L.exactName], customerCode: 'TEST-103' });
    expect(again.issued).toEqual([]);
    expect(again.skipped).toEqual([expect.objectContaining({ bankLineId: L.exactName, reason: 'כבר אושרה', retrySend: true, sendStatus: 'טיוטה – בדיקה' })]);
    expect(receiptDrafts(w, L.exactName)).toHaveLength(1);
    expect(taskRows(w, 'missing-ap:TEST-103')[0]).toMatchObject({ status: 'נסגר אוטומטית' });
  });

  it('a second issue of the same line is skipped (כבר אושרה) and never makes a second draft', async () => {
    const w = await identified();
    await issue(w, { mode: 'certain', bankLineIds: [L.companyId] });
    const mark = w.fake.calls.length;
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.companyId] });
    expect(r.issued).toEqual([]);
    expect(r.skipped).toEqual([{ bankLineId: L.companyId, reason: 'כבר אושרה' }]);
    expect(receiptDrafts(w, L.companyId)).toHaveLength(1);
    expect(writesSince(w.fake, mark).filter((c) => c.table !== 'CollectionQueue')).toEqual([]);
  });

  it('a failed PDF does not undo the approved receipt: reported in errors, no draft, sendStatus left empty', async () => {
    const w = await identified();
    const inner = w.client.invokeAction;
    w.client.invokeAction = async (name: string, input: any) => (name === 'HtmlToPdf' ? Promise.reject(new Error('converter down')) : inner(name, input));
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.alias] });
    expect(r.ok).toBe(true);
    expect(r.writeVerified).toBe(false);
    expect(r.errors.join(' ')).toContain('converter down');
    expect(receiptRow(w, L.alias)).toMatchObject({ receiptStatus: 'אושרה – לא נשלחה', sendStatus: null });
    expect(receiptDrafts(w, L.alias)).toEqual([]);
  });
});

describe('IssueReceipt – mode one', () => {
  it('a picked customer on an unidentified line creates the receipt and saves an approved alias (ידני); the לא זוהה task closes', async () => {
    const w = await identified();
    expect(openTask(w, `receipt-customer:${L.unknown}`)).toBeTruthy();
    const r = await issue(w, { mode: 'one', bankLineIds: [L.unknown], customerCode: 'TEST-104' });
    expect(r.errors).toEqual([]);
    expect(r.issued[0]).toMatchObject({ receiptKey: `RCPT-${L.unknown}`, customerCode: 'TEST-104', identifyStatus: 'אושר', aliasSaved: true });
    expect(receiptRow(w, L.unknown)).toMatchObject({ receiptStatus: 'אושרה – לא נשלחה', customerCode: 'TEST-104', amount: 3141, receiptSource: 'דף בנק' });
    expect(w.fake.rows('BankAliases').find((a) => a.bankName === 'פלוני אלמוני')).toMatchObject({
      customerCode: 'TEST-104',
      status: 'מאושר',
      source: 'ידני',
      prioritySync: 'לא סונכרן',
      approvedBy: 'דנה',
      proposedFromBankLineId: L.unknown,
    });
    expect(taskRows(w, `receipt-customer:${L.unknown}`)[0]).toMatchObject({ status: 'נסגר אוטומטית' });
    // the next identification of the same payer finds the alias (95)
    const again = await identifyCustomers(w.client, { asOfDate: T, bankLineIds: [L.unknown] }, { nowIso: NOW });
    expect(again.lines[0].skippedReason).toContain('אושרה');
  });

  it('a customer other than the proposal: alias ידני, the proposal rejected, the identify task closed', async () => {
    const w = await identified();
    expect(openTask(w, `identify:${L.contact}`)).toBeTruthy();
    const r = await issue(w, { mode: 'one', bankLineIds: [L.contact], customerCode: 'TEST-101' });
    expect(r.issued[0]).toMatchObject({ customerCode: 'TEST-101', aliasSaved: true });
    expect(w.fake.rows('BankAliases').find((a) => a.bankName === 'רונית זוהרי')).toMatchObject({ customerCode: 'TEST-101', source: 'ידני' });
    expect(w.fake.rows('MatchProposals').find((p) => p.bankLineId === L.contact)).toMatchObject({ status: 'נדחתה', decidedBy: 'דנה' });
    expect(taskRows(w, `identify:${L.contact}`)[0]).toMatchObject({ status: 'נסגר אוטומטית' });
  });

  it('refuses an uncertain line without a picked customer, more than one line, and the internal auto mode', async () => {
    const w = await identified();
    const r = await issue(w, { mode: 'one', bankLineIds: [L.mail] });
    expect(r.issued).toEqual([]);
    expect(r.skipped).toEqual([{ bankLineId: L.mail, reason: 'הזיהוי אינו ודאי – יש לבחור לקוח (customerCode)' }]);
    expect((await issue(w, { mode: 'one', bankLineIds: [L.mail, L.partial], customerCode: 'TEST-107' })).errors).toEqual(['במצב one מאשרים שורה אחת בלבד']);
    expect((await invoke({ mode: 'auto', bankLineIds: [L.companyId] }, CTX)).errors[0]).toContain('auto');
    // a certain draft needs no customerCode
    const ok = await issue(w, { mode: 'one', bankLineIds: [L.alias] });
    expect(ok.issued[0]).toMatchObject({ customerCode: 'TEST-102', aliasSaved: false }); // the alias already exists
  });

  it('dryRun reports the plan and writes nothing', async () => {
    const w = await identified();
    const mark = w.fake.calls.length;
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.companyId, L.exactName], dryRun: true });
    expect(writesSince(w.fake, mark)).toEqual([]);
    expect(r.issued.map((x: any) => [x.bankLineId, x.sendStatus, x.taskKey])).toEqual([
      [L.companyId, 'טיוטה – בדיקה', ''],
      [L.exactName, 'חסר איש קשר', 'missing-ap:TEST-103'],
    ]);
  });

  it('a failed approval write rolls back the line (alias, receipt, bank line) and makes no draft', async () => {
    const w = await identified();
    const aliases = w.fake.rows('BankAliases').length;
    w.fake.failOn = (method, table) => method === 'updateItem' && table === 'MatchProposals';
    const r = await issue(w, { mode: 'one', bankLineIds: [L.contact], customerCode: 'TEST-101' });
    w.fake.failOn = null;
    expect(r.ok).toBe(false);
    expect(r.issued).toEqual([]);
    expect(r.errors.join(' ')).toContain('בוטל');
    expect(w.fake.rows('BankAliases')).toHaveLength(aliases);
    expect(receiptRow(w, L.contact)).toMatchObject({ receiptStatus: 'טיוטה – ממתינה לאישור', customerCode: 'TEST-106', preparedBy: null });
    expect(lineRow(w, L.contact)).toMatchObject({ checkStage: 'ממתינה לאישור', customerCode: null });
    expect(receiptDrafts(w, L.contact)).toEqual([]);
  });
});

describe('IssueReceipt – the debt check right after the approval (stage 5)', () => {
  it('every approved receipt is checked in-process: zero close → alert + פיזור מוצע, no close → task debt-check:<receiptKey>', async () => {
    const w = await identified();
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.companyId, L.alias] });
    const one = await issue(w, { mode: 'one', bankLineIds: [L.contact], customerCode: 'TEST-106' });
    expect(r.errors).toEqual([]);
    expect(one.errors).toEqual([]);
    expect(r.debtCheck).toMatchObject({ ok: true, alerts: 2, tasks: 0 });
    expect(receiptRow(w, L.alias)).toMatchObject({ debtCheckResult: 'נסגר לאפס – חודש אחד', debtCheckMonths: '2026-09', matchStatus: 'פיזור מוצע – לאישור' });
    expect(taskRows(w, `debt-zero:RCPT-${L.alias}`)[0]).toMatchObject({ taskType: 'נסגר לאפס', isAlert: true, relatedTable: 'Receipts' });
    // TEST-106 has no open movement: לברר מול הלקוח, the receipt stays על חשבון with a task for the bookkeeper
    expect(one.issued[0]).toMatchObject({ debtCheckResult: 'לברר מול הלקוח', debtTaskKey: `debt-check:RCPT-${L.contact}` });
    expect(receiptRow(w, L.contact)).toMatchObject({ receiptStatus: 'אושרה – לא נשלחה', debtCheckResult: 'לברר מול הלקוח', matchStatus: 'על חשבון – צריך פיזור' });
    expect(openTask(w, `debt-check:RCPT-${L.contact}`)).toMatchObject({ taskType: 'לברר מול הלקוח – סכום לא סוגר חודש', isAlert: false, assignedBookkeeperName: BK });
  });

  it('a debt-check failure never undoes the receipt; issuing again runs only the missing check', async () => {
    const w = await identified();
    const movements = w.fake.rows('OpenMovements').splice(0); // the pull failed: an empty mirror
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.companyId] });
    expect(r.ok).toBe(true);
    expect(r.issued.map((x: any) => x.bankLineId)).toEqual([L.companyId]);
    expect(r.errors.join(' ')).toContain('בדיקת חוב: אין תנועות פתוחות בכלל');
    expect(receiptRow(w, L.companyId)).toMatchObject({ receiptStatus: 'אושרה – לא נשלחה', matchStatus: 'על חשבון – צריך פיזור', sendStatus: 'טיוטה – בדיקה' });
    expect(receiptRow(w, L.companyId)!.debtCheckResult ?? null).toBeNull();
    // the mirror is back: approving the same line again skips the approval and runs the check alone
    w.fake.rows('OpenMovements').push(...movements);
    const again = await issue(w, { mode: 'certain', bankLineIds: [L.companyId] });
    expect(again.errors).toEqual([]);
    expect(again.skipped[0]).toMatchObject({ bankLineId: L.companyId, reason: 'כבר אושרה', debtCheckResult: 'נסגר לאפס – מצטבר' });
    expect(receiptRow(w, L.companyId)).toMatchObject({ debtCheckResult: 'נסגר לאפס – מצטבר', matchStatus: 'פיזור מוצע – לאישור' });
    expect(receiptDrafts(w, L.companyId)).toHaveLength(1);
  });
});

describe('IssueReceipt – the allocation proposal right after the debt check (stage 6)', () => {
  it('a zero-closed receipt gets the proposal (confidence, task קבלה – צריך פיזור); a לברר מול הלקוח one only its confidence', async () => {
    const w = await identified();
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.companyId] });
    expect(r.errors).toEqual([]);
    // 11,000 closed Aug + Sep cumulatively: invoices TEST-INV-TEST-101-1 (6,000) and -2 (5,000) exactly → 100
    expect(r.allocation).toEqual([expect.objectContaining({ receiptKey: `RCPT-${L.companyId}`, ok: true, allocationConfidence: 100, proposedTotal: 11000, surplus: 0, autoApplied: false, taskKey: `allocate:RCPT-${L.companyId}` })]);
    expect(receiptRow(w, L.companyId)).toMatchObject({ allocationConfidence: 100, matchStatus: 'פיזור מוצע – לאישור' });
    expect(openTask(w, `allocate:RCPT-${L.companyId}`)).toMatchObject({ taskType: 'קבלה – צריך פיזור', relatedTable: 'Receipts' });
    expect(w.fake.rows('ReceiptAllocations').filter((a: any) => a.receiptKey === `RCPT-${L.companyId}`)).toEqual([]);
    const one = await issue(w, { mode: 'one', bankLineIds: [L.contact], customerCode: 'TEST-106' });
    expect(one.errors).toEqual([]);
    expect(receiptRow(w, L.contact)).toMatchObject({ allocationConfidence: 0, matchStatus: 'על חשבון – צריך פיזור' });
    expect(taskRows(w, `allocate:RCPT-${L.contact}`)).toEqual([]);
  });

  it('allocationAutoApproveAt reached → allocated at once with אושר אוטומטית, the debt-check flow untouched', async () => {
    const w = await identified({ allocationAutoApproveAt: '95' });
    const r = await issue(w, { mode: 'certain', bankLineIds: [L.companyId] });
    expect(r.errors).toEqual([]);
    expect(r.allocation[0]).toMatchObject({ autoApplied: true, matchStatus: 'מפוזרת' });
    expect(receiptRow(w, L.companyId)).toMatchObject({ matchStatus: 'מפוזרת', allocatedAmount: 11000, unallocatedAmount: 0 });
    const rows = w.fake.rows('ReceiptAllocations').filter((a: any) => a.receiptKey === `RCPT-${L.companyId}`);
    expect(rows.map((a: any) => [a.invoiceNumber, a.amount, a.sourceRef])).toEqual([
      ['TEST-INV-TEST-101-1', 6000, 'אושר אוטומטית'],
      ['TEST-INV-TEST-101-2', 5000, 'אושר אוטומטית'],
    ]);
  });
});
