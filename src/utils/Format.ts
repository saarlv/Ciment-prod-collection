const ilsFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('he-IL', {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const monthFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const EMPTY = '—';

export function formatILS(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY;
  return ilsFormatter.format(value);
}

export function formatNumber(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY;
  return numberFormatter.format(value);
}

export function formatPct(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY;
  return `${Math.round(value)}%`;
}

/** Parses a bare `YYYY-MM-DD` date column into a UTC-midnight timestamp (no timezone shift). */
function dateOnlyToUtc(value: string): number | null {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

/** Formats a `date` column (bare wall-clock date). */
export function formatDate(value?: string | null): string {
  if (!value) return EMPTY;
  const ts = dateOnlyToUtc(value);
  return ts === null ? EMPTY : dateFormatter.format(ts);
}

/** Formats a `datetime` column (UTC ISO instant) in the viewer's local time. */
export function formatDateTime(value?: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? EMPTY : dateTimeFormatter.format(d);
}

/** Formats a `YYYY-MM` month key as a Hebrew month label. */
export function formatMonth(value?: string | null): string {
  if (!value) return 'ללא חודש פירעון';
  const ts = dateOnlyToUtc(`${value.slice(0, 7)}-01`);
  return ts === null ? value : monthFormatter.format(ts);
}

/** Today's date in Israel as `YYYY-MM-DD`. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

/** Whole days from a `date` column until today (positive = overdue). */
export function daysOverdue(value?: string | null): number | null {
  if (!value) return null;
  const due = dateOnlyToUtc(value);
  const today = dateOnlyToUtc(todayISO());
  if (due === null || today === null) return null;
  return Math.round((today - due) / 86_400_000);
}

/** Month keys (`YYYY-MM`) from `back` months ago to `forward` months ahead. */
export function monthRange(back: number, forward: number): string[] {
  const [y, m] = todayISO().split('-').map(Number);
  const keys: string[] = [];
  for (let i = -back; i <= forward; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** Today in Israel, long form — e.g. "יום ראשון, 18 באוקטובר 2026". */
export function formatHebrewToday(): string {
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date());
}

const HE_WEEKDAY_LETTER: Record<string, string> = {
  Sun: 'א׳',
  Mon: 'ב׳',
  Tue: 'ג׳',
  Wed: 'ד׳',
  Thu: 'ה׳',
  Fri: 'ו׳',
  Sat: 'ש׳',
};

/** Today in Israel, short form for the top bar — e.g. "יום א׳ · 18.10". */
export function formatShortHebrewToday(): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date());
  const [, month, day] = todayISO().split('-');
  return `יום ${HE_WEEKDAY_LETTER[weekday] ?? ''} · ${Number(day)}.${month}`;
}
/** A `date` column as "יום ג׳ 20.10" — the weekday letter and day.month. */
export function formatDayLabel(value?: string | null): string {
  if (!value) return EMPTY;
  const ts = dateOnlyToUtc(value);
  if (ts === null) return EMPTY;
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(ts);
  const [, month, day] = value.slice(0, 10).split('-');
  return `יום ${HE_WEEKDAY_LETTER[weekday] ?? ''} ${Number(day)}.${month}`;
}

/** A `datetime` (UTC ISO) as the time of day in Israel — "07:45". */
export function formatTime(value?: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(d);
}

/** The Israel calendar date (`YYYY-MM-DD`) of a `datetime` (UTC ISO) value. */
export function israelDateOf(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
}

/** UTC ISO instant of midnight in Israel at the start of a `YYYY-MM-DD` date — for `datetime >=` filters. */
export function israelDayStartISO(date: string): string {
  const noonUtc = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset' })
    .formatToParts(noonUtc)
    .find((p) => p.type === 'timeZoneName')?.value;
  const hours = Number(offset?.replace('GMT', '') || 0);
  return new Date(Date.UTC(noonUtc.getUTCFullYear(), noonUtc.getUTCMonth(), noonUtc.getUTCDate()) - hours * 3_600_000).toISOString();
}

/** `YYYY-MM-DD` shifted by whole days (calendar math only, no timezone). */
export function addDays(date: string, days: number): string {
  const ts = dateOnlyToUtc(date);
  if (ts === null) return date;
  return new Date(ts + days * 86_400_000).toISOString().slice(0, 10);
}

/** `YYYY-MM` shifted by whole months. */
export function addMonths(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Day of week of a `YYYY-MM-DD` date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  const ts = dateOnlyToUtc(date);
  return ts === null ? 0 : new Date(ts).getUTCDay();
}

/** Previous business day in Israel (Sun–Thu): on Sunday it is Thursday. */
export function previousBusinessDay(date: string): string {
  const back: Record<number, number> = { 0: 3, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2 };
  return addDays(date, -(back[weekdayOf(date)] ?? 1));
}

/** Capitalizes the first letter of each word — "saar cohen" → "Saar Cohen". Hebrew is unaffected. */
export function capitalizeName(value?: string | null): string {
  if (!value) return '';
  return value
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1))
    .join(' ');
}

