# Design flows: block diagrams per component

This is the source text of the "דיאגרמה" view on /collections/design. Every component file (01, 02, 03, and every later one) has two views:
- **מסמך:** the full text, unchanged;
- **דיאגרמה:** the programmatic steps as blocks.

The frontend copies this file into `src/utils/buildDocs/designFlows.ts`. When a component doc changes, update its blocks here in the same turn. The general files (DB schema, UX-UI) get no diagram.

## Block format
Each block has:
- **n:** its number;
- **title:** short, 2–4 words;
- **kind:** one of קוד / סוכן AI / אדם / Priority / מסך;
- **action:** the real action, agent or table name, shown small and LTR;
- **line:** one line under the title;
- **explain:** shown when the block is clicked;
- **reads / writes:** tables;
- **next:** the following block numbers. A branch has a label in brackets.

Blocks numbered with a letter (5א, 5ב) are sub-steps drawn inside or next to their parent.

Optional (since 01.11, for the design review — a reader must get the logic without clicking):
- **status:** בנוי (default, not shown) / מקום בלבד (built as a place, the real thing is TODO) / TBD (not defined yet) / ממתין (defined and approved, waiting for its build stage). Shown as a chip on the block or rung.
- **gate:** a check that runs before everything else in the block and can exit the flow (e.g. צ׳ק חוזר → 5ב).
- **ladder:** the ordered rungs the block tries, drawn *visibly inside the block card* as a staircase: rung number, title, kind, status, one line, and "נמצא → X" on each rung with "לא נמצא ↓" between rungs. The last rung always ends the ladder. A rung may list **blocks** (child numbers) drawn inside it as a mini-chain; a rung may have its own explain (click the rung).
- Above every diagram: **the flow in one line** — the main blocks as a row of numbered chips (kind-colored), clickable.

---

## 01 · תקבולים והתאמות

1. **משיכת שורות דפי בנק** · מסך · `SyncPriorityBankLines`
   - line: הכפתור "משוך עכשיו מפריוריטי" מושך את שורות היום.
   - explain: מ-03.11 (תוכנית r3, שלב 2) השורות מגיעות ממסך "שורות דפי בנק" בפריוריטי, שאיריס טוענת כל בוקר. אין העלאת קובץ, ואין סוכן קריאה (BankFileReader מושבת). כרגע המקור הוא מקור בדיקה, כי פריוריטי לא מחובר. אין תזמון עד שיהיה API (החלטת סער): הפלטפורמה מתזמנת לכל היותר פעם בשעה, והבקשה הייתה כל 15 דקות. כל משיכה היא שורה ב-ImportBatches מסוג "שורות דפי בנק – Priority", והמסך מציג "נמשך מפריוריטי ב-HH:MM".
   - reads: AgentSettings (bankPollStart, bankPollEnd, bankPollInterval, receiptsReadyBy)
   - writes: ImportBatches
   - next: 2
2. **מניעת כפילויות** · קוד · `SyncPriorityBankLines`
   - line: לפי priorityLineId; שורה ישנה זהה מקובץ מאומצת.
   - explain: שורה שכבר קיימת רק מקבלת syncedAt חדש. שורה ישנה מקובץ עם אותם חשבון, תאריך, סכום, מעביר ואסמכתא מקבלת את ה-priorityLineId ולא נוצרת שוב. כל השאר נוצרות כ-PL-<priorityLineId>, עם source ו-syncedAt. משיכה שנייה באותו יום לא יוצרת אף שורה.
   - writes: BankLines
   - next: 3
3. **סינון לפי סוג שורה** · קוד · `SyncPriorityBankLines`
   - line: רק העברה וזיכוי בנק נבדקות.
   - explain: שורה חדשה מסוג העברה או זיכוי בנק נכנסת מיד לזיהוי (IdentifyCustomers, שלב 5). פירעון צ׳ק ו"אחר" (למשל ריבית זכות) מוצגים במסך תחת "לא מטופלות", בלי בדיקה. שורות ישנות מקובץ נשארות לצפייה בלבד.
   - next: 5 [העברה / זיכוי בנק], 4 [אין שורות]
4. **דפי בנק לא נטענו** · קוד · `SyncPriorityBankLines`
   - line: משיכה אחרי receiptsReadyBy בלי שורות → משימה אחת.
   - explain: ביום עסקים (א׳–ה׳), משיכה שרצה אחרי receiptsReadyBy (10:00, "החלטת יניב") ולא החזירה אף שורה של היום פותחת משימה אחת "דפי בנק לא נטענו" (bank-missing:<תאריך>). המשימה נסגרת לבד כשהשורות מגיעות. משימה שאדם סגר נשארת סגורה באותו יום. בלי תזמון, הבדיקה רצה רק כשמישהו מושך. מה עושים ביום שלא נטען הוא עדיין שאלה ליניב.
   - writes: CollectionQueue
   - next: —
