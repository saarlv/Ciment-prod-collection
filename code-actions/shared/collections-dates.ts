// Date helpers for Ciment Collections. All "dates" are Israel calendar dates as YYYY-MM-DD strings.
// Arithmetic is done in UTC on the calendar date so it never drifts with the server timezone.
// Business days are Sunday–Thursday (Friday/Saturday are not); holidays are ignored.

export const TZ = 'Asia/Jerusalem';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

export const HEBREW_DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** True when s is a real calendar date in YYYY-MM-DD form. */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Israel calendar date of an instant. */
export function israelDateOfInstant(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export const israelToday = (): string => israelDateOfInstant(new Date());

/** asOfDate input if valid, else today in Israel. Throws on a malformed value. */
export function resolveAsOf(input: unknown): string {
  if (input === undefined || input === null || input === '') return israelToday();
  const s = String(input).slice(0, 10);
  if (!isValidDate(s)) throw new Error(`asOfDate must be YYYY-MM-DD, got "${String(input)}"`);
  return s;
}

/**
 * Normalises a stored value to an Israel calendar date.
 * - plain YYYY-MM-DD → as is
 * - "YYYY-MM-DDT00:00:00(.000)Z" (date columns serialised as midnight UTC) → its date part
 * - any other datetime → the Israel calendar date of that instant
 */
export function toIsraelDate(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return israelDateOfInstant(v);
  const s = String(v);
  if (DATE_RE.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z$/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (Number.isNaN(t)) return DATE_RE.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
  return israelDateOfInstant(new Date(t));
}

const parts = (s: string) => {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date "${s}"`);
  return { y: +m[1], m: +m[2], d: +m[3] };
};
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(s: string, n: number): string {
  const { y, m, d } = parts(s);
  return fromUtc(new Date(Date.UTC(y, m - 1, d + n)));
}

export function diffDays(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(s: string): number {
  const { y, m, d } = parts(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isBusinessDay = (s: string) => weekday(s) <= 4;

/** n-th business day strictly before s (n=1 → previous business day). */
export function businessDaysBefore(s: string, n: number): string {
  let cur = s;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, -1);
    if (isBusinessDay(cur)) left -= 1;
  }
  return cur;
}

export const previousBusinessDay = (s: string) => businessDaysBefore(s, 1);

/** First business day strictly after s. */
export function nextBusinessDay(s: string): string {
  let cur = addDays(s, 1);
  while (!isBusinessDay(cur)) cur = addDays(cur, 1);
  return cur;
}

/** s itself when it is a business day, else the next one. */
export const businessDayOnOrAfter = (s: string) => (isBusinessDay(s) ? s : nextBusinessDay(s));

/** s itself when it is a business day, else the previous one. */
export const businessDayOnOrBefore = (s: string) => (isBusinessDay(s) ? s : previousBusinessDay(s));

// ---------- months ----------

export const monthKeyOf = (s: string) => s.slice(0, 7);

/** Month key at offset k from the month of s. */
export function monthOffset(s: string, k: number): string {
  const { y, m } = parts(s.length === 7 ? `${s}-01` : s);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 7);
}

export const firstOfMonth = (monthKey: string) => `${monthKey}-01`;

export function lastOfMonth(monthKey: string): string {
  const { y, m } = parts(`${monthKey}-01`);
  return fromUtc(new Date(Date.UTC(y, m, 0)));
}

export const dayOfMonth = (monthKey: string, day: number) => `${monthKey}-${String(day).padStart(2, '0')}`;

export function hebrewMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return `${HEBREW_MONTHS[Number(m) - 1]} ${y}`;
}

export const isMonthKey = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** dd.mm.yyyy */
export function formatDateHe(s: string): string {
  const { y, m, d } = parts(s);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/** dd.mm */
export function formatDayMonth(s: string): string {
  const { m, d } = parts(s);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

export const hebrewDayName = (s: string) => `יום ${HEBREW_DAY_LETTERS[weekday(s)]}`;

// ---------- Israel local time → UTC ----------

/** Offset of Asia/Jerusalem from UTC (minutes) at the given instant. */
function tzOffsetMinutes(instantMs: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(instantMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - instantMs) / 60000);
}

/** UTC ISO string for an Israel wall-clock time on date s (DST-aware). */
export function israelLocalToUtcIso(s: string, hour: number, minute = 0): string {
  const { y, m, d } = parts(s);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let off = tzOffsetMinutes(guess);
  let ms = guess - off * 60000;
  const off2 = tzOffsetMinutes(ms);
  if (off2 !== off) {
    off = off2;
    ms = guess - off * 60000;
  }
  return new Date(ms).toISOString();
}

/** Epoch ms used for sorting mixed date / datetime values (dates sort at Israel midnight). */
export function sortableTime(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v);
  if (DATE_RE.test(s)) return Date.parse(israelLocalToUtcIso(s, 0, 0));
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

/** d.m without leading zeros (30.9, 20.10) – the short form used in Hebrew reasoning text. */
export function formatShortDate(s: string): string {
  const { m, d } = parts(s);
  return `${d}.${m}`;
}
