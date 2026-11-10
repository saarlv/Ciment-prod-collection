/**
 * The severity score of an open invoice (and of a collections task), the same formula as the backend helper
 * code-actions/shared/collections-severity.ts — same AgentSettings keys, same defaults:
 *
 *   score = 100 × (wA × min(remaining / amountCap, 1) + wD × min(daysOverdue / daysCap, 1))
 *   daysOverdue = max(0, today − dueDate)
 *
 * The weights are normalised when they don't sum to 1. Levels: ≥ critical → קריטית, ≥ high → גבוהה, ≥ medium → בינונית,
 * else נמוכה. Settings are text values in AgentSettings (by settingKey); a missing or invalid row falls back to the default.
 */

export const SEVERITY_DEFAULTS = {
  severityWeightAmount: 0.7,
  severityWeightDays: 0.3,
  severityAmountCap: 100000,
  severityDaysCap: 90,
  severityScoreCritical: 70,
  severityScoreHigh: 45,
  severityScoreMedium: 20,
} as const;

/** How far ahead the customer card shows open invoices that are not yet due (days). */
export const DUE_WINDOW_KEY = 'openInvoicesDueWindowDays';
export const DUE_WINDOW_DEFAULT = 30;

export type SeverityKey = keyof typeof SEVERITY_DEFAULTS;
export type SeveritySettings = Record<SeverityKey, number>;

export type SeverityLevel = 'קריטית' | 'גבוהה' | 'בינונית' | 'נמוכה';

interface SettingRow {
  settingKey?: string | null;
  value?: string | null;
}

/** A numeric setting from AgentSettings rows; the fallback when the row is missing or not a finite number. */
export function settingNumber(rows: SettingRow[], key: string, fallback: number): number {
  const row = rows.find((r) => r.settingKey === key);
  const raw = row?.value?.toString().replace(/,/g, '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** The severity settings from AgentSettings rows, with the defaults, valid caps and weights summing to 1. */
export function severitySettingsFrom(rows: SettingRow[]): SeveritySettings {
  const s = Object.fromEntries(
    (Object.keys(SEVERITY_DEFAULTS) as SeverityKey[]).map((k) => [k, settingNumber(rows, k, SEVERITY_DEFAULTS[k])]),
  ) as SeveritySettings;
  if (!(s.severityAmountCap > 0)) s.severityAmountCap = SEVERITY_DEFAULTS.severityAmountCap;
  if (!(s.severityDaysCap > 0)) s.severityDaysCap = SEVERITY_DEFAULTS.severityDaysCap;
  let wA = Math.max(0, s.severityWeightAmount);
  let wD = Math.max(0, s.severityWeightDays);
  if (wA + wD <= 0) {
    wA = SEVERITY_DEFAULTS.severityWeightAmount;
    wD = SEVERITY_DEFAULTS.severityWeightDays;
  }
  const sum = wA + wD;
  s.severityWeightAmount = wA / sum;
  s.severityWeightDays = wD / sum;
  return s;
}

function dayNumber(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Whole days from `today` to `dueDate` (negative = overdue); null without a due date. */
export function daysUntil(dueDate: string | null | undefined, today: string): number | null {
  if (!dueDate) return null;
  const due = dayNumber(dueDate);
  const now = dayNumber(today);
  if (due === null || now === null) return null;
  return Math.round(due - now);
}

/** max(0, today − dueDate) in days. */
export function daysOverdueOf(dueDate: string | null | undefined, today: string): number {
  const d = daysUntil(dueDate, today);
  return d === null ? 0 : Math.max(0, -d);
}

/** The 0–100 score of an open amount that is `daysOverdue` days late. */
export function severityScore(remaining: number, daysOverdue: number, s: SeveritySettings): number {
  const amountPart = Math.min(Math.max(remaining, 0) / s.severityAmountCap, 1);
  const daysPart = Math.min(Math.max(daysOverdue, 0) / s.severityDaysCap, 1);
  return 100 * (s.severityWeightAmount * amountPart + s.severityWeightDays * daysPart);
}

export function severityLevel(score: number, s: SeveritySettings): SeverityLevel {
  if (score >= s.severityScoreCritical) return 'קריטית';
  if (score >= s.severityScoreHigh) return 'גבוהה';
  if (score >= s.severityScoreMedium) return 'בינונית';
  return 'נמוכה';
}