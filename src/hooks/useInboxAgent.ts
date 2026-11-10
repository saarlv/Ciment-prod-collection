import { useAgent } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CollectionsInboxAgentAgent } from '@/product-types';

/** The persona titles are the catalog's Latin spelling; the Hebrew UI shows the Hebrew name. */
const HEBREW_NAME: Record<string, string> = { Maya: 'מאיה' };

/** Identity of the inbox agent (Maya) as configured on the platform (name, job title, photo). */
export function useInboxAgent() {
  const { title, jobTitle, photoUrl, avatarUrl } = useAgent(CollectionsInboxAgentAgent);
  return {
    name: (title && HEBREW_NAME[title]) || title || 'מאיה',
    jobTitle: jobTitle || 'סוכנת מענה ושירות',
    photo: avatarUrl || photoUrl || undefined,
  };
}