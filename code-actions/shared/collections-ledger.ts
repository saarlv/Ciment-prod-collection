// Customer ledger (כרטסת) and open-debts data, shared by GetLedger, GetOpenDebts, GenerateStatementPdf
// and PrepareOpenDebtsBatch, so the screens, the PDF and the batch always show the same numbers.
// Pure builders + thin loaders. Read-only.
// Sources (plan 04.11 r2, stage 9): the כרטסת comes from LedgerEntries; the open debts come from OpenMovements (Priority's
// unmatched movements per due month – the source of truth since wave 0, the same rows the aging and the notes engine
// read), never from the old invoice layer (Invoices.openAmount). An EMPTY OpenMovements table means the pull never
// ran / failed: the result says so (movementsMirrorEmpty) and no PDF is made from it.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { diffDays, isValidDate, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { findCustomer, formatIls, num, numOrNull, readAll, round2, str } from './collections-data.ts';

export const BALANCE_FROM_LEDGER = 'כרטסת';
export const BALANCE_FROM_CUSTOMER = 'כרטיס לקוח';

/** MatchProposals status of a proposal nobody has decided yet. */
export const UNDECIDED_PROPOSAL = 'מוצעת';
/**
 * BankLines.status after which the receipt is settled (issued in Priority). An approved receipt that is not issued yet
 * still waits for its allocation / Priority, so its line stays listed.
 */
export const SETTLED_BANK_STATUSES = ['קבלה הונפקה'];

const EPS = 0.005;

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

// ---------- ledger ----------

/** Resolves the range: fromDate default 1 January of the asOf year, toDate default asOf. */
export function resolveRange(input: any): { asOf: string; fromDate: string; toDate: string } {
  const asOf = resolveAsOf(input?.asOfDate);
  const from = str(input?.fromDate).trim().slice(0, 10);
  const to = str(input?.toDate).trim().slice(0, 10);
  if (from && !isValidDate(from)) throw new Error(`fromDate must be YYYY-MM-DD, got "${from}"`);
  if (to && !isValidDate(to)) throw new Error(`toDate must be YYYY-MM-DD, got "${to}"`);
  const fromDate = from || `${asOf.slice(0, 4)}-01-01`;
  const toDate = to || asOf;
  if (fromDate > toDate) throw new Error(`fromDate ${fromDate} is after toDate ${toDate}`);
  return { asOf, fromDate, toDate };
}


