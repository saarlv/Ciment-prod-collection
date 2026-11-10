# Domain: B2B collections in building-materials distribution
- Customers are mostly contractors on credit terms (שוטף+N: end of month + N days). Cash customers pay up front.
- Credit exposure (אובליגו) = open receivables + open orders + undeposited postdated checks, against a credit limit usually backed by a credit insurer. Going over the limit blocks new orders in the ERP. Releasing an order or raising the limit is a credit decision.
- Postdated checks (צ׳ק דחוי) are common in Israel: a payment is received but not yet cleared.
- The top cause of late payment is invoice disputes, not unwillingness: missing or unsigned delivery notes (תעודות משלוח) per site, price disagreements, returns, and invoices waiting for customer procurement approval. Resolving one requires the right party (sales, logistics, customer procurement).
- Collection escalates stepwise: reminder → second contact → call → manager. Each step needs a wait period and a minimum days overdue and amount.
- Promises to pay (הבטחות) must be tracked and checked against actual payments; a broken promise escalates.
- Contact goes to the customer's accounts-payable person. WhatsApp is a normal business channel in Israel.
- Every contact is logged to a per-customer timeline for audit and handover.

## Cash application (קבלות והתאמות)
- The day starts with cash application: identify who paid, issue the receipt, then allocate it to invoices ("receipts before matching"). Until that is done, the aging report is wrong.
- The payer name on the bank line often differs from the customer name (a related company, an owner, a spouse). Identification is a cascade: the customer card (name, company id in the reference, a contact's full name), then the alias list, then recent emails announcing the transfer (from the customer or from the company's own sales rep), then asking the sales reps. Past payers are best kept as aliases: every confirmed match whose payer name differs from the customer becomes one, confirmed by the person who approved the match. Identification and invoice allocation are separate steps, and each needs its own evidence.
- Bank files are statements (PDF, Excel, scans). Reading them is its own error-prone step: check the extracted count and total against the statement's own summary, and keep the original beside the extracted lines for a human check.
- Allocate by invoice number from the remittance advice (it is unique). Next best is an amount that equals the sum of the invoices sharing one due date. Last is a unique single-invoice amount. Never allocate by amount when several invoices in the period share it, because the customer's open-items list then disagrees with ours.
- Large customers send remittance details by email. Without them you ask their AP team, and the request is better sent in writing than by phone.
- Bounced checks are handled first, the same morning.
- A payment is seen on the bank statement before the receipt exists in the ERP. A promise is therefore "payment seen" once a bank line is matched, and "kept" only once the receipt is posted.
- Past payer names come from earlier bank lines already allocated to the customer. ERP receipts usually don't carry the payer name.
- Bank reconciliation (amount vs amount) and customer-account matching are separate processes.

## Aging (גיול חובות)
- Collections aging is by due date, not by invoice date. The invoice-date version is balance-sheet aging.
- The ERP's aging is built from unmatched open items (open movements), not from invoices: receipts on account, partial balances and journal entries count too, so a month's total can differ from the sum of its open invoices. Matching receipts to invoices often lags, which is why collectors talk in month balances.
- Promises and other follow-up notes belong to a customer + due month and close when that month's balance reaches zero; per-invoice notes don't survive the lag in invoice matching.
- The working view is a short window of months. Everything before it folds into "prior debt" and everything after into "later debt", and the total equals the account balance. Older debt is already late, and debt that is too recent is not yet worth discussing.
- Only an issued invoice creates debt. A delivery that has not been invoiced does not count.
- Notes on the aging report are mostly payment promises. They need structure (date, amount, method, who received them) and a next-day check, because transfers appear the day after.
- A note per customer-month is too coarse: the month holds several invoices with different stories (one promised, one disputed, one waiting for a credit). Notes are best kept per invoice, with an option for one note covering all of the month's invoices. A finite set of note types covers the routine: promise to pay, customer claims already paid (date, method, cheque/transfer reference), dispute (price, missing delivery note, quantity, quality/return, not ordered), awaiting a credit note, call back on a date, handed to the sales rep, no answer, free note.
- Aging notes are evidence for cash application: a "promised" or "claims paid" note with an amount and date is often the missing link for a bank line that matched nothing, and it can decide between two invoices with the same amount. Notes are read by matching, never changed by it.
- The flow runs both ways through the invoice: a note belongs to the invoice (visible wherever the invoice is), and an approved bank match marks the invoice as paid in the working view before the ERP receipt exists, so the aging report stops chasing money already received. Once the receipt is in the ERP, the ERP's open balance takes over.
- In practice teams start with very few note types (promise, claims paid, dispute, plus free text); more types add friction without adding signal.
- Teams review aging together on a fixed cadence and split follow-ups among the bookkeepers.