5. **זיהוי לקוח** · קוד · `IdentifyCustomers`
   - line: לקוח עם רמת ביטחון 0–100 לכל שורה, ועוצרים.
   - gate: צ׳ק חוזר? → 5ב (משימה דחופה, לא תקבול)
   - ladder (המדרגה הגבוהה שנמצאה קובעת את הביטחון · ודאי ≥ identifyCertainAt (90)):
     1. **ח״פ באסמכתא** · קוד · בנוי — 100. (Customers)
     2. **כינוי מאושר** · קוד · בנוי — 95. כל אישור לקוח אחר או שם שונה נשמר ככינוי. (BankAliases)
     3. **שם זהה** · קוד · בנוי — 95, השם המנורמל = שם הלקוח.
     4. **איש קשר** · קוד · בנוי — 85. (CustomerContacts)
     5. **מייל מ-7 הימים האחרונים** · קוד · בנוי — 80, מייל שכבר שויך ללקוח אחד, עם הסכום ומילה מהשם. (InboundEmails)
     6. **שם חלקי** · קוד · בנוי — 70.
     7. **דו-משמעי / לא זוהה** · אדם · בנוי — 50 לכל מועמד / 0: בחירה ידנית ברשימה, נשמרת ככינוי.
   - explain: קוד בלבד, בלי AI. לכל שורה מזוהה נוצרת קבלה בטיוטה (RCPT-<bankLineId>) והצעת לקוח; שורה לא ודאית פותחת משימה "זיהוי לקוח – לאישור", מעביר לא מוכר "לא זוהה". WhatsApp לסוכנים לא נבנה. החיפוש במייל עם אישור, קורא הפירוטים ובקשת הפירוט נמחקו ב-08.11.
   - reads: Customers, CustomerContacts, BankAliases, InboundEmails
   - writes: Receipts, MatchProposals, ReceiptCheckSteps, CollectionQueue
   - next: 6 [לקוח אושר], 5ב [צ׳ק חוזר]
   - 5ב. **צ׳ק חוזר** · קוד
     - line: משימה דחופה לאחראית.
     - next: —
6. **אישור = קבלה** · אדם · `IssueReceipt`
   - line: "אשר את כל הוודאיים" או אחת-אחת → הקבלה יוצאת.
   - explain: הקבלה עוברת ל"אושרה – לא נשלחה", עם PDF וטיוטת מייל לאיש הקשר של הנהלת החשבונות (נעצרת ב"אושר – לא נשלח"), או משימה "חסר איש קשר הנהלת חשבונות". מיד אחר כך בדיקת החוב (7). אחרי ההנפקה ב-Priority אדם מסמן "הונפקה ב-Priority" עם מספר הקבלה (6א).
   - reads: Receipts, CustomerContacts
   - writes: Receipts, Approvals, BankAliases, CollectionQueue
   - next: 7, 6א [הונפק ב-Priority]
   - 6א. **הונפקה ב-Priority** · אדם · `DecideMatchProposal`
     - line: מספר הקבלה של Priority, בלחיצה ברשומה.
     - explain: אחרי שאדם הנפיק את הקבלה ב-Priority לפי ההוראה להעתקה. הקבלה ושורות הפיזור שלה עוברות ל"הונפקה ב-Priority", ושורת הבנק ל"קבלה הונפקה". כתיבה ישירה תבוא עם ה-API.
     - writes: Receipts, ReceiptAllocations, MatchProposals, BankLines
     - next: —
7. **בדיקת חוב** · קוד · `CheckDebt`
   - line: מיד אחרי הקבלה: הסכום מול התנועות הפתוחות לפי חודש פירעון.
   - explain: שינוי לוגיקה – 11.2026. סכום = היתרה המצטברת עד סוף חודש מסוים → "נסגר לאפס – מצטבר"; בדיוק יתרה של חודש אחד → "נסגר לאפס – חודש אחד"; בשניהם התראה "נסגר לאפס" ופיזור מוצע. אחרת "לברר מול הלקוח" ומשימה "לברר מול הלקוח – סכום לא סוגר חודש", בלי פיזור מוצע. טבלת תנועות ריקה = לא ידוע. כשל לא מבטל את הקבלה. נינה מסבירה (ExplainMatch, קריאה בלבד).
   - reads: OpenMovements, Receipts
   - writes: Receipts, CollectionQueue
   - next: 8 [נסגר לאפס], — [לברר מול הלקוח]
8. **פיזור לחשבוניות** · אדם · `ProposeAllocation` → `ApplyAllocation`
   - line: מהישנה לחדשה, האחרונה חלקית, עודף על חשבון; אישור בלחיצה בעורך.
   - explain: שלב נפרד שלא חוסם את הקבלה. החשבוניות הפתוחות מהתנועות הפתוחות לפי חודש; יתרה של חשבונית = הסכום במראה פחות כל הפיזורים שלה. ההצעה מתחילה מהחודשים שנסגרו, עם רמת ביטחון 0–100. העורך במסך התקבולים: סימון / ביטול וסכום לכל חשבונית. האישור מחליף את שורות הפיזור (רבים-לרבים) ומעדכן מפוזרת / מפוזרת – עודף על חשבון / על חשבון – צריך פיזור. משימה "קבלה – צריך פיזור" פתוחה עד שהקבלה מפוזרת. סף allocationAutoApproveAt כבוי; מעליו = "אושר אוטומטית". בכרטיס הלקוח: מה כל קבלה כיסתה ומה נשאר פתוח.
   - reads: OpenMovements, Invoices, ReceiptAllocations, AgentSettings
   - writes: ReceiptAllocations, Receipts, CollectionQueue
   - next: 9
   - 8א. **צ׳קים של סוכני שטח** · קוד · `PullAgentReceipts`
     - line: בשלב 09:00: צ׳ק של סוכן = קבלה, בלי זיהוי, ואז 7 ו-8.
     - explain: תשלומי צ׳ק / צ׳ק דחוי עם collectedBy מ-14 הימים האחרונים במראה Payments → קבלה RCPT-AGT-<paymentRef> (צ׳ק סוכן), בלי מייל. אותה בדיקת חוב ואותו פיזור. הערות "צ׳ק אצל סוכן" על החודשים שהצ׳ק משלם נסגרות דרך מנוע ההערות. איך מזהים בפריוריטי קבלה של סוכן – שאלה לגילה ונווית.
     - reads: Payments, OpenMovements, CustomerNotes
     - writes: Receipts, CustomerNotes, CollectionQueue
     - next: 7
