// Shared helpers for Disputes cases (2c missing delivery notes, 2d price gaps): readable case numbers,
// test-row detection, the demo clock, Israel date-time formatting, the bookkeeper's mailbox and the
// pending-draft lookup used to replace (never duplicate) a draft. Nothing here sends or writes to Priority.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { formatDateHe, israelDateOfInstant, israelLocalToUtcIso, isValidDate, TZ } from './collections-dates.ts';
import { isTestCode, readAll, str } from './collections-data.ts';

export const PENDING = 'ממתין';
export const CASE_CLOSED = 'נסגרה';
export const AGENT_MAYA = 'מאיה';

export const isTrue = (v: unknown) => v === true || v === 'true';

/** Test-data separation is retired (real Priority data only): nothing is treated as test data. Kept for callers. */
export const isTestCase = (_r: Item | null | undefined) => false;

/** Test-data separation is retired: no mirror row is treated as test data. Kept for callers. */
export const isTestMirror = (_r: Item | null | undefined) => false;

// ---------- case numbers ----------

/**
 * Readable unique case numbers: DSP-<yyyymmdd>-<n>, n continuing after the
 * highest number already used that day. `taken` is every disputeNumber in the table; it is updated so a
 * run that opens several cases never hands out the same number twice.
 */
export function allocateDisputeNumber(taken: Set<string>, _isTest: boolean, nowMs = Date.now()): string {
  const day = israelDateOfInstant(new Date(nowMs)).replace(/-/g, '');
  const prefix = `DSP-${day}-`;
  let max = 0;
  for (const n of taken) {
    if (!n.startsWith(prefix)) continue;
    const k = Number(n.slice(prefix.length));
    if (Number.isFinite(k) && k > max) max = k;
  }
  const number = `${prefix}${max + 1}`;
  taken.add(number);
  return number;
}

// ---------- clock ----------

/** Israel wall-clock parts of an instant. */
export function israelParts(ms: number) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: days.indexOf(p.weekday),
  };
}

export interface Clock {
  /** The instant the engine acts as of. */
  ms: number;
  iso: string;
  /** True when the clock is (within a minute of) the real now. */
  isNow: boolean;
  /** How the input was read, for the output. */
  basis: string;
}

/**
 * asOfDate → the engine clock.
 * - empty → now
 * - YYYY-MM-DD → that Israel date at the same Israel time-of-day as now (so "tomorrow" is exactly +24h)
 * - ISO date-time (with or without zone; without a zone it is read as UTC by Date.parse) → that instant
 * Throws a Hebrew error on anything else.
 */
export function resolveClock(raw: unknown, nowMs = Date.now()): Clock {
  const s = str(raw).trim();
  if (!s || s === 'undefined' || s === 'null') {
    return { ms: nowMs, iso: new Date(nowMs).toISOString(), isNow: true, basis: 'עכשיו' };
  }
  let ms: number;
  let basis: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (!isValidDate(s)) throw new Error(`asOfDate לא תקין: "${s}"`);
    const now = israelParts(nowMs);
    const base = Date.parse(israelLocalToUtcIso(s, now.hour, now.minute));
    ms = base + now.second * 1000 + (nowMs % 1000);
    basis = `${formatDateHe(s)} בשעה הנוכחית`;
  } else {
    ms = Date.parse(s);
    if (Number.isNaN(ms)) throw new Error(`asOfDate חייב להיות YYYY-MM-DD או תאריך-שעה ISO, התקבל "${s}"`);
    basis = 'תאריך-שעה שהתקבל';
  }
  return { ms, iso: new Date(ms).toISOString(), isNow: Math.abs(ms - nowMs) < 60_000, basis };
}

/** The DocumentChase window: Sunday–Thursday, 08:00–17:59 Israel time (cron 0 8-17 * * 0-4). */
export function inBusinessHours(ms: number): boolean {
  const p = israelParts(ms);
  return p.weekday >= 0 && p.weekday <= 4 && p.hour >= 8 && p.hour <= 17;
}

/** dd.mm.yyyy HH:MM in Israel time. */
export function formatIsraelDateTime(v: unknown): string {
  const ms = typeof v === 'number' ? v : Date.parse(str(v));
  if (!Number.isFinite(ms)) return '';
  const p = israelParts(ms);
  return `${formatDateHe(p.date)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

// ---------- people / mailboxes ----------

/** The bookkeeper's mailbox from TeamMembers (active, with an address), or null. */
export function mailboxOf(team: Item[], name: string): string | null {
  const n = str(name).trim();
  if (!n) return null;
  const m = team.find((t) => str(t.name).trim() === n && t.active !== false && /@/.test(str(t.email)));
  return m ? str(m.email).trim().toLowerCase() : null;
}

export async function readTeam(client: BlocksClient): Promise<Item[]> {
  try {
    return await readAll(client, 'TeamMembers');
  } catch {
    return [];
  }
}

/** The InboundEmails row with this messageId (Disputes / Approvals store the messageId), or null. */
export async function emailByMessageId(client: BlocksClient, messageId: string): Promise<Item | null> {
  const id = str(messageId).trim();
  if (!id) return null;
  const rows = await readAll(client, 'InboundEmails', { column: 'messageId', value: id });
  return rows.sort((a, b) => Number(a.id) - Number(b.id))[0] ?? null;
}

/** Pending drafts of `kind` for a Disputes case (oldest first: that one is replaced, never duplicated). */
export async function pendingCaseDrafts(client: BlocksClient, disputeId: string, kind: string): Promise<Item[]> {
  if (!disputeId) return [];
  const rows = await readAll(client, 'Approvals', {
    and: [
      { column: 'relatedTable', value: 'Disputes' },
      { column: 'relatedId', value: String(disputeId) },
      { column: 'kind', value: kind },
    ],
  });
  return rows.sort((a, b) => Number(a.id) - Number(b.id));
}

/** Short quote of an email for an internal draft ("> " lines, at most `max` characters). */
export function quoteEmail(email: Item | null, max = 1500): string {
  if (!email) return '';
  const body = str(email.bodyText).replace(/\r\n/g, '\n').trim();
  const text = body.length > max ? `${body.slice(0, max)}…` : body;
  const from = str(email.fromName).trim() ? `${str(email.fromName).trim()} <${str(email.fromAddress).trim()}>` : str(email.fromAddress).trim();
  const when = formatIsraelDateTime(email.receivedAt);
  const head = `המייל של הלקוח${from ? ` מ-${from}` : ''}${when ? `, ${when}` : ''}${str(email.subject).trim() ? ` – "${str(email.subject).trim()}"` : ''}:`;
  return [head, ...(text ? text.split('\n').map((l) => `> ${l}`) : ['> (גוף המייל לא נשמר)'])].join('\n');
}