## Customer statements and inquiries
- A ledger statement (כרטסת) is every movement on the account. An open-items statement (חובות פתוחים) is only the unallocated invoices. Customers request open items far more often.
- Send financial documents only to a contact registered on the customer card. An unknown requester is verified by phone first.
- Proactive monthly open-items statements go only to customers with a debit balance, after their pending receipts are allocated.
- Minimal proactive contact: a customer's AP team that gets flooded stops answering. Replies come from the named bookkeeper, not a shared address.
- A reply SLA (e.g. 24h) is the norm for financial inquiries.

## Missing delivery notes and price disputes
- Contractors require signed delivery notes for every invoiced delivery. Invoices are issued on a legal deadline, sometimes before all notes are scanned. An invoice is "complete" only when scanned notes = notes on the invoice. A missing scan is nearly always a scanning lag, not a missing delivery, so the chase goes to the logistics owner of that product line.
- Price disputes are checked against the price list in the ERP, which is the source of truth (per customer or per site), and the line's price source (order / price list / manual). A credit note requires written approval from the sales agent and then their manager, with nothing approved verbally, especially in a public company. The bookkeeper prepares a draft credit note. Automation prepares, it never closes the credit.

## Credit insurance
- Each credit customer has an insured limit from a trade-credit insurer. A new customer needs an application (company ID, amount, currency, a few fields), where a human sets the amount. For an existing customer, request an increase when exposure nears the insured limit (a utilisation threshold) instead of waiting for orders to block. The customer is not a party to the request.
- The insurer answers with the approved amount, which is then updated on the customer card in the ERP.

## Work list and promise lifecycle
- The aging report is for review and notes; the daily work happens from a prioritised task list fed by every source (overdue debt, broken promises, disputes due for follow-up, missing delivery notes, unhandled mail, unmatched receipts). One task per problem that ages until solved works better than a fresh daily list.
- Severity is a weighted score of amount and days overdue, not an AND of thresholds: a large fresh debt and a small old one must both surface, and amount usually weighs more. The same score should order both the task list and a customer's open invoices so they agree. A bounced cheque always comes first.
- A customer's open invoices are worked as "overdue plus due soon"; far-future invoices are noise until they near due.
- A promise with an amount is judged by money received against it, not by whether the invoice closed; only receipts count as payment — a credit note reduces the debt but is not the customer keeping their word.
- A cheque in process and "the customer says they paid" are both unverified-payment states, closer to a query than to plain open debt.
- A promise covers one invoice, several, or a whole month. It ends kept (paid by receipt), partly kept, broken (date passed, nothing paid, nothing moved the date) or rescheduled (a new promise before the date, or a dispute opened). The history per customer, not the latest note, is what tells a reliable payer from a chronic one and decides escalation.
- A promised invoice is still overdue but is not chased until the date passes; a disputed one is chased through the dispute, not the customer.
- Receipt before allocation: in Israel a receipt is issued when money arrives; allocation to invoices can follow as separate work ("on account" receipt). Never leave money unreceipted while matching is unclear.
- Credit-insurer limit increases are typically requested at a utilisation threshold, as a step-up on the original cover; insurer approvals arrive by email.
- Most B2B payers send no remittance advice; bank credits often carry truncated or missing payer names.
