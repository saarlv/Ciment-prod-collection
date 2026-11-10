# Design 01 · תקבולים והתאמות

The content of the build-stage page /collections/design, tab "01 · תקבולים". It is the refined and styled version of Saar's design file "Design 01 – ארכיטקטורה – תקבולים והתאמות" (25.10). Changes from the original:
- table and column names match the app's real tables;
- links between tables are text codes and not uuid;
- aliases are their own table;
- the match lives in a match proposal and not on the bank line;
- mail is searched only with approval, up to 30 days back;
- the open balance (openAmount) exists;
- the steps and the right/wrong marks are recorded;
- (25.10, after the aging review) invoice matching also reads the aging notes, and an approved match marks the invoice as paid in our invoice layer.
- (26.10) the receipt comes at the end: Nina proposes a split (full / partial / several invoices) with a source per line, the person always decides, and only then one receipt (Receipts) with its allocations (ReceiptAllocations) is prepared. A "בקשת פירוט" button keeps the record open as a ticket with its correspondence (ReceiptThreads).
- (27.10) once the customer is known, the mail search runs by itself as a fixed query (30 days, the customer's AP contacts, keywords = amount, open invoice numbers, payer name); Nina only reads what it found. Several aging-note promises can together make a split. "בקשת פירוט" is an always-available button, recorded as "הוצע". The old RunMatching engine is retired. The invoice stage on screen is one panel.
- (03.11, plan r3 stage 1, turn 1 — schema only, the logic changes in the next turns) **the receipt comes first:** a receipt will be created as a draft when the customer is identified (receiptStatus טיוטה – ממתינה לאישור → אושרה – לא נשלחה; Priority is not connected) with a matchStatus (התאמה מוצעת – לאישור / מותאמת / על חשבון – צריך התאמה). A receipt and its match proposal are approved together in one task, with one click. With autoCloseReceipts on, the receipt is approved by itself, and the match still waits for approval unless it is certain (a remittance mail from a configured sender). Mail is searched only for customers flagged checkRemittanceMail, and only from their remittanceSenders; flag on with no sender is a configuration error and the customer is skipped. Nina no longer has an approval action. New task types: התאמה מוצעת – לאישור / קבלה – צריך התאמה / לא זוהה.
- (03.11, built in steps 1–2) **receipt first, the logic and the screens:** matching order (1) remittance mail, flagged customers and configured senders only, (2) customer + month aging note, only if that month's open invoices sum to the transfer, (3) all invoices with one due date sum to the transfer, (4) "סוגר עד פה", an exact cut in due order; anything else → the receipt on account + task "קבלה – צריך התאמה". Not one-to-one (two months / two due dates / a cut that could swap an equal-amount invoice) → no proposal, the same task with needsManagerApproval ("לאישור מנהל", a label only for now). Unknown payer → task "לא זוהה", no receipt. One status field: receiptStatus טיוטה – ממתינה לאישור / אושרה – לא נשלחה / הונפקה ב-Priority (the old status column was removed in step 3, 03.11). autoCloseReceipts approves the receipt as "סגירה אוטומטית (מערכת)". Payer names are normalised (spaces, the conjunction ו) and every manual resolution saves an alias. Write order compute → write → read back → status last, rolled back on failure. Nina explains through ExplainMatch (read-only) and approves nothing. Screens: one-click approval in the task, the manager badge, "שייך ללקוח", the autoCloseReceipts switch and the config-errors list in Settings, the "פירוט במייל" panel on the customer card, receiptStatus + matchStatus on every receipts row.
- (03.11, plan r3 stage 2, built) **the bank lines come from Priority:** BankLines is a mirror of Priority's screen "שורות דפי בנק" (SyncPriorityBankLines; a labelled test source until the API is connected). Deduped on priorityLineId. Only lineType העברה / זיכוי בנק go to the check; פירעון צ׳ק / אחר are shown separately and not handled. The upload, the bank-file reader (BankFileReader, disabled, its artifact kept) and the verification panel are gone from the screens. No schedule until the API exists (Saar's decision): the pull runs from the button "משוך עכשיו מפריוריטי". See section 2ב.
- (05.11, plan 04.11 r2 part B stage 4, branch b/identify-receipt) **identify, then the receipt:** every bank line that enters the run gets a customer with a confidence 0–100 and the run stops there (IdentifyCustomers, code only). Certain = at or above identifyCertainAt (90). "אשר את כל הוודאיים" and one-by-one approval issue the receipt (IssueReceipt): the receipt PDF and a mail draft to the customer's accounts-payable contact, which a person approves and which stops at "אושר – לא נשלח"; no contact → task "חסר איש קשר הנהלת חשבונות". The source switch bankLinesSource (קובץ / שורות פריוריטי) brings back the upload and the line confirmation in file mode. The invoice ladder of 2א is no longer called by the run; the debt check against due months and the allocation come in stage 5–6 (b/debt-allocation). See section 2ג.
- (round 4) the found mails are read by a separate reader, קורא הפירוטים: one pure LLM call per record, like a tool (29.10: no persona, no name, no avatar, no chat, no tools; exactly like the bank-file reader), per email relevant or not with a reason, and the lines it extracted with quotes. The code checks the read, and only then Nina combines it with the aging notes. Evals scaffold for the reader.
- (08.11, after wave 3) **one flow on the screen:** the old record-by-record check ("נכנסות לבדיקה", the invoice ladder panel, the mail search with approval, the remittance reader, "בקשת פירוט" and its threads, the matching run of the bank-file morning import) was deleted from the code and the screens. Every bank line goes identify → receipt → debt check → allocation (2ג, 2ד); clicking a row opens one record with these four steps (GetReceiptRecord). The only person decision left in DecideMatchProposal is "הונפקה ב-Priority". Sections 2א and the old step 6–8 text are kept below only as a short history.