9. **הנפקה ב-Priority** · Priority · ידני · מקום בלבד
   - line: אדם מעתיק את ההוראה ומסמן "הונפקה".
   - explain: המסך מציג הוראה להעתקה: לקוח, סכום, תאריך ערך, אסמכתא, וכל חשבונית עם הסכום שלה. אחרי ההנפקה ב-Priority רושמים את מספר הקבלה. הרשומה עוברת ל"קבלה הונפקה", והחשבונית ל"נקלט ב-Priority". כתיבה ישירה דרך ה-API היא TODO.
   - writes: Receipts, Invoices
   - next: —

---

## 02 · דוח גיול

1. **יום העבודה** · קוד · `DayRunner` → `RunDaySchedule`
   - line: כל שעה עגולה 06:00–12:00, א׳–ה׳; מריץ רק מה שהגיע זמנו.
   - explain: הוורקפלואו קורא את השעות מההגדרות (morningPullAt, bankCheckAt, bankRecheckAt) ואת מה שכבר רץ היום מ-ImportBatches. שלב שהצליח לא רץ שוב באותו יום; שלב שנכשל ינוסה בשעה הבאה. שעה עם דקות רצה בשעה העגולה הבאה. הכפתור "משוך עכשיו מפריוריטי" מריץ רק את שלב 06:00.
   - reads: AgentSettings, ImportBatches
   - next: 2 [06:00], 6 [09:00 / 10:00]
2. **משיכת הבוקר** · Priority · `PullPriorityCustomers` → `PullOpenMovements` → `PullOpenOrders`
   - line: לקוחות, תנועות פתוחות והזמנות פתוחות, למראות בלבד.
   - gate: משיכה נכשלה? → משימה "משיכת הבוקר נכשלה", שום דבר לא נמחק ולא נסגר
   - explain: הלקוחות מתעדכנים רק בעמודות של פריוריטי, ולקוח שנעלם מסומן "לא פעיל בפריוריטי" ולא נמחק. התנועות מוחלפות לכל לקוח בכל משיכה. עד שיש API, המקור הוא מקור בדיקה. שורת ריצה אחת ב-ImportBatches.
   - writes: Customers, OpenMovements, CustomerExposure, ExposureItems, ImportBatches
   - next: 3
3. **סגירת חודשים שהתאפסו** · קוד · `CloseSettledNotes`
   - line: חודש ב-0 ₪ סוגר את ההערות שלו.
   - explain: לכל לקוח + חודש עם הערות פעילות מסכמים את התנועות. 0 ₪ או פחות → "נסגרה – החודש התאפס", והתחייבות פתוחה מקבלת "קוימה". יתרה כלשהי משאירה את ההערות. אם אין תנועות בכלל, לא נסגר כלום. ההערות נשארות בהיסטוריה.
   - reads: OpenMovements, CustomerNotes
   - writes: CustomerNotes
   - next: 4
4. **משימות הבוקר** · קוד · `BuildTasks`
   - line: הסריקה הקיימת + משימות מרוכזות: אשראי, חזור אליי, צ׳ק אצל סוכן, תזכורות.
   - explain: משימה אחת לכל סוג + תאריך + עובדת (notes:<סוג>:<תאריך>:<עובדת>), עם שורה לכל לקוח + חודש ב-itemsJson. הערה נכנסת ביום שמגיע מועד הטריגר שלה, פעם אחת, ורק כשהחודש מעל 0. שורה יוצאת כשההערה נסגרת; משימה בלי שורות נסגרת לבד. הסוג, ההיסט והשלב נקראים מ-noteTask.* בהגדרות.
   - reads: CustomerNotes, OpenMovements, CustomerOwners, AgentSettings
   - writes: CollectionQueue
   - next: —
5. **כתיבת הערה** · אדם · `AddCustomerNote` / `UpdateCustomerNote`
   - line: לקוח + חודש; 4 סוגים אקטיביים + אחר.
   - status: פעיל (מסך הגיול, כרטיס הלקוח לפי חודש, תמר ומאיה; המסך כותב דרך המנוע מאז a/customer-card-tasks)
   - explain: התחייבות לתשלום, תשלום באשראי, צ׳ק אצל סוכן וחזור אליי דורשים תאריך ופותחים משימה במועד. "אחר" = סוג חופשי ותוכן. לכל הערה תזכורת וסכום אופציונליים. נשמרת יתרת החודש בזמן הכתיבה. מקורות: צוות, תמר בכרטיס (אחרי אישור במילים), מאיה ממייל ("אשר הבטחה", או בירור כ"אחר"). הערה שנכתבת אחרי שהשלב שלה כבר רץ היום, עם מועד של היום, נכנסת מיד למשימה של היום.
   - writes: CustomerNotes, CollectionQueue
   - next: 4, 8
