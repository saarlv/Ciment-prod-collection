/**
 * The gaps of the receipts component (01), word for word from memories/files/GAPS_RECEIPTS.md (05.11.2026).
 * Reset on 05.11.2026 (plan 04.11 revision 2; the old list is in the ארכיון tab, gapsArchive.ts) and rewritten in part B,
 * stage 4 "זיהוי וקבלה" (branch b/identify-receipt). By who closes the gap. Rendered by /collections/gaps, tab "תקבולים".
 */

/** Who closes the gap; a group title in the source maps to one key (unknown titles fail the copy). */
export type GapGroupKey = 'yaniv' | 'navitGila' | 'navit' | 'saar' | 'production' | 'placeholder' | 'internal' | 'separate';

export interface GapGroup {
  key: GapGroupKey;
  title: string;
  /** Numbered 1..n in this order. */
  items: string[];
  /** Sub-points under an item, by its number (1-based). */
  subs?: Record<number, string[]>;
  /** A source section that fits none of the fixed groups, kept under its own title inside the closest group. */
  sections?: { title: string; items: string[] }[];
}

export interface GapsDoc {
  component: string;
  title: string;
  asOf: string;
  groups: GapGroup[];
}

export const GAPS_RECEIPTS: GapsDoc = {
  component: 'תקבולים',
  title: 'פערים – תקבולים',
  asOf: '08.11.2026',
  groups: [
    {
      key: 'navitGila',
      title: 'לסגור עם נווית וגילה',
      items: [
        '**שורות דפי בנק בפריוריטי:** האם יש שם כבר שורות מובנות. אם כן, מעבירים את ההגדרה bankLinesSource ל"שורות פריוריטי", ומדלגים על העלאת הקובץ, על החילוץ ועל אישור השורות. כרגע ברירת המחדל היא "קובץ".',
        '**צ׳קים של סוכנים בפריוריטי:** איך מזהים קבלה שסוכן הוציא (סוג מסמך, משתמש, קופה?). שלב 7 בנוי: היום נחשב צ׳ק של סוכן כל תשלום צ׳ק / צ׳ק דחוי עם collectedBy במראה Payments. כשנדע את הסימון בפריוריטי, מחליפים את הכלל במקום אחד.',
        '**דגל "הנהלת חשבונות" באנשי קשר בפריוריטי:** הקבלה נשלחת לאיש הקשר שמסומן isApContact. צריך לדעת איזה שדה בפריוריטי ממלא אותו.',
      ],
    },
    {
      key: 'yaniv',
      title: 'לסגור עם יניב',
      items: [
        '**הקבלה שנשלחת ללקוח:** האם היום סימנט שולחת קבלות מפריוריטי במייל, ומאיזו כתובת. עד שיש API, האפליקציה מפיקה PDF משלה, עם החותמת "הופק באפליקציה – טרם הונפק ב-Priority".',
        '**רמות הביטחון בזיהוי:** הסף לוודאי הוא 90, והציון של כל מדרגה נקבע אצלנו (ח״פ 100, כינוי 95, שם זהה 95, איש קשר 85, מייל 80, שם חלקי 70, דו-משמעי 50). לאשר את הסף ואת הסדר אחרי שבוע של אישורים בפועל.',
        '**אישור אוטומטי של לקוח (customerAutoApproveAt):** כבוי. מתי מדליקים, ובאיזה סף.',
      ],
    },
    {
      key: 'saar',
      title: 'לסגור עם סער',
      items: [
        '**מתי הריצה מתחילה לבד:** שלב 09:00 / 10:00 של יום העבודה נבנה ב-branch של מנוע ההערות (a/notes-engine), ושם הוא קורא ל"ריצת התקבולים הקיימת". אחרי המיזוג צריך לוודא שהוא קורא למשיכה רק במצב "שורות פריוריטי". במצב "קובץ" הזיהוי רץ אחרי אישור השורות.',
        '**נסגר 08.11 (גל 3):** משימות הסולם הישן נעלמות עם הרצה מחדש של נתוני הבדיקה; אין נתונים אמיתיים לשמור.',
      ],
    },
    {
      key: 'production',
      title: 'מה ייכנס לפרודקשן',
      items: [
        '**שליחה אמיתית של המייל:** הטיוטה נעצרת ב"אושר – לא נשלח". השליחה תבוא עם תיבת המייל של סימנט (חלק ג\').',
        '**הנפקת הקבלה ב-Priority:** עד שיש API, אדם מנפיק ב-Priority ומסמן "הונפקה ב-Priority". אחרי החיבור, הקבלה נכנסת לפריוריטי ונשלחת הקבלה שלו.',
        '**כינוי לפריוריטי:** כינויים שנשמרים באישור נשארים אצלנו (prioritySync לא סונכרן).',
      ],
    },
    {
      key: 'placeholder',
      title: 'בנוי כמקום בלבד',
      items: [
        '**סף אישור אוטומטי של הפיזור (allocationAutoApproveAt):** בנוי בקוד וכבוי. מתי מדליקים ובאיזה סף, אחרי שבוע של פיזורים בפועל. **יניב**.',
        '**פיזור לפריוריטי:** הפיזור נשמר אצלנו (ReceiptAllocations). כשיש API ונכתוב אותו גם לפריוריטי, צריך לשנות את חישוב היתרה הפתוחה, אחרת פיזור ייספר פעמיים (פעם במראה ופעם אצלנו).',
        '**סגירת הערת "צ׳ק אצל סוכן":** נסגרת כ"נסגרה ידנית" עם משפט על הצ׳ק, כי אין ערך "נסגרה בקבלה". אם צריך ערך משלו, זו תוספת enum ב-branch זעיר.',
        '**נסגר 08.11 (גל 3 + ניקוי מסך התקבולים):** הסולם הישן להתאמת חשבוניות נמחק מהקוד ומהמסך, וגם הבדיקה רשומה-רשומה ("נכנסות לבדיקה"), החיפוש במייל עם אישור, קורא הפירוטים, בקשת הפירוט וריצת ההתאמה של ייבוא הבוקר. כל שורה עוברת זיהוי ← קבלה ← בדיקת חוב ← פיזור, ולחיצה עליה פותחת רשומה אחת עם ארבעת השלבים.',
        '**ReceiptThreads, checkRemittanceMail / remittanceSenders ו-evidenceEmailIds / evidenceQuote:** לא בשימוש מ-08.11. נמחקים בניקוי הבא. **סער**.',
      ],
    },
  ],
};

/** How many gaps stand in each group, in the group order. */
export function countByGroup(doc: GapsDoc): { key: GapGroupKey; title: string; count: number }[] {
  return doc.groups.map((g) => ({
    key: g.key,
    title: g.title,
    count: g.items.length + (g.sections ?? []).reduce((n, s) => n + s.items.length, 0),
  }));
}

/** The gaps as a plain markdown list, to paste to Yaniv. */
export function gapsAsMarkdown(doc: GapsDoc): string {
  const parts = [`# ${doc.title} (נכון ל-${doc.asOf})`];
  for (const g of doc.groups) {
    parts.push('', `## ${g.title}`);
    if (g.items.length === 0 && !(g.sections ?? []).length) parts.push('(אין כרגע)');
    g.items.forEach((item, i) => {
      parts.push(`${i + 1}. ${item}`);
      for (const sub of g.subs?.[i + 1] ?? []) parts.push(`   - ${sub}`);
    });
    for (const s of g.sections ?? []) {
      parts.push('', `### ${s.title}`);
      s.items.forEach((item, i) => parts.push(`${i + 1}. ${item}`));
    }
  }
  return parts.join('\n');
}