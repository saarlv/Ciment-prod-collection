// ExplainMatch since plan 04.11 part B stage 5: Nina's read-only explanation of ONE bank line along the receipts record's
// four steps – identification (the IdentifyCustomers cascade, confidence 0–100 against identifyCertainAt), the receipt,
// the debt check against the customer's due months (CheckDebt) and the allocation to invoices (ReceiptAllocations /
// matchStatus). It never explains an invoice match of the removed ladder.
// Read-only by construction: identifyCustomers runs with dryRun FORCED to true here, the debt check is either the result
// already stored on the receipt or a preview (previewDebtCheck) – nothing is written to any table.
import type { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf } from '../shared/collections-dates.ts';
import { errText, formatIls, num, readWhereIn, round2, str } from '../shared/collections-data.ts';
import { identifyCustomers } from '../shared/collections-identify-customers.ts';
import { debtCheckTaskKey, isZeroClose, MS_SPREAD_PROPOSED, previewDebtCheck, zeroAlertKey } from '../shared/collections-debt-check.ts';
import { MS_ON_ACCOUNT_SPREAD } from '../shared/collections-receipt-flow.ts';
import { ALLOCATED_STATUSES } from '../shared/collections-allocation.ts';
import { receiptKeyOf } from '../shared/collections-receipt-record.ts';

const ils = (n: number) => `${formatIls(n)} ש״ח`;
const DC_STORED = 'נשמר בקבלה';
const DC_PREVIEW = 'תחזית – יירשם אחרי אישור הקבלה';

function identificationSentence(l: Item, certainAt: number): string {
  const payer = str(l.payerName) || 'המעביר';
  const who = `${str(l.customerCode)} ${str(l.customerName)}`.trim();
  if (str(l.skippedReason)) return `${l.skippedReason}${who ? ` (לקוח ${who})` : ''}.`;
  const how = [str(l.method), str(l.evidence)].filter(Boolean).join(' – ');
  if (l.identifyStatus === 'ודאי') return `"${payer}" זוהה כלקוח ${who}${how ? ` (${how})` : ''}, ביטחון ${num(l.confidence)} – ודאי (סף ${certainAt}); ממתין ל"אשר את כל הוודאיים".`;
  if (l.identifyStatus === 'אושר אוטומטית') return `"${payer}" זוהה כלקוח ${who}${how ? ` (${how})` : ''}, ביטחון ${num(l.confidence)} – מעל סף האישור האוטומטי (customerAutoApproveAt): הקבלה יוצאת בלי אישור ידני.`;
  if (l.identifyStatus === 'לא ודאי') {
    const others = (Array.isArray(l.candidates) ? l.candidates : []).map((c: Item) => `${str(c.customerCode)} ${str(c.customerName)}`.trim()).filter(Boolean);
    return `"${payer}" זוהה כנראה כלקוח ${who}${how ? ` (${how})` : ''}, ביטחון ${num(l.confidence)} – מתחת לסף ${certainAt}, לאישור אחד-אחד${others.length > 1 ? ` (מועמדים: ${others.join(', ')})` : ''}.`;
  }
  return `"${payer}" לא זוהה – לבחור לקוח ידנית באישור אחד-אחד.`;
}

