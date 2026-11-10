import { useAgent } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CollectionsAgentAgent } from '@/product-types';

/** The persona titles are the catalog's Latin spelling; the Hebrew UI shows the Hebrew name. */
const HEBREW_NAME: Record<string, string> = { Nina: 'נינה' };

/** Identity of Nina, the receipts agent, as configured on the platform (name, job title, photo). */
export function useCollectionsAgent() {
  const { title, jobTitle, photoUrl, avatarUrl } = useAgent(CollectionsAgentAgent);
  return {
    name: (title && HEBREW_NAME[title]) || title || 'נינה',
    jobTitle: jobTitle || 'סוכנת תקבולים',
    photo: avatarUrl || photoUrl || undefined,
  };
}