const GEMATRIA: [number, string][] = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
  [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'],
  [3, 'ג'], [2, 'ב'], [1, 'א'],
];

/** Number → Hebrew letters with geresh/gershayim — 7 → "ז׳", 15 → "ט״ו", 787 → "תשפ״ז". */
export function toGematria(value: number): string {
  let n = value % 1000;
  let out = '';
  for (const [v, l] of GEMATRIA) {
    while (n >= v) {
      if (n === 15 || n === 16) {
        out += n === 15 ? 'טו' : 'טז';
        n = 0;
        break;
      }
      out += l;
      n -= v;
    }
  }
  return out.length === 1 ? `${out}׳` : `${out.slice(0, -1)}״${out.slice(-1)}`;
}

function normalizeHebrewMonth(name: string): string {
  return name
    .replace(/['’]/g, '׳')
    .replace(/^חשון$/, 'חשוון')
    .replace(/^מרחשוון$|^מרחשון$/, 'חשוון')
    .replace(/^סיון$/, 'סיוון')
    .trim();
}

/** Today's Hebrew-calendar date in classic gematria — e.g. "ז׳ בחשוון תשפ״ז". */
export function formatHebrewCalendarToday(): string {
  const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = Number(get('day'));
  const year = Number(get('year'));
  const month = normalizeHebrewMonth(get('month'));
  if (!day || !year || !month) return '';
  return `${toGematria(day)} ב${month} ${toGematria(year)}`;
}
/** A `date` column as day.month without leading zeros — "30.9". */
export function formatDayMonth(value?: string | null): string {
  if (!value) return EMPTY;
  const [, month, day] = value.slice(0, 10).split('-');
  if (!month || !day) return EMPTY;
  return `${Number(day)}.${Number(month)}`;
}

/** Rounds money to agorot so float sums compare cleanly. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
/** True for shekel rows: Priority leaves currencyCode empty or 'ILS' for local currency. */
export function isILS(currencyCode?: string | null): boolean {
  return !currencyCode || currencyCode.toUpperCase() === 'ILS' || currencyCode === 'ש"ח' || currencyCode === 'ש״ח';
}

/** Formats an amount in its own currency (ILS when empty); unknown codes fall back to "<amount> <code>". */
export function formatMoney(value?: number | null, currencyCode?: string | null): string {
  if (isILS(currencyCode)) return formatILS(value);
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY;
  const code = (currencyCode ?? '').trim().toUpperCase();
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${numberFormatter.format(value)} ${code}`;
  }
}

/** "בנוסף: $19,200 · €3,000" for non-ILS amounts kept out of shekel totals; empty string when none. */
export function formatForeignExtra(rows: { amount?: number | null; currencyCode?: string | null }[]): string {
  const byCur = new Map<string, number>();
  for (const r of rows) {
    if (isILS(r.currencyCode)) continue;
    const code = (r.currencyCode ?? '').trim().toUpperCase();
    byCur.set(code, (byCur.get(code) ?? 0) + (r.amount ?? 0));
  }
  if (byCur.size === 0) return '';
  return `בנוסף: ${[...byCur].map(([c, v]) => formatMoney(v, c)).join(' · ')}`;
}

/** Priority document statuses hidden from invoice lists by default. */
export const HIDDEN_DOC_STATUSES = ['מבוטלת', 'טיוטא'];