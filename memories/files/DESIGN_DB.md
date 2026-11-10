# נתונים (DB)

The source of the cross-component Design tab "נתונים (DB)" on /collections/design (src/utils/buildDocs/designDb.ts, ?doc=db), replacing the placeholder "DB schema design". The tables and columns are NOT written by hand: `pnpm gen:db-doc` (test/tools/gen-db-doc.mjs) reads artifacts/tables/*.json and artifacts/views/*.json plus the intro and the component map below, and writes designDb.ts. Re-run it after every table or view change. This file holds only what the script cannot know: the intro, which component each table belongs to, and the relations.

**How the build docs are regenerated (since 01.11):** the generators live in test/tools/ because the platform keeps only src/** and test/** (files under scripts/ vanish on publishing). `pnpm gen:db-doc` → src/utils/buildDocs/designDb.ts (from the artifacts + this file); `pnpm gen:plan-doc` → src/utils/buildDocs/plan.ts (from memories/files/BUILDER_PLAN-full.md, word for word). The relations below are copied by hand into src/utils/buildDocs/dbRelations.ts; the ER diagram has one fixed slot per group in src/utils/buildDocs/dbDiagram.ts (MACRO / CLUSTER_COLS) — a new group needs a slot there.

## מבוא (מוצג בראש המסמך)
- כל הטבלאות לפי רכיב. לכל טבלה: מה היא, ולכל עמודה: שם, סוג, ערכים מותרים ותיאור.
- מראות של Priority (מסומנות "מראה") הן לקריאה בלבד, עם source ו-syncedAt. אף פעם לא כותבים ל-Priority.
- **קישור אמיתי ראשון (05.11):** CustomerNotes.customer ו-OpenMovements.customer מקושרים לשורת הלקוח (reference → Customers). customerCode ו-customerName נשמרים לצידם, כי הסוכנים קוראים אותם. שאר הקישורים עדיין טקסט (קוד לקוח, מספר חשבונית, id).
- **מראה מול העשרה:** טבלת מראה נכתבת רק במשיכה מ-Priority. טבלת העשרה היא שלנו. פירוט בלשונית "סנכרון עם Priority".
- נתוני בדיקה: isTestFixture=true, קודים TEST-001..029, שמות "בדיקה – ".

## שיוך לרכיבים
- **מראות Priority:** Customers, CustomerContacts, CustomerOwners, OpenMovements, Invoices, InvoiceLines, LedgerEntries, Payments, DeliveryNotes, PriceListItems, CustomerExposure, ExposureItems, CreditCovers
- **01 תקבולים:** ImportBatches, BankLines, BankAliases, MatchProposals, ReceiptCheckSteps, ReceiptAllocations, Receipts, ReceiptThreads, AgentFeedback
- **02 דוח גיול:** CustomerNotes, AgentBriefings
- **03 ביטוח אשראי:** CreditLimitRequests
- **04 פניות:** InboundEmails, EmailAttachments, Mailboxes, Approvals, MailAutomations, MailAutomationRuns, Disputes, Interactions
- **05 משימות:** CollectionQueue, CustomerDailySummaries
- **משותף והגדרות:** AgentSettings, TeamMembers, SalesAgents, ProductLineContacts
- **Views:** כל view מוצג ליד הרכיב של טבלת הבסיס שלו (OpenTasks עם 05, CustomerPromiseStats עם 02).

Any table not listed falls under "אחר" so a new table is never hidden.

## קשרים (ERD) — the arrows of the diagram view (?doc=db&view=diagram, 29.10)
No reference columns exist, so these are logical links by text key (from.column → to.key). Kept here by hand; src/utils/buildDocs/dbRelations.ts copies it. Add a line when a table gains a link column.
- **customerCode → Customers.customerCode** (n:1) from: Approvals, BankAliases, BankLines, CollectionQueue, CreditCovers, CreditLimitRequests, CustomerContacts, CustomerDailySummaries, DeliveryNotes, Disputes, ExposureItems, InboundEmails, Interactions, InvoiceLines, Invoices, LedgerEntries, MatchProposals, Payments, PriceListItems, ReceiptAllocations, ReceiptThreads, Receipts. 1:1 from CustomerExposure, CustomerOwners.
- **customer → Customers.id** (n:1, real reference since 05.11) from: CustomerNotes, OpenMovements. Drawn so it stands out as a real link; the text-key links keep their current style.
- **CollectionQueue.itemsJson[].noteIds → CustomerNotes.id** (list; a grouped task's rows).
- **ImportBatches.id ← OpenMovements.importBatchId** (the pull that wrote the movement).
- **Customers.priceListCode → PriceListItems.priceListCode** (1:n).
- **invoiceNumber → Invoices.invoiceNumber** from: InvoiceLines, DeliveryNotes, ReceiptAllocations.
- **Invoices.paidSeenBankLineIds → BankLines.bankLineId** (list).
- **bankLineId → BankLines.bankLineId** from: MatchProposals, ReceiptCheckSteps, ReceiptAllocations, ReceiptThreads, Receipts, Payments, InboundEmails, AgentFeedback; plus BankAliases.proposedFromBankLineId.seenBankLineId.
- **importBatchId → ImportBatches.id** from: BankLines, MatchProposals, ReceiptCheckSteps, Receipts, AgentFeedback; plus AgentBriefings.triggeredByImportId.
- **matchProposalId → MatchProposals.id** from: Receipts.
- **inboundEmailId → InboundEmails.id** from: EmailAttachments, Disputes, Approvals, ReceiptThreads; plus CustomerNotes.sourceEmailId, BankAliases.evidenceEmailId, MatchProposals.evidenceEmailIds (list), Approvals.lastReplyEmailId.
- **mailboxId → Mailboxes.id** from: InboundEmails, Approvals, MailAutomations.
- **MailAutomationRuns.automationId → MailAutomations.id**.
- **ReceiptThreads.approvalId → Approvals.id**.
- **Invoices.openDisputeId → Disputes.id** (the invoice layer, Design 05).
- Views: dashed line to their base table and each joined table (baseTable / joins in designDb.ts).