6. **האם דף הבנק עלה?** · Priority · `RunDaySchedule`
   - line: 09:00, ושוב ב-10:00 אם לא.
   - explain: עד שיש API נבדק מול מקור הבדיקה של שורות דפי הבנק. 09:00 לא עלה → נרשם ומחכים. 10:00 רץ רק אם 09:00 לא מצא. שעה שהוחמצה (שניהם מגיעים יחד) = בדיקה אחת כמו של 10:00. כל בדיקה = שורה ב-ImportBatches עם bankLoaded.
   - reads: BankLines (מקור הבדיקה), ImportBatches
   - writes: ImportBatches
   - next: 7 [עלה], 6א [לא עלה ב-10:00]
   - 6א. **דף הבנק לא עלה לפריוריטי** · קוד · `RunDaySchedule`
     - line: משימה דחופה, ובלי בדיקת התחייבויות היום.
     - explain: מפתח bank-missing:<תאריך>, חומרה קריטית. ההתחייבויות של היום נבדקות ביום הבא שדף הבנק עולה; שום דבר לא הולך לאיבוד. המשימה נסגרת לבד כשדף הבנק עולה.
     - writes: CollectionQueue
     - next: —
7. **ריצת התקבולים ומשיכה חוזרת** · קוד · `SyncPriorityBankLines` → `PullOpenMovements` → `CloseSettledNotes`
   - line: הריצה הקיימת, ואחריה התנועות מתעדכנות.
   - explain: עד חלק ב׳ זו ריצת התקבולים של היום (משיכת שורות דפי בנק ובדיקה של כל העברה). אחריה התנועות נמשכות שוב, וחודשים שהתאפסו סוגרים את ההערות שלהם.
   - writes: BankLines, Receipts, OpenMovements, CustomerNotes
   - next: 8
8. **בדיקת התחייבויות** · קוד · `CheckCommitments`
   - line: קוימה / קוימה חלקית / לא קוימה, עם נכנס ונשאר.
   - explain: ביום שאחרי המועד. הובטח = הסכום, או יתרת החודש בזמן הכתיבה. נכנס = כל הקבלות של הלקוח מאז ההערה: מפריוריטי (Payments) ועד שיש API גם שאושרו אצלנו, כל קבלה פעם אחת, בלי זיכויים. חודש ב-0 או נכנס ≥ הובטח = קוימה. חלקית ולא קוימה נבדקות שוב בכל ריצה.
   - reads: CustomerNotes, Payments, Receipts, OpenMovements
   - writes: CustomerNotes
   - next: 9
9. **משימת ההתחייבויות** · קוד · `BuildTasks`
   - line: "התחייבויות שלא קוימו – ליצור קשר", משימה אחת לכל עובדת.
   - explain: רק שורות קוימה חלקית / לא קוימה, עם הובטח, נכנס ונשאר. שורה יוצאת כשהחודש מתאפס או כשההתחייבות הופכת ל"קוימה". המשימה נפתחת רק אחרי ריצת התקבולים.
   - writes: CollectionQueue
   - next: 10
10. **ההערות בתקבולים** · קוד · `CheckCommitments`
   - line: ההערות לא משמשות יותר להתאמת תקבול; הן נבדקות מול הקבלות (8).
   - explain: שלב "הערה" בסולם ההתאמה נמחק עם הסולם הישן בגל 3 (08.11). תקבול מזהה לקוח בלבד, ובדיקת החוב והפיזור באים אחריו (01, בלוקים 7–8). ההתחייבויות נבדקות מול מה שנכנס בבלוק 8.
   - reads: CustomerNotes
   - next: —
11. **דוח הגיול במסך** · מסך · `AgingByMonth`
   - line: לקוח × חודש: סה״כ, צ׳יפ הערות, חלון צף.
   - status: פעיל (a/aging-screens)
   - reads: AgingByMonth, CustomerNotes
   - next: 5

---

## 03 · ביטוח אשראי

1. **משיכה מ-Priority ו-ICIC** · Priority · מראות `CreditCovers`, `CustomerExposure`, `ExposureItems`
   - line: המכסה, האובליגו הסטטי ופירוט האובליגו.
   - explain: המכסה (מבטח, מספר, מסגרת מבוטחת, תוקף, סטטוס) מגיעה מ-Priority או מ-ICIC. האובליגו הסטטי ופירוט האובליגו לפי סוג מגיעים מ-Priority. לא מחשבים אותם אצלנו, רק קוראים. הסנכרון הוא TODO, ועד אז הנתונים הם נתוני בדיקה.
   - writes: CreditCovers, CustomerExposure, ExposureItems
   - next: 2
2. **אובליגו דינמי** · קוד · `GetCreditExposure`
   - line: הסטטי, פחות מה שכבר נכנס ועוד לא ב-Priority.
   - explain: מהסטטי מורידים:
     - העברות של הלקוח במצב "ממתינה לפירוט";
     - קבלות "מוכנה" שעוד לא הונפקו ב-Priority.
     
     כל העברה נספרת פעם אחת, והתוצאה לא יורדת מתחת ל-0. החישוב נעשה בזמן התצוגה ולא נשמר.
   - reads: CustomerExposure, BankLines, Receipts
   - next: 2א, 3
   - 2א. **צ׳קים שלא הופקדו** · קוד
     - line: מוצגים בנפרד, "צפוי לרדת בהפקדה".
     - explain: צ׳ק יכול לחזור, ולכן הוא לא יורד מהדינמי. מוצגים הסכום, תאריך הפירעון, והאובליגו "אחרי הפקדה".
     - reads: ExposureItems
     - next: 3