The page renders this content; the frontend may restyle but not change the meaning.

**סנכרון עם Priority:** איך ומתי הלקוחות, החשבוניות והקבלות כאן מתעדכנים מ-Priority מתואר במסמך החוצה "סנכרון עם Priority".

## 1. איך זה עובד היום בסימנט
כל בוקר מנהלת חשבונות מורידה מהבנק את ההעברות של אתמול. לכל העברה היא מזהה לאיזה לקוח היא שייכת, מפיקה קבלה וסוגרת מולה את החשבוניות ששולמו.
- **בבנק יש רק שם מעביר וסכום.** אין מספר חשבונית, והשם לא תמיד זהה לשם בכרטיס הלקוח. למשל, העברה מ"אבי ובניו" שייכת ללקוח "גולף".
- **כשהשם לא מוכר,** מחפשים הודעה מוקדמת של הסוכן או של הלקוח. אם אין כזו, שואלים בקבוצת ה-WhatsApp של הסוכנים.
- **אחרי שהלקוח ידוע,** מחפשים את החשבונית או החשבוניות שתאריך הפירעון והסכום שלהן מתאימים להעברה.

## 2. במערכת החדשה
נינה (הסוכנת) וקריאת LLM אחת עושות את העבודה, וכל השאר קוד קבוע. קריאת LLM היא כמו כלי: קלט קבוע, פלט במבנה קבוע, בלי שם, בלי אווטר ובלי צ׳אט.
- **קורא הקובץ** (BankFileReader, קריאת LLM) קורא קובץ דף בנק, רק במצב "קובץ" (bankLinesSource). במצב "שורות פריוריטי" אין קובץ לקרוא.
- **נינה** מסבירה ומציעה בצ׳אט: איך זוהה הלקוח, מה יצא בבדיקת החוב ומה פוזר (ExplainMatch, GetReceiptRecord). היא לא מאשרת דבר.
- **קורא הפירוטים** (קריאת מיילי הפירוט) **הוסר ב-08.11** יחד עם סולם ההתאמה לחשבוניות: אין יותר התאמה לחשבוניות לפי מייל.

זיהוי הלקוח, הקבלה, בדיקת החוב והפיזור הם קוד קבוע: סכומים, פירעונות, שמות, כינויים וכפילויות. ההחלטה הסופית תמיד של המשתמש. שום דבר לא נשלח ושום דבר לא נכתב ל-Priority.

## 2א. קבלה קודם (03.11, תוכנית r3 שלב 1) · הוחלף ונמחק
מ-03.11 נוצרה קבלה בטיוטה ברגע שהלקוח זוהה, ואחריה סולם התאמה לחשבוניות: פירוט במייל → הערת גיול → אותו מועד פירעון → "סוגר עד פה", עם כלל חד-חד-ערכי ואישור מנהל. העיקרון "קבלה קודם" נשאר (2ג). הסולם, ה-matchStatus הישן (התאמה מוצעת – לאישור / מותאמת / על חשבון – צריך התאמה), אישור המנהל, autoCloseReceipts ו"שייך ללקוח" של הסולם הוחלפו בבדיקת החוב ובפיזור (2ד, 05.11) ונמחקו מהקוד ומהמסכים ב-08.11.

## 2ב. המקור: שורות דפי בנק מפריוריטי (מ-03.11, תוכנית r3 שלב 2, נבנה ונבדק)
**למה.** איריס בסימנט כבר טוענת כל בוקר את דפי הבנק לפריוריטי, למסך "שורות דפי בנק". אין סיבה להעלות קובץ שוב ולקרוא אותו ב-AI: מושכים את השורות המוכנות. לכן סוכן הקריאה ופאנל האימות יוצאים.

**המשיכה (SyncPriorityBankLines):**
- כל שורה נשמרת עם source, priorityLineId ו-syncedAt. כרגע המקור הוא מקור בדיקה (priority-mock), כי פריוריטי לא מחובר.
- **מניעת כפילויות לפי priorityLineId:** שורה שכבר קיימת רק מקבלת חותמת syncedAt חדשה. שורה ישנה מקובץ עם אותם חשבון, תאריך, סכום, מעביר ואסמכתא מאומצת, ולא נוצרת שוב. כל השאר נוצרות כ-PL-<priorityLineId>.
- כל משיכה היא שורה אחת ב-ImportBatches, מסוג "שורות דפי בנק – Priority".
- dryRun הוא ברירת המחדל של הפעולה. הכפתור במסך מריץ אותה באמת.

**סינון לפי סוג שורה (lineType):**
| סוג | מה קורה |
|---|---|
| העברה | נכנסת לזיהוי (סעיף 2ג) |
| זיכוי בנק | נכנסת לזיהוי |
| פירעון צ׳ק | מוצגת בנפרד ב"לא מטופלות", בלי בדיקה |
| אחר | מוצגת בנפרד ב"לא מטופלות", בלי בדיקה (למשל ריבית זכות) |

שורות ישנות מקובץ (בלי priorityLineId) נשארות לצפייה בלבד, בחלק מקופל "שורות ישנות מקובץ (לצפייה)".

