// One rule for "is this amount in shekels": Priority writes the shekel as "שח" (CODE), files and people write ש"ח,
// ש״ח, ILS, NIS or ₪, and an empty currency means the company's own currency (shekels). Every code-action total that
// splits ILS from other currencies uses isIls; documents print the shekel as ₪, never "שח".
import { str } from './collections-data.ts';

export const ILS_SYMBOL = '₪';
const ILS_CODES = new Set(['שח', 'ש"ח', 'ש״ח', "ש'ח", 'ILS', 'NIS', '₪']);

/** true for שח, ש"ח, ש״ח, ILS, NIS, ₪ and empty / null (any case, surrounding spaces ignored). */
export function isIls(code: unknown): boolean {
  const c = str(code).trim();
  if (!c) return true;
  return ILS_CODES.has(c.toUpperCase()) || ILS_CODES.has(c.replace(/\s+/g, ''));
}

/** The currency as printed on a document: ₪ for shekels, else the code itself. */
export const currencyLabel = (code: unknown): string => (isIls(code) ? ILS_SYMBOL : str(code).trim());