3. **ניצול** · קוד · `GetCreditExposure`
   - line: סטטי ודינמי מול המסגרת המבוטחת, ב-% וב-₪.
   - explain: הניצול הוא האובליגו חלקי המסגרת של המכסה בתוקף. מוצג גם המרווח שנשאר. מ-80% ומעלה הצבע משתנה.
   - reads: CreditCovers, AgentSettings (insuranceThresholdPct)
   - next: 4, 5
4. **התראות במסך היום** · קוד · `GetCreditExposure` (כל הלקוחות)
   - line: ניצול גבוה ופקיעה, רק למכסות בתוקף.
   - explain: יש שתי התראות, וכל אחת מקשרת ללשונית בכרטיס הלקוח:
     - **ניצול גבוה:** הניצול הדינמי ≥ 80%. אין התראה נפרדת מעל 100%.
     - **פקיעה:** התוקף מסתיים בתוך 30 יום (coverExpiryAlertDays, לאשר עם יניב).
   - reads: CreditCovers, CustomerExposure, AgentSettings
   - next: 5
5. **לשונית "אובליגו"** · מסך · כרטיס הלקוח `?tab=credit`
   - line: לכל לקוח; עם ביטוח מול הסכום המבוטח, בלי ביטוח מול מסגרת האשראי.
   - explain: בלשונית מוצגים פרטי המכסה (או, בלי ביטוח, מסגרת האשראי של Priority כבסיס), האובליגו הסטטי, האובליגו הדינמי עם הסיבה לכל הפחתה, והניצול. כל העברה בבירור מקשרת לרשומה שלה בתקבולים. מוצג גם פירוט האובליגו לפי סוג. הצעת הגדלה פתוחה מוצגת לקריאה בלבד.
   - next: 6, 7
6. **הרחבת מסגרת / חידוש** · אדם · דמה
   - line: "יחובר ל-ICIC". חידוש מופיע רק כשהתוקף עומד להסתיים.
   - explain: הכפתורים לא עושים כלום כרגע. החיבור ל-ICIC (מפתחות, קריאות, מגבלה יומית) הוא TODO.
   - next: —
7. **הצעת הגדלה** · קוד · אדם · `ProposeInsuranceRequests` → `DecideInsuranceRequest`
   - line: כפתור בכרטיס התראות הביטוח במסך היום; אדם מאשר בלשונית אובליגו וביטוח של הלקוח.
   - explain: לניצול דינמי ≥ 80% הקוד מציע הגדלה של 50% על המסגרת הקיימת, עם מספר המכסה (ORIG_COVER_NO). אדם מאשר, ואת הסטטוס מעדכנים ידנית. שום דבר לא נשלח למבטח ולא נכתב ל-Priority.
   - writes: CreditLimitRequests, Approvals
   - next: —

---

## 04 · פניות

1. **קליטה מהתיבה** · קוד · `ProcessInboundEmail` → `IngestEmail`
   - line: כל 2 דקות, מ-saar@blocks.diy (לייבל Ciment-Test).
   - explain: workflow לכל תיבה מריץ את אותו DAG. הקליטה בודקת כפילות, משייכת תיבה, מחפשת שרשור, אוספת מועמדי לקוח (איש קשר, סוכן מורשה, דומיין, שם בתוכן), קובעת אימות קשיח, ומציבה דדליין של 24 שעות. אימות (מאז 05.11) = השולח רשום כאיש קשר של הנהלת חשבונות (isApContact) בכרטיס; שולח לא מוכר מקבל הצעת לקוח מהחתימה, משימה "זה הלקוח X?" ואישור אדם ב-ConfirmSender (איש קשר "נוסף אצלנו" + משימה "להוסיף איש קשר בפריוריטי"). תעודות והפרשי מחיר → משימה ידנית בלבד; אישור ביטוח אשראי → קישור לבקשה הפתוחה. רק תיבה פעילה אחת (קרן) + תיבת הבדיקה. אימות ישן = או סוכן שהלקוח ברשימת המורשים שלו. מאיה אף פעם לא קובעת אימות.
   - reads: Mailboxes, CustomerContacts, SalesAgents, Approvals
   - writes: InboundEmails
   - next: 2 [תשובה], 3 [מייל חדש]
2. **תשובה בשרשור** · קוד · `AttachThreadReply`
   - line: תשובה לא פותחת פנייה חדשה.
   - explain: הסדר: threadId של הודעה יוצאת, מספר סימוכין CIM-<id> בנושא או בגוף, ואז threadId של מייל נכנס קודם. תשובה לטיוטה בדואר היוצא נרשמת עליה. תשובה במקרה נקשרת למקרה. תשובה לתשובה שלנו פותחת מחדש את הפנייה.
   - reads: Approvals, InboundEmails
   - writes: InboundEmails, Approvals, Disputes
   - next: —
3. **קבצים מצורפים** · קוד · `FetchEmailAttachments`
   - line: PDF וטבלאות הופכים לטקסט; תמונה = "דורש OCR".
   - explain: כל קובץ יורד מ-Gmail ונשמר. PDF עם טקסט → טקסט; Excel ו-CSV → טבלה כטקסט; תמונה או PDF סרוק מסומנים "דורש OCR". קובץ שנכשל לא עוצר את המייל.
   - writes: EmailAttachments
   - next: 4
