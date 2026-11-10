// CheckDebt as a shared function – plan 04.11 part B, stage 5 (b/debt-allocation). Runs right after a receipt is approved
// (IssueReceipt – modes certain / one and the customerAutoApproveAt auto-approval – and later PullAgentReceipts) and on
// demand (the CheckDebt action). It replaces the old invoice matching ladder: Priority looks at balances per due month, so
// the first check is against months, not invoices.
//
// Per receipt (Receipts by receiptKey; approved / issued only): the receipt amount against the customer's OpenMovements,
// summed per due month (dueMonth, else the month of dueDate), oldest month first:
//   1. equal (±0.01 ₪) to the CUMULATIVE balance through some due month → נסגר לאפס – מצטבר, debtCheckMonths = every month
//      with a balance up to and including that month (comma separated YYYY-MM; the first such month wins);
//   2. else exactly equal to the balance of ONE due month → נסגר לאפס – חודש אחד with that month (the oldest when several
//      months have the same balance);
//   both → matchStatus פיזור מוצע – לאישור and the alert נסגר לאפס (isAlert true, nothing to do; taskKey
//   debt-zero:<receiptKey>). The proposal itself comes from ProposeAllocation (stage 6).
//   3. otherwise → לברר מול הלקוח, no proposal, matchStatus על חשבון – צריך פיזור and an open task לברר מול הלקוח – סכום
//      לא סוגר חודש for the customer's bookkeeper (taskKey debt-check:<receiptKey>).
// matchStatus is written only while the receipt is not allocated yet (empty / על חשבון / פיזור מוצע); an allocated receipt
// keeps its matchStatus.
//
// An OpenMovements mirror with no rows at all = unknown (the pull never ran or failed): nothing is decided, an error is
// returned. A customer with no rows in a non-empty mirror has no open debt → לברר מול הלקוח.
// Idempotent: a receipt that already has a debtCheckResult is not judged again (the movements may by then include the
// receipt itself); its task / alert is only re-ensured (a task a person closed stays closed). Write order: the receipt's
// fields, read back, then the task. Never writes to Priority; sends nothing. The tasks are outside the 06:00 scan
// (parseTaskKey does not know their kinds) – their writers own them.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { hebrewMonthLabel, isMonthKey, monthKeyOf, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, errText, formatIls, isFixtureCustomer, num, ownerOf, readByIds, readSettings, readWhereIn, round2, str } from './collections-data.ts';
import { MS_ON_ACCOUNT_SPREAD, nextNoonIso, stageTaskRow } from './collections-receipt-flow.ts';
import { RS_APPROVED, RS_ISSUED } from './collections-receipt-record.ts';
import { computeSeverity, severityConfigFrom } from './collections-severity.ts';
import { openKeyedTask } from './collections-task-upsert.ts';
import { A_RECEIPT } from './collections-tasks.ts';

// ---------- enums (exactly as in the table artifacts) ----------
/** Receipts.debtCheckResult */
export const DC_CUMULATIVE = 'נסגר לאפס – מצטבר';
export const DC_SINGLE = 'נסגר לאפס – חודש אחד';
export const DC_ASK = 'לברר מול הלקוח';
export const DC_RESULTS = [DC_CUMULATIVE, DC_SINGLE, DC_ASK];
/** Receipts.matchStatus after a zero close (ProposeAllocation writes the proposal itself) */
export const MS_SPREAD_PROPOSED = 'פיזור מוצע – לאישור';
/** matchStatus values a debt check may overwrite (the receipt is not allocated yet) */
const PRE_ALLOCATION = ['', MS_ON_ACCOUNT_SPREAD, MS_SPREAD_PROPOSED];
/** CollectionQueue.taskType */
export const TT_ZERO_CLOSED = 'נסגר לאפס';
export const TT_ASK_CUSTOMER = 'לברר מול הלקוח – סכום לא סוגר חודש';
export const debtCheckTaskKey = (receiptKey: unknown) => `debt-check:${str(receiptKey).trim()}`;
export const zeroAlertKey = (receiptKey: unknown) => `debt-zero:${str(receiptKey).trim()}`;

