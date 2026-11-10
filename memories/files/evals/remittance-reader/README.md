# Evals · קורא הפירוטים (RemittanceReader, Iris)

The folder for the reader's test cases. Saar writes the cases; nothing here is run by Ella.

## Where the cases live and how they run
- The platform runs an agent's evals from its **evalGoldens** (one golden per case) and scores them with its **evalMetrics** — both in `artifacts/agents/RemittanceReader.json`.
- A case is written here first as one file per case (`cases/NN-short-name.md`, template below), then copied into `evalGoldens` as `{ name, prompt, expected_extracted_data }`. The file is the source; the golden is a copy.
- The agent holds one structural example golden today ("דוגמת מבנה", invented). Replace it once real cases exist.
- Phase 1: invented cases (בדויים). Phase 2: real Ciment remittance mails, once their mailboxes are connected (gap on /collections/gaps).

## The three metrics (already on the agent)
1. **החלטת רלוונטיות נכונה** (vs expected, threshold 0.9) — every email has the expected relevant true/false, in order, with a reason that names the real ground.
2. **כל שדה שחולץ מדויק** (vs expected, threshold 0.8) — every line's invoice number and amount, total, payment date and remarks equal the expected; every value has a verbatim quote.
3. **אפס מספרי חשבוניות ממוצאים** (threshold 1.0, no expected needed) — every invoice number in the output is written literally in its email. One invented number fails the case.

## Case template (`cases/NN-short-name.md`)
```
# NN · <short name>  (בדוי | אמיתי)
## מה בודקים
<one line: e.g. two mails, one is a different transfer; a short invoice number "4-7"; a partial payment remark>

## prompt
<exactly the format the code sends — copy the golden's prompt and change the values:>
משימה: קריאת מיילי פירוט להעברה

ההעברה: סכום <amount with commas>.00 ש״ח | תאריך ערך <YYYY-MM-DD> | שם המעביר: <payer as in the bank>
הלקוח: <code> <name>

חשבוניות פתוחות של הלקוח (מספר | פירעון | יתרה):
<number> | <YYYY-MM-DD> | <balance>

מיילים שנמצאו (<N>):
--- מייל emailId=<id>
מאת: <name> <<address>>
התקבל: <YYYY-MM-DD HH:mm>
נושא: <subject>
קבצים מצורפים: <names, or אין>
גוף:
<body>
--- סוף מייל

## expected
<per email, in order: emailId; relevant true/false and why; for a relevant one: each line (invoice as written, amount), total, paymentDate, remarks. State explicitly which invoice numbers must NOT appear.>
```

## Cases worth covering
- One relevant mail, amounts per invoice (the basic case).
- A mail about a different transfer of the same customer (must be relevant=false).
- Invoice numbers without per-invoice amounts, total only.
- A short or differently written invoice number ("חשבונית 4-7") — copied as written, never completed.
- An amount that fits an open invoice that the mail does not name — that number must not appear.
- Remarks: partial payment, dispute, net of a credit note.
- Lines that do not add up to the stated total — returned as written, reason says so.
- Attachment name only ("פירוט.xlsx"), no detail in the body — nothing extracted from the file name.
- Relative date ("היום", "אתמול") — paymentDate from the received date, quote = the word.