4. **מאיה ממיינת** · סוכן AI · `CollectionsInboxAgent` (בתוך `ProcessInboundEmail`)
   - line: קריאה אחת, מבנה קבוע, ציטוט לכל נתון.
   - explain: מאיה מקבלת את השולח, מה שהקוד יודע עליו, מועמדי הלקוח, הנושא, הגוף ותוכן הקבצים. היא מחזירה: סוגים עם ציטוט, קוד לקוח מתוך המועמדים או ריק, תפקיד השולח, חשבוניות עם ציטוט, הבטחה אם יש, וסיכום. אין לה כלים במיון.
   - next: 5
5. **בדיקה וניתוב** · קוד · `ApplyMailClassification`
   - line: כל ציטוט נבדק מול המייל; מה שנפסל נשמר עם סיבה.
   - explain: כל ציטוט חייב להופיע במייל או בקובץ, הלקוח חייב להיות מהמועמדים, והחשבוניות חייבות להיות שלו. אחר כך כל סוג רץ במסלול שלו (5א–5ו). כל מייל מקבל טיוטה משולבת אחת ללקוח. אם מאיה נכשלת, המייל נשאר "אחר" ו"לא טופל".
   - writes: InboundEmails, Approvals, CollectionQueue
   - next: 5א, 5ב, 5ג, 5ד, 5ה, 5ו
   - 5א. **1–2 כרטסת / חובות פתוחים** · קוד · `GenerateStatementPdf`
     - line: שולח מאומת: PDF בתבנית של יניב וטיוטת תשובה.
     - explain: שולח לא מאומת מקבל משימה "לאמת שולח", בלי PDF. חובות פתוחים נבנים מהתנועות הפתוחות (מאז 05.11); טבלה ריקה = לא ידוע, בלי PDF. התשובה על אותו thread (Re: הנושא המקורי). סף שליחה אוטומטית mailAutoReplyAt כבוי. הקובץ שבתצוגה הוא הקובץ שמצורף לטיוטה. מצב: לא טופל.
     - reads: LedgerEntries, OpenMovements
     - writes: Approvals
     - next: 6
   - 5ב. **3 תעודות וחשבוניות** · קוד · `CheckDocumentScans`
     - line: הכול סרוק: חבילה ללקוח. חסר: מקרה וטיוטה ללוגיסטיקה.
     - explain: מקרה "ממתינה לסריקה", טיוטה לאיש הלוגיסטיקה של קו המוצר וטיוטה קצרה ללקוח. מאז 05.11 רק משימה ידנית "תעודות / חשבוניות חסרות – טיפול ידני". מצב: לא טופל.
     - reads: DeliveryNotes, ProductLineContacts
     - writes: CollectionQueue
     - next: 6
   - 5ג. **4 הפרש מחיר** · קוד · `AnalyzePriceGap`
     - line: ניתוח פער לכל שורה, מקרה מחיר וטיוטות.
     - explain: טיוטה לסוכן ולמנהל, וטיוטה קצרה ללקוח בלי הבטחת זיכוי. מאז 05.11 רק משימה ידנית "זיכוי / הפרש מחיר – טיפול ידני". מצב: לא טופל.
     - reads: InvoiceLines, PriceListItems, SalesAgents
     - writes: CollectionQueue
     - next: 6
   - 5ד. **5 פירוט תשלום** · קוד · `ApplyMailClassification`
     - line: המייל משויך ללקוח, ומשמש את מדרגת המייל בזיהוי.
     - explain: מאז 08.11 אין בדיקה חוזרת של שורות (LinkRemittance נמחק). המייל נשמר משויך ללקוח, ומדרגת "מייל מ-7 הימים האחרונים" בזיהוי הלקוח (IdentifyCustomers) קוראת אותו. מצב: ממתין להתאמת התקבול.
     - reads: InboundEmails
     - writes: InboundEmails
     - next: 6
   - 5ה. **הבטחת תשלום** · קוד · `ApplyMailClassification` → `AddCustomerNote`
     - line: הצעה רק עם סכום ותאריך מצוטטים; אדם מאשר.
     - explain: ההצעה נשמרת על המייל; "אשר הבטחה" כותב הערת התחייבות לתשלום אחת ל-CustomerNotes (05 · משימות, בלוק 7). מצב: לא טופל עד האישור.
     - writes: InboundEmails, CustomerNotes
     - next: 6
   - 5ו. **אחר / לא רלוונטי** · קוד
     - line: אחר: טיוטה קצרה ומשימה. לא רלוונטי: נסגר, הגוף נמחק.
     - explain: מייל לא רלוונטי נסגר כ"טופל" ע״י מערכת.
     - writes: Approvals, CollectionQueue
     - next: 6
6. **מסך הפניות** · מסך · `/collections/inbox`
   - line: דואר נכנס בתיקיות, פאנל מייל, דואר יוצא, אוטומציות.
   - explain: תיקיות לפי סוג עם תג "לא טופל" ו"ממתין". הפאנל מציג את הראיות (ציטוטים, אימות, מה נפסל) ובצד את ה-PDF והטיוטות. מצב הטיפול משתנה ב-SetEmailHandling; "ממתין" דורש "למי".
   - reads: InboundEmails, EmailAttachments, Approvals
   - writes: InboundEmails, Interactions
   - next: 7
7. **אישור טיוטה** · אדם · `DecideApproval`
   - line: אישור, עריכה או דחייה. שום דבר לא נשלח.
   - explain: טיוטה מאושרת עוברת ל"אושר – לא נשלח". השליחה עצמה היא TODO.
   - writes: Approvals
   - next: —
