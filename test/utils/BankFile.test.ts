import { describe, expect, it } from 'vitest';
import { bankFileKind, bankFileType, isAcceptedBankFile, sheetTextFromBuffer, sheetsFromBuffer } from '@/utils/BankFile';

describe('bank file kinds', () => {
  it('tells PDF, image and spreadsheet apart by type or name', () => {
    expect(bankFileKind('statement.pdf', '')).toBe('pdf');
    expect(bankFileKind('scan.jpg', 'image/jpeg')).toBe('image');
    expect(bankFileKind('bank.xlsx', '')).toBe('sheet');
    expect(bankFileKind('bank.csv', 'text/csv')).toBe('sheet');
    expect(bankFileKind('notes.docx', 'application/msword')).toBe('other');
  });

  it('accepts only bank-file formats and types untyped files', () => {
    expect(isAcceptedBankFile({ name: 'a.docx', type: '' })).toBe(false);
    expect(isAcceptedBankFile({ name: 'a.xls', type: '' })).toBe(true);
    expect(bankFileType({ name: 'a.csv', type: '' })).toBe('text/csv');
  });
});

describe('spreadsheets as text for the reader', () => {
  it('keeps every CSV cell, quoted fields included, without the BOM', () => {
    const csv = '﻿valueDate,amount,payerName\r\n2026-10-22,"17,424",אבי ובניו\r\n';
    const buf = new TextEncoder().encode(csv).buffer;
    const rows = sheetsFromBuffer(buf, 'bank.csv', 'text/csv')[0].rows;
    expect(rows[0]).toEqual(['valueDate', 'amount', 'payerName']);
    expect(rows[1]).toEqual(['2026-10-22', '17,424', 'אבי ובניו']);
    expect(sheetTextFromBuffer(buf, 'bank.csv', 'text/csv')).toContain('"17,424"');
  });
});