# Finance model — binding definitions (since Iteration 6b, 11.11.2026; updated 6d)

Anyone touching money on screens or in code follows this file.

## Open item
- A ledger line (FNCTRANS → FNCITEMS_SUBFORM) on the customer account (ACCNAME = customer code) with FRECONNUM = 0.
- Amount = DEBIT1 − CREDIT1. Positive = debt, negative = credit.
- Stored in OpenMovements (source priority-direct, PullOpenMovements, daily 07:20). movementId = FNCNUM:KLINE.

## Dates and references
- Due date = the line's FNCDATE (end of BALDATE month + payment-terms days; verified for שוטף + 30, + 60, + 90).
  A receipt can hold several lines with different due dates (post-dated cheques): each line sits in its own due month.
- Document date = BALDATE. Invoice reference = FNCIREF1 (= Invoices.invoiceNumber).
- A receipt left on account has no FNCIREF1 and DETAILS "קבלה" → docType קבלה, docNumber = FNCNUM.

## Balance
- Balance = the sum of open items. Unmatched receipts and credit notes reduce it.
- Invoice headers alone overstate the debt (121205: 791,955.82 by headers vs 668,314.62 ₪ by the ledger).
- Customers calc columns (RefreshCustomerAggregates): openBalance, openDebit, onAccountCredit (קבלה items),
  overdueAmount, oldestDueDate, openMovementCount, movementsSyncedAt, fullHistorySyncedAt, documentCount, lastDocumentDate, aggregatesAt.
- Invoices.openAmount = sum of the invoice's open items; 0 when the ledger was read and nothing is open;
  null when the customer's ledger was never read. dueDate = earliest due date of its open items.
- Pre-cutoff rule (6d): cutoff = AgentSettings openMovementsFromDate (2024-01-01). The normal ledger read covers BALDATE >= cutoff,
  so an invoice dated before the cutoff with no open item is null (unknown), not 0 — unless Customers.fullHistorySyncedAt is set
  (PullOpenMovements fullHistory:true, real run, sets it with movementsSyncedAt for each completed customer). Invoices dated
  on/after the cutoff keep the rule above.

## Invoice key
- Invoice numbers repeat across forms and customers (C18F0001 = CINVOICES of 131009 AND AINVOICES of 221134). Every per-row
  map in the invoice layer (ledger facts, computed layer, payments) is keyed by customerCode|invoiceNumber (invoiceKey()), never
  by the number alone. Movements match by customerCode + docNumber.

## Reconciliation
- IVRECONDATE on the invoice (Invoices.reconciledDate) and FRECONNUM on ledger lines.
- reconciledDate and Invoices.status never decide open/closed or paid. The ledger does.
- FRECONNUM −1 is excluded for now (meaning unconfirmed).

## Overdue (6d)
- overdueAmount = NET sum of ALL open items (debits and credits) with dueDate < asOf. If openBalance > 0 it is capped at
  openBalance; a negative net is stored as 0. (shared ledgerOverdue(); GetCustomer360 kpis.overdue uses it too, minus payment seen.)
- oldestDueDate = earliest dueDate of POSITIVE open items only (null when none).
- asOf = AgentSettings balanceAsOfDate, else today (Asia/Jerusalem).
- Test data is a snapshot from about early February 2026 → set balanceAsOfDate 2026-02-05 when checking overdue.

## Layers
- Mirror: OpenMovements, Invoices, Customers — copied from Priority/Brain.
- Calc: customer aggregates, invoice layer (openAmount, dueDate, dueMonth, remainingAmount, paymentStatus, subStatus).
- Enrichment: notes, tasks, our customer fields.
- Calc is never written by a sync. Order after a ledger pull: movementsSyncedAt → RefreshCustomerAggregates → RefreshInvoiceLayer.

## Display rules
- ILS = "שח" (also ש"ח, ILS, NIS, empty). One helper isIls() in src/utils/Currency.ts and code-actions/shared/collections-currency.ts. Cells show ₪.
- Drafts and cancelled documents are hidden by default.
- Never show a computed "paid" without a ledger read.
- "—" means not known yet, never 0. Waiting text: "ממתין לתנועות פתוחות מפריוריטי".

## Verified examples (TEST company elisco)
- 121117: 35 items / 12,866,910.27 ₪ (equals its invoice headers); overdue 12,866,910.27, oldest 2026-02-28.
- 121205: 13 items / 668,314.62 ₪; overdue 668,314.62, oldest 2025-12-15; including receipt 25028956 lines 5 and 6: 2 × −61,820.60 on account (due 2025-11-30 and 2025-12-05).
