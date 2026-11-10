// The open movements source (Priority's unmatched customer movements – the base of the aging report) for
// PullOpenMovements. Interface: fetchOpenMovements({ customerCodes, … }) → { customers: every customer code whose read
// COMPLETED (also those with no open movement, so their old rows are cleared), movements }.
//
// priorityMovementsSource (source "priority-direct") reads Priority directly, GET only, through ReadEntitySet
// (shared/priority-direct.ts, the same helper as SyncPrioritySubforms): one customer at a time, never in parallel.
//   FNCTRANS?$filter=(ACCNAME1 eq '<code>' or ACCNAME2 eq '<code>') and BALDATE ge <cutoff>
//     &$expand=FNCITEMS_SUBFORM($filter=ACCNAME eq '<code>' and FRECONNUM eq 0)
//   paged with $skip while a page is full (300 headers). An open line = ACCNAME is the customer and FRECONNUM = 0.
// A customer whose read fails (after 5 backoffs) is incomplete: not in `customers`, so its rows stay as they are.
// The cutoff is the AgentSettings row openMovementsFromDate; fullHistory drops the BALDATE filter. Reads stop at the
// run's read deadline; the PrioritySyncCursors row (scope openMovements) lets the next run continue from the next
// customer – the cursor is saved only after the pull wrote this run's customers (answer.afterWrite).
// movementsFromData derives movements from invoices / receipts with the aging engine's rules (the test rules).
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { dateOnly, isInternalCustomer, odataStr, priorityRead, textOrNull } from './priority-direct.ts';
import { errText, formatIls, num, readAll, round2, str } from './collections-data.ts';
import { planSettingOf } from './plan-settings.ts';
import { debtMonthOf, isDebtRow } from './collections-aging.ts';
import { firstOfMonth, isMonthKey, toIsraelDate } from './collections-dates.ts';
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
  /** no BALDATE filter: read every open line, and report the ones older than the cutoff */
  fullHistory?: boolean;
  /** YYYY-MM-DD; default the AgentSettings row openMovementsFromDate */
  cutoff?: string | null;
  /** epoch ms: no new customer read starts after this */
  readDeadline?: number | null;
  /** continue the unfinished pass of the cursor (default true; ignored when customerCodes is given) */
  resume?: boolean;
  /** dry run: the cursor is never saved */
  dryRun?: boolean;
}

export interface IncompleteCustomer {
  customerCode: string;
  error: string;
}

export interface OlderThanCutoff {
  cutoff: string;
  count: number;
  sum: number;
  /** customerCode → { count, sum } */
  byCustomer: Record<string, { count: number; sum: number }>;
}

