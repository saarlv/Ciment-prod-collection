import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { InvoicesEntity } from '@/product-types';

/** The line shown wherever an open amount is unknown because Priority's open movements have not arrived yet. */
export const WAITING_FOR_OPEN_MOVEMENTS = 'ממתין לתנועות פתוחות מפריוריטי';

/**
 * Whether any invoice carries an open amount from Priority. While none does, open, overdue and at-risk amounts are
 * unknown (shown as '—'), not zero. `hasData` stays true while loading so screens do not flash the waiting state.
 */
export function useHasOpenMovements() {
  const q = useEntityGetAll(InvoicesEntity, { where: { column: 'openAmount', operator: 'is not null' }, page: { size: 1 } });
  return { hasData: q.isLoading || q.isError || (q.data ?? []).length > 0, isLoading: q.isLoading };
}