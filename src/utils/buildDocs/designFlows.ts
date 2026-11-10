/**
 * The "דיאגרמה" view of each component file on /collections/design: the programmatic steps as blocks.
 * Source of truth: memories/files/DESIGN_FLOWS.md — copied faithfully; when a component doc changes,
 * update its blocks there and here in the same turn. The general files (DB schema, UX-UI) get no diagram.
 *
 * Text conventions: `code` in backticks renders as LTR monospace; **bold** renders bold.
 */

export type FlowKind = 'קוד' | 'סוכן AI' | 'אדם' | 'Priority' | 'מסך';

/** One paragraph (string) or one bullet list (string[]). */
export type FlowExplainPart = string | string[];

export interface FlowNext {
  /** The number of the target block, e.g. '6' or '5א'. */
  to: string;
  /** The branch label, e.g. 'שם לא מוכר'. */
  label?: string;
}

/** Not built yet. Absent = built (בנוי), which is not shown on cards. ממתין = defined and approved, waiting for its build stage. */
export type FlowStatus = 'מקום בלבד' | 'TBD' | 'ממתין';

/** A check that runs before everything else in the block and can exit the flow (e.g. צ׳ק חוזר → 5ב). */
export interface FlowGate {
  label: string;
  /** The child block it leads to; absent when the gate only changes what the block does (e.g. skips a rung). */
  to?: string;
  outcome: string;
}

/** One rung of a ladder: tried in order; "found" exits to the ladder's target, otherwise the next rung. */
export interface FlowRung {
  title: string;
  kind: FlowKind | FlowKind[];
  status?: FlowStatus;
  line: string;
  /** Child block numbers drawn inside the rung as a mini-chain (e.g. 6ב → 6ג → 6ד). */
  blocks?: string[];
  tables?: string[];
  /** Overrides the ladder's "found" outcome for this rung. */
  outcome?: string;
}

/** The ordered rungs a block tries, drawn visibly inside its card as a staircase. */
export interface FlowLadder {
  /** Where a rung that finds goes, and the word for "found" (label). */
  found: FlowNext;
  foundNote?: string;
  rungs: FlowRung[];
}

export interface FlowBlock {
  n: string;
  title: string;
  kind: FlowKind;
  status?: FlowStatus;
  gate?: FlowGate;
  ladder?: FlowLadder;
  /** The real action, agent or table name (may mix Hebrew and `code`). */
  action?: string;
  line: string;
  explain?: FlowExplainPart[];
  reads?: string[];
  writes?: string[];
  /** Empty = the flow ends here. */
  next: FlowNext[];
  /** Sub-steps (5א, 5ב…) drawn beside their parent. */
  children?: FlowBlock[];
}

export type FlowDocId = 'receipts' | 'aging' | 'credit' | 'inbox' | 'tasks';

export const FLOW_KINDS: FlowKind[] = ['קוד', 'סוכן AI', 'אדם', 'Priority', 'מסך'];

/** The legend order; בנוי is the default and appears only in the legend. */
export const FLOW_STATUSES: ('בנוי' | FlowStatus)[] = ['בנוי', 'ממתין', 'מקום בלבד', 'TBD'];