const EPS = 0.01 + 1e-9;
const ils = (n: number) => `${formatIls(n)} ש״ח`;
const isApproved = (r: Item | null | undefined) => [RS_APPROVED, RS_ISSUED].includes(str(r?.receiptStatus).trim());
export const isZeroClose = (result: unknown) => result === DC_CUMULATIVE || result === DC_SINGLE;
const monthText = (m: string) => (isMonthKey(m) ? hebrewMonthLabel(m) : m);

// ---------- pure ----------
export interface MonthBalance {
  month: string;
  balance: number;
  cumulative: number;
  movements: number;
}

/** The due month of a movement: dueMonth, else the month of dueDate; null when neither is usable. */
export function movementMonthOf(m: Item): string | null {
  const dm = str(m.dueMonth).trim();
  if (isMonthKey(dm)) return dm;
  const d = toIsraelDate(m.dueDate);
  return d ? monthKeyOf(d) : null;
}

/** The customer's balance per due month, oldest first, with the running (cumulative) balance. */
export function monthBalancesOf(movements: Item[]): { months: MonthBalance[]; undated: number } {
  const by = new Map<string, { total: number; count: number }>();
  let undated = 0;
  for (const m of movements) {
    const month = movementMonthOf(m);
    if (!month) {
      undated++;
      continue;
    }
    const cur = by.get(month) ?? { total: 0, count: 0 };
    cur.total = round2(cur.total + num(m.amount));
    cur.count++;
    by.set(month, cur);
  }
  let running = 0;
  const months = [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => {
      running = round2(running + v.total);
      return { month, balance: v.total, cumulative: running, movements: v.count };
    });
  return { months, undated };
}

export interface DebtEvaluation {
  result: string;
  months: string[];
  amount: number;
  totalOpen: number;
  balances: MonthBalance[];
  /** other months with the same balance when a single month closed (the oldest was taken) */
  sameBalanceMonths: string[];
  explanation: string;
}

/** The debt check of one amount against one customer's movements. Pure. */
export function evaluateDebt(amountRaw: number, movements: Item[]): DebtEvaluation {
  const amount = round2(Math.abs(num(amountRaw)));
  const { months: balances, undated } = monthBalancesOf(movements);
  const totalOpen = balances.length ? balances[balances.length - 1].cumulative : 0;
  const undatedNote = undated ? ` (${undated === 1 ? 'תנועה אחת' : `${undated} תנועות`} בלי חודש פירעון לא נספרו)` : '';
  const base = { amount, totalOpen, balances, sameBalanceMonths: [] as string[] };
  if (amount > EPS) {
    // 1. cumulative through some month (the first such month)
    const cut = balances.findIndex((b) => Math.abs(b.cumulative - amount) <= EPS);
    if (cut >= 0) {
      const through = balances.slice(0, cut + 1).filter((b) => Math.abs(b.balance) > EPS);
      const months = through.map((b) => b.month);
      const parts = through.map((b) => `${monthText(b.month)} ${ils(b.balance)}`).join(', ');
      return {
        ...base,
        result: DC_CUMULATIVE,
        months,
        explanation:
          months.length === 1
            ? `הסכום ${ils(amount)} שווה ליתרה הפתוחה עד סוף חודש הפירעון ${monthText(months[0])} – נסגר לאפס.${undatedNote}`
            : `הסכום ${ils(amount)} שווה ליתרה המצטברת עד סוף חודש הפירעון ${monthText(months[months.length - 1])} (${parts}) – נסגר לאפס.${undatedNote}`,
      };
    }
    // 2. exactly one month's balance (the oldest when several months match)
    const single = balances.filter((b) => Math.abs(b.balance - amount) <= EPS);
    if (single.length) {
      const [first, ...others] = single;
      return {
        ...base,
        result: DC_SINGLE,
        months: [first.month],
        sameBalanceMonths: others.map((b) => b.month),
        explanation: `הסכום ${ils(amount)} שווה בדיוק ליתרה של חודש הפירעון ${monthText(first.month)} – נסגר לאפס.${
          others.length ? ` גם ל${others.length === 1 ? 'חודש' : 'חודשים'} ${others.map((b) => monthText(b.month)).join(', ')} אותה יתרה – הוצע החודש הוותיק.` : ''
        }${undatedNote}`,
      };
    }
  }
  const why = !balances.length
    ? `ללקוח אין תנועות פתוחות ב-Priority – הסכום ${ils(amount)} לא סוגר אף חודש`
    : `הסכום ${ils(amount)} לא שווה ליתרה המצטברת עד אף חודש פירעון ולא ליתרה של חודש אחד (יתרה פתוחה כוללת ${ils(totalOpen)}: ${balances
        .filter((b) => Math.abs(b.balance) > EPS)
        .map((b) => `${monthText(b.month)} ${ils(b.balance)}`)
        .join(', ')})`;
  return { ...base, result: DC_ASK, months: [], explanation: `${why} – לברר מול הלקוח על מה התשלום.${undatedNote}` };
}