**התזמון (החלטת סער, 03.11):** הבקשה הייתה כל 15 דקות בין 08:00 ל-10:00, א׳–ה׳. הפלטפורמה מתזמנת לכל היותר פעם בשעה, ולכן אין תזמון עד שיהיה API. המשיכה רצה מהכפתור "משוך עכשיו מפריוריטי".
- **השעות הן הגדרות** (בסיס "החלטת יניב"): bankPollStart 08:00, bankPollEnd 10:00, bankPollInterval 15, receiptsReadyBy 10:00. כרגע רק receiptsReadyBy פעיל. השלוש האחרות שמורות לתזמון שיבוא עם ה-API.
- **"דפי בנק לא נטענו":** משיכה שרצה אחרי receiptsReadyBy ביום עסקים, ולא החזירה אף שורה של היום, פותחת משימה אחת (bank-missing:<תאריך>). המשימה נסגרת לבד כשהשורות מגיעות. משימה שאדם סגר נשארת סגורה באותו יום. בלי תזמון אין בדיקה אוטומטית ב-10:00: המשימה נפתחת רק כשמישהו מושך.
- סריקת המשימות (BuildTasks) נשארת ב-06:00.

**המסך.** מסך התקבולים נפתח על "היום":
- "נמשך מפריוריטי ב-HH:MM", או "עוד לא נמשכו שורות של היום מפריוריטי".
- הכפתור, ולידו מקור הבדיקה: יום מלא / יום ריק.
- רשימת הזיהוי (2ג), "לא מטופלות", ולמטה השורות הישנות.
- כפתור איפוס היום ירד: ResetReceiptsDay מאפס רק קבצים שהועלו (פער).

**נבדק בריצה אמיתית (03.11):** יום מלא החזיר 15 שורות (12 העברה, 1 זיכוי בנק, 1 פירעון צ׳ק, 1 אחר). 13 השורות של שלב 1 אומצו בלי בדיקה חוזרת, והתוצאות שלהן לא השתנו. פירעון הצ׳ק ו"אחר" לא נבדקו. משיכה שנייה לא יצרה אף כפילות. ביום ריק, אחרי 10:00, ה-dryRun פותח "דפי בנק לא נטענו".

## 2ג. זיהוי וקבלה (מ-05.11, תוכנית 04.11 r2, חלק ב׳ שלב 4)
**למה.** לפי החוק הקבלה יוצאת ביום שהכסף נכנס. לכן הריצה עושה רק דבר אחד לבד: מזהה לכל שורה את הלקוח, עם רמת ביטחון, ועוצרת. אדם מאשר את הלקוח, והאישור מוציא את הקבלה. ההתאמה לחשבוניות כבר לא חלק מהריצה: בשלב הבא בודקים את הסכום מול חודשי הפירעון (בדיקת חוב), ורק אחר כך מפזרים לחשבוניות.

**מקור השורות (bankLinesSource, הגדרה).**
| ערך | מה קורה |
|---|---|
| קובץ (ברירת המחדל) | מעלים קובץ דף בנק, קורא הקובץ (BankFileReader) מחלץ שורות, אדם מאשר את השורות (ConfirmExtractedLines), ואז הזיהוי רץ על שורות הקובץ |
| שורות פריוריטי | "משוך עכשיו מפריוריטי" מושך את השורות המובנות (SyncPriorityBankLines), והזיהוי רץ על השורות החדשות |

בשני המצבים רק העברה וזיכוי בנק נכנסים לזיהוי. פירעון צ׳ק ו"אחר" מוצגים בלבד. איזה מצב נכון נשאל את גילה ונווית.

**זיהוי לקוח עם רמת ביטחון (IdentifyCustomers, קוד בלבד, בלי AI).** המפל הקיים, וכל מדרגה נותנת ציון:
| מדרגה | ביטחון |
|---|---|
| הח״פ של הלקוח מופיע באסמכתא | 100 |
| כינוי מאושר (BankAliases) | 95 |
| השם המנורמל זהה לשם הלקוח | 95 |
| השם הוא של איש קשר רשום | 85 |
| מייל מ-7 הימים האחרונים שכבר שויך ללקוח אחד, עם הסכום המדויק ומילה מהשם | 80 |
| התאמת שם חלקית ללקוח אחד | 70 |
| כמה לקוחות מתאימים (דו-משמעי) | 50 לכל מועמד, עד 5 מועמדים |
| אין התאמה | 0 = לא זוהה |

- **ודאי** = ציון מעל הסף identifyCertainAt (ברירת מחדל 90). הציונים עצמם בטבלה אחת בקוד, ואפשר לשנות אותם.
- **מה נכתב:** לכל שורה מזוהה קבלה אחת בטיוטה (RCPT-<bankLineId>, receiptStatus "טיוטה – ממתינה לאישור", identifyConfidence, identifyStatus ודאי / לא ודאי, receiptSource "דף בנק"), צעד זיהוי עם הראיה והמועמדים, והצעת לקוח ב-MatchProposals (בלי חשבוניות; הטבלה מחזיקה מעכשיו רק הצעות לקוח).
- **משימות:** שורה לא ודאית → "זיהוי לקוח – לאישור" (identify:<bankLineId>). מעביר לא מוכר → "לא זוהה", בלי קבלה. שורה ודאית לא פותחת משימה: היא מחכה ל"אשר את כל הוודאיים".
- **הרצה חוזרת** מעדכנת רק טיוטות. קבלה מאושרת לא נוגעים בה.
- **סף אישור אוטומטי (customerAutoApproveAt):** ריק = כבוי, וזה המצב היום. כשיש בו מספר, שורה מעליו מאושרת לבד ונרשמת "אושר אוטומטית", בלי כינוי חדש.