export const FLOWS: Record<FlowDocId, FlowBlock[]> = {
  // 01 · תקבולים והתאמות
  receipts: [
    {
      n: '1',
      title: 'משיכת שורות דפי בנק',
      kind: 'מסך',
      action: '`SyncPriorityBankLines`',
      line: 'הכפתור "משוך עכשיו מפריוריטי" מושך את שורות היום.',
      explain: [
        'מ-03.11 (תוכנית r3, שלב 2) השורות מגיעות ממסך "שורות דפי בנק" בפריוריטי, שאיריס טוענת כל בוקר. אין העלאת קובץ, ואין סוכן קריאה (BankFileReader מושבת). כרגע המקור הוא מקור בדיקה, כי פריוריטי לא מחובר. אין תזמון עד שיהיה API (החלטת סער): הפלטפורמה מתזמנת לכל היותר פעם בשעה, והבקשה הייתה כל 15 דקות. כל משיכה היא שורה ב-ImportBatches מסוג "שורות דפי בנק – Priority", והמסך מציג "נמשך מפריוריטי ב-HH:MM".',
      ],
      reads: ['AgentSettings (bankPollStart, bankPollEnd, bankPollInterval, receiptsReadyBy)'],
      writes: ['ImportBatches'],
      next: [{ to: '2' }],
    },
    {
      n: '2',
      title: 'מניעת כפילויות',
      kind: 'קוד',
      action: '`SyncPriorityBankLines`',
      line: 'לפי priorityLineId; שורה ישנה זהה מקובץ מאומצת.',
      explain: [
        'שורה שכבר קיימת רק מקבלת syncedAt חדש. שורה ישנה מקובץ עם אותם חשבון, תאריך, סכום, מעביר ואסמכתא מקבלת את ה-priorityLineId ולא נוצרת שוב. כל השאר נוצרות כ-PL-<priorityLineId>, עם source ו-syncedAt. משיכה שנייה באותו יום לא יוצרת אף שורה.',
      ],
      writes: ['BankLines'],
      next: [{ to: '3' }],
    },
    {
      n: '3',
      title: 'סינון לפי סוג שורה',
      kind: 'קוד',
      action: '`SyncPriorityBankLines`',
      line: 'רק העברה וזיכוי בנק נבדקות.',
      explain: [
        'שורה חדשה מסוג העברה או זיכוי בנק נכנסת מיד לזיהוי (IdentifyCustomers, שלב 5). פירעון צ׳ק ו"אחר" (למשל ריבית זכות) מוצגים במסך תחת "לא מטופלות", בלי בדיקה. שורות ישנות מקובץ נשארות לצפייה בלבד.',
      ],
      next: [
        { to: '5', label: 'העברה / זיכוי בנק' },
        { to: '4', label: 'אין שורות' },
      ],
      // Block 4 is a numbered block in the source; drawn beside 3 (like 5ב beside 5) so the main column still runs 3 → 5.
      children: [
        {
          n: '4',
          title: 'דפי בנק לא נטענו',
          kind: 'קוד',
          action: '`SyncPriorityBankLines`',
          line: 'משיכה אחרי receiptsReadyBy בלי שורות → משימה אחת.',
          explain: [
            'ביום עסקים (א׳–ה׳), משיכה שרצה אחרי receiptsReadyBy (10:00, "החלטת יניב") ולא החזירה אף שורה של היום פותחת משימה אחת "דפי בנק לא נטענו" (bank-missing:<תאריך>). המשימה נסגרת לבד כשהשורות מגיעות. משימה שאדם סגר נשארת סגורה באותו יום. בלי תזמון, הבדיקה רצה רק כשמישהו מושך. מה עושים ביום שלא נטען הוא עדיין שאלה ליניב.',
          ],
          writes: ['CollectionQueue'],
          next: [],
        },
      ],
    },
    {
      n: '5',
      title: 'זיהוי לקוח',
      kind: 'קוד',
      action: '`IdentifyCustomers`',
      line: 'לקוח עם רמת ביטחון 0–100 לכל שורה, ועוצרים.',
      gate: { label: 'צ׳ק חוזר?', to: '5ב', outcome: 'משימה דחופה, לא תקבול' },
      ladder: {
        found: { to: '6', label: 'נמצא' },
        foundNote: 'המדרגה הגבוהה שנמצאה קובעת את הביטחון · ודאי ≥ identifyCertainAt (90)',
        rungs: [
          { title: 'ח״פ באסמכתא', kind: 'קוד', line: '100.', tables: ['Customers'] },
          { title: 'כינוי מאושר', kind: 'קוד', line: '95. כל אישור לקוח אחר או שם שונה נשמר ככינוי.', tables: ['BankAliases'] },
          { title: 'שם זהה', kind: 'קוד', line: '95, השם המנורמל = שם הלקוח.' },
          { title: 'איש קשר', kind: 'קוד', line: '85.', tables: ['CustomerContacts'] },
          { title: 'מייל מ-7 הימים האחרונים', kind: 'קוד', line: '80, מייל שכבר שויך ללקוח אחד, עם הסכום ומילה מהשם.', tables: ['InboundEmails'] },
          { title: 'שם חלקי', kind: 'קוד', line: '70.' },
          { title: 'דו-משמעי / לא זוהה', kind: 'אדם', line: '50 לכל מועמד / 0: בחירה ידנית ברשימה, נשמרת ככינוי.' },
        ],
      },
      explain: [
        'קוד בלבד, בלי AI. לכל שורה מזוהה נוצרת קבלה בטיוטה (RCPT-<bankLineId>) והצעת לקוח; שורה לא ודאית פותחת משימה "זיהוי לקוח – לאישור", מעביר לא מוכר "לא זוהה". WhatsApp לסוכנים לא נבנה. החיפוש במייל עם אישור, קורא הפירוטים ובקשת הפירוט נמחקו ב-08.11.',
      ],
      reads: ['Customers', 'CustomerContacts', 'BankAliases', 'InboundEmails'],
      writes: ['Receipts', 'MatchProposals', 'ReceiptCheckSteps', 'CollectionQueue'],
      next: [
        { to: '6', label: 'לקוח אושר' },
        { to: '5ב', label: 'צ׳ק חוזר' },
      ],
      children: [
        {
          n: '5ב',
          title: 'צ׳ק חוזר',
          kind: 'קוד',
          line: 'משימה דחופה לאחראית.',
          next: [],
        },
      ],
    },
    {
      n: '6',
      title: 'אישור = קבלה',
      kind: 'אדם',
      action: '`IssueReceipt`',
      line: '"אשר את כל הוודאיים" או אחת-אחת → הקבלה יוצאת.',
      explain: [
        'הקבלה עוברת ל"אושרה – לא נשלחה", עם PDF וטיוטת מייל לאיש הקשר של הנהלת החשבונות (נעצרת ב"אושר – לא נשלח"), או משימה "חסר איש קשר הנהלת חשבונות". מיד אחר כך בדיקת החוב (7). אחרי ההנפקה ב-Priority אדם מסמן "הונפקה ב-Priority" עם מספר הקבלה (6א).',
      ],
      reads: ['Receipts', 'CustomerContacts'],
      writes: ['Receipts', 'Approvals', 'BankAliases', 'CollectionQueue'],
      next: [
        { to: '7' },
        { to: '6א', label: 'הונפק ב-Priority' },
      ],
      children: [
        {
          n: '6א',
          title: 'הונפקה ב-Priority',
          kind: 'אדם',
          action: '`DecideMatchProposal`',
          line: 'מספר הקבלה של Priority, בלחיצה ברשומה.',
          explain: [
            'אחרי שאדם הנפיק את הקבלה ב-Priority לפי ההוראה להעתקה. הקבלה ושורות הפיזור שלה עוברות ל"הונפקה ב-Priority", ושורת הבנק ל"קבלה הונפקה". כתיבה ישירה תבוא עם ה-API.',
          ],
          writes: ['Receipts', 'ReceiptAllocations', 'MatchProposals', 'BankLines'],
          next: [],
        },
      ],
    },
    {
      n: '7',
      title: 'בדיקת חוב',
      kind: 'קוד',
      action: '`CheckDebt`',
      line: 'מיד אחרי הקבלה: הסכום מול התנועות הפתוחות לפי חודש פירעון.',
      explain: [
        'שינוי לוגיקה – 11.2026. סכום = היתרה המצטברת עד סוף חודש מסוים → "נסגר לאפס – מצטבר"; בדיוק יתרה של חודש אחד → "נסגר לאפס – חודש אחד"; בשניהם התראה "נסגר לאפס" ופיזור מוצע. אחרת "לברר מול הלקוח" ומשימה "לברר מול הלקוח – סכום לא סוגר חודש", בלי פיזור מוצע. טבלת תנועות ריקה = לא ידוע. כשל לא מבטל את הקבלה. נינה מסבירה (ExplainMatch, קריאה בלבד).',
      ],
      reads: ['OpenMovements', 'Receipts'],
      writes: ['Receipts', 'CollectionQueue'],
      // "לברר מול הלקוח" ends here with a task (— in DESIGN_FLOWS.md); only the drawn branch is a target.
      next: [{ to: '8', label: 'נסגר לאפס' }],
    },
    {
      n: '8',
      title: 'פיזור לחשבוניות',
      kind: 'אדם',
      action: '`ProposeAllocation` → `ApplyAllocation`',
      line: 'מהישנה לחדשה, האחרונה חלקית, עודף על חשבון; אישור בלחיצה בעורך.',
      explain: [
        'שלב נפרד שלא חוסם את הקבלה. החשבוניות הפתוחות מהתנועות הפתוחות לפי חודש; יתרה של חשבונית = הסכום במראה פחות כל הפיזורים שלה. ההצעה מתחילה מהחודשים שנסגרו, עם רמת ביטחון 0–100. העורך במסך התקבולים: סימון / ביטול וסכום לכל חשבונית. האישור מחליף את שורות הפיזור (רבים-לרבים) ומעדכן מפוזרת / מפוזרת – עודף על חשבון / על חשבון – צריך פיזור. משימה "קבלה – צריך פיזור" פתוחה עד שהקבלה מפוזרת. סף allocationAutoApproveAt כבוי; מעליו = "אושר אוטומטית". בכרטיס הלקוח: מה כל קבלה כיסתה ומה נשאר פתוח.',
      ],
      reads: ['OpenMovements', 'Invoices', 'ReceiptAllocations', 'AgentSettings'],
      writes: ['ReceiptAllocations', 'Receipts', 'CollectionQueue'],
      next: [{ to: '9' }],
      children: [
        {
          n: '8א',
          title: 'צ׳קים של סוכני שטח',
          kind: 'קוד',
          action: '`PullAgentReceipts`',
          line: 'בשלב 09:00: צ׳ק של סוכן = קבלה, בלי זיהוי, ואז 7 ו-8.',
          explain: [
            'תשלומי צ׳ק / צ׳ק דחוי עם collectedBy מ-14 הימים האחרונים במראה Payments → קבלה RCPT-AGT-<paymentRef> (צ׳ק סוכן), בלי מייל. אותה בדיקת חוב ואותו פיזור. הערות "צ׳ק אצל סוכן" על החודשים שהצ׳ק משלם נסגרות דרך מנוע ההערות. איך מזהים בפריוריטי קבלה של סוכן – שאלה לגילה ונווית.',
          ],
          reads: ['Payments', 'OpenMovements', 'CustomerNotes'],
          writes: ['Receipts', 'CustomerNotes', 'CollectionQueue'],
          next: [{ to: '7' }],
        },
      ],
    },
    {
      n: '9',
      title: 'הנפקה ב-Priority',
      kind: 'Priority',
      status: 'מקום בלבד',
      action: 'ידני',
      line: 'אדם מעתיק את ההוראה ומסמן "הונפקה".',
      explain: [
        'המסך מציג הוראה להעתקה: לקוח, סכום, תאריך ערך, אסמכתא, וכל חשבונית עם הסכום שלה. אחרי ההנפקה ב-Priority רושמים את מספר הקבלה. הרשומה עוברת ל"קבלה הונפקה", והחשבונית ל"נקלט ב-Priority". כתיבה ישירה דרך ה-API היא TODO.',
      ],
      writes: ['Receipts', 'Invoices'],
      next: [],
    },
  ],

  // 02 · דוח גיול
  aging: [
    {
      n: '1',
      title: 'יום העבודה',
      kind: 'קוד',
      action: '`DayRunner` → `RunDaySchedule`',
      line: 'כל שעה עגולה 06:00–12:00, א׳–ה׳; מריץ רק מה שהגיע זמנו.',
      explain: [
        'הוורקפלואו קורא את השעות מההגדרות (morningPullAt, bankCheckAt, bankRecheckAt) ואת מה שכבר רץ היום מ-ImportBatches. שלב שהצליח לא רץ שוב באותו יום; שלב שנכשל ינוסה בשעה הבאה. שעה עם דקות רצה בשעה העגולה הבאה. הכפתור "משוך עכשיו מפריוריטי" מריץ רק את שלב 06:00.',
      ],
      reads: ['AgentSettings', 'ImportBatches'],
      next: [
        { to: '2', label: '06:00' },
        { to: '6', label: '09:00 / 10:00' },
      ],
    },
    {
      n: '2',
      title: 'משיכת הבוקר',
      kind: 'Priority',
      gate: { label: 'משיכה נכשלה?', outcome: 'משימה "משיכת הבוקר נכשלה", שום דבר לא נמחק ולא נסגר' },
      action: '`PullPriorityCustomers` → `PullOpenMovements` → `PullOpenOrders`',
      line: 'לקוחות, תנועות פתוחות והזמנות פתוחות, למראות בלבד.',
      explain: [
        'הלקוחות מתעדכנים רק בעמודות של פריוריטי, ולקוח שנעלם מסומן "לא פעיל בפריוריטי" ולא נמחק. התנועות מוחלפות לכל לקוח בכל משיכה. עד שיש API, המקור הוא מקור בדיקה. שורת ריצה אחת ב-ImportBatches.',
      ],
      writes: ['Customers', 'OpenMovements', 'CustomerExposure', 'ExposureItems', 'ImportBatches'],
      next: [{ to: '3' }],
    },
    {
      n: '3',
      title: 'סגירת חודשים שהתאפסו',
      kind: 'קוד',
      action: '`CloseSettledNotes`',
      line: 'חודש ב-0 ₪ סוגר את ההערות שלו.',
      explain: [
        'לכל לקוח + חודש עם הערות פעילות מסכמים את התנועות. 0 ₪ או פחות → "נסגרה – החודש התאפס", והתחייבות פתוחה מקבלת "קוימה". יתרה כלשהי משאירה את ההערות. אם אין תנועות בכלל, לא נסגר כלום. ההערות נשארות בהיסטוריה.',
      ],
      reads: ['OpenMovements', 'CustomerNotes'],
      writes: ['CustomerNotes'],
      next: [{ to: '4' }],
    },
    {
      n: '4',
      title: 'משימות הבוקר',
      kind: 'קוד',
      action: '`BuildTasks`',
      line: 'הסריקה הקיימת + משימות מרוכזות: אשראי, חזור אליי, צ׳ק אצל סוכן, תזכורות.',
      explain: [
        'משימה אחת לכל סוג + תאריך + עובדת (notes:<סוג>:<תאריך>:<עובדת>), עם שורה לכל לקוח + חודש ב-itemsJson. הערה נכנסת ביום שמגיע מועד הטריגר שלה, פעם אחת, ורק כשהחודש מעל 0. שורה יוצאת כשההערה נסגרת; משימה בלי שורות נסגרת לבד. הסוג, ההיסט והשלב נקראים מ-noteTask.* בהגדרות.',
      ],
      reads: ['CustomerNotes', 'OpenMovements', 'CustomerOwners', 'AgentSettings'],
      writes: ['CollectionQueue'],
      next: [],
    },
    {
      n: '5',
      title: 'כתיבת הערה',
      kind: 'אדם',
      action: '`AddCustomerNote` / `UpdateCustomerNote`',
      line: 'לקוח + חודש; 4 סוגים אקטיביים + אחר.',
      explain: [
        'התחייבות לתשלום, תשלום באשראי, צ׳ק אצל סוכן וחזור אליי דורשים תאריך ופותחים משימה במועד. "אחר" = סוג חופשי ותוכן. לכל הערה תזכורת וסכום אופציונליים. נשמרת יתרת החודש בזמן הכתיבה. מקורות: צוות, תמר בכרטיס (אחרי אישור במילים), מאיה ממייל ("אשר הבטחה", או בירור כ"אחר"). הערה שנכתבת אחרי שהשלב שלה כבר רץ היום, עם מועד של היום, נכנסת מיד למשימה של היום.',
        'פעיל: מסך הגיול, כרטיס הלקוח לפי חודש, תמר ומאיה; המסך כותב דרך המנוע מאז a/customer-card-tasks.',
      ],
      writes: ['CustomerNotes', 'CollectionQueue'],
      next: [{ to: '4' }, { to: '8' }],
    },
    {
      n: '6',
      title: 'האם דף הבנק עלה?',
      kind: 'Priority',
      action: '`RunDaySchedule`',
      line: '09:00, ושוב ב-10:00 אם לא.',
      explain: [
        'עד שיש API נבדק מול מקור הבדיקה של שורות דפי הבנק. 09:00 לא עלה → נרשם ומחכים. 10:00 רץ רק אם 09:00 לא מצא. שעה שהוחמצה (שניהם מגיעים יחד) = בדיקה אחת כמו של 10:00. כל בדיקה = שורה ב-ImportBatches עם bankLoaded.',
      ],
      reads: ['BankLines (מקור הבדיקה)', 'ImportBatches'],
      writes: ['ImportBatches'],
      next: [
        { to: '7', label: 'עלה' },
        { to: '6א', label: 'לא עלה ב-10:00' },
      ],
      children: [
        {
          n: '6א',
          title: 'דף הבנק לא עלה לפריוריטי',
          kind: 'קוד',
          action: '`RunDaySchedule`',
          line: 'משימה דחופה, ובלי בדיקת התחייבויות היום.',
          explain: [
            'מפתח bank-missing:<תאריך>, חומרה קריטית. ההתחייבויות של היום נבדקות ביום הבא שדף הבנק עולה; שום דבר לא הולך לאיבוד. המשימה נסגרת לבד כשדף הבנק עולה.',
          ],
          writes: ['CollectionQueue'],
          next: [],
        },
      ],
    },
    {
      n: '7',
      title: 'ריצת התקבולים ומשיכה חוזרת',
      kind: 'קוד',
      action: '`SyncPriorityBankLines` → `PullOpenMovements` → `CloseSettledNotes`',
      line: 'הריצה הקיימת, ואחריה התנועות מתעדכנות.',
      explain: [
        'עד חלק ב׳ זו ריצת התקבולים של היום (משיכת שורות דפי בנק ובדיקה של כל העברה). אחריה התנועות נמשכות שוב, וחודשים שהתאפסו סוגרים את ההערות שלהם.',
      ],
      writes: ['BankLines', 'Receipts', 'OpenMovements', 'CustomerNotes'],
      next: [{ to: '8' }],
    },
    {
      n: '8',
      title: 'בדיקת התחייבויות',
      kind: 'קוד',
      action: '`CheckCommitments`',
      line: 'קוימה / קוימה חלקית / לא קוימה, עם נכנס ונשאר.',
      explain: [
        'ביום שאחרי המועד. הובטח = הסכום, או יתרת החודש בזמן הכתיבה. נכנס = כל הקבלות של הלקוח מאז ההערה: מפריוריטי (Payments) ועד שיש API גם שאושרו אצלנו, כל קבלה פעם אחת, בלי זיכויים. חודש ב-0 או נכנס ≥ הובטח = קוימה. חלקית ולא קוימה נבדקות שוב בכל ריצה.',
      ],
      reads: ['CustomerNotes', 'Payments', 'Receipts', 'OpenMovements'],
      writes: ['CustomerNotes'],
      next: [{ to: '9' }],
    },
    {
      n: '9',
      title: 'משימת ההתחייבויות',
      kind: 'קוד',
      action: '`BuildTasks`',
      line: '"התחייבויות שלא קוימו – ליצור קשר", משימה אחת לכל עובדת.',
      explain: [
        'רק שורות קוימה חלקית / לא קוימה, עם הובטח, נכנס ונשאר. שורה יוצאת כשהחודש מתאפס או כשההתחייבות הופכת ל"קוימה". המשימה נפתחת רק אחרי ריצת התקבולים.',
      ],
      writes: ['CollectionQueue'],
      next: [{ to: '10' }],
    },
    {
      n: '10',
      title: 'ההערות בתקבולים',
      kind: 'קוד',
      action: '`CheckCommitments`',
      line: 'ההערות לא משמשות יותר להתאמת תקבול; הן נבדקות מול הקבלות (8).',
      explain: [
        'שלב "הערה" בסולם ההתאמה נמחק עם הסולם הישן בגל 3 (08.11). תקבול מזהה לקוח בלבד, ובדיקת החוב והפיזור באים אחריו (01, בלוקים 7–8). ההתחייבויות נבדקות מול מה שנכנס בבלוק 8.',
      ],
      reads: ['CustomerNotes'],
      next: [],
    },
    {
      n: '11',
      title: 'דוח הגיול במסך',
      kind: 'מסך',
      action: '`AgingByMonth`',
      line: 'לקוח × חודש: סה״כ, צ׳יפ הערות, חלון צף.',
      explain: ['פעיל: a/aging-screens.'],
      reads: ['AgingByMonth', 'CustomerNotes'],
      next: [{ to: '5' }],
    },
  ],

  // 03 · ביטוח אשראי
  credit: [
    {
      n: '1',
      title: 'משיכה מ-Priority ו-ICIC',
      kind: 'Priority',
      action: 'מראות `CreditCovers`, `CustomerExposure`, `ExposureItems`',
      line: 'המכסה, האובליגו הסטטי ופירוט האובליגו.',
      explain: [
        'המכסה (מבטח, מספר, מסגרת מבוטחת, תוקף, סטטוס) מגיעה מ-Priority או מ-ICIC. האובליגו הסטטי ופירוט האובליגו לפי סוג מגיעים מ-Priority. לא מחשבים אותם אצלנו, רק קוראים. הסנכרון הוא TODO, ועד אז הנתונים הם נתוני בדיקה.',
      ],
      writes: ['CreditCovers', 'CustomerExposure', 'ExposureItems'],
      next: [{ to: '2' }],
    },
    {
      n: '2',
      title: 'אובליגו דינמי',
      kind: 'קוד',
      action: '`GetCreditExposure`',
      line: 'הסטטי, פחות מה שכבר נכנס ועוד לא ב-Priority.',
      explain: [
        'מהסטטי מורידים:',
        ['העברות של הלקוח במצב "ממתינה לפירוט";', 'קבלות "מוכנה" שעוד לא הונפקו ב-Priority.'],
        'כל העברה נספרת פעם אחת, והתוצאה לא יורדת מתחת ל-0. החישוב נעשה בזמן התצוגה ולא נשמר.',
      ],
      reads: ['CustomerExposure', 'BankLines', 'Receipts'],
      next: [{ to: '2א' }, { to: '3' }],
      children: [
        {
          n: '2א',
          title: 'צ׳קים שלא הופקדו',
          kind: 'קוד',
          line: 'מוצגים בנפרד, "צפוי לרדת בהפקדה".',
          explain: ['צ׳ק יכול לחזור, ולכן הוא לא יורד מהדינמי. מוצגים הסכום, תאריך הפירעון, והאובליגו "אחרי הפקדה".'],
          reads: ['ExposureItems'],
          next: [{ to: '3' }],
        },
      ],
    },
    {
      n: '3',
      title: 'ניצול',
      kind: 'קוד',
      action: '`GetCreditExposure`',
      line: 'סטטי ודינמי מול המסגרת המבוטחת, ב-% וב-₪.',
      explain: ['הניצול הוא האובליגו חלקי המסגרת של המכסה בתוקף. מוצג גם המרווח שנשאר. מ-80% ומעלה הצבע משתנה.'],
      reads: ['CreditCovers', 'AgentSettings (insuranceThresholdPct)'],
      next: [{ to: '4' }, { to: '5' }],
    },
    {
      n: '4',
      title: 'התראות במסך היום',
      kind: 'קוד',
      action: '`GetCreditExposure` (כל הלקוחות)',
      line: 'ניצול גבוה ופקיעה, רק למכסות בתוקף.',
      explain: [
        'יש שתי התראות, וכל אחת מקשרת ללשונית בכרטיס הלקוח:',
        ['**ניצול גבוה:** הניצול הדינמי ≥ 80%. אין התראה נפרדת מעל 100%.', '**פקיעה:** התוקף מסתיים בתוך 30 יום (coverExpiryAlertDays, לאשר עם יניב).'],
      ],
      reads: ['CreditCovers', 'CustomerExposure', 'AgentSettings'],
      next: [{ to: '5' }],
    },
    {
      n: '5',
      title: 'לשונית "אובליגו"',
      kind: 'מסך',
      action: 'כרטיס הלקוח `?tab=credit`',
      line: 'לכל לקוח; עם ביטוח מול הסכום המבוטח, בלי ביטוח מול מסגרת האשראי.',
      explain: [
        'בלשונית מוצגים פרטי המכסה (או, בלי ביטוח, מסגרת האשראי של Priority כבסיס), האובליגו הסטטי, האובליגו הדינמי עם הסיבה לכל הפחתה, והניצול. כל העברה בבירור מקשרת לרשומה שלה בתקבולים. מוצג גם פירוט האובליגו לפי סוג. הצעת הגדלה פתוחה מוצגת לקריאה בלבד.',
      ],
      next: [{ to: '6' }, { to: '7' }],
    },
    {
      n: '6',
      title: 'הרחבת מסגרת / חידוש',
      kind: 'אדם',
      action: 'דמה',
      line: '"יחובר ל-ICIC". חידוש מופיע רק כשהתוקף עומד להסתיים.',
      explain: ['הכפתורים לא עושים כלום כרגע. החיבור ל-ICIC (מפתחות, קריאות, מגבלה יומית) הוא TODO.'],
      next: [],
    },
    {
      n: '7',
      title: 'הצעת הגדלה',
      kind: 'קוד',
      action: 'אדם · `ProposeInsuranceRequests` → `DecideInsuranceRequest`',
      line: 'כפתור בכרטיס התראות הביטוח במסך היום; אדם מאשר בלשונית אובליגו וביטוח של הלקוח.',
      explain: [
        'לניצול דינמי ≥ 80% הקוד מציע הגדלה של 50% על המסגרת הקיימת, עם מספר המכסה (ORIG_COVER_NO). אדם מאשר, ואת הסטטוס מעדכנים ידנית. שום דבר לא נשלח למבטח ולא נכתב ל-Priority.',
      ],
      writes: ['CreditLimitRequests', 'Approvals'],
      next: [],
    },
  ],

  // 04 · פניות
  inbox: [
    {
      n: '1',
      title: 'קליטה מהתיבה',
      kind: 'קוד',
      action: '`ProcessInboundEmail` → `IngestEmail`',
      line: 'כל 2 דקות, מ-saar@blocks.diy (לייבל Ciment-Test).',
      explain: [
        'workflow לכל תיבה מריץ את אותו DAG. הקליטה בודקת כפילות, משייכת תיבה, מחפשת שרשור, אוספת מועמדי לקוח (איש קשר, סוכן מורשה, דומיין, שם בתוכן), קובעת אימות קשיח, ומציבה דדליין של 24 שעות. אימות (מאז 05.11) = השולח רשום כאיש קשר של הנהלת חשבונות (isApContact) בכרטיס; שולח לא מוכר מקבל הצעת לקוח מהחתימה, משימה "זה הלקוח X?" ואישור אדם ב-ConfirmSender (איש קשר "נוסף אצלנו" + משימה "להוסיף איש קשר בפריוריטי"). תעודות והפרשי מחיר → משימה ידנית בלבד; אישור ביטוח אשראי → קישור לבקשה הפתוחה. רק תיבה פעילה אחת (קרן) + תיבת הבדיקה. אימות ישן = או סוכן שהלקוח ברשימת המורשים שלו. מאיה אף פעם לא קובעת אימות.',
      ],
      reads: ['Mailboxes', 'CustomerContacts', 'SalesAgents', 'Approvals'],
      writes: ['InboundEmails'],
      next: [
        { to: '2', label: 'תשובה' },
        { to: '3', label: 'מייל חדש' },
      ],
    },
    {
      n: '2',
      title: 'תשובה בשרשור',
      kind: 'קוד',
      action: '`AttachThreadReply`',
      line: 'תשובה לא פותחת פנייה חדשה.',
      explain: [
        'הסדר: threadId של הודעה יוצאת, מספר סימוכין CIM-<id> בנושא או בגוף, ואז threadId של מייל נכנס קודם. תשובה לטיוטה בדואר היוצא נרשמת עליה. תשובה במקרה נקשרת למקרה. תשובה לתשובה שלנו פותחת מחדש את הפנייה.',
      ],
      reads: ['Approvals', 'InboundEmails'],
      writes: ['InboundEmails', 'Approvals', 'Disputes'],
      next: [],
    },
    {
      n: '3',
      title: 'קבצים מצורפים',
      kind: 'קוד',
      action: '`FetchEmailAttachments`',
      line: 'PDF וטבלאות הופכים לטקסט; תמונה = "דורש OCR".',
      explain: [
        'כל קובץ יורד מ-Gmail ונשמר. PDF עם טקסט → טקסט; Excel ו-CSV → טבלה כטקסט; תמונה או PDF סרוק מסומנים "דורש OCR". קובץ שנכשל לא עוצר את המייל.',
      ],
      writes: ['EmailAttachments'],
      next: [{ to: '4' }],
    },
    {
      n: '4',
      title: 'מאיה ממיינת',
      kind: 'סוכן AI',
      action: '`CollectionsInboxAgent` (בתוך `ProcessInboundEmail`)',
      line: 'קריאה אחת, מבנה קבוע, ציטוט לכל נתון.',
      explain: [
        'מאיה מקבלת את השולח, מה שהקוד יודע עליו, מועמדי הלקוח, הנושא, הגוף ותוכן הקבצים. היא מחזירה: סוגים עם ציטוט, קוד לקוח מתוך המועמדים או ריק, תפקיד השולח, חשבוניות עם ציטוט, הבטחה אם יש, וסיכום. אין לה כלים במיון.',
      ],
      next: [{ to: '5' }],
    },
    {
      n: '5',
      title: 'בדיקה וניתוב',
      kind: 'קוד',
      action: '`ApplyMailClassification`',
      line: 'כל ציטוט נבדק מול המייל; מה שנפסל נשמר עם סיבה.',
      explain: [
        'כל ציטוט חייב להופיע במייל או בקובץ, הלקוח חייב להיות מהמועמדים, והחשבוניות חייבות להיות שלו. אחר כך כל סוג רץ במסלול שלו (5א–5ו). כל מייל מקבל טיוטה משולבת אחת ללקוח. אם מאיה נכשלת, המייל נשאר "אחר" ו"לא טופל".',
      ],
      writes: ['InboundEmails', 'Approvals', 'CollectionQueue'],
      next: [{ to: '5א' }, { to: '5ב' }, { to: '5ג' }, { to: '5ד' }, { to: '5ה' }, { to: '5ו' }],
      children: [
        {
          n: '5א',
          title: '1–2 כרטסת / חובות פתוחים',
          kind: 'קוד',
          action: '`GenerateStatementPdf`',
          line: 'שולח מאומת: PDF בתבנית של יניב וטיוטת תשובה.',
          explain: ['שולח לא מאומת מקבל משימה "לאמת שולח", בלי PDF. חובות פתוחים נבנים מהתנועות הפתוחות (מאז 05.11); טבלה ריקה = לא ידוע, בלי PDF. התשובה על אותו thread (Re: הנושא המקורי). סף שליחה אוטומטית mailAutoReplyAt כבוי. הקובץ שבתצוגה הוא הקובץ שמצורף לטיוטה. מצב: לא טופל.'],
          reads: ['LedgerEntries', 'OpenMovements'],
          writes: ['Approvals'],
          next: [{ to: '6' }],
        },
        {
          n: '5ב',
          title: '3 תעודות וחשבוניות',
          kind: 'קוד',
          action: '`CheckDocumentScans`',
          line: 'הכול סרוק: חבילה ללקוח. חסר: מקרה וטיוטה ללוגיסטיקה.',
          explain: ['מקרה "ממתינה לסריקה", טיוטה לאיש הלוגיסטיקה של קו המוצר וטיוטה קצרה ללקוח. מאז 05.11 רק משימה ידנית "תעודות / חשבוניות חסרות – טיפול ידני". מצב: לא טופל.'],
          reads: ['DeliveryNotes', 'ProductLineContacts'],
          writes: ['CollectionQueue'],
          next: [{ to: '6' }],
        },
        {
          n: '5ג',
          title: '4 הפרש מחיר',
          kind: 'קוד',
          action: '`AnalyzePriceGap`',
          line: 'ניתוח פער לכל שורה, מקרה מחיר וטיוטות.',
          explain: ['טיוטה לסוכן ולמנהל, וטיוטה קצרה ללקוח בלי הבטחת זיכוי. מאז 05.11 רק משימה ידנית "זיכוי / הפרש מחיר – טיפול ידני". מצב: לא טופל.'],
          reads: ['InvoiceLines', 'PriceListItems', 'SalesAgents'],
          writes: ['CollectionQueue'],
          next: [{ to: '6' }],
        },
        {
          n: '5ד',
          title: '5 פירוט תשלום',
          kind: 'קוד',
          action: '`ApplyMailClassification`',
          line: 'המייל משויך ללקוח, ומשמש את מדרגת המייל בזיהוי.',
          explain: ['מאז 08.11 אין בדיקה חוזרת של שורות (LinkRemittance נמחק). המייל נשמר משויך ללקוח, ומדרגת "מייל מ-7 הימים האחרונים" בזיהוי הלקוח (IdentifyCustomers) קוראת אותו. מצב: ממתין להתאמת התקבול.'],
          reads: ['InboundEmails'],
          writes: ['InboundEmails'],
          next: [{ to: '6' }],
        },
        {
          n: '5ה',
          title: 'הבטחת תשלום',
          kind: 'קוד',
          action: '`ApplyMailClassification` → `AddCustomerNote`',
          line: 'הצעה רק עם סכום ותאריך מצוטטים; אדם מאשר.',
          explain: ['ההצעה נשמרת על המייל; "אשר הבטחה" כותב הערת התחייבות לתשלום אחת ל-CustomerNotes (05 · משימות, בלוק 7). מצב: לא טופל עד האישור.'],
          writes: ['InboundEmails', 'CustomerNotes'],
          next: [{ to: '6' }],
        },
        {
          n: '5ו',
          title: 'אחר / לא רלוונטי',
          kind: 'קוד',
          line: 'אחר: טיוטה קצרה ומשימה. לא רלוונטי: נסגר, הגוף נמחק.',
          explain: ['מייל לא רלוונטי נסגר כ"טופל" ע״י מערכת.'],
          writes: ['Approvals', 'CollectionQueue'],
          next: [{ to: '6' }],
        },
      ],
    },
    {
      n: '6',
      title: 'מסך הפניות',
      kind: 'מסך',
      action: '`/collections/inbox`',
      line: 'דואר נכנס בתיקיות, פאנל מייל, דואר יוצא, אוטומציות.',
      explain: [
        'תיקיות לפי סוג עם תג "לא טופל" ו"ממתין". הפאנל מציג את הראיות (ציטוטים, אימות, מה נפסל) ובצד את ה-PDF והטיוטות. מצב הטיפול משתנה ב-SetEmailHandling; "ממתין" דורש "למי".',
      ],
      reads: ['InboundEmails', 'EmailAttachments', 'Approvals'],
      writes: ['InboundEmails', 'Interactions'],
      next: [{ to: '7' }],
    },
    {
      n: '7',
      title: 'אישור טיוטה',
      kind: 'אדם',
      action: '`DecideApproval`',
      line: 'אישור, עריכה או דחייה. שום דבר לא נשלח.',
      explain: ['טיוטה מאושרת עוברת ל"אושר – לא נשלח". השליחה עצמה היא TODO.'],
      writes: ['Approvals'],
      next: [],
    },
    {
      n: '8',
      title: 'אוטומציה חודשית',
      kind: 'קוד',
      action: '`RunDueAutomations` → `RunMailAutomation`',
      line: 'ב-5 לחודש ב-08:00 (מאז 05.11; היה ב-15): חובות פתוחים מהתנועות הפתוחות לכל לקוח ביתרת חובה.',
      explain: [
        'workflow שעתי (MailAutomationsRunner) מריץ כל אוטומציה פעילה שהגיע מועדה ושעוד לא רצה החודש. לקוח מוחרג נרשם עם סיבה. כל הרצה נרשמת בהיסטוריה ויוצרת טיוטות בדואר היוצא. "הרץ עכשיו" במסך: קודם תצוגה, אחר כך יצירה.',
      ],
      reads: ['MailAutomations', 'Customers', 'Invoices'],
      writes: ['Approvals', 'MailAutomationRuns'],
      next: [{ to: '7' }],
    },
  ],

  // 05 · משימות
  tasks: [
    {
      n: '1',
      title: 'רישום הערה',
      kind: 'אדם',
      action: '`AddCustomerNote` / `UpdateCustomerNote`',
      line: 'הערה אחת = לקוח + חודש פירעון; התחייבות לתשלום היא סוג הערה.',
      explain: [
        'מאז גל 3 (08.11) אין יותר הבטחות והערות גיול נפרדות: כל הערה נכתבת ל-CustomerNotes (דוח הגיול, כרטיס הלקוח, "אשר הבטחה" במייל, תמר). ארבעת הסוגים הפעילים (התחייבות לתשלום, תשלום באשראי, צ׳ק אצל סוכן, חזור אליי) דורשים תאריך ופותחים משימה מרוכזת ביום שלה. פירוט מלא: 02 · דוח גיול, בלוקים 5–9.',
      ],
      writes: ['CustomerNotes', 'CollectionQueue'],
      next: [{ to: '2' }],
    },
    {
      n: '2',
      title: 'בדיקת התחייבויות',
      kind: 'קוד',
      action: '`CheckCommitments`',
      line: 'ביום שאחרי המועד, אחרי ריצת התקבולים: קוימה / קוימה חלקית / לא קוימה.',
      explain: [
        'נבדק מול הקבלות והתנועות הפתוחות של החודש. חודש שהתאפס = קוימה (סופי). קוימה חלקית ולא קוימה נכנסות למשימה המרוכזת "התחייבויות שלא קוימו – ליצור קשר". פירוט: 02 · דוח גיול, בלוקים 8–9.',
      ],
      reads: ['CustomerNotes', 'Receipts', 'ReceiptAllocations', 'OpenMovements'],
      writes: ['CustomerNotes', 'CollectionQueue'],
      next: [{ to: '3' }],
    },
    {
      n: '3',
      title: 'שכבת החשבונית',
      kind: 'קוד',
      action: '`RefreshInvoiceLayer`',
      line: 'סטטוס משנה אחד לכל חשבונית, לפי קדימות.',
      explain: [
        'ראשי: פתוחה / סגורה. משנה (אחד, לפי קדימות): בבירור > שולמה חלקית > פתוחה. נשמר ב-subStatus ו-openDisputeId באותו רענון שכותב את מצב התשלום. "הובטחה" כבר לא נקבעת: התחייבות היא על לקוח + חודש, לא על חשבונית. הסכום ששולם מוצג תמיד בנפרד.',
      ],
      reads: ['Disputes', 'ReceiptAllocations'],
      writes: ['Invoices (השכבה שלנו)'],
      next: [{ to: '4' }],
    },
    {
      n: '4',
      title: 'ציון חומרה',
      kind: 'קוד',
      action: '`collections-severity`',
      line: '70% סכום / 30% ימי פיגור, ציון 0–100.',
      explain: [
        'ציון = 100 × (0.7 × min(יתרה / 100,000, 1) + 0.3 × min(ימי פיגור / 90, 1)). מ-70 קריטית, מ-45 גבוהה, מ-20 בינונית, מתחת נמוכה. המשקלים, התקרות והספים הם הגדרות (AgentSettings, severity*). אותו ציון ממיין כברירת מחדל את החשבוניות הפתוחות בכרטיס הלקוח.',
      ],
      reads: ['Invoices', 'AgentSettings'],
      next: [{ to: '5' }, { to: '6' }],
    },
    {
      n: '5',
      title: 'סריקת משימות 06:00',
      kind: 'קוד',
      action: '`RunDaySchedule` → `BuildTasks`',
      line: 'סגירת חודשים שהתאפסו → שכבת החשבונית → בניית המשימות, לפי מפתח.',
      explain: [
        'שלב 06:00 של יום העבודה: משיכות הבוקר, CloseSettledNotes, RefreshInvoiceLayer ו-BuildTasks (כולל המשימות המרוכזות של ההערות). גבייה: חשבונית בפיגור מעל 7 ימים בלי בירור פתוח ובלי התחייבות פתוחה או הערת בירור על אותו לקוח + חודש → "לגבות מהלקוח"; בירור שהגיע מועד הבדיקה החוזרת; תעודות משלוח חסרות. פניות: מייל שלא טופל, שולח לאימות, טיוטה לאישור. תקבולים: לקוח לא מזוהה, צריך פיזור, פירוט לא התקבל, צ׳ק חוזר (קריטית). משימה אחת לכל בעיה (taskKey); מה שנפתר נסגר אוטומטית עם סיבה; משימה שאדם סגר נשארת סגורה. המשימות הישנות "הבטחה הופרה" ו"מעקב הערת בירור" לא נפתחות יותר.',
      ],
      reads: ['Invoices', 'CustomerNotes', 'Disputes', 'InboundEmails', 'Approvals', 'BankLines', 'AgentSettings'],
      writes: ['CollectionQueue'],
      next: [{ to: '5א' }],
      children: [
        {
          n: '5א',
          title: 'עדכון מיידי מהכותבים',
          kind: 'קוד',
          action: '`syncTasksAfterWrite`',
          line: 'כל פעולה מעדכנת את המשימות שלה מיד, בלי לחכות לבוקר.',
          explain: [
            'מיון מייל, סימון טיפול, טיוטה חדשה, החלטה על טיוטה, בדיקת שורת בנק, פיזור והערה מריצים את אותו מנוע משימות על התחום שלהם בלבד. כשל בעדכון לא מפיל את הפעולה עצמה; הסריקה של הבוקר משלימה. משימה ידנית (CreateTask) מקבלת מפתח manual: והסריקה לא נוגעת בה.',
          ],
          writes: ['CollectionQueue'],
          next: [{ to: '5ב' }],
        },
        {
          n: '5ב',
          title: 'דף המשימות',
          kind: 'מסך',
          action: '`CollectionQueue`',
          line: '/collections/tasks; משימה מרוכזת נפתחת לשורות.',
          explain: [
            'מיון לפי חומרה, אחר כך הציון, אחר כך הוותיקה. משימה מרוכזת נפתחת לשורות הלקוחות עם "טופל"; דף הבנק ראשון ודחוף; מתג "התראות" מציג התראות בלי פעולה. אדם מסמן "בטיפול", "טופל" או "דחה"; משימה שאדם סגר נשארת סגורה.',
          ],
          reads: ['CollectionQueue', 'OpenTasks'],
          writes: ['CollectionQueue'],
          next: [],
        },
      ],
    },
    {
      n: '6',
      title: 'כרטיס הלקוח',
      kind: 'מסך',
      action: '`GetCustomer360`',
      line: 'פיד הערות, פס התחייבויות, חודשים פתוחים עם "הערה" לחודש.',
      explain: [
        'הפיד בנוי מ-CustomerNotes; פס ההתחייבויות לפי outcome עם נכנס / נשאר; טבלת החודשים הפתוחים (openMonths) עם כפתור "הערה" לכל חודש. כל קבלה מראה מה כיסתה ומה נשאר פתוח. טאב אובליגו ללקוח מבוטח (03 · ביטוח אשראי, בלוק 5).',
      ],
      reads: ['CustomerNotes', 'OpenMovements', 'Receipts', 'ReceiptAllocations'],
      writes: ['CustomerNotes (דרך `AddCustomerNote`)'],
      next: [],
    },
    {
      n: '7',
      title: 'הבטחה ממייל',
      kind: 'סוכן AI',
      action: '`ApplyMailClassification` → `AddCustomerNote` · סוכן + אדם',
      line: 'מאיה מציעה, האחראית מאשרת; תשלום מותנה = בירור.',
      ladder: {
        found: { to: '2', label: 'אשר הבטחה' },
        foundNote: 'לפי מה שמאיה החזירה, עם ציטוט שנמצא במייל',
        rungs: [
          {
            title: 'הבטחה בלי תנאי ועם תאריך',
            kind: ['סוכן AI', 'אדם'],
            line: 'נשמרת כהצעה על המייל (ממתינה לאישור). המשימה: "לאשר הבטחה מהמייל".',
            tables: ['InboundEmails'],
          },
          {
            title: 'תשלום מותנה בתיקון, או טענה שהחשבונית שגויה',
            kind: 'סוכן AI',
            line: 'הערת "אחר" (בירור – סיבה) לכל חודש של החשבוניות שצוטטו, פעם אחת לכל מייל. לא נוצרת התחייבות.',
            tables: ['CustomerNotes'],
            outcome: 'בירור, בלי התחייבות',
          },
          {
            title: '"כבר שילמנו"',
            kind: 'סוכן AI',
            line: 'פירוט תשלום, לא בירור (01 · תקבולים).',
            outcome: 'פירוט תשלום ← 01',
          },
        ],
      },
      explain: [
        '"אשר הבטחה" בפאנל המייל רושם הערת התחייבות לתשלום אחת על החודש הוותיק של החשבוניות שצוטטו (מקור: מאיה ממייל), מסמן את ההצעה "אושרה" ואת המייל "טופל". אישור שני של אותו מייל נדחה ולא כותב כלום.',
      ],
      reads: ['InboundEmails', 'OpenMovements'],
      writes: ['InboundEmails', 'CustomerNotes', 'CollectionQueue'],
      next: [{ to: '2' }],
    },
    {
      n: '8',
      title: 'פיד שיחות בכרטיס',
      kind: 'מסך',
      action: '`GetCustomer360`',
      line: 'הערות, מיילים, טיוטות, שיחות ובירורים בפיד אחד, החדש למעלה.',
      explain: ['הפיד נבנה מהשורות ש-GetCustomer360 מחזיר. מייל נפתח בפאנל המייל. הערה שתמר רשמה מסומנת "נרשם דרך תמר".'],
      reads: ['CustomerNotes', 'InboundEmails', 'Approvals', 'Interactions', 'Disputes'],
      next: [],
    },
    {
      n: '9',
      title: 'תמר בכרטיס',
      kind: 'סוכן AI',
      action: '`CustomerCardAgent` → `AddCustomerNote` · סוכן + אדם',
      line: 'האחראית כותבת מה הלקוח אמר, תמר רושמת הערה לחודש אחרי אישור במילים.',
      explain: [
        'בועת צ׳אט בתוך הכרטיס. תמר קוראת את החודשים הפתוחים, כותבת בשורה אחת מה ייכתב, ורושמת רק אחרי "כן" של האחראית, דרך AddCustomerNote (מקור: תמר בכרטיס). היא לא שולחת מיילים ולא כותבת ל-Priority.',
      ],
      reads: ['CustomerNotes', 'OpenMovements'],
      writes: ['CustomerNotes', 'CollectionQueue'],
      next: [{ to: '10' }],
    },
    {
      n: '10',
      title: 'סיכום יומי ללקוח',
      kind: 'סוכן AI',
      action: '`MorningRun` → `CustomerSummaryRun` · workflow א׳–ה׳ 07:30',
      line: 'תמר כותבת לכל לקוח שני-שלושה משפטים והצעה לפעולה אחת, בראש הכרטיס.',
      explain: [
        'PrepareCustomerSummaries (קוד) אוסף לכל לקוח עם יתרה, משימה, התחייבות פתוחה או הצעת הבטחה ממייל את העובדות (יתרה, פיגור, התחייבות פתוחה, התחייבויות שלא קוימו, הערות פעילות, בירורים, משימות, קשר אחרון); תמר מחזירה מבנה קבוע; WriteCustomerSummaries (קוד) בודק וכותב, ולכל לקוח שחסר כותב סיכום מהעובדות ("קוד (גיבוי)").',
      ],
      reads: ['Invoices', 'CustomerNotes', 'Disputes', 'CollectionQueue', 'Interactions', 'InboundEmails'],
      writes: ['CustomerDailySummaries'],
      next: [],
    },
  ],
};

/** Every block of a flow in drawing order (each parent followed by its sub-steps). */
export function flattenFlow(blocks: FlowBlock[]): FlowBlock[] {
  return blocks.flatMap((b) => [b, ...(b.children ?? [])]);
}