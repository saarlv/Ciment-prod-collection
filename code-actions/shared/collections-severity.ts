// Task severity (CollectionQueue.severity / severityScore): a weighted score of the amount at stake and the days
// overdue, 0–100, and its level. Shared by the promise engine (stage 2) and the 06:00 task scan (stage 3).
//
//   score = 100 × (wAmount × min(amount / amountCap, 1) + wDays × min(daysOverdue / daysCap, 1))
//   level = קריטית ≥ critical, גבוהה ≥ high, בינונית ≥ medium, else נמוכה
//
// Weights and thresholds are AgentSettings rows (read them with readSettings and pass the map, or pass a
// SeverityConfig). Weights that do not sum to 1 are normalised; negative / missing values fall back to defaults.
import { numberSetting } from './collections-data.ts';

export const SEV_CRITICAL = 'קריטית';
export const SEV_HIGH = 'גבוהה';
export const SEV_MEDIUM = 'בינונית';
export const SEV_LOW = 'נמוכה';
export const SEVERITY_LEVELS = [SEV_CRITICAL, SEV_HIGH, SEV_MEDIUM, SEV_LOW];

export interface SeverityConfig {
  weightAmount: number;
  weightDays: number;
  amountCap: number;
  daysCap: number;
  scoreCritical: number;
  scoreHigh: number;
  scoreMedium: number;
}

/** AgentSettings keys and their defaults. */
export const SEVERITY_SETTING_DEFAULTS = {
  severityWeightAmount: 0.7,
  severityWeightDays: 0.3,
  severityAmountCap: 100000,
  severityDaysCap: 90,
  severityScoreCritical: 70,
  severityScoreHigh: 45,
  severityScoreMedium: 20,
} as const;

export const DEFAULT_SEVERITY_CONFIG: SeverityConfig = {
  weightAmount: SEVERITY_SETTING_DEFAULTS.severityWeightAmount,
  weightDays: SEVERITY_SETTING_DEFAULTS.severityWeightDays,
  amountCap: SEVERITY_SETTING_DEFAULTS.severityAmountCap,
  daysCap: SEVERITY_SETTING_DEFAULTS.severityDaysCap,
  scoreCritical: SEVERITY_SETTING_DEFAULTS.severityScoreCritical,
  scoreHigh: SEVERITY_SETTING_DEFAULTS.severityScoreHigh,
  scoreMedium: SEVERITY_SETTING_DEFAULTS.severityScoreMedium,
};

/** The severity config from the AgentSettings map (readSettings), defaults for missing / invalid values. */
export function severityConfigFrom(settings: Map<string, string>): SeverityConfig {
  const d = SEVERITY_SETTING_DEFAULTS;
  const pos = (key: keyof typeof d) => {
    const v = numberSetting(settings, key, d[key]);
    return v >= 0 ? v : d[key];
  };
  return {
    weightAmount: pos('severityWeightAmount'),
    weightDays: pos('severityWeightDays'),
    amountCap: pos('severityAmountCap'),
    daysCap: pos('severityDaysCap'),
    scoreCritical: pos('severityScoreCritical'),
    scoreHigh: pos('severityScoreHigh'),
    scoreMedium: pos('severityScoreMedium'),
  };
}

const isConfig = (s: unknown): s is SeverityConfig => !!s && typeof s === 'object' && !(s instanceof Map) && 'weightAmount' in (s as object);

export interface SeverityInput {
  /** ILS at stake (negative counts as 0) */
  amount: number;
  /** days overdue (negative counts as 0) */
  daysOverdue: number;
}

export interface Severity {
  /** 0–100, rounded */
  score: number;
  /** קריטית / גבוהה / בינונית / נמוכה */
  level: string;
}

/** The level of a score by the thresholds. */
export function severityLevel(score: number, cfg: SeverityConfig = DEFAULT_SEVERITY_CONFIG): string {
  if (score >= cfg.scoreCritical) return SEV_CRITICAL;
  if (score >= cfg.scoreHigh) return SEV_HIGH;
  if (score >= cfg.scoreMedium) return SEV_MEDIUM;
  return SEV_LOW;
}

/**
 * Weighted severity of a task. `settings` is the AgentSettings map (readSettings) or a SeverityConfig; omitted →
 * defaults.
 */
export function computeSeverity(input: SeverityInput, settings?: Map<string, string> | SeverityConfig | null): Severity {
  const cfg = isConfig(settings) ? settings : settings instanceof Map ? severityConfigFrom(settings) : DEFAULT_SEVERITY_CONFIG;
  let wa = Math.max(0, cfg.weightAmount);
  let wd = Math.max(0, cfg.weightDays);
  const sum = wa + wd;
  if (sum <= 0) {
    wa = DEFAULT_SEVERITY_CONFIG.weightAmount;
    wd = DEFAULT_SEVERITY_CONFIG.weightDays;
  } else if (Math.abs(sum - 1) > 1e-9) {
    wa /= sum;
    wd /= sum;
  }
  const ratio = (v: number, cap: number) => {
    const x = Number.isFinite(v) ? Math.max(0, v) : 0;
    if (cap <= 0) return x > 0 ? 1 : 0;
    return Math.min(x / cap, 1);
  };
  const raw = 100 * (wa * ratio(input.amount, cfg.amountCap) + wd * ratio(input.daysOverdue, cfg.daysCap));
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, level: severityLevel(score, cfg) };
}
