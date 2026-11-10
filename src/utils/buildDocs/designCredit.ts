/**
 * Design 03 · ביטוח אשראי ואובליגו — the content of memories/files/DESIGN_03_CREDIT.md as typed data, word for
 * word (written 27.10.2026 from Saar's spec "ביטוח אשראי ואובליגו: לשונית בכרטיס הלקוח"). The page restyles it;
 * the meaning stays as written. Rendered by /collections/design, tab "03 · ביטוח אשראי".
 */
import type { SchemaTable } from '@/utils/buildDocs/designReceipts';

/** A text with **bold** lead, as in the source ("**ניצול גבוה:** ..."). */
export interface LeadText {
  lead?: string;
  text: string;
}

export const DESIGN_CREDIT = {
  number: '03',
  title: 'ביטוח אשראי ואובליגו',
  date: '27.10',
  lead: 'נכתב ב-27.10.2026 לפי האפיון של סער "ביטוח אשראי ואובליגו: לשונית בכרטיס הלקוח".',
  /** The pointer line to the cross-component doc, after the bold "סנכרון עם Priority:". */
  sync: 'איך ומתי האובליגו, פירוטו ומסגרת הביטוח מתעדכנים מ-Priority (ומ-ICIC) מתואר במסמך החוצה "סנכרון עם Priority".',

  principle: {
    title: 'העיקרון',
    points: [
      { text: 'אין מסך ביטוח נפרד. מסך הביטוח הקודם ירד מהתפריט.' },
      { text: 'ההיגיון שכבר היה בנוי (זיהוי ניצול של 80%) עבר ללשונית בכרטיס הלקוח:', lead: '"אובליגו וביטוח".' },
      { text: 'הלשונית מופיעה רק ללקוח שיש לו ביטוח אשראי (מכסה בטבלת המכסות). ללקוח בלי ביטוח היא לא מוצגת בכלל.' },
    ] as { text: string; lead?: string }[],
  },

  alerts: {
    title: 'התראות במסך היום',
    intro: 'שתי התראות, וכל אחת מקשרת ישר ללשונית בכרטיס הלקוח:',
    items: [
      {
        lead: 'ניצול גבוה:',
        text: 'האובליגו הדינמי הגיע ל-80% מהמסגרת המבוטחת (הסף בהגדרות, insuranceThresholdPct). זה הגבול, ואין התראה נפרדת מעל 100%.',
      },
      { lead: 'פקיעה:', text: 'תוקף המכסה מסתיים בתוך מספר הימים שבהגדרות (coverExpiryAlertDays, כרגע 30, לאשר עם יניב).' },
    ] as LeadText[],
    note: 'ההתראות נבדקות רק למכסות בסטטוס "תקף".',
  },

  tab: {
    title: 'הלשונית "אובליגו וביטוח"',
    sections: [
      { n: 1, lead: 'ביטוח:', text: 'המבטח, מספר המכסה, המסגרת המבוטחת, התוקף, הסטטוס (תקף / בטיפול / מבוטל), ומתי סונכרן.' },
      { n: 2, lead: 'אובליגו סטטי:', text: 'האובליגו כמו שהוא ב-Priority. לא מחשבים אותו אצלנו, רק קוראים.' },
      {
        n: 3,
        lead: 'אובליגו דינמי:',
        text: 'הסטטי, מתוקן לפי מה שבאמצע עבודה. כל פריט מופיע עם הסיבה שלו:',
        items: [
          {
            lead: 'העברות בבירור:',
            text: 'העברות של הלקוח שזוהו בתקבולים ומחכות לפירוט ("ממתינה לפירוט"). זה כסף שכבר נכנס, ולכן הוא יורד. לכל אחת קישור לרשומה בתקבולים.',
          },
          { lead: 'קבלות שעוד לא נרשמו ב-Priority:', text: 'קבלות שאושרו אצלנו ("מוכנה") ועוד לא סומנו "הונפקה ב-Priority".' },
          {
            lead: 'צ׳קים שלא הופקדו:',
            text: 'מוצגים בנפרד, כ"צפוי לרדת בהפקדה", עם תאריך הפירעון. הם לא יורדים מהאובליגו הדינמי, כי צ׳ק יכול לחזור. מוצג גם "אחרי הפקדה".',
          },
          { text: 'כל העברה נספרת פעם אחת בלבד. האובליגו הדינמי מחושב בזמן התצוגה ולא נשמר.' },
        ] as LeadText[],
      },
      { n: 4, lead: 'ניצול:', text: 'האובליגו הסטטי והדינמי מול המסגרת המבוטחת, באחוזים ובשקלים, עם המרווח שנשאר. מעל 80% הצבע משתנה.' },
      {
        n: 5,
        lead: 'פירוט האובליגו:',
        text: 'טבלה מקובצת לפי סוג: חשבוניות פתוחות, תעודות משלוח שעוד לא חויבו, צ׳קים שלא הופקדו, הזמנות פתוחות. לכל שורה מספר המסמך, הסכום והתאריכים, ולכל קבוצה סכום.',
      },
      {
        n: 6,
        lead: 'כפתורים (דמה, לא עושים כלום כרגע):',
        text: '"הרחבת מסגרת", ו"חידוש" שמופיע רק כשהתוקף עומד להסתיים. שניהם מסומנים "יחובר ל-ICIC".',
      },
    ] as { n: number; lead: string; text: string; items?: LeadText[] }[],
    openRequest:
      'אם יש הצעת הגדלה פתוחה ללקוח (CreditLimitRequests), היא מוצגת בלשונית עם כפתור "אישור" (DecideInsuranceRequest → אושר – לא הוגש; שום דבר לא מוגש למבטח). את ההצעות יוצר הכפתור "בדיקת לקוחות מעל הסף" בכרטיס התראות הביטוח במסך היום (ProposeInsuranceRequests).',
  },

  calc: {
    title: 'איך מחושב',
    head: ['מה', 'חישוב'],
    rows: [
      ['אובליגו סטטי', 'CustomerExposure.obligoTotal, כמו ב-Priority'],
      ['אובליגו דינמי', 'סטטי − העברות בבירור − קבלות שעוד לא נרשמו ב-Priority (לא פחות מ-0)'],
      ['אחרי הפקדה', 'דינמי − צ׳קים שלא הופקדו'],
      ['ניצול', 'אובליגו ÷ המסגרת המבוטחת של המכסה התקפה'],
      ['ניצול גבוה', 'ניצול דינמי ≥ 80%'],
      ['פקיעה', 'ימים עד סוף התוקף ≤ 30'],
    ],
  },

  schema: {
    title: 'סכמת הטבלאות',
    intro:
      'כל השלוש הן מראה (Priority או ICIC), לקריאה בלבד באפליקציה. השדות שהיו בטבלת הלקוחות (creditInsurer, insurerCaseNumber, insuranceApprovedAmount, obligoUsed, obligoPct) הועברו לכאן. creditLimit נשאר בלקוח: זו מסגרת האשראי של Priority, לא המסגרת המבוטחת.',
    tables: [
      {
        name: 'CreditCovers',
        title: 'מכסות ביטוח',
        origin: 'credit_covers',
        isNew: true,
        mirror: true,
        columns: [
          { name: 'customerCode, customerName', type: 'טקסט → Customers', note: 'הלקוח (במקור: customer_id)' },
          { name: 'insurer', type: 'טקסט', note: 'המבטח, למשל בסס״ח' },
          { name: 'coverNo', type: 'טקסט', note: 'מספר המכסה (נשלח כ-ORIG_COVER_NO בבקשת הגדלה)' },
          { name: 'insuredAmount', type: 'מספר', note: 'המסגרת המבוטחת' },
          { name: 'validUntil', type: 'תאריך', note: 'התוקף' },
          { name: 'status', type: 'בחירה', note: 'תקף / בטיפול / מבוטל' },
          { name: 'coverSource', type: 'בחירה', note: 'Priority / ICIC' },
          { name: 'source, syncedAt', type: 'טקסט, זמן', note: 'סימון המראה, ומתי סונכרן' },
        ],
      },
      {
        name: 'CustomerExposure',
        title: 'אובליגו סטטי',
        origin: 'customer_exposure',
        isNew: true,
        mirror: true,
        columns: [
          { name: 'customerCode', type: 'טקסט → Customers', note: 'מפתח, שורה אחת לכל לקוח' },
          { name: 'obligoTotal', type: 'מספר', note: 'האובליגו כמו ב-Priority' },
          { name: 'asOf', type: 'זמן', note: 'מתי Priority חישב' },
        ],
      },
      {
        name: 'ExposureItems',
        title: 'פירוט האובליגו',
        origin: 'exposure_items',
        isNew: true,
        mirror: true,
        columns: [
          { name: 'customerCode', type: 'טקסט → Customers', note: 'הלקוח' },
          { name: 'itemType', type: 'בחירה', note: 'חשבונית פתוחה / תעודת משלוח שלא חויבה / צ׳ק שלא הופקד / הזמנה פתוחה' },
          { name: 'reference', type: 'טקסט', note: 'מספר המסמך' },
          { name: 'amount', type: 'מספר', note: 'הסכום באובליגו' },
          { name: 'docDate, dueDate', type: 'תאריך', note: 'תאריך המסמך, ותאריך הפירעון (בצ׳ק: תאריך הצ׳ק)' },
          { name: 'asOf', type: 'זמן', note: 'מתי Priority חישב' },
        ],
      },
    ] as SchemaTable[],
  },

  testData: {
    title: 'נתוני בדיקה',
    head: ['לקוח', 'מה הוא בודק'],
    rows: [
      ['TEST-011', 'מבוטח, ניצול מעל 80% → התראת ניצול גבוה'],
      ['TEST-012', 'סטטי מעל 80%, דינמי מתחת בגלל העברה בבירור → אין התראה'],
      ['TEST-013', 'המכסה פוקעת בעוד שבועיים → התראת פקיעה, כפתור "חידוש"'],
      ['TEST-014', 'בלי ביטוח → אין לשונית'],
      ['TEST-015', 'צ׳ק שלא הופקד ותעודות משלוח שעוד לא חויבו'],
    ],
  },

  notNow: {
    title: 'לא בונים עכשיו',
    items: ['קריאה ל-ICIC.', 'כתיבה ל-Priority.', 'סנכרון אוטומטי. הנתונים כרגע מנתוני הבדיקה.', 'ביטוח ללקוח חדש.'],
    gapsNote: 'הרשימה המלאה של הפערים נמצאת בעמוד פערים, בלשונית "ביטוח אשראי".',
  },
};