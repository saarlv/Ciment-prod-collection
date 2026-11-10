// Text extraction for one attachment (FetchEmailAttachments only). Never throws: a failure is a state.
// - PDF with a text layer → the text (unpdf); no text layer (scan) → דורש OCR
// - Excel / CSV → every sheet as tab-separated lines (xlsx), each sheet under a "גיליון: <name>" line
// - image → דורש OCR (read by file name only)
// - plain text → the text
// - anything else → לא נתמך
import { extractText, getDocumentProxy } from 'unpdf';
import * as XLSX from 'xlsx';

export const K_PDF = 'PDF';
export const K_EXCEL = 'Excel';
export const K_CSV = 'CSV';
export const K_IMAGE = 'תמונה';
export const K_OTHER = 'אחר';

export const S_PENDING = 'ממתין';
export const S_DONE = 'חולץ';
export const S_OCR = 'דורש OCR';
export const S_UNSUPPORTED = 'לא נתמך';
export const S_FAILED = 'נכשל';

/** Stored text is capped here (the brief caps again, much lower). */
export const STORE_CAP = 200_000;
/** A PDF with fewer letters/digits than this is treated as a scan. */
const MIN_PDF_CHARS = 20;

const ext = (name: string) => (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] ?? '').toLowerCase();

export function fileKindOf(fileName: string, mimeType: string): string {
  const e = ext(fileName);
  const m = mimeType.toLowerCase();
  if (e === 'pdf' || m === 'application/pdf') return K_PDF;
  if (e === 'csv' || m === 'text/csv' || m === 'application/csv') return K_CSV;
  if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(e) || m.includes('spreadsheet') || m.includes('ms-excel')) return K_EXCEL;
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'webp'].includes(e)) return K_IMAGE;
  return K_OTHER;
}

const isPlainText = (fileName: string, mimeType: string) => ['txt', 'text'].includes(ext(fileName)) || mimeType.toLowerCase() === 'text/plain';

/** UTF-8 when the bytes are valid UTF-8, else Windows-1255 (Hebrew Excel exports). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    try {
      return new TextDecoder('windows-1255').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

function sheetsAsText(wb: XLSX.WorkBook): string {
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const tsv = XLSX.utils
      .sheet_to_csv(ws, { FS: '\t', blankrows: false })
      .split('\n')
      .map((l) => l.replace(/\t+$/, ''))
      .filter((l) => l.trim())
      .join('\n');
    if (tsv.trim()) parts.push(wb.SheetNames.length > 1 ? `גיליון: ${name}\n${tsv}` : tsv);
  }
  return parts.join('\n\n');
}

export interface Extraction {
  fileKind: string;
  extractionState: string;
  extractedText: string | null;
  extractionError: string | null;
}

export async function extractFile(bytes: Uint8Array, fileName: string, mimeType: string): Promise<Extraction> {
  const fileKind = fileKindOf(fileName, mimeType);
  const done = (text: string): Extraction => ({ fileKind, extractionState: S_DONE, extractedText: text.slice(0, STORE_CAP), extractionError: null });
  try {
    if (fileKind === K_PDF) {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });
      const clean = String(text ?? '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (clean.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_PDF_CHARS) {
        return { fileKind, extractionState: S_OCR, extractedText: null, extractionError: 'אין שכבת טקסט ב-PDF (כנראה סריקה)' };
      }
      return done(clean);
    }
    if (fileKind === K_CSV) {
      const wb = XLSX.read(decodeText(bytes), { type: 'string', raw: true });
      const text = sheetsAsText(wb);
      return text ? done(text) : { fileKind, extractionState: S_DONE, extractedText: '', extractionError: 'הקובץ ריק' };
    }
    if (fileKind === K_EXCEL) {
      const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
      const text = sheetsAsText(wb);
      return text ? done(text) : { fileKind, extractionState: S_DONE, extractedText: '', extractionError: 'הקובץ ריק' };
    }
    if (fileKind === K_IMAGE) {
      return { fileKind, extractionState: S_OCR, extractedText: null, extractionError: null };
    }
    if (isPlainText(fileName, mimeType)) return done(decodeText(bytes).trim());
    return { fileKind, extractionState: S_UNSUPPORTED, extractedText: null, extractionError: null };
  } catch (e: any) {
    return { fileKind, extractionState: S_FAILED, extractedText: null, extractionError: `חילוץ נכשל: ${e?.message ?? String(e)}` };
  }
}