/**
 * True when a movement is the receipt itself in Priority (a קבלה whose document number is the receipt's
 * priorityReceiptNumber or its receiptKey): a receipt is never judged against its own credit. Matters for an agent's
 * cheque (stage 7), which is already in Priority when the mirror is pulled.
 */
export function isOwnMovement(m: Item, receipt: Item): boolean {
  if (str(m.docType).trim() !== 'קבלה') return false;
  const no = str(m.docNumber).trim();
  if (!no) return false;
  return no === str(receipt.priorityReceiptNumber).trim() || no === str(receipt.receiptKey).trim();
}

// ---------- I/O ----------
export interface DebtCheckDeps {
  nowIso?: string;
  /** already-read AgentSettings (IssueReceipt passes its own) */
  settings?: Map<string, string>;
}

/** True when OpenMovements has at least one row (an empty mirror = the pull never ran / failed: nothing is judged). */
async function mirrorHasRows(client: BlocksClient): Promise<boolean> {
  const res = await client.queryTable('OpenMovements', { from: { table: 'OpenMovements' }, limit: 1 });
  return (res?.items ?? []).length > 0;
}

function taskRowOf(x: { receipt: Item; customer: Item | undefined; owner: string; ev: DebtEvaluation; asOfDate: string; nowIso: string; settings: Map<string, string> }): Item {
  const receiptKey = str(x.receipt.receiptKey);
  const code = str(x.receipt.customerCode).trim();
  const name = str(x.customer?.customerName) || str(x.receipt.customerName) || code;
  const zero = isZeroClose(x.ev.result);
  const isTest = x.receipt.isTestFixture === true || isFixtureCustomer(x.customer, code);
  return stageTaskRow(zero ? zeroAlertKey(receiptKey) : debtCheckTaskKey(receiptKey), {
    taskType: zero ? TT_ZERO_CLOSED : TT_ASK_CUSTOMER,
    title: zero ? `נסגר לאפס – ${name}: קבלה ${ils(x.ev.amount)}` : `לברר מול הלקוח – ${name}: ${ils(x.ev.amount)} לא סוגר חודש`,
    reasons: zero
      ? `קבלה ${receiptKey}: ${x.ev.explanation} מוצע פיזור לחשבוניות של ${x.ev.months.length === 1 ? 'החודש' : 'החודשים'} ${x.ev.months.join(', ')} – לאישור בעורך הפיזור.`
      : `קבלה ${receiptKey}: ${x.ev.explanation} הקבלה נשארת על חשבון עד שיתברר מה היא משלמת, ואז מפזרים אותה לחשבוניות.`,
    recommendedAction: A_RECEIPT,
    severity: computeSeverity({ amount: zero ? 0 : x.ev.amount, daysOverdue: 0 }, severityConfigFrom(x.settings)),
    customerCode: code,
    customerName: name,
    owner: x.owner || null,
    amount: x.ev.amount,
    invoiceNumbers: [],
    relatedTable: 'Receipts',
    relatedId: receiptKey,
    dueAt: nextNoonIso(x.asOfDate),
    asOfDate: x.asOfDate,
    nowIso: x.nowIso,
    isTestFixture: isTest,
    isAlert: zero,
  });
}

/**
 * input: { receiptKeys: string[], dryRun?: boolean, asOfDate?: 'YYYY-MM-DD' }.
 * Returns { ok, dryRun, results: [{ receiptKey, customerCode, customerName, amount, result, months[], matchStatus, taskKey,
 * explanation, already?, skippedReason? }], alerts, tasks, writeVerified, errors }.
 */