**האישור מוציא את הקבלה (IssueReceipt).**
- **"אשר את כל הוודאיים":** מאשר את כל השורות הוודאיות שבמסך. השרת בודק כל שורה שוב, ושורה שלא ודאית לא מאושרת כך.
- **אחת-אחת:** שורה לא ודאית או לא מזוהה מאושרת עם הלקוח שהאדם אישר או בחר. לקוח אחר מההצעה, או שם מעביר ששונה משם הלקוח, נשמר ככינוי מאושר.
- **מה קורה באישור:** הקבלה עוברת ל"אושרה – לא נשלחה", identifyStatus "אושר", ו-matchStatus "על חשבון – צריך פיזור" עד בדיקת החוב והפיזור (שלבים 5–6). שורת הבנק מקבלת את הלקוח ואת הקבלה, ומשימות הזיהוי שלה נסגרות.
- **PDF הקבלה (GenerateReceiptPdf):** תבנית אחת, באותו סגנון של הכרטסת. מספר הקבלה, הלקוח וח״פ, תאריך ערך, סכום, אמצעי תשלום, אסמכתא ושם המעביר, "על חשבון", ומי חתומה. עד שיש API כתוב עליו "הופק באפליקציה – טרם הונפק ב-Priority". אותו קובץ מוצג במסך ומצורף למייל.
- **המייל להנהלת החשבונות של הלקוח:** טיוטה אחת בפניות → דואר יוצא (רכיב תקבולים), לאיש הקשר שמסומן isApContact, עם ה-PDF מצורף, בשם העובדת של הלקוח. אדם מאשר, והטיוטה נעצרת ב"אושר – לא נשלח". בקבלה נשמרים sendStatus "טיוטה – בדיקה" ו-sentToEmail.
- **אין איש קשר כזה:** אין טיוטה, sendStatus "חסר איש קשר", ונפתחת משימה אחת ללקוח "חסר איש קשר הנהלת חשבונות" (missing-ap:<customerCode>). היא נסגרת לבד כשנוסף ללקוח איש קשר הנהלת חשבונות עם מייל.
- **אישור שני** לא יוצר קבלה שנייה ולא טיוטה שנייה. אם ה-PDF או הטיוטה נכשלו, הקבלה נשארת מאושרת, ולחיצה חוזרת מנסה רק את המייל.
- **כשיש API:** הקבלה נכנסת לפריוריטי ("הונפקה ב-Priority"), ונשלחת הקבלה של פריוריטי.

**המסך.** בראש: מתי השורות הגיעו, כמה שורות וכמה ודאיות, והכפתור "אשר את כל הוודאיים". מתחת, השורות הלא ודאיות והלא מזוהות קודם, כל אחת עם הלקוח המוצע, רמת הביטחון, הראיה, המועמדים ובחירת לקוח. אחרי אישור, בשורה: הקבלה, PDF, ולמי נשלחה הטיוטה או "חסר איש קשר". מאז שלבים 5–7 (סעיף 2ד): בשורה מאושרת גם תוצאת בדיקת החוב, וכפתור לעורך הפיזור.

**הרשומה (08.11).** לחיצה על שורה ברשימה פותחת רשומה אחת עם ארבעה שלבים, מלמעלה למטה: (1) **זיהוי** – הלקוח, רמת הביטחון, השיטה, המועמדים והצעדים; (2) **קבלה** – המצב, PDF, מצב המייל לאיש הקשר, ההוראה להעתקה ל-Priority ו"הונפקה ב-Priority" עם מספר הקבלה; (3) **בדיקת חוב** – התוצאה, החודשים שנסגרו, והיתרות לפי חודש שמולן נבדק הסכום; (4) **פיזור** – החשבוניות שפוזרו או ההצעה, כמה על חשבון, ועורך הפיזור. לצד אלה ההערות הפתוחות של הלקוח לפי חודש. שלב שעוד לא הגיע מציג מה הוא מחכה לו. אותה רשומה נפתחת ממשימה וגם לצ׳ק של סוכן (בלי שלב זיהוי).

## 2ד. בדיקת חוב, פיזור וצ׳קים של סוכנים (05.11, תוכנית 04.11 r2, חלק ב׳ שלבים 5–7) · שינוי לוגיקה – 11.2026
**שינוי לוגיקה – 11.2026.** סולם ההתאמה לחשבוניות משלב 1 (פירוט במייל → הערת גיול → אותו מועד פירעון → "סוגר עד פה" → על חשבון, וההצעה לא חד-חד-ערכית לאישור מנהל) הוצא. **למה:** ההתאמה לחשבוניות נדחית בפועל, ופריוריטי מסתכל על יתרות לפי חודש פירעון. לכן הבדיקה הראשונה היא מול חודשים ולא מול חשבוניות, והפיזור לחשבוניות הוא שלב נפרד שלא חוסם את הקבלה. הקוד הישן (RunMatching, IdentifyAndMatch, CheckBankLine, SearchLineMail, ApplyMailFinding, קורא הפירוטים, ReceiptDetailRequest, LinkRemittance) נמחק ב-08.11; ב-DecideMatchProposal נשאר רק "הונפקה ב-Priority". MatchProposals מחזיקה רק הצעות לקוח.

