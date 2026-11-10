import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { bankLineIdsFor, normalizeLineType, parseAmount, parseBankCsv, parseCsv, parseDate } from '../parse.ts';

const ctx: any = {};

describe('bank CSV parsing', () => {
  it('quoted cells, "" escapes, BOM, CRLF', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });
  it('dates, amounts and line types', () => {
    expect(parseDate('2026-10-20')).toBe('2026-10-20');
    expect(parseDate('20/10/2026')).toBe('2026-10-20');
    expect(parseDate('5.9.2026')).toBe('2026-09-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseAmount('14,500')).toBe(14500);
    expect(parseAmount('-14,500.50')).toBe(-14500.5);
    expect(parseAmount('₪ 7,250')).toBe(7250);
    expect(parseAmount('12a')).toBeNull();
    expect(normalizeLineType("צ'ק חוזר")).toBe('צ׳ק חוזר');
    expect(normalizeLineType('')).toBe('העברה');
    expect(normalizeLineType('cheque')).toBeNull();
  });
  it('header in any order and case; per-row Hebrew errors with 1-based row numbers', () => {
    const csv = [
      'LineType,payerName,AMOUNT,valueDate,bankAccount,reference',
      'העברה,אלון,"1,000",2026-10-20,TEST-ACC-1,r1',
      "צ'ק,גל,-500,20/10/2026,TEST-ACC-1,r2",
      'הפקדה,x,10,2026-10-20,TEST-ACC-1,r3',
      'העברה,y,abc,2026-13-01,TEST-ACC-1,r4',
    ].join('\n');
    const r = parseBankCsv(csv);
    expect(r.fileError).toBeNull();
    expect(r.rowsRead).toBe(4);
    expect(r.rows.map((x) => [x.row, x.amount, x.lineType, x.valueDate])).toEqual([
      [1, 1000, 'העברה', '2026-10-20'],
      [2, -500, 'צ׳ק', '2026-10-20'], // negative cheque stays צ׳ק – a bounce must be stated
    ]);
    expect(r.rowErrors.map((e) => e.row)).toEqual([3, 4]);
    expect(r.rowErrors[0].error).toBe('שורה 3: סוג שורה לא מוכר "הפקדה" (העברה, צ׳ק, צ׳ק חוזר, אחר)');
    expect(r.rowErrors[1].error).toContain('שורה 4: תאריך ערך לא תקין');
    expect(r.rowErrors[1].error).toContain('סכום לא תקין "abc"');
  });
  it('wrong header is a file error', () => {
    expect(parseBankCsv('date,amount\n2026-10-20,5').fileError).toContain('חסרות עמודות: valueDate, payerName, reference, bankAccount, lineType');
  });
  it('bankLineId is deterministic and separates identical rows by occurrence', () => {
    const r = parseBankCsv('valueDate,amount,payerName,reference,bankAccount,lineType\n2026-10-20,5,a,,ACC9,\n2026-10-20,5,a,,ACC9,\n');
    const ids = bankLineIdsFor(r.rows);
    expect(ids[0]).not.toBe(ids[1]);
    expect(bankLineIdsFor(r.rows)).toEqual(ids);
    expect(ids[0]).toMatch(/^BL-ACC9-2026-10-20-[0-9a-f]{10}$/);
  });
});

describe('ImportPriorityFile (Iteration 9: bank files moved to the receipts screen)', () => {
  it('kind קובץ בנק points to the receipts screen and writes nothing (also with dryRun false)', async () => {
    const fake = new FakeBlocks();
    current = fake.client();
    const csv = 'valueDate,amount,payerName,reference,bankAccount,lineType\n2026-10-20,1200,לקוח,ref,1234567,\n';
    const r = await invoke({ kind: 'קובץ בנק', fileName: 'mizrahi.csv', csvText: csv, dryRun: false, uploadedBy: 'רינה' }, ctx);
    expect(r.errors).toEqual(['קובץ בנק מועלה עכשיו במסך תקבולים (/collections/receipts)']);
    expect(r.writeVerified).toBe(false);
    expect(r.toWrite).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it('the other kinds are kept for the future and are not active yet; unknown kinds are refused', async () => {
    current = new FakeBlocks().client();
    expect((await invoke({ kind: 'חשבוניות פתוחות', fileName: 'x.csv', csvText: 'a' }, ctx)).errors).toEqual(['סוג הקובץ חשבוניות פתוחות עדיין לא פעיל']);
    expect((await invoke({ kind: 'אחר', fileName: 'x.csv', csvText: 'a' }, ctx)).errors).toEqual(['סוג קובץ לא מוכר: "אחר"']);
  });
});
