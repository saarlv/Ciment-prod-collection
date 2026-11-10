/**
 * Counts behind the briefing
 */
export interface IAgentBriefingsEntityCountsObject {
  bankLines?: number;
  certainMatches?: number;
  toReview?: number;
  unidentified?: number;
  bouncedChecks?: number;
  promisesDue?: number;
  promisesSeen?: number;
  promisesKept?: number;
  promisesPartial?: number;
  promisesBroken?: number;
  insuranceAlerts?: number;
  inboxDueSoon?: number;
  openTasks?: number;
  receiptsApprovedToday?: number;
  debtClosedZero?: number;
  debtToClarify?: number;
  waitingAllocation?: number;
  escalatedDocumentCases?: number;
}

/**
 * Morning briefings written by Nina after the morning uploads, per bookkeeper or for everyone.
 */
export interface IAgentBriefingsEntity {
  /** Briefing date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  briefingDate?: string;
  /** Agent display name  */
  agentName?: string;
  /** Bookkeeper display name, or כולם  */
  audience?: string;
  /** One-line headline  */
  headline?: string;
  /** Briefing body (markdown)  */
  body?: string;
  /** Counts behind the briefing  */
  counts?: IAgentBriefingsEntityCountsObject;
  /** Import batch that triggered the briefing (text link to ImportBatches.id)  */
  triggeredByImportId?: string;
  /** When the briefing was written. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  briefingCreatedAt?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const AgentBriefingsEntity = {
  tableBlockId: "AgentBriefings",
  instanceType: {} as IAgentBriefingsEntity,
} as const;

export type AgentFeedbackEntityAgentNameEnum =
  | "BankFileReader"
  | "CollectionsAgent";

export type AgentFeedbackEntityVerdictEnum = "צדק" | "טעה" | "הערה";

/**
 * Structured right/wrong feedback on the receipts agents, given in the receipts panel: on the reader (BankFileReader) per extracted line or field, on Nina (CollectionsAgent) per checked line. No agent replies to it. A טעה row with valueCorrect is a ready eval golden. AgentFeedbackStats counts it per agent and week.
 */
export interface IAgentFeedbackEntity {
  /** Agent the feedback is about  */
  agentName?: AgentFeedbackEntityAgentNameEnum;
  /** Import batch (text link to ImportBatches.id)  */
  importBatchId?: string;
  /** Bank line (text link to BankLines.bankLineId); empty for feedback on the whole file  */
  bankLineId?: string;
  /** Verdict  */
  verdict?: AgentFeedbackEntityVerdictEnum;
  /** Field that was wrong, e.g. amount, payerName, valueDate, customer, invoices  */
  field?: string;
  /** What the agent gave  */
  valueGiven?: string;
  /** The correct value  */
  valueCorrect?: string;
  /** Free note (also the file's comment thread)  */
  comment?: string;
  /** Who gave the feedback  */
  byName?: string;
  /** Their email  */
  byEmail?: string;
  /** When. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  at?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const AgentFeedbackEntity = {
  tableBlockId: "AgentFeedback",
  instanceType: {} as IAgentFeedbackEntity,
} as const;

export type AgentSettingsEntityValueTypeEnum = "מספר" | "טקסט" | "כן או לא";

export type AgentSettingsEntityBasisEnum =
  | "החלטת יניב"
  | "הנחה"
  | "ברירת מחדל"
  | "הוגדר במסך";

/**
 * Settings the agents and engines read (thresholds, days, approvers). Each setting carries its basis so assumptions not yet confirmed with Yaniv are visible.
 */
export interface IAgentSettingsEntity {
  /** Setting key, unique (e.g. remittanceEscalationDays)  */
  settingKey?: string;
  /** Value as text  */
  value?: string;
  /** Value type  */
  valueType?: AgentSettingsEntityValueTypeEnum;
  /** Hebrew label  */
  label?: string;
  /** What the setting controls  */
  description?: string;
  /** Where the value comes from  */
  basis?: AgentSettingsEntityBasisEnum;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const AgentSettingsEntity = {
  tableBlockId: "AgentSettings",
  instanceType: {} as IAgentSettingsEntity,
} as const;

export type ApprovalsEntityKindEnum =
  | "דואל"
  | "WhatsApp"
  | "שיחה"
  | "בקשת זיכוי"
  | "הסלמה"
  | "בקשת הגדלת מסגרת"
  | "מענה ללקוח"
  | "בקשת פירוט"
  | "מנת חובות פתוחים"
  | "פנייה ללוגיסטיקה"
  | "בקשת אישור מחיר"
  | "הצעת קבלה";

export type ApprovalsEntityStatusEnum =
  | "ממתין"
  | "אושר"
  | "אושר – לא נשלח"
  | "אושר – לביצוע ב-Priority"
  | "בוצע"
  | "נדחה"
  | "נשלח";

export type ApprovalsEntityComponentEnum =
  | "פניות"
  | "תקבולים"
  | "תעודות"
  | "מחירים"
  | "מנה חודשית"
  | "ביטוח";

/**
 * The outbox of component 04 (פניות): every draft any component writes (reply to customer, detail request, logistics request, price approval request, monthly open-debts batch, insurance). Each row carries referenceCode CIM-<id> (appended to the subject), the writing component and reply tracking. Approving moves it to אושר – לא נשלח; nothing is ever sent yet.
 */
export interface IApprovalsEntity {
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Draft kind  */
  kind?: ApprovalsEntityKindEnum;
  /** Recipient name  */
  recipientName?: string;
  /** Recipient email/phone  */
  recipientContact?: string;
  /** Subject  */
  subject?: string;
  /** Body (long text)  */
  body?: string;
  /** Why the agent proposes this (long text)  */
  reason?: string;
  /** Approval status  */
  status?: ApprovalsEntityStatusEnum;
  /** Drafted by  */
  draftedBy?: string;
  /** Drafted at. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  draftedAt?: string;
  /** Decided by  */
  decidedBy?: string;
  /** Decided at. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  decidedAt?: string;
  /** Decision note  */
  decisionNote?: string;
  /** Table of the record this draft belongs to (e.g. Disputes, MatchProposals, InboundEmails)  */
  relatedTable?: string;
  /** Id of the related record, as text  */
  relatedId?: string;
  /** Bookkeeper mailbox the reply would come from  */
  fromMailbox?: string;
  /** Attachment links (e.g. statement PDF), one per line  */
  attachmentUrls?: string;
  /** Batch id when the draft is part of a batch (open-debts batch, certain-match batch)  */
  batchId?: string;
  /** Inbound email this draft answers (text link to InboundEmails.messageId)  */
  inboundEmailId?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** Reference CIM-<id> appended to the subject of every outbound message; an inbound reply carrying it is linked back to this row  */
  referenceCode?: string;
  /** Provider thread id of the sent message (empty until real sending exists) or of the inbound mail it answers  */
  threadId?: string;
  /** Which component wrote this draft  */
  component?: ApprovalsEntityComponentEnum;
  /** Mailboxes.id the message would be sent from (text link)  */
  mailboxId?: string;
  /** InboundEmails.id of the latest reply linked to this message  */
  lastReplyEmailId?: string;
  /** When the latest reply arrived. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lastReplyAt?: string;
  /** How many replies were linked to this message  */
  replyCount?: number;
}

export const ApprovalsEntity = {
  tableBlockId: "Approvals",
  instanceType: {} as IApprovalsEntity,
} as const;

export type BankAliasesEntityStatusEnum = "מוצע" | "מאושר" | "נדחה";

export type BankAliasesEntitySourceEnum = "אישור התאמה" | "מייל" | "ידני";

export type BankAliasesEntityPrioritySyncEnum = "לא סונכרן" | "סונכרן";

/**
 * Maps a payer name as it appears on bank lines to a customer (rung 2 of payer identification). Since Iteration 9 an alias is written already approved when a person approves a match whose payer name differs from the customer name (source), and is not yet synced to Priority.
 */
export interface IBankAliasesEntity {
  /** Payer name exactly as it appears on the bank line  */
  bankName?: string;
  /** Customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Alias status  */
  status?: BankAliasesEntityStatusEnum;
  /** Bank line that triggered the proposal (text link to BankLines.bankLineId)  */
  proposedFromBankLineId?: string;
  /** When the alias was proposed. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  proposedAt?: string;
  /** Who approved or rejected the alias  */
  approvedBy?: string;
  /** When the alias was approved or rejected. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  approvedAt?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** Where the alias came from  */
  source?: BankAliasesEntitySourceEnum;
  /** InboundEmails id that identified the payer, when it came from mail  */
  evidenceEmailId?: string;
  /** Sync to Priority  */
  prioritySync?: BankAliasesEntityPrioritySyncEnum;
}

export const BankAliasesEntity = {
  tableBlockId: "BankAliases",
  instanceType: {} as IBankAliasesEntity,
} as const;

export type BankLinesEntityBankNameEnum = "מזרחי" | "בינלאומי" | "אחר";

export type BankLinesEntityLineTypeEnum =
  | "העברה"
  | "זיכוי בנק"
  | "פירעון צ׳ק"
  | "צ׳ק"
  | "צ׳ק חוזר"
  | "אחר";

export type BankLinesEntityStatusEnum = "חדשה" | "לא מזוהה" | "קבלה הונפקה";

export type BankLinesEntitySourceEnum =
  | "priority-mock"
  | "priority-file"
  | "priority-api"
  | "test-fixture";

export type BankLinesEntityLegibilityEnum = "טובה" | "בינונית" | "נמוכה";

export type BankLinesEntityCheckStageEnum =
  | "ממתינה לבדיקה"
  | "זיהוי לקוח"
  | "ממתינה לאישור"
  | "אושרה"
  | "לא מזוהה";

/**
 * Bank lines. Since plan r3 stage 2 (03.11) they are a mirror of Priority's screen שורות דפי בנק, written by SyncPriorityBankLines (source priority-mock until the API is connected, priorityLineId, syncedAt; deduped on priorityLineId; bankLineId = PL-<priorityLineId>, or an older file line with the same account, date, amount, payer and reference is adopted instead of duplicated). Only lineType העברה / זיכוי בנק are checked. Lines without priorityLineId came from an uploaded file and stay as they are, view only. Before stage 2: since Iteration 9 they are written by WriteExtractedLines from the reader agent's output (lineNo, sourceRef, rawText for the verify-beside-the-original view) and identified by IdentifyCustomers (checkStage). customerCode/customerName are written when the customer is identified and approved.
 */
export interface IBankLinesEntity {
  /** Unique bank line id  */
  bankLineId?: string;
  /** Bank  */
  bankName?: BankLinesEntityBankNameEnum;
  /** Value date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  valueDate?: string;
  /** Amount ILS  */
  amount?: number;
  /** Payer name as it appears on the bank line  */
  payerName?: string;
  /** Bank reference / free text  */
  reference?: string;
  /** Our bank account the money arrived in  */
  bankAccount?: string;
  /** Line type. Since plan r3 stage 2 (Priority's bank statement lines): העברה / זיכוי בנק go into the receipt check; פירעון צ׳ק / אחר are shown apart and not handled. צ׳ק / צ׳ק חוזר are kept for the older file lines  */
  lineType?: BankLinesEntityLineTypeEnum;
  /** The line's id on Priority's bank statement lines screen (שורות דפי בנק). The import dedupes on it; empty = an older line that came from an uploaded file (legacy, view only)  */
  priorityLineId?: string;
  /** Customer the line was assigned to after an approved match (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Import batch that loaded the line (text link to ImportBatches.id)  */
  importBatchId?: string;
  /** Line status: חדשה (written by the file confirm / Priority sync), לא מזוהה, קבלה הונפקה (the receipt was marked issued in Priority). The identify / receipt progress is in checkStage  */
  status?: BankLinesEntityStatusEnum;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: BankLinesEntitySourceEnum;
  /** When this row was last loaded from Priority / the bank file. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
  /** Order of the line in the file (1-based)  */
  lineNo?: number;
  /** Where the line sits in the original, e.g. p2:r14 (page 2 row 14) or row 14  */
  sourceRef?: string;
  /** The line exactly as the reader read it  */
  rawText?: string;
  /** How legible the line was to the reader  */
  legibility?: BankLinesEntityLegibilityEnum;
  /** Check flags, comma-separated: שדה חסר, קריאות נמוכה, כפילות  */
  extractionFlags?: string;
  /** Who corrected a field the reader misread  */
  correctedBy?: string;
  /** When the line was corrected. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  correctedAt?: string;
  /** Where the line stands: ממתינה לבדיקה → זיהוי לקוח → ממתינה לאישור (identified, receipt draft) or לא מזוהה → אושרה (IssueReceipt)  */
  checkStage?: BankLinesEntityCheckStageEnum;
  /** checkRunId of the latest identification run (ReceiptCheckSteps.checkRunId)  */
  lastCheckRunId?: string;
  /** When the line was last checked. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lastCheckedAt?: string;
  /** Receipts.receiptKey once the person approved the split (one receipt per transfer)  */
  receiptKey?: string;
}

export const BankLinesEntity = {
  tableBlockId: "BankLines",
  instanceType: {} as IBankLinesEntity,
} as const;

export type CollectionQueueEntityRecommendedActionEnum =
  | "לשלוח תזכורת"
  | "לשלוח WhatsApp"
  | "להתקשר"
  | "להסלים למנהל"
  | "לטפל במחלוקת"
  | "לבדוק הבטחה"
  | "לשחרר הזמנה חסומה"
  | "לדבר עם הסוכן"
  | "לפנות ללוגיסטיקה"
  | "לטפל במייל"
  | "לאשר טיוטה"
  | "להתאים תקבול";

export type CollectionQueueEntityStatusEnum =
  | "ממתין"
  | "בטיפול"
  | "טופל"
  | "נדחה"
  | "נסגר אוטומטית";

export type CollectionQueueEntityTaskTypeEnum =
  | "צ׳ק חוזר"
  | "הבטחה הופרה"
  | "לאמת שולח"
  | "ביטוח 80%"
  | "אחר"
  | "לגבות מהלקוח"
  | "מעקב בירור – מחיר"
  | "מעקב בירור – תעודה חסרה"
  | "מעקב בירור – אחר"
  | "תעודות משלוח חסרות"
  | "מייל לטיפול"
  | "טיוטה לאישור"
  | "לא זוהה"
  | "דפי בנק לא נטענו"
  | "התחייבויות שלא קוימו – ליצור קשר"
  | "להתקשר לפרטי אשראי"
  | "צ׳ק אצל סוכן – אין קבלה"
  | "לחזור ללקוח"
  | "תזכורות"
  | "משיכת הבוקר נכשלה"
  | "דף הבנק לא עלה לפריוריטי"
  | "זיהוי לקוח – לאישור"
  | "קבלה – צריך פיזור"
  | "לברר מול הלקוח – סכום לא סוגר חודש"
  | "חסר איש קשר הנהלת חשבונות"
  | "נסגר לאפס"
  | "להוסיף איש קשר בפריוריטי"
  | "תעודות / חשבוניות חסרות – טיפול ידני"
  | "זיכוי / הפרש מחיר – טיפול ידני";

/**
 * undefined
 */
export interface ICollectionQueueEntityCollectionQueueEntityItemsJsonItemObject {
  customerCode?: string;
  customerName?: string;
  /** YYYY-MM  */
  dueMonth?: string;
  /** Promised amount (commitments) or the note amount  */
  promised?: number;
  received?: number;
  remaining?: number;
  /** קוימה חלקית / לא קוימה for commitments  */
  outcome?: string;
  noteIds?: string[];
  /** Marked טופל by a person  */
  handled?: boolean;
  handledBy?: string;
  handledAt?: string;
}

export type CollectionQueueEntitySeverityEnum =
  | "קריטית"
  | "גבוהה"
  | "בינונית"
  | "נמוכה";

export type CollectionQueueEntitySourceEnum =
  | "דוח גיול"
  | "פניות"
  | "תקבולים"
  | "הבטחות"
  | "ביטוח";

/**
 * Tasks (משימות): one row per problem that needs handling, keyed by taskKey. Written by the 06:00 task scan (aging), the inbox and the receipts flow; closed automatically when the problem is gone
 */
export interface ICollectionQueueEntity {
  /** Queue date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  queueDate?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Assigned bookkeeper  */
  assignedBookkeeperName?: string;
  /** Priority score  */
  priorityScore?: number;
  /** Short Hebrew list of why the customer is in today's queue (long text)  */
  reasons?: string;
  /** Recommended action  */
  recommendedAction?: CollectionQueueEntityRecommendedActionEnum;
  /** Queue item status  */
  status?: CollectionQueueEntityStatusEnum;
  /** Who handled it  */
  handledBy?: string;
  /** When it was handled. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  handledAt?: string;
  /** Task type  */
  taskType?: CollectionQueueEntityTaskTypeEnum;
  /** Grouped tasks (plan 04.11): one task per note type + date + bookkeeper (taskKey notes:<type>:<date>:<bookkeeper>), one item per customer + month. An item leaves when its month's balance reaches 0 or a person marks it handled; the task closes when no items are left  */
  itemsJson?: ICollectionQueueEntityCollectionQueueEntityItemsJsonItemObject[];
  /** True for notices with nothing to do (e.g. נסגר לאפס): shown under the התראות filter, without a handle button. Writers always set it  */
  isAlert?: boolean;
  /** True when the task must be approved by a manager (e.g. a receipt whose match is not one-to-one). Writers always set it  */
  needsManagerApproval?: boolean;
  /** Table of the record the task is about  */
  relatedTable?: string;
  /** Id of the related record, as text  */
  relatedId?: string;
  /** When the task is due. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  dueAt?: string;
  /** Unique key per problem, e.g. aging-overdue:<invoiceNumber>, promise-broken:<promiseId>, inbox:<emailId>, draft:<approvalId>, receipt-customer:<bankLineId>. Writers upsert by it, so a problem has one task  */
  taskKey?: string;
  /** Short Hebrew title shown in the tasks list  */
  title?: string;
  /** Severity level  */
  severity?: CollectionQueueEntitySeverityEnum;
  /** Severity score 0–100 (higher first): weighted amount and days overdue, weights and level thresholds from AgentSettings (severityWeightAmount, severityWeightDays, severityScoreCritical/High/Medium)  */
  severityScore?: number;
  /** Which part of the app opened the task  */
  source?: CollectionQueueEntitySourceEnum;
  /** Invoice numbers the task is about, comma-separated (text links to Invoices)  */
  invoiceNumbers?: string;
  /** Amount at stake ILS  */
  amount?: number;
  /** When the task was first opened (stays the same while the problem lasts). ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  openedAt?: string;
  /** When a writer or the daily scan last confirmed the problem is still there. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lastCheckedAt?: string;
  /** When the task was closed (by a person or automatically). ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  resolvedAt?: string;
  /** Why it was closed: the person's short note, or the automatic reason (e.g. the invoice was paid)  */
  resolvedReason?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const CollectionQueueEntity = {
  tableBlockId: "CollectionQueue",
  instanceType: {} as ICollectionQueueEntity,
} as const;

export type CreditCoversEntityStatusEnum = "תקף" | "בטיפול" | "מבוטל";

export type CreditCoversEntityCoverSourceEnum = "Priority" | "ICIC";

/**
 * Mirror, read-only in the app (in Saar's spec: credit_covers). One row per credit-insurance cover of a customer at the insurer (בסס״ח / ICIC). Replaces the old insurance fields on Customers (creditInsurer, insurerCaseNumber, insuranceApprovedAmount). A customer is insured when it has a cover with status תקף; the customer card's אובליגו וביטוח tab exists only for customers with a cover. Today filled by test fixtures only; the Priority / ICIC sync is a gap. Never written by the app's logic.
 */
export interface ICreditCoversEntity {
  /** Priority customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** Insurer name, e.g. בסס״ח  */
  insurer?: string;
  /** Cover number at the insurer (sent as ORIG_COVER_NO on an increase request)  */
  coverNo?: string;
  /** Insured credit limit ILS (המסגרת המבוטחת)  */
  insuredAmount?: number;
  /** Cover valid until (empty = no expiry known). ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  validUntil?: string;
  /** Cover status  */
  status?: CreditCoversEntityStatusEnum;
  /** Where the cover data comes from  */
  coverSource?: CreditCoversEntityCoverSourceEnum;
  /** Data source: priority-api, icic (CreditCovers only) or test-fixture (marked test data, removed by DeleteTestFixtures). Writers must set it  */
  source?: string;
  /** When this row was last synced. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
}

export const CreditCoversEntity = {
  tableBlockId: "CreditCovers",
  instanceType: {} as ICreditCoversEntity,
} as const;

export type CreditLimitRequestsEntityStatusEnum =
  | "טיוטה"
  | "הוצעה ע״י הסוכנת"
  | "אושר – לא הוגש"
  | "ממתינה להגשה"
  | "הוגשה למבטח"
  | "אושרה"
  | "אושרה חלקית"
  | "נדחתה"
  | "עודכן ב-Priority";

/**
 * undefined
 */
export interface ICreditLimitRequestsEntityCreditLimitRequestsEntityFieldsItemObject {
  /** ICIC field name, e.g. REGISTERED_NO  */
  name?: string;
  /** Hebrew label  */
  label?: string;
  /** Value that would be sent; null when unknown or missing  */
  value?: any;
  /** מהנתונים = taken from the customer card or reports; קבוע = constant; חסר = the source field is empty; לא ידוע = not yet known (to clarify with Yaniv)  */
  status?: CreditLimitRequestsEntityStatusEnum;
  /** Where the value comes from, in Hebrew  */
  source?: string;
  /** Hebrew note, e.g. לא ידוע – לברר עם יניב  */
  note?: string;
}

/**
 * ICIC quota-increase request preview
 */
export interface ICreditLimitRequestsEntityInsurerFieldsObject {
  /** Always ICIC  */
  api?: string;
  /** Always increase (הגדלת מכסה); new-customer requests are not built  */
  requestType?: string;
  /** ICIC fields in send order  */
  fields?: ICreditLimitRequestsEntityCreditLimitRequestsEntityFieldsItemObject[];
  /** Names of fields with status חסר or לא ידוע  */
  missingFields?: string[];
}

/**
 * Credit limit increase requests
 */
export interface ICreditLimitRequestsEntity {
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Current limit ILS  */
  currentLimit?: number;
  /** Obligo %  */
  obligoPct?: number;
  /** Requested limit ILS  */
  requestedLimit?: number;
  /** Justification (long text)  */
  justification?: string;
  /** Request status  */
  status?: CreditLimitRequestsEntityStatusEnum;
  /** When the request was created. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  requestCreatedAt?: string;
  /** Insured-limit utilisation % when the proposal was created  */
  triggeredAtPct?: number;
  /** Company registration number (ח״פ)  */
  companyId?: string;
  /** Currency of the request, e.g. ILS  */
  currency?: string;
  /** Insured limit ILS at the time of the request  */
  insuredLimitAtRequest?: number;
  /** ICIC quota-increase request preview  */
  insurerFields?: ICreditLimitRequestsEntityInsurerFieldsObject;
  /** Bookkeeper who owns the customer (display name)  */
  assignedBookkeeperName?: string;
  /** Who proposed the increase (agent display name or person)  */
  proposedBy?: string;
  /** Who approved or rejected the proposal  */
  decidedBy?: string;
  /** When the proposal was decided. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  decidedAt?: string;
  /** When the request was submitted to the insurer. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  submittedAt?: string;
  /** Amount approved by the insurer ILS  */
  approvedAmount?: number;
  /** Insurer case number  */
  insurerCaseNumber?: string;
  /** Insurer response note  */
  insurerResponseNote?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const CreditLimitRequestsEntity = {
  tableBlockId: "CreditLimitRequests",
  instanceType: {} as ICreditLimitRequestsEntity,
} as const;

export type CustomerContactsEntitySourceEnum =
  | "priority-mock"
  | "priority-file"
  | "priority-api"
  | "test-fixture"
  | "נוסף אצלנו"
  | "priority-direct";

/**
 * Read-only mirror of contacts on the Priority customer card. Used to verify email senders (statements only go to registered contacts) and as step 2 of payer identification.
 */
export interface ICustomerContactsEntity {
  /** Unique contact key (customerCode + contact id in Priority)  */
  contactKey?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Contact person name  */
  contactName?: string;
  /** Contact email  */
  email?: string;
  /** Contact phone  */
  phone?: string;
  /** Roles, comma-separated from: הנהלת חשבונות, רכש, ראשי, אחר  */
  roleFlags?: string;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: CustomerContactsEntitySourceEnum;
  /** When this row was last loaded from Priority / the bank file. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
  /** The customer's accounts-payable (הנהלת חשבונות) contact: detail requests for unexplained transfers go to this person. From Priority (whether Priority maintains this flag is open with Yaniv); writers always set it  */
  isApContact?: boolean;
  /** Plan 04.11 part C: job title from the mail signature of a sender we added  */
  signatureTitle?: string;
  /** InboundEmails id the contact was confirmed from (source נוסף אצלנו); the Priority pull never touches these rows  */
  addedFromEmailId?: string;
  /** Mirror key from Priority (see table description); null on rows the app added  */
  priorityKey?: string;
  /** SyncRuns.runId of the SyncPrioritySubforms run that last wrote the row  */
  syncRunId?: string;
  /** True when a full read of this scope no longer found the row in Priority; never deleted  */
  deletedInSource?: boolean;
  /** CUSTPERSONNEL_SUBFORM.PHONE (contact id)  */
  priorityContactId?: number;
  /** FIRSTNAME  */
  firstName?: string;
  /** LASTNAME  */
  lastName?: string;
  /** POSITIONDES  */
  position?: string;
  /** CELLPHONE  */
  mobile?: string;
  /** OFFICEPHONE  */
  officePhone?: string;
  /** FAX  */
  fax?: string;
  /** STATDES (e.g. פעיל)  */
  priorityStatus?: string;
  /** INACTIVE flag set in Priority  */
  isInactive?: boolean;
  /** FIRM (company name on the contact)  */
  firm?: string;
}

export const CustomerContactsEntity = {
  tableBlockId: "CustomerContacts",
  instanceType: {} as ICustomerContactsEntity,
} as const;

export type CustomerDailySummariesEntityActionTypeEnum =
  | "להתקשר"
  | "לשלוח תזכורת"
  | "לבדוק בירור"
  | "לאשר הבטחה"
  | "לטפל בתקבול"
  | "לחכות למועד"
  | "אין צורך בפעולה";

/**
 * The facts the summary was written from, so the card can show the evidence
 */
export interface ICustomerDailySummariesEntityBasisObject {
  openBalance?: number;
  overdueAmount?: number;
  oldestOverdueDays?: number;
  openPromise?: string;
  brokenPromises?: number;
  openDisputes?: number;
  openTasks?: string[];
  latestNote?: string;
  lastContact?: string;
}

export type CustomerDailySummariesEntityWrittenByEnum = "סוכן" | "קוד (גיבוי)";

/**
 * The card agent's short daily summary per customer, with one suggested action, shown at the top of the customer card
 */
export interface ICustomerDailySummariesEntity {
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** The day the summary is for (Asia/Jerusalem). One row per customer and day; a rerun the same day replaces it. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  summaryDate?: string;
  /** Two or three Hebrew sentences: where the account stands, what changed, what matters today  */
  summary?: string;
  /** One Hebrew sentence: the single next step the agent recommends  */
  suggestedAction?: string;
  /** The kind of suggested step  */
  actionType?: CustomerDailySummariesEntityActionTypeEnum;
  /** The facts the summary was written from, so the card can show the evidence  */
  basis?: ICustomerDailySummariesEntityBasisObject;
  /** Who wrote the text  */
  writtenBy?: CustomerDailySummariesEntityWrittenByEnum;
  /** When the summary was written. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  writtenAt?: string;
  /** True for TEST- customers; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const CustomerDailySummariesEntity = {
  tableBlockId: "CustomerDailySummaries",
  instanceType: {} as ICustomerDailySummariesEntity,
} as const;

/**
 * Mirror, read-only (customer_exposure). One row per customer: the obligo (אובליגו) total exactly as Priority computes it, with asOf. Never computed by the app. The dynamic obligo is computed at display time by GetCreditExposure and never stored. Replaces Customers.obligoUsed / obligoPct.
 */
export interface ICustomerExposureEntity {
  /** Priority customer code, unique  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** Static obligo ILS from Priority  */
  obligoTotal?: number;
  /** When Priority computed it. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  asOf?: string;
  /** Data source: priority-api, icic (CreditCovers only) or test-fixture (marked test data, removed by DeleteTestFixtures). Writers must set it  */
  source?: string;
  /** When this row was last synced. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
}

export const CustomerExposureEntity = {
  tableBlockId: "CustomerExposure",
  instanceType: {} as ICustomerExposureEntity,
} as const;

export type CustomerNotesEntityNoteTypeEnum =
  | "התחייבות לתשלום"
  | "תשלום באשראי"
  | "צ׳ק אצל סוכן"
  | "חזור אליי"
  | "אחר";

export type CustomerNotesEntityNoteSourceEnum =
  | "צוות"
  | "מאיה ממייל"
  | "תמר בכרטיס"
  | "מיגרציה";

export type CustomerNotesEntityStatusEnum =
  | "פעילה"
  | "נסגרה – החודש התאפס"
  | "נסגרה ידנית";

export type CustomerNotesEntityOutcomeEnum =
  | "פתוחה"
  | "קוימה"
  | "קוימה חלקית"
  | "לא קוימה";

/**
 * Our enrichment on the aging report (plan 04.11, part A). A payment promise is a note of type התחייבות לתשלום. One note belongs to one customer + one due month (dueMonth YYYY-MM). The four active types need actionDate and open a grouped task (CollectionQueue, key notes:<type>:<date>:<bookkeeper>) on the date from AgentSettings noteTask.*; any note may have reminderDate. A note closes automatically only when the month's open balance in OpenMovements reaches 0 (status נסגרה – החודש התאפס, closedAt) and stays as history. outcome / amountReceived / amountRemaining / checkedAt are set for commitments by CheckCommitments the day after actionDate, after the receipts run. legacyId is no longer used (the old tables were removed in wave 3). The customer link is the app's first real reference column; customerCode and customerName stay beside it because agents read them.
 */
export interface ICustomerNotesEntity {
  /** Link to the customer row (real reference)  */
  customer?: number;
  /** Priority customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** When the note was written. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  noteCreatedAt?: string;
  /** The due month the note is about, YYYY-MM  */
  dueMonth?: string;
  /** Note type: four active types open a task, אחר is free  */
  noteType?: CustomerNotesEntityNoteTypeEnum;
  /** Free type label when noteType is אחר  */
  customTypeLabel?: string;
  /** Note content  */
  noteText?: string;
  /** Commitment / payment / cheque / call-back date; required for the four active types. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  actionDate?: string;
  /** Optional reminder date (any type). ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  reminderDate?: string;
  /** Optional amount in ILS (the promised amount for a commitment)  */
  amount?: number;
  /** The month's open balance when the note was written  */
  balanceAtNote?: number;
  /** Who wrote it  */
  authorName?: string;
  /** Where the note came from  */
  noteSource?: CustomerNotesEntityNoteSourceEnum;
  /** InboundEmails id when Maya created it from a mail  */
  sourceEmailId?: string;
  /** Active until the month's balance is 0  */
  status?: CustomerNotesEntityStatusEnum;
  /** When it closed. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  closedAt?: string;
  /** Commitments only: result checked the day after actionDate  */
  outcome?: CustomerNotesEntityOutcomeEnum;
  /** Commitments: received since the note was written  */
  amountReceived?: number;
  /** Commitments: promised minus received  */
  amountRemaining?: number;
  /** When the commitment was last checked. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  checkedAt?: string;
  /** Not used since wave 3 (08.11): the old tables it pointed to were removed  */
  legacyId?: string;
  /** Test data  */
  isTestFixture?: boolean;
}

export const CustomerNotesEntity = {
  tableBlockId: "CustomerNotes",
  instanceType: {} as ICustomerNotesEntity,
} as const;

/**
 * Bookkeeper assignment set in the app. Overrides assignedBookkeeperName from Priority; a customer with no owner shows for everyone.
 */
export interface ICustomerOwnersEntity {
  /** Customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Owning bookkeeper display name (matches TeamMembers.name)  */
  bookkeeperName?: string;
  /** Who set the owner  */
  setBy?: string;
  /** When it was set. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  setAt?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const CustomerOwnersEntity = {
  tableBlockId: "CustomerOwners",
  instanceType: {} as ICustomerOwnersEntity,
} as const;

export type CustomersEntityCustomerTypeEnum = "אשראי" | "מזומן";

export type CustomersEntityPriorityStatusEnum =
  | "פעיל"
  | "זמני"
  | "חסום"
  | "חסום BDI"
  | "לא פעיל"
  | "פעיל-ח.ניירת"
  | "חס-חסר ניירת"
  | "בטיפול"
  | "לא פעיל בפריוריטי";

export type CustomersEntityPreferredChannelEnum = "דואל" | "WhatsApp" | "טלפון";

export type CustomersEntityCollectionStageEnum =
  | "תקין"
  | "תזכורת"
  | "פנייה שנייה"
  | "שיחה"
  | "הוסלם למנהל";

/**
 * Since 27.10 the credit-insurance and obligo fields live in CreditCovers, CustomerExposure and ExposureItems (moved from obligoUsed, obligoPct, creditInsurer, insuranceApprovedAmount, insurerCaseNumber). creditLimit stays: it is Priority's own credit limit, not the insured limit. Mirror vs enrichment (plan 04.11): the morning pull (PullPriorityCustomers) upserts by customerCode and writes ONLY the Priority columns, listed explicitly in code: customerName, customerType, priorityStatus, paymentTermsDays, paymentTermsLabel, creditLimit, salesAgentName, salesAgentPhone, apContact*, procurementContact*, primaryEmail, priceListCode, ledgerBalance, address, paymentMethod, companyId (only when Priority has one), source, syncedAt. Our columns (checkRemittanceMail, remittanceSenders, assignedBookkeeperName, preferredChannel, doNotContact, collectionStage, internalNotes, collectionNote, companyId when Priority has none) are never overwritten. A customer that disappears from Priority is never deleted: priorityStatus becomes לא פעיל בפריוריטי, so CustomerNotes and OpenMovements keep their link.
 */
export interface ICustomersEntity {
  /** Priority customer code, unique  */
  customerCode?: string;
  /** Customer name  */
  customerName?: string;
  /** Credit or cash customer  */
  customerType?: CustomersEntityCustomerTypeEnum;
  /** Status in Priority (CUSTOMERS.STATDES, verbatim); לא פעיל בפריוריטי = no longer returned by Priority  */
  priorityStatus?: CustomersEntityPriorityStatusEnum;
  /** Payment terms in days: 30/45/60/90/120  */
  paymentTermsDays?: number;
  /** Terms label, e.g. שוטף+60  */
  paymentTermsLabel?: string;
  /** Credit limit ILS  */
  creditLimit?: number;
  /** Sales agent name  */
  salesAgentName?: string;
  /** Sales agent phone  */
  salesAgentPhone?: string;
  /** Customer accounts-payable contact name  */
  apContactName?: string;
  /** AP contact email  */
  apContactEmail?: string;
  /** AP contact phone  */
  apContactPhone?: string;
  /** Procurement contact name  */
  procurementContactName?: string;
  /** Procurement contact email  */
  procurementContactEmail?: string;
  /** Procurement contact phone  */
  procurementContactPhone?: string;
  /** Assigned bookkeeper name  */
  assignedBookkeeperName?: string;
  /** Preferred contact channel  */
  preferredChannel?: CustomersEntityPreferredChannelEnum;
  /** Do not contact this customer  */
  doNotContact?: boolean;
  /** Current collection stage  */
  collectionStage?: CustomersEntityCollectionStageEnum;
  /** Date of last payment. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  lastPaymentDate?: string;
  /** Internal notes (long text)  */
  internalNotes?: string;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: string;
  /** When this row was last synced from Priority. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
  /** Company registration number (ח״פ) from Priority. Every insurer (בסס״ח) request is sent by it; missing → no request, a task להשלים ח.פ instead  */
  companyId?: string;
  /** Flag בודקים פירוט במייל: only for flagged customers the receipts matching searches mail for a remittance, and only from remittanceSenders. Flag on with no sender = configuration error, customer skipped  */
  checkRemittanceMail?: boolean;
  /** Remittance sender addresses for this customer, comma-separated (one or more). Searched only when checkRemittanceMail is on  */
  remittanceSenders?: string;
  /** General email on the Priority customer card  */
  primaryEmail?: string;
  /** Customer price list code in Priority  */
  priceListCode?: string;
  /** Customer ledger balance ILS from Priority  */
  ledgerBalance?: number;
  /** Customer billing address from the Priority customer card (street, city), sent as BUYER_ADDRESS on an insurer request  */
  address?: string;
  /** From Priority: how the customer usually pays (העברה, צ׳ק, צ׳קים דחויים, אשראי…). Shown in the aging report  */
  paymentMethod?: string;
  /** From Priority: the customer's standing collection note, e.g. "משלמים ב-30 לחודש". Shown in the aging report  */
  collectionNote?: string;
  /** Sync: Priority natural key (CUSTNAME = customerCode). Written only by SyncFromBrain.  */
  priorityKey?: string;
  /** Sync: last change time in Priority when the source reports one, else null.. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  sourceUpdatedAt?: string;
  /** Sync: SyncRuns.runId of the run that last wrote this row.  */
  syncRunId?: string;
  /** Sync: when the app last wrote this row to Priority (write-through). A sync whose Brain data is older skips the row.. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lastAppWriteAt?: string;
  /** Sync: true after an app write-through until a Brain sync newer than lastAppWriteAt confirms it.  */
  pendingBrainConfirm?: boolean;
  /** Sync: true when a fully-read Brain table no longer contains this key. Row and enrichment are kept.  */
  deletedInSource?: boolean;
  /** Mirror: maximum obligo in Priority (CUSTOMERS.MAX_OBLIGO), ILS  */
  obligoLimit?: number;
  /** Mirror: credit-insurance amount recorded in Priority (CUSTOMERS.ZMET_CREDITINSURAMNT), ILS  */
  creditInsuredAmount?: number;
  /** Mirror: Priority user who owns the customer card (CUSTOMERS.OWNERLOGIN)  */
  priorityOwner?: string;
  /** Mirror: payment terms code (CUSTOMERS.PAYCODE)  */
  paymentTermsCode?: string;
  /** Mirror: sales agent code (CUSTOMERS.AGENTCODE)  */
  salesAgentCode?: string;
}

export const CustomersEntity = {
  tableBlockId: "Customers",
  instanceType: {} as ICustomersEntity,
} as const;

/**
 * Priority delivery note mirror
 */
export interface IDeliveryNotesEntity {
  /** Delivery note number, unique  */
  noteNumber?: string;
  /** Related invoice number  */
  invoiceNumber?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Construction site name  */
  siteName?: string;
  /** Delivery date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  deliveryDate?: string;
  /** Note was scanned  */
  scanned?: boolean;
  /** Note is signed  */
  signed?: boolean;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: string;
  /** When this row was last synced from Priority. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
  /** Product line of the delivery  */
  productLine?: string;
  /** Link to the scanned delivery note  */
  scanUrl?: string;
  /** When the note was scanned. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  scannedAt?: string;
}

export const DeliveryNotesEntity = {
  tableBlockId: "DeliveryNotes",
  instanceType: {} as IDeliveryNotesEntity,
} as const;

export type DisputesEntityDisputeTypeEnum =
  | "מחיר"
  | "תעודת משלוח חסרה"
  | "סחורה או החזרה"
  | "ממתין לאישור רכש"
  | "אחר";

export type DisputesEntityBallWithEnum =
  | "סוכן הגבייה"
  | "מנהלת חשבונות"
  | "סוכן מכירות"
  | "לוגיסטיקה"
  | "רכש הלקוח"
  | "מנהל הגבייה";

export type DisputesEntityStatusEnum =
  | "פתוחה"
  | "בטיפול"
  | "ממתינה לסריקה"
  | "תזכורת בטיוטה"
  | "הוסלמה"
  | "ממתינה לאישור סוכן"
  | "ממתינה לאישור מנהל"
  | "ממתינה לזיכוי"
  | "מוכנה לשליחה ללקוח"
  | "נסגרה";

/**
 * Invoice disputes
 */
export interface IDisputesEntity {
  /** Dispute number, unique  */
  disputeNumber?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Dispute type  */
  disputeType?: DisputesEntityDisputeTypeEnum;
  /** Invoice numbers  */
  invoiceNumbers?: string;
  /** Disputed amount ILS  */
  disputedAmount?: number;
  /** Description (long text)  */
  description?: string;
  /** Who the ball is with  */
  ballWith?: DisputesEntityBallWithEnum;
  /** Owning bookkeeper  */
  ownerBookkeeperName?: string;
  /** Dispute status  */
  status?: DisputesEntityStatusEnum;
  /** Opened at. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  openedAt?: string;
  /** Closed at. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  closedAt?: string;
  /** Resolution (long text)  */
  resolution?: string;
  /** Inbound email that opened the case (text link to InboundEmails.messageId)  */
  inboundEmailId?: string;
  /** Delivery note numbers still not scanned, comma-separated  */
  missingNoteNumbers?: string;
  /** Product line, routes the chase to the right logistics owner  */
  productLine?: string;
  /** Logistics owner for the product line (display name)  */
  logisticsOwnerName?: string;
  /** Logistics owner email  */
  logisticsOwnerEmail?: string;
  /** When the next logistics reminder draft is due. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  nextReminderAt?: string;
  /** How many reminder drafts were created  */
  reminderCount?: number;
  /** Sales agent who must approve the price (display name)  */
  salesAgentName?: string;
  /** Sales agent's manager who must approve after the agent (display name)  */
  salesManagerName?: string;
  /** When the bookkeeper marked the sales agent approval. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  salesAgentApprovedAt?: string;
  /** Bookkeeper who marked the sales agent approval  */
  salesAgentApprovalMarkedBy?: string;
  /** Evidence of the agent approval: pasted email text or a link (mandatory)  */
  salesAgentApprovalEvidence?: string;
  /** When the bookkeeper marked the manager approval. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  salesManagerApprovedAt?: string;
  /** Bookkeeper who marked the manager approval  */
  salesManagerApprovalMarkedBy?: string;
  /** Evidence of the manager approval: pasted email text or a link (mandatory)  */
  salesManagerApprovalEvidence?: string;
  /** Summary prepared for the credit note the bookkeeper creates in Priority  */
  creditDraftNote?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const DisputesEntity = {
  tableBlockId: "Disputes",
  instanceType: {} as IDisputesEntity,
} as const;

export type EmailAttachmentsEntityFileKindEnum =
  | "PDF"
  | "Excel"
  | "CSV"
  | "תמונה"
  | "אחר";

export type EmailAttachmentsEntityExtractionStateEnum =
  | "ממתין"
  | "חולץ"
  | "דורש OCR"
  | "לא נתמך"
  | "נכשל";

/**
 * One row per attachment of an InboundEmails row. FetchEmailAttachments downloads each file from the provider (GMAIL_GET_ATTACHMENT), stores it (fileUrl) and extracts text by code: PDF with a text layer → text, Excel/CSV → table as text, image or scanned PDF → דורש OCR (gap). Maya and the remittance reader receive extractedText, not just file names.
 */
export interface IEmailAttachmentsEntity {
  /** InboundEmails.id (text link)  */
  inboundEmailId?: string;
  /** Provider message id of the email  */
  messageId?: string;
  /** Provider attachment id  */
  providerAttachmentId?: string;
  /** File name  */
  fileName?: string;
  /** MIME type  */
  mimeType?: string;
  /** File kind  */
  fileKind?: EmailAttachmentsEntityFileKindEnum;
  /** Stored file link  */
  fileUrl?: string;
  /** Size in bytes  */
  sizeBytes?: number;
  /** Extraction state  */
  extractionState?: EmailAttachmentsEntityExtractionStateEnum;
  /** Extracted text (long text; tables as tab-separated lines)  */
  extractedText?: string;
  /** Why extraction failed  */
  extractionError?: string;
  /** When extracted. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  extractedAt?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const EmailAttachmentsEntity = {
  tableBlockId: "EmailAttachments",
  instanceType: {} as IEmailAttachmentsEntity,
} as const;

export type ExposureItemsEntityItemTypeEnum =
  | "חשבונית פתוחה"
  | "תעודת משלוח שלא חויבה"
  | "צ׳ק שלא הופקד"
  | "הזמנה פתוחה";

/**
 * Mirror, read-only (exposure_items). The breakdown behind CustomerExposure.obligoTotal as Priority gives it: open invoices, delivery notes not yet invoiced, cheques received and not yet deposited, open orders. One row per document. Shown grouped by itemType on the customer card tab; undeposited cheques are also shown apart as expected to drop on deposit.
 */
export interface IExposureItemsEntity {
  /** Priority customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** Kind of document  */
  itemType?: ExposureItemsEntityItemTypeEnum;
  /** Document number (invoice, delivery note, cheque or order number)  */
  reference?: string;
  /** Amount ILS counted in the obligo  */
  amount?: number;
  /** Document date (cheque: received date). ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  docDate?: string;
  /** Due date (cheque: its maturity date). ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  dueDate?: string;
  /** When Priority computed it. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  asOf?: string;
  /** Data source: priority-api, icic (CreditCovers only) or test-fixture (marked test data, removed by DeleteTestFixtures). Writers must set it  */
  source?: string;
  /** When this row was last synced. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
}

export const ExposureItemsEntity = {
  tableBlockId: "ExposureItems",
  instanceType: {} as IExposureItemsEntity,
} as const;

export type ImportBatchesEntityKindEnum =
  | "דוח גיול"
  | "קובץ בנק"
  | "חשבוניות פתוחות"
  | "כרטיסי לקוח"
  | "אנשי קשר"
  | "שורות דפי בנק – Priority"
  | "משיכת בוקר – Priority"
  | "בדיקת דף בנק";

export type ImportBatchesEntityStatusEnum = "נקרא" | "נכתב" | "נכשל";

export type ImportBatchesEntityExtractionStatusEnum =
  | "ממתין לקריאה"
  | "בקריאה"
  | "נקרא – לאימות"
  | "אומת"
  | "נכשל";

export type ImportBatchesEntityTotalsCheckEnum =
  | "תואם"
  | "לא תואם"
  | "אין סיכום בקובץ";

export type ImportBatchesEntityCheckStatusEnum =
  | "טרם התחילו"
  | "בבדיקה"
  | "הושהתה"
  | "הושלמה";

export type ImportBatchesEntityRunModeEnum = "בוקר" | "ידני";

export type ImportBatchesEntityRunPhaseEnum = "06:00" | "09:00" | "10:00";

/**
 * undefined
 */
export interface IImportBatchesEntityImportBatchesEntityRunSummaryItemObject {
  step?: string;
  ok?: boolean;
  rowsRead?: number;
  rowsWritten?: number;
  note?: string;
  error?: string;
}

/**
 * Since plan r3 stage 2 every pull of Priority's bank statement lines (SyncPriorityBankLines) is one row of kind שורות דפי בנק – Priority: uploadedAt = when it was pulled, dataDate = the load day, rowsRead = lines the source returned, rowsWritten = new lines, status נכתב / נכשל. The receipts screen's ״נמשך מפריוריטי ב-HH:MM״ reads it. Before that: every uploaded file (bank file, open invoices, aging Excel…). Since Iteration 9 a bank file is uploaded on /collections/receipts and read by the nameless reader agent BankFileReader (ReadBankFile): extractionStatus tracks the reading and verification, checkStatus tracks Nina's record-by-record checks, workDay places it on the week strip. status (נקרא/נכתב/נכשל) is kept for older rows and other file kinds; nothing triggers on it any more.
 */
export interface IImportBatchesEntity {
  /** Uploaded file name  */
  fileName?: string;
  /** Uploaded file link  */
  fileUrl?: string;
  /** File kind  */
  kind?: ImportBatchesEntityKindEnum;
  /** Date the data in the file is for. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  dataDate?: string;
  /** Who uploaded  */
  uploadedBy?: string;
  /** When uploaded. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  uploadedAt?: string;
  /** Rows read from the file  */
  rowsRead?: number;
  /** Rows written to tables  */
  rowsWritten?: number;
  /** Import status  */
  status?: ImportBatchesEntityStatusEnum;
  /** Errors, one per line  */
  errors?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** Work day on the receipts week strip: the Israel-time upload date; Friday/Saturday uploads count for that week's Thursday. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  workDay?: string;
  /** Uploaded file size in bytes (same name + size on the same work day = the same file)  */
  fileSize?: number;
  /** MIME type of the uploaded file  */
  fileType?: string;
  /** Reading status of a bank file  */
  extractionStatus?: ImportBatchesEntityExtractionStatusEnum;
  /** Agent that read the file (BankFileReader)  */
  readerAgent?: string;
  /** Transaction count stated in the file's own summary row, if the file has one  */
  linesInFile?: number;
  /** Total ILS stated in the file's own summary row, if the file has one  */
  totalInFile?: number;
  /** Lines the reader extracted  */
  extractedLineCount?: number;
  /** Sum ILS of the extracted lines  */
  extractedTotal?: number;
  /** Extracted count/total against the file summary  */
  totalsCheck?: ImportBatchesEntityTotalsCheckEnum;
  /** Reader and check warnings, one per line  */
  readerWarnings?: string;
  /** A person confirmed "בדקתי מול הבנק" when the totals did not match  */
  totalsAcknowledged?: boolean;
  /** Who verified the extracted lines  */
  verifiedBy?: string;
  /** When the lines were verified. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  verifiedAt?: string;
  /** Nina's record-by-record checks on this file  */
  checkStatus?: ImportBatchesEntityCheckStatusEnum;
  /** Who started the checks  */
  checkStartedBy?: string;
  /** When the checks started. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  checkStartedAt?: string;
  /** Plan 04.11 day runs: scheduled by DayRunner or the manual button  */
  runMode?: ImportBatchesEntityRunModeEnum;
  /** Which day phase this row records; RunDaySchedule reads today's rows to know what already ran (a failed phase does not count)  */
  runPhase?: ImportBatchesEntityRunPhaseEnum;
  /** Kind בדיקת דף בנק: whether yesterday's bank statement was in Priority at the check  */
  bankLoaded?: boolean;
  /** Per step of the phase: name, ok, counts and error  */
  runSummary?: IImportBatchesEntityImportBatchesEntityRunSummaryItemObject[];
}

export const ImportBatchesEntity = {
  tableBlockId: "ImportBatches",
  instanceType: {} as IImportBatchesEntity,
} as const;

export type InboundEmailsEntityMailProviderEnum = "gmail" | "outlook";

export type InboundEmailsEntitySenderVerificationEnum =
  | "מאומת"
  | "לא מאומת"
  | "לבדיקה";

export type InboundEmailsEntityCategoryEnum =
  | "כרטסת"
  | "חובות פתוחים"
  | "תעודות וחשבוניות חסרות"
  | "הפרש מחיר"
  | "פירוט תשלום"
  | "הבטחת תשלום"
  | "אחר"
  | "לא רלוונטי"
  | "אישור ביטוח אשראי";

export type InboundEmailsEntityIdentifiedByEnum = "כתובת" | "חתימה";

export type InboundEmailsEntityStatusEnum =
  | "חדשה"
  | "בטיפול מאיה"
  | "טיוטה מוכנה"
  | "ממתינה לגורם פנימי"
  | "נענתה"
  | "לא רלוונטית";

export type InboundEmailsEntitySenderRoleEnum =
  | "איש קשר של הלקוח"
  | "סוכן סימנט בשם הלקוח"
  | "איש לוגיסטיקה"
  | "אחר";

export type InboundEmailsEntityCustomerMatchMethodEnum =
  | "כתובת השולח"
  | "סוכן מורשה"
  | "חתימה"
  | "דומיין"
  | "שם בתוכן"
  | "מספר חשבונית"
  | "שרשור"
  | "לא זוהה";

export type InboundEmailsEntityHandlingStateEnum = "לא טופל" | "ממתין" | "טופל";

export type InboundEmailsEntityClassifiedByEnum = "מאיה" | "קוד";

/**
 * undefined
 */
export interface IInboundEmailsEntityInboundEmailsEntityTypesItemObject {
  type?: string;
  quote?: string;
  verified?: boolean;
}

/**
 * undefined
 */
export interface IInboundEmailsEntityInboundEmailsEntityInvoicesItemObject {
  invoiceNumber?: string;
  quote?: string;
  verified?: boolean;
  belongsToCustomer?: boolean;
}

/**
 * undefined
 */
export interface IInboundEmailsEntityInboundEmailsEntityRejectedItemObject {
  field?: string;
  value?: string;
  reason?: string;
}

/**
 * undefined
 */
export interface IInboundEmailsEntityInboundEmailsEntityCandidatesItemObject {
  customerCode?: string;
  customerName?: string;
  method?: string;
}

/**
 * undefined
 */
export interface IInboundEmailsEntityPromiseObject {
  amount?: number;
  date?: string;
  method?: string;
  quote?: string;
  verified?: boolean;
  invoiceNumbers?: string[];
  status?: string;
  approvedPromiseId?: string;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * undefined
 */
export interface IInboundEmailsEntityDisputeObject {
  reason?: string;
  quote?: string;
  verified?: boolean;
  invoiceNumbers?: string[];
  noteIds?: string[];
}

/**
 * Maya's evidence: one quote per type and per invoice, verified by code; plus the customer candidates code gave her; promise = Maya's promise proposal awaiting approval (status ממתינה לאישור / אושרה, approvedPromiseId when approved in the email panel); dispute = a conditional payment or a claim the invoice is wrong, with the aging notes it opened
 */
export interface IInboundEmailsEntityClassificationQuotesObject {
  types?: IInboundEmailsEntityInboundEmailsEntityTypesItemObject[];
  invoices?: IInboundEmailsEntityInboundEmailsEntityInvoicesItemObject[];
  rejected?: IInboundEmailsEntityInboundEmailsEntityRejectedItemObject[];
  candidates?: IInboundEmailsEntityInboundEmailsEntityCandidatesItemObject[];
  promise?: IInboundEmailsEntityPromiseObject;
  dispute?: IInboundEmailsEntityDisputeObject;
}

/**
 * Every email received through a mailbox adapter (Gmail test label now, Outlook later), normalised by IngestEmail. Component 04 (פניות): Maya classifies (categories + quotes, senderRole), code verifies and routes and keeps handlingState (לא טופל / ממתין with waitingFor / טופל with handledBy). A reply linked through CIM-ref or threadId is stored with isThreadReply=true and opens no new ticket. Irrelevant mail keeps metadata only (bodyStored=false). Attachments and their extracted text live in EmailAttachments.
 */
export interface IInboundEmailsEntity {
  /** Provider message id, unique (dedupe key)  */
  messageId?: string;
  /** Provider thread id  */
  threadId?: string;
  /** Mail provider  */
  mailProvider?: InboundEmailsEntityMailProviderEnum;
  /** Mailbox address the email arrived in  */
  mailbox?: string;
  /** Mailbox owner display name  */
  mailboxOwnerName?: string;
  /** Label / folder the email was read from (e.g. Ciment-Test)  */
  sourceLabel?: string;
  /** Sender email  */
  fromAddress?: string;
  /** Sender name  */
  fromName?: string;
  /** Subject  */
  subject?: string;
  /** Body text. Empty when the category is לא רלוונטי  */
  bodyText?: string;
  /** Whether the body and attachments are stored (false for irrelevant mail)  */
  bodyStored?: boolean;
  /** When the email was received. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  receivedAt?: string;
  /** Reply deadline (receivedAt + reply SLA). ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  dueAt?: string;
  /** Linked customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Is the sender a registered contact  */
  senderVerification?: InboundEmailsEntitySenderVerificationEnum;
  /** Classification  */
  category?: InboundEmailsEntityCategoryEnum;
  /** Plan 04.11 part C: how the customer was identified  */
  identifiedBy?: InboundEmailsEntityIdentifiedByEnum;
  /** Unknown sender: the customer Maya suggests from the signature / logo (task זה הלקוח X?)  */
  suggestedCustomerCode?: string;
  /** The sender's signature block as read from the mail  */
  signatureText?: string;
  /** Invoice numbers mentioned in the email, comma-separated  */
  mentionedInvoiceNumbers?: string;
  /** Attachment file names, comma-separated  */
  attachmentNames?: string;
  /** Attachment links, one per line  */
  attachmentUrls?: string;
  /** Handling status  */
  status?: InboundEmailsEntityStatusEnum;
  /** Bookkeeper who owns the email (display name)  */
  assignedBookkeeperName?: string;
  /** Maya's short summary and analysis  */
  agentSummary?: string;
  /** When the reply was approved. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  answeredAt?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** BankLines.bankLineId when this mail is the customer's reply to a detail request for that transfer (older data only: the detail request was removed on 08.11)  */
  bankLineId?: string;
  /** All mail types Maya found, comma-separated, in folder order (1 כרטסת, 2 חובות פתוחים, 3 תעודות וחשבוניות חסרות, 4 הפרש מחיר, 5 פירוט תשלום, then הבטחת תשלום, אחר, לא רלוונטי). category holds the primary (first) one, which decides the folder  */
  categories?: string;
  /** Who wrote the mail  */
  senderRole?: InboundEmailsEntitySenderRoleEnum;
  /** Hebrew: what the verification rests on (registered contact X of customer Y / sales agent X authorized for customer Y / not registered)  */
  verificationBasis?: string;
  /** How the customer was identified  */
  customerMatchMethod?: InboundEmailsEntityCustomerMatchMethodEnum;
  /** Mailboxes.id the mail arrived in (text link)  */
  mailboxId?: string;
  /** Handling state shown on the inbox page. Default filter shows לא טופל + ממתין  */
  handlingState?: InboundEmailsEntityHandlingStateEnum;
  /** When ממתין: for whom (e.g. ממתין ללוגיסטיקה: דני כהן / ממתין לאישור סוכן: X / ממתין להתאמת התקבול / ממתין ללקוח)  */
  waitingFor?: string;
  /** When the mail entered ממתין. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  waitingSince?: string;
  /** When טופל: who closed it (person display name, or מערכת for an automatic close)  */
  handledBy?: string;
  /** When it became טופל. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  handledAt?: string;
  /** For a reply linked through the thread: Approvals.id of the outbound message it answers (text link)  */
  threadOf?: string;
  /** Record this mail belongs to: BankLines, Disputes, InboundEmails, MailAutomationRuns  */
  linkedTable?: string;
  /** Id of that record, as text (bankLineId, dispute id, inbound email id, run id)  */
  linkedId?: string;
  /** True when the mail was linked as a reply in an existing thread (CIM-ref or threadId) and opened no new ticket  */
  isThreadReply?: boolean;
  /** Who classified the mail  */
  classifiedBy?: InboundEmailsEntityClassifiedByEnum;
  /** Maya's evidence: one quote per type and per invoice, verified by code; plus the customer candidates code gave her; promise = Maya's promise proposal awaiting approval (status ממתינה לאישור / אושרה, approvedPromiseId when approved in the email panel); dispute = a conditional payment or a claim the invoice is wrong, with the aging notes it opened  */
  classificationQuotes?: IInboundEmailsEntityClassificationQuotesObject;
}

export const InboundEmailsEntity = {
  tableBlockId: "InboundEmails",
  instanceType: {} as IInboundEmailsEntity,
} as const;

export type InteractionsEntityTypeEnum =
  | "דואל"
  | "WhatsApp"
  | "שיחה"
  | "הערה"
  | "תשלום"
  | "הבטחה"
  | "מחלוקת"
  | "הסלמה";

export type InteractionsEntityDirectionEnum = "יוצא" | "נכנס" | "פנימי";

/**
 * Per-customer contact timeline
 */
export interface IInteractionsEntity {
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** When it happened. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  occurredAt?: string;
  /** Interaction type  */
  type?: InteractionsEntityTypeEnum;
  /** Direction  */
  direction?: InteractionsEntityDirectionEnum;
  /** סוכן הגבייה or a person's name  */
  actorName?: string;
  /** Summary (long text)  */
  summary?: string;
  /** Related invoice numbers  */
  relatedInvoiceNumbers?: string;
}

export const InteractionsEntity = {
  tableBlockId: "Interactions",
  instanceType: {} as IInteractionsEntity,
} as const;

export type InvoiceLinesEntityPriceSourceEnum = "הזמנה" | "מחירון" | "ידני";

export type InvoiceLinesEntitySourceEnum =
  | "priority-mock"
  | "priority-file"
  | "priority-api"
  | "test-fixture"
  | "priority-direct";

/**
 * Read-only mirror of invoice lines. Used by AnalyzePriceGap to compare the charged price with the price list and the line's price source.
 */
export interface IInvoiceLinesEntity {
  /** Unique line key (invoiceNumber + line number)  */
  lineKey?: string;
  /** Invoice number (text link to Invoices)  */
  invoiceNumber?: string;
  /** Sales order number  */
  orderNumber?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Sales agent display name  */
  salesAgentName?: string;
  /** Item code  */
  sku?: string;
  /** Item name  */
  itemName?: string;
  /** Quantity  */
  quantity?: number;
  /** Unit price ILS  */
  unitPrice?: number;
  /** Line total ILS  */
  lineTotal?: number;
  /** Where the price came from  */
  priceSource?: InvoiceLinesEntityPriceSourceEnum;
  /** Manager approval status of the price in Priority  */
  managerApprovalStatus?: string;
  /** Free text on the line  */
  freeText?: string;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: InvoiceLinesEntitySourceEnum;
  /** When this row was last loaded from Priority / the bank file. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
  /** <form>:<IVNUM>:<KLINE>  */
  priorityKey?: string;
  /** CINVOICES or AINVOICES  */
  priorityForm?: string;
  /** KLINE  */
  lineNumber?: number;
  /** TUNITNAME  */
  unit?: string;
  /** PERCENT  */
  discountPercent?: number;
  /** TOTPRICE (with VAT)  */
  grossTotal?: number;
  /** IVTAX  */
  vatAmount?: number;
  /** DOCNO  */
  deliveryNoteNumber?: string;
  /** UDATE in Priority. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lineUpdatedAt?: string;
}

export const InvoiceLinesEntity = {
  tableBlockId: "InvoiceLines",
  instanceType: {} as IInvoiceLinesEntity,
} as const;

export type InvoicesEntityStatusEnum =
  | "פתוחה"
  | "שולמה חלקית"
  | "שולמה"
  | "בזיכוי";

export type InvoicesEntityDocumentTypeEnum = "חשבונית" | "חשבונית זיכוי";

export type InvoicesEntityPaymentStateEnum = "נראה תשלום" | "נקלט ב-Priority";

export type InvoicesEntityPaymentStatusEnum = "פתוחה" | "שולמה חלקית" | "שולמה";

export type InvoicesEntitySubStatusEnum =
  | "פתוחה"
  | "שולמה חלקית"
  | "בבירור"
  | "הובטחה"
  | "סגורה";

export type InvoicesEntityPriorityFormEnum = "CINVOICES" | "AINVOICES";

/**
 * Priority invoice mirror
 */
export interface IInvoicesEntity {
  /** Invoice number, unique  */
  invoiceNumber?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Sales agent name  */
  salesAgentName?: string;
  /** Invoice date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  invoiceDate?: string;
  /** Due date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  dueDate?: string;
  /** Due month YYYY-MM  */
  dueMonth?: string;
  /** Invoice amount ILS  */
  amount?: number;
  /** Open amount ILS  */
  openAmount?: number;
  /** Invoice status  */
  status?: InvoicesEntityStatusEnum;
  /** Delivery notes expected  */
  deliveryNotesExpected?: number;
  /** Delivery notes attached  */
  deliveryNotesAttached?: number;
  /** Some delivery notes are missing  */
  missingDeliveryNotes?: boolean;
  /** Invoice has zero-price lines  */
  hasZeroPriceLines?: boolean;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: string;
  /** When this row was last synced from Priority. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
  /** Document type  */
  documentType?: InvoicesEntityDocumentTypeEnum;
  /** The invoice as it was sent to the customer (image/PDF from the Priority attachments). Test invoices get a stamped copy from BuildTestInvoiceDocuments  */
  sourceDocUrl?: string;
  /** Product line, used to route missing delivery-note chases to logistics  */
  productLine?: string;
  /** App layer (never written by the Priority sync): payment we have seen. נראה תשלום = an approved receipt match pays this invoice and the receipt is not yet in Priority; נקלט ב-Priority = the match was marked done in Priority. Empty = no payment seen by the app. Recomputed by the shared invoice-layer code  */
  paymentState?: InvoicesEntityPaymentStateEnum;
  /** App layer: ILS of this invoice paid by approved receipt matches (sum of their allocations)  */
  paidSeenAmount?: number;
  /** App layer: when the latest approved match on this invoice was approved. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  paidSeenAt?: string;
  /** App layer: comma-separated bank line ids of the approved matches  */
  paidSeenBankLineIds?: string;
  /** App layer: when the receipt was marked done in Priority (latest of the matches). ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  paidPriorityDoneAt?: string;
  /** App layer: when the payment and note fields above were last recomputed. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  layerUpdatedAt?: string;
  /** App layer (never written by the Priority sync): payment status from our receipt allocations. פתוחה = nothing allocated; שולמה חלקית = allocated less than Priority's open amount; שולמה = fully allocated. Priority's own status stays in status.  */
  paymentStatus?: InvoicesEntityPaymentStatusEnum;
  /** App layer: what is still open after our receipt allocations = openAmount − paidSeenAmount while Priority has not reflected them, else openAmount. The aging report and the customer card show this  */
  remainingAmount?: number;
  /** App layer: comma-separated Receipts.receiptKey of the receipts allocated to this invoice  */
  receiptKeys?: string;
  /** Our layer: the one sub-status shown, by precedence בבירור > שולמה חלקית > פתוחה; סגורה when nothing is left open (הובטחה is no longer set: commitments are CustomerNotes per customer + due month)  */
  subStatus?: InvoicesEntitySubStatusEnum;
  /** Our layer: the open dispute on the invoice (text link to Disputes.id)  */
  openDisputeId?: string;
  /** Sync: Priority natural key (<priorityForm>:<IVNUM>, e.g. CINVOICES:MF26001079). Written only by SyncFromBrain.  */
  priorityKey?: string;
  /** Sync: last change time in Priority when the source reports one, else null.. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  sourceUpdatedAt?: string;
  /** Sync: SyncRuns.runId of the run that last wrote this row.  */
  syncRunId?: string;
  /** Sync: when the app last wrote this row to Priority (write-through). A sync whose Brain data is older skips the row.. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lastAppWriteAt?: string;
  /** Sync: true after an app write-through until a Brain sync newer than lastAppWriteAt confirms it.  */
  pendingBrainConfirm?: boolean;
  /** Sync: true when a fully-read Brain table no longer contains this key. Row and enrichment are kept.  */
  deletedInSource?: boolean;
  /** Mirror: the Priority form the document comes from  */
  priorityForm?: InvoicesEntityPriorityFormEnum;
  /** Mirror: document status in Priority (STATDES verbatim: סופית / מבוטלת / טיוטא). Not the payment status.  */
  priorityDocStatus?: string;
  /** Mirror: reconciliation date in Priority (IVRECONDATE); null while not reconciled. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  reconciledDate?: string;
  /** Mirror: document currency (CODE, e.g. שח / USD)  */
  currencyCode?: string;
}

export const InvoicesEntity = {
  tableBlockId: "Invoices",
  instanceType: {} as IInvoicesEntity,
} as const;

export type LedgerEntriesEntitySourceEnum =
  | "priority-mock"
  | "priority-file"
  | "priority-api"
  | "test-fixture";

/**
 * Read-only mirror of every movement on the customer account in Priority. Source for the ledger statement PDF.
 */
export interface ILedgerEntriesEntity {
  /** Unique ledger entry key  */
  entryKey?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Entry date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  entryDate?: string;
  /** Value / due date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  valueDate?: string;
  /** Document type (invoice, receipt, credit note…)  */
  docType?: string;
  /** Document number  */
  docNumber?: string;
  /** Details  */
  details?: string;
  /** Debit ILS  */
  debit?: number;
  /** Credit ILS  */
  credit?: number;
  /** Running balance ILS  */
  runningBalance?: number;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: LedgerEntriesEntitySourceEnum;
  /** When this row was last loaded from Priority / the bank file. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
}

export const LedgerEntriesEntity = {
  tableBlockId: "LedgerEntries",
  instanceType: {} as ILedgerEntriesEntity,
} as const;

export type MailAutomationRunsEntityTriggerEnum = "מתוזמן" | "ידני";

export type MailAutomationRunsEntityStatusEnum = "הושלמה" | "נכשלה";

/**
 * History of MailAutomations runs: one row per run (scheduled or manual) with what it created and who was left out, each with the reason.
 */
export interface IMailAutomationRunsEntity {
  /** MailAutomations.id (text link)  */
  automationId?: string;
  /** Automation name (denormalised)  */
  automationName?: string;
  /** When it ran. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  ranAt?: string;
  /** How it was started  */
  trigger?: MailAutomationRunsEntityTriggerEnum;
  /** Who pressed run (manual) or מערכת  */
  requestedBy?: string;
  /** Approvals.batchId of the drafts it created  */
  batchId?: string;
  /** Drafts created  */
  draftsCreated?: number;
  /** Customers left out  */
  excludedCount?: number;
  /** Left-out customers with reasons, one per line  */
  excludedSummary?: string;
  /** Run status  */
  status?: MailAutomationRunsEntityStatusEnum;
  /** Errors, one per line  */
  errors?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const MailAutomationRunsEntity = {
  tableBlockId: "MailAutomationRuns",
  instanceType: {} as IMailAutomationRunsEntity,
} as const;

export type MailAutomationsEntityKindEnum = "חובות פתוחים חודשי";

export type MailAutomationsEntityAudienceEnum =
  | "כל הלקוחות ביתרת חובה"
  | "לקוחות נבחרים";

/**
 * Scheduled outbound mail runs (component 04, tab אוטומציות). Today one row: the monthly open-debts mail (replaces AgentSettings.openDebtsDay and the daily OpenDebtsBatch). The hourly MailAutomationsRunner workflow runs an active automation once its dayOfMonth and hour have arrived and it has not run this month. Every run writes drafts to Approvals (component מנה חודשית) and a MailAutomationRuns row. Nothing is sent. Templates use {{customerName}}, {{customerCode}}, {{contactName}}, {{asOfDate}}, {{month}}, {{openTotal}}, {{bookkeeperName}}, {{bookkeeperPhone}}.
 */
export interface IMailAutomationsEntity {
  /** Automation name  */
  name?: string;
  /** Automation kind  */
  kind?: MailAutomationsEntityKindEnum;
  /** Who receives it  */
  audience?: MailAutomationsEntityAudienceEnum;
  /** When לקוחות נבחרים: customer codes, comma-separated  */
  customerCodes?: string;
  /** Day of month (1–28)  */
  dayOfMonth?: number;
  /** Hour, Israel time (0–23)  */
  hour?: number;
  /** Runs on schedule  */
  active?: boolean;
  /** Subject template with variables  */
  subjectTemplate?: string;
  /** Body template with variables (long text)  */
  bodyTemplate?: string;
  /** Mailboxes.id the drafts would be sent from; empty = the owning bookkeeper mailbox  */
  mailboxId?: string;
  /** Who last changed the settings (display name)  */
  updatedByName?: string;
  /** When the settings were last changed. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  settingsUpdatedAt?: string;
  /** Last run. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lastRunAt?: string;
  /** Hebrew summary of the last run  */
  lastRunSummary?: string;
}

export const MailAutomationsEntity = {
  tableBlockId: "MailAutomations",
  instanceType: {} as IMailAutomationsEntity,
} as const;

export type MailboxesEntityProviderEnum = "gmail" | "outlook";

/**
 * The mailboxes the app reads (one adapter workflow per mailbox feeding ProcessInboundEmail). Today one row: the Gmail test mailbox saar@blocks.diy, label Ciment-Test. Outlook mailboxes of the bookkeepers are a gap. InboundEmails.mailboxId and Approvals.mailboxId point here (text link).
 */
export interface IMailboxesEntity {
  /** Mailbox email address  */
  address?: string;
  /** Mail provider  */
  provider?: MailboxesEntityProviderEnum;
  /** Owner display name (bookkeeper, or shared)  */
  ownerName?: string;
  /** Label / folder read (e.g. Ciment-Test); empty = whole inbox  */
  sourceLabel?: string;
  /** Read by its adapter  */
  active?: boolean;
  /** Notes  */
  notes?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const MailboxesEntity = {
  tableBlockId: "Mailboxes",
  instanceType: {} as IMailboxesEntity,
} as const;

export type MatchProposalsEntityCustomerIdMethodEnum =
  | "שם זהה"
  | "איש קשר"
  | "היסטוריה"
  | "כינוי"
  | "ידני"
  | "מייל";

/**
 * undefined
 */
export interface IMatchProposalsEntityMatchProposalsEntityLinesItemObject {
  invoiceNumber?: string;
  amount?: number;
  dueDate?: string;
  /** מלאה / חלקית  */
  kind?: string;
  /** פירוט במייל / הערה בגיול / סכום / תשובת לקוח / ידני  */
  source?: string;
  /** The invoice's open amount before this receipt  */
  openBefore?: number;
}

/**
 * Allocation of the amount to invoices
 */
export interface IMatchProposalsEntityAllocationsObject {
  lines?: IMatchProposalsEntityMatchProposalsEntityLinesItemObject[];
  /** מלאה (receipt = one invoice) / חלקית (receipt < invoice) / מרובה (several invoices)  */
  splitKind?: string;
  /** Part of the transfer not allocated to any invoice (על חשבון)  */
  unallocated?: number;
}

export type MatchProposalsEntityConfidenceEnum = "ודאי" | "גבוה" | "נמוך";

export type MatchProposalsEntityStatusEnum =
  | "מוצעת"
  | "אושרה – לביצוע ב-Priority"
  | "בוצעה ב-Priority"
  | "נדחתה"
  | "הוחלפה";

/**
 * Customer proposal of a bank line, written by IdentifyCustomers (since 08.11 identification only; invoices are allocated after the debt check): who paid, how they were identified, which invoices the bank line pays, with the evidence. A human approves (אושרה – לביצוע ב-Priority), then marks done in Priority. Never auto-posted.
 */
export interface IMatchProposalsEntity {
  /** Bank line (text link to BankLines.bankLineId)  */
  bankLineId?: string;
  /** Value date of the bank line. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  valueDate?: string;
  /** Bank line amount ILS  */
  amount?: number;
  /** Payer name on the bank line  */
  payerName?: string;
  /** Identified customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** How the customer was identified  */
  customerIdMethod?: MatchProposalsEntityCustomerIdMethodEnum;
  /** Invoices in the proposal, comma-separated  */
  invoiceNumbers?: string;
  /** Allocation of the amount to invoices  */
  allocations?: IMatchProposalsEntityAllocationsObject;
  /** Confidence  */
  confidence?: MatchProposalsEntityConfidenceEnum;
  /** Human-readable proof, e.g. 3 חשבוניות, פירעון 30.9, סכום זהה בדיוק  */
  reasoning?: string;
  /** Bookkeeper who owns the customer (display name)  */
  assignedBookkeeperName?: string;
  /** Proposal status  */
  status?: MatchProposalsEntityStatusEnum;
  /** When the proposal was created. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  proposedAt?: string;
  /** Who approved or rejected  */
  decidedBy?: string;
  /** When approved or rejected. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  decidedAt?: string;
  /** Who marked it done in Priority  */
  priorityDoneBy?: string;
  /** When it was marked done in Priority. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  priorityDoneAt?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** InboundEmails ids that were the evidence, comma-separated  */
  evidenceEmailIds?: string;
  /** Exact quote from the evidence email  */
  evidenceQuote?: string;
  /** Identification run that produced the proposal  */
  checkRunId?: string;
  /** Import batch of the bank line (text link to ImportBatches.id)  */
  importBatchId?: string;
  /** Receipts.receiptKey created when this proposal was approved  */
  receiptKey?: string;
}

export const MatchProposalsEntity = {
  tableBlockId: "MatchProposals",
  instanceType: {} as IMatchProposalsEntity,
} as const;

export type OpenMovementsEntityDocTypeEnum =
  | "חשבונית"
  | "קבלה"
  | "זיכוי"
  | "פקודת יומן"
  | "אחר";

export type OpenMovementsEntitySourceEnum =
  | "priority-mock"
  | "test-fixture"
  | "priority-api"
  | "priority-direct";

/**
 * Mirror of Priority's unmatched customer movements (plan 04.11, part A). Written ONLY by PullOpenMovements (morning pull 06:00, the re-pull after the receipts run, and the manual button); each pull replaces the snapshot of every customer it returns. Nothing points at a movement row: notes point at customer + dueMonth, so replacing rows is safe. Includes invoices, receipts on account, partial balances and journal entries. amount > 0 = debt, < 0 = credit. dueMonth = YYYY-MM of dueDate. Until the Priority API exists the source is a test source derived from TEST-001..029 (source test-fixture), so the aging report and the customer card show the same totals.
 */
export interface IOpenMovementsEntity {
  /** Priority key of the movement (unique per customer)  */
  movementId?: string;
  /** Link to the customer row (real reference); customerCode and customerName are kept beside it for agents and display  */
  customer?: number;
  /** Priority customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** Movement document type  */
  docType?: OpenMovementsEntityDocTypeEnum;
  /** Priority document number  */
  docNumber?: string;
  /** Document date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  docDate?: string;
  /** Due date (פירעון). ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  dueDate?: string;
  /** Due month YYYY-MM, the aging report column  */
  dueMonth?: string;
  /** Open amount in ILS, 2 decimals: positive = debt, negative = credit  */
  amount?: number;
  /** Priority details / description of the movement  */
  details?: string;
  /** Where the row came from  */
  source?: OpenMovementsEntitySourceEnum;
  /** ImportBatches row of the pull that wrote it  */
  importBatchId?: string;
  /** When the pull wrote it. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
}

export const OpenMovementsEntity = {
  tableBlockId: "OpenMovements",
  instanceType: {} as IOpenMovementsEntity,
} as const;

export type PaymentsEntityMethodEnum =
  | "העברה בנקאית"
  | "צ׳ק"
  | "צ׳ק דחוי"
  | "כרטיס אשראי";

export type PaymentsEntityMatchStatusEnum =
  | "מותאם"
  | "מותאם חלקית"
  | "לא מותאם";

/**
 * Priority payment mirror
 */
export interface IPaymentsEntity {
  /** Payment reference, unique  */
  paymentRef?: string;
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Payment date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  paymentDate?: string;
  /** Amount ILS  */
  amount?: number;
  /** Payment method  */
  method?: PaymentsEntityMethodEnum;
  /** Due date of a postdated check. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  checkDueDate?: string;
  /** Matched invoice numbers, comma-separated  */
  matchedInvoiceNumbers?: string;
  /** Match status  */
  matchStatus?: PaymentsEntityMatchStatusEnum;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: string;
  /** When this row was last synced from Priority. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
  /** Receipt number in Priority  */
  receiptNumber?: string;
  /** Bank line the receipt was built from (text link to BankLines.bankLineId)  */
  bankLineId?: string;
  /** Plan 04.11 part B: the field sales agent who issued the receipt in Priority (agent cheques); empty for office receipts  */
  collectedBy?: string;
  /** Mirror key from Priority (see table description); null on rows the app added  */
  priorityKey?: string;
  /** SyncRuns.runId of the SyncPrioritySubforms run that last wrote the row  */
  syncRunId?: string;
  /** True when a full read of this scope no longer found the row in Priority; never deleted  */
  deletedInSource?: boolean;
  /** TPAYMENT_SUBFORM.KLINE  */
  lineNumber?: number;
  /** TPAYMENT_SUBFORM.PAYMENT (Priority payment id)  */
  paymentId?: number;
  /** Receipt header IVDATE. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  receiptDate?: string;
  /** Receipt header TOTPRICE  */
  receiptTotal?: number;
  /** Receipt header STATDES (טיוטא / סופית …)  */
  receiptStatus?: string;
  /** Receipt header AGENTNAME  */
  receiptAgentName?: string;
  /** Receipt header DETAILS  */
  receiptDetails?: string;
  /** Line payment type as Priority describes it (line DETAILS, e.g. קבלת תשלום בצ׳קים)  */
  paymentType?: string;
  /** CASHFLOWCODE  */
  cashflowCode?: string;
  /** CODE (e.g. שח)  */
  currency?: string;
  /** TOTPRICE of the line  */
  lineTotal?: number;
  /** CARDNUM (cheque / card number)  */
  chequeNumber?: string;
  /** BANKCODE  */
  bankCode?: string;
  /** BANKNAME  */
  bankName?: string;
  /** BRANCH  */
  branch?: string;
  /** PAYACCOUNT  */
  bankAccount?: string;
  /** WTAX+WTAX2+WTAX3  */
  withholdingTax?: number;
  /** STORNOFLAG set  */
  isReversal?: boolean;
}

export const PaymentsEntity = {
  tableBlockId: "Payments",
  instanceType: {} as IPaymentsEntity,
} as const;

export type PriceListItemsEntitySourceEnum =
  | "priority-mock"
  | "priority-file"
  | "priority-api"
  | "test-fixture";

/**
 * Read-only mirror of customer / site price lists. The price list is the source of truth for price disputes.
 */
export interface IPriceListItemsEntity {
  /** Unique price key (priceListCode + sku + site + validFrom)  */
  priceKey?: string;
  /** Price list code  */
  priceListCode?: string;
  /** Priority customer code when the list is per customer (text link to Customers)  */
  customerCode?: string;
  /** Customer display name (denormalised)  */
  customerName?: string;
  /** Site name when the price is per site  */
  siteName?: string;
  /** Item code  */
  sku?: string;
  /** Item name  */
  itemName?: string;
  /** Price ILS  */
  price?: number;
  /** Valid from. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  validFrom?: string;
  /** Valid to. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  validTo?: string;
  /** Data source: priority-mock, priority-file (uploaded Priority export), priority-api, or test-fixture (marked test data, removed by DeleteTestFixtures)  */
  source?: PriceListItemsEntitySourceEnum;
  /** When this row was last loaded from Priority / the bank file. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  syncedAt?: string;
}

export const PriceListItemsEntity = {
  tableBlockId: "PriceListItems",
  instanceType: {} as IPriceListItemsEntity,
} as const;

export type PrioritySyncCursorsEntityScopeEnum =
  | "contacts"
  | "payments"
  | "openMovements";

export type PrioritySyncCursorsEntityModeEnum = "טעינה ראשונה" | "דלתא";

export type PrioritySyncCursorsEntityPhaseEnum =
  | "רשימה"
  | "קריאת שורות"
  | "הושלם";

/**
 * Resume state: {lastCustomerKey} for contacts; {listSkip, pendingReceipts:[IVNUM], doneCount} for payments
 */
export interface IPrioritySyncCursorsEntityCursorObject {}

/**
 * One row per SyncPrioritySubforms scope (contacts, payments): where an unfinished read stopped, so the next run continues there.
 */
export interface IPrioritySyncCursorsEntity {
  /** Last cursor write. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  updatedAt?: string;
  /** Scope  */
  scope?: PrioritySyncCursorsEntityScopeEnum;
  /** SyncRuns.runId that started the current pass  */
  runId?: string;
  /** Pass type  */
  mode?: PrioritySyncCursorsEntityModeEnum;
  /** Where the pass is  */
  phase?: PrioritySyncCursorsEntityPhaseEnum;
  /** Resume state: {lastCustomerKey} for contacts; {listSkip, pendingReceipts:[IVNUM], doneCount} for payments  */
  cursor?: IPrioritySyncCursorsEntityCursorObject;
  /** Items still to read in this pass  */
  pendingCount?: number;
  /** When the last complete read of this scope finished (needed before deletedInSource). ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  lastFullReadAt?: string;
}

export const PrioritySyncCursorsEntity = {
  tableBlockId: "PrioritySyncCursors",
  instanceType: {} as IPrioritySyncCursorsEntity,
} as const;

/**
 * Who to ask for missing delivery-note scans, per product line.
 */
export interface IProductLineContactsEntity {
  /** Product line  */
  productLine?: string;
  /** Logistics owner display name  */
  logisticsOwnerName?: string;
  /** Email  */
  email?: string;
  /** Phone  */
  phone?: string;
  /** Active  */
  active?: boolean;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** WhatsApp number of the logistics contact (button shown, not active yet)  */
  whatsapp?: string;
}

export const ProductLineContactsEntity = {
  tableBlockId: "ProductLineContacts",
  instanceType: {} as IProductLineContactsEntity,
} as const;

export type ReceiptAllocationsEntityKindEnum = "מלאה" | "חלקית";

export type ReceiptAllocationsEntitySourceEnum = "סכום" | "ידני";

export type ReceiptAllocationsEntityStatusEnum = "מוכנה" | "הונפקה ב-Priority";

/**
 * Many-to-many between Receipts and Invoices: how much of a receipt closes each invoice, and on what evidence. Written with the receipt when the person approves the split. The invoice layer (paymentStatus, remainingAmount, paidSeen*) is computed from these rows.
 */
export interface IReceiptAllocationsEntity {
  /** Receipts.receiptKey  */
  receiptKey?: string;
  /** The transfer  */
  bankLineId?: string;
  /** Invoices.invoiceNumber  */
  invoiceNumber?: string;
  /** Customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** The invoice's due date (denormalised). ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  dueDate?: string;
  /** Amount of this receipt allocated to the invoice  */
  amount?: number;
  /** The invoice's open amount before this receipt  */
  openBefore?: number;
  /** מלאה = closes the invoice; חלקית = leaves a remainder  */
  kind?: ReceiptAllocationsEntityKindEnum;
  /** סכום = ProposeAllocation (oldest first after the debt check), ידני = edited in the allocation editor  */
  source?: ReceiptAllocationsEntitySourceEnum;
  /** The evidence row: InboundEmails id, CustomerNotes id, or empty; since 05.11 (b/debt-allocation) the approver of an allocation: the person's display name or אושר אוטומטית  */
  sourceRef?: string;
  /** Mirrors the receipt status  */
  status?: ReceiptAllocationsEntityStatusEnum;
  /** When it was written. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  at?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** Plan 04.11 part B: the invoice is only partly covered by this allocation  */
  isPartial?: boolean;
  /** The invoice's open amount after this allocation  */
  openAfter?: number;
}

export const ReceiptAllocationsEntity = {
  tableBlockId: "ReceiptAllocations",
  instanceType: {} as IReceiptAllocationsEntity,
} as const;

export type ReceiptCheckStepsEntityStageEnum = "קריאה" | "זיהוי לקוח" | "החלטה";

export type ReceiptCheckStepsEntityRungEnum =
  | "קריאת הקובץ"
  | "צ׳ק חוזר"
  | "כרטיס לקוח"
  | "כינוי"
  | "מיילים 7 ימים"
  | "אישור"
  | "תיקון";

export type ReceiptCheckStepsEntityResultEnum =
  | "נמצא"
  | "לא נמצא"
  | "דו-משמעי"
  | "דולג";

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityReceiptCheckStepsEntityCustomersItemObject {
  customerCode?: string;
  customerName?: string;
  matchedOn?: string;
}

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityReceiptCheckStepsEntityInvoicesItemObject {
  invoiceNumber?: string;
  amount?: number;
  openAmount?: number;
  dueDate?: string;
}

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityReceiptCheckStepsEntityEmailsItemObject {
  inboundEmailId?: string;
  fromName?: string;
  fromAddress?: string;
  subject?: string;
  receivedAt?: string;
  quote?: string;
}

/**
 * Where the automatic mail search looked (shown even when it found 0)
 */
export interface IReceiptCheckStepsEntityMailSearchObject {
  mailbox?: string;
  addresses?: string[];
  dateFrom?: string;
  dateTo?: string;
  keywords?: string[];
  foundCount?: number;
  note?: string;
}

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityDetailRequestObject {
  toName?: string;
  toAddress?: string;
  contactSource?: string;
  reason?: string;
  approvalId?: string;
  status?: string;
}

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityReceiptCheckStepsEntityNotesItemObject {
  noteId?: string;
  noteType?: string;
  invoiceNumber?: string;
  noteAmount?: number;
  actionDate?: string;
  text?: string;
}

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityReceiptCheckStepsEntityLinesItemObject {
  invoiceNumber?: string;
  amount?: number;
  quote?: string;
  verified?: boolean;
  rejectReason?: string;
}

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityReceiptCheckStepsEntityRemarksItemObject {
  text?: string;
  quote?: string;
}

/**
 * undefined
 */
export interface IReceiptCheckStepsEntityReceiptCheckStepsEntityRemittanceReadItemObject {
  inboundEmailId?: string;
  fromName?: string;
  subject?: string;
  receivedAt?: string;
  relevant?: boolean;
  reason?: string;
  lines?: IReceiptCheckStepsEntityReceiptCheckStepsEntityLinesItemObject[];
  total?: number;
  totalQuote?: string;
  paymentDate?: string;
  paymentDateQuote?: string;
  remarks?: IReceiptCheckStepsEntityReceiptCheckStepsEntityRemarksItemObject[];
  rejectReasons?: string[];
}

/**
 * Evidence shown in the panel
 */
export interface IReceiptCheckStepsEntityEvidenceObject {
  customers?: IReceiptCheckStepsEntityReceiptCheckStepsEntityCustomersItemObject[];
  invoices?: IReceiptCheckStepsEntityReceiptCheckStepsEntityInvoicesItemObject[];
  emails?: IReceiptCheckStepsEntityReceiptCheckStepsEntityEmailsItemObject[];
  equation?: string;
  alias?: string;
  /** Where the automatic mail search looked (shown even when it found 0)  */
  mailSearch?: IReceiptCheckStepsEntityMailSearchObject;
  detailRequest?: IReceiptCheckStepsEntityDetailRequestObject;
  notes?: IReceiptCheckStepsEntityReceiptCheckStepsEntityNotesItemObject[];
  /** Per found email: the reader agent's verdict and what passed the code check (rung פירוט מייל)  */
  remittanceRead?: IReceiptCheckStepsEntityReceiptCheckStepsEntityRemittanceReadItemObject[];
}

export type ReceiptCheckStepsEntityActorEnum =
  | "סוכן הקריאה"
  | "נינה"
  | "משתמש"
  | "מערכת";

/**
 * One row per step of the receipts process for a bank file or line: the reader's summary (stage קריאה), each identification step, the receipt, the debt check and the allocation with result and evidence, and each human decision. Written by WriteExtractedLines, IdentifyCustomers, IssueReceipt, CheckDebt, ApplyAllocation and DecideMatchProposal. The receipts panel shows exactly these rows; they are also the raw material for evals.
 */
export interface IReceiptCheckStepsEntity {
  /** Import batch (text link to ImportBatches.id)  */
  importBatchId?: string;
  /** Bank line (text link to BankLines.bankLineId); empty for a file-level step  */
  bankLineId?: string;
  /** One identification run; the panel shows the latest run of a line  */
  checkRunId?: string;
  /** Order of the step inside the run  */
  stepNo?: number;
  /** Stage  */
  stage?: ReceiptCheckStepsEntityStageEnum;
  /** Identification rung or the decision  */
  rung?: ReceiptCheckStepsEntityRungEnum;
  /** Result of the step  */
  result?: ReceiptCheckStepsEntityResultEnum;
  /** One Hebrew sentence: what was checked and what came out  */
  detail?: string;
  /** Evidence shown in the panel  */
  evidence?: IReceiptCheckStepsEntityEvidenceObject;
  /** Who did the step  */
  actor?: ReceiptCheckStepsEntityActorEnum;
  /** Display name of the person (for משתמש) or the agent  */
  actorName?: string;
  /** When the step happened. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  at?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const ReceiptCheckStepsEntity = {
  tableBlockId: "ReceiptCheckSteps",
  instanceType: {} as IReceiptCheckStepsEntity,
} as const;

export type ReceiptsEntityMatchStatusEnum =
  | "פיזור מוצע – לאישור"
  | "על חשבון – צריך פיזור"
  | "מפוזרת"
  | "מפוזרת – עודף על חשבון";

export type ReceiptsEntityReceiptStatusEnum =
  | "טיוטה – ממתינה לאישור"
  | "אושרה – לא נשלחה"
  | "הונפקה ב-Priority";

export type ReceiptsEntityIdentifyStatusEnum =
  | "ודאי"
  | "לא ודאי"
  | "אושר"
  | "אושר אוטומטית"
  | "לא זוהה";

export type ReceiptsEntityDebtCheckResultEnum =
  | "נסגר לאפס – מצטבר"
  | "נסגר לאפס – חודש אחד"
  | "לברר מול הלקוח";

export type ReceiptsEntitySendStatusEnum =
  | "טיוטה – בדיקה"
  | "נשלחה"
  | "חסר איש קשר";

export type ReceiptsEntityReceiptSourceEnum = "דף בנק" | "צ׳ק סוכן";

/**
 * One receipt per bank transfer. Receipt first (plan r3 stage 1, 03.11): created as a draft as soon as the customer is identified (IdentifyCustomers), before any invoice match. amount is always the transfer amount. receiptStatus is the single status: טיוטה – ממתינה לאישור → אושרה – לא נשלחה (approved in the task, together with its match proposal, or by itself when autoCloseReceipts is on) → הונפקה ב-Priority (a person marked it issued, with Priority's receipt number). matchStatus: התאמה מוצעת – לאישור / מותאמת / על חשבון – צריך התאמה. The old status column was removed in step 3. The app never writes to Priority. Its allocations are ReceiptAllocations.
 */
export interface IReceiptsEntity {
  /** Key: RCPT-<bankLineId> for a bank line; RCPT-AGT-<paymentRef> for a field agent's cheque (receiptSource צ׳ק סוכן)  */
  receiptKey?: string;
  /** The transfer (BankLines.bankLineId)  */
  bankLineId?: string;
  /** The bank file (ImportBatches.id)  */
  importBatchId?: string;
  /** The approved MatchProposals row id  */
  matchProposalId?: string;
  /** Customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** Payer name as on the bank line  */
  payerName?: string;
  /** Bank reference  */
  reference?: string;
  /** Value date of the transfer. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  valueDate?: string;
  /** Receipt amount = the transfer amount, ILS  */
  amount?: number;
  /** Sum of the allocations  */
  allocatedAmount?: number;
  /** amount − allocatedAmount: left on account (על חשבון)  */
  unallocatedAmount?: number;
  /** Allocation state of the receipt (plan 04.11 part B): empty until the debt check; פיזור מוצע – לאישור (CheckDebt closed a month to 0 and proposed the invoices) / על חשבון – צריך פיזור / מפוזרת / מפוזרת – עודף על חשבון (ApplyAllocation)  */
  matchStatus?: ReceiptsEntityMatchStatusEnum;
  /** The receipt's single status (plan r3 stage 1): created as a draft when the customer is identified, approved in one task together with its match proposal (or by itself when autoCloseReceipts is on), marked issued when a person issues it in Priority. Priority is not connected, so approved = not sent  */
  receiptStatus?: ReceiptsEntityReceiptStatusEnum;
  /** Priority's receipt number, typed by the person who issued it  */
  priorityReceiptNumber?: string;
  /** Who approved the split  */
  preparedBy?: string;
  /** When. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  preparedAt?: string;
  /** Who marked it issued in Priority  */
  issuedBy?: string;
  /** When. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  issuedAt?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** Plan 04.11 part B: customer identification confidence 0–100  */
  identifyConfidence?: number;
  /** Customer identification state (certain = at or above identifyCertainAt)  */
  identifyStatus?: ReceiptsEntityIdentifyStatusEnum;
  /** Debt check against OpenMovements right after the receipt  */
  debtCheckResult?: ReceiptsEntityDebtCheckResultEnum;
  /** Due months the receipt closed, comma-separated YYYY-MM  */
  debtCheckMonths?: string;
  /** Allocation proposal confidence 0–100  */
  allocationConfidence?: number;
  /** The customer's accounts-payable contact the receipt was addressed to  */
  sentToEmail?: string;
  /** When it was sent (never in testing). ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  sentAt?: string;
  /** Receipt mail state  */
  sendStatus?: ReceiptsEntitySendStatusEnum;
  /** Where the money came from  */
  receiptSource?: ReceiptsEntityReceiptSourceEnum;
}

export const ReceiptsEntity = {
  tableBlockId: "Receipts",
  instanceType: {} as IReceiptsEntity,
} as const;

export type ReceiptThreadsEntityEntryTypeEnum =
  | "בקשת פירוט"
  | "תשובת לקוח"
  | "הערה פנימית";

export type ReceiptThreadsEntityDirectionEnum = "יוצא" | "נכנס" | "פנימי";

export type ReceiptThreadsEntityStatusEnum =
  | "טיוטה"
  | "אושר – לא נשלח"
  | "התקבלה";

/**
 * The correspondence kept on a receipts record (an open ticket): the detail request Nina drafted and the person marked sent (nothing is really sent yet, TODO), the customer's reply once linked, and internal notes. One row per message, newest last. Not written since 08.11 (the detail request was removed; older data only); ResetReceiptsDay removes a day's rows.
 */
export interface IReceiptThreadsEntity {
  /** The transfer the thread belongs to  */
  bankLineId?: string;
  /** Customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** What the message is  */
  entryType?: ReceiptThreadsEntityEntryTypeEnum;
  /** יוצא / נכנס / פנימי  */
  direction?: ReceiptThreadsEntityDirectionEnum;
  /** טיוטה; אושר – לא נשלח = the person pressed send, real sending is a TODO; התקבלה = a linked reply  */
  status?: ReceiptThreadsEntityStatusEnum;
  /** Approvals row id of the outgoing draft (kind בקשת פירוט)  */
  approvalId?: string;
  /** InboundEmails row id of the reply  */
  inboundEmailId?: string;
  /** Recipient name (the customer's AP contact)  */
  toName?: string;
  /** Recipient email  */
  toAddress?: string;
  /** Subject  */
  subject?: string;
  /** Body  */
  body?: string;
  /** Who wrote or marked it (Nina for her draft)  */
  byName?: string;
  /** When. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  at?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
}

export const ReceiptThreadsEntity = {
  tableBlockId: "ReceiptThreads",
  instanceType: {} as IReceiptThreadsEntity,
} as const;

/**
 * Who approves a disputed price: each sales agent (Customers/Invoices.salesAgentName) with email and the manager who approves after the agent. Read by AnalyzePriceGap / CreatePriceApprovalRequest. Agents and managers never log in; the bookkeeper marks their approvals with evidence.
 */
export interface ISalesAgentsEntity {
  /** Sales agent display name, as on Customers.salesAgentName  */
  agentName?: string;
  /** Sales agent email  */
  email?: string;
  /** Sales agent phone  */
  phone?: string;
  /** Manager who approves after the agent (display name)  */
  managerName?: string;
  /** Manager email  */
  managerEmail?: string;
  /** Active  */
  active?: boolean;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** Customer codes this agent may request statements / open debts for, comma-separated. A mail from this agent's address about one of them is מאומת  */
  authorizedCustomerCodes?: string;
  /** Display names of those customers, comma-separated, same order (denormalised)  */
  authorizedCustomerNames?: string;
}

export const SalesAgentsEntity = {
  tableBlockId: "SalesAgents",
  instanceType: {} as ISalesAgentsEntity,
} as const;

export type SyncRunsEntityTriggerEnum = "מתוזמן" | "ידני" | "אחרי כתיבה";

/**
 * undefined
 */
export interface ISyncRunsEntitySyncRunsEntityPerTableItemObject {
  table?: string;
  sourceTable?: string;
  sourceRows?: number;
  expectedRows?: number;
  lastRunSourceRows?: number;
  inserted?: number;
  updated?: number;
  unchanged?: number;
  skippedNewerInApp?: number;
  markedDeletedInSource?: number;
  writeVerified?: boolean;
  gate?: string;
  error?: string;
}

export type SyncRunsEntityStatusEnum =
  | "רץ"
  | "הצליח"
  | "הצליח חלקית"
  | "נעצר בשער"
  | "נכשל";

/**
 * When invoice reading stopped at the time budget: {CINVOICES:lastKey, AINVOICES:lastKey}; null when complete
 */
export interface ISyncRunsEntityResumeFromObject {}

/**
 * One row per Brain → app sync run (SyncFromBrain): when, why, how fresh the Brain data was, per-table counts and outcome.
 */
export interface ISyncRunsEntity {
  /** Run id, unique (also written to syncRunId on every row the run writes)  */
  runId?: string;
  /** Run start. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  startedAt?: string;
  /** Run end; null while running. ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  finishedAt?: string;
  /** What started the run  */
  trigger?: SyncRunsEntityTriggerEnum;
  /** True when the run only reported and wrote nothing  */
  dryRun?: boolean;
  /** Freshness of the Brain data read (last Brain sync time of the oldest source table). ISO 8601 datetime string, format: YYYY-MM-DDTHH:MM:SS, e.g. 2025-09-30T18:45:00Z, 2025-09-30T18:45:00+05:30  */
  brainDataAsOf?: string;
  /** Per-table counts and gate result  */
  perTable?: ISyncRunsEntitySyncRunsEntityPerTableItemObject[];
  /** Outcome  */
  status?: SyncRunsEntityStatusEnum;
  /** Error text when the run failed or a gate stopped a table  */
  error?: string;
  /** When invoice reading stopped at the time budget: {CINVOICES:lastKey, AINVOICES:lastKey}; null when complete  */
  resumeFrom?: ISyncRunsEntityResumeFromObject;
  /** brain (SyncFromBrain, also when empty) or priority-direct (SyncPrioritySubforms)  */
  syncKind?: string;
}

export const SyncRunsEntity = {
  tableBlockId: "SyncRuns",
  instanceType: {} as ISyncRunsEntity,
} as const;

export type SyncStagingEntityFormEnum = "CINVOICES" | "AINVOICES";

/**
 * The raw Brain row (allow-listed source columns)
 */
export interface ISyncStagingEntityPayloadObject {}

/**
 * Staging for SyncFromBrain invoice reads that ran out of time: raw Brain rows read so far, per run and form, so a resumed run can finish reading and apply everything in one go. Rows of a run are deleted once it applies or is abandoned.
 */
export interface ISyncStagingEntity {
  /** SyncRuns.runId that started the read  */
  runId?: string;
  /** Source form  */
  form?: SyncStagingEntityFormEnum;
  /** <form>:<IVNUM>  */
  priorityKey?: string;
  /** The raw Brain row (allow-listed source columns)  */
  payload?: ISyncStagingEntityPayloadObject;
}

export const SyncStagingEntity = {
  tableBlockId: "SyncStaging",
  instanceType: {} as ISyncStagingEntity,
} as const;

export type TeamMembersEntityRoleEnum =
  | "מנהלת חשבונות"
  | "מנהל גבייה"
  | "סמנכ״ל כספים";

/**
 * Collections team
 */
export interface ITeamMembersEntity {
  /** Full name  */
  name?: string;
  /** Role  */
  role?: TeamMembersEntityRoleEnum;
  /** Email  */
  email?: string;
  /** Mobile phone shown in the closing line of statements and the monthly open-debts mail ({{bookkeeperPhone}})  */
  phone?: string;
  /** Active  */
  active?: boolean;
}

export const TeamMembersEntity = {
  tableBlockId: "TeamMembers",
  instanceType: {} as ITeamMembersEntity,
} as const;

/**
 * undefined
 */
export interface IUsersEntity {
  /** User name  */
  name?: string;
  /** First name  */
  firstName?: string;
  /** Last name  */
  lastName?: string;
  /** Email address  */
  email?: string;
  /** Profile image URL  */
  profileImageUrl?: string;
  /** The user's permission on the app: 'build' (can change the app) or 'use'  */
  permission?: string;
}

export const UsersEntity = {
  tableBlockId: "Users",
  instanceType: {} as IUsersEntity,
} as const;

export type AgentFeedbackStatsEntityAgentNameEnum =
  | "BankFileReader"
  | "CollectionsAgent";

export type AgentFeedbackStatsEntityVerdictEnum = "צדק" | "טעה" | "הערה";

/**
 * undefined
 */
export interface IAgentFeedbackStatsEntity {
  /** Agent the feedback is about  */
  agentName?: AgentFeedbackStatsEntityAgentNameEnum;
  /** Import batch (text link to ImportBatches.id)  */
  importBatchId?: string;
  /** Verdict  */
  verdict?: AgentFeedbackStatsEntityVerdictEnum;
  /** Field that was wrong, e.g. amount, payerName, valueDate, customer, invoices  */
  field?: string;
  /** True for marked test data; DeleteTestFixtures removes these rows. Writers always set it (no defaults).  */
  isTestFixture?: boolean;
  /** Count aggregation result  */
  feedbackCount?: number;
  /** Feedback rows  */
  feedbackCountN?: number;
}

export const AgentFeedbackStatsEntity = {
  tableBlockId: "AgentFeedbackStats",
  instanceType: {} as IAgentFeedbackStatsEntity,
} as const;

/**
 * undefined
 */
export interface IAgingByMonthEntity {
  /** Priority customer code  */
  customerCode?: string;
  /** Customer name (denormalised)  */
  customerName?: string;
  /** Due month YYYY-MM, the aging report column  */
  dueMonth?: string;
  /** Sum aggregation result  */
  openTotal?: number;
  /** Count aggregation result  */
  movementCount?: number;
  /** Max aggregation result  */
  syncedAt?: number;
}

export const AgingByMonthEntity = {
  tableBlockId: "AgingByMonth",
  instanceType: {} as IAgingByMonthEntity,
} as const;

/**
 * undefined
 */
export interface ICustomerActivityEntity {
  /** Priority customer code (text link to Customers)  */
  customerCode?: string;
  /** Count aggregation result  */
  documentCount?: number;
  /** Max aggregation result  */
  lastDocumentDate?: number;
  /** Computed: SUM(CASE WHEN i.reconciledDate IS NULL AND COALESCE(i.deletedInSource, false) = false THEN COALESCE(i.amount, 0) ELSE 0 END)  */
  openDebtRaw?: number;
  /** Computed: SUM(CASE WHEN i.reconciledDate IS NULL AND COALESCE(i.deletedInSource, false) = false AND COALESCE(i.amount,0) > 0 THEN 1 ELSE 0 END)  */
  openCountRaw?: number;
  /** Active debt ILS: sum of amount of documents with no Priority reconciliation (credit notes negative)  */
  openDebt?: number;
  /** Unreconciled invoices  */
  openInvoiceCount?: number;
}

export const CustomerActivityEntity = {
  tableBlockId: "CustomerActivity",
  instanceType: {} as ICustomerActivityEntity,
} as const;

export type InboxFoldersEntityCategoryEnum =
  | "כרטסת"
  | "חובות פתוחים"
  | "תעודות וחשבוניות חסרות"
  | "הפרש מחיר"
  | "פירוט תשלום"
  | "הבטחת תשלום"
  | "אחר"
  | "לא רלוונטי"
  | "אישור ביטוח אשראי";

export type InboxFoldersEntityHandlingStateEnum = "לא טופל" | "ממתין" | "טופל";

/**
 * undefined
 */
export interface IInboxFoldersEntity {
  /** Classification  */
  category?: InboxFoldersEntityCategoryEnum;
  /** Handling state shown on the inbox page. Default filter shows לא טופל + ממתין  */
  handlingState?: InboxFoldersEntityHandlingStateEnum;
  /** Mailboxes.id the mail arrived in (text link)  */
  mailboxId?: string;
  /** Count aggregation result  */
  mailCount?: number;
  /** Computed: SUM(CASE WHEN COALESCE(e.handlingState, 'לא טופל') <> 'טופל' AND COALESCE(e.category, '') <> 'לא רלוונטי' AND e.dueAt < NOW() THEN 1 ELSE 0 END)  */
  overdueRaw?: number;
  /** Open and past the 24h deadline  */
  overdueCount?: number;
}

export const InboxFoldersEntity = {
  tableBlockId: "InboxFolders",
  instanceType: {} as IInboxFoldersEntity,
} as const;

export type InboxSlaEntityHandlingStateEnum = "לא טופל" | "ממתין" | "טופל";

/**
 * undefined
 */
export interface IInboxSlaEntity {
  /** Handling state shown on the inbox page. Default filter shows לא טופל + ממתין  */
  handlingState?: InboxSlaEntityHandlingStateEnum;
  /** Bookkeeper who owns the email (display name)  */
  assignedBookkeeperName?: string;
  /** Count aggregation result  */
  totalCount?: number;
  /** Computed: SUM(CASE WHEN COALESCE(e.handlingState, 'לא טופל') <> 'טופל' AND COALESCE(e.category, '') <> 'לא רלוונטי' THEN 1 ELSE 0 END)  */
  openRaw?: number;
  /** Computed: SUM(CASE WHEN COALESCE(e.handlingState, 'לא טופל') <> 'טופל' AND COALESCE(e.category, '') <> 'לא רלוונטי' AND e.dueAt < NOW() THEN 1 ELSE 0 END)  */
  overdueRaw?: number;
  /** Computed: SUM(CASE WHEN COALESCE(e.handlingState, 'לא טופל') <> 'טופל' AND COALESCE(e.category, '') <> 'לא רלוונטי' AND e.dueAt >= NOW() AND e.dueAt < NOW() + INTERVAL '2 hours' THEN 1 ELSE 0 END)  */
  dueSoonRaw?: number;
  /** Open (לא טופל or ממתין)  */
  openCount?: number;
  /** Open and past the reply deadline  */
  overdueCount?: number;
  /** Open with deadline within 2 hours  */
  dueSoonCount?: number;
}

export const InboxSlaEntity = {
  tableBlockId: "InboxSla",
  instanceType: {} as IInboxSlaEntity,
} as const;

/**
 * undefined
 */
export interface IInsuranceWatchEntity {
  /** Priority customer code, unique  */
  customerCode?: string;
  /** Customer name  */
  customerName?: string;
  /** Assigned bookkeeper name  */
  assignedBookkeeperName?: string;
  /** Company registration number (ח״פ) from Priority. Every insurer (בסס״ח) request is sent by it; missing → no request, a task להשלים ח.פ instead  */
  companyId?: string;
  /** Computed: SUM(CASE WHEN r.status IN ('טיוטה','הוצעה ע״י הסוכנת','אושר – לא הוגש','ממתינה להגשה','הוגשה למבטח') THEN 1 ELSE 0 END)  */
  openRequestsRaw?: number;
  /** Insured-limit use %  */
  usePct?: number;
  /** Open increase requests  */
  openRequests?: number;
}

export const InsuranceWatchEntity = {
  tableBlockId: "InsuranceWatch",
  instanceType: {} as IInsuranceWatchEntity,
} as const;

export type OpenTasksEntityTaskTypeEnum =
  | "צ׳ק חוזר"
  | "הבטחה הופרה"
  | "לאמת שולח"
  | "ביטוח 80%"
  | "אחר"
  | "לגבות מהלקוח"
  | "מעקב בירור – מחיר"
  | "מעקב בירור – תעודה חסרה"
  | "מעקב בירור – אחר"
  | "תעודות משלוח חסרות"
  | "מייל לטיפול"
  | "טיוטה לאישור"
  | "לא זוהה"
  | "דפי בנק לא נטענו"
  | "התחייבויות שלא קוימו – ליצור קשר"
  | "להתקשר לפרטי אשראי"
  | "צ׳ק אצל סוכן – אין קבלה"
  | "לחזור ללקוח"
  | "תזכורות"
  | "משיכת הבוקר נכשלה"
  | "דף הבנק לא עלה לפריוריטי"
  | "זיהוי לקוח – לאישור"
  | "קבלה – צריך פיזור"
  | "לברר מול הלקוח – סכום לא סוגר חודש"
  | "חסר איש קשר הנהלת חשבונות"
  | "נסגר לאפס"
  | "להוסיף איש קשר בפריוריטי"
  | "תעודות / חשבוניות חסרות – טיפול ידני"
  | "זיכוי / הפרש מחיר – טיפול ידני";

export type OpenTasksEntitySeverityEnum =
  | "קריטית"
  | "גבוהה"
  | "בינונית"
  | "נמוכה";

export type OpenTasksEntitySourceEnum =
  | "דוח גיול"
  | "פניות"
  | "תקבולים"
  | "הבטחות"
  | "ביטוח";

/**
 * undefined
 */
export interface IOpenTasksEntity {
  /** Task type  */
  taskType?: OpenTasksEntityTaskTypeEnum;
  /** Severity level  */
  severity?: OpenTasksEntitySeverityEnum;
  /** Which part of the app opened the task  */
  source?: OpenTasksEntitySourceEnum;
  /** Assigned bookkeeper  */
  assignedBookkeeperName?: string;
  /** Count aggregation result  */
  taskCount?: number;
  /** Sum aggregation result  */
  amountTotal?: number;
  /** Open tasks  */
  openCount?: number;
  /** Amount at stake ILS  */
  openAmount?: number;
}

export const OpenTasksEntity = {
  tableBlockId: "OpenTasks",
  instanceType: {} as IOpenTasksEntity,
} as const;

/**
 * undefined
 */
export interface IReceiptsByBatchEntity {
  /** Import batch that loaded the line (text link to ImportBatches.id)  */
  importBatchId?: string;
  /** Count aggregation result  */
  lineCount?: number;
  /** Sum aggregation result  */
  amountTotal?: number;
  /** Computed: SUM(CASE WHEN b.checkStage = 'אושרה' OR b.status IN ('אושרה – לביצוע ב-Priority','בוצעה ב-Priority','קבלה הונפקה') THEN 1 ELSE 0 END)  */
  approvedCount?: number;
  /** Computed: SUM(CASE WHEN (b.checkStage IS NULL OR b.checkStage IN ('ממתינה לבדיקה','זיהוי לקוח','התאמת חשבוניות')) AND b.status NOT IN ('אושרה – לביצוע ב-Priority','בוצעה ב-Priority','קבלה הונפקה','ממתינה לפירוט') THEN 1 ELSE 0 END)  */
  pendingCount?: number;
  /** Computed: SUM(CASE WHEN b.status = 'ממתינה לפירוט' THEN 1 ELSE 0 END)  */
  awaitingDetailCount?: number;
  /** Computed: SUM(CASE WHEN b.status = 'קבלה הונפקה' THEN 1 ELSE 0 END)  */
  issuedCount?: number;
  /** Computed: SUM(CASE WHEN b.checkStage = 'ממתינה לאישור' THEN 1 ELSE 0 END)  */
  awaitingDecisionCount?: number;
  /** Computed: SUM(CASE WHEN b.checkStage = 'לא מזוהה' THEN 1 ELSE 0 END)  */
  unidentifiedCount?: number;
  /** Computed: SUM(CASE WHEN b.checkStage = 'דולגה' THEN 1 ELSE 0 END)  */
  skippedCount?: number;
  /** Lines in the file  */
  lineCountN?: number;
  /** Waiting for the customer's detail (open ticket)  */
  awaitingDetailCountN?: number;
  /** Receipt issued in Priority  */
  issuedCountN?: number;
  /** Total ILS  */
  amountTotalN?: number;
  /** Approved  */
  approvedCountN?: number;
  /** Not yet checked  */
  pendingCountN?: number;
  /** Checked, waiting for a person  */
  awaitingDecisionCountN?: number;
  /** Unidentified  */
  unidentifiedCountN?: number;
  /** Skipped  */
  skippedCountN?: number;
  /** Lines Nina has checked  */
  checkedN?: number;
}

export const ReceiptsByBatchEntity = {
  tableBlockId: "ReceiptsByBatch",
  instanceType: {} as IReceiptsByBatchEntity,
} as const;

export type ReceiptsTodayEntityLineStatusEnum =
  | "חדשה"
  | "לא מזוהה"
  | "קבלה הונפקה";

export type ReceiptsTodayEntityLineTypeEnum =
  | "העברה"
  | "זיכוי בנק"
  | "פירעון צ׳ק"
  | "צ׳ק"
  | "צ׳ק חוזר"
  | "אחר";

export type ReceiptsTodayEntityProposalStatusEnum =
  | "חדשה"
  | "לא מזוהה"
  | "קבלה הונפקה";

export type ReceiptsTodayEntityConfidenceEnum = "ודאי" | "גבוה" | "נמוך";

/**
 * undefined
 */
export interface IReceiptsTodayEntity {
  /** Value date. ISO 8601 date string, format: YYYY-MM-DD, e.g. 2025-09-30  */
  valueDate?: string;
  /** Line status: חדשה (written by the file confirm / Priority sync), לא מזוהה, קבלה הונפקה (the receipt was marked issued in Priority). The identify / receipt progress is in checkStage  */
  lineStatus?: ReceiptsTodayEntityLineStatusEnum;
  /** Line type. Since plan r3 stage 2 (Priority's bank statement lines): העברה / זיכוי בנק go into the receipt check; פירעון צ׳ק / אחר are shown apart and not handled. צ׳ק / צ׳ק חוזר are kept for the older file lines  */
  lineType?: ReceiptsTodayEntityLineTypeEnum;
  /** Line status: חדשה (written by the file confirm / Priority sync), לא מזוהה, קבלה הונפקה (the receipt was marked issued in Priority). The identify / receipt progress is in checkStage  */
  proposalStatus?: ReceiptsTodayEntityProposalStatusEnum;
  /** Confidence  */
  confidence?: ReceiptsTodayEntityConfidenceEnum;
  /** Count aggregation result  */
  lineCount?: number;
  /** Sum aggregation result  */
  amountTotal?: number;
  /** Sum ILS  */
  amount?: number;
}

export const ReceiptsTodayEntity = {
  tableBlockId: "ReceiptsToday",
  instanceType: {} as IReceiptsTodayEntity,
} as const;

export const CollectionsPage = "Collections";

export const CollectionsAgingPage = "CollectionsAging";

export const CollectionsApprovalsPage = "CollectionsApprovals";

export const CollectionsBriefingsPage = "CollectionsBriefings";

export const CollectionsCustomersPage = "CollectionsCustomers";

export const CollectionsCustomersDetailsPage = "CollectionsCustomersDetails";

export const CollectionsDesignPage = "CollectionsDesign";

export const CollectionsDisputesPage = "CollectionsDisputes";

export const CollectionsDisputesDetailsPage = "CollectionsDisputesDetails";

export const CollectionsGapsPage = "CollectionsGaps";

export const CollectionsInboxPage = "CollectionsInbox";

export const CollectionsInboxOpenDebtsPage = "CollectionsInboxOpenDebts";

export const CollectionsInvoicesPage = "CollectionsInvoices";

export const CollectionsNotFoundPage = "CollectionsNotFound";

export const CollectionsPromisesPage = "CollectionsPromises";

export const CollectionsReceiptsPage = "CollectionsReceipts";

export const CollectionsSettingsPage = "CollectionsSettings";

export const CollectionsSettingsImportsPage = "CollectionsSettingsImports";

export const CollectionsTasksPage = "CollectionsTasks";

export const HomePage = "Home";

export const MayaPage = "Maya";

export const MayaInboxPage = "MayaInbox";

export const MayaNewPage = "MayaNew";

export const MayaThreadsPage = "MayaThreads";

export const MayaThreadsDetailsPage = "MayaThreadsDetails";

export const NinaPage = "Nina";

export const NinaBriefingsPage = "NinaBriefings";

export const NinaNewPage = "NinaNew";

export const NinaThreadsPage = "NinaThreads";

export const NinaThreadsDetailsPage = "NinaThreadsDetails";

export const NoraPage = "Nora";

export const NoraBriefingsPage = "NoraBriefings";

export const NoraNotFoundPage = "NoraNotFound";

export const NotFoundPage = "NotFound";

export type AddCustomerNoteActionInputNoteTypeEnum =
  | "התחייבות לתשלום"
  | "תשלום באשראי"
  | "צ׳ק אצל סוכן"
  | "חזור אליי"
  | "אחר";

export type AddCustomerNoteActionInputNoteSourceEnum =
  | "צוות"
  | "מאיה ממייל"
  | "תמר בכרטיס";

/**
 * AddCustomerNote input payload
 */
export interface IAddCustomerNoteActionInput {
  /** Customer code (the reference to Customers is resolved from it)  */
  customerCode: string;
  /** YYYY-MM due month the note is about. Required except when approving an email promise (then derived)  */
  dueMonth?: string;
  /** Note type. The four first are active and need actionDate  */
  noteType: AddCustomerNoteActionInputNoteTypeEnum;
  /** For אחר: the free type the person wrote (e.g. בירור – מחיר)  */
  customTypeLabel?: string;
  /** Free text. Required for אחר  */
  noteText?: string;
  /** YYYY-MM-DD: commitment date / card payment day / day the cheque is with the sales agent / call-back day  */
  actionDate?: string;
  /** YYYY-MM-DD optional reminder (any type)  */
  reminderDate?: string;
  /** Optional ILS amount  */
  amount?: number;
  /** Who wrote it. Default: the signed-in user  */
  authorName?: string;
  /** Where the note came from (default: "צוות") */
  noteSource?: AddCustomerNoteActionInputNoteSourceEnum;
  /** InboundEmails id when approving Maya's promise proposal from the email panel  */
  sourceEmailId?: string;
  /** When true only report what would be written  */
  dryRun?: boolean;
}

/**
 * The written (or planned) CustomerNotes row
 */
export interface IAddCustomerNoteActionOutputNoteObject {}

/**
 * undefined
 */
export interface IAddCustomerNoteActionOutputTaskSyncObject {}

/**
 * AddCustomerNote output payload
 */
export interface IAddCustomerNoteActionOutput {
  dryRun?: boolean;
  /** The written (or planned) CustomerNotes row  */
  note?: IAddCustomerNoteActionOutputNoteObject;
  /** Hebrew line: which grouped task will open and when, e.g. תיפתח משימה ב-12.11 אם החודש לא יתאפס  */
  taskPreview?: string;
  refused?: boolean;
  refusalReason?: string;
  existingNoteId?: string;
  taskSync?: IAddCustomerNoteActionOutputTaskSyncObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * AddCustomerNoteAction
 * Execute code action
 */
export const AddCustomerNoteAction = {
  actionBlockId: "AddCustomerNote",

  inputInstanceType: {} as IAddCustomerNoteActionInput,
  outputInstanceType: {} as IAddCustomerNoteActionOutput,
} as const;

/**
 * AnalyzePriceGap input payload
 */
export interface IAnalyzePriceGapActionInput {
  invoiceNumber: string;
  /** Customer the complaint belongs to; defaults to the email's customer  */
  customerCode?: string;
  /** InboundEmails row id of the complaint  */
  inboundEmailId?: string;
  requestedBy?: string;
  /** When true, only return the analysis; nothing changes  */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IAnalyzePriceGapActionOutputAnalyzePriceGapActionOutputLinesItemObject {}

/**
 * AnalyzePriceGap output payload
 */
export interface IAnalyzePriceGapActionOutput {
  dryRun?: boolean;
  invoiceNumber?: string;
  customerCode?: string;
  customerName?: string;
  siteName?: string;
  /** Per line: lineKey, sku, itemName, quantity, unitPrice, listPrice, listSource (לקוח / אתר), priceListCode, validFrom, validTo, currentListPrice, priceSource, managerApprovalStatus, freeText, gapPerUnit, gapTotal, reason  */
  lines?: IAnalyzePriceGapActionOutputAnalyzePriceGapActionOutputLinesItemObject[];
  totalGap?: number;
  reasons?: string[];
  salesAgentName?: string;
  salesManagerName?: string;
  disputeId?: string;
  approvalId?: string;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * AnalyzePriceGapAction
 * Execute code action
 */
export const AnalyzePriceGapAction = {
  actionBlockId: "AnalyzePriceGap",

  inputInstanceType: {} as IAnalyzePriceGapActionInput,
  outputInstanceType: {} as IAnalyzePriceGapActionOutput,
} as const;

/**
 * undefined
 */
export interface IApplyAllocationActionInputApplyAllocationActionInputAllocationsItemObject {
  invoiceNumber: string;
  amount: number;
}

/**
 * ApplyAllocation input payload
 */
export interface IApplyAllocationActionInput {
  receiptKey: string;
  allocations: IApplyAllocationActionInputApplyAllocationActionInputAllocationsItemObject[];
  /** Display name of the person, or אושר אוטומטית  */
  approvedBy?: string;
  dryRun?: boolean;
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IApplyAllocationActionOutputApplyAllocationActionOutputRowsItemObject {}

/**
 * ApplyAllocation output payload
 */
export interface IApplyAllocationActionOutput {
  ok?: boolean;
  dryRun?: boolean;
  receiptKey?: string;
  amount?: number;
  allocated?: number;
  unallocated?: number;
  matchStatus?: string;
  /** סכום (unchanged proposal) / ידני  */
  source?: string;
  approvedBy?: string;
  /** The written ReceiptAllocations rows: invoiceNumber, dueDate, amount, openBefore, openAfter, kind, isPartial, source, sourceRef, status  */
  rows?: IApplyAllocationActionOutputApplyAllocationActionOutputRowsItemObject[];
  openInvoicesLeft?: number;
  openTotalLeft?: number;
  /** allocate:<receiptKey> when the task is open, else ''  */
  taskKey?: string;
  taskChange?: string;
  closedTasks?: string[];
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * ApplyAllocationAction
 * Execute code action
 */
export const ApplyAllocationAction = {
  actionBlockId: "ApplyAllocation",

  inputInstanceType: {} as IApplyAllocationActionInput,
  outputInstanceType: {} as IApplyAllocationActionOutput,
} as const;

/**
 * BuildAgingReport input payload
 */
export interface IBuildAgingReportActionInput {
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
  /** Months before the current month; default AgentSettings agingMonthsBack (3)  */
  monthsBack?: number;
  /** Extra future months shown as columns; default 0  */
  monthsForward?: number;
  /** Only these customers  */
  customerCodes?: string[];
  /** Only customers owned by this bookkeeper (CustomerOwners override, else Priority)  */
  bookkeeperName?: string;
  /** Include customers whose total is 0  */
  includeZero?: boolean;
}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputWindowObject {
  monthsBack?: number;
  monthsForward?: number;
  monthKeys?: string[];
  firstMonth?: string;
  lastMonth?: string;
}

/**
 * The customer's contact person for collections: {name, phone, email, role} from CustomerContacts (הנהלת חשבונות first) else Customers.apContact*; null when none
 */
export interface IBuildAgingReportActionOutputContactObject {}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputNotesItemObject {}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputPromisesItemObject {}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputInvoicesItemObject {}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputCellNotesItemObject {}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputPriorDebtObject {
  amount?: number;
  notes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputNotesItemObject[];
  promises?: IBuildAgingReportActionOutputBuildAgingReportActionOutputPromisesItemObject[];
  /** Open invoices in this cell (same shape as months[].invoices)  */
  invoices?: IBuildAgingReportActionOutputBuildAgingReportActionOutputInvoicesItemObject[];
  /** Whole-cell notes (same as months[].cellNotes)  */
  cellNotes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputCellNotesItemObject[];
}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputMonthsItemObject {
  /** YYYY-MM  */
  monthKey?: string;
  /** Hebrew month label, e.g. נובמבר 2026  */
  label?: string;
  /** Open ILS due in this month  */
  amount?: number;
  /** CustomerNotes of this customer + due month, newest first  */
  notes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputNotesItemObject[];
  /** Promises whose promisedDate falls in this month  */
  promises?: IBuildAgingReportActionOutputBuildAgingReportActionOutputPromisesItemObject[];
  /** Open invoices due in this cell, sorted by due date: {index (1..n), id (invoice number, or the receiptKey), kind (חשבונית / חשבונית זיכוי / קבלה לא מותאמת), invoiceNumber (the receiptKey for a receipt entry), documentType, invoiceDate, dueDate, amount, openAmount (= remainingAmount: what is still open after our receipt allocations), remainingAmount, priorityOpenAmount (Priority's own open amount), paymentState, paidSeenAmount, paymentStatus (פתוחה / שולמה חלקית), receiptKeys, receipt (only for kind קבלה לא מותאמת: {receiptKey, bankLineId, amount, allocatedAmount, unallocatedAmount, status, valueDate, payerName, reference, priorityReceiptNumber}), status, sourceDocUrl, notes[] newest first (empty for a receipt entry), latestNote, promise (the open/last promise naming it: id, status, promisedDate, promisedAmount) }. A קבלה לא מותאמת entry has a negative amount/openAmount (−unallocatedAmount) and no notes or promise. The same shape is on priorDebt.invoices, laterDebt.invoices and laterDebt.byMonth[].invoices  */
  invoices?: IBuildAgingReportActionOutputBuildAgingReportActionOutputInvoicesItemObject[];
  /** Notes on the whole cell (no invoiceNumber) and notes on invoices that are no longer open, newest first. Same field on priorDebt and laterDebt  */
  cellNotes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputCellNotesItemObject[];
}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputByMonthItemObject {
  monthKey?: string;
  label?: string;
  amount?: number;
  notes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputNotesItemObject[];
  promises?: IBuildAgingReportActionOutputBuildAgingReportActionOutputPromisesItemObject[];
  invoices?: IBuildAgingReportActionOutputBuildAgingReportActionOutputInvoicesItemObject[];
  cellNotes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputCellNotesItemObject[];
}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputLaterDebtObject {
  amount?: number;
  notes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputNotesItemObject[];
  promises?: IBuildAgingReportActionOutputBuildAgingReportActionOutputPromisesItemObject[];
  /** Open invoices due after the window (same shape as months[].invoices)  */
  invoices?: IBuildAgingReportActionOutputBuildAgingReportActionOutputInvoicesItemObject[];
  /** Whole-cell notes (same as months[].cellNotes)  */
  cellNotes?: IBuildAgingReportActionOutputBuildAgingReportActionOutputCellNotesItemObject[];
  byMonth?: IBuildAgingReportActionOutputBuildAgingReportActionOutputByMonthItemObject[];
}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputOpenPromisesItemObject {}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputBuildAgingReportActionOutputCustomersItemObject {
  customerCode?: string;
  customerName?: string;
  /** The customer's contact person for collections: {name, phone, email, role} from CustomerContacts (הנהלת חשבונות first) else Customers.apContact*; null when none  */
  contact?: IBuildAgingReportActionOutputContactObject;
  bookkeeperName?: string;
  salesAgentName?: string;
  priorDebt?: IBuildAgingReportActionOutputPriorDebtObject;
  months?: IBuildAgingReportActionOutputBuildAgingReportActionOutputMonthsItemObject[];
  laterDebt?: IBuildAgingReportActionOutputLaterDebtObject;
  /** prior + months + later. Includes negative entries as they are: credit notes and the unallocated part of our receipts (קבלה לא מותאמת, −unallocatedAmount at the receipt's value-date month). Fully paid invoices (remaining 0) are out; partly paid ones count with their remainingAmount  */
  total?: number;
  ledgerBalance?: number;
  /** total − (ledgerBalance − paidSeenPending − unallocatedPending): Priority's ledger still carries the payments our receipts allocated but Priority has not caught up with, and does not yet carry the unallocated part of a receipt not issued / synced; 0 when coherent, before and after Priority catches up  */
  balanceDiff?: number;
  balanceMatches?: boolean;
  creditBalance?: boolean;
  openPromises?: IBuildAgingReportActionOutputBuildAgingReportActionOutputOpenPromisesItemObject[];
  isTestFixture?: boolean;
  /** Customers.priorityStatus (סטטוס): פעיל / זמני / חסום; null when unknown  */
  priorityStatus?: string;
  /** Customers.collectionNote (הערה לגבייה), e.g. "משלמים ב-30 לחודש"; null when empty  */
  collectionNote?: string;
  /** Customers.paymentMethod (אמצעי תשלום); null when unknown  */
  paymentMethod?: string;
  /** Customers.paymentTermsLabel (תנאי תשלום), e.g. שוטף+60  */
  paymentTermsLabel?: string;
  /** Our receipt allocations (and legacy approved matches) Priority does not show yet; netted out of the open amounts  */
  paidSeenPending?: number;
  /** Sum of the unallocated parts of our receipts shown as negative קבלה לא מותאמת entries (positive number)  */
  unallocatedReceipts?: number;
  /** Of unallocatedReceipts, the part Priority's ledger does not show yet (receipt מוכנה, or issued after the customer's last Invoices sync)  */
  unallocatedPending?: number;
}

/**
 * undefined
 */
export interface IBuildAgingReportActionOutputTotalsObject {
  priorDebt?: number;
  months?: IBuildAgingReportActionOutputBuildAgingReportActionOutputMonthsItemObject[];
  laterDebt?: number;
  total?: number;
  customers?: number;
  /** Sum of the customers' unallocated receipt parts (shown as negative entries)  */
  unallocatedReceipts?: number;
  /** Sum of the customers' paidSeenPending  */
  paidSeenPending?: number;
}

/**
 * BuildAgingReport output payload
 */
export interface IBuildAgingReportActionOutput {
  asOfDate?: string;
  /** Latest Invoices.syncedAt (ISO datetime): when the data was last pulled from Priority; null when unknown  */
  dataAsOf?: string;
  window?: IBuildAgingReportActionOutputWindowObject;
  customers?: IBuildAgingReportActionOutputBuildAgingReportActionOutputCustomersItemObject[];
  totals?: IBuildAgingReportActionOutputTotalsObject;
}

/**
 * BuildAgingReportAction
 * Execute code action
 */
export const BuildAgingReportAction = {
  actionBlockId: "BuildAgingReport",

  inputInstanceType: {} as IBuildAgingReportActionInput,
  outputInstanceType: {} as IBuildAgingReportActionOutput,
} as const;

export type BuildTasksActionInputBuildTasksActionInputSourcesItemEnum =
  | "דוח גיול"
  | "הבטחות"
  | "פניות"
  | "תקבולים";

export type BuildTasksActionInputPhaseEnum = "06:00" | "09:00";

/**
 * BuildTasks input payload
 */
export interface IBuildTasksActionInput {
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
  /** Only these sources. Default all  */
  sources?: BuildTasksActionInputBuildTasksActionInputSourcesItemEnum[];
  /** Only this customer's tasks  */
  customerCode?: string;
  /** Only the receipt tasks of these bank lines  */
  bankLineIds?: string[];
  /** Only the inbox and verify-sender tasks of these emails  */
  emailIds?: string[];
  /** Only the draft tasks of these approvals  */
  approvalIds?: string[];
  /** When true (default), only report what would change (default: true) */
  dryRun?: boolean;
  /** Which grouped note tasks to build: 06:00 = the types whose runAt is morningPullAt (plus the full scan); 09:00 = only the commitment task (runAt bankCheckAt), without the rest of the scan (default: "06:00") */
  phase?: BuildTasksActionInputPhaseEnum;
}

/**
 * Per source: {found, created, refreshed, reopened, autoClosed, readFailed}
 */
export interface IBuildTasksActionOutputBySourceObject {}

/**
 * undefined
 */
export interface IBuildTasksActionOutputBuildTasksActionOutputChangesItemObject {}

/**
 * Grouped note tasks: {created, refreshed, autoClosed, rows, byType}
 */
export interface IBuildTasksActionOutputNoteTasksObject {}

/**
 * BuildTasks output payload
 */
export interface IBuildTasksActionOutput {
  asOfDate?: string;
  dryRun?: boolean;
  /** Open problems found in scope  */
  found?: number;
  created?: number;
  refreshed?: number;
  reopened?: number;
  autoClosed?: number;
  keptClosedByPerson?: number;
  /** Per source: {found, created, refreshed, reopened, autoClosed, readFailed}  */
  bySource?: IBuildTasksActionOutputBySourceObject;
  /** {taskKey, change (created / refreshed / reopened / autoClosed / keptClosed), taskType, severity, customerCode, title, resolvedReason}  */
  changes?: IBuildTasksActionOutputBuildTasksActionOutputChangesItemObject[];
  /** True only when every written row was read back and matches  */
  writeVerified?: boolean;
  errors?: string[];
  /** Grouped note tasks: {created, refreshed, autoClosed, rows, byType}  */
  noteTasks?: IBuildTasksActionOutputNoteTasksObject;
}

/**
 * BuildTasksAction
 * Execute code action
 */
export const BuildTasksAction = {
  actionBlockId: "BuildTasks",

  inputInstanceType: {} as IBuildTasksActionInput,
  outputInstanceType: {} as IBuildTasksActionOutput,
} as const;

/**
 * CheckCommitments input payload
 */
export interface ICheckCommitmentsActionInput {
  /** Only this customer  */
  customerCode?: string;
  /** Only these notes  */
  noteIds?: string[];
  /** Testing: the day, YYYY-MM-DD (default today, Asia/Jerusalem)  */
  asOfDate?: string;
  /** Default true: only report (default: true) */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface ICheckCommitmentsActionOutputCheckCommitmentsActionOutputCommitmentsItemObject {}

/**
 * undefined
 */
export interface ICheckCommitmentsActionOutputTaskSyncObject {}

/**
 * CheckCommitments output payload
 */
export interface ICheckCommitmentsActionOutput {
  dryRun?: boolean;
  asOfDate?: string;
  checked?: number;
  kept?: number;
  partlyKept?: number;
  notKept?: number;
  /** {noteId, customerCode, dueMonth, promised, received, remaining, monthBalance, outcome, previousOutcome, receipts}  */
  commitments?: ICheckCommitmentsActionOutputCheckCommitmentsActionOutputCommitmentsItemObject[];
  taskSync?: ICheckCommitmentsActionOutputTaskSyncObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * CheckCommitmentsAction
 * Execute code action
 */
export const CheckCommitmentsAction = {
  actionBlockId: "CheckCommitments",

  inputInstanceType: {} as ICheckCommitmentsActionInput,
  outputInstanceType: {} as ICheckCommitmentsActionOutput,
} as const;

/**
 * CheckDocumentScans input payload
 */
export interface ICheckDocumentScansActionInput {
  /** Clock: YYYY-MM-DD or an ISO date-time. Defaults to now. A clock other than now only acts on test cases  */
  asOfDate?: string;
  /** Only this case  */
  disputeId?: string;
  /** Set by the DocumentChase workflow  */
  scheduled?: boolean;
  requestedBy?: string;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface ICheckDocumentScansActionOutputCheckDocumentScansActionOutputCasesItemObject {}

/**
 * CheckDocumentScans output payload
 */
export interface ICheckDocumentScansActionOutput {
  dryRun?: boolean;
  asOf?: string;
  /** Per case: disputeId, disputeNumber, customerCode, invoiceNumbers, scanned, expected, before, after, action, approvalId  */
  cases?: ICheckDocumentScansActionOutputCheckDocumentScansActionOutputCasesItemObject[];
  /** Pending פנייה ללוגיסטיקה drafts (request and reminder) of fully scanned cases moved to נדחה with decisionNote בוטלה – כל התעודות נסרקו (listed only on dryRun)  */
  cancelledDraftIds?: string[];
  writeVerified?: boolean;
  errors?: string[];
  /** true when documentChaseActive is off and the run was scheduled  */
  skipped?: boolean;
  reason?: string;
}

/**
 * CheckDocumentScansAction
 * Execute code action
 */
export const CheckDocumentScansAction = {
  actionBlockId: "CheckDocumentScans",

  inputInstanceType: {} as ICheckDocumentScansActionInput,
  outputInstanceType: {} as ICheckDocumentScansActionOutput,
} as const;

/**
 * CheckInvoiceDocuments input payload
 */
export interface ICheckInvoiceDocumentsActionInput {
  /** Invoice numbers the customer asked about  */
  invoiceNumbers: string[];
  /** Customer the request belongs to; defaults to the email's customer  */
  customerCode?: string;
  /** InboundEmails row id of the request (links the case and the package to the email)  */
  inboundEmailId?: string;
  /** Who ran it (מאיה or a person's name)  */
  requestedBy?: string;
  /** When true, only report the counts and what would be written; nothing changes  */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface ICheckInvoiceDocumentsActionOutputCheckInvoiceDocumentsActionOutputInvoicesItemObject {}

/**
 * undefined
 */
export interface ICheckInvoiceDocumentsActionOutputCheckInvoiceDocumentsActionOutputRefusedItemObject {}

/**
 * CheckInvoiceDocuments output payload
 */
export interface ICheckInvoiceDocumentsActionOutput {
  dryRun?: boolean;
  /** Per invoice: invoiceNumber, customerCode, customerName, expected, scanned, missingNoteNumbers, productLine, outcome, disputeId, approvalId  */
  invoices?: ICheckInvoiceDocumentsActionOutputCheckInvoiceDocumentsActionOutputInvoicesItemObject[];
  refused?: ICheckInvoiceDocumentsActionOutputCheckInvoiceDocumentsActionOutputRefusedItemObject[];
  /** Pending פנייה ללוגיסטיקה drafts cancelled (נדחה, בוטלה – כל התעודות נסרקו) because the case is fully scanned  */
  cancelledDraftIds?: string[];
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * CheckInvoiceDocumentsAction
 * Execute code action
 */
export const CheckInvoiceDocumentsAction = {
  actionBlockId: "CheckInvoiceDocuments",

  inputInstanceType: {} as ICheckInvoiceDocumentsActionInput,
  outputInstanceType: {} as ICheckInvoiceDocumentsActionOutput,
} as const;

/**
 * CloseSettledNotes input payload
 */
export interface ICloseSettledNotesActionInput {
  /** Only this customer  */
  customerCode?: string;
  /** Testing: the day, YYYY-MM-DD (default today, Asia/Jerusalem)  */
  asOfDate?: string;
  /** Default true: only report (default: true) */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface ICloseSettledNotesActionOutputCloseSettledNotesActionOutputClosedItemObject {}

/**
 * undefined
 */
export interface ICloseSettledNotesActionOutputCloseSettledNotesActionOutputSkippedItemObject {}

/**
 * undefined
 */
export interface ICloseSettledNotesActionOutputTaskSyncObject {}

/**
 * CloseSettledNotes output payload
 */
export interface ICloseSettledNotesActionOutput {
  dryRun?: boolean;
  /** Customer + month pairs with active notes  */
  monthsChecked?: number;
  monthsSettled?: number;
  notesClosed?: number;
  /** Commitments set to קוימה because the month reached 0  */
  commitmentsKept?: number;
  /** {noteId, customerCode, dueMonth, noteType, balance}  */
  closed?: ICloseSettledNotesActionOutputCloseSettledNotesActionOutputClosedItemObject[];
  /** {customerCode, dueMonth, reason}  */
  skipped?: ICloseSettledNotesActionOutputCloseSettledNotesActionOutputSkippedItemObject[];
  taskSync?: ICloseSettledNotesActionOutputTaskSyncObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * CloseSettledNotesAction
 * Execute code action
 */
export const CloseSettledNotesAction = {
  actionBlockId: "CloseSettledNotes",

  inputInstanceType: {} as ICloseSettledNotesActionInput,
  outputInstanceType: {} as ICloseSettledNotesActionOutput,
} as const;

/**
 * ConfirmExtractedLines input payload
 */
export interface IConfirmExtractedLinesActionInput {
  /** ImportBatches row id  */
  importBatchId: string;
  /** Display name of the person  */
  verifiedBy: string;
  /** Run IdentifyCustomers on the file's lines after confirming (default true; false only for the old-ladder tests) (default: true) */
  runIdentify?: boolean;
  /** The person checked the file against the bank although the totals did not match  */
  totalsAcknowledged?: boolean;
  /** When true, only report what would be written; nothing changes  */
  dryRun?: boolean;
}

/**
 * IdentifyCustomers result for the file's lines: counts, lines, errors
 */
export interface IConfirmExtractedLinesActionOutputIdentifyObject {}

/**
 * ConfirmExtractedLines output payload
 */
export interface IConfirmExtractedLinesActionOutput {
  ok?: boolean;
  /** IdentifyCustomers result for the file's lines: counts, lines, errors  */
  identify?: IConfirmExtractedLinesActionOutputIdentifyObject;
  importBatchId?: string;
  lineCount?: number;
  firstBankLineId?: string;
  errors?: string[];
}

/**
 * ConfirmExtractedLinesAction
 * Execute code action
 */
export const ConfirmExtractedLinesAction = {
  actionBlockId: "ConfirmExtractedLines",

  inputInstanceType: {} as IConfirmExtractedLinesActionInput,
  outputInstanceType: {} as IConfirmExtractedLinesActionOutput,
} as const;

export type ConfirmSenderActionInputModeEnum = "confirm" | "reject";

/**
 * ConfirmSender input payload
 */
export interface IConfirmSenderActionInput {
  /** InboundEmails row id  */
  inboundEmailId: string;
  mode: ConfirmSenderActionInputModeEnum;
  /** Required for confirm: the customer the sender belongs to  */
  customerCode?: string;
  /** Optional override of the name taken from the signature  */
  contactName?: string;
  /** Optional short note (required wording for reject is free text)  */
  note?: string;
  /** Name of the person who decided  */
  decidedBy?: string;
}

/**
 * ConfirmSender output payload
 */
export interface IConfirmSenderActionOutput {
  mode?: string;
  contactId?: string;
  contactKey?: string;
  customerCode?: string;
  customerName?: string;
  priorityTaskId?: string;
  rerouted?: boolean;
  /** Hebrew summary for the screen  */
  message?: string;
}

/**
 * ConfirmSenderAction
 * Execute code action
 */
export const ConfirmSenderAction = {
  actionBlockId: "ConfirmSender",

  inputInstanceType: {} as IConfirmSenderActionInput,
  outputInstanceType: {} as IConfirmSenderActionOutput,
} as const;

export type CreateDocumentRequestActionInputKindEnum = "בקשה" | "תזכורת";

/**
 * CreateDocumentRequest input payload
 */
export interface ICreateDocumentRequestActionInput {
  /** Disputes row id  */
  disputeId: string;
  /**  (default: "בקשה") */
  kind?: CreateDocumentRequestActionInputKindEnum;
  requestedBy?: string;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface ICreateDocumentRequestActionOutputApprovalObject {}

/**
 * CreateDocumentRequest output payload
 */
export interface ICreateDocumentRequestActionOutput {
  dryRun?: boolean;
  approval?: ICreateDocumentRequestActionOutputApprovalObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * CreateDocumentRequestAction
 * Execute code action
 */
export const CreateDocumentRequestAction = {
  actionBlockId: "CreateDocumentRequest",

  inputInstanceType: {} as ICreateDocumentRequestActionInput,
  outputInstanceType: {} as ICreateDocumentRequestActionOutput,
} as const;

/**
 * CreatePriceApprovalRequest input payload
 */
export interface ICreatePriceApprovalRequestActionInput {
  disputeId: string;
  requestedBy?: string;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface ICreatePriceApprovalRequestActionOutputApprovalObject {}

/**
 * CreatePriceApprovalRequest output payload
 */
export interface ICreatePriceApprovalRequestActionOutput {
  dryRun?: boolean;
  approval?: ICreatePriceApprovalRequestActionOutputApprovalObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * CreatePriceApprovalRequestAction
 * Execute code action
 */
export const CreatePriceApprovalRequestAction = {
  actionBlockId: "CreatePriceApprovalRequest",

  inputInstanceType: {} as ICreatePriceApprovalRequestActionInput,
  outputInstanceType: {} as ICreatePriceApprovalRequestActionOutput,
} as const;

/**
 * CustomerSummaryRun input payload
 */
export interface ICustomerSummaryRunActionInput {
  /** Only this customer (the card's refresh). Default: all customers with an open balance, task or promise  */
  customerCode?: string;
  /** Clock for tests: YYYY-MM-DD  */
  asOfDate?: string;
}

/**
 * CustomerSummaryRun output payload
 */
export interface ICustomerSummaryRunActionOutput {
  summaryDate?: string;
  written?: number;
  byAgent?: number;
  byFallback?: number;
  /** Agent entries dropped and why  */
  rejected?: string[];
  errors?: string[];
}

/**
 * CustomerSummaryRunAction
 * Writes the daily customer summaries: PrepareCustomerSummaries computes each customer's facts and the prompt, Iris (CustomerCardAgent) writes a two-to-three-sentence summary and one suggested action per customer in one structured answer, and WriteCustomerSummaries checks it and upserts CustomerDailySummaries (code fallback for any customer the agent missed). Runs every morning from MorningRunPipeline for all customers with an open balance, task or promise, and on demand for one customer from the card. Nothing is sent and nothing is written to Priority.
 */
export const CustomerSummaryRunAction = {
  actionBlockId: "CustomerSummaryRun",

  inputInstanceType: {} as ICustomerSummaryRunActionInput,
  outputInstanceType: {} as ICustomerSummaryRunActionOutput,
} as const;

export type DecideApprovalActionInputDecisionEnum =
  | "approve"
  | "reject"
  | "edit";

/**
 * DecideApproval input payload
 */
export interface IDecideApprovalActionInput {
  decision: DecideApprovalActionInputDecisionEnum;
  approvalIds?: string[];
  /** Decide every pending draft of this batch  */
  batchId?: string;
  /** Display name of the person deciding  */
  decidedBy: string;
  note?: string;
  /** edit only  */
  subject?: string;
  /** edit only  */
  body?: string;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IDecideApprovalActionOutputDecideApprovalActionOutputUpdatedItemObject {}

/**
 * undefined
 */
export interface IDecideApprovalActionOutputDecideApprovalActionOutputSkippedItemObject {}

/**
 * DecideApproval output payload
 */
export interface IDecideApprovalActionOutput {
  dryRun?: boolean;
  updated?: IDecideApprovalActionOutputDecideApprovalActionOutputUpdatedItemObject[];
  skipped?: IDecideApprovalActionOutputDecideApprovalActionOutputSkippedItemObject[];
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * DecideApprovalAction
 * Execute code action
 */
export const DecideApprovalAction = {
  actionBlockId: "DecideApproval",

  inputInstanceType: {} as IDecideApprovalActionInput,
  outputInstanceType: {} as IDecideApprovalActionOutput,
} as const;

/**
 * DecideInsuranceRequest input payload
 */
export interface IDecideInsuranceRequestActionInput {
  /** CreditLimitRequests row id  */
  requestId: string;
  /** Display name of the person approving  */
  decidedBy: string;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IDecideInsuranceRequestActionOutputRequestObject {}

/**
 * DecideInsuranceRequest output payload
 */
export interface IDecideInsuranceRequestActionOutput {
  dryRun?: boolean;
  refused?: boolean;
  reason?: string;
  request?: IDecideInsuranceRequestActionOutputRequestObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * DecideInsuranceRequestAction
 * Execute code action
 */
export const DecideInsuranceRequestAction = {
  actionBlockId: "DecideInsuranceRequest",

  inputInstanceType: {} as IDecideInsuranceRequestActionInput,
  outputInstanceType: {} as IDecideInsuranceRequestActionOutput,
} as const;

export type DecideMatchProposalActionInputDecisionEnum = "priorityDone";

/**
 * DecideMatchProposal input payload
 */
export interface IDecideMatchProposalActionInput {
  /** priorityDone = the receipt was issued in Priority  */
  decision: DecideMatchProposalActionInputDecisionEnum;
  /** MatchProposals row ids, when the caller has the proposal rather than the receipt  */
  proposalIds?: string[];
  /** Display name of the person deciding  */
  decidedBy: string;
  /** Optional reason (e.g. why rejected)  */
  note?: string;
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
  /** When true, only report what would be written; nothing changes  */
  dryRun?: boolean;
  /** Email of the person deciding (AgentFeedback.byEmail on a correction)  */
  decidedByEmail?: string;
  /** priorityDone: the receipt number Priority gave  */
  priorityReceiptNumber?: string;
  /** Receipts row id (preferred; agent cheques have no proposal)  */
  receiptId?: string;
}

/**
 * undefined
 */
export interface IDecideMatchProposalActionOutputDecideMatchProposalActionOutputResultsItemObject {}

/**
 * {receiptKey, receiptId, bankLineId, customerCode, customerName, amount, receiptStatus, matchStatus, priorityReceiptNumber, issuedBy, issuedAt}; null when refused
 */
export interface IDecideMatchProposalActionOutputReceiptObject {}

/**
 * DecideMatchProposal output payload
 */
export interface IDecideMatchProposalActionOutput {
  dryRun?: boolean;
  decision?: string;
  /** Per receipt: previous / new receiptStatus, bank line and proposal updates  */
  results?: IDecideMatchProposalActionOutputDecideMatchProposalActionOutputResultsItemObject[];
  /** True only when every written row was read back and matches  */
  writeVerified?: boolean;
  errors?: string[];
  /** {receiptKey, receiptId, bankLineId, customerCode, customerName, amount, receiptStatus, matchStatus, priorityReceiptNumber, issuedBy, issuedAt}; null when refused  */
  receipt?: IDecideMatchProposalActionOutputReceiptObject;
}

/**
 * DecideMatchProposalAction
 * Execute code action
 */
export const DecideMatchProposalAction = {
  actionBlockId: "DecideMatchProposal",

  inputInstanceType: {} as IDecideMatchProposalActionInput,
  outputInstanceType: {} as IDecideMatchProposalActionOutput,
} as const;

/**
 * GenerateReceiptPdf input payload
 */
export interface IGenerateReceiptPdfActionInput {
  /** Receipts.receiptKey (RCPT-<bankLineId>)  */
  receiptKey: string;
}

/**
 * GenerateReceiptPdf output payload
 */
export interface IGenerateReceiptPdfActionOutput {
  /** Protected PDF url  */
  url?: string;
  fileName?: string;
  receiptKey?: string;
  customerCode?: string;
  customerName?: string;
  errors?: string[];
}

/**
 * GenerateReceiptPdfAction
 * Execute code action
 */
export const GenerateReceiptPdfAction = {
  actionBlockId: "GenerateReceiptPdf",

  inputInstanceType: {} as IGenerateReceiptPdfActionInput,
  outputInstanceType: {} as IGenerateReceiptPdfActionOutput,
} as const;

export type GenerateStatementPdfActionInputKindEnum = "כרטסת" | "חובות פתוחים";

/**
 * GenerateStatementPdf input payload
 */
export interface IGenerateStatementPdfActionInput {
  customerCode: string;
  kind: GenerateStatementPdfActionInputKindEnum;
  /** Ledger range start (כרטסת only)  */
  fromDate?: string;
  /** Ledger range end (כרטסת only)  */
  toDate?: string;
  /** Default today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IGenerateStatementPdfActionOutputTotalsObject {}

/**
 * GenerateStatementPdf output payload
 */
export interface IGenerateStatementPdfActionOutput {
  /** Protected PDF url  */
  url?: string;
  fileName?: string;
  kind?: string;
  customerCode?: string;
  customerName?: string;
  /** The 'תצוגה – נכון ל…' stamp text  */
  asOfLabel?: string;
  totals?: IGenerateStatementPdfActionOutputTotalsObject;
  rows?: number;
  errors?: string[];
}

/**
 * GenerateStatementPdfAction
 * Execute code action
 */
export const GenerateStatementPdfAction = {
  actionBlockId: "GenerateStatementPdf",

  inputInstanceType: {} as IGenerateStatementPdfActionInput,
  outputInstanceType: {} as IGenerateStatementPdfActionOutput,
} as const;

/**
 * GetCreditExposure input payload
 */
export interface IGetCreditExposureActionInput {
  /** A customer for the card tab; omit for the alerts of all insured customers  */
  customerCode?: string;
  /** Clock for tests: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
  /** Alerts only: limit to one bookkeeper's customers (CustomerOwners override, else Priority)  */
  bookkeeperName?: string;
}

/**
 * customerCode, customerName (null in alerts mode)
 */
export interface IGetCreditExposureActionOutputCustomerObject {}

/**
 * {id, insurer, coverNo, insuredAmount, validUntil, status, coverSource, syncedAt, daysToExpiry, expiringSoon, expired} or null (no cover = no tab)
 */
export interface IGetCreditExposureActionOutputCoverObject {}

/**
 * {amount, asOf, syncedAt} as in Priority (CustomerExposure); amount null when Priority sent no row
 */
export interface IGetCreditExposureActionOutputStaticObligoObject {}

/**
 * {amount (never below 0), staticAmount, adjustmentsTotal, adjustments[{kind: קבלה שטרם נרשמה ב-Priority, amount, bankLineId, receiptKey, matchProposalId, valueDate, payerName, status, reason}], undepositedCheques[{id, reference, amount, docDate, dueDate}], chequesTotal, afterDeposit}
 */
export interface IGetCreditExposureActionOutputDynamicObligoObject {}

/**
 * Customer mode: {thresholdPct, insuredAmount, static{pct, amount, headroom, level}, dynamic{…}, afterDeposit{…}} where level is תקין / גבוה (null without an insured amount). Alerts mode: {thresholdPct, expiryAlertDays, insuredCustomers}
 */
export interface IGetCreditExposureActionOutputUseObject {}

/**
 * undefined
 */
export interface IGetCreditExposureActionOutputGetCreditExposureActionOutputBreakdownItemObject {}

/**
 * Open CreditLimitRequests row of the customer, or null
 */
export interface IGetCreditExposureActionOutputOpenRequestObject {}

/**
 * undefined
 */
export interface IGetCreditExposureActionOutputGetCreditExposureActionOutputAlertsItemObject {}

/**
 * GetCreditExposure output payload
 */
export interface IGetCreditExposureActionOutput {
  /** customerCode, customerName (null in alerts mode)  */
  customer?: IGetCreditExposureActionOutputCustomerObject;
  /** Customer mode: the customer has a cover (false = do not show the tab). Alerts mode: at least one insured customer  */
  insured?: boolean;
  /** {id, insurer, coverNo, insuredAmount, validUntil, status, coverSource, syncedAt, daysToExpiry, expiringSoon, expired} or null (no cover = no tab)  */
  cover?: IGetCreditExposureActionOutputCoverObject;
  /** {amount, asOf, syncedAt} as in Priority (CustomerExposure); amount null when Priority sent no row  */
  staticObligo?: IGetCreditExposureActionOutputStaticObligoObject;
  /** {amount (never below 0), staticAmount, adjustmentsTotal, adjustments[{kind: קבלה שטרם נרשמה ב-Priority, amount, bankLineId, receiptKey, matchProposalId, valueDate, payerName, status, reason}], undepositedCheques[{id, reference, amount, docDate, dueDate}], chequesTotal, afterDeposit}  */
  dynamicObligo?: IGetCreditExposureActionOutputDynamicObligoObject;
  /** Customer mode: {thresholdPct, insuredAmount, static{pct, amount, headroom, level}, dynamic{…}, afterDeposit{…}} where level is תקין / גבוה (null without an insured amount). Alerts mode: {thresholdPct, expiryAlertDays, insuredCustomers}  */
  use?: IGetCreditExposureActionOutputUseObject;
  /** [{itemType, count, total, items[{id, reference, amount, docDate, dueDate}]}]: all four types in the fixed order חשבונית פתוחה, תעודת משלוח שלא חויבה, צ׳ק שלא הופקד, הזמנה פתוחה (empty groups included)  */
  breakdown?: IGetCreditExposureActionOutputGetCreditExposureActionOutputBreakdownItemObject[];
  /** Open CreditLimitRequests row of the customer, or null  */
  openRequest?: IGetCreditExposureActionOutputOpenRequestObject;
  /** Alerts mode: [{kind: ניצול גבוה / פקיעה, customerCode, customerName, bookkeeperName, insurer, coverNo, insuredAmount, staticAmount, dynamicAmount, staticPct, dynamicPct, thresholdPct, validUntil, daysToExpiry}], ניצול גבוה first (highest dynamic % first), then פקיעה (soonest first)  */
  alerts?: IGetCreditExposureActionOutputGetCreditExposureActionOutputAlertsItemObject[];
  asOfDate?: string;
  errors?: string[];
}

/**
 * GetCreditExposureAction
 * Execute code action
 */
export const GetCreditExposureAction = {
  actionBlockId: "GetCreditExposure",

  inputInstanceType: {} as IGetCreditExposureActionInput,
  outputInstanceType: {} as IGetCreditExposureActionOutput,
} as const;

/**
 * GetCustomer360 input payload
 */
export interface IGetCustomer360ActionInput {
  /** Customer code  */
  customerCode: string;
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputCustomerObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputContactsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputInvoicesItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputPaymentsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputBankLinesItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputMatchProposalsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputDisputesItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputApprovalsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputCreditRequestsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputInboundEmailsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputInteractionsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputAgingObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputKpisObject {
  openBalance?: number;
  overdue?: number;
  /** Open commitments (same as openCommitments, kept for older screens)  */
  openPromises?: number;
  /** Dynamic obligo / insured amount of the cover in תקף, % one decimal; null without one  */
  insuranceUsePct?: number;
  lastPaymentDate?: string;
  /** Active commitments (התחייבות לתשלום) with outcome פתוחה  */
  openCommitments?: number;
}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputTimelineItemObject {
  /** ISO date or datetime  */
  at?: string;
  /** חשבונית, קבלה, הבטחה, הערה, פנייה, מקרה, אישור, ביטוח, שורת בנק, אינטראקציה  */
  kind?: string;
  title?: string;
  amount?: number;
  status?: string;
  relatedTable?: string;
  relatedId?: string;
}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputReceiptsItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputOpenInvoicesItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputCustomerNotesItemObject {}

/**
 * undefined
 */
export interface IGetCustomer360ActionOutputGetCustomer360ActionOutputOpenMonthsItemObject {}

/**
 * GetCustomer360 output payload
 */
export interface IGetCustomer360ActionOutput {
  customer?: IGetCustomer360ActionOutputCustomerObject;
  /** The customer has a cover in CreditCovers: show the אובליגו וביטוח tab (its content comes from GetCreditExposure)  */
  insured?: boolean;
  bookkeeperName?: string;
  contacts?: IGetCustomer360ActionOutputGetCustomer360ActionOutputContactsItemObject[];
  /** Every invoice with the live layer: paymentState, paidSeenAmount, effectiveOpenAmount, remainingAmount (= effectiveOpenAmount), paymentStatus (פתוחה / שולמה חלקית / שולמה), receiptKeys, isPaid, latestNote*, notesCount, delivery-note scan counts, and receipts[] {receiptKey, amount (allocated to this invoice), valueDate, receiptStatus, matchStatus, priorityReceiptNumber, kind, source}, newest first. Since 01.11 every closed invoice (isPaid) also carries closedAt (date of the last closing receipt, else the Priority status date) and closingReceipts[] {source: שלנו | Priority, receiptKey, priorityReceiptNumber, date, method, amount (the part of the receipt applied to this invoice), status, isEstimate (true when a Priority receipt covering several invoices was spread oldest due date first)}: our ReceiptAllocations plus Priority receipts from the Payments mirror whose matchedInvoiceNumbers include the invoice, a Priority copy of one of our receipts counted once (the same rule as the promise engine). closedWithoutReceipt = true when the invoice is closed and no receipt covers its amount (credit note or write-off). Since 01.11 (fix) EVERY invoice, open or closed, carries paidAmount = the receipts applied to it (the same receipts-only rule as closingReceipts) and paidReceipts[] (same shape as closingReceipts); the card's שולם column reads paidAmount. paidSeenAmount stays the layer field for money seen and not yet in Priority  */
  invoices?: IGetCustomer360ActionOutputGetCustomer360ActionOutputInvoicesItemObject[];
  payments?: IGetCustomer360ActionOutputGetCustomer360ActionOutputPaymentsItemObject[];
  bankLines?: IGetCustomer360ActionOutputGetCustomer360ActionOutputBankLinesItemObject[];
  matchProposals?: IGetCustomer360ActionOutputGetCustomer360ActionOutputMatchProposalsItemObject[];
  disputes?: IGetCustomer360ActionOutputGetCustomer360ActionOutputDisputesItemObject[];
  approvals?: IGetCustomer360ActionOutputGetCustomer360ActionOutputApprovalsItemObject[];
  creditRequests?: IGetCustomer360ActionOutputGetCustomer360ActionOutputCreditRequestsItemObject[];
  inboundEmails?: IGetCustomer360ActionOutputGetCustomer360ActionOutputInboundEmailsItemObject[];
  interactions?: IGetCustomer360ActionOutputGetCustomer360ActionOutputInteractionsItemObject[];
  aging?: IGetCustomer360ActionOutputAgingObject;
  kpis?: IGetCustomer360ActionOutputKpisObject;
  timeline?: IGetCustomer360ActionOutputGetCustomer360ActionOutputTimelineItemObject[];
  /** The customer's Receipts, newest first: receiptKey, amount, allocatedAmount, unallocatedAmount, receiptStatus, matchStatus, allocations[] (the rows), and since stage 6 covered[] {invoiceNumber, dueDate, amount, isPartial, openAfter}, stillOpen[] {invoiceNumber, dueDate, dueMonth, openAmount}, stillOpenTotal  */
  receipts?: IGetCustomer360ActionOutputGetCustomer360ActionOutputReceiptsItemObject[];
  /** Open invoices now: { invoiceNumber, invoiceDate, dueDate, dueMonth, invoiceAmount, openInPriority, allocated (by our receipts), openBalance, receipts[{receiptKey, amount}] }, oldest due first  */
  openInvoices?: IGetCustomer360ActionOutputGetCustomer360ActionOutputOpenInvoicesItemObject[];
  /** The customer's CustomerNotes, newest first, with status, outcome, amountReceived and amountRemaining  */
  customerNotes?: IGetCustomer360ActionOutputGetCustomer360ActionOutputCustomerNotesItemObject[];
  /** Per due month: dueMonth, openTotal and movementCount from OpenMovements, activeNotes  */
  openMonths?: IGetCustomer360ActionOutputGetCustomer360ActionOutputOpenMonthsItemObject[];
}

/**
 * GetCustomer360Action
 * Execute code action
 */
export const GetCustomer360Action = {
  actionBlockId: "GetCustomer360",

  inputInstanceType: {} as IGetCustomer360ActionInput,
  outputInstanceType: {} as IGetCustomer360ActionOutput,
} as const;

/**
 * GetCustomerPriorityDetails input payload
 */
export interface IGetCustomerPriorityDetailsActionInput {
  /** Priority CUSTNAME  */
  customerCode: string;
}

/**
 * Every column of the customer's row, keyed by the UPPER-case Priority column name; null when not found
 */
export interface IGetCustomerPriorityDetailsActionOutputRecordObject {}

/**
 * GetCustomerPriorityDetails output payload
 */
export interface IGetCustomerPriorityDetailsActionOutput {
  /** Every column of the customer's row, keyed by the UPPER-case Priority column name; null when not found  */
  record?: IGetCustomerPriorityDetailsActionOutputRecordObject;
  /** ISO time of the read  */
  readAt?: string;
  /** Set when Brain could not be read  */
  error?: string;
}

/**
 * GetCustomerPriorityDetailsAction
 * Execute code action
 */
export const GetCustomerPriorityDetailsAction = {
  actionBlockId: "GetCustomerPriorityDetails",

  inputInstanceType: {} as IGetCustomerPriorityDetailsActionInput,
  outputInstanceType: {} as IGetCustomerPriorityDetailsActionOutput,
} as const;

/**
 * GetLedger input payload
 */
export interface IGetLedgerActionInput {
  customerCode: string;
  /** Default: 1 January of the asOfDate year  */
  fromDate?: string;
  /** Default: asOfDate  */
  toDate?: string;
  /** Clock for the demo; default today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IGetLedgerActionOutputGetLedgerActionOutputEntriesItemObject {}

/**
 * GetLedger output payload
 */
export interface IGetLedgerActionOutput {
  customerCode?: string;
  customerName?: string;
  fromDate?: string;
  toDate?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalDebit?: number;
  totalCredit?: number;
  entries?: IGetLedgerActionOutputGetLedgerActionOutputEntriesItemObject[];
  hasLedger?: boolean;
  /** Latest syncedAt of the rows: the 'נכון ל' date  */
  syncedAt?: string;
  note?: string;
}

/**
 * GetLedgerAction
 * Execute code action
 */
export const GetLedgerAction = {
  actionBlockId: "GetLedger",

  inputInstanceType: {} as IGetLedgerActionInput,
  outputInstanceType: {} as IGetLedgerActionOutput,
} as const;

/**
 * GetMorningChecklist input payload
 */
export interface IGetMorningChecklistActionInput {
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IGetMorningChecklistActionOutputGetMorningChecklistActionOutputTasksItemObject {
  kind?: string;
  /** Hebrew task label  */
  label?: string;
  requiredDataDate?: string;
  done?: boolean;
  importBatchId?: string;
  fileName?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

/**
 * GetMorningChecklist output payload
 */
export interface IGetMorningChecklistActionOutput {
  asOfDate?: string;
  previousBusinessDay?: string;
  allDone?: boolean;
  tasks?: IGetMorningChecklistActionOutputGetMorningChecklistActionOutputTasksItemObject[];
}

/**
 * GetMorningChecklistAction
 * Execute code action
 */
export const GetMorningChecklistAction = {
  actionBlockId: "GetMorningChecklist",

  inputInstanceType: {} as IGetMorningChecklistActionInput,
  outputInstanceType: {} as IGetMorningChecklistActionOutput,
} as const;

/**
 * GetOpenDebts input payload
 */
export interface IGetOpenDebtsActionInput {
  customerCode: string;
  /** Default today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IGetOpenDebtsActionOutputGetOpenDebtsActionOutputDocumentsItemObject {}

/**
 * undefined
 */
export interface IGetOpenDebtsActionOutputGetOpenDebtsActionOutputOpenReceiptsItemObject {}

/**
 * GetOpenDebts output payload
 */
export interface IGetOpenDebtsActionOutput {
  customerCode?: string;
  customerName?: string;
  asOfDate?: string;
  documents?: IGetOpenDebtsActionOutputGetOpenDebtsActionOutputDocumentsItemObject[];
  totalOpen?: number;
  totalOverdue?: number;
  totalNotDue?: number;
  endOfCardBalance?: number;
  /** כרטסת or כרטיס לקוח  */
  balanceSource?: string;
  openReceipts?: IGetOpenDebtsActionOutputGetOpenDebtsActionOutputOpenReceiptsItemObject[];
  note?: string;
  /** Always OpenMovements  */
  source?: string;
  /** True when the OpenMovements table is empty (pull never ran / failed)  */
  movementsMirrorEmpty?: boolean;
}

/**
 * GetOpenDebtsAction
 * Execute code action
 */
export const GetOpenDebtsAction = {
  actionBlockId: "GetOpenDebts",

  inputInstanceType: {} as IGetOpenDebtsActionInput,
  outputInstanceType: {} as IGetOpenDebtsActionOutput,
} as const;

/**
 * GetReceiptRecord input payload
 */
export interface IGetReceiptRecordActionInput {
  /** BankLines row id (a bank-file / Priority line)  */
  bankLineId?: string;
  /** Receipts row id (works for agent cheques too)  */
  receiptId?: string;
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * null for an agent cheque: {bankLineId, valueDate, amount, payerName, reference, lineType, status, checkStage}
 */
export interface IGetReceiptRecordActionOutputLineObject {}

/**
 * null until identified: {customerCode, customerName, priorityStatus, paymentTermsLabel, paymentMethod, collectionNote, salesAgentName, assignedBookkeeperName, apContact {name, email, phone} | null}
 */
export interface IGetReceiptRecordActionOutputCustomerObject {}

/**
 * {status ודאי / לא ודאי / אושר / אושר אוטומטית / לא זוהה | null, confidence 0–100, method, candidates[{customerCode, customerName, confidence, method}], steps[{rung, result, summary, actor, at}]}; for an agent cheque {status: null, method: 'צ׳ק סוכן'}
 */
export interface IGetReceiptRecordActionOutputIdentifyObject {}

/**
 * null when no receipt yet: {receiptId, receiptKey, receiptSource, amount, valueDate, receiptStatus, sendStatus, mailApprovalId, mailApprovalStatus, priorityReceiptNumber, preparedBy, preparedAt, issuedBy, issuedAt}
 */
export interface IGetReceiptRecordActionOutputReceiptObject {}

/**
 * null until checked: {result נסגר לאפס – מצטבר / נסגר לאפס – חודש אחד / לברר מול הלקוח, months[] (dueMonth keys the receipt closed), monthBalances[{dueMonth, openAmount, cumulative}] at the time of reading, taskKey}
 */
export interface IGetReceiptRecordActionOutputDebtCheckObject {}

/**
 * null until the debt check: {matchStatus, allocatedAmount, unallocatedAmount, allocationConfidence, rows[{id, invoiceNumber, dueDate, amount, openBefore, openAfter, kind, isPartial, source, status}], taskKey}
 */
export interface IGetReceiptRecordActionOutputAllocationObject {}

/**
 * undefined
 */
export interface IGetReceiptRecordActionOutputGetReceiptRecordActionOutputCustomerNotesItemObject {}

/**
 * GetReceiptRecord output payload
 */
export interface IGetReceiptRecordActionOutput {
  /** null for an agent cheque: {bankLineId, valueDate, amount, payerName, reference, lineType, status, checkStage}  */
  line?: IGetReceiptRecordActionOutputLineObject;
  /** null until identified: {customerCode, customerName, priorityStatus, paymentTermsLabel, paymentMethod, collectionNote, salesAgentName, assignedBookkeeperName, apContact {name, email, phone} | null}  */
  customer?: IGetReceiptRecordActionOutputCustomerObject;
  /** {status ודאי / לא ודאי / אושר / אושר אוטומטית / לא זוהה | null, confidence 0–100, method, candidates[{customerCode, customerName, confidence, method}], steps[{rung, result, summary, actor, at}]}; for an agent cheque {status: null, method: 'צ׳ק סוכן'}  */
  identify?: IGetReceiptRecordActionOutputIdentifyObject;
  /** null when no receipt yet: {receiptId, receiptKey, receiptSource, amount, valueDate, receiptStatus, sendStatus, mailApprovalId, mailApprovalStatus, priorityReceiptNumber, preparedBy, preparedAt, issuedBy, issuedAt}  */
  receipt?: IGetReceiptRecordActionOutputReceiptObject;
  /** null until checked: {result נסגר לאפס – מצטבר / נסגר לאפס – חודש אחד / לברר מול הלקוח, months[] (dueMonth keys the receipt closed), monthBalances[{dueMonth, openAmount, cumulative}] at the time of reading, taskKey}  */
  debtCheck?: IGetReceiptRecordActionOutputDebtCheckObject;
  /** null until the debt check: {matchStatus, allocatedAmount, unallocatedAmount, allocationConfidence, rows[{id, invoiceNumber, dueDate, amount, openBefore, openAfter, kind, isPartial, source, status}], taskKey}  */
  allocation?: IGetReceiptRecordActionOutputAllocationObject;
  /** The customer's open CustomerNotes: {id, dueMonth, noteType, actionDate, noteAmount, noteText, outcome, authorName}  */
  customerNotes?: IGetReceiptRecordActionOutputGetReceiptRecordActionOutputCustomerNotesItemObject[];
  /** The text to copy into Priority once the receipt is approved; null otherwise  */
  priorityInstruction?: string;
  errors?: string[];
  asOfDate?: string;
}

/**
 * GetReceiptRecordAction
 * Execute code action
 */
export const GetReceiptRecordAction = {
  actionBlockId: "GetReceiptRecord",

  inputInstanceType: {} as IGetReceiptRecordActionInput,
  outputInstanceType: {} as IGetReceiptRecordActionOutput,
} as const;

/**
 * GetWeekBrief input payload
 */
export interface IGetWeekBriefActionInput {
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
  /** Only this bookkeeper's customers; omit for everyone  */
  bookkeeperName?: string;
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputGetWeekBriefActionOutputDaysItemObject {
  /** YYYY-MM-DD  */
  date?: string;
  /** א׳ … ש׳  */
  weekday?: string;
  isToday?: boolean;
  isPast?: boolean;
  itemCount?: number;
  /** ILS of the day's items (due invoices + promises)  */
  amount?: number;
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputWeekObject {
  /** Sunday YYYY-MM-DD  */
  start?: string;
  /** Saturday YYYY-MM-DD  */
  end?: string;
  /** Hebrew label, e.g. 25.10–31.10  */
  label?: string;
  /** Sunday..Saturday  */
  days?: IGetWeekBriefActionOutputGetWeekBriefActionOutputDaysItemObject[];
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputKpisObject {
  dueThisWeekAmount?: number;
  /** Invoices  */
  dueThisWeekCount?: number;
  dueThisWeekCustomers?: number;
  promisedThisWeekAmount?: number;
  promisedThisWeekCount?: number;
  /** Of this week's promises, ILS already seen in the bank  */
  promisesSeenAmount?: number;
  brokenPromisesCount?: number;
  claimedPaidOpenAmount?: number;
  /** Invoices  */
  claimedPaidOpenCount?: number;
  disputesFollowUpCount?: number;
  /** Open ILS already past due  */
  overdueTotal?: number;
  overdueNoNoteAmount?: number;
  overdueNoNoteCustomers?: number;
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputGetWeekBriefActionOutputItemsItemObject {
  /** Stable key  */
  id?: string;
  /** YYYY-MM-DD in the week, or null for claims with no date  */
  date?: string;
  /** פירעון / הבטחת תשלום / שולם לטענת הלקוח / בירור / הבטחה שהופרה  */
  kind?: string;
  customerCode?: string;
  customerName?: string;
  bookkeeperName?: string;
  invoiceNumbers?: string[];
  amount?: number;
  /** Short Hebrew status, e.g. פתוחה, נראה תשלום, הופרה, לא נראה בבנק, יש הערה  */
  status?: string;
  /** Latest note text (or the promise note), when there is one  */
  noteText?: string;
  noteType?: string;
  promiseId?: string;
  noteId?: string;
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputGetWeekBriefActionOutputOverdueNoNoteItemObject {
  customerCode?: string;
  customerName?: string;
  bookkeeperName?: string;
  overdueAmount?: number;
  oldestDueDate?: string;
  /** ISO or null  */
  lastNoteAt?: string;
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputAgingObject {
  /** One Hebrew sentence, the bottom line for the week (built by code)  */
  headline?: string;
  /** Up to 6 short Hebrew sentences, most important first  */
  conclusions?: string[];
  kpis?: IGetWeekBriefActionOutputKpisObject;
  /** Every week item, sorted by date then amount desc  */
  items?: IGetWeekBriefActionOutputGetWeekBriefActionOutputItemsItemObject[];
  /** Top 5 by overdue amount  */
  overdueNoNote?: IGetWeekBriefActionOutputGetWeekBriefActionOutputOverdueNoNoteItemObject[];
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputGetWeekBriefActionOutputFilesItemObject {
  id?: string;
  fileName?: string;
  extractionStatus?: string;
  checkStatus?: string;
  uploadedAt?: string;
}

/**
 * undefined
 */
export interface IGetWeekBriefActionOutputReceiptsObject {
  /** YYYY-MM-DD  */
  workDay?: string;
  files?: IGetWeekBriefActionOutputGetWeekBriefActionOutputFilesItemObject[];
  /** Credit transfers read from today's files (bounced cheques excluded)  */
  pulled?: number;
  pulledAmount?: number;
  /** Approved or done in Priority  */
  matched?: number;
  matchedAmount?: number;
  /** Have a proposal waiting for a person  */
  waitingDecision?: number;
  /** pulled - matched  */
  toMatch?: number;
  toMatchAmount?: number;
  unidentified?: number;
  /** Not checked yet (ממתינה לבדיקה) or file not verified  */
  notChecked?: number;
  bounced?: number;
  /** One Hebrew sentence  */
  summary?: string;
}

/**
 * GetWeekBrief output payload
 */
export interface IGetWeekBriefActionOutput {
  /** YYYY-MM-DD  */
  asOfDate?: string;
  /** Latest Invoices.syncedAt (ISO) or null  */
  dataAsOf?: string;
  week?: IGetWeekBriefActionOutputWeekObject;
  aging?: IGetWeekBriefActionOutputAgingObject;
  receipts?: IGetWeekBriefActionOutputReceiptsObject;
}

/**
 * GetWeekBriefAction
 * Execute code action
 */
export const GetWeekBriefAction = {
  actionBlockId: "GetWeekBrief",

  inputInstanceType: {} as IGetWeekBriefActionInput,
  outputInstanceType: {} as IGetWeekBriefActionOutput,
} as const;

/**
 * IdentifyCustomers input payload
 */
export interface IIdentifyCustomersActionInput {
  /** The lines to identify. Empty = every line of importBatchId, else every line of today's pulls / confirmed files still without an approved receipt  */
  bankLineIds?: string[];
  /** ImportBatches row id: identify the lines of this pull / file  */
  importBatchId?: string;
  /** Default true: only report what would be written (default: true) */
  dryRun?: boolean;
  /** Display name of the person (or the run) that started it  */
  checkedBy?: string;
  /** Clock for tests: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IIdentifyCustomersActionOutputCountsObject {
  lines?: number;
  certain?: number;
  uncertain?: number;
  unidentified?: number;
  /** Not money-in, bounced cheque, or receipt already approved  */
  skipped?: number;
  autoApproved?: number;
}

/**
 * undefined
 */
export interface IIdentifyCustomersActionOutputIdentifyCustomersActionOutputCandidatesItemObject {
  customerCode?: string;
  customerName?: string;
  confidence?: number;
  method?: string;
}

/**
 * undefined
 */
export interface IIdentifyCustomersActionOutputIdentifyCustomersActionOutputLinesItemObject {
  bankLineId?: string;
  payerName?: string;
  amount?: number;
  valueDate?: string;
  customerCode?: string;
  customerName?: string;
  confidence?: number;
  /** ודאי / לא ודאי / לא זוהה / אושר אוטומטית, or empty when skipped  */
  identifyStatus?: string;
  /** The rung that identified it (ח״פ / כינוי / שם זהה / איש קשר / מייל / שם חלקי / דו-משמעי)  */
  method?: string;
  /** One Hebrew line: why  */
  evidence?: string;
  candidates?: IIdentifyCustomersActionOutputIdentifyCustomersActionOutputCandidatesItemObject[];
  receiptKey?: string;
  skippedReason?: string;
  taskKey?: string;
}

/**
 * undefined
 */
export interface IIdentifyCustomersActionOutputTaskSyncObject {}

/**
 * IdentifyCustomers output payload
 */
export interface IIdentifyCustomersActionOutput {
  ok?: boolean;
  dryRun?: boolean;
  /** identifyCertainAt used  */
  certainAt?: number;
  /** customerAutoApproveAt used; absent = off  */
  autoApproveAt?: number;
  counts?: IIdentifyCustomersActionOutputCountsObject;
  lines?: IIdentifyCustomersActionOutputIdentifyCustomersActionOutputLinesItemObject[];
  writeVerified?: boolean;
  taskSync?: IIdentifyCustomersActionOutputTaskSyncObject;
  errors?: string[];
}

/**
 * IdentifyCustomersAction
 * Execute code action
 */
export const IdentifyCustomersAction = {
  actionBlockId: "IdentifyCustomers",

  inputInstanceType: {} as IIdentifyCustomersActionInput,
  outputInstanceType: {} as IIdentifyCustomersActionOutput,
} as const;

export type ImportPriorityFileActionInputKindEnum =
  | "דוח גיול"
  | "קובץ בנק"
  | "חשבוניות פתוחות"
  | "כרטיסי לקוח"
  | "אנשי קשר";

/**
 * ImportPriorityFile input payload
 */
export interface IImportPriorityFileActionInput {
  /** File kind; only קובץ בנק is active  */
  kind: ImportPriorityFileActionInputKindEnum;
  /** Original file name  */
  fileName: string;
  /** Full file content as text (UTF-8, BOM allowed)  */
  csvText: string;
  /** Display name of the person uploading  */
  uploadedBy?: string;
  /** Bank day the file covers (YYYY-MM-DD). Defaults to the latest valueDate in the file  */
  dataDate?: string;
  /** When true, only report what would be written; nothing changes (default: true) */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IImportPriorityFileActionOutputImportPriorityFileActionOutputToWriteItemObject {}

/**
 * undefined
 */
export interface IImportPriorityFileActionOutputImportPriorityFileActionOutputSkippedExistingItemObject {}

/**
 * undefined
 */
export interface IImportPriorityFileActionOutputImportPriorityFileActionOutputRowErrorsItemObject {}

/**
 * undefined
 */
export interface IImportPriorityFileActionOutputImportBatchObject {}

/**
 * undefined
 */
export interface IImportPriorityFileActionOutputVerifyDetailsObject {}

/**
 * ImportPriorityFile output payload
 */
export interface IImportPriorityFileActionOutput {
  dryRun?: boolean;
  kind?: string;
  fileName?: string;
  dataDate?: string;
  isTestFile?: boolean;
  expectedColumns?: string[];
  rowsRead?: number;
  /** BankLines rows that will be (or were) written  */
  toWrite?: IImportPriorityFileActionOutputImportPriorityFileActionOutputToWriteItemObject[];
  /** Rows whose bankLineId already exists (not rewritten)  */
  skippedExisting?: IImportPriorityFileActionOutputImportPriorityFileActionOutputSkippedExistingItemObject[];
  /** { row, error } per rejected row, Hebrew messages  */
  rowErrors?: IImportPriorityFileActionOutputImportPriorityFileActionOutputRowErrorsItemObject[];
  importBatch?: IImportPriorityFileActionOutputImportBatchObject;
  /** True only when every written row was read back and the counts match the plan  */
  writeVerified?: boolean;
  verifyDetails?: IImportPriorityFileActionOutputVerifyDetailsObject;
  errors?: string[];
}

/**
 * ImportPriorityFileAction
 * Execute code action
 */
export const ImportPriorityFileAction = {
  actionBlockId: "ImportPriorityFile",

  inputInstanceType: {} as IImportPriorityFileActionInput,
  outputInstanceType: {} as IImportPriorityFileActionOutput,
} as const;

export type IssueReceiptActionInputModeEnum = "certain" | "one";

/**
 * IssueReceipt input payload
 */
export interface IIssueReceiptActionInput {
  /** certain = approve all certain lines given; one = one line with a confirmed / picked customer  */
  mode: IssueReceiptActionInputModeEnum;
  /** The lines (mode one: exactly one)  */
  bankLineIds: string[];
  /** Mode one: the customer the person confirmed or picked. Required unless the line's draft is certain  */
  customerCode?: string;
  /** Display name of the person  */
  approvedBy?: string;
  /** Only report what would be written  */
  dryRun?: boolean;
  /** Clock for tests: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IIssueReceiptActionOutputIssueReceiptActionOutputIssuedItemObject {
  bankLineId?: string;
  receiptKey?: string;
  customerCode?: string;
  customerName?: string;
  amount?: number;
  identifyStatus?: string;
  sendStatus?: string;
  sentToEmail?: string;
  /** The mail draft (Approvals.id), empty when no contact  */
  approvalId?: string;
  pdfUrl?: string;
  aliasSaved?: boolean;
  /** missing-ap:<customerCode> when a contact is missing  */
  taskKey?: string;
}

/**
 * undefined
 */
export interface IIssueReceiptActionOutputIssueReceiptActionOutputSkippedItemObject {
  bankLineId?: string;
  reason?: string;
}

/**
 * undefined
 */
export interface IIssueReceiptActionOutputTaskSyncObject {}

/**
 * The debt check run right after the approval (CheckDebt output: ok, results[], alerts, tasks, writeVerified, errors). issued[] / skipped[] items also carry debtCheckResult, debtCheckMonths and debtTaskKey.
 */
export interface IIssueReceiptActionOutputDebtCheckObject {}

/**
 * undefined
 */
export interface IIssueReceiptActionOutputIssueReceiptActionOutputAllocationItemObject {}

/**
 * IssueReceipt output payload
 */
export interface IIssueReceiptActionOutput {
  ok?: boolean;
  dryRun?: boolean;
  issued?: IIssueReceiptActionOutputIssueReceiptActionOutputIssuedItemObject[];
  skipped?: IIssueReceiptActionOutputIssueReceiptActionOutputSkippedItemObject[];
  writeVerified?: boolean;
  taskSync?: IIssueReceiptActionOutputTaskSyncObject;
  errors?: string[];
  /** The debt check run right after the approval (CheckDebt output: ok, results[], alerts, tasks, writeVerified, errors). issued[] / skipped[] items also carry debtCheckResult, debtCheckMonths and debtTaskKey.  */
  debtCheck?: IIssueReceiptActionOutputDebtCheckObject;
  /** Per receipt whose debt check was decided: { receiptKey, ok, allocationConfidence, proposedTotal, surplus, autoApplied, matchStatus, taskKey, alreadyAllocated }  */
  allocation?: IIssueReceiptActionOutputIssueReceiptActionOutputAllocationItemObject[];
}

/**
 * IssueReceiptAction
 * Execute code action
 */
export const IssueReceiptAction = {
  actionBlockId: "IssueReceipt",

  inputInstanceType: {} as IIssueReceiptActionInput,
  outputInstanceType: {} as IIssueReceiptActionOutput,
} as const;

export type MarkPriceApprovalActionInputStepEnum = "סוכן אישר" | "מנהל אישר";

/**
 * MarkPriceApproval input payload
 */
export interface IMarkPriceApprovalActionInput {
  disputeId: string;
  step: MarkPriceApprovalActionInputStepEnum;
  /** Pasted approval email text or a link. Mandatory  */
  evidence: string;
  /** Optional InboundEmails row the evidence came from  */
  evidenceInboundEmailId?: string;
  /** Display name of the bookkeeper marking  */
  markedBy: string;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IMarkPriceApprovalActionOutputDisputeObject {}

/**
 * MarkPriceApproval output payload
 */
export interface IMarkPriceApprovalActionOutput {
  dryRun?: boolean;
  refused?: boolean;
  reason?: string;
  dispute?: IMarkPriceApprovalActionOutputDisputeObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * MarkPriceApprovalAction
 * Execute code action
 */
export const MarkPriceApprovalAction = {
  actionBlockId: "MarkPriceApproval",

  inputInstanceType: {} as IMarkPriceApprovalActionInput,
  outputInstanceType: {} as IMarkPriceApprovalActionOutput,
} as const;

/**
 * PrepareOpenDebtsBatch input payload
 */
export interface IPrepareOpenDebtsBatchActionInput {
  /** Default today in Asia/Jerusalem  */
  asOfDate?: string;
  /** Deprecated and ignored (the schedule is in MailAutomations)  */
  scheduled?: boolean;
  /** Who pressed הכנת מנה עכשיו  */
  requestedBy?: string;
  /** When true, only list eligible and excluded customers; no PDFs, nothing written (default: true) */
  dryRun?: boolean;
  /** Only these customers; empty = all with a debit balance  */
  customerCodes?: string[];
  /** Subject template with {{variables}}  */
  subjectTemplate?: string;
  /** Body template with {{variables}}  */
  bodyTemplate?: string;
  /** MailAutomations row id, stored on the drafts and the run  */
  automationId?: string;
  /** Mailboxes row id for the drafts  */
  mailboxId?: string;
}

/**
 * undefined
 */
export interface IPrepareOpenDebtsBatchActionOutputPrepareOpenDebtsBatchActionOutputEligibleItemObject {}

/**
 * undefined
 */
export interface IPrepareOpenDebtsBatchActionOutputPrepareOpenDebtsBatchActionOutputExcludedItemObject {}

/**
 * undefined
 */
export interface IPrepareOpenDebtsBatchActionOutputPrepareOpenDebtsBatchActionOutputDraftsCreatedItemObject {}

/**
 * PrepareOpenDebtsBatch output payload
 */
export interface IPrepareOpenDebtsBatchActionOutput {
  dryRun?: boolean;
  skipped?: boolean;
  skipReason?: string;
  asOfDate?: string;
  batchId?: string;
  eligible?: IPrepareOpenDebtsBatchActionOutputPrepareOpenDebtsBatchActionOutputEligibleItemObject[];
  /** { customerCode, customerName, reason, balance }  */
  excluded?: IPrepareOpenDebtsBatchActionOutputPrepareOpenDebtsBatchActionOutputExcludedItemObject[];
  draftsCreated?: IPrepareOpenDebtsBatchActionOutputPrepareOpenDebtsBatchActionOutputDraftsCreatedItemObject[];
  draftsReplaced?: number;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * PrepareOpenDebtsBatchAction
 * Execute code action
 */
export const PrepareOpenDebtsBatchAction = {
  actionBlockId: "PrepareOpenDebtsBatch",

  inputInstanceType: {} as IPrepareOpenDebtsBatchActionInput,
  outputInstanceType: {} as IPrepareOpenDebtsBatchActionOutput,
} as const;

/**
 * ProposeAllocation input payload
 */
export interface IProposeAllocationActionInput {
  receiptKey: string;
  dryRun?: boolean;
  asOfDate?: string;
}

/**
 * undefined
 */
export interface IProposeAllocationActionOutputProposeAllocationActionOutputMonthsItemObject {}

/**
 * undefined
 */
export interface IProposeAllocationActionOutputProposeAllocationActionOutputProposalItemObject {}

/**
 * ApplyAllocation's output when auto-applied
 */
export interface IProposeAllocationActionOutputApplyObject {}

/**
 * undefined
 */
export interface IProposeAllocationActionOutputProposeAllocationActionOutputCurrentItemObject {}

/**
 * ProposeAllocation output payload
 */
export interface IProposeAllocationActionOutput {
  ok?: boolean;
  dryRun?: boolean;
  receiptKey?: string;
  customerCode?: string;
  customerName?: string;
  /** Receipt amount  */
  amount?: number;
  debtCheckResult?: string;
  /** Due months the debt check closed (YYYY-MM); the proposal starts there  */
  closedMonths?: string[];
  /** { dueMonth (YYYY-MM, '' = no due date), monthLabel, closedByDebtCheck, openTotal, invoices[{ invoiceNumber, invoiceDate, dueDate, invoiceAmount, openInPriority, allocatedByOthers, otherReceipts[{receiptKey, amount}], openBefore (the max that can be allocated), proposed (0 when not proposed), isPartial, current (this receipt's current allocation, 0 if none) }] }, oldest first  */
  months?: IProposeAllocationActionOutputProposeAllocationActionOutputMonthsItemObject[];
  /** [{ invoiceNumber, amount, isPartial }] in allocation order – ready to send to ApplyAllocation  */
  proposal?: IProposeAllocationActionOutputProposeAllocationActionOutputProposalItemObject[];
  proposedTotal?: number;
  /** Credit on account beyond the open invoices  */
  surplus?: number;
  /** Sum of the customer's open balances  */
  openTotal?: number;
  allocationConfidence?: number;
  /** allocationAutoApproveAt; null = OFF  */
  autoApproveAt?: number;
  wouldAutoApply?: boolean;
  autoApplied?: boolean;
  /** ApplyAllocation's output when auto-applied  */
  apply?: IProposeAllocationActionOutputApplyObject;
  alreadyAllocated?: boolean;
  /** The receipt's current allocation [{ invoiceNumber, amount }]  */
  current?: IProposeAllocationActionOutputProposeAllocationActionOutputCurrentItemObject[];
  matchStatus?: string;
  taskKey?: string;
  taskChange?: string;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * ProposeAllocationAction
 * Execute code action
 */
export const ProposeAllocationAction = {
  actionBlockId: "ProposeAllocation",

  inputInstanceType: {} as IProposeAllocationActionInput,
  outputInstanceType: {} as IProposeAllocationActionOutput,
} as const;

/**
 * ProposeInsuranceRequests input payload
 */
export interface IProposeInsuranceRequestsActionInput {
  /** YYYY-MM-DD, default today in Israel  */
  asOfDate?: string;
  /** Optional: check only these customers  */
  customerCodes?: string[];
  /** Who asked for the check (the signed-in person's display name)  */
  proposedBy?: string;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IProposeInsuranceRequestsActionOutputProposeInsuranceRequestsActionOutputCustomersItemObject {}

/**
 * undefined
 */
export interface IProposeInsuranceRequestsActionOutputProposeInsuranceRequestsActionOutputProposalsItemObject {}

/**
 * ProposeInsuranceRequests output payload
 */
export interface IProposeInsuranceRequestsActionOutput {
  dryRun?: boolean;
  asOfDate?: string;
  thresholdPct?: number;
  increasePct?: number;
  checked?: number;
  /** Every insured customer checked: code, name, insured limit, obligo, use %, outcome (הוצעה, מתחת לסף, יש בקשה פתוחה, אין מסגרת מבוטחת)  */
  customers?: IProposeInsuranceRequestsActionOutputProposeInsuranceRequestsActionOutputCustomersItemObject[];
  /** The CreditLimitRequests rows (written, or that would be written on dryRun)  */
  proposals?: IProposeInsuranceRequestsActionOutputProposeInsuranceRequestsActionOutputProposalsItemObject[];
  created?: number;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * ProposeInsuranceRequestsAction
 * Execute code action
 */
export const ProposeInsuranceRequestsAction = {
  actionBlockId: "ProposeInsuranceRequests",

  inputInstanceType: {} as IProposeInsuranceRequestsActionInput,
  outputInstanceType: {} as IProposeInsuranceRequestsActionOutput,
} as const;

/**
 * PullAgentReceipts input payload
 */
export interface IPullAgentReceiptsActionInput {
  /** The run's day (Israel); default today  */
  asOfDate?: string;
  /** How many days back of paymentDate to read (0–365) (default: 14) */
  sinceDays?: number;
  /** Report only, write nothing  */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IPullAgentReceiptsActionOutputPullAgentReceiptsActionOutputReceiptsItemObject {
  paymentRef?: string;
  receiptKey?: string;
  customerCode?: string;
  customerName?: string;
  amount?: number;
  method?: string;
  paymentDate?: string;
  checkDueDate?: any;
  collectedBy?: string;
  priorityReceiptNumber?: any;
  /** נוצרה / נבדקה שוב / קיימת / דולגה / נכשלה  */
  status?: string;
  skippedReason?: string;
  debtCheckResult?: any;
  debtCheckMonths?: any;
  debtTaskKey?: any;
  explanation?: any;
  allocationConfidence?: any;
  autoAllocated?: boolean;
  matchStatus?: string;
  allocateTaskKey?: any;
  paidMonths?: string[];
  notesClosed?: string[];
}

/**
 * undefined
 */
export interface IPullAgentReceiptsActionOutputPullAgentReceiptsActionOutputNotesKeptItemObject {
  noteId?: string;
  reason?: string;
}

/**
 * PullAgentReceipts output payload
 */
export interface IPullAgentReceiptsActionOutput {
  ok?: boolean;
  dryRun?: boolean;
  asOfDate?: string;
  sinceDate?: string;
  /** Agent cheques in the window  */
  found?: number;
  /** Receipts created now (dryRun: would be created)  */
  created?: number;
  /** Already handled or missing details  */
  skipped?: number;
  /** Existing agent receipts whose missing debt check ran now  */
  rechecked?: number;
  receipts?: IPullAgentReceiptsActionOutputPullAgentReceiptsActionOutputReceiptsItemObject[];
  /** CustomerNotes ids closed  */
  notesClosed?: string[];
  notesKept?: IPullAgentReceiptsActionOutputPullAgentReceiptsActionOutputNotesKeptItemObject[];
  writeVerified?: boolean;
  errors?: string[];
  /** One Hebrew sentence for a toast  */
  summary?: string;
}

/**
 * PullAgentReceiptsAction
 * Execute code action
 */
export const PullAgentReceiptsAction = {
  actionBlockId: "PullAgentReceipts",

  inputInstanceType: {} as IPullAgentReceiptsActionInput,
  outputInstanceType: {} as IPullAgentReceiptsActionOutput,
} as const;

/**
 * ReadBankFile input payload
 */
export interface IReadBankFileActionInput {
  /** Uploaded file url  */
  fileUrl: string;
  /** Original file name  */
  fileName: string;
  /** File size in bytes  */
  fileSize?: number;
  /** MIME type  */
  fileType?: string;
  /** For spreadsheets (CSV/Excel): the sheet rendered as text by the browser, so the reader sees every cell. Empty for PDF and images.  */
  fileText?: string;
  /** Display name of the person uploading  */
  uploadedBy?: string;
  /** Retry an existing failed batch  */
  importBatchId?: string;
  /** Clock for tests: YYYY-MM-DD  */
  asOfDate?: string;
}

/**
 * ReadBankFile output payload
 */
export interface IReadBankFileActionOutput {
  importBatchId?: string;
  workDay?: string;
  isDuplicate?: boolean;
  shouldRead?: boolean;
  extractionStatus?: string;
  errors?: string[];
}

/**
 * ReadBankFileAction
 * Reads an uploaded bank file on the receipts screen: CreateImportBatch (batch בקריאה), then the nameless reader agent BankFileReader reads the attached file (PDF, Excel, CSV or image) into structured lines, then WriteExtractedLines checks totals, required fields and duplicates and writes BankLines (חדשה / ממתינה לבדיקה) and the batch (נקרא – לאימות or נכשל). Returns the batch; the screen then reads ImportBatches and BankLines. Nothing is matched yet and nothing is written to Priority.
 */
export const ReadBankFileAction = {
  actionBlockId: "ReadBankFile",

  inputInstanceType: {} as IReadBankFileActionInput,
  outputInstanceType: {} as IReadBankFileActionOutput,
} as const;

export type ReadInvoiceLinesLiveActionInputFormEnum = "CINVOICES" | "AINVOICES";

/**
 * ReadInvoiceLinesLive input payload
 */
export interface IReadInvoiceLinesLiveActionInput {
  /** Priority IVNUM  */
  invoiceNumber: string;
  /** Invoice form (default: "CINVOICES") */
  form?: ReadInvoiceLinesLiveActionInputFormEnum;
}

/**
 * undefined
 */
export interface IReadInvoiceLinesLiveActionOutputReadInvoiceLinesLiveActionOutputLinesItemObject {}

/**
 * ReadInvoiceLinesLive output payload
 */
export interface IReadInvoiceLinesLiveActionOutput {
  /** The InvoiceLines rows written  */
  lines?: IReadInvoiceLinesLiveActionOutputReadInvoiceLinesLiveActionOutputLinesItemObject[];
  readAt?: string;
  /** Set when Priority could not be read; lines then holds the mirror's last copy  */
  error?: string;
}

/**
 * ReadInvoiceLinesLiveAction
 * Execute code action
 */
export const ReadInvoiceLinesLiveAction = {
  actionBlockId: "ReadInvoiceLinesLive",

  inputInstanceType: {} as IReadInvoiceLinesLiveActionInput,
  outputInstanceType: {} as IReadInvoiceLinesLiveActionOutput,
} as const;

export type RecordAgentFeedbackActionInputAgentNameEnum =
  | "BankFileReader"
  | "CollectionsAgent";

export type RecordAgentFeedbackActionInputVerdictEnum = "צדק" | "טעה" | "הערה";

/**
 * RecordAgentFeedback input payload
 */
export interface IRecordAgentFeedbackActionInput {
  /** Agent  */
  agentName: RecordAgentFeedbackActionInputAgentNameEnum;
  /** ImportBatches row id  */
  importBatchId?: string;
  /** BankLines.bankLineId; empty for the whole file  */
  bankLineId?: string;
  /** Verdict  */
  verdict: RecordAgentFeedbackActionInputVerdictEnum;
  /** Field: valueDate, amount, payerName, reference, lineType, customer, invoices  */
  field?: string;
  /** What the agent gave  */
  valueGiven?: string;
  /** The correct value  */
  valueCorrect?: string;
  /** Free note  */
  comment?: string;
  /** For BankFileReader + טעה: also correct the line field to valueCorrect (default: true) */
  applyCorrection?: boolean;
  /** Display name of the person  */
  byName: string;
  /** Their email  */
  byEmail?: string;
  /** When true, only report what would be written; nothing changes  */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IRecordAgentFeedbackActionOutputBatchObject {
  extractedLineCount?: number;
  extractedTotal?: number;
  totalsCheck?: string;
}

/**
 * RecordAgentFeedback output payload
 */
export interface IRecordAgentFeedbackActionOutput {
  feedbackId?: string;
  replacedId?: string;
  lineUpdated?: boolean;
  batch?: IRecordAgentFeedbackActionOutputBatchObject;
  errors?: string[];
}

/**
 * RecordAgentFeedbackAction
 * Execute code action
 */
export const RecordAgentFeedbackAction = {
  actionBlockId: "RecordAgentFeedback",

  inputInstanceType: {} as IRecordAgentFeedbackActionInput,
  outputInstanceType: {} as IRecordAgentFeedbackActionOutput,
} as const;

/**
 * RefreshInvoiceLayer input payload
 */
export interface IRefreshInvoiceLayerActionInput {
  /** Only these invoices  */
  invoiceNumbers?: string[];
  /** Only these customers' invoices  */
  customerCodes?: string[];
  /** When true (default), only report what would change (default: true) */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IRefreshInvoiceLayerActionOutputRefreshInvoiceLayerActionOutputChangesItemObject {}

/**
 * RefreshInvoiceLayer output payload
 */
export interface IRefreshInvoiceLayerActionOutput {
  dryRun?: boolean;
  invoicesChecked?: number;
  invoicesChanged?: number;
  /** {invoiceNumber, fields} for every invoice that changes  */
  changes?: IRefreshInvoiceLayerActionOutputRefreshInvoiceLayerActionOutputChangesItemObject[];
  /** True only when every written row was read back with the new values  */
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * RefreshInvoiceLayerAction
 * Execute code action
 */
export const RefreshInvoiceLayerAction = {
  actionBlockId: "RefreshInvoiceLayer",

  inputInstanceType: {} as IRefreshInvoiceLayerActionInput,
  outputInstanceType: {} as IRefreshInvoiceLayerActionOutput,
} as const;

export type RunDayScheduleActionInputModeEnum = "מתוזמן" | "ידני";

export type RunDayScheduleActionInputBankScenarioEnum = "יום מלא" | "יום ריק";

/**
 * RunDaySchedule input payload
 */
export interface IRunDayScheduleActionInput {
  /** מתוזמן = hourly DayRunner; ידני = the button, runs the 06:00 phase now (default: "ידני") */
  mode?: RunDayScheduleActionInputModeEnum;
  /** Default true: only report what would run and be written (default: true) */
  dryRun?: boolean;
  /** Testing: the day, YYYY-MM-DD (default today, Asia/Jerusalem)  */
  asOfDate?: string;
  /** Testing: HH:MM clock (default now, Asia/Jerusalem)  */
  asOfTime?: string;
  /** Test source only: whether the bank statement is in Priority today (passed to the bank-lines test source) (default: "יום מלא") */
  bankScenario?: RunDayScheduleActionInputBankScenarioEnum;
}

/**
 * The hours as read
 */
export interface IRunDayScheduleActionOutputSettingsObject {}

/**
 * undefined
 */
export interface IRunDayScheduleActionOutputRunDayScheduleActionOutputStepsItemObject {}

/**
 * undefined
 */
export interface IRunDayScheduleActionOutputRunDayScheduleActionOutputRanItemObject {
  phase?: string;
  ok?: boolean;
  importBatchId?: string;
  steps?: IRunDayScheduleActionOutputRunDayScheduleActionOutputStepsItemObject[];
}

/**
 * {action: open / close / none, taskKey}
 */
export interface IRunDayScheduleActionOutputFailedTaskObject {}

/**
 * {phase, loaded, linesFound, receiptsRun, commitments, urgentTask: open / close / none}
 */
export interface IRunDayScheduleActionOutputBankCheckObject {}

/**
 * RunDaySchedule output payload
 */
export interface IRunDayScheduleActionOutput {
  ok?: boolean;
  dryRun?: boolean;
  mode?: string;
  asOfDate?: string;
  asOfTime?: string;
  /** The hours as read  */
  settings?: IRunDayScheduleActionOutputSettingsObject;
  settingsCreated?: string[];
  /** Phases due now  */
  due?: string[];
  alreadyRan?: string[];
  ran?: IRunDayScheduleActionOutputRunDayScheduleActionOutputRanItemObject[];
  /** Phases not built yet (empty since stage 2)  */
  notBuiltYet?: string[];
  /** When the 06:00 phase finished (for "נמשך מפריוריטי ב-HH:MM")  */
  pulledAt?: string;
  /** {action: open / close / none, taskKey}  */
  failedTask?: IRunDayScheduleActionOutputFailedTaskObject;
  errors?: string[];
  /** {phase, loaded, linesFound, receiptsRun, commitments, urgentTask: open / close / none}  */
  bankCheck?: IRunDayScheduleActionOutputBankCheckObject;
}

/**
 * RunDayScheduleAction
 * Execute code action
 */
export const RunDayScheduleAction = {
  actionBlockId: "RunDaySchedule",

  inputInstanceType: {} as IRunDayScheduleActionInput,
  outputInstanceType: {} as IRunDayScheduleActionOutput,
} as const;

export type RunMailAutomationActionInputTriggerEnum = "מתוזמן" | "ידני";

/**
 * RunMailAutomation input payload
 */
export interface IRunMailAutomationActionInput {
  /** MailAutomations row id  */
  automationId: string;
  /** true = preview only, nothing written (default: true) */
  dryRun?: boolean;
  /**  (default: "ידני") */
  trigger?: RunMailAutomationActionInputTriggerEnum;
  /** Display name of who pressed הרץ עכשיו  */
  requestedBy?: string;
  /** Default today in Asia/Jerusalem  */
  asOfDate?: string;
  /** Customer to render the preview for (dryRun)  */
  previewCustomerCode?: string;
  /** Template to use instead of the saved subject, this run only  */
  subjectOverride?: string;
  /** Template to use instead of the saved body, this run only  */
  bodyOverride?: string;
}

/**
 * undefined
 */
export interface IRunMailAutomationActionOutputRunMailAutomationActionOutputEligibleItemObject {}

/**
 * undefined
 */
export interface IRunMailAutomationActionOutputRunMailAutomationActionOutputExcludedItemObject {}

/**
 * { customerCode, to, subject, body, pdfUrl }
 */
export interface IRunMailAutomationActionOutputPreviewObject {}

/**
 * RunMailAutomation output payload
 */
export interface IRunMailAutomationActionOutput {
  dryRun?: boolean;
  automationName?: string;
  batchId?: string;
  /** { customerCode, customerName, contactName, contactEmail, openTotal, bookkeeperName }  */
  eligible?: IRunMailAutomationActionOutputRunMailAutomationActionOutputEligibleItemObject[];
  /** { customerCode, customerName, reason }  */
  excluded?: IRunMailAutomationActionOutputRunMailAutomationActionOutputExcludedItemObject[];
  /** { customerCode, to, subject, body, pdfUrl }  */
  preview?: IRunMailAutomationActionOutputPreviewObject;
  draftsCreated?: number;
  runId?: string;
  /** Hebrew one-liner  */
  summary?: string;
  errors?: string[];
}

/**
 * RunMailAutomationAction
 * Execute code action
 */
export const RunMailAutomationAction = {
  actionBlockId: "RunMailAutomation",

  inputInstanceType: {} as IRunMailAutomationActionInput,
  outputInstanceType: {} as IRunMailAutomationActionOutput,
} as const;

export type SetEmailHandlingActionInputStateEnum = "לא טופל" | "ממתין" | "טופל";

/**
 * SetEmailHandling input payload
 */
export interface ISetEmailHandlingActionInput {
  /** InboundEmails row ids  */
  inboundEmailIds: string[];
  state: SetEmailHandlingActionInputStateEnum;
  /** Required for ממתין: who we wait for  */
  waitingFor?: string;
  /** Display name of the person changing the state  */
  by?: string;
}

/**
 * undefined
 */
export interface ISetEmailHandlingActionOutputSetEmailHandlingActionOutputEmailsItemObject {}

/**
 * SetEmailHandling output payload
 */
export interface ISetEmailHandlingActionOutput {
  updated?: number;
  emails?: ISetEmailHandlingActionOutputSetEmailHandlingActionOutputEmailsItemObject[];
  errors?: string[];
}

/**
 * SetEmailHandlingAction
 * Execute code action
 */
export const SetEmailHandlingAction = {
  actionBlockId: "SetEmailHandling",

  inputInstanceType: {} as ISetEmailHandlingActionInput,
  outputInstanceType: {} as ISetEmailHandlingActionOutput,
} as const;

export type SyncFromBrainActionInputSyncFromBrainActionInputTablesItemEnum =
  | "customers"
  | "invoices";

export type SyncFromBrainActionInputTriggerEnum =
  | "מתוזמן"
  | "ידני"
  | "אחרי כתיבה";

/**
 * Continue an invoice read that hit the time budget: {runId, CINVOICES:lastKey, AINVOICES:lastKey} from the previous output
 */
export interface ISyncFromBrainActionInputResumeFromObject {}

/**
 * SyncFromBrain input payload
 */
export interface ISyncFromBrainActionInput {
  /** When true, read and compare only; write nothing except the SyncRuns row (default: true) */
  dryRun?: boolean;
  /** Which tables to sync (default both)  */
  tables?: SyncFromBrainActionInputSyncFromBrainActionInputTablesItemEnum[];
  /** What started the run (default ידני)  */
  trigger?: SyncFromBrainActionInputTriggerEnum;
  /** Continue an invoice read that hit the time budget: {runId, CINVOICES:lastKey, AINVOICES:lastKey} from the previous output  */
  resumeFrom?: ISyncFromBrainActionInputResumeFromObject;
}

/**
 * undefined
 */
export interface ISyncFromBrainActionOutputSyncFromBrainActionOutputPerTableItemObject {}

/**
 * Summary of the RefreshInvoiceLayer run
 */
export interface ISyncFromBrainActionOutputRefreshInvoiceLayerObject {}

/**
 * Set when invoices stopped at the 12-minute budget: pass it back as input to continue; null when complete
 */
export interface ISyncFromBrainActionOutputResumeFromObject {}

/**
 * SyncFromBrain output payload
 */
export interface ISyncFromBrainActionOutput {
  runId?: string;
  dryRun?: boolean;
  /** רץ | הצליח | הצליח חלקית | נעצר בשער | נכשל  */
  status?: string;
  /** ISO time the Brain data is considered current as of  */
  brainDataAsOf?: string;
  /** brain-last-run | last-scheduled-run  */
  brainDataAsOfSource?: string;
  /** {table, sourceTable (per-form read/count, e.g. 'CINVOICES 42177/42177 + AINVOICES 36/36'), sourceRows, expectedRows (SELECT COUNT(*); invoices = sum of both forms), lastRunSourceRows, inserted, updated, unchanged, skippedNewerInApp, markedDeletedInSource, writeVerified, gate, blocked, error ('incomplete read: …' when rows read != expectedRows)} per table  */
  perTable?: ISyncFromBrainActionOutputSyncFromBrainActionOutputPerTableItemObject[];
  /** Summary of the RefreshInvoiceLayer run  */
  refreshInvoiceLayer?: ISyncFromBrainActionOutputRefreshInvoiceLayerObject;
  errors?: string[];
  /** Set when invoices stopped at the 12-minute budget: pass it back as input to continue; null when complete  */
  resumeFrom?: ISyncFromBrainActionOutputResumeFromObject;
}

/**
 * SyncFromBrainAction
 * Execute code action
 */
export const SyncFromBrainAction = {
  actionBlockId: "SyncFromBrain",

  inputInstanceType: {} as ISyncFromBrainActionInput,
  outputInstanceType: {} as ISyncFromBrainActionOutput,
} as const;

export type SyncPriorityBankLinesActionInputMockScenarioEnum =
  | "יום מלא"
  | "יום ריק";

/**
 * SyncPriorityBankLines input payload
 */
export interface ISyncPriorityBankLinesActionInput {
  /** Default true: only report what would be written (default: true) */
  dryRun?: boolean;
  /** Load day, YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
  /** HH:MM clock for testing the day-not-loaded rule. Defaults to now in Asia/Jerusalem  */
  asOfTime?: string;
  /** Test source only: a full day or a day with no lines loaded yet (default: "יום מלא") */
  mockScenario?: SyncPriorityBankLinesActionInputMockScenarioEnum;
  /** Identify the customers of the new העברה / זיכוי בנק lines (IdentifyCustomers) after writing them (default: true) */
  runChecks?: boolean;
}

/**
 * {bankPollStart, bankPollEnd, bankPollInterval, receiptsReadyBy} as read from AgentSettings (null when a row is missing)
 */
export interface ISyncPriorityBankLinesActionOutputSettingsObject {}

/**
 * {העברה, זיכוי בנק, פירעון צ׳ק, אחר}: counts
 */
export interface ISyncPriorityBankLinesActionOutputByLineTypeObject {}

/**
 * undefined
 */
export interface ISyncPriorityBankLinesActionOutputSyncPriorityBankLinesActionOutputLinesItemObject {}

/**
 * undefined
 */
export interface ISyncPriorityBankLinesActionOutputSyncPriorityBankLinesActionOutputCheckedItemObject {}

/**
 * IdentifyCustomers summary: counts (lines, certain, uncertain, unidentified, skipped, autoApproved), certainAt, errors
 */
export interface ISyncPriorityBankLinesActionOutputIdentifyObject {}

/**
 * {action: open / close / none, taskKey, reason}
 */
export interface ISyncPriorityBankLinesActionOutputBankMissingTaskObject {}

/**
 * SyncPriorityBankLines output payload
 */
export interface ISyncPriorityBankLinesActionOutput {
  ok?: boolean;
  dryRun?: boolean;
  /** The ImportBatches row of this pull (empty on dryRun)  */
  importBatchId?: string;
  pulledAt?: string;
  asOfDate?: string;
  asOfTime?: string;
  /** priority-mock until the API is connected  */
  source?: string;
  mockScenario?: string;
  /** {bankPollStart, bankPollEnd, bankPollInterval, receiptsReadyBy} as read from AgentSettings (null when a row is missing)  */
  settings?: ISyncPriorityBankLinesActionOutputSettingsObject;
  linesFromSource?: number;
  created?: number;
  /** Older file lines that got a priorityLineId instead of a duplicate  */
  adopted?: number;
  alreadyThere?: number;
  /** {העברה, זיכוי בנק, פירעון צ׳ק, אחר}: counts  */
  byLineType?: ISyncPriorityBankLinesActionOutputByLineTypeObject;
  /** Per line: priorityLineId, bankLineId, lineType, amount, payerName, action (create / adopt / exists), willCheck  */
  lines?: ISyncPriorityBankLinesActionOutputSyncPriorityBankLinesActionOutputLinesItemObject[];
  /** Per identified line (IdentifyCustomers): bankLineId, customerCode, confidence, identifyStatus, receiptKey, taskKey  */
  checked?: ISyncPriorityBankLinesActionOutputSyncPriorityBankLinesActionOutputCheckedItemObject[];
  /** IdentifyCustomers summary: counts (lines, certain, uncertain, unidentified, skipped, autoApproved), certainAt, errors  */
  identify?: ISyncPriorityBankLinesActionOutputIdentifyObject;
  /** The AgentSettings bankLinesSource value at the time of the pull (קובץ / שורות פריוריטי)  */
  bankLinesSource?: string;
  /** {action: open / close / none, taskKey, reason}  */
  bankMissingTask?: ISyncPriorityBankLinesActionOutputBankMissingTaskObject;
  /** New lines not checked before the time limit (they stay ממתינה לבדיקה)  */
  checksLeft?: string[];
  configError?: string;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * SyncPriorityBankLinesAction
 * Execute code action
 */
export const SyncPriorityBankLinesAction = {
  actionBlockId: "SyncPriorityBankLines",

  inputInstanceType: {} as ISyncPriorityBankLinesActionInput,
  outputInstanceType: {} as ISyncPriorityBankLinesActionOutput,
} as const;

export type SyncPrioritySubformsActionInputSyncPrioritySubformsActionInputScopesItemEnum =
  "contacts" | "payments";

export type SyncPrioritySubformsActionInputTriggerEnum =
  | "מתוזמן"
  | "ידני"
  | "אחרי כתיבה";

/**
 * SyncPrioritySubforms input payload
 */
export interface ISyncPrioritySubformsActionInput {
  /** Read and compare only; write nothing except the SyncRuns row (default: true) */
  dryRun?: boolean;
  /** Default both  */
  scopes?: SyncPrioritySubformsActionInputSyncPrioritySubformsActionInputScopesItemEnum[];
  /** Continue from the saved cursor when one is open; false starts the scope over (default: true) */
  resume?: boolean;
  /** Default ידני  */
  trigger?: SyncPrioritySubformsActionInputTriggerEnum;
}

/**
 * undefined
 */
export interface ISyncPrioritySubformsActionOutputSyncPrioritySubformsActionOutputPerScopeItemObject {}

/**
 * SyncPrioritySubforms output payload
 */
export interface ISyncPrioritySubformsActionOutput {
  runId?: string;
  dryRun?: boolean;
  /** רץ | הצליח | הצליח חלקית | נעצר בשער | נכשל  */
  status?: string;
  /** {scope, mode, calls, sourceRows, inserted, updated, unchanged, skippedAppRows, markedDeletedInSource, pendingCount, complete, error}  */
  perScope?: ISyncPrioritySubformsActionOutputSyncPrioritySubformsActionOutputPerScopeItemObject[];
  /** True when a scope stopped at the time budget; call again to continue  */
  needsResume?: boolean;
  errors?: string[];
}

/**
 * SyncPrioritySubformsAction
 * Execute code action
 */
export const SyncPrioritySubformsAction = {
  actionBlockId: "SyncPrioritySubforms",

  inputInstanceType: {} as ISyncPrioritySubformsActionInput,
  outputInstanceType: {} as ISyncPrioritySubformsActionOutput,
} as const;

/**
 * UpdateCustomerNote input payload
 */
export interface IUpdateCustomerNoteActionInput {
  /** CustomerNotes id  */
  noteId: string;
  noteText?: string;
  customTypeLabel?: string;
  actionDate?: string;
  /** Empty string clears it  */
  reminderDate?: string;
  amount?: number;
  /** YYYY-MM  */
  dueMonth?: string;
  /** Close the note manually (נסגרה ידנית)  */
  close?: boolean;
  /** Reopen a manually closed note  */
  reopen?: boolean;
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IUpdateCustomerNoteActionOutputNoteObject {}

/**
 * undefined
 */
export interface IUpdateCustomerNoteActionOutputTaskSyncObject {}

/**
 * UpdateCustomerNote output payload
 */
export interface IUpdateCustomerNoteActionOutput {
  dryRun?: boolean;
  note?: IUpdateCustomerNoteActionOutputNoteObject;
  /** Column names that changed  */
  changed?: string[];
  taskSync?: IUpdateCustomerNoteActionOutputTaskSyncObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * UpdateCustomerNoteAction
 * Execute code action
 */
export const UpdateCustomerNoteAction = {
  actionBlockId: "UpdateCustomerNote",

  inputInstanceType: {} as IUpdateCustomerNoteActionInput,
  outputInstanceType: {} as IUpdateCustomerNoteActionOutput,
} as const;

/**
 * WriteBriefing input payload
 */
export interface IWriteBriefingActionInput {
  /** Clock for the demo: YYYY-MM-DD. Defaults to today in Asia/Jerusalem  */
  asOfDate?: string;
  /** The bank import that triggered it (stored as triggeredByImportId)  */
  importBatchId?: string;
  /** Only this bookkeeper (or כולם); default all audiences  */
  audience?: string;
  /** When true, only report; nothing is written  */
  dryRun?: boolean;
}

/**
 * undefined
 */
export interface IWriteBriefingActionOutputWriteBriefingActionOutputBriefingsItemObject {}

/**
 * The rows behind the numbers: certain, toReview, unidentified, waitingAllocation, bouncedChecks, promises, tasks (each with customer code and name, amount, receiptKey, receiptStatus, identifyStatus, identifyConfidence, debtCheckResult, matchStatus)
 */
export interface IWriteBriefingActionOutputItemsObject {}

/**
 * WriteBriefing output payload
 */
export interface IWriteBriefingActionOutput {
  dryRun?: boolean;
  briefingDate?: string;
  /** Per audience: { id, audience, headline, body (Hebrew markdown), counts }  */
  briefings?: IWriteBriefingActionOutputWriteBriefingActionOutputBriefingsItemObject[];
  /** The rows behind the numbers: certain, toReview, unidentified, waitingAllocation, bouncedChecks, promises, tasks (each with customer code and name, amount, receiptKey, receiptStatus, identifyStatus, identifyConfidence, debtCheckResult, matchStatus)  */
  items?: IWriteBriefingActionOutputItemsObject;
  writeVerified?: boolean;
  errors?: string[];
}

/**
 * WriteBriefingAction
 * Execute code action
 */
export const WriteBriefingAction = {
  actionBlockId: "WriteBriefing",

  inputInstanceType: {} as IWriteBriefingActionInput,
  outputInstanceType: {} as IWriteBriefingActionOutput,
} as const;

export const BankFileReaderAgent = {
  id: "BankFileReader",
  name: "BankFileReader",
  title: "קורא קובצי בנק",
  jobTitle: "קריאת קובצי בנק",
  photoUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Maya/Maya_image.png",
  avatarUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Maya/Maya_avatar.png",
} as const;

export const CollectionsAgentAgent = {
  id: "CollectionsAgent",
  name: "CollectionsAgent",
  title: "Nina",
  jobTitle: "סוכנת תקבולים",
  photoUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Nina/Nina_image.png",
  avatarUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Nina/Nina_avatar.png",
} as const;

export const CollectionsInboxAgentAgent = {
  id: "CollectionsInboxAgent",
  name: "CollectionsInboxAgent",
  title: "Maya",
  jobTitle: "סוכנת מיון מיילים",
  photoUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Maya/Maya_image.png",
  avatarUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Maya/Maya_avatar.png",
} as const;

export const CustomerCardAgentAgent = {
  id: "CustomerCardAgent",
  name: "CustomerCardAgent",
  title: "Tamar",
  jobTitle: "סוכנת כרטיס לקוח",
  photoUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Iris/Iris_image.png",
  avatarUrl:
    "https://res.cloudinary.com/blocksws/image/upload/Blocks/app-agents/Iris/Iris_avatar.png",
} as const;

export const AskMayaChatAgentChat = {
  agentChatId: "AskMayaChat",
  agentId: "CollectionsInboxAgent",
  agentHarness: undefined,
  componentIds: ["6af30b2e6221f0a7126bebf0"] as string[],
  isAdmin: false,
} as const;

export const AskNinaChatAgentChat = {
  agentChatId: "AskNinaChat",
  agentId: "CollectionsAgent",
  agentHarness: undefined,
  componentIds: ["6af30b2e6221f0a7126bebf0"] as string[],
  isAdmin: false,
} as const;

export const CustomerCardChatAgentChat = {
  agentChatId: "CustomerCardChat",
  agentId: "CustomerCardAgent",
  agentHarness: undefined,
  componentIds: ["6af30b2e6221f0a7126bebf0"] as string[],
  isAdmin: false,
} as const;

export const MayaChatAgentChat = {
  agentChatId: "MayaChat",
  agentId: "CollectionsInboxAgent",
  agentHarness: undefined,
  componentIds: ["6af30b2e6221f0a7126bebf0"] as string[],
  isAdmin: true,
} as const;

export const NinaChatAgentChat = {
  agentChatId: "NinaChat",
  agentId: "CollectionsAgent",
  agentHarness: undefined,
  componentIds: ["6af30b2e6221f0a7126bebf0"] as string[],
  isAdmin: true,
} as const;