**בדיקת חוב (CheckDebt), מיד אחרי שהקבלה אושרה** (IssueReceipt בכל המסלולים, וגם צ׳ק של סוכן). התנועות הפתוחות של הלקוח (OpenMovements) לפי חודש פירעון, מהישן לחדש:
| מה נמצא | debtCheckResult | מה קורה |
|---|---|---|
| הסכום = היתרה המצטברת עד סוף חודש מסוים (±0.01) | נסגר לאפס – מצטבר | debtCheckMonths = החודשים; התראה "נסגר לאפס" (isAlert, debt-zero:<receiptKey>); פיזור מוצע |
| הסכום = בדיוק היתרה של חודש אחד | נסגר לאפס – חודש אחד | אותו דבר, על החודש הזה (הוותיק אם יש כמה) |
| אחרת | לברר מול הלקוח | משימה "לברר מול הלקוח – סכום לא סוגר חודש" (debt-check:<receiptKey>), בלי פיזור מוצע, matchStatus "על חשבון – צריך פיזור" |
- טבלת תנועות ריקה כולה = לא ידוע: לא מחליטים כלום. בדיקה שנכשלה לא מבטלת את הקבלה. הרצה חוזרת לא מחשבת מחדש קבלה שכבר יש לה תוצאה. תנועת הקבלה עצמה (כשכבר במראה) לא נספרת נגדה.
- ExplainMatch (נינה, קריאה בלבד) מסביר מעכשיו את הזיהוי ואת בדיקת החוב.

**פיזור לחשבוניות (ProposeAllocation → ApplyAllocation).**
- **החשבוניות הפתוחות** מהתנועות הפתוחות מסוג חשבונית, מקובצות לפי חודש פירעון (שכבת החשבוניות מוקפאת; Invoices רק לפרטים). יתרה פתוחה של חשבונית = הסכום הפתוח במראה פחות כל הפיזורים שלה מכל הקבלות.
- **ההצעה:** מתחילה מהחודשים שבדיקת החוב סגרה, מהישנה לחדשה עד שהסכום נגמר, האחרונה חלקית, עודף = זכות על חשבון. רק קבלה שנסגרה לאפס מקבלת "פיזור מוצע – לאישור" ומשימה; "לברר מול הלקוח" לא מקבלת הצעה.
- **רמת ביטחון לפיזור (allocationConfidence):** 100 נסגר לאפס ומפוזר בדיוק על חשבוניות שלמות של החודשים; 80 נסגר לאפס אבל החשבוניות לא מסתכמות בדיוק; 50 בלי סגירה, נגמר בדיוק על חשבוניות שלמות; 30 עם חלקית או עודף; 0 אין חשבונית פתוחה.
- **העורך במסך התקבולים** (ה-SplitEditor הקיים): חשבוניות פתוחות לפי חודש, סימון / ביטול, סכום לכל חשבונית, הסכום מתעדכן. אישור = לחיצה אחת.
- **אישור (ApplyAllocation):** בודק הכול לפני שכותב (חשבונית של הלקוח, סכום חיובי ולא מעל היתרה, סה״כ לא מעל הקבלה), מחליף את שורות הפיזור של הקבלה ב-ReceiptAllocations (רבים-לרבים), source "סכום" כשההצעה לא שונתה או "ידני", ומעדכן allocatedAmount / unallocatedAmount / matchStatus: מפוזרת / מפוזרת – עודף על חשבון / על חשבון – צריך פיזור. כתיבה שנכשלה חוזרת אחורה.
- **משימה "קבלה – צריך פיזור"** (allocate:<receiptKey>) פתוחה כל עוד הקבלה לא פוזרה עד הסוף ויש חשבוניות פתוחות; נסגרת לבד. כשהקבלה מפוזרת, גם משימת בדיקת החוב שלה נסגרת. ההתראה "נסגר לאפס" נשארת.
- **בכרטיס הלקוח:** לכל קבלה מה היא כיסתה (חשבונית, סכום, חלקית) ומה נשאר פתוח – "שילמת על X, Y, Z ולא על א, ב, ג".

**צ׳קים של סוכני שטח (PullAgentReceipts).** בשלב 09:00, אחרי שדף הבנק עלה וריצת התקבולים הצליחה (וגם בכפתור): תשלומים במראה Payments מסוג צ׳ק / צ׳ק דחוי עם collectedBy, מ-14 הימים האחרונים → קבלה לכל אחד (RCPT-AGT-<paymentRef>, receiptSource "צ׳ק סוכן", identifyStatus אושר, מספר הקבלה של פריוריטי), בלי זיהוי ובלי מייל, ואז אותה בדיקת חוב ואותו פיזור. הערות "צ׳ק אצל סוכן" פעילות על החודשים שהצ׳ק משלם נסגרות דרך מנוע ההערות (עם משפט שמציין את הצ׳ק); צ׳ק קטן מסכום ההערה משאיר אותה פתוחה. איך מזהים בפריוריטי קבלה של סוכן נשאל את גילה ונווית; בבדיקה שני צ׳קים לדוגמה (TEST-014, TEST-013).

**שני ספים אוטומטיים, כבויים:** customerAutoApproveAt (זיהוי) ו-allocationAutoApproveAt (פיזור). ריק = כבוי. מה שנסגר לבד נרשם "אושר אוטומטית" – ב-identifyStatus של הקבלה, ובשורות הפיזור בעמודה sourceRef (שמחזיקה מעכשיו את המאשר).