export async function explainLine(client: BlocksClient, input: Item): Promise<Item> {
  const bankLineId = str(input?.bankLineId).trim();
  const errors: string[] = [];
  const out: Item = { ok: false, dryRun: true, explainOnly: true, bankLineId, customerCode: '', customerName: '', identification: null, receipt: null, debtCheck: null, reasoning: '', errors };
  if (!bankLineId) {
    errors.push('חסר מזהה שורת בנק (bankLineId)');
    return out;
  }
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    errors.push(errText(e));
    return out;
  }
  // dryRun forced: the caller cannot turn writing on
  const ident = await identifyCustomers(client, { bankLineIds: [bankLineId], asOfDate, dryRun: true });
  errors.push(...(ident.errors ?? []));
  const l: Item | undefined = (ident.lines ?? [])[0];
  if (!l) {
    errors.push(`שורת הבנק ${bankLineId} לא נמצאה`);
    return out;
  }
  out.identification = l;
  const receiptKey = receiptKeyOf(bankLineId);
  const [receipt] = (await readWhereIn(client, 'Receipts', 'receiptKey', [receiptKey]).catch(() => [] as Item[])).sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
  if (receipt) {
    out.receipt = {
      receiptKey,
      receiptStatus: str(receipt.receiptStatus),
      identifyStatus: str(receipt.identifyStatus),
      identifyConfidence: num(receipt.identifyConfidence),
      matchStatus: str(receipt.matchStatus),
      debtCheckResult: str(receipt.debtCheckResult),
      debtCheckMonths: str(receipt.debtCheckMonths),
      amount: round2(Math.abs(num(receipt.amount))),
    };
  }
  out.customerCode = str(receipt?.customerCode).trim() || str(l.customerCode);
  out.customerName = str(receipt?.customerName).trim() || str(l.customerName);
  const amount = round2(Math.abs(num(receipt?.amount ?? l.amount)));
  const idText = identificationSentence(l, num(ident.certainAt));

  // the debt check: the stored result, else what it would decide now
  let debtText = '';
  const stored = str(receipt?.debtCheckResult).trim();
  if (stored) {
    const zero = isZeroClose(stored);
    out.debtCheck = {
      source: DC_STORED,
      result: stored,
      months: str(receipt!.debtCheckMonths).split(',').map((m) => m.trim()).filter(Boolean),
      matchStatus: str(receipt!.matchStatus),
      taskKey: zero ? zeroAlertKey(receiptKey) : debtCheckTaskKey(receiptKey),
    };
    debtText = zero
      ? `בדיקת החוב: ${stored} (${out.debtCheck.months.join(', ')}) – מוצע פיזור לחשבוניות של ${out.debtCheck.months.length === 1 ? 'החודש' : 'החודשים'} האלה, נרשמה התראה "נסגר לאפס".`
      : `בדיקת החוב: ${ils(amount)} לא סגר אף חודש פירעון – משימה "לברר מול הלקוח" לאחראית, הקבלה על חשבון עד הפיזור.`;
  } else if (out.customerCode && amount > 0) {
    const p = await previewDebtCheck(client, out.customerCode, amount);
    if (p.evaluation) {
      const ev = p.evaluation;
      const zero = isZeroClose(ev.result);
      out.debtCheck = {
        source: DC_PREVIEW,
        result: ev.result,
        months: ev.months,
        matchStatus: zero ? MS_SPREAD_PROPOSED : MS_ON_ACCOUNT_SPREAD,
        taskKey: zero ? zeroAlertKey(receiptKey) : debtCheckTaskKey(receiptKey),
        balances: ev.balances,
        explanation: ev.explanation,
      };
      debtText = `בדיקת החוב (${DC_PREVIEW}): ${ev.explanation}`;
    } else {
      out.debtCheck = { source: DC_PREVIEW, result: '', months: [], matchStatus: '', taskKey: '', error: p.error };
      debtText = `בדיקת החוב: ${p.error}`;
    }
  } else {
    debtText = 'בדיקת החוב רצה רק אחרי שהלקוח מזוהה והקבלה מאושרת.';
  }
  // the allocation (the fourth step): the receipt's allocation rows, or what it waits for
  let allocText = '';
  if (receipt && stored) {
    const rows = (await readWhereIn(client, 'ReceiptAllocations', 'receiptKey', [receiptKey]).catch(() => [] as Item[])).sort((a, b) => str(a.dueDate).localeCompare(str(b.dueDate)));
    const ms = str(receipt.matchStatus).trim();
    out.allocation = {
      matchStatus: ms || null,
      allocatedAmount: round2(num(receipt.allocatedAmount)),
      unallocatedAmount: round2(num(receipt.unallocatedAmount)),
      rows: rows.map((a) => ({ invoiceNumber: str(a.invoiceNumber), amount: round2(num(a.amount)), status: str(a.status) })),
    };
    allocText =
      rows.length && ALLOCATED_STATUSES.includes(ms)
        ? `פיזור: ${rows.map((a) => `${str(a.invoiceNumber)} ${ils(num(a.amount))}`).join(', ')}${num(receipt.unallocatedAmount) > 0.005 ? `, ${ils(num(receipt.unallocatedAmount))} על חשבון` : ''}.`
        : `פיזור: ${ms || 'טרם'} – ממתין לאישור הפיזור לחשבוניות.`;
  } else {
    allocText = 'הפיזור לחשבוניות בא אחרי בדיקת החוב.';
  }
  out.reasoning = `${idText} ${debtText} ${allocText}`;
  out.ok = true;
  return out;
}
