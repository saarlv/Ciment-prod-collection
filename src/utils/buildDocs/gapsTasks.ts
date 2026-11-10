/**
 * The gaps of the tasks component (05 · משימות), word for word from memories/files/GAPS_TASKS.md (05.11.2026).
 * Reset on 05.11.2026 (plan 04.11 revision 2); the old list is in the ארכיון tab (gapsArchive.ts). By who closes the gap.
 * Rendered by /collections/gaps, tab "משימות".
 */
import type { GapsDoc } from '@/utils/buildDocs/gapsReceipts';

export const GAPS_TASKS: GapsDoc = {
  component: 'משימות',
  title: 'פערים – משימות',
  asOf: '05.11.2026',
  groups: [
    {
      key: 'internal',
      title: 'החלטות פנימיות',
      items: [
        '**התראות מול משימות:** "נסגר לאפס" ושאר ההודעות בלי פעולה הן התראות. עד סבב הממשקים: פילטר "התראות" בדף המשימות. **סער**.',
      ],
    },
  ],
};