8. **אוטומציה חודשית** · קוד · `RunDueAutomations` → `RunMailAutomation`
   - line: ב-5 לחודש ב-08:00 (מאז 05.11; היה ב-15): חובות פתוחים מהתנועות הפתוחות לכל לקוח ביתרת חובה.
   - explain: workflow שעתי (MailAutomationsRunner) מריץ כל אוטומציה פעילה שהגיע מועדה ושעוד לא רצה החודש. לקוח מוחרג נרשם עם סיבה. כל הרצה נרשמת בהיסטוריה ויוצרת טיוטות בדואר היוצא. "הרץ עכשיו" במסך: קודם תצוגה, אחר כך יצירה.
   - reads: MailAutomations, Customers, Invoices
   - writes: Approvals, MailAutomationRuns
   - next: 7

---

## 05 · משימות

1. **רישום הערה** · אדם · `AddCustomerNote` / `UpdateCustomerNote`
   - line: הערה אחת = לקוח + חודש פירעון; התחייבות לתשלום היא סוג הערה.
   - explain: מאז גל 3 (08.11) אין יותר הבטחות והערות גיול נפרדות: כל הערה נכתבת ל-CustomerNotes (דוח הגיול, כרטיס הלקוח, "אשר הבטחה" במייל, תמר). ארבעת הסוגים הפעילים (התחייבות לתשלום, תשלום באשראי, צ׳ק אצל סוכן, חזור אליי) דורשים תאריך ופותחים משימה מרוכזת ביום שלה. פירוט מלא: 02 · דוח גיול, בלוקים 5–9.
   - writes: CustomerNotes, CollectionQueue
   - next: 2
2. **בדיקת התחייבויות** · קוד · `CheckCommitments`
   - line: ביום שאחרי המועד, אחרי ריצת התקבולים: קוימה / קוימה חלקית / לא קוימה.
   - explain: נבדק מול הקבלות והתנועות הפתוחות של החודש. חודש שהתאפס = קוימה (סופי). קוימה חלקית ולא קוימה נכנסות למשימה המרוכזת "התחייבויות שלא קוימו – ליצור קשר". פירוט: 02 · דוח גיול, בלוקים 8–9.
   - reads: CustomerNotes, Receipts, ReceiptAllocations, OpenMovements
   - writes: CustomerNotes, CollectionQueue
   - next: 3
3. **שכבת החשבונית** · קוד · `RefreshInvoiceLayer`
   - line: סטטוס משנה אחד לכל חשבונית, לפי קדימות.
   - explain: ראשי: פתוחה / סגורה. משנה (אחד, לפי קדימות): בבירור > שולמה חלקית > פתוחה. נשמר ב-subStatus ו-openDisputeId באותו רענון שכותב את מצב התשלום. "הובטחה" כבר לא נקבעת: התחייבות היא על לקוח + חודש, לא על חשבונית. הסכום ששולם מוצג תמיד בנפרד.
   - reads: Disputes, ReceiptAllocations
   - writes: Invoices (השכבה שלנו)
   - next: 4
4. **ציון חומרה** · קוד · `collections-severity`
   - line: 70% סכום / 30% ימי פיגור, ציון 0–100.
   - explain: ציון = 100 × (0.7 × min(יתרה / 100,000, 1) + 0.3 × min(ימי פיגור / 90, 1)). מ-70 קריטית, מ-45 גבוהה, מ-20 בינונית, מתחת נמוכה. המשקלים, התקרות והספים הם הגדרות (AgentSettings, severity*). אותו ציון ממיין כברירת מחדל את החשבוניות הפתוחות בכרטיס הלקוח.
   - reads: Invoices, AgentSettings
   - next: 5, 6
5. **סריקת משימות 06:00** · קוד · `RunDaySchedule` → `BuildTasks` · בנוי
   - line: סגירת חודשים שהתאפסו → שכבת החשבונית → בניית המשימות, לפי מפתח.
   - explain: שלב 06:00 של יום העבודה: משיכות הבוקר, CloseSettledNotes, RefreshInvoiceLayer ו-BuildTasks (כולל המשימות המרוכזות של ההערות). גבייה: חשבונית בפיגור מעל 7 ימים בלי בירור פתוח ובלי התחייבות פתוחה או הערת בירור על אותו לקוח + חודש → "לגבות מהלקוח"; בירור שהגיע מועד הבדיקה החוזרת; תעודות משלוח חסרות. פניות: מייל שלא טופל, שולח לאימות, טיוטה לאישור. תקבולים: לקוח לא מזוהה, צריך פיזור, פירוט לא התקבל, צ׳ק חוזר (קריטית). משימה אחת לכל בעיה (taskKey); מה שנפתר נסגר אוטומטית עם סיבה; משימה שאדם סגר נשארת סגורה. המשימות הישנות "הבטחה הופרה" ו"מעקב הערת בירור" לא נפתחות יותר.
   - reads: Invoices, CustomerNotes, Disputes, InboundEmails, Approvals, BankLines, AgentSettings
   - writes: CollectionQueue
   - next: 5א
   - 5א. **עדכון מיידי מהכותבים** · קוד · `syncTasksAfterWrite` · בנוי
     - line: כל פעולה מעדכנת את המשימות שלה מיד, בלי לחכות לבוקר.
     - explain: מיון מייל, סימון טיפול, טיוטה חדשה, החלטה על טיוטה, בדיקת שורת בנק, פיזור והערה מריצים את אותו מנוע משימות על התחום שלהם בלבד. כשל בעדכון לא מפיל את הפעולה עצמה; הסריקה של הבוקר משלימה. משימה ידנית (CreateTask) מקבלת מפתח manual: והסריקה לא נוגעת בה.
     - writes: CollectionQueue
     - next: 5ב
   - 5ב. **דף המשימות** · מסך · `CollectionQueue` · בנוי
     - line: /collections/tasks; משימה מרוכזת נפתחת לשורות.
     - explain: מיון לפי חומרה, אחר כך הציון, אחר כך הוותיקה. משימה מרוכזת נפתחת לשורות הלקוחות עם "טופל"; דף הבנק ראשון ודחוף; מתג "התראות" מציג התראות בלי פעולה. אדם מסמן "בטיפול", "טופל" או "דחה"; משימה שאדם סגר נשארת סגורה.
     - reads: CollectionQueue, OpenTasks
     - writes: CollectionQueue
     - next: —
