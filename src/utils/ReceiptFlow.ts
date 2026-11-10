import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import type { CustomerContactsEntity, CustomersEntity, OpenMovementsEntity, ReceiptAllocationsEntity, ReceiptsEntity } from '@/product-types';
import { formatDate, formatILS, round2 } from '@/utils/Format';
import { MATCH_ALLOCATED, MATCH_ALLOCATED_SURPLUS, MATCH_PROPOSED_ALLOCATION, RECEIPT_ISSUED, isApprovedReceipt, matchStatusOf, receiptStatusOf } from '@/utils/ReceiptRecord';
import { WAITING } from '@/utils/ReceiptsIdentify';
import type { IdentityState } from '@/utils/ReceiptsIdentify';

/**
 * One receipt record, the 08.11 flow, pure: identification → receipt → debt check → allocation. The record panel
 * reads the entities directly and asks this module where each step stands, what the copy-to-Priority instruction
 * says, and the customer's open balance per due month. A field agent's cheque starts at the debt check.
 */

export type FlowReceipt = EntityType<typeof ReceiptsEntity>;
export type FlowAllocation = EntityType<typeof ReceiptAllocationsEntity>;
export type FlowMovement = EntityType<typeof OpenMovementsEntity>;
export type FlowCustomer = EntityType<typeof CustomersEntity>;
export type FlowContact = EntityType<typeof CustomerContactsEntity>;

export const AGENT_CHEQUE = 'צ׳ק סוכן';
export const DEBT_ASK = 'לברר מול הלקוח';
const CENT = 0.01;

export function isAgentCheque(r?: { receiptSource?: string | null } | null): boolean {
  return r?.receiptSource === AGENT_CHEQUE;
}

/** done = finished; current = the next thing to do here; attention = needs a person's judgment; waiting = not reached. */
export type StepTone = 'done' | 'current' | 'attention' | 'waiting';

export interface FlowSteps {
  identify: StepTone;
  receipt: StepTone;
  debt: StepTone;
  allocation: StepTone;
}

/** Where each of the four steps stands, from the line's identification and its receipt. */
export function flowStepsOf(state: IdentityState | null, receipt?: FlowReceipt | null): FlowSteps {
  const cheque = isAgentCheque(receipt);
  const approved = isApprovedReceipt(receipt);
  const identify: StepTone = cheque || approved || state === 'אושר' ? 'done' : state === 'לא זוהה' || state === 'לא ודאי' ? 'attention' : 'current';
  const receiptStep: StepTone = !approved
    ? 'waiting'
    : receipt?.sendStatus === 'חסר איש קשר'
      ? 'attention'
      : receiptStatusOf(receipt) === RECEIPT_ISSUED || (cheque && !!receipt?.priorityReceiptNumber)
        ? 'done'
        : 'current';
  const debt: StepTone = !approved || !receipt?.debtCheckResult ? 'waiting' : receipt.debtCheckResult === DEBT_ASK ? 'attention' : 'done';
  const ms = matchStatusOf(receipt);
  const allocation: StepTone = !approved || !ms ? 'waiting' : ms === MATCH_ALLOCATED || ms === MATCH_ALLOCATED_SURPLUS ? 'done' : ms === MATCH_PROPOSED_ALLOCATION ? 'current' : 'attention';
  return { identify, receipt: receiptStep, debt, allocation };
}

/** The line under a step that has not been reached yet. */
export function waitingLineOf(step: keyof FlowSteps, state: IdentityState | null, receipt?: FlowReceipt | null): string {
  const approved = isApprovedReceipt(receipt);
  if (step === 'receipt') return state === WAITING || state === null ? 'מחכה לזיהוי הלקוח' : 'מחכה לאישור הלקוח';
  if (!approved) return 'מחכה להוצאת הקבלה';
  if (step === 'debt') return 'מחכה לבדיקת החוב';
  return receipt?.debtCheckResult ? 'מחכה להצעת הפיזור' : 'מחכה לבדיקת החוב';
}

/** מלאה / חלקית of one allocation row. */
export function allocationKindOf(a: FlowAllocation): 'מלאה' | 'חלקית' {
  if (a.kind === 'מלאה' || a.kind === 'חלקית') return a.kind;
  return a.isPartial ? 'חלקית' : 'מלאה';
}

