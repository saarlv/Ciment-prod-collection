import { describe, expect, it } from 'vitest';
import { currencyLabel, isIls } from '../../shared/collections-currency.ts';
import { CURRENCY } from '../../shared/collections-statement.ts';

describe('isIls / statement currency', () => {
  it('shekel codes and empty are ILS; others are not', () => {
    for (const c of ['שח', 'ש"ח', 'ש״ח', 'ILS', 'ils', 'NIS', '₪', '', null, undefined, ' שח ']) expect([c, isIls(c)]).toEqual([c, true]);
    for (const c of ['USD', 'EUR', '$']) expect([c, isIls(c)]).toEqual([c, false]);
  });
  it('the statement prints ₪, never שח', () => {
    expect(CURRENCY).toBe('₪');
    expect(currencyLabel('שח')).toBe('₪');
    expect(currencyLabel('USD')).toBe('USD');
  });
});