## 3. הזרימה (בלוקים)
1. **השורות מגיעות.** במצב "שורות פריוריטי": "משוך עכשיו מפריוריטי" (SyncPriorityBankLines), עם מניעת כפילויות לפי priorityLineId ו"דפי בנק לא נטענו" אחרי receiptsReadyBy. במצב "קובץ": העלאה, קורא הקובץ ואישור השורות (ConfirmExtractedLines).
2. **סינון לפי סוג שורה.** רק העברה וזיכוי בנק ממשיכות. פירעון צ׳ק ו"אחר" מוצגות בלבד. צ׳ק חוזר = משימה דחופה, לא תקבול.
3. **זיהוי לקוח (IdentifyCustomers).** לקוח עם רמת ביטחון 0–100 לכל שורה; ודאי / לא ודאי / לא זוהה; טיוטת קבלה לכל שורה מזוהה; משימה "זיהוי לקוח – לאישור" או "לא זוהה".
4. **אישור = קבלה (IssueReceipt).** "אשר את כל הוודאיים" או אחת-אחת עם בחירת לקוח (כינוי נשמר): הקבלה "אושרה – לא נשלחה", PDF, טיוטת מייל לאיש הקשר של הנהלת החשבונות או משימה "חסר איש קשר".
5. **בדיקת חוב (CheckDebt).** מול התנועות הפתוחות לפי חודש פירעון: נסגר לאפס (מצטבר / חודש אחד) + התראה ופיזור מוצע, או "לברר מול הלקוח" + משימה.
6. **פיזור לחשבוניות (ProposeAllocation → ApplyAllocation).** מהישנה לחדשה, האחרונה חלקית, עודף על חשבון; העורך במסך; משימה "קבלה – צריך פיזור" עד שמפוזר.
7. **הנפקה ב-Priority, ידנית.** אדם מעתיק את ההוראה, מנפיק ב-Priority ומסמן "הונפקה ב-Priority" עם מספר הקבלה (DecideMatchProposal priorityDone). כתיבה ישירה ל-Priority תבוא עם ה-API.
8. **צ׳קים של סוכנים (PullAgentReceipts)** נכנסים בשלב 5 בלי זיהוי, וסוגרים הערות "צ׳ק אצל סוכן".

**איפה רואים את זה:** במסך התקבולים הרשימה והרשומה (2ג); בכרטיס הלקוח לכל קבלה מה היא כיסתה; במשימות אותה רשומה. כל צעד זיהוי נרשם (ReceiptCheckSteps), וכל סימון "נכון / טעות" נשמר (AgentFeedback).

## 4. סכמת הטבלאות
אלה הטבלאות האמיתיות של האפליקציה. הקישורים בין הטבלאות הם קודים בטקסט (customerCode, invoiceNumber), ועוד אין עמודות קישור.

### ImportBatches — מסמך בנק שהועלה (במקור: bank_imports)
| עמודה | סוג | הערה |
|---|---|---|
| id | מזהה | מפתח |
| fileName, fileUrl, fileType, fileSize | טקסט, מספר | המסמך המקורי, לתצוגה בפאנל האימות. שם וגודל זהים באותו יום = אותו קובץ |
| kind | בחירה | קובץ בנק (ישן) / שורות דפי בנק – Priority (מ-03.11: שורה לכל משיכה; uploadedAt = זמן המשיכה, rowsRead = שורות מהמקור, rowsWritten = שורות חדשות) |
| dataDate, workDay | תאריך | יום ההעברות שהמסמך מכסה, ויום העבודה ברצועת השבוע |
| uploadedBy, uploadedAt | טקסט, זמן | מי העלה ומתי |
| extractionStatus | בחירה | ממתין לקריאה / בקריאה / נקרא – לאימות / אומת / נכשל |
| linesInFile, totalInFile | מספר | מה שכתוב בשורת הסיכום של הקובץ |
| extractedLineCount, extractedTotal | מספר | מה שסוכן הקריאה חילץ |
| totalsCheck, totalsAcknowledged | בחירה, כן/לא | תואם / לא תואם / אין סיכום בקובץ, ו"בדקתי מול הבנק" |
| verifiedBy/At, checkStatus | טקסט, בחירה | מי אישר את השורות, ומצב הבדיקות: טרם התחילו / בבדיקה / הושהתה / הושלמה |

### BankLines — רשומת העברה (במקור: bank_pays)
| עמודה | סוג | הערה |
|---|---|---|
| bankLineId | טקסט | מפתח |
| importBatchId | טקסט → ImportBatches | מאיזה מסמך הרשומה חולצה |
| lineNo, sourceRef, rawText | מספר, טקסט | מספר הרשומה, המיקום במקור (p2:r14), והשורה כפי שנקראה |
| payerName | טקסט | שם המעביר כמו שמופיע בבנק |
| amount | מספר | סכום ההעברה |
| valueDate | תאריך | תאריך ערך |
| priorityLineId, source, syncedAt | טקסט, טקסט, זמן | מ-03.11: המזהה של השורה במסך "שורות דפי בנק" (מפתח מניעת הכפילויות), המקור (priority-mock עד החיבור), ומתי נמשכה לאחרונה. ריק = שורה ישנה מקובץ |
| reference, lineType | טקסט, בחירה | אסמכתא, וסוג: העברה / זיכוי בנק / פירעון צ׳ק / צ׳ק / צ׳ק חוזר / אחר. רק העברה וזיכוי בנק נבדקות |
| legibility, extractionFlags | בחירה, טקסט | איכות הקריאה, ודגלים: שדה חסר / קריאות נמוכה / כפילות |
| checkStage | בחירה | ממתינה לבדיקה / זיהוי לקוח / ממתינה לאישור (זוהה, קבלה בטיוטה) / אושרה / לא מזוהה |
| status | בחירה | חדשה / לא מזוהה / קבלה הונפקה (מ-08.11; ההתקדמות עצמה ב-checkStage) |
| customerCode, customerName | טקסט | נכתבים כשהלקוח אושר |
| receiptKey | טקסט → Receipts | הקבלה שנוצרה מהרשומה |