export interface MovementsAnswer {
  /** every customer code whose read completed, including customers with no open movement */
  customers: string[];
  movements: PriorityMovement[];
  /** customers whose read failed: their rows are kept */
  incomplete?: IncompleteCustomer[];
  /** customers planned for this pass (all of them, not only this run's) */
  customersPlanned?: number;
  /** customers left for the next run (time ran out) */
  remaining?: number;
  needsResume?: boolean;
  resumed?: boolean;
  cutoff?: string;
  fullHistory?: boolean;
  /** fullHistory only: open lines whose document date is before the cutoff */
  olderThanCutoff?: OlderThanCutoff | null;
  notes?: string[];
  /** called by the pull after its write (ok = everything written); saves the cursor. Never on a dry run. */
  afterWrite?: (ok: boolean) => Promise<void>;
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


// =====================================================================================================================
// Priority direct (FNCTRANS → FNCITEMS_SUBFORM)
// =====================================================================================================================

export const PRIORITY_DIRECT_SOURCE = 'priority-direct';
export const S_OPEN_MOVEMENTS_FROM_DATE = 'openMovementsFromDate';
export const FNC_PAGE = 300;
const MAX_PAGES = 40; // 12,000 headers for one customer: anything beyond is treated as an incomplete read
const CURSOR_SCOPE = 'openMovements';
const PHASE_READING = 'קריאת שורות';
const PHASE_DONE = 'הושלם';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A Priority invoice / credit-note number (C2570091, MF26001079, IN123456). */
export const isInvoiceLikeRef = (ref: unknown) => /^[A-Za-z]{1,4}\d{4,}$/.test(str(ref).trim());

/**
 * docType of an open line. invoiceDocType = Invoices.documentType of the row whose invoiceNumber is FNCIREF1 (null when
 * no such row): credit note there, or negative with an invoice-like number → זיכוי; found otherwise → חשבונית;
 * no number and negative → קבלה (receipt left on account); no number and positive → פקודת יומן; else אחר.
 */
export function movementDocType(ref: string | null, amount: number, invoiceDocType: string | null | undefined): string {
  const r = str(ref).trim();
  const found = invoiceDocType !== null && invoiceDocType !== undefined;
  if (r && found && str(invoiceDocType).trim() === CREDIT_NOTE) return DOC_CREDIT;
  if (r && amount < 0 && isInvoiceLikeRef(r)) return DOC_CREDIT;
  if (r && found) return DOC_INVOICE;
  if (!r && amount < 0) return DOC_RECEIPT;
  if (!r && amount > 0) return DOC_JOURNAL;
  return DOC_OTHER;
}

const isOpenLine = (l: Item, code: string) => {
  if (str(l?.ACCNAME).trim() !== code) return false;
  const rec = l?.FRECONNUM;
  return rec === null || rec === undefined || rec === '' || Number(rec) === 0;
};

/**
 * The open movements of one FNCTRANS header for one customer (pure). invoiceTypes: invoiceNumber → documentType of the
 * customer's Invoices rows. Lines of another account or already reconciled are skipped.
 */
export function movementsFromFncHeader(header: Item, code: string, invoiceTypes: Map<string, string | null>): PriorityMovement[] {
  const out: PriorityMovement[] = [];
  const fncnum = str(header?.FNCNUM).trim();
  if (!fncnum) return out;
  const lines: Item[] = Array.isArray(header?.FNCITEMS_SUBFORM) ? header.FNCITEMS_SUBFORM : [];
  for (const l of lines) {
    if (!isOpenLine(l, code)) continue;
    const ref = textOrNull(l.FNCIREF1);
    const amount = round2(num(l.DEBIT1) - num(l.CREDIT1));
    out.push({
      customerCode: code,
      movementId: `${fncnum}:${str(l.KLINE).trim()}`,
      docType: movementDocType(ref, amount, ref && invoiceTypes.has(ref) ? (invoiceTypes.get(ref) ?? '') : null),
      docNumber: ref || fncnum,
      docDate: dateOnly(header.BALDATE),
      dueDate: dateOnly(l.FNCDATE) ?? dateOnly(header.FNCDATE),
      amount,
      details: textOrNull(l.DETAILS) ?? textOrNull(header.DETAILS),
    });
  }
  return out;
}

/** The FNCTRANS read of one customer (one page). */
export function fncReadInput(code: string, cutoff: string | null, skip: number) {
  const q = odataStr(code);
  const acc = `(ACCNAME1 eq ${q} or ACCNAME2 eq ${q})`;
  return {
    entityName: 'FNCTRANS',
    filter: cutoff ? `${acc} and BALDATE ge ${cutoff}T00:00:00+02:00` : acc,
    select: 'FNCNUM,BALDATE,FNCDATE,DETAILS',
    expand: `FNCITEMS_SUBFORM($filter=ACCNAME eq ${q} and FRECONNUM eq 0;$select=KLINE,ACCNAME,FNCIREF1,DEBIT1,CREDIT1,FRECONNUM,DETAILS,FNCDATE)`,
    orderby: 'FNCNUM',
    top: FNC_PAGE,
    ...(skip ? { skip } : {}),
  };
}

/** The cutoff: the setting when it is a date, else its default (2024-01-01). */
export async function movementsCutoff(client: BlocksClient): Promise<string> {
  const fallback = planSettingOf(S_OPEN_MOVEMENTS_FROM_DATE)?.value ?? '2024-01-01';
  try {
    const r = await client.queryTable('AgentSettings', { from: { table: 'AgentSettings' }, where: { column: 'settingKey', value: S_OPEN_MOVEMENTS_FROM_DATE }, limit: 5 });
    const v = str(r?.items?.[0]?.value).trim();
    return ISO_DAY.test(v) ? v : fallback;
  } catch (e) {
    console.error(`[movements] AgentSettings ${S_OPEN_MOVEMENTS_FROM_DATE}: ${errText(e)} – using ${fallback}`);
    return fallback;
  }
}

/** Customers to read: non-internal codes with an invoice on/after the cutoff, or with OpenMovements rows. Sorted. */
export async function movementsCustomers(client: BlocksClient, cutoff: string): Promise<string[]> {
  const [invoices, existing] = await Promise.all([
    readAll(client, 'Invoices', { column: 'invoiceDate', operator: '>=', value: cutoff }),
    readAll(client, 'OpenMovements'),
  ]);
  const codes = new Set<string>();
  for (const r of [...invoices, ...existing]) {
    const c = str(r.customerCode).trim();
    if (c && !isInternalCustomer(c)) codes.add(c);
  }
  return [...codes].sort();
}

async function invoiceTypesOf(client: BlocksClient, code: string): Promise<Map<string, string | null>> {
  const rows = await readAll(client, 'Invoices', { column: 'customerCode', value: code });
  const m = new Map<string, string | null>();
  for (const r of rows) {
    const no = str(r.invoiceNumber).trim();
    if (no) m.set(no, textOrNull(r.documentType));
  }
  return m;
}

/** Every open movement of one customer; throws when a page cannot be read. */
export async function readCustomerMovements(client: BlocksClient, code: string, cutoff: string | null, invoiceTypes: Map<string, string | null>): Promise<PriorityMovement[]> {
  const byId = new Map<string, PriorityMovement>();
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw new Error(`יותר מ-${MAX_PAGES * FNC_PAGE} תנועות – הקריאה לא הושלמה`);
    const rows = await priorityRead(client, fncReadInput(code, cutoff, page * FNC_PAGE), `FNCTRANS ${code} p${page + 1}`, { retryAllErrors: true });
    for (const h of rows) for (const m of movementsFromFncHeader(h, code, invoiceTypes)) byId.set(m.movementId, m);
    if (rows.length < FNC_PAGE) break;
  }
  return [...byId.values()];
}

