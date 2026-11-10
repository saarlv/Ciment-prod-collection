import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as ingest } from '../../IngestEmail/code.ts';
import { invoke as classify } from '../../ClassifyAndLinkEmail/code.ts';
import { invoke as decide } from '../../DecideApproval/code.ts';
import { invoke as briefing } from '../../WriteBriefing/code.ts';
import { invoke as createRequest } from '../../CreateDocumentRequest/code.ts';
import { invoke as checkScans } from '../../CheckDocumentScans/code.ts';
import { invoke as simulate } from '../../SimulateDeliveryNoteScan/code.ts';
import { invoke } from '../code.ts';
import { resolveClock } from '../../shared/collections-cases.ts';
import { countDocuments } from '../../shared/collections-documents.ts';

const ctx: any = {};
const T = '2026-10-21';
const NOW = Date.parse('2026-10-21T06:00:00.000Z'); // Wed 09:00 Israel
const H = 3_600_000;

describe('2c – missing delivery notes (TEST-INV-004-7, 4 of 6)', () => {
  const fake = new FakeBlocks();
  const pdfs: string[] = [];
  let emailId = '';
  let caseId = '';

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    seedRealWorld(fake);
    current = {
      ...fake.client(),
      invokeAction: vi.fn(async (name: string, input: any) => {
        if (name !== 'HtmlToPdf') throw new Error(`unexpected action ${name}`);
        pdfs.push(input.html);
        return { url: `https://files.example/protected/${input.pdfFilename}` };
      }),
    };
    await seed({ dryRun: false, asOfDate: T }, ctx);
  });
  afterAll(() => vi.useRealTimers());

  // this spec's case (TEST-INV-004-7); the seed's own open case (TEST-019, since 02.11) is left to the timer as on the platform
  const disputes = () => fake.rows('Disputes').filter((d) => d.disputeType === 'תעודת משלוח חסרה' && d.customerCode === 'TEST-004');
  const logistics = () => fake.rows('Approvals').filter((a) => a.kind === 'פנייה ללוגיסטיקה' && a.customerCode === 'TEST-004');

  it('counts: total = max(expected, notes found)', () => {
    const notes = [{ invoiceNumber: 'X', noteNumber: 'N1', scanned: true }, { invoiceNumber: 'X', noteNumber: 'N2', scanned: false }];
    expect(countDocuments({ deliveryNotesExpected: 4 }, 'X', notes)).toMatchObject({ expected: 4, scanned: 1, missingNoteNumbers: ['N2'], missingUnknown: 2, allScanned: false });
    expect(countDocuments({ deliveryNotesExpected: 1 }, 'X', notes)).toMatchObject({ expected: 2, missingUnknown: 0 });
  });

  it('the clock: date-only keeps the time of day; ISO is an instant', () => {
    expect(resolveClock('', NOW)).toMatchObject({ ms: NOW, isNow: true });
    expect(resolveClock('2026-10-22', NOW).ms).toBe(NOW + 24 * H);
    expect(resolveClock('2026-10-22T07:00:00.000Z', NOW)).toMatchObject({ ms: NOW + 25 * H, isNow: false });
    expect(() => resolveClock('22/10/2026', NOW)).toThrow();
  });

  it('the email: invoice number from the subject, TEST-004, verified sender', async () => {
    const m = await ingest(
      { messageId: 'dn-1', mailProvider: 'gmail', mailbox: 'saar+ciment@blocks.diy', mailboxOwnerName: 'סער', sourceLabel: 'Ciment-Test', fromAddress: 'מיכל לוי <saarlevi14@gmail.com>', subject: 'חסרות תעודות לחשבונית TEST-INV-004-7', bodyText: 'שלום, חסרות לנו תעודות משלוח. תודה', receivedAt: '1792560600' },
      ctx,
    );
    emailId = m.inboundEmailId;
    const row = fake.rows('InboundEmails').find((x) => x.messageId === 'dn-1')!;
    expect([row.customerCode, row.senderVerification, row.mentionedInvoiceNumbers]).toEqual(['TEST-004', 'מאומת', 'TEST-INV-004-7']);
    const c = await classify({ inboundEmailId: emailId, category: 'תעודות וחשבוניות חסרות', customerCode: 'TEST-004' }, ctx);
    expect(c.writeVerified).toBe(true);
  });

  it('dry run: 4/6, the other customer\'s invoice and an unknown one are refused, nothing written', async () => {
    const mark = fake.calls.length;
    const r = await invoke({ invoiceNumbers: ['TEST-INV-004-7', 'TEST-INV-007-2', 'NOPE-1'], inboundEmailId: emailId, dryRun: true }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.invoices).toHaveLength(1);
    expect(r.invoices[0]).toMatchObject({ invoiceNumber: 'TEST-INV-004-7', expected: 6, scanned: 4, missingNoteNumbers: ['TEST-DN-004-7-5', 'TEST-DN-004-7-6'], productLine: 'מלט', outcome: 'ממתינה לסריקה', caseAction: 'נפתח' });
    expect(r.refused.map((x: any) => [x.invoiceNumber, x.outcome])).toEqual([
      ['TEST-INV-007-2', 'סורבה'],
      ['NOPE-1', 'סורבה'],
    ]);
    expect(r.refused[0].reason).toBe('החשבונית אינה של בדיקה – רמות בנייה ופיתוח (TEST-004) – לא נבדקה ולא תצורף');
    expect(fake.calls.slice(mark).filter((c) => /^(create|update|delete)/.test(c.method))).toHaveLength(0);
  });

  it('real run: case ממתינה לסריקה + one logistics draft; a second run updates, never duplicates', async () => {
    const r = await invoke({ invoiceNumbers: ['TEST-INV-004-7', 'TEST-INV-007-2'], inboundEmailId: emailId }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(r.invoices[0]).toMatchObject({ outcome: 'ממתינה לסריקה', approvalKind: 'פנייה ללוגיסטיקה', disputeNumber: 'TEST-DSP-20261021-1' });
    caseId = r.invoices[0].disputeId;
    expect(disputes()).toHaveLength(1);
    const d = disputes()[0];
    expect(d).toMatchObject({
      customerCode: 'TEST-004',
      customerName: 'בדיקה – רמות בנייה ופיתוח',
      invoiceNumbers: 'TEST-INV-004-7',
      status: 'ממתינה לסריקה',
      ballWith: 'לוגיסטיקה',
      missingNoteNumbers: 'TEST-DN-004-7-5, TEST-DN-004-7-6',
      productLine: 'מלט',
      logisticsOwnerName: 'בדיקה – לוגיסטיקה מלט',
      logisticsOwnerEmail: 'logistics.cement@test.example',
      ownerBookkeeperName: 'בדיקה – אחראית א',
      reminderCount: 0,
      inboundEmailId: 'dn-1',
      isTestFixture: true,
      disputedAmount: 9870,
    });
    expect(Date.parse(d.nextReminderAt)).toBe(NOW + 24 * H);
    expect(logistics()).toHaveLength(1);
    const a = logistics()[0];
    expect(a).toMatchObject({ status: 'ממתין', relatedTable: 'Disputes', relatedId: caseId, recipientContact: 'logistics.cement@test.example', recipientName: 'בדיקה – לוגיסטיקה מלט', inboundEmailId: null, isTestFixture: true });
    // every outbox draft carries its CIM reference in the subject (component 04: replies thread back by it)
    expect(a.subject).toBe(`סריקת תעודות משלוח – חשבונית TEST-INV-004-7 (בדיקה – רמות בנייה ופיתוח) [${a.referenceCode}]`);
    expect(a.referenceCode).toBe(`CIM-${a.id}`);
    expect(a.body).toContain('תעודה TEST-DN-004-7-5');
    expect(a.body).toContain('בדיקה – אתר רמות מודיעין');
    expect(a.body.endsWith('בברכה,\nבדיקה – אחראית א\nמחלקת הנהלת חשבונות, סימנט')).toBe(true);
    // nothing for the other customer's invoice
    expect(fake.rows('Approvals').some((x) => x.customerCode === 'TEST-007')).toBe(false);

    const again = await invoke({ invoiceNumbers: ['TEST-INV-004-7'], inboundEmailId: emailId }, ctx);
    expect(again.invoices[0]).toMatchObject({ disputeId: caseId, caseAction: 'עודכן' });
    expect(disputes()).toHaveLength(1);
    expect(logistics()).toHaveLength(1);
    expect(Date.parse(disputes()[0].nextReminderAt)).toBe(NOW + 24 * H);
  });

  it('CreateDocumentRequest: validates and replaces its own pending draft', async () => {
    expect((await createRequest({ disputeId: caseId, kind: 'אחר' }, ctx)).errors[0]).toContain('סוג פנייה לא מוכר');
    const r = await createRequest({ disputeId: caseId }, ctx);
    expect(r).toMatchObject({ writeVerified: true, replaced: true });
    expect(logistics()).toHaveLength(1);
  });

  it('timer: now → nothing; +25h → reminder draft; same clock again → nothing; +49h → הוסלמה', async () => {
    const now = await checkScans({ disputeId: caseId }, ctx);
    expect(now.cases[0]).toMatchObject({ action: 'ללא שינוי', after: 'ממתינה לסריקה' });

    const plus25 = '2026-10-22T07:00:00.000Z';
    const r1 = await checkScans({ asOfDate: plus25, disputeId: caseId }, ctx);
    expect(r1.writeVerified).toBe(true);
    expect(r1.cases[0]).toMatchObject({ before: 'ממתינה לסריקה', after: 'תזכורת בטיוטה', action: 'תזכורת בטיוטה', reminderCount: 1, clockUsed: 'שעון בדיקה' });
    expect(logistics()).toHaveLength(2);
    const reminder = logistics().find((x) => x.subject.startsWith('תזכורת: '))!;
    expect(reminder.body).toContain('תזכורת לבקשה מ-21.10.2026 09:00');
    expect(Date.parse(disputes()[0].nextReminderAt)).toBe(NOW + 48 * H);

    const r2 = await checkScans({ asOfDate: plus25, disputeId: caseId }, ctx);
    expect(r2.cases[0]).toMatchObject({ action: 'ללא שינוי', after: 'תזכורת בטיוטה' });
    expect(logistics()).toHaveLength(2);

    const plus49 = '2026-10-23T07:00:00.000Z';
    const r3 = await checkScans({ asOfDate: plus49 }, ctx);
    expect(r3.cases.find((c: any) => c.disputeId === caseId)).toMatchObject({ after: 'הוסלמה', action: 'הוסלמה' });
    expect(disputes()[0]).toMatchObject({ status: 'הוסלמה', ballWith: 'מנהל הגבייה', nextReminderAt: null });
    const esc = fake.rows('Interactions').filter((i) => i.type === 'הסלמה' && i.customerCode === 'TEST-004');
    expect(esc).toHaveLength(1);
    expect(esc[0]).toMatchObject({ customerCode: 'TEST-004', direction: 'פנימי', relatedInvoiceNumbers: 'TEST-INV-004-7' });
    await checkScans({ asOfDate: plus49 }, ctx);
    expect(fake.rows('Interactions').filter((i) => i.type === 'הסלמה' && i.customerCode === 'TEST-004')).toHaveLength(1);
  });

  it('a demo clock never acts on a real case; the scheduled run sleeps outside business hours', async () => {
    fake.insert('DeliveryNotes', [{ noteNumber: 'R-DN-1', invoiceNumber: 'R-1', customerCode: '10001', scanned: false, source: 'priority-mock' }]);
    fake.insert('Disputes', [
      { disputeNumber: 'DSP-REAL-1', customerCode: '10001', customerName: 'אלון יזמות בע״מ', disputeType: 'תעודת משלוח חסרה', invoiceNumbers: 'R-1', status: 'ממתינה לסריקה', reminderCount: 0, nextReminderAt: new Date(NOW + 2 * H).toISOString(), isTestFixture: false },
    ]);
    const r = await checkScans({ asOfDate: '2026-10-25' }, ctx);
    const real = r.cases.find((c: any) => c.disputeNumber === 'DSP-REAL-1');
    expect(real).toMatchObject({ action: 'ללא שינוי', clockUsed: 'שעון אמיתי' });
    expect(fake.rows('Disputes').find((d) => d.disputeNumber === 'DSP-REAL-1')!.status).toBe('ממתינה לסריקה');

    vi.setSystemTime(Date.parse('2026-10-24T09:00:00.000Z')); // Saturday
    const sat = await checkScans({ scheduled: true }, ctx);
    expect(sat).toMatchObject({ skipped: true, cases: [] });
    vi.setSystemTime(NOW);
    fake.tables.set('Disputes', fake.rows('Disputes').filter((d) => d.disputeNumber !== 'DSP-REAL-1'));
  });

  it('the collections manager\'s summary lists the escalated case', async () => {
    const b = await briefing({ asOfDate: T }, ctx);
    const all = b.briefings.find((x: any) => x.audience === 'כולם');
    // the two timer runs at +49h without a case id escalate every due case: this one and the seed's TEST-019 case
    expect(all.counts.escalatedDocumentCases).toBe(2);
    expect(all.body).toContain(
      '**לסיכום מנהל הגבייה – תעודות משלוח שהוסלמו (2):** בדיקה – אפיקים תשתיות – TEST-INV-019-2 (חסרות TEST-DN-019-2-3) · בדיקה – רמות בנייה ופיתוח – TEST-INV-004-7 (חסרות TEST-DN-004-7-5, TEST-DN-004-7-6)',
    );
    expect(b.briefings.find((x: any) => x.audience === 'בדיקה – אחראית א').counts.escalatedDocumentCases).toBeUndefined();
  });

  it('SimulateDeliveryNoteScan refuses real rows', async () => {
    const r = await simulate({ noteNumbers: ['R-DN-1'] }, ctx);
    expect(r.scanned).toEqual([]);
    expect(r.refused[0]).toMatchObject({ noteNumber: 'R-DN-1', reason: 'שורה אמיתית מ-Priority – הסימולציה פועלת רק על תעודות בדיקה' });
    expect(fake.rows('DeliveryNotes').find((n) => n.noteNumber === 'R-DN-1')!.scanned).toBe(false);
  });

  it('simulated scan of the missing notes prepares the package (invoice + 6 scans) to the verified sender', async () => {
    const dry = await simulate({ disputeId: caseId, dryRun: true }, ctx);
    expect(dry.scanned.map((s: any) => s.noteNumber)).toEqual(['TEST-DN-004-7-5', 'TEST-DN-004-7-6']);
    const before = pdfs.length;
    const r = await simulate({ disputeId: caseId }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    expect(r.scanned.map((s: any) => [s.noteNumber, s.scanUrl])).toEqual([
      ['TEST-DN-004-7-5', 'https://files.example/protected/test-scan-TEST-DN-004-7-5.pdf'],
      ['TEST-DN-004-7-6', 'https://files.example/protected/test-scan-TEST-DN-004-7-6.pdf'],
    ]);
    expect(pdfs[before]).toContain('בדיקה – סריקה מדומה של תעודת משלוח');
    expect(pdfs[before]).toContain('dir="rtl"');
    expect(r.cases[0]).toMatchObject({ disputeId: caseId, before: 'הוסלמה', after: 'מוכנה לשליחה ללקוח', action: 'חבילה מוכנה' });
    expect(disputes()[0]).toMatchObject({ status: 'מוכנה לשליחה ללקוח', ballWith: 'מנהלת חשבונות', missingNoteNumbers: null });

    const pkg = fake.rows('Approvals').filter((a) => a.kind === 'מענה ללקוח' && a.relatedTable === 'Disputes');
    expect(pkg).toHaveLength(1);
    expect(pkg[0]).toMatchObject({ status: 'ממתין', recipientContact: 'saarlevi14@gmail.com', recipientName: 'מיכל לוי', fromMailbox: 'saar+ciment@blocks.diy', inboundEmailId: 'dn-1', relatedId: caseId, subject: `Re: חסרות תעודות לחשבונית TEST-INV-004-7 [${pkg[0].referenceCode}]`, isTestFixture: true });
    const urls = pkg[0].attachmentUrls.split('\n');
    expect(urls).toHaveLength(7);
    expect(urls[0]).toBe('https://files.example/protected/test-invoice-TEST-INV-004-7.pdf');
    expect(urls.every((u: string) => u.startsWith('https://files.example/protected/'))).toBe(true);
    expect(pkg[0].body.endsWith('בברכה,\nבדיקה – אחראית א\nמחלקת הנהלת חשבונות, סימנט')).toBe(true);
    // placeholder links were stored back on the test rows only
    expect(fake.rows('Invoices').find((i) => i.invoiceNumber === 'TEST-INV-004-7')).toMatchObject({ sourceDocUrl: urls[0], deliveryNotesAttached: 6, missingDeliveryNotes: false });
    expect(fake.rows('DeliveryNotes').filter((n) => n.invoiceNumber === 'TEST-INV-004-7').every((n) => n.scanned && n.scanUrl)).toBe(true);
    expect(fake.rows('InboundEmails').find((x) => x.messageId === 'dn-1')!.status).toBe('טיוטה מוכנה');
    // 6/6: the request and the reminder still waiting for logistics are cancelled (Approvals has no בוטלה)
    expect(logistics().map((l) => [l.status, l.decisionNote, l.decidedBy])).toEqual([
      ['נדחה', 'בוטלה – כל התעודות נסרקו', 'המערכת'],
      ['נדחה', 'בוטלה – כל התעודות נסרקו', 'המערכת'],
    ]);
    expect(r.cancelledDraftIds).toEqual(logistics().map((l) => l.id));
  });

  it('DecideApproval: the package answers the email; the cancelled logistics drafts are skipped', async () => {
    const pkg = fake.rows('Approvals').find((a) => a.kind === 'מענה ללקוח' && a.relatedTable === 'Disputes')!;
    const r = await decide({ decision: 'approve', decidedBy: 'בדיקה – אחראית א', approvalIds: [pkg.id, ...logistics().map((l) => l.id)] }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.updated.map((u: any) => u.status)).toEqual(['אושר – לא נשלח']);
    expect(r.skipped.map((u: any) => u.reason)).toEqual(['הטיוטה כבר בסטטוס נדחה', 'הטיוטה כבר בסטטוס נדחה']);
    const email = fake.rows('InboundEmails').find((x) => x.messageId === 'dn-1')!;
    expect(email.status).toBe('נענתה');
    expect(email.answeredAt).toBeTruthy();
  });

  it('all scanned with no email → package to the registered accounts contact; an unverified sender gets a task, no package', async () => {
    const r = await invoke({ invoiceNumbers: ['TEST-INV-004-2'], customerCode: 'TEST-004' }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.invoices[0]).toMatchObject({ expected: 1, scanned: 1, outcome: 'חבילה מוכנה', caseStatus: 'מוכנה לשליחה ללקוח' });
    const pkg = fake.rows('Approvals').find((a) => a.id === r.invoices[0].approvalId)!;
    expect(pkg).toMatchObject({ recipientContact: 'saarlevi14@gmail.com', inboundEmailId: null, subject: `חשבונית TEST-INV-004-2 ותעודות משלוח [${pkg.referenceCode}]` });
    expect(pkg.attachmentUrls.split('\n')).toHaveLength(2);

    const m = await ingest({ messageId: 'dn-2', mailProvider: 'gmail', mailbox: 'saar+ciment@blocks.diy', sourceLabel: 'Ciment-Test', fromAddress: 'someone@other.example', subject: 'תעודות לחשבונית TEST-INV-004-2', bodyText: 'נא לשלוח', receivedAt: '1792560600' }, ctx);
    await classify({ inboundEmailId: m.inboundEmailId, category: 'תעודות וחשבוניות חסרות', customerCode: 'TEST-004' }, ctx);
    const u = await invoke({ invoiceNumbers: ['TEST-INV-004-2'], inboundEmailId: m.inboundEmailId }, ctx);
    expect(u.invoices[0].outcome).toBe('הכל סרוק – לאמת שולח');
    expect(u.invoices[0].approvalId).toBeNull();
    const tasks = fake.rows('CollectionQueue').filter((t) => t.relatedId === m.inboundEmailId && t.taskType === 'לאמת שולח');
    expect(tasks).toHaveLength(1);
    // still one package to the registered contact, none to the unverified sender
    expect(fake.rows('Approvals').filter((a) => a.recipientContact === 'someone@other.example')).toHaveLength(0);
  });
});