/** What is left on account: unallocatedAmount when stored, else the amount minus the allocations. */
export function onAccountOf(r: FlowReceipt, allocations: FlowAllocation[]): number {
  if (r.unallocatedAmount != null) return round2(Number(r.unallocatedAmount));
  const allocated = allocations.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  return round2(Math.max(0, Number(r.amount ?? 0) - allocated));
}

/** The allocation rows in due-date order. */
export function sortedAllocations(allocations: FlowAllocation[]): FlowAllocation[] {
  return [...allocations].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.invoiceNumber ?? '').localeCompare(b.invoiceNumber ?? ''));
}

/**
 * The text a person copies into Priority to issue the receipt there: customer, amount, value date, reference, payer,
 * then one line per allocated invoice (full / partial) and what is left on account.
 */
export function priorityInstruction(r: FlowReceipt, allocations: FlowAllocation[]): string {
  const lines = [
    `לקוח: ${[r.customerCode, r.customerName].filter(Boolean).join(' ') || '—'}`,
    `סכום: ${formatILS(r.amount)}`,
    `תאריך ערך: ${formatDate(r.valueDate)}`,
    `אסמכתא: ${r.reference || '—'}`,
    isAgentCheque(r) ? `מקור: ${AGENT_CHEQUE}` : `מעביר: ${r.payerName || '—'}`,
  ];
  for (const a of sortedAllocations(allocations)) lines.push(`חשבונית ${a.invoiceNumber || '—'} – ${formatILS(a.amount)} (${allocationKindOf(a)})`);
  const onAccount = onAccountOf(r, allocations);
  if (onAccount > CENT) lines.push(`על חשבון ${formatILS(onAccount)}`);
  return lines.join('\n');
}

/** A movement that is the receipt itself in Priority (a קבלה numbered as the receipt): never counted against it. */
export function isOwnMovement(m: FlowMovement, r?: FlowReceipt | null): boolean {
  if (!r || m.docType !== 'קבלה') return false;
  const no = (m.docNumber ?? '').trim();
  if (!no) return false;
  return no === (r.priorityReceiptNumber ?? '').trim() || no === (r.receiptKey ?? '').trim();
}

const MONTH = /^\d{4}-\d{2}$/;

function monthOf(m: FlowMovement): string | null {
  const dm = (m.dueMonth ?? '').trim();
  if (MONTH.test(dm)) return dm;
  const d = (m.dueDate ?? '').slice(0, 7);
  return MONTH.test(d) ? d : null;
}

export interface MonthBalance {
  month: string;
  balance: number;
  cumulative: number;
  closed: boolean;
}

/** The months the debt check closed (debtCheckMonths, comma-separated YYYY-MM). */
export function closedMonthsOf(r?: FlowReceipt | null): string[] {
  return (r?.debtCheckMonths ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => MONTH.test(m));
}

/** The customer's open balance per due month, oldest first, with the running total; the receipt's own movement left out. */
export function monthBalancesOf(movements: FlowMovement[], r?: FlowReceipt | null): { months: MonthBalance[]; undated: number } {
  const closed = new Set(closedMonthsOf(r));
  const by = new Map<string, number>();
  let undated = 0;
  for (const m of movements) {
    if (isOwnMovement(m, r)) continue;
    const month = monthOf(m);
    if (!month) {
      undated++;
      continue;
    }
    by.set(month, round2((by.get(month) ?? 0) + Number(m.amount ?? 0)));
  }
  let running = 0;
  const months = [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, balance]) => {
      running = round2(running + balance);
      return { month, balance, cumulative: running, closed: closed.has(month) };
    });
  return { months, undated };
}

export interface ApContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** The customer's accounts-payable contact: the flagged contact, else one with the הנהלת חשבונות role, else the card's own fields. */
export function apContactOf(customer: FlowCustomer | undefined, contacts: FlowContact[]): ApContact | null {
  const c = contacts.find((x) => x.isApContact) ?? contacts.find((x) => (x.roleFlags ?? '').includes('הנהלת חשבונות'));
  if (c) return { name: c.contactName || null, email: c.email || null, phone: c.phone || null };
  if (customer?.apContactName || customer?.apContactEmail || customer?.apContactPhone)
    return { name: customer.apContactName || null, email: customer.apContactEmail || null, phone: customer.apContactPhone || null };
  return null;
}