interface CursorState {
  id: string | null;
  phase: string;
  customers: string[];
  next: number;
  cutoff: string;
  fullHistory: boolean;
}

async function loadCursor(client: BlocksClient): Promise<CursorState | null> {
  try {
    const r = await client.queryTable('PrioritySyncCursors', { from: { table: 'PrioritySyncCursors' }, where: { column: 'scope', value: CURSOR_SCOPE }, limit: 1 });
    const row = r?.items?.[0];
    if (!row) return null;
    let c: any = row.cursor;
    if (typeof c === 'string') {
      try {
        c = JSON.parse(c);
      } catch {
        c = {};
      }
    }
    return {
      id: str(row.id) || null,
      phase: str(row.phase),
      customers: Array.isArray(c?.customers) ? c.customers.map(str) : [],
      next: Number(c?.next) || 0,
      cutoff: str(c?.cutoff),
      fullHistory: c?.fullHistory === true,
    };
  } catch (e) {
    console.error(`[movements] cursor read failed: ${errText(e)}`);
    return null;
  }
}

async function saveCursor(client: BlocksClient, id: string | null, s: Omit<CursorState, 'id'>, done: boolean) {
  const now = new Date().toISOString();
  const row: Item = {
    scope: CURSOR_SCOPE,
    mode: s.fullHistory ? 'טעינה ראשונה' : 'דלתא',
    phase: done ? PHASE_DONE : PHASE_READING,
    cursor: { customers: done ? [] : s.customers, next: done ? 0 : s.next, cutoff: s.cutoff, fullHistory: s.fullHistory },
    pendingCount: done ? 0 : Math.max(0, s.customers.length - s.next),
    updatedAt: now,
    ...(done ? { lastFullReadAt: now } : {}),
  };
  if (id) await client.updateItem('PrioritySyncCursors', id, row);
  else await client.createItem('PrioritySyncCursors', row);
}

