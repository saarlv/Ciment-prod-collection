/**
 * The gaps of the credit insurance component, word for word from memories/files/GAPS_CREDIT.md (27.10.2026).
 * Same structure as the other tabs: by who closes the gap. Saar's list of 27.10. Rendered by
 * /collections/gaps, tab "ביטוח אשראי".
 */
import type { GapsDoc } from '@/utils/buildDocs/gapsReceipts';

export const GAPS_CREDIT: GapsDoc = {
  component: 'ביטוח אשראי',
  title: 'פערים – ביטוח אשראי',
  asOf: '27.10.2026',
  groups: [
    {
      key: 'yaniv',
      title: 'לסגור עם יניב',
      items: [
        'איש קשר בבסס״ח.',
        'האם למכסה יש תוקף, וכמה זמן מראש מתריעים.',
        'איך יודעים על צ׳ק שהתקבל ועוד לא הופקד.',
        'מה עושים כשהמבטח מאשר רק חלק, או דוחה.',
        'ימי אשראי (CREDIT_DAYS) וקוד תנאי תשלום (PAYTERMS_CODE).',
        'האם יש חטיבה עסקית נפרדת לכל מותג.',
      ],
    },
    {
      key: 'production',
      title: 'ייצור וחיבורים',
      items: [
        'מפתחות ל-ICIC.',
        'שדות הביטוח והאובליגו ב-Priority. לברר עם נווית.',
        'כתיבה ל-Priority.',
        'סנכרון עם Priority: ראו הרכיב "סנכרון עם Priority" (אובליגו, תעודות משלוח, הפקדות צ׳קים ומסגרת הביטוח).',
        'המגבלה היומית של ICIC.',
      ],
    },
    {
      key: 'internal',
      title: 'החלטות פנימיות',
      items: ['מתי מתריעים שוב על לקוח שהבקשה שלו נדחתה.'],
    },
  ],
};