export interface LedgerEntry {
  entryKey: string;
  entryDate: string | null;
  valueDate: string | null;
  docType: string;
  docNumber: string;
  details: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

/** Ledger rows in card order: entry date, then value date, then entry key (natural order). */
export function sortLedgerRows(rows: Item[]): Item[] {
  return [...rows].sort((a, b) => {
    const da = toIsraelDate(a.entryDate) ?? '';
    const db = toIsraelDate(b.entryDate) ?? '';
    if (da !== db) return da < db ? -1 : 1;
    const va = toIsraelDate(a.valueDate) ?? '';
    const vb = toIsraelDate(b.valueDate) ?? '';
    if (va !== vb) return va < vb ? -1 : 1;
    return natural(str(a.entryKey), str(b.entryKey));
  });
}

/** Ledger in card order with a running balance on every row (stored value, else computed). */
export function ledgerWithBalances(rows: Item[]): LedgerEntry[] {
  let bal = 0;
  return sortLedgerRows(rows).map((r) => {
    const debit = round2(num(r.debit));
    const credit = round2(num(r.credit));
    const stored = numOrNull(r.runningBalance);
    bal = stored !== null ? round2(stored) : round2(bal + debit - credit);
    return {
      entryKey: str(r.entryKey),
      entryDate: toIsraelDate(r.entryDate),
      valueDate: toIsraelDate(r.valueDate),
      docType: str(r.docType),
      docNumber: str(r.docNumber),
      details: str(r.details),
      debit,
      credit,
      runningBalance: bal,
    };
  });
}

/** End-of-card balance: the running balance of the last ledger row, or null without rows. */
export function lastRunningBalance(rows: Item[]): number | null {
  const all = ledgerWithBalances(rows);
  return all.length ? all[all.length - 1].runningBalance : null;
}

export function latestSyncedAt(rows: Item[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const r of rows) {
    const t = Date.parse(str(r.syncedAt));
    if (!Number.isNaN(t) && t > bestT) {
      bestT = t;
      best = new Date(t).toISOString();
    }
  }
  return best;
}

export interface LedgerResult {
  customerCode: string;
  customerName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  entries: LedgerEntry[];
  hasLedger: boolean;
  syncedAt: string | null;
  note: string;
}

export function buildLedger(args: {
  customerCode: string;
  customer: Item | undefined;
  rows: Item[];
  fromDate: string;
  toDate: string;
}): LedgerResult {
  const { customerCode, customer, rows, fromDate, toDate } = args;
  const customerName = str(customer?.customerName) || str(rows[0]?.customerName);
  const all = ledgerWithBalances(rows);
  const before = all.filter((e) => (e.entryDate ?? '') < fromDate);
  const inRange = all.filter((e) => (e.entryDate ?? '') >= fromDate && (e.entryDate ?? '') <= toDate);
  let openingBalance = 0;
  if (before.length) openingBalance = before[before.length - 1].runningBalance;
  else if (inRange.length) openingBalance = round2(inRange[0].runningBalance - inRange[0].debit + inRange[0].credit);
  const upTo = all.filter((e) => (e.entryDate ?? '') <= toDate);
  const closingBalance = upTo.length ? upTo[upTo.length - 1].runningBalance : openingBalance;
  const totalDebit = round2(inRange.reduce((s, e) => s + e.debit, 0));
  const totalCredit = round2(inRange.reduce((s, e) => s + e.credit, 0));

  let note = '';
  if (!customer && !rows.length) note = `הלקוח ${customerCode} לא נמצא.`;
  else if (!rows.length) {
    const lb = numOrNull(customer?.ledgerBalance);
    note = `אין שורות כרטסת במראה עבור ${customerName || customerCode}.${lb !== null ? ` יתרת כרטיס הלקוח: ${formatIls(lb)} ש״ח.` : ''}`;
  } else if (!inRange.length) note = `אין תנועות בכרטסת בין ${fromDate} ל-${toDate}. יתרת פתיחה = יתרת סגירה.`;

  return {
    customerCode,
    customerName,
    fromDate,
    toDate,
    openingBalance,
    closingBalance,
    totalDebit,
    totalCredit,
    entries: inRange,
    hasLedger: rows.length > 0,
    syncedAt: latestSyncedAt(rows),
    note,
  };
}

export async function loadLedger(client: BlocksClient, customerCode: string, fromDate: string, toDate: string): Promise<LedgerResult> {
  const [customer, rows] = await Promise.all([
    findCustomer(client, customerCode),
    readAll(client, 'LedgerEntries', { column: 'customerCode', value: customerCode }),
  ]);
  return buildLedger({ customerCode, customer, rows, fromDate, toDate });
}

// ---------- open debts ----------

export interface OpenDocument {
  invoiceNumber: string;
  documentType: string;
  invoiceDate: string | null;
  dueDate: string | null;
  daysOverdue: number;
  overdue: boolean;
  amount: number;
  openAmount: number;
  /** Ledger movement type of the document (LedgerEntries.docType with the same docNumber), '' when not in the mirror */
  movementType: string;
  /** Ledger details of the document (LedgerEntries.details), '' when not in the mirror */
  details: string;
}

export interface OpenReceipt {
  source: 'הצעת התאמה' | 'שורת בנק';
  bankLineId: string;
  valueDate: string | null;
  amount: number;
  payerName: string;
  status: string;
  matchProposalId: string | null;
}

export interface OpenDebtsResult {
  customerCode: string;
  customerName: string;
  asOfDate: string;
  documents: OpenDocument[];
  totalOpen: number;
  totalOverdue: number;
  totalNotDue: number;
  endOfCardBalance: number;
  balanceSource: string;
  openReceipts: OpenReceipt[];
  /** where the documents come from: always OpenMovements */
  source: typeof OPEN_DEBTS_SOURCE;
  /** the whole OpenMovements table is empty (pull never ran / failed): the documents are unknown, not zero */
  movementsMirrorEmpty: boolean;
  note: string;
}

export const OPEN_DEBTS_SOURCE = 'OpenMovements' as const;
export const MIRROR_EMPTY_NOTE = 'התנועות הפתוחות עוד לא נמשכו מ-Priority (OpenMovements ריקה) – החובות הפתוחים לא ידועים.';

/** True when OpenMovements has at least one row. */
export async function movementsMirrorHasRows(client: BlocksClient): Promise<boolean> {
  const res = await client.queryTable('OpenMovements', { from: { table: 'OpenMovements' }, limit: 1 });
  return (res?.items ?? []).length > 0;
}

/** Open documents (OpenMovements rows with amount ≠ 0) by due date; overdue = due before asOf (credit movements net in,
 * like the aging). The document's original amount and its ledger movement type / details come from the LedgerEntries
 * row with the same docNumber when the mirror has it (else the open amount / the movement's own docType and details). */
export function openDocuments(movements: Item[], asOf: string, ledgerRows: Item[] = []): OpenDocument[] {
  const ledgerByDoc = new Map<string, Item>();
  for (const r of ledgerRows) {
    const no = str(r.docNumber).trim();
    if (no && !ledgerByDoc.has(no)) ledgerByDoc.set(no, r);
  }
  return movements
    .filter((m) => Math.abs(num(m.amount)) > EPS)
    .map((m) => {
      const no = str(m.docNumber).trim();
      const led = no ? ledgerByDoc.get(no) : undefined;
      const dueDate = toIsraelDate(m.dueDate) || (/^\d{4}-\d{2}$/.test(str(m.dueMonth).trim()) ? `${str(m.dueMonth).trim()}-01` : null);
      const openAmount = round2(num(m.amount));
      const overdue = !!dueDate && dueDate < asOf;
      const ledgerAmount = led ? round2(Math.abs(num(led.debit)) || Math.abs(num(led.credit))) : 0;
      const docType = str(m.docType).trim();
      return {
        invoiceNumber: no || str(m.movementId),
        documentType: docType || (openAmount < 0 ? 'זיכוי' : 'חשבונית'),
        invoiceDate: toIsraelDate(m.docDate) || toIsraelDate(led?.entryDate),
        dueDate,
        daysOverdue: overdue && openAmount > 0 ? diffDays(asOf, dueDate!) : 0,
        overdue,
        amount: ledgerAmount || Math.abs(openAmount),
        openAmount,
        movementType: str(led?.docType).trim() || docType,
        details: str(m.details).trim() || str(led?.details).trim(),
      };
    })
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || natural(a.invoiceNumber, b.invoiceNumber));
}