export async function checkDebt(client: BlocksClient, input: Item, deps: DebtCheckDeps = {}): Promise<Item> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const dryRun = input?.dryRun === true || input?.dryRun === 'true';
  const keys = [...new Set((Array.isArray(input?.receiptKeys) ? input.receiptKeys : []).map((x: unknown) => str(x).trim()).filter(Boolean))] as string[];
  const errors: string[] = [];
  const out: Item = { ok: false, dryRun, results: [] as Item[], alerts: 0, tasks: 0, writeVerified: false, errors };
  if (!keys.length) {
    errors.push('חסרות קבלות (receiptKeys)');
    return out;
  }
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    errors.push(errText(e));
    return out;
  }

  let receipts: Item[];
  let hasRows: boolean;
  try {
    [receipts, hasRows] = await Promise.all([readWhereIn(client, 'Receipts', 'receiptKey', keys), mirrorHasRows(client)]);
  } catch (e) {
    errors.push(`קריאת הנתונים נכשלה – לא הוכרע דבר: ${errText(e)}`);
    return out;
  }
  if (!hasRows) {
    errors.push('אין תנועות פתוחות בכלל (OpenMovements ריקה – משיכה שנכשלה או מקור ריק) – בדיקת החוב לא הוכרעה. להריץ שוב אחרי משיכת התנועות.');
    for (const k of keys) out.results.push({ receiptKey: k, result: '', months: [], taskKey: '', skippedReason: 'OpenMovements ריקה – לא הוכרע' });
    return out;
  }
  const receiptOf = (k: string) => [...receipts].filter((r) => str(r.receiptKey) === k).sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0] ?? null;

  // ---------- which receipts are judged ----------
  const todo: Item[] = [];
  for (const k of keys) {
    const r = receiptOf(k);
    const skip = (reason: string) => out.results.push({ receiptKey: k, customerCode: str(r?.customerCode), result: str(r?.debtCheckResult), months: [], taskKey: '', skippedReason: reason });
    if (!r) skip('הקבלה לא נמצאה');
    else if (!isApproved(r)) skip('הקבלה עוד לא אושרה – בדיקת החוב רצה אחרי האישור');
    else if (!str(r.customerCode).trim()) skip('לקבלה אין לקוח');
    else if (round2(Math.abs(num(r.amount))) <= 0.005) skip('סכום הקבלה 0');
    else todo.push(r);
  }
  if (!todo.length) {
    out.ok = true;
    out.writeVerified = !dryRun;
    return out;
  }

  const codes = [...new Set(todo.map((r) => str(r.customerCode).trim()))];
  let movements: Item[];
  let customers: Item[];
  let owners: Item[];
  let settings: Map<string, string>;
  try {
    [movements, customers, owners, settings] = await Promise.all([
      readWhereIn(client, 'OpenMovements', 'customerCode', codes),
      readWhereIn(client, 'Customers', 'customerCode', codes),
      readWhereIn(client, 'CustomerOwners', 'customerCode', codes).catch(() => [] as Item[]),
      deps.settings ? Promise.resolve(deps.settings) : readSettings(client),
    ]);
  } catch (e) {
    errors.push(`קריאת התנועות הפתוחות נכשלה – לא הוכרע דבר: ${errText(e)}`);
    return out;
  }
  const ownerMap = buildOwnerMap(owners);

  let verified = true;
  for (const r of todo) {
    const receiptKey = str(r.receiptKey);
    const code = str(r.customerCode).trim();
    const customer = customers.find((c) => str(c.customerCode).trim() === code);
    const owner = ownerOf(code, customer, ownerMap);
    const stored = str(r.debtCheckResult).trim();
    const already = DC_RESULTS.includes(stored);
    let ev: DebtEvaluation;
    if (already) {
      // decided earlier: never judged again – the stored result stands
      ev = {
        result: stored,
        months: str(r.debtCheckMonths).split(',').map((m) => m.trim()).filter(Boolean),
        amount: round2(Math.abs(num(r.amount))),
        totalOpen: 0,
        balances: [],
        sameBalanceMonths: [],
        explanation: storedExplanation(stored, str(r.debtCheckMonths), num(r.amount)),
      };
    } else {
      ev = evaluateDebt(num(r.amount), movements.filter((m) => str(m.customerCode).trim() === code && !isOwnMovement(m, r)));
    }
    const zero = isZeroClose(ev.result);
    const currentMatch = str(r.matchStatus).trim();
    const matchStatus = PRE_ALLOCATION.includes(currentMatch) ? (zero ? MS_SPREAD_PROPOSED : MS_ON_ACCOUNT_SPREAD) : currentMatch;
    const taskKey = zero ? zeroAlertKey(receiptKey) : debtCheckTaskKey(receiptKey);
    const res: Item = {
      receiptKey,
      customerCode: code,
      customerName: str(customer?.customerName) || str(r.customerName) || code,
      amount: ev.amount,
      result: ev.result,
      months: ev.months,
      matchStatus,
      taskKey,
      isAlert: zero,
      explanation: ev.explanation,
      ...(already ? { already: true } : {}),
      ...(ev.sameBalanceMonths.length ? { sameBalanceMonths: ev.sameBalanceMonths } : {}),
    };
    out.results.push(res);
    if (zero) out.alerts++;
    else out.tasks++;
    if (dryRun) continue;

    // 1. the receipt (only when something changes), read back
    const fields: Item = {};
    if (!already) {
      fields.debtCheckResult = ev.result;
      fields.debtCheckMonths = ev.months.join(',') || null;
    }
    if (matchStatus !== currentMatch) fields.matchStatus = matchStatus;
    if (Object.keys(fields).length) {
      try {
        await client.updateItem('Receipts', str(r.id), fields);
        const [back] = await readByIds(client, 'Receipts', [str(r.id)]);
        const ok = !!back && Object.entries(fields).every(([k, v]) => str(back[k]) === str(v));
        if (!ok) {
          verified = false;
          errors.push(`Receipts ${receiptKey}: תוצאת בדיקת החוב לא נקראה בחזרה כפי שנכתבה – המשימה לא נפתחה`);
          res.writeVerified = false;
          continue;
        }
      } catch (e) {
        verified = false;
        errors.push(`Receipts ${receiptKey}: ${errText(e)} – בדיקת החוב לא נשמרה`);
        res.writeVerified = false;
        continue;
      }
    }
    // 2. the alert / task (a task a person closed stays closed)
    const task = await openKeyedTask(client, { row: taskRowOf({ receipt: { ...r, ...fields }, customer, owner, ev, asOfDate, nowIso, settings }), nowIso, asOfDate, dryRun: false });
    res.taskChange = task.change;
    res.writeVerified = task.writeVerified;
    if (!task.writeVerified) verified = false;
    errors.push(...task.errors);
  }
  out.ok = true;
  out.writeVerified = !dryRun && verified;
  return out;
}

