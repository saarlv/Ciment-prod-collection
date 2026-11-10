// Parsing of the temporary Ciment bank CSV (pure). Header: valueDate,amount,payerName,reference,
// bankAccount,lineType – order free, case-insensitive, BOM stripped, cells trimmed.
import { createHash } from 'node:crypto';
import { isValidDate } from '../shared/collections-dates.ts';
import { round2, str } from '../shared/collections-data.ts';
import { LINE_TYPES } from '../shared/collections-matching.ts';

export const EXPECTED_COLUMNS = ['valueDate', 'amount', 'payerName', 'reference', 'bankAccount', 'lineType'];

/** RFC 4180 style: quoted cells may hold commas, newlines and "" escapes. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

/** YYYY-MM-DD, DD/MM/YYYY or D.M.YYYY (also D/M/YYYY, DD.MM.YYYY) → YYYY-MM-DD, else null. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (mt) [y, m, d] = [+mt[1], +mt[2], +mt[3]];
  else {
    mt = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
    if (!mt) return null;
    [d, m, y] = [+mt[1], +mt[2], +mt[3]];
  }
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidDate(iso) ? iso : null;
}

/** "14,500", "-14,500.00", "₪ 7,250", "7250 ש״ח" → number, else null. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/₪|ש״ח|ש"ח|ILS|NIS/gi, '').replace(/\s/g, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (!/^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return round2(neg ? -n : n);
}

/** ASCII / typographic apostrophes → geresh; empty → העברה; unknown → null. */
export function normalizeLineType(raw: string): string | null {
  const s = raw.trim().replace(/['’‘`]/g, '׳').replace(/\s+/g, ' ');
  if (!s) return 'העברה';
  return LINE_TYPES.includes(s) ? s : null;
}

export interface ParsedRow {
  row: number;
  valueDate: string;
  amount: number;
  payerName: string;
  reference: string;
  bankAccount: string;
  lineType: string;
}

export interface ParseResult {
  fileError: string | null;
  rows: ParsedRow[];
  rowErrors: { row: number; error: string }[];
  rowsRead: number;
}

export function parseBankCsv(text: string): ParseResult {
  const all = parseCsv(str(text)).filter((r) => r.some((c) => c !== ''));
  if (!all.length) return { fileError: 'הקובץ ריק', rows: [], rowErrors: [], rowsRead: 0 };
  const header = all[0].map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const col of EXPECTED_COLUMNS) idx[col] = header.indexOf(col.toLowerCase());
  const missing = EXPECTED_COLUMNS.filter((c) => idx[c] < 0);
  const extra = header.filter((h) => h && !EXPECTED_COLUMNS.some((c) => c.toLowerCase() === h));
  const dup = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (missing.length || extra.length || dup.length) {
    const parts = [
      missing.length ? `חסרות עמודות: ${missing.join(', ')}` : '',
      extra.length ? `עמודות לא מוכרות: ${extra.join(', ')}` : '',
      dup.length ? `עמודות כפולות: ${[...new Set(dup)].join(', ')}` : '',
    ].filter(Boolean);
    return {
      fileError: `שורת הכותרת אינה בפורמט קובץ הבנק (${EXPECTED_COLUMNS.join(',')}): ${parts.join('; ')}`,
      rows: [],
      rowErrors: [],
      rowsRead: all.length - 1,
    };
  }
  const rows: ParsedRow[] = [];
  const rowErrors: { row: number; error: string }[] = [];
  all.slice(1).forEach((cells, i) => {
    const row = i + 1;
    const get = (c: string) => str(cells[idx[c]]).trim();
    const problems: string[] = [];
    if (cells.length > header.length && cells.slice(header.length).some((c) => c !== '')) {
      problems.push(`יש ${cells.length} תאים במקום ${header.length} (פסיק בתוך ערך בלי מרכאות?)`);
    }
    const valueDate = parseDate(get('valueDate'));
    if (!valueDate) problems.push(`תאריך ערך לא תקין "${get('valueDate')}" (YYYY-MM-DD, DD/MM/YYYY או D.M.YYYY)`);
    const amount = parseAmount(get('amount'));
    if (amount === null) problems.push(`סכום לא תקין "${get('amount')}"`);
    else if (amount === 0) problems.push('סכום 0');
    const bankAccount = get('bankAccount');
    if (!bankAccount) problems.push('חסר חשבון בנק (bankAccount)');
    const lineType = normalizeLineType(get('lineType'));
    if (!lineType) problems.push(`סוג שורה לא מוכר "${get('lineType')}" (העברה, צ׳ק, צ׳ק חוזר, אחר)`);
    if (problems.length) {
      rowErrors.push({ row, error: `שורה ${row}: ${problems.join('; ')}` });
      return;
    }
    rows.push({ row, valueDate: valueDate!, amount: amount!, payerName: get('payerName'), reference: get('reference'), bankAccount, lineType: lineType! });
  });
  return { fileError: null, rows, rowErrors, rowsRead: all.length - 1 };
}

export const isTestAccount = (account: string) => account.startsWith('TEST-');

/**
 * Deterministic bankLineId from the row content and its occurrence index among identical rows of the
 * file, so re-importing the same file finds the same ids.
 */
export function bankLineIdsFor(rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [r.bankAccount, r.valueDate, r.amount.toFixed(2), r.payerName.normalize('NFC'), r.reference.normalize('NFC')].join('|');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const hash = createHash('sha256').update(`${base}|${n}`).digest('hex').slice(0, 10);
    const test = isTestAccount(r.bankAccount);
    const account = (test ? r.bankAccount.slice('TEST-'.length) : r.bankAccount).replace(/[^0-9A-Za-z-]/g, '');
    return `${test ? 'TEST-BL-' : 'BL-'}${account}-${r.valueDate}-${hash}`;
  });
}
