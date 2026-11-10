# Plan — direct Priority subform reads (Iteration 3, PLAN ONLY, 10.11.2026)
Brain cannot sync subforms, so three are read straight from the Priority integration, outside Brain. Not built.
## Blocker
No Priority integration on this app: no `integration:priority` actions, no Priority mappings in code-actions. Saar adds it in App Settings → Integrations → Priority, "Share with all app users" (SHARED), with a Priority API user that can read CUSTOMERS, TINVOICES, CINVOICES and their subforms. Then read 1 parent row with $expand per subform and replace the expected columns below with the raw ones.
## Expected columns (standard Priority OData — NOT verified, to confirm after connect)
- CUSTOMERS → CUSTPERSONNEL_SUBFORM → CustomerContacts. Key `CUSTNAME:<PHONE id>`. NAME, FIRSTNAME, LASTNAME, POSITIONDES, PHONENUM, CELLPHONE, EMAIL, FAX, INACTIVEFLAG.
- TINVOICES → TPAYMENT2_SUBFORM → Payments. Key `TINVOICES:<IVNUM>:<KLINE>`. PAYMENTCODE, PAYMENTNAME, QPRICE, PAYDATE, BANKCODE, BRANCH, PAYACCOUNT, CHEQUENUM, CARDNUM, DETAILS (+ parent IVNUM, IVDATE, CUSTNAME, CDES, STATDES).
- CINVOICES → CINVOICEITEMS_SUBFORM → InvoiceLines. Key `CINVOICES:<IVNUM>:<KLINE>`. KLINE, PARTNAME, PDES, TQUANT, TUNITNAME, PRICE, PERCENT, QPRICE, DOCNO, ORDNAME.
- Mirror rules as SyncFromBrain: allow-list, priorityKey, syncRunId, syncedAt, deletedInSource (only for parents read fully), lastAppWriteAt skip. Contacts added from email/app (no priorityKey) are enrichment and never touched.
## Volume (Brain counts 10.11)
Active customers 795; CINVOICES last 12 months 3,488; TINVOICES not in Brain (estimate 3–6k).
## Calls and timing
Paged $top=50 parents with $expand: customers ~16 calls; CINVOICES ~70 (or ~175 at $top=20 if line payloads are heavy); TINVOICES ~60–120. About 150–300 calls, 2 at a time, 2–4 s each ≈ 4–10 min; 429 backoff 2/4/8/16/32 s, Retry-After honoured; 10-min budget with resume like SyncFromBrain.
## Schedule
Once a day at 07:00 Asia/Jerusalem (after the 06:30 BrainSync, which takes up to ~14 min), plus an admin button. Incremental by date filter (last 12 months, active customers).

## Verified 10.11.2026 (Priority connected, read-only sample reads)
- Integration actions: ReadEntitySet (entityName may be a path, e.g. `CINVOICES(IVNUM='X',IVTYPE='C',DEBIT='D')/CINVOICEITEMS_SUBFORM`), plus CreateEntity/UpdateEntity (never used — no writes).
- CONTACTS: CUSTOMERS?$expand=CUSTPERSONNEL_SUBFORM works. Key = CUSTNAME + PHONE (int id). Useful: NAME, FIRSTNAME, LASTNAME, POSITIONDES, PHONENUM, CELLPHONE, OFFICEPHONE, FAX, EMAIL, STATDES (פעיל), INACTIVE, FIRM. Often names only like "חנות"; FIRSTNAME/LASTNAME mostly null.
- PAYMENTS: TPAYMENT2_SUBFORM is EMPTY on real receipts. Lines live in **TPAYMENT_SUBFORM**: KLINE, PAYMENT (int id), PAYDATE (cheque due date), QPRICE, TOTPRICE, CODE (שח), CARDNUM (= cheque number for cheques), BANKCODE, BANKNAME, BRANCH, PAYACCOUNT, DETAILS, WTAX/WTAX2/WTAX3, STORNOFLAG, CASHFLOWCODE. Key = receipt IVNUM + KLINE.
- LINES: CINVOICEITEMS_SUBFORM: KLINE, PARTNAME, PDES, TQUANT, TUNITNAME, QUANT, UNITNAME, PRICE, PERCENT, DISPRICE, QPRICE (net), TOTPRICE (gross), IVTAX, VATFLAG, ORDNAME, ORDLINE, DOCNO, AGENTCODE, ACCNAME, UDATE. Key = IVNUM + KLINE.
- GOTCHA: $expand on TINVOICES/CINVOICES comes back truncated through the integration (data string cut off). Use the per-document path read for payments and lines. => ~1 call per document: ~3,500 invoices + ~3–6k receipts ≈ 7–10k calls for the first full load (too long for one run); afterwards incremental with `since` (only changed documents, tens per day). Contacts: CUSTOMERS expand in pages of 50 works (~16 calls).
- Plan change: first load spread over several resumable runs (10-min budget each); daily 07:00 run only changed documents.
