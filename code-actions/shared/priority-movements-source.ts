// The open movements source (Priority's unmatched customer movements – the base of the aging report) for
// PullOpenMovements.
//
// The Priority API is not connected yet: the source in use reports connected: false and returns nothing, and the pull
// stops with PRIORITY_NOT_CONNECTED. The API implementation replaces it behind the same interface:
// fetchOpenMovements({ customerCodes }) → { customers: every customer code the answer covers (also those with no open
// movement, so their old rows are cleared), movements }. movementsFromData derives movements from invoices / receipts
// with the aging engine's rules. Nothing here writes anywhere or contacts anyone.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { debtMonthOf, isDebtRow } from './collections-aging.ts';
import { firstOfMonth, isMonthKey, toIsraelDate } from './collections-dates.ts';
import { formatIls, num, round2, str } from './collections-data.ts';
import { effectiveOpen, isApprovedReceipt } from './collections-invoice-layer.ts';

export const DOC_INVOICE = 'חשבונית';
export const DOC_RECEIPT = 'קבלה';
export const DOC_CREDIT = 'זיכוי';
export const DOC_JOURNAL = 'פקודת יומן';
export const DOC_OTHER = 'אחר';
export const DOC_TYPES = [DOC_INVOICE, DOC_RECEIPT, DOC_CREDIT, DOC_JOURNAL, DOC_OTHER];

/** One unmatched movement as Priority gives it. amount > 0 = debt, < 0 = credit. */
export interface PriorityMovement {
  customerCode: string;
  /** Priority's key of the movement, unique per customer */
  movementId: string;
  docType: string;
  docNumber: string;
  /** YYYY-MM-DD */
  docDate: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  amount: number;
  details: string | null;
  /** customer name as Priority has it (optional; the Customers row's name wins) */
  customerName?: string | null;
}

export interface MovementsQuery {
  client: BlocksClient;
  /** only these customers (null / empty = all) */
  customerCodes?: string[] | null;
}

export interface MovementsAnswer {
  /** every customer code the answer covers, including customers with no open movement */
  customers: string[];
  movements: PriorityMovement[];
}

export interface MovementsSource {
  /** OpenMovements.source of the rows this source writes */
  name: string;
  /** false = not connected: the pull reads and writes nothing and reports PRIORITY_NOT_CONNECTED */
  connected?: boolean;
  fetchOpenMovements(q: MovementsQuery): Promise<MovementsAnswer>;
}

const CREDIT_NOTE = 'חשבונית זיכוי';

/** The movements of the given invoices / receipts, by the aging engine's rules (pure). */
export function movementsFromData(x: { invoices: Item[]; receipts: Item[] }): PriorityMovement[] {
  const out: PriorityMovement[] = [];
  for (const inv of x.invoices) {
    if (!isDebtRow(inv)) continue;
    const no = str(inv.invoiceNumber).trim();
    const code = str(inv.customerCode).trim();
    if (!no || !code) continue;
    const credit = str(inv.documentType).trim() === CREDIT_NOTE;
    const amount = round2(effectiveOpen(inv));
    const month = debtMonthOf(inv);
    const due = toIsraelDate(inv.dueDate) ?? (isMonthKey(str(inv.dueMonth)) ? firstOfMonth(str(inv.dueMonth)) : month ? firstOfMonth(month) : null);
    const full = round2(num(inv.amount));
    const partial = !credit && full > 0 && amount < full - 0.005;
    out.push({
      customerCode: code,
      movementId: `${credit ? 'CRN' : 'INV'}-${no}`,
      docType: credit ? DOC_CREDIT : DOC_INVOICE,
      docNumber: no,
      docDate: toIsraelDate(inv.invoiceDate),
      dueDate: due,
      amount,
      details: credit
        ? `חשבונית זיכוי ${no}`
        : partial
          ? `חשבונית ${no} – יתרה חלקית ${formatIls(amount)} מתוך ${formatIls(full)} ש״ח`
          : `חשבונית ${no}`,
      customerName: str(inv.customerName).trim() || null,
    });
  }
  for (const r of x.receipts) {
    const left = round2(num(r.unallocatedAmount));
    if (left <= 0.005 || !isApprovedReceipt(r)) continue;
    const code = str(r.customerCode).trim();
    const key = str(r.receiptKey).trim();
    if (!code || !key) continue;
    const vd = toIsraelDate(r.valueDate) ?? toIsraelDate(r.preparedAt);
    const number = str(r.priorityReceiptNumber).trim() || key;
    out.push({
      customerCode: code,
      movementId: `REC-${key}`,
      docType: DOC_RECEIPT,
      docNumber: number,
      docDate: vd,
      dueDate: vd,
      amount: -left,
      details: `קבלה על חשבון ${number}${str(r.payerName).trim() ? ` – ${str(r.payerName).trim()}` : ''} (לא מפוזרת ${formatIls(left)} ש״ח)`,
      customerName: str(r.customerName).trim() || null,
    });
  }
  return out;
}

/** Placeholder until the Priority API is connected: not connected, no movements. */
export const notConnectedMovementsSource: MovementsSource = {
  name: 'priority',
  connected: false,
  async fetchOpenMovements(): Promise<MovementsAnswer> {
    return { customers: [], movements: [] };
  },
};

/** The source in use. */
export const movementsSource: MovementsSource = notConnectedMovementsSource;
