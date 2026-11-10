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
import { invoke } from '../code.ts';
import { loadLedger, loadOpenDebts } from '../../shared/collections-ledger.ts';
import { asOfLabel, FONT_REGULAR_URL, renderLedgerHtml, renderOpenDebtsHtml, statementFileName } from '../../shared/collections-statement.ts';

const ctx: any = {};
const T = '2026-10-21';

/** Body text with every ltr island, style attribute and colspan removed – what is left must have no digits. */
const bareText = (html: string) =>
  html
    .replace(/<head>[\s\S]*<\/head>/, '')
    .replace(/<span dir="ltr" style="unicode-bidi: embed">[^<]*<\/span>/g, '')
    .replace(/\sstyle="[^"]*"/g, '')
    .replace(/\scolspan="\d+"/g, '');

describe('statement template', () => {
  const fake = new FakeBlocks();
  const pdfCalls: any[] = [];
  beforeAll(async () => {
    seedRealWorld(fake);
    current = {
      ...fake.client(),
      invokeAction: vi.fn(async (name: string, input: any) => {
        pdfCalls.push({ name, input });
        return { url: `https://files.example/protected/${input.pdfFilename}` };
      }),
    };
    await seed({ dryRun: false, asOfDate: T }, ctx);
    // the open debts come from OpenMovements (plan 04.11 r2 stage 9): the test source derives them from the seed
    expect((await pullOpenMovements(current, { dryRun: false }, { nowIso: `${T}T04:00:00.000Z` })).ok).toBe(true);
  });

  it('ledger HTML: RTL Hebrew, stamp on every page, numbers left-to-right, WeasyPrint-safe', async () => {
    const data = await loadLedger(current, 'TEST-004', '2026-01-01', T);
    const html = renderLedgerHtml(data, T);
    expect(html).toContain('<html dir="rtl" lang="he">');
    expect(asOfLabel(T)).toBe('תצוגה – נכון ל-21.10.2026');
    expect(html).toContain('@top-left { content: "תצוגה – נכון ל-21.10.2026"');
    expect(html).toContain('counter(page)');
    // since 28.10 the layout of Yaniv's Priority "כרטסת" printout: the stamp and the page number are @page margin
    // boxes only (printed on every page), the company header is CIMENT I.S. LTD
    expect(html).toContain('@top-center { content: "CIMENT I.S. LTD"');
    expect(html).toContain(`@font-face { font-family: 'CimentAlef'; src: url('${FONT_REGULAR_URL}')`);
    expect(html).toContain('<b><span dir="ltr" style="unicode-bidi: embed">CIMENT I.S. LTD</span></b>, מחלקת הנהלת חשבונות');
    expect(html).toContain('>כרטסת</div>');
    expect(html).toContain('תאור חשבון: בדיקה – רמות בנייה ופיתוח');
    expect(html).toContain('<span dir="ltr" style="unicode-bidi: embed">111,500.00</span>');
    expect(html).toContain('<span dir="ltr" style="unicode-bidi: embed">TEST-INV-004-1</span>');
    expect(html).toContain('<span dir="ltr" style="unicode-bidi: embed">TEST-004</span>');
    expect(html).toContain('סה״כ לחשבון: <span dir="ltr" style="unicode-bidi: embed">TEST-004</span>');
    for (const h of ['תאריך ערך', 'תאריך למאזן', 'פרטים', 'חשבון נגדי', 'סוג תנועה', 'חובה', 'זכות', 'יתרה מצטברת', 'מט.']) expect(html).toContain(`>${h}</th>`);
    expect(html).toContain('>אסמכתא <span dir="ltr" style="unicode-bidi: embed">1</span></th>');
    expect(html).toContain('חשבונית מס, לתשלום עד <span dir="ltr" style="unicode-bidi: embed">31.10.2026</span>');
    expect(html).toContain('עבור <span dir="ltr" style="unicode-bidi: embed">TEST-INV-004-5</span>');
    expect(bareText(html)).not.toMatch(/\d/);
    expect(html).not.toMatch(/display:\s*(flex|grid)|var\(--|<link|<img|<script|base64/);
  });

  it('open-debts HTML has the debt columns, totals and wrapped numbers', async () => {
    const data = await loadOpenDebts(current, 'TEST-004', T);
    const html = renderOpenDebtsHtml(data, T);
    // since 28.10 the layout of Yaniv's "הדפסת חובות פתוחים ללקוח" printout (company block, aging columns, totals)
    for (const h of ['תאריך תשלום', 'ימי פיגור', 'תאריך חשבונית', 'חשבונית', 'סוג תנועה', 'פרטים', 'סכום החשבונית', 'חוב לחשבונית', 'חוב מצטבר', 'מטבע', 'סה״כ']) expect(html).toContain(`>${h}</th>`);
    // 51 days overdue, a number cell: left-aligned, never wrapped, inside an ltr span
    expect(html).toContain('<td style="border: 1px solid #1f2937; padding: 4px 5px; font-size: 9pt; vertical-align: middle; text-align: left; white-space: nowrap;"><span dir="ltr" style="unicode-bidi: embed">51</span></td>');
    expect(html).toContain('<span dir="ltr" style="unicode-bidi: embed">86,330.00</span>');
    expect(html).toContain('<span dir="ltr" style="unicode-bidi: embed">111,500.00</span>');
    expect(html).toContain('>הדפסת חובות פתוחים ללקוח<');
    expect(html).toContain('סימנט אי.אס. בע״מ');
    expect(html).toContain('<div>בדיקה – רמות בנייה ופיתוח</div>');
    expect(html).not.toMatch(/display:\s*(flex|grid)|var\(--|<link|<img|<script|base64/);
    expect(bareText(html)).not.toMatch(/\d/);
    expect(statementFileName('חובות פתוחים', 'TEST-004', T)).toBe('open-debts-TEST-004-2026-10-21.pdf');
    expect(statementFileName('כרטסת', 'TEST-004', T)).toBe('kartesset-TEST-004-2026-10-21.pdf');
    expect(statementFileName('כרטסת', 'לקוח 7', T)).toBe('kartesset-7-2026-10-21.pdf');
  });

  it('GenerateStatementPdf invokes HtmlToPdf once and returns the url', async () => {
    const r = await invoke({ customerCode: 'TEST-004', kind: 'כרטסת', asOfDate: T }, ctx);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({
      url: 'https://files.example/protected/kartesset-TEST-004-2026-10-21.pdf',
      fileName: 'kartesset-TEST-004-2026-10-21.pdf',
      customerName: 'בדיקה – רמות בנייה ופיתוח',
      asOfLabel: 'תצוגה – נכון ל-21.10.2026',
      rows: 8,
      totals: { openingBalance: 0, closingBalance: 111500, totalDebit: 139140, totalCredit: 27640 },
    });
    expect(pdfCalls.at(-1).name).toBe('HtmlToPdf');
    expect(Object.keys(pdfCalls.at(-1).input)).toEqual(['html', 'pdfFilename']);
    const od = await invoke({ customerCode: 'TEST-004', kind: 'חובות פתוחים', asOfDate: T }, ctx);
    expect(od).toMatchObject({ rows: 6, totals: { totalOpen: 111500, totalOverdue: 86330, endOfCardBalance: 111500 } });

    const before = pdfCalls.length;
    expect((await invoke({ customerCode: 'TEST-001', kind: 'כרטסת', asOfDate: T }, ctx)).errors[0]).toContain('אין שורות כרטסת');
    expect((await invoke({ customerCode: 'NOPE', kind: 'חובות פתוחים', asOfDate: T }, ctx)).errors).toEqual(['הלקוח NOPE לא נמצא']);
    expect((await invoke({ customerCode: 'TEST-004', kind: 'x' }, ctx)).errors[0]).toContain('סוג מסמך לא מוכר');
    expect(pdfCalls.length).toBe(before);
  });
});
