import { describe, expect, it, vi } from 'vitest';
import { identifyWorld, L, NOW, T } from '../../shared/fake-identify.ts';
import { writesSince } from '../../shared/fake-world.ts';
import { receiptFileName, renderReceiptHtml, receiptDocView } from '../../shared/collections-receipt-doc.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { identifyCustomers } from '../../shared/collections-identify-customers.ts';

const CTX = { appId: 'test', token: 't' };

describe('GenerateReceiptPdf', () => {
  it('a draft receipt: both stamps, the receipt number, customer + ח.פ, amount, method, reference; writes nothing', async () => {
    const w = identifyWorld();
    current = w.client;
    await identifyCustomers(w.client, { asOfDate: T, dryRun: false }, { nowIso: NOW });
    const mark = w.fake.calls.length;
    const r = await invoke({ receiptKey: `RCPT-${L.companyId}` }, CTX);
    expect(r).toEqual({
      url: `https://files.example/protected/receipt-RCPT-${L.companyId}.pdf`,
      fileName: `receipt-RCPT-${L.companyId}.pdf`,
      receiptKey: `RCPT-${L.companyId}`,
      customerCode: 'TEST-101',
      customerName: 'בדיקה – אורן בנייה',
      errors: [],
    });
    expect(writesSince(w.fake, mark)).toEqual([]);
    const html = w.pdfs[w.pdfs.length - 1].html;
    for (const s of ['טיוטה – ממתינה לאישור', 'הופק באפליקציה – טרם הונפק ב-Priority', `RCPT-${L.companyId}`, 'בדיקה – אורן בנייה', 'TEST-513000101', '11,000.00', 'העברה בנקאית', 'ח.פ 513000101'.replace('513000101', ''), 'על חשבון', 'בדיקה – אחראית א']) {
      expect(html).toContain(s);
    }
    // WeasyPrint-safe: no flex / grid / CSS variables
    expect(html).not.toMatch(/display:\s*(flex|grid)|var\(--/);
    expect(html).toContain('<html dir="rtl" lang="he">');
  });

  it('a missing receipt is an error, no url', async () => {
    const w = identifyWorld();
    current = w.client;
    const r = await invoke({ receiptKey: 'RCPT-NOPE' }, CTX);
    expect(r.url).toBe('');
    expect(r.errors).toEqual(['הקבלה RCPT-NOPE לא נמצאה']);
    expect((await invoke({}, CTX)).errors).toEqual(['חסר מספר קבלה (receiptKey)']);
  });

  it('the template: issued in Priority → no stamps; זיכוי בנק method; ASCII file name', () => {
    const view = receiptDocView({
      receipt: { receiptKey: 'RCPT-X/1', receiptStatus: 'הונפקה ב-Priority', customerCode: 'C1', customerName: 'לקוח', amount: 1234.5, valueDate: '2026-11-01', matchStatus: 'על חשבון – צריך פיזור', priorityReceiptNumber: 'R-77' },
      line: { lineType: 'זיכוי בנק', reference: 'ref 9', payerName: 'מעביר' },
      customer: { companyId: '514000000' },
      signer: null,
      todayIso: '2026-11-04T08:00:00.000Z',
    });
    const html = renderReceiptHtml(view);
    expect(html).not.toContain('טרם הונפק ב-Priority');
    expect(html).not.toContain('טיוטה – ממתינה לאישור');
    expect(html).toContain('זיכוי בנק');
    expect(html).toContain('1,234.50');
    expect(html).toContain('R-77');
    expect(receiptFileName('RCPT-X/1')).toBe('receipt-RCPT-X-1.pdf');
  });
});
