# פערים – סנכרון עם Priority (נכון ל-05.11.2026)

The content of the build-stage page /collections/gaps, tab "סנכרון עם Priority" (src/utils/buildDocs/gapsSync.ts). Rewritten on 05.11.2026 (plan 04.11 revision 2, stage 1), when the morning pull was built; the old list is in the ארכיון tab. The aging and credit tabs point here instead of keeping their own sync lines. Design: memories/files/DESIGN_SYNC.md.

## לסגור עם נווית וגילה
1. **מקור כל משיכה בפריוריטי:** לקוחות, תנועות שלא הותאמו עם תאריך פירעון, והזמנות פתוחות (אובליגו). היום שלושתן קוראות ממקור בדיקה באותו מבנה.
2. **משיכה חלקית:** האם ה-API מאפשר למשוך רק רשומות שהשתנו מאז תאריך מסוים, ומה מגבלת הקריאות.

## ייצור וחיבורים
1. **החלפת מקורות הבדיקה ב-API**, מאחורי אותו ממשק, בלי לשנות את הלוגיקה של המשיכה.
2. **שאר המנגנונים:** רענון אחרי כתיבה, רענון בפתיחה וסנכרון תקופתי. היום רק משיכת הבוקר והכפתור.

## החלטות פנימיות
1. **פיצול טבלת הלקוחות** למראה ולהעשרה: נדחה לסבב הממשקים.
2. אחרי כמה זמן פער "שולמה אצלנו, פתוחה ב-Priority" הופך להתראה.
