/**
 * The aging control panel's client-side logic: the note type chips (still used by the receipts screens), chip tones,
 * buckets, and the aging report's saved view (customers, month focus, columns, filters, sort, zoom). The report's own
 * rows and filters live in AgingMonths.ts. Nothing calls the platform.
 */
import type { AgingCell, AgingCellKey, AgingCustomer, AgingInvoice, AgingNote, AgingTotals } from '@/utils/CollectionsTypes';
import { round2 } from '@/utils/Format';

/* ------------------------------------------------------------------------------------------------ */
/* Note types and their fields                                                                       */
/* ------------------------------------------------------------------------------------------------ */

/** The three typed notes of the old note form; every other type shows as a general note. */
export const FORM_NOTE_TYPES = ['הבטחת תשלום', 'שולם לטענת הלקוח', 'בבירור – מחלוקת'] as const;
export type FormNoteType = (typeof FORM_NOTE_TYPES)[number];

/** A note as the screens show it: one of the form types, or a general note (הערה, and every retired type). */
export const NOTE_TYPES = [...FORM_NOTE_TYPES, 'הערה'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

/** What the UI calls each type. The stored value of בירור stays "בבירור – מחלוקת". */
export const NOTE_LABEL: Record<NoteType, string> = {
  'הבטחת תשלום': 'הבטחת תשלום',
  'שולם לטענת הלקוח': 'שולם לטענת הלקוח',
  'בבירור – מחלוקת': 'בירור',
  הערה: 'הערה כללית',
};

export function isFormNoteType(v: unknown): v is FormNoteType {
  return typeof v === 'string' && (FORM_NOTE_TYPES as readonly string[]).includes(v);
}

/** A note's type as shown: a form type, or הערה (general) for free notes, empty types and retired types. */
export function noteTypeOf(note?: AgingNote | null): NoteType {
  const t = note?.noteType?.trim();
  return isFormNoteType(t) ? t : 'הערה';
}

/** The label of a stored note type (e.g. "בבירור – מחלוקת" → "בירור", "ממתין לזיכוי" → "הערה כללית"). */
export function noteLabel(type?: string | null): string {
  return NOTE_LABEL[isFormNoteType(type?.trim()) ? (type?.trim() as FormNoteType) : 'הערה'];
}

/* ------------------------------------------------------------------------------------------------ */
/* Chips                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

export type ChipTone = 'none' | 'info' | 'done' | 'warning' | 'follow' | 'quiet' | 'critical';

export const TYPE_TONE: Record<NoteType, ChipTone> = {
  'הבטחת תשלום': 'info',
  'שולם לטענת הלקוח': 'done',
  'בבירור – מחלוקת': 'warning',
  הערה: 'quiet',
};

/** The tone of a stored note type (retired types are general notes). */
export function noteTone(type?: string | null): ChipTone {
  return TYPE_TONE[isFormNoteType(type?.trim()) ? (type?.trim() as FormNoteType) : 'הערה'];
}

/** Chip colours: soft tints with dark ink (≥4.5:1 on glass); no note = plain outline. */
export const TONE_CLASS: Record<ChipTone, string> = {
  none: 'border-border bg-glass-card text-ink-2',
  info: 'border-transparent bg-primary/12 text-link',
  done: 'border-transparent bg-success-soft text-success-ink',
  warning: 'border-transparent bg-warning-soft text-warning-ink',
  follow: 'border-transparent bg-secondary text-secondary-foreground',
  quiet: 'border-transparent bg-glass-inner text-ink-2',
  critical: 'border-transparent bg-critical-soft text-critical-ink',
};

/** The unallocated part of one of our receipts, shown in the report as a negative entry (BuildAgingReport). */
export const UNMATCHED_RECEIPT = 'קבלה לא מותאמת';

export function isUnmatchedReceipt(inv: AgingInvoice): boolean {
  return inv.kind === UNMATCHED_RECEIPT || inv.documentType === UNMATCHED_RECEIPT;
}

/** Partly paid by our receipts: still in the report, with what is left. */
export function isPartlyPaid(inv: AgingInvoice): boolean {
  return inv.paymentStatus === 'שולמה חלקית';
}

/** Credit notes (negative open amount or a זיכוי document) show as a minus chip. */
export function isCredit(inv: AgingInvoice): boolean {
  return (inv.openAmount ?? 0) < 0 || (inv.documentType ?? '').includes('זיכוי');
}

/* ------------------------------------------------------------------------------------------------ */
/* Cells and buckets                                                                                  */
/* ------------------------------------------------------------------------------------------------ */

export const PRIOR_KEY = 'חוב קודם';
export const LATER_KEY = 'חוב מאוחר';

export interface Bucket {
  key: AgingCellKey;
  label: string;
  kind: 'prior' | 'month' | 'later';
}

export function bucketsOf(months: { monthKey?: string; label?: string }[]): Bucket[] {
  return [
    { key: 'prior', label: PRIOR_KEY, kind: 'prior' },
    ...months.filter((m) => !!m.monthKey).map((m) => ({ key: m.monthKey as string, label: m.label ?? (m.monthKey as string), kind: 'month' as const })),
    { key: 'later', label: LATER_KEY, kind: 'later' },
  ];
}

export function cellAt(customer: AgingCustomer, key: AgingCellKey): AgingCell | undefined {
  if (key === 'prior') return customer.priorDebt;
  if (key === 'later') return customer.laterDebt;
  return customer.months?.find((m) => m.monthKey === key);
}

/** Every open invoice of the customer with its cell (prior, window months, later — once each). */
export function invoicesOf(customer: AgingCustomer): { inv: AgingInvoice; cell: AgingCell; key: AgingCellKey }[] {
  const out: { inv: AgingInvoice; cell: AgingCell; key: AgingCellKey }[] = [];
  const add = (cell: AgingCell | undefined, key: AgingCellKey) => {
    if (cell) for (const inv of cell.invoices ?? []) out.push({ inv, cell, key });
  };
  add(customer.priorDebt, 'prior');
  for (const m of customer.months ?? []) if (m.monthKey) add(m, m.monthKey);
  add(customer.laterDebt, 'later');
  return out;
}

/* ------------------------------------------------------------------------------------------------ */
/* The saved view                                                                                     */
/* ------------------------------------------------------------------------------------------------ */

/** The report's filters (Design 02 section 7); the logic is customerFlags in AgingMonths.ts. */
export type FilterKey = 'withNotes' | 'unnotedPast' | 'openPromises' | 'broken';
export const FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'withNotes', label: 'רק עם הערות' },
  { value: 'unnotedPast', label: 'בפיגור בלי הערה' },
  { value: 'openPromises', label: 'התחייבויות פתוחות' },
  { value: 'broken', label: 'התחייבויות שלא קוימו' },
];