/** Priority direct: GET only, sequential, one customer at a time. */
export const priorityMovementsSource: MovementsSource = {
  name: PRIORITY_DIRECT_SOURCE,
  connected: true,
  async fetchOpenMovements(q: MovementsQuery): Promise<MovementsAnswer> {
    const { client } = q;
    const fullHistory = q.fullHistory === true;
    const cutoff = q.cutoff && ISO_DAY.test(q.cutoff) ? q.cutoff : await movementsCutoff(client);
    const explicit = Array.isArray(q.customerCodes) && q.customerCodes.length > 0;
    const notes: string[] = [];

    // ---- the pass: resume the cursor's, or plan a new one ----
    let plan: string[];
    let start = 0;
    let resumed = false;
    const cur = explicit ? null : await loadCursor(client);
    if (explicit) {
      plan = [...new Set(q.customerCodes!.map((c) => str(c).trim()).filter(Boolean))];
    } else if (q.resume !== false && cur && cur.phase === PHASE_READING && cur.cutoff === cutoff && cur.fullHistory === fullHistory && cur.next < cur.customers.length) {
      plan = cur.customers;
      start = cur.next;
      resumed = true;
    } else {
      plan = await movementsCustomers(client, cutoff);
    }
    console.log(`[movements] cutoff=${cutoff} fullHistory=${fullHistory} customers=${plan.length} start=${start} resumed=${resumed}`);

    const customers: string[] = [];
    const movements: PriorityMovement[] = [];
    const incomplete: IncompleteCustomer[] = [];
    const older: OlderThanCutoff = { cutoff, count: 0, sum: 0, byCustomer: {} };
    let i = start;
    for (; i < plan.length; i++) {
      if (q.readDeadline && Date.now() >= q.readDeadline) break;
      const code = plan[i];
      try {
        const types = await invoiceTypesOf(client, code);
        const ms = await readCustomerMovements(client, code, fullHistory ? null : cutoff, types);
        customers.push(code);
        movements.push(...ms);
        if (fullHistory) {
          for (const m of ms) {
            if (!m.docDate || m.docDate >= cutoff) continue;
            older.count++;
            older.sum = round2(older.sum + m.amount);
            const b = (older.byCustomer[code] ??= { count: 0, sum: 0 });
            b.count++;
            b.sum = round2(b.sum + m.amount);
          }
        }
        console.log(`[movements] ${i + 1}/${plan.length} ${code}: ${ms.length} open lines`);
      } catch (e) {
        incomplete.push({ customerCode: code, error: errText(e) });
        console.error(`[movements] ${i + 1}/${plan.length} ${code} incomplete: ${errText(e)}`);
      }
    }
    const remaining = plan.length - i;
    if (remaining) notes.push(`נגמר זמן הקריאה: ${remaining} לקוחות נשארו להרצה הבאה`);
    if (incomplete.length) notes.push(`${incomplete.length} לקוחות לא נקראו עד הסוף – התנועות הקיימות שלהם נשארו`);

    const answer: MovementsAnswer = {
      customers,
      movements,
      incomplete,
      customersPlanned: plan.length,
      remaining,
      needsResume: remaining > 0,
      resumed,
      cutoff,
      fullHistory,
      olderThanCutoff: fullHistory ? older : null,
      notes,
    };
    if (!explicit && !q.dryRun) {
      const next = i;
      answer.afterWrite = async (ok: boolean) => {
        if (!ok) {
          console.log('[movements] write not complete – cursor not advanced');
          return;
        }
        try {
          await saveCursor(client, cur?.id ?? null, { phase: PHASE_READING, customers: plan, next, cutoff, fullHistory }, next >= plan.length);
          console.log(`[movements] cursor saved next=${next}/${plan.length}`);
        } catch (e) {
          console.error(`[movements] cursor save failed: ${errText(e)}`);
          notes.push(`שמירת הסמן נכשלה: ${errText(e)}`);
        }
      };
    }
    return answer;
  },
};

/** The default source of pullOpenMovements (RunDaySchedule's phases). PullOpenMovements passes priorityMovementsSource. */
export const movementsSource: MovementsSource = notConnectedMovementsSource;
