/**
 * The gaps of the cross-component Priority sync, word for word from memories/files/GAPS_SYNC.md (05.11.2026).
 * Reset on 05.11.2026 (plan 04.11 revision 2); the old list is in the ארכיון tab (gapsArchive.ts). By who closes the gap.
 * Rendered by /collections/gaps, tab "סנכרון עם Priority".
 */
import type { GapsDoc } from '@/utils/buildDocs/gapsReceipts';

export const GAPS_SYNC: GapsDoc = {
  component: 'סנכרון עם Priority',
  title: 'פערים – סנכרון עם Priority',
  asOf: '05.11.2026',
  groups: [
    {
      key: 'navitGila',
      title: 'לסגור עם נווית וגילה',
      items: [
        '**מקור כל משיכה בפריוריטי:** לקוחות, תנועות שלא הותאמו עם תאריך פירעון, והזמנות פתוחות (אובליגו). היום שלושתן קוראות ממקור בדיקה באותו מבנה.',
        '**משיכה חלקית:** האם ה-API מאפשר למשוך רק רשומות שהשתנו מאז תאריך מסוים, ומה מגבלת הקריאות.',
      ],
    },
    {
      key: 'production',
      title: 'ייצור וחיבורים',
      items: [
        '**החלפת מקורות הבדיקה ב-API**, מאחורי אותו ממשק, בלי לשנות את הלוגיקה של המשיכה.',
        '**שאר המנגנונים:** רענון אחרי כתיבה, רענון בפתיחה וסנכרון תקופתי. היום רק משיכת הבוקר והכפתור.',
      ],
    },
    {
      key: 'internal',
      title: 'החלטות פנימיות',
      items: [
        '**פיצול טבלת הלקוחות** למראה ולהעשרה: נדחה לסבב הממשקים.',
        'אחרי כמה זמן פער "שולמה אצלנו, פתוחה ב-Priority" הופך להתראה.',
      ],
    },
  ],
};