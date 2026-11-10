import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as ingest } from '../../IngestEmail/code.ts';
import { invoke as classify } from '../../ClassifyAndLinkEmail/code.ts';
import { invoke as mark } from '../../MarkPriceApproval/code.ts';
import { invoke } from '../code.ts';
import { analyzeLines } from '../../shared/collections-pricing.ts';

const ctx: any = {};

describe('2d – price gap on TEST-INV-004-2', () => {
  const w = makeWorld();
  let emailId = '';
  let caseId = '';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    current = w.client;
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
    const m = await ingest(
      { messageId: 'pg-1', mailProvider: 'gmail', mailbox: 'saar+ciment@blocks.diy', sourceLabel: 'Ciment-Test', fromAddress: 'מיכל לוי <saarlevi14@gmail.com>', subject: 'המחיר בחשבונית TEST-INV-004-2 לא נכון', bodyText: 'שלום,\nחויבנו 45 ש״ח לבלוק ו-40 למלט. סוכם אחרת.\nמיכל', receivedAt: '1792560600' },
      ctx,
    );
    emailId = m.inboundEmailId;
    await classify({ inboundEmailId: emailId, category: 'הפרש מחיר', customerCode: 'TEST-004' }, ctx);
  });
  afterAll(() => vi.useRealTimers());
  const priceCases = () => w.fake.rows('Disputes').filter((d) => d.disputeType === 'מחיר');
  const requests = () => w.fake.rows('Approvals').filter((a) => a.kind === 'בקשת אישור מחיר');

  it('rules: zero price, approved manual price, no list price', () => {
    const r = analyzeLines({
      invoice: { customerCode: 'C', invoiceDate: '2026-06-10' },
      customer: { customerCode: 'C' },
      siteNames: [],
      priceItems: [
        { sku: 'A', customerCode: 'C', price: 10, validFrom: '2026-01-01' },
        { sku: 'B', customerCode: 'C', price: 10, validFrom: '2026-01-01' },
      ],
      lines: [
        { lineKey: '1', sku: 'A', quantity: 5, unitPrice: 0, priceSource: 'מחירון' },
        { lineKey: '2', sku: 'B', quantity: 5, unitPrice: 12, priceSource: 'ידני', managerApprovalStatus: 'אושר' },
        { lineKey: '3', sku: 'Z', quantity: 5, unitPrice: 12, priceSource: 'ידני' },
      ],
    });
    expect(r.lines.map((l) => l.reason)).toEqual(['ללא חיוב', null, null]);
    expect(r).toMatchObject({ totalGap: 0, underchargedTotal: 50, reasons: ['ללא חיוב'] });
  });

  it('dry run: customer list first, then the site list; reasons; source and free text; nothing written', async () => {
    const before = w.fake.calls.length;
    const r = await invoke({ invoiceNumber: 'TEST-INV-004-2', inboundEmailId: emailId, dryRun: true }, ctx);
    expect(r.errors).toEqual([]);
    expect(writesSince(w.fake, before)).toHaveLength(0);
    expect(r).toMatchObject({ customerCode: 'TEST-004', siteName: 'בדיקה – אתר רמות מודיעין', totalGap: 1350, reasons: ['מחירון לא עודכן', 'מחיר ידני'], salesAgentName: 'בדיקה – סוכן מרכז', salesManagerName: 'בדיקה – מנהל מכירות', outcome: 'נפתח מקרה מחיר' });
    const [blk, cem, sand] = r.lines;
    expect(blk).toMatchObject({ sku: 'TEST-SKU-BLK20', listSource: 'לקוח', listPrice: 42, priceListCode: 'TEST-PL-004', priceSource: 'ידני', managerApprovalStatus: 'לא אושר', freeText: 'לפי סיכום טלפוני עם הסוכן – 45 ₪ לבלוק', gapPerUnit: 3, gapTotal: 750, reason: 'מחיר ידני' });
    expect(cem).toMatchObject({ sku: 'TEST-SKU-CEM50', listSource: 'אתר', listPrice: 36, currentListPrice: 36, priceListCode: 'TEST-PL-SITE-004', priceSource: 'מחירון', gapTotal: 600, reason: 'מחירון לא עודכן' });
    expect(sand).toMatchObject({ listSource: 'לקוח', listPrice: 30, gapTotal: 0, reason: null });
  });

  it('TEST-008 (existing scenario): manual 46 vs 42 and the expired 38 vs 35', async () => {
    const r = await invoke({ invoiceNumber: 'TEST-INV-008-1', dryRun: true }, ctx);
    expect(r.lines.map((l: any) => [l.sku, l.reason, l.gapTotal])).toEqual([
      ['TEST-SKU-BLK20', 'מחיר ידני', 400],
      ['TEST-SKU-CEM50', 'מחירון לא עודכן', 120],
    ]);
    expect(r.lines[1].currentListPrice).toBe(35);
    expect(r.salesAgentName).toBe('בדיקה – סוכן צפון');
  });

  it('another customer\'s invoice is refused, nothing written', async () => {
    const before = w.fake.calls.length;
    const r = await invoke({ invoiceNumber: 'TEST-INV-008-1', inboundEmailId: emailId }, ctx);
    expect(r).toMatchObject({ refused: true, outcome: 'סורבה', lines: [] });
    expect(r.refusalReason).toBe('החשבונית TEST-INV-008-1 אינה של הלקוח TEST-004 – לא נותחה ולא נפתח מקרה');
    expect(writesSince(w.fake, before)).toHaveLength(0);
  });

  it('real run: one מחיר case ממתינה לאישור סוכן + the request to agent and manager; idempotent', async () => {
    const r = await invoke({ invoiceNumber: 'TEST-INV-004-2', inboundEmailId: emailId }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    caseId = r.disputeId;
    expect(priceCases()).toHaveLength(1);
    expect(priceCases()[0]).toMatchObject({
      disputeNumber: 'TEST-DSP-20261021-1',
      status: 'ממתינה לאישור סוכן',
      ballWith: 'סוכן מכירות',
      disputedAmount: 1350,
      salesAgentName: 'בדיקה – סוכן מרכז',
      salesManagerName: 'בדיקה – מנהל מכירות',
      inboundEmailId: 'pg-1',
      isTestFixture: true,
      customerName: 'בדיקה – רמות בנייה ופיתוח',
    });
    expect(priceCases()[0].description).toContain('מחירון לא עודכן');
    expect(requests()).toHaveLength(1);
    const a = requests()[0];
    expect(a).toMatchObject({ status: 'ממתין', relatedTable: 'Disputes', relatedId: caseId, recipientName: 'בדיקה – סוכן מרכז, בדיקה – מנהל מכירות', recipientContact: 'agent.center@test.example, sales.manager@test.example', inboundEmailId: null });
    expect(a.body).toContain('TEST-SKU-CEM50');
    expect(a.body).toContain('> חויבנו 45 ש״ח לבלוק');
    expect(a.body).toContain('טקסט חופשי בהזמנה: "לפי סיכום טלפוני עם הסוכן – 45 ₪ לבלוק"');

    const again = await invoke({ invoiceNumber: 'TEST-INV-004-2', inboundEmailId: emailId }, ctx);
    expect(again).toMatchObject({ disputeId: caseId, outcome: 'מקרה מחיר עודכן' });
    expect(priceCases()).toHaveLength(1);
    expect(requests()).toHaveLength(1);
  });

  it('MarkPriceApproval: manager before agent and a mark without evidence are refused; order enforced', async () => {
    const before = w.fake.calls.length;
    const early = await mark({ disputeId: caseId, step: 'מנהל אישר', evidence: 'מאשר', markedBy: 'בדיקה – אחראית א' }, ctx);
    expect(early).toMatchObject({ refused: true, reason: 'אי אפשר לסמן "מנהל אישר" לפני "סוכן אישר" – קודם אישור הסוכן' });
    const blank = await mark({ disputeId: caseId, step: 'סוכן אישר', evidence: '  \n‏ ', markedBy: 'בדיקה – אחראית א' }, ctx);
    expect(blank).toMatchObject({ refused: true, reason: 'חובה לצרף ראיה לאישור: טקסט המייל או קישור. לא נשמר דבר' });
    expect(writesSince(w.fake, before)).toHaveLength(0);

    const agent = await mark({ disputeId: caseId, step: 'סוכן אישר', evidence: 'מאשר זיכוי לפי 42 ו-36. סוכן מרכז', markedBy: 'בדיקה – אחראית א' }, ctx);
    expect(agent.refused).toBe(false);
    expect(agent.writeVerified).toBe(true);
    expect(agent.dispute).toMatchObject({ status: 'ממתינה לאישור מנהל', salesAgentApprovalMarkedBy: 'בדיקה – אחראית א', salesAgentApprovalEvidence: 'מאשר זיכוי לפי 42 ו-36. סוכן מרכז' });
    expect(agent.dispute.salesAgentApprovedAt).toBe('2026-10-21T06:00:00.000Z');
    const twice = await mark({ disputeId: caseId, step: 'סוכן אישר', evidence: 'שוב', markedBy: 'x' }, ctx);
    expect(twice.refused).toBe(true);
    expect(twice.reason).toBe('אישור הסוכן כבר סומן על ידי בדיקה – אחראית א ב-21.10.2026 09:00');

    const mgr = await mark({ disputeId: caseId, step: 'מנהל אישר', evidence: 'https://mail.example/thread/123', markedBy: 'בדיקה – אחראית ב' }, ctx);
    expect(mgr.writeVerified).toBe(true);
    expect(mgr.dispute).toMatchObject({ status: 'ממתינה לזיכוי', ballWith: 'מנהלת חשבונות', salesManagerApprovalMarkedBy: 'בדיקה – אחראית ב' });
    const note = mgr.dispute.creditDraftNote as string;
    expect(note).toContain('זיכוי לחשבונית TEST-INV-004-2 – בדיקה – רמות בנייה ופיתוח (TEST-004)');
    expect(note).toContain('250 יח׳ × 3 ₪ = 750 ₪');
    expect(note).toContain('150 יח׳ × 4 ₪ = 600 ₪');
    expect(note).toContain('סה״כ לזיכוי: 1,350 ₪');
    expect(note).toContain('אישור סוכן: בדיקה – סוכן מרכז – סומן על ידי בדיקה – אחראית א ב-21.10.2026 09:00');
    expect(note).toContain('אישור מנהל: בדיקה – מנהל מכירות – סומן על ידי בדיקה – אחראית ב');
    expect(w.fake.rows('Interactions').filter((i) => i.type === 'מחלוקת' && i.customerCode === 'TEST-004')).toHaveLength(2);
    expect((await mark({ disputeId: caseId, step: 'מנהל אישר', evidence: 'x', markedBy: 'y' }, ctx)).refused).toBe(true);
  });

  it('a later analysis keeps the approvals and does not redraft the request', async () => {
    const r = await invoke({ invoiceNumber: 'TEST-INV-004-2', inboundEmailId: emailId }, ctx);
    expect(r).toMatchObject({ caseStatus: 'ממתינה לזיכוי', approvalId: null, writeVerified: true });
    expect(priceCases()[0].salesAgentApprovedAt).toBeTruthy();
    expect(requests()).toHaveLength(1);
  });
});