/** The sentence of a result decided in an earlier run. */
function storedExplanation(result: string, monthsRaw: string, amount: number): string {
  const months = monthsRaw.split(',').map((m) => m.trim()).filter(Boolean);
  const a = ils(round2(Math.abs(amount)));
  if (result === DC_CUMULATIVE) return `נבדק קודם: הסכום ${a} סגר לאפס את היתרה המצטברת עד ${monthText(months[months.length - 1] ?? '')}${months.length > 1 ? ` (${months.map(monthText).join(', ')})` : ''}.`;
  if (result === DC_SINGLE) return `נבדק קודם: הסכום ${a} סגר לאפס את חודש הפירעון ${monthText(months[0] ?? '')}.`;
  return `נבדק קודם: הסכום ${a} לא סגר אף חודש פירעון – לברר מול הלקוח.`;
}

/**
 * What the debt check WOULD decide for an amount of a customer right now, without writing anything (ExplainMatch, for a
 * receipt not checked yet). An empty mirror → evaluation null with the reason.
 */
export async function previewDebtCheck(client: BlocksClient, customerCode: string, amount: number): Promise<{ evaluation: DebtEvaluation | null; error: string }> {
  const code = str(customerCode).trim();
  if (!code) return { evaluation: null, error: 'אין לקוח – אין בדיקת חוב' };
  try {
    if (!(await mirrorHasRows(client))) return { evaluation: null, error: 'אין תנועות פתוחות בכלל (OpenMovements ריקה) – אי אפשר לבדוק חוב עד המשיכה הבאה' };
    const movements = await readWhereIn(client, 'OpenMovements', 'customerCode', [code]);
    return { evaluation: evaluateDebt(amount, movements), error: '' };
  } catch (e) {
    return { evaluation: null, error: `OpenMovements: ${errText(e)}` };
  }
}
