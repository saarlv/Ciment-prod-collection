import { useAgent } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CustomerCardAgentAgent } from '@/product-types';

/** The persona titles are the catalog's Latin spelling; the Hebrew UI shows the Hebrew name. */
const HEBREW_NAME: Record<string, string> = { Tamar: 'תמר' };

/** Identity of Tamar, the customer-card agent, as configured on the platform (name, job title, photo). */
export function useCardAgent() {
  const { title, jobTitle, photoUrl, avatarUrl } = useAgent(CustomerCardAgentAgent);
  return {
    name: (title && HEBREW_NAME[title]) || title || jobTitle || 'סוכנת כרטיס לקוח',
    jobTitle: jobTitle || 'סוכנת כרטיס לקוח',
    photo: avatarUrl || photoUrl || undefined,
  };
}