### Receipts — קבלה (חדש, במקור: receipts)
קבלה אחת לכל העברה (או צ׳ק של סוכן). נוצרת בטיוטה בזיהוי הלקוח, ויוצאת באישור הלקוח.
| עמודה | סוג | הערה |
|---|---|---|
| receiptKey | טקסט | מפתח: RCPT-<bankLineId> |
| bankLineId, importBatchId, matchProposalId | טקסט | ההעברה, הקובץ והצעת הלקוח (במקור: bank_pay_id) |
| customerCode, customerName | טקסט → Customers | הלקוח (במקור: customer_id) |
| amount | מספר | תמיד סכום ההעברה |
| allocatedAmount, unallocatedAmount | מספר | כמה פוזר לחשבוניות, וכמה נשאר "על חשבון" |
| valueDate, payerName, reference | תאריך, טקסט | מההעברה |
| matchStatus | בחירה | מצב הפיזור: ריק עד בדיקת החוב / פיזור מוצע – לאישור / על חשבון – צריך פיזור / מפוזרת / מפוזרת – עודף על חשבון |
| receiptStatus | בחירה | שדה המצב היחיד (03.11): טיוטה – ממתינה לאישור / אושרה – לא נשלחה / הונפקה ב-Priority. הקבלה נוצרת בזיהוי הלקוח ומאושרת באישור הלקוח |
| priorityReceiptNumber | טקסט | מספר הקבלה ב-Priority, נרשם בסימון "הונפקה" (במקור: priority_receipt_no) |
| identifyConfidence, identifyStatus | מספר, בחירה | מ-05.11: רמת הביטחון בזיהוי הלקוח (0–100), ומצב הזיהוי: ודאי / לא ודאי / אושר / אושר אוטומטית / לא זוהה |
| sentToEmail, sentAt, sendStatus | טקסט, זמן, בחירה | מ-05.11: למי הקבלה מיועדת (איש הקשר isApContact), מתי נשלחה (בבדיקה אף פעם), ומצב המייל: טיוטה – בדיקה / נשלחה / חסר איש קשר |
| receiptSource | בחירה | מ-05.11: דף בנק / צ׳ק סוכן (צ׳קים של סוכנים בשלב 7) |
| debtCheckResult, debtCheckMonths, allocationConfidence | בחירה, טקסט, מספר | תוצאת בדיקת החוב (נסגר לאפס – מצטבר / חודש אחד / לברר מול הלקוח), החודשים שנסגרו, ורמת הביטחון בפיזור |
| preparedBy/At, issuedBy/At | טקסט, זמן | מי אישר ומתי, ומי סימן שהונפקה ומתי |

### ReceiptAllocations — התאמת קבלה לחשבוניות (חדש, במקור: receipt_allocations)
רבים-לרבים: קבלה יכולה לסגור כמה חשבוניות, וחשבונית יכולה להיסגר בכמה קבלות.
| עמודה | סוג | הערה |
|---|---|---|
| receiptKey, bankLineId | טקסט → Receipts | הקבלה (במקור: receipt_id) |
| invoiceNumber, dueDate | טקסט → Invoices | החשבונית (במקור: invoice_id) |
| amount, openBefore | מספר | כמה מהקבלה הולך לחשבונית, והיתרה לפני |
| kind | בחירה | מלאה / חלקית |
| source, sourceRef | בחירה, טקסט | סכום (הצעת הפיזור) / ידני (נערך בעורך), ו-sourceRef = המאשר ("אושר אוטומטית" בסף) |
| status | בחירה | כמו הקבלה: מוכנה / הונפקה ב-Priority |

### ReceiptThreads — ההתכתבות על רשומה (חדש, במקור: record_threads) · לא בשימוש מ-08.11
שימשה את "בקשת פירוט", שהוסרה. רק הניקוי והאיפוס מוחקים ממנה; הטבלה תימחק בניקוי הבא.
| עמודה | סוג | הערה |
|---|---|---|
| bankLineId, customerCode | טקסט | הרשומה והלקוח |
| entryType, direction | בחירה | בקשת פירוט / תשובת לקוח / הערה פנימית, ויוצא / נכנס / פנימי |
| status | בחירה | טיוטה / אושר – לא נשלח / התקבלה |
| toName, toAddress, subject, body | טקסט | הנמען והתוכן |
| approvalId, inboundEmailId | טקסט | הטיוטה באישורים, או המייל שנקלט (InboundEmails.bankLineId) |
| byName, at | טקסט, זמן | מי ומתי |

### MatchProposals — הצעת התאמה (חדש: במקור זה ישב על bank_pays)
| עמודה | סוג | הערה |
|---|---|---|
| bankLineId | טקסט → BankLines | לכל רשומה יכולות להיות כמה הצעות לאורך זמן, ורק אחת מהן מוצעת |
| customerCode | טקסט → Customers | הלקוח שזוהה |
| customerIdMethod | בחירה | שם זהה / איש קשר / כינוי / מייל / היסטוריה / ידני (במקור: customer_match_method) |
| invoiceNumbers, allocations | טקסט, אובייקט | ריקים מ-05.11 (נקראים רק בהצעות ישנות שאושרו) |
| confidence | בחירה | רמת הוודאות בזיהוי הלקוח: ודאי / גבוה / נמוך (העמודה matchMethod הוסרה 08.11) |
| evidenceEmailIds, evidenceQuote | טקסט | לא בשימוש מ-08.11 |
| status | בחירה | מוצעת / אושרה – לביצוע ב-Priority (הקבלה אושרה) / בוצעה ב-Priority (הונפקה) / נדחתה / הוחלפה |
| decidedBy, decidedAt | טקסט, זמן | ההחלטה הסופית של המשתמש |

