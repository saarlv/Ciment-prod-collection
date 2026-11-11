import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { OpenMovementsEntity } from '@/product-types';

/** One customer's open ledger movements (Priority), earliest due first — a few dozen rows, never the whole history. */
export function useCustomerOpenMovements(customerCode: string, enabled = true) {
  return useEntityGetAll(
    OpenMovementsEntity,
    { where: { column: 'customerCode', value: customerCode }, orderBy: [{ column: 'dueDate', direction: 'asc' }], page: { size: 1000 } },
    { enabled },
  );
}