/**
 * Receipts of the customer still waiting for a match: undecided MatchProposals, plus the customer's
 * positive bank lines that are not settled and have no undecided proposal already listed.
 */
export function openReceiptsFor(customerCode: string, proposals: Item[], bankLines: Item[], asOf: string): OpenReceipt[] {
  const out: OpenReceipt[] = [];
  const listed = new Set<string>();
  for (const p of proposals) {
    if (str(p.customerCode) !== customerCode || str(p.status) !== UNDECIDED_PROPOSAL) continue;
    const vd = toIsraelDate(p.valueDate);
    if (vd && vd > asOf) continue;
    listed.add(str(p.bankLineId));
    out.push({
      source: 'הצעת התאמה',
      bankLineId: str(p.bankLineId),
      valueDate: vd,
      amount: round2(num(p.amount)),
      payerName: str(p.payerName),
      status: str(p.status),
      matchProposalId: str(p.id) || null,
    });
  }
  for (const b of bankLines) {
    if (str(b.customerCode) !== customerCode) continue;
    if (SETTLED_BANK_STATUSES.includes(str(b.status))) continue;
    if (num(b.amount) <= 0) continue;
    if (listed.has(str(b.bankLineId))) continue;
    const vd = toIsraelDate(b.valueDate);
    if (vd && vd > asOf) continue;
    listed.add(str(b.bankLineId));
    out.push({
      source: 'שורת בנק',
      bankLineId: str(b.bankLineId),
      valueDate: vd,
      amount: round2(num(b.amount)),
      payerName: str(b.payerName),
      status: str(b.status),
      matchProposalId: null,
    });
  }
  return out.sort((a, b) => (a.valueDate ?? '').localeCompare(b.valueDate ?? ''));
}

