import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * Bank files on the receipts screen: what kind of file it is, the URL the browser can open (platform
 * file links need the session token, as the PDF viewer does), and spreadsheets as rows / text.
 */

export type BankFileKind = 'pdf' | 'image' | 'sheet' | 'other';

const SHEET_EXT = /\.(csv|xlsx|xls)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i;

export function bankFileKind(fileName?: string | null, fileType?: string | null): BankFileKind {
  const name = fileName ?? '';
  const type = (fileType ?? '').toLowerCase();
  if (type.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf';
  if (type.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (type.includes('csv') || type.includes('spreadsheet') || type.includes('excel') || SHEET_EXT.test(name)) return 'sheet';
  return 'other';
}

/** The file types the upload card accepts. */
export const BANK_FILE_ACCEPT = '.pdf,.xlsx,.xls,.csv,application/pdf,text/csv,image/*';

export function isAcceptedBankFile(file: { name: string; type: string }): boolean {
  return bankFileKind(file.name, file.type) !== 'other';
}

/** A MIME type for files the browser left untyped (some CSV / Excel files). */
export function bankFileType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  if (/\.csv$/i.test(file.name)) return 'text/csv';
  if (/\.xlsx$/i.test(file.name)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (/\.xls$/i.test(file.name)) return 'application/vnd.ms-excel';
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  return 'application/octet-stream';
}

const FILE_DATA_BLOCK = /api\/blocks\/fileDataBlock\/[^/]+\/redirect/;

/** Platform file links open only with the session token (the same rule the PDF viewer applies). */
export function openableFileUrl(url: string): string {
  if (!FILE_DATA_BLOCK.test(url)) return url;
  let token = window.localStorage.getItem('token');
  const appId = (window as Window & { appId?: string }).appId;
  if (appId) token = window.localStorage.getItem(`token-${appId}`) ?? token;
  return token ? `${url}${url.includes('?') ? '&' : '?'}token=${token}` : url;
}

function isCsv(fileName?: string | null, fileType?: string | null): boolean {
  return (fileType ?? '').toLowerCase().includes('csv') || /\.csv$/i.test(fileName ?? '');
}

function stripBom(text: string): string {
  return text.replace(/^﻿/, '');
}

/** Every sheet of a spreadsheet as rows of cell text (CSV: one sheet). */
export function sheetsFromBuffer(buf: ArrayBuffer, fileName?: string | null, fileType?: string | null): { name: string; rows: string[][] }[] {
  if (isCsv(fileName, fileType)) {
    const text = stripBom(new TextDecoder('utf-8').decode(buf));
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    return [{ name: fileName ?? 'CSV', rows: parsed.data.map((r) => r.map((c) => String(c ?? ''))) }];
  }
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: true, defval: '', raw: false }).map((r) =>
      r.map((c) => String(c ?? '')),
    ),
  }));
}

/** The spreadsheet as CSV text for the reader, so it sees every cell (sheets after the first are labelled). */
export function sheetTextFromBuffer(buf: ArrayBuffer, fileName?: string | null, fileType?: string | null): string {
  const sheets = sheetsFromBuffer(buf, fileName, fileType);
  return sheets
    .map((s, i) => {
      const csv = Papa.unparse(s.rows);
      return sheets.length > 1 || i > 0 ? `# גיליון: ${s.name}\n${csv}` : csv;
    })
    .join('\n\n');
}

/** Downloads an uploaded spreadsheet and renders it as text for a re-read. */
export async function sheetTextFromUrl(url: string, fileName?: string | null, fileType?: string | null): Promise<string> {
  const res = await fetch(openableFileUrl(url));
  if (!res.ok) throw new Error(`לא הצלחנו להוריד את הקובץ (${res.status})`);
  return sheetTextFromBuffer(await res.arrayBuffer(), fileName, fileType);
}