### Customers — לקוחות (מראה של Priority, קריאה בלבד)
| עמודה | סוג | הערה |
|---|---|---|
| customerCode | טקסט | קוד הלקוח ב-Priority. זה המפתח |
| customerName | טקסט | השם בכרטיס הלקוח |
| companyId | טקסט | ח״פ. כל בקשה לבסס״ח נשלחת לפיו (שלב 3) |
| checkRemittanceMail, remittanceSenders | כן/לא, טקסט | מ-03.11 לפירוט במייל; לא בשימוש מאז שסולם ההתאמה נמחק (08.11) |
| salesAgentName | טקסט | הסוכן שמטפל בלקוח |
| apContactName/Email/Phone | טקסט | איש הקשר בהנהלת החשבונות של הלקוח (גיבוי ל-CustomerContacts.isApContact), שאליו הולך מייל הקבלה |
| assignedBookkeeperName | טקסט | האחראית על הלקוח |
| syncedAt | זמן | הסנכרון האחרון |

**חדש מ-Priority (26.10):** status (priorityStatus: פעיל / זמני / חסום), payment_terms (paymentTermsLabel, למשל שוטף + 60), payment_method (paymentMethod), collection_note (collectionNote, למשל "30 לחודש"). ובאנשי הקשר: CustomerContacts.isApContact, איש הקשר בהנהלת החשבונות שאליו הולך מייל הקבלה.

### BankAliases — כינויים (חדש: במקור aliases על הלקוח)
| עמודה | סוג | הערה |
|---|---|---|
| bankName | טקסט | שם המעביר כמו שמופיע בבנק |
| customerCode | טקסט → Customers | הלקוח |
| status | בחירה | מוצע / מאושר / נדחה. רק כינוי מאושר משמש לזיהוי |
| source, evidenceEmailId | בחירה, טקסט | מאיפה הכינוי הגיע: אישור לקוח ב-IssueReceipt / מייל / ידני |
| prioritySync | בחירה | לא סונכרן / סונכרן. קיים רק אצלנו ולא ב-Priority |

### Invoices — חשבוניות (מראה של Priority + שכבה שלנו)
| עמודה | סוג | הערה |
|---|---|---|
| invoiceNumber | טקסט | מספר החשבונית ב-Priority. זה המפתח |
| customerCode | טקסט → Customers | הלקוח של החשבונית |
| amount, openAmount | מספר | סכום החשבונית והיתרה הפתוחה (לפרטים; הפיזור עובד מהתנועות הפתוחות) |
| invoiceDate, dueDate | תאריך | תאריך החשבונית ותאריך הפירעון |
| sourceDocUrl | טקסט | צילום החשבונית כפי שנשלחה ללקוח. כרגע עותק בדיקה |
| InvoiceLines | טבלה | שורות החשבונית: פריט, כמות, מחיר |
| syncedAt | זמן | הסנכרון האחרון |
| paymentState, paidSeenAmount, paidSeenAt, paidSeenBankLineIds, paidPriorityDoneAt | שכבה שלנו | התשלום שראינו, מחושב מ-ReceiptAllocations: "נראה תשלום" כשהקבלה מוכנה, "נקלט ב-Priority" אחרי "הונפקה". נכתב רק על ידי האפליקציה |
| paymentStatus, remainingAmount, receiptKeys | שכבה שלנו | פתוחה / שולמה חלקית / שולמה, היתרה אחרי ההתאמות, והקבלות (במקור: invoices.payment_status ו-open_amount). היתרה של Priority עצמה (openAmount) לא נדרסת |

### InboundEmails — מיילים (המקור לחיפוש במייל)
| עמודה | סוג | הערה |
|---|---|---|
| fromAddress, fromName | טקסט | השולח: לקוח, איש קשר או סוכן |
| receivedAt | זמן | מדרגת המייל בזיהוי: 7 הימים האחרונים |
| subject, bodyText | טקסט | נסרקים לפי הסכום ומילה מהשם |
| category, mentionedInvoiceNumbers | בחירה, טקסט | הסיווג של מאיה (למשל פירוט תשלום), ומספרי החשבוניות שהוזכרו במייל |
| customerCode | טקסט → Customers | אם המייל כבר משויך ללקוח |

### ReceiptCheckSteps ו-AgentFeedback — רישום ומדידה (חדש)
| טבלה | מה נשמר |
|---|---|
| ReceiptCheckSteps | כל צעד בזיהוי ובהחלטות של כל רשומה: שלב (קריאה / זיהוי לקוח / החלטה), מדרגה (כרטיס לקוח / כינוי / מיילים 7 ימים / אישור / תיקון…), תוצאה (נמצא / לא נמצא / דו-משמעי / דולג), ראיה ומי עשה אותו |
| AgentFeedback | כל סימון "נכון / טעות" על סוכן הקריאה ועל נינה: שדה, מה הסוכן נתן ומה נכון. מכאן נבנות הבדיקות לסוכנים |

## 5. שתי הערות על הסכמה (מהמקור, וכך הן נפתרו)
- **איזה סכום משווים.** משווים ליתרה הפתוחה במראה ולא לסכום המקורי, ומ-05.11 קודם כול מול חודשי הפירעון (בדיקת החוב), ורק אחר כך לחשבוניות.
- **כמה חשבוניות בהעברה אחת.** העברה אחת יכולה לשלם כמה חשבוניות, כמו ב-17,424 ₪ על שלוש חשבוניות בדוגמה של יניב. הפיזור נרשם ב-ReceiptAllocations, שורה לכל חשבונית, רבים-לרבים.

## 6. מה חסר בתהליך
דרך ה-WhatsApp לא נבנתה: מעביר לא מוכר נבחר ידנית מהרשימה. בנויים כמקום בלבד: שליחת מייל הקבלה (נעצר ב"אושר – לא נשלח"), הנפקת הקבלה ב-Priority (הוראה להעתקה וסימון ידני), ושני הספים האוטומטיים (כבויים). הרשימה המלאה בעמוד פערים.
