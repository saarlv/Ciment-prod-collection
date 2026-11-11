/** Every way Priority and the app write the shekel: שח, ש"ח, ש״ח, ILS, NIS, ₪, or nothing at all. */
const ILS_CODES = new Set(['', 'שח', 'ש"ח', 'ש״ח', "ש'ח", 'ILS', 'NIS', '₪']);

/** True when an amount is in shekels and belongs in the ₪ total, false for a foreign currency. */
export function isIls(code?: string | null): boolean {
  return ILS_CODES.has((code ?? '').trim().toUpperCase());
}