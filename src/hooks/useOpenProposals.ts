import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { MatchProposalsEntity } from '@/product-types';
import { OPEN } from '@/utils/Receipts';

/** Every receipt match proposal still waiting for a person (status מוצעת), newest bank day first. */
export function useOpenProposals() {
  return useEntityGetAll(MatchProposalsEntity, {
    where: { column: 'status', value: OPEN },
    orderBy: [{ column: 'valueDate', direction: 'desc' }],
  });
}