export function endOfCard(customer: Item | undefined, ledgerRows: Item[]): { balance: number; source: string } {
  const last = lastRunningBalance(ledgerRows);
  if (last !== null) return { balance: last, source: BALANCE_FROM_LEDGER };
  return { balance: round2(num(customer?.ledgerBalance)), source: BALANCE_FROM_CUSTOMER };
}

export function buildOpenDebts(args: {
  customerCode: string;
  customer: Item | undefined;
  /** the customer's OpenMovements rows */
  movements: Item[];
  ledgerRows: Item[];
  proposals: Item[];
  bankLines: Item[];
  asOf: string;
  /** true when the whole OpenMovements table is empty (the pull never ran / failed) */
  movementsMirrorEmpty?: boolean;
}): OpenDebtsResult {
  const { customerCode, customer, movements, ledgerRows, proposals, bankLines, asOf } = args;
  const mirrorEmpty = args.movementsMirrorEmpty === true;
  const documents = openDocuments(movements, asOf, ledgerRows);
  const totalOpen = round2(documents.reduce((s, d) => s + d.openAmount, 0));
  const totalOverdue = round2(documents.filter((d) => d.overdue).reduce((s, d) => s + d.openAmount, 0));
  const totalNotDue = round2(totalOpen - totalOverdue);
  const { balance, source } = endOfCard(customer, ledgerRows);
  const openReceipts = openReceiptsFor(customerCode, proposals, bankLines, asOf);
  const customerName = str(customer?.customerName) || str(movements[0]?.customerName);

  const notes: string[] = [];
  if (!customer) notes.push(`הלקוח ${customerCode} לא נמצא.`);
  if (mirrorEmpty) notes.push(MIRROR_EMPTY_NOTE);
  else if (!documents.length) notes.push('אין מסמכים פתוחים.');
  if (Math.abs(totalOpen - balance) > EPS && documents.length)
    notes.push(`סכום המסמכים הפתוחים (${formatIls(totalOpen)} ש״ח) שונה מיתרת סוף הכרטיס (${formatIls(balance)} ש״ח, לפי ${source}).`);
  if (openReceipts.length) {
    const sum = round2(openReceipts.reduce((s, r) => s + r.amount, 0));
    notes.push(`${openReceipts.length === 1 ? 'תקבול אחד ממתין' : `${openReceipts.length} תקבולים ממתינים`} להתאמה בסך ${formatIls(sum)} ש״ח – היתרה תרד אחרי ההתאמה.`);
  }

  return {
    customerCode,
    customerName,
    asOfDate: asOf,
    documents,
    totalOpen,
    totalOverdue,
    totalNotDue,
    endOfCardBalance: balance,
    balanceSource: source,
    openReceipts,
    source: OPEN_DEBTS_SOURCE,
    movementsMirrorEmpty: mirrorEmpty,
    note: notes.join(' '),
  };
}

export async function loadOpenDebts(client: BlocksClient, customerCode: string, asOf: string): Promise<OpenDebtsResult> {
  const byCode = { column: 'customerCode', value: customerCode };
  const [customer, movements, ledgerRows, proposals, bankLines] = await Promise.all([
    findCustomer(client, customerCode),
    readAll(client, 'OpenMovements', byCode),
    readAll(client, 'LedgerEntries', byCode),
    readAll(client, 'MatchProposals', { and: [byCode, { column: 'status', value: UNDECIDED_PROPOSAL }] }),
    readAll(client, 'BankLines', byCode),
  ]);
  // no movement of this customer: zero debt – unless the whole mirror is empty (then it is unknown)
  const movementsMirrorEmpty = movements.length ? false : !(await movementsMirrorHasRows(client));
  return buildOpenDebts({ customerCode, customer, movements, ledgerRows, proposals, bankLines, asOf, movementsMirrorEmpty });
}

/** The customer's registered accounts contact: roleFlags contain הנהלת חשבונות and an email; ראשי first. */
export function accountsContact(contacts: Item[], customerCode: string): Item | null {
  const list = contacts.filter(
    (c) => str(c.customerCode) === customerCode && str(c.roleFlags).includes('הנהלת חשבונות') && /@/.test(str(c.email)),
  );
  list.sort((a, b) => Number(str(b.roleFlags).includes('ראשי')) - Number(str(a.roleFlags).includes('ראשי')) || natural(str(a.contactKey), str(b.contactKey)));
  return list[0] ?? null;
}