export type SortKey = 'total' | 'name' | 'prior' | 'overdue';
export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'total', label: 'סה״כ חוב' },
  { value: 'overdue', label: 'חוב בפיגור' },
  { value: 'prior', label: 'חוב קודם' },
  { value: 'name', label: 'שם לקוח' },
];

export interface AgingColumns {
  /** סטטוס, הערה לגבייה, אמצעי תשלום, תנאי תשלום (Yaniv's example). */
  details: boolean;
  agent: boolean;
  contact: boolean;
  notes: boolean;
}

/** Table zoom: a percentage (50–150, step 10) or 'fit' = as large as fits the width without side-scrolling. */
export type ZoomSetting = number | 'fit';
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 150;
export const ZOOM_STEP = 10;

export function clampZoom(pct: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(pct)));
}

/** One step in or out from the zoom in effect (a fitted 73% steps to 80% / 70%). */
export function stepZoom(current: number, dir: 1 | -1): number {
  const next = dir > 0 ? Math.floor(current / ZOOM_STEP) * ZOOM_STEP + ZOOM_STEP : Math.ceil(current / ZOOM_STEP) * ZOOM_STEP - ZOOM_STEP;
  return clampZoom(next);
}

function parseZoom(raw: unknown, fallback: ZoomSetting): ZoomSetting {
  if (raw === 'fit') return 'fit';
  return typeof raw === 'number' && Number.isFinite(raw) ? clampZoom(raw) : fallback;
}

export interface AgingView {
  /** Customer codes to show; empty = all. */
  customers: string[];
  /** 'all', 'prior', 'later' or a window month YYYY-MM. */
  focus: string;
  columns: AgingColumns;
  filters: FilterKey[];
  sort: SortKey;
  /** Zoom of the table on the page. */
  zoom: ZoomSetting;
  /** Zoom of the table in full screen (fits the width by default). */
  fullZoom: ZoomSetting;
}

export const DEFAULT_VIEW: AgingView = {
  customers: [],
  focus: 'all',
  columns: { details: true, agent: true, contact: true, notes: true },
  filters: [],
  sort: 'total',
  zoom: 100,
  fullZoom: 'fit',
};

/** A view read back from storage; anything unexpected falls back to the default. */
export function parseView(raw: unknown): AgingView {
  if (!raw || typeof raw !== 'object') return DEFAULT_VIEW;
  const r = raw as Record<string, unknown>;
  const cols = (r.columns && typeof r.columns === 'object' ? r.columns : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const filterKeys = FILTERS.map((f) => f.value);
  return {
    customers: Array.isArray(r.customers) ? r.customers.filter((c): c is string => typeof c === 'string') : [],
    focus: typeof r.focus === 'string' && r.focus ? r.focus : 'all',
    columns: { details: bool(cols.details, true), agent: bool(cols.agent, true), contact: bool(cols.contact, true), notes: bool(cols.notes, true) },
    filters: Array.isArray(r.filters) ? r.filters.filter((f): f is FilterKey => filterKeys.includes(f as FilterKey)) : [],
    sort: SORTS.some((s) => s.value === r.sort) ? (r.sort as SortKey) : 'total',
    zoom: parseZoom(r.zoom, DEFAULT_VIEW.zoom),
    fullZoom: parseZoom(r.fullZoom, DEFAULT_VIEW.fullZoom),
  };
}

/** Whether the rows shown are the default ones (zoom is a display setting and does not count). */
export function isDefaultView(v: AgingView): boolean {
  return (
    v.customers.length === 0 &&
    v.focus === 'all' &&
    v.filters.length === 0 &&
    v.sort === 'total' &&
    v.columns.details &&
    v.columns.agent &&
    v.columns.contact &&
    v.columns.notes
  );
}

/** Totals of the rows on screen (used when a filter hides rows, so the footer matches what is shown). */
export function sumTotals(customers: AgingCustomer[], monthKeys: string[]): AgingTotals {
  const months = monthKeys.map((k) => ({
    monthKey: k,
    amount: round2(customers.reduce((s, c) => s + (c.months?.find((m) => m.monthKey === k)?.amount ?? 0), 0)),
  }));
  return {
    priorDebt: round2(customers.reduce((s, c) => s + (c.priorDebt?.amount ?? 0), 0)),
    months,
    laterDebt: round2(customers.reduce((s, c) => s + (c.laterDebt?.amount ?? 0), 0)),
    total: round2(customers.reduce((s, c) => s + (c.total ?? 0), 0)),
    customers: customers.length,
  };
}