6. **כרטיס הלקוח** · מסך · `GetCustomer360` · בנוי
   - line: פיד הערות, פס התחייבויות, חודשים פתוחים עם "הערה" לחודש.
   - explain: הפיד בנוי מ-CustomerNotes; פס ההתחייבויות לפי outcome עם נכנס / נשאר; טבלת החודשים הפתוחים (openMonths) עם כפתור "הערה" לכל חודש. כל קבלה מראה מה כיסתה ומה נשאר פתוח. טאב אובליגו ללקוח מבוטח (03 · ביטוח אשראי, בלוק 5).
   - reads: CustomerNotes, OpenMovements, Receipts, ReceiptAllocations
   - writes: CustomerNotes (דרך `AddCustomerNote`)
   - next: —
7. **הבטחה ממייל** · סוכן + אדם · `ApplyMailClassification` → `AddCustomerNote` · בנוי
   - line: מאיה מציעה, האחראית מאשרת; תשלום מותנה = בירור.
   - ladder (לפי מה שמאיה החזירה, עם ציטוט שנמצא במייל):
     1. **הבטחה בלי תנאי ועם תאריך** · סוכן · בנוי — נשמרת כהצעה על המייל (ממתינה לאישור). המשימה: "לאשר הבטחה מהמייל". (InboundEmails)
     2. **תשלום מותנה בתיקון, או טענה שהחשבונית שגויה** · סוכן · בנוי — הערת "אחר" (בירור – סיבה) לכל חודש של החשבוניות שצוטטו, פעם אחת לכל מייל. לא נוצרת התחייבות. (CustomerNotes)
     3. **"כבר שילמנו"** · סוכן · בנוי — פירוט תשלום, לא בירור (01 · תקבולים).
   - explain: "אשר הבטחה" בפאנל המייל רושם הערת התחייבות לתשלום אחת על החודש הוותיק של החשבוניות שצוטטו (מקור: מאיה ממייל), מסמן את ההצעה "אושרה" ואת המייל "טופל". אישור שני של אותו מייל נדחה ולא כותב כלום.
   - reads: InboundEmails, OpenMovements
   - writes: InboundEmails, CustomerNotes, CollectionQueue
   - next: 2
8. **פיד שיחות בכרטיס** · מסך · `GetCustomer360` · בנוי
   - line: הערות, מיילים, טיוטות, שיחות ובירורים בפיד אחד, החדש למעלה.
   - explain: הפיד נבנה מהשורות ש-GetCustomer360 מחזיר. מייל נפתח בפאנל המייל. הערה שתמר רשמה מסומנת "נרשם דרך תמר".
   - reads: CustomerNotes, InboundEmails, Approvals, Interactions, Disputes
   - next: —
9. **תמר בכרטיס** · סוכן + אדם · `CustomerCardAgent` → `AddCustomerNote` · בנוי
   - line: האחראית כותבת מה הלקוח אמר, תמר רושמת הערה לחודש אחרי אישור במילים.
   - explain: בועת צ׳אט בתוך הכרטיס. תמר קוראת את החודשים הפתוחים, כותבת בשורה אחת מה ייכתב, ורושמת רק אחרי "כן" של האחראית, דרך AddCustomerNote (מקור: תמר בכרטיס). היא לא שולחת מיילים ולא כותבת ל-Priority.
   - reads: CustomerNotes, OpenMovements
   - writes: CustomerNotes, CollectionQueue
   - next: 10
10. **סיכום יומי ללקוח** · סוכן · `MorningRun` → `CustomerSummaryRun` · בנוי · workflow א׳–ה׳ 07:30
   - line: תמר כותבת לכל לקוח שני-שלושה משפטים והצעה לפעולה אחת, בראש הכרטיס.
   - explain: PrepareCustomerSummaries (קוד) אוסף לכל לקוח עם יתרה, משימה, התחייבות פתוחה או הצעת הבטחה ממייל את העובדות (יתרה, פיגור, התחייבות פתוחה, התחייבויות שלא קוימו, הערות פעילות, בירורים, משימות, קשר אחרון); תמר מחזירה מבנה קבוע; WriteCustomerSummaries (קוד) בודק וכותב, ולכל לקוח שחסר כותב סיכום מהעובדות ("קוד (גיבוי)").
   - reads: Invoices, CustomerNotes, Disputes, CollectionQueue, Interactions, InboundEmails
   - writes: CustomerDailySummaries
   - next: —
