// GetWeekBrief, pure part: the calendar week (Sunday..Saturday, Israel dates) as the aging report sees it, and
// today's bank work day of receipts. Everything is computed from rows the action loaded; nothing is written.
//
// Week items (one list, sorted by date then amount desc, nulls last):
//   פירעון            – open invoices (net of payments the app saw) due this week: one item per customer per due date
//                       (the newest active CustomerNotes row of that customer + due month is shown with it)
//   הבטחת תשלום       – CustomerNotes commitments (התחייבות לתשלום) whose actionDate is this week; status = outcome
//   שולם לטענת הלקוח  – no longer produced (the old aging-note type is gone; kept in the enum for the screens)
//   בירור             – active CustomerNotes אחר notes labelled "בירור – …" whose actionDate / reminderDate is this week
//   הבטחה שהופרה     – active commitments לא קוימה / קוימה חלקית whose actionDate is in the 14 days before the week
//                       (date null)
// Notes are CustomerNotes rows (one customer + one due month); the old aging notes / payment promises were removed.
import type { Item } from '../shared/blocks/blocks-client.ts';
import { addDays, formatDayMonth, formatShortDate, HEBREW_DAY_LETTERS, sortableTime, toIsraelDate, weekday } from '../shared/collections-dates.ts';
import { buildOwnerMap, formatIls, num, numOrNull, ownerOf, round2, str } from '../shared/collections-data.ts';
import { latestSyncedAt } from '../shared/collections-aging.ts';
import { applyLiveLayer, effectiveOpen } from '../shared/collections-invoice-layer.ts';
import { BANK_LINE_KINDS, batchWorkDay, CS_APPROVED, CS_PENDING, CS_UNIDENTIFIED, isMoneyInLine, isVerifiedBankBatch, workDayOf } from '../shared/collections-receipts.ts';

export const K_DUE = 'פירעון';
export const K_PROMISE = 'הבטחת תשלום';
export const K_CLAIM = 'שולם לטענת הלקוח';
export const K_DISPUTE = 'בירור';
export const K_BROKEN = 'הבטחה שהופרה';

// CustomerNotes enums (as in the artifact)
const NT_COMMITMENT = 'התחייבות לתשלום';
const NT_OTHER = 'אחר';
const ST_ACTIVE = 'פעילה';
const ST_MONTH_ZERO = 'נסגרה – החודש התאפס';
const OUT_OPEN = 'פתוחה';
const OUT_KEPT = 'קוימה';
const OUT_PARTLY = 'קוימה חלקית';
const OUT_NOT_KEPT = 'לא קוימה';
const DISPUTE_LABEL_PREFIX = 'בירור';
/** the outcome shown for a commitment (a month that reached 0 counts as kept) */
const outcomeOf = (n: Item) => (str(n.status).trim() === ST_MONTH_ZERO ? OUT_KEPT : str(n.outcome).trim() || OUT_OPEN);
const noteTypeLabel = (n: Item) => {
  const t = str(n.noteType).trim() || NT_OTHER;
  const custom = str(n.customTypeLabel).trim();
  return t === NT_OTHER && custom ? custom : t;
};
/** what a commitment promised: its amount, else the month's balance when it was written */
const promisedOf = (n: Item) => {
  const a = numOrNull(n.amount);
  return round2(a !== null ? a : Math.max(0, num(n.balanceAtNote)));
};
const byNoteNewest = (a: Item, b: Item) => sortableTime(b.noteCreatedAt) - sortableTime(a.noteCreatedAt) || Number(b.id ?? 0) - Number(a.id ?? 0);
const MP_PROPOSED = 'מוצעת';
const MP_PAYING = new Set(['אושרה – לביצוע ב-Priority', 'בוצעה ב-Priority']);
/** BankLines.status of a line whose receipt is done in Priority (an approved receipt shows as checkStage אושרה) */
const LINE_ISSUED = 'קבלה הונפקה';
const BOUNCED = 'צ׳ק חוזר';
const CS_AWAITING = 'ממתינה לאישור';

/** Commitments not kept this many days before the week start stay visible. */
export const BROKEN_CARRY_DAYS = 14;
/** A customer with no note written in this many days counts as "overdue without a note". */
export const NO_NOTE_DAYS = 14;
const TOP_OVERDUE = 5;
const MAX_CONCLUSIONS = 6;

export interface WeekBriefInput {
  asOfDate: string;
  bookkeeperName?: string | null;
  customers: Item[];
  owners: Item[];
  /** Invoices with a non-zero open amount (plus any rows with syncedAt for dataAsOf) */
  invoices: Item[];
  /** CustomerNotes rows: the active ones, those written in the last NO_NOTE_DAYS days and commitments dated from
   * (week start − BROKEN_CARRY_DAYS) on */
  notes: Item[];
  /** approved / recently done MatchProposals (live invoice layer) */
  payingMatches: Item[];
  /** rows carrying the latest Invoices.syncedAt */
  lastSynced?: Item[];
  /** ImportBatches of kind קובץ בנק and שורות דפי בנק – Priority */
  batches: Item[];
  /** BankLines of the work day's batches */
  lines: Item[];
  /** MatchProposals of the work day's batches */
  lineProposals: Item[];
}

export interface WeekItem {
  id: string;
  date: string | null;
  kind: string;
  customerCode: string;
  customerName: string;
  bookkeeperName: string;
  invoiceNumbers: string[];
  amount: number;
  status: string;
  noteText: string | null;
  noteType: string | null;
  promiseId: string | null;
  noteId: string | null;
}

// ---------- Hebrew ----------
const ils = (n: number) => `${formatIls(Math.round(n))} ₪`;
const dayLetter = (d: string) => HEBREW_DAY_LETTERS[weekday(d)];
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
const isInvoiceDoc = (inv: Item) => ['', 'חשבונית'].includes(str(inv.documentType).trim());

export function weekOf(asOfDate: string) {
  const start = addDays(asOfDate, -weekday(asOfDate));
  const end = addDays(start, 6);
  return { start, end, label: `${formatDayMonth(start)}–${formatDayMonth(end)}` };
}

export function computeWeekBrief(x: WeekBriefInput) {
  const asOf = x.asOfDate;
  const { start, end, label } = weekOf(asOf);
  const inWeek = (d: string | null) => !!d && d >= start && d <= end;
  const bk = str(x.bookkeeperName).trim() || null;

  const customersByCode = new Map(x.customers.map((c) => [str(c.customerCode), c]));
  const ownerMap = buildOwnerMap(x.owners);
  const ownerOfCode = (code: string) => ownerOf(code, customersByCode.get(code), ownerMap);
  const mine = (code: string) => !bk || (!!code && ownerOfCode(code) === bk);
  const nameOf = (code: string, fallback?: unknown) => str(customersByCode.get(code)?.customerName) || str(fallback) || code;

  // ---------- invoices with the live layer (payment seen from the matches); notes from CustomerNotes ----------
  const invoices = applyLiveLayer(x.invoices, x.payingMatches).filter((i) => mine(str(i.customerCode)));
  const openInvoices = invoices.filter((i) => isInvoiceDoc(i) && effectiveOpen(i) > 0.005);
  const notes = x.notes.filter((n) => mine(str(n.customerCode)));
  const activeNotesOf = (code: string, month: string) =>
    notes.filter((n) => str(n.customerCode) === code && str(n.dueMonth).trim() === month && str(n.status).trim() === ST_ACTIVE).sort(byNoteNewest);

  const items: WeekItem[] = [];
  const base = (code: string, fallbackName?: unknown) => ({ customerCode: code, customerName: nameOf(code, fallbackName), bookkeeperName: ownerOfCode(code) });

  // (a) פירעון: one item per customer per due date
  const dueGroups = new Map<string, Item[]>();
  for (const inv of openInvoices) {
    const due = toIsraelDate(inv.dueDate);
    if (!inWeek(due)) continue;
    const key = `${str(inv.customerCode)}|${due}`;
    if (!dueGroups.has(key)) dueGroups.set(key, []);
    dueGroups.get(key)!.push(inv);
  }
  for (const [key, list] of dueGroups) {
    const [code, date] = key.split('|');
    const newest = activeNotesOf(code, date.slice(0, 7))[0];
    items.push({
      id: `due|${code}|${date}`,
      date,
      kind: K_DUE,
      ...base(code, list[0].customerName),
      invoiceNumbers: list.map((i) => str(i.invoiceNumber)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      amount: round2(list.reduce((s, i) => s + effectiveOpen(i), 0)),
      status: newest ? 'יש הערה' : 'פתוחה',
      noteText: newest ? str(newest.noteText) || null : null,
      noteType: newest ? noteTypeLabel(newest) : null,
      promiseId: null,
      noteId: newest ? str(newest.id) || null : null,
    });
  }

  // (b) commitments dated this week (status = outcome) and (e) not kept in the 14 days before the week
  const carryFrom = addDays(start, -BROKEN_CARRY_DAYS);
  const promiseItem = (n: Item, kind: string, date: string | null): WeekItem => ({
    id: `${kind === K_BROKEN ? 'broken' : 'promise'}|${str(n.id)}`,
    date,
    kind,
    ...base(str(n.customerCode), n.customerName),
    invoiceNumbers: [],
    amount: promisedOf(n),
    status: outcomeOf(n),
    noteText: str(n.noteText) || null,
    noteType: NT_COMMITMENT,
    promiseId: str(n.id) || null,
    noteId: str(n.id) || null,
  });
  let promisesSeenAmount = 0;
  const weekPromises: WeekItem[] = [];
  for (const n of notes) {
    if (str(n.noteType).trim() !== NT_COMMITMENT) continue;
    const date = toIsraelDate(n.actionDate);
    const outcome = outcomeOf(n);
    if (inWeek(date)) {
      weekPromises.push(promiseItem(n, K_PROMISE, date));
      if (outcome === OUT_KEPT) promisesSeenAmount += numOrNull(n.amountReceived) ?? promisedOf(n);
      else if (outcome === OUT_PARTLY) promisesSeenAmount += num(n.amountReceived);
      continue;
    }
    // not kept before the week: still relevant only while the note is active (its month is not at 0)
    if (str(n.status).trim() !== ST_ACTIVE || ![OUT_NOT_KEPT, OUT_PARTLY].includes(outcome) || !date || date < carryFrom || date >= start) continue;
    items.push(promiseItem(n, K_BROKEN, null));
  }
  items.push(...weekPromises);

  // (d) disputes due for follow-up: active "בירור – …" notes whose action / reminder date is this week
  for (const n of notes) {
    if (str(n.status).trim() !== ST_ACTIVE || str(n.noteType).trim() !== NT_OTHER || !str(n.customTypeLabel).trim().startsWith(DISPUTE_LABEL_PREFIX)) continue;
    const date = toIsraelDate(n.actionDate) ?? toIsraelDate(n.reminderDate);
    if (!inWeek(date)) continue;
    const code = str(n.customerCode);
    const month = str(n.dueMonth).trim();
    const invs = openInvoices.filter((i) => str(i.customerCode) === code && (toIsraelDate(i.dueDate) ?? '').slice(0, 7) === month);
    items.push({
      id: `dispute|${str(n.id)}`,
      date,
      kind: K_DISPUTE,
      ...base(code, n.customerName),
      invoiceNumbers: invs.map((i) => str(i.invoiceNumber)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      amount: round2(numOrNull(n.amount) ?? invs.reduce((s, i) => s + effectiveOpen(i), 0)),
      status: 'לבדיקה חוזרת',
      noteText: str(n.noteText) || null,
      noteType: noteTypeLabel(n),
      promiseId: null,
      noteId: str(n.id) || null,
    });
  }
  const claimedInvoices = 0;

  items.sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    }
    return b.amount - a.amount || a.id.localeCompare(b.id);
  });

  // ---------- days ----------
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const dayItems = items.filter((it) => it.date === date);
    return {
      date,
      weekday: HEBREW_DAY_LETTERS[i],
      isToday: date === asOf,
      isPast: date < asOf,
      itemCount: dayItems.length,
      amount: round2(dayItems.filter((it) => it.kind === K_DUE || it.kind === K_PROMISE).reduce((s, it) => s + it.amount, 0)),
    };
  });

  // ---------- overdue ----------
  const overdueByCode = new Map<string, { amount: number; oldest: string }>();
  for (const inv of openInvoices) {
    const due = toIsraelDate(inv.dueDate);
    if (!due || due >= asOf) continue;
    const code = str(inv.customerCode);
    const cur = overdueByCode.get(code) ?? { amount: 0, oldest: due };
    cur.amount = round2(cur.amount + effectiveOpen(inv));
    if (due < cur.oldest) cur.oldest = due;
    overdueByCode.set(code, cur);
  }
  const lastNoteMs = new Map<string, number>();
  for (const n of notes) {
    const code = str(n.customerCode);
    lastNoteMs.set(code, Math.max(lastNoteMs.get(code) ?? 0, sortableTime(n.noteCreatedAt)));
  }
  const noNoteSince = sortableTime(addDays(asOf, -NO_NOTE_DAYS));
  const overdueNoNoteAll = [...overdueByCode.entries()]
    .filter(([code, o]) => o.amount > 0.005 && (lastNoteMs.get(code) ?? 0) < noNoteSince)
    .map(([code, o]) => ({
      customerCode: code,
      customerName: nameOf(code),
      bookkeeperName: ownerOfCode(code),
      overdueAmount: o.amount,
      oldestDueDate: o.oldest,
      lastNoteAt: lastNoteMs.get(code) ? new Date(lastNoteMs.get(code)!).toISOString() : null,
    }))
    .sort((a, b) => b.overdueAmount - a.overdueAmount || a.customerCode.localeCompare(b.customerCode));

  // ---------- KPIs ----------
  const of = (kind: string) => items.filter((it) => it.kind === kind);
  const due = of(K_DUE);
  const promised = of(K_PROMISE);
  const claims = of(K_CLAIM);
  const disputes = of(K_DISPUTE);
  const broken = [...promised.filter((p) => p.status === OUT_NOT_KEPT), ...of(K_BROKEN)];
  const sum = (xs: { amount: number }[]) => round2(xs.reduce((s, it) => s + it.amount, 0));
  const kpis = {
    dueThisWeekAmount: sum(due),
    dueThisWeekCount: due.reduce((s, it) => s + it.invoiceNumbers.length, 0),
    dueThisWeekCustomers: new Set(due.map((it) => it.customerCode)).size,
    promisedThisWeekAmount: sum(promised),
    promisedThisWeekCount: promised.length,
    promisesSeenAmount: round2(promisesSeenAmount),
    brokenPromisesCount: broken.length,
    claimedPaidOpenAmount: sum(claims),
    claimedPaidOpenCount: claimedInvoices,
    disputesFollowUpCount: disputes.length,
    overdueTotal: round2([...overdueByCode.values()].reduce((s, o) => s + o.amount, 0)),
    overdueNoNoteAmount: round2(overdueNoNoteAll.reduce((s, o) => s + o.overdueAmount, 0)),
    overdueNoNoteCustomers: overdueNoNoteAll.length,
  };

  // ---------- conclusions (deterministic Hebrew, most important first) ----------
  const s: Record<string, string | null> = { due: null, promises: null, claims: null, disputes: null, overdue: null, broken: null, promiseToday: null };
  if (due.length) {
    const n = kpis.dueThisWeekCount;
    const c = kpis.dueThisWeekCustomers;
    s.due = `השבוע ${n === 1 ? 'נכנסת' : 'נכנסות'} לפירעון ${plural(n, 'חשבונית אחת', 'חשבוניות')} של ${plural(c, 'לקוח אחד', 'לקוחות')}, ${ils(kpis.dueThisWeekAmount)}.`;
  }
  if (promised.length) {
    const n = promised.length;
    const seen = kpis.promisesSeenAmount;
    s.promises = `${n === 1 ? 'התחייבות אחת מגיעה' : `${n} התחייבויות מגיעות`} השבוע, ${ils(kpis.promisedThisWeekAmount)}${seen > 0.005 ? `; ${ils(seen)} כבר נכנסו` : ''}.`;
    const dueNow = promised.filter((p) => p.date && p.date <= asOf && p.status === OUT_OPEN);
    if (dueNow.length === 1) {
      const p = dueNow[0];
      s.promiseToday = `${p.date === asOf ? 'היום מגיעה' : `ב-${formatShortDate(p.date!)} הגיעה`} התחייבות של ${p.customerName} על ${ils(p.amount)}, ועוד לא נבדקה.`;
    } else if (dueNow.length > 1) {
      s.promiseToday = `${dueNow.length} התחייבויות על ${ils(sum(dueNow))} כבר הגיעו ועוד לא נבדקו: ${dueNow.map((p) => p.customerName).join(', ')}.`;
    }
  }
  if (claims.length) {
    const codes = [...new Set(claims.map((c) => c.customerCode))];
    s.claims =
      codes.length === 1
        ? `לקוח אחד (${claims[0].customerName}) טוען ששילם ${ils(kpis.claimedPaidOpenAmount)} ועדיין לא ראינו את הכסף.`
        : `${codes.length} לקוחות טוענים ששילמו ${ils(kpis.claimedPaidOpenAmount)} ועדיין לא ראינו את הכסף.`;
  }
  if (disputes.length) {
    const letters = [...new Set(disputes.map((d) => d.date!).sort())].map(dayLetter);
    s.disputes =
      disputes.length === 1
        ? `בירור אחד לבדיקה ביום ${letters[0]} (${disputes[0].customerName}).`
        : `${disputes.length} בירורים לבדיקה השבוע (${letters.length === 1 ? `יום ${letters[0]}` : `ימים ${letters.join(', ')}`}).`;
  }
  if (overdueNoNoteAll.length) {
    s.overdue = `${ils(kpis.overdueNoNoteAmount)} בפיגור בלי הערה בשבועיים האחרונים, ${overdueNoNoteAll.length === 1 ? `אצל לקוח אחד (${overdueNoNoteAll[0].customerName})` : `אצל ${overdueNoNoteAll.length} לקוחות`}.`;
  }
  if (broken.length) {
    const promiseDate = (it: WeekItem) => toIsraelDate(notes.find((n) => str(n.id) === it.promiseId)?.actionDate);
    if (broken.length === 1) {
      const b = broken[0];
      const d = promiseDate(b);
      s.broken = `התחייבות של ${b.customerName} על ${ils(b.amount)} לא קוימה${d ? ` (מועד ${formatShortDate(d)})` : ''}.`;
    } else {
      s.broken = `${broken.length} התחייבויות לא קוימו: ${broken
        .map((b) => {
          const d = promiseDate(b);
          return `${b.customerName}${d ? ` (${formatShortDate(d)})` : ''}`;
        })
        .join(', ')}.`;
    }
  }
  // the single most actionable sentence; an empty week gets a calm one saying what is awaited
  const calm =
    kpis.overdueTotal > 0.005
      ? `השבוע לא נכנסות חשבוניות לפירעון ואין התחייבויות או בירורים. ממתינים לתשלום על ${ils(kpis.overdueTotal)} שכבר בפיגור.`
      : 'השבוע שקט: אין חשבוניות לפירעון, התחייבויות או בירורים. ממתינים לקובץ הבנק הבא.';
  const headline = items.length ? (s.broken ?? s.promiseToday ?? s.claims ?? s.due ?? s.disputes ?? s.overdue ?? calm) : calm;
  const conclusions = [s.due, s.promises, s.claims, s.disputes, s.overdue, s.broken]
    .filter((c): c is string => !!c && c !== headline)
    .slice(0, MAX_CONCLUSIONS);

  return {
    asOfDate: asOf,
    dataAsOf: latestSyncedAt([...(x.lastSynced ?? []), ...x.invoices]),
    week: { start, end, label, days },
    aging: { headline, conclusions, kpis, items, overdueNoNote: overdueNoNoteAll.slice(0, TOP_OVERDUE) },
    receipts: receiptsOfDay(x, asOf, mine),
  };
}

// ---------- receipts of the work day ----------
export function receiptsOfDay(x: WeekBriefInput, asOf: string, mine: (code: string) => boolean) {
  const workDay = workDayOf(asOf);
  const batches = x.batches
    .filter((b) => BANK_LINE_KINDS.includes(str(b.kind)) && batchWorkDay(b) === workDay)
    .sort((a, b) => sortableTime(a.uploadedAt) - sortableTime(b.uploadedAt));
  const batchById = new Map(batches.map((b) => [str(b.id), b]));
  const proposalsByLine = new Map<string, Item[]>();
  for (const p of x.lineProposals) {
    const k = str(p.bankLineId);
    if (!proposalsByLine.has(k)) proposalsByLine.set(k, []);
    proposalsByLine.get(k)!.push(p);
  }
  const lines = x.lines.filter((l) => batchById.has(str(l.importBatchId)));
  // a bookkeeper sees her customers' lines and the lines nobody owns yet (not identified)
  const customerOf = (l: Item) => {
    if (str(l.customerCode)) return str(l.customerCode);
    const ps = (proposalsByLine.get(str(l.bankLineId)) ?? []).filter((p) => str(p.customerCode) && (MP_PAYING.has(str(p.status)) || str(p.status) === MP_PROPOSED));
    return ps.length ? str(ps.sort((a, b) => sortableTime(b.proposedAt) - sortableTime(a.proposedAt))[0].customerCode) : '';
  };
  const visible = lines.filter((l) => {
    const code = customerOf(l);
    return !code || mine(code);
  });
  const bounced = visible.filter((l) => str(l.lineType) === BOUNCED);
  // money received: העברה / זיכוי בנק (+ legacy צ׳ק deposits and untyped lines); never פירעון צ׳ק / אחר / צ׳ק חוזר
  const pulled = visible.filter((l) => str(l.lineType) !== BOUNCED && isMoneyInLine(l));
  const proposalsOf = (l: Item) => proposalsByLine.get(str(l.bankLineId)) ?? [];
  const isMatched = (l: Item) => str(l.status) === LINE_ISSUED || str(l.checkStage) === CS_APPROVED || proposalsOf(l).some((p) => MP_PAYING.has(str(p.status)));
  const matched = pulled.filter(isMatched);
  const open = pulled.filter((l) => !isMatched(l));
  // a Priority pull has no reading step: its lines count as verified
  const verified = (l: Item) => isVerifiedBankBatch(batchById.get(str(l.importBatchId)));
  const waitingDecision = open.filter((l) => str(l.checkStage) === CS_AWAITING || proposalsOf(l).some((p) => str(p.status) === MP_PROPOSED));
  const unidentified = open.filter((l) => str(l.checkStage) === CS_UNIDENTIFIED);
  const notChecked = open.filter((l) => !verified(l) || !str(l.checkStage) || str(l.checkStage) === CS_PENDING);
  const amountOf = (xs: Item[]) => round2(xs.reduce((s, l) => s + num(l.amount), 0));

  const dayWord = workDay === asOf ? 'היום' : `ביום ${dayLetter(workDay)}`;
  let summary: string;
  if (!batches.length) {
    summary = workDay === asOf ? 'עוד לא הועלה קובץ בנק היום.' : `עוד לא הועלה קובץ בנק ליום ${dayLetter(workDay)} (${formatShortDate(workDay)}).`;
  } else if (!pulled.length) {
    summary = batches.some((b) => !isVerifiedBankBatch(b))
      ? `קובץ הבנק של ${dayWord === 'היום' ? 'היום' : `יום ${dayLetter(workDay)}`} עוד לא אומת – אין עדיין העברות לתאם.`
      : `בקובץ הבנק של ${dayWord === 'היום' ? 'היום' : `יום ${dayLetter(workDay)}`} אין העברות נכנסות.`;
  } else {
    const n = pulled.length;
    const head = `${n === 1 ? `נמשכה ${dayWord} העברה אחת` : `נמשכו ${dayWord} ${n} העברות`}, ${ils(amountOf(pulled))}.`;
    const w = waitingDecision.length;
    const waiting = w ? ` (${w === 1 ? 'אחת ממתינה' : `${w} ממתינות`} לאישור)` : '';
    const tail =
      matched.length === n
        ? n === 1
          ? ' היא כבר תואמה.'
          : ' כולן תואמו.'
        : matched.length === 0
          ? ` עוד לא תואמה אף אחת${waiting}.`
          : ` ${matched.length === 1 ? 'אחת תואמה' : `${matched.length} תואמו`}, ${open.length === 1 ? 'אחת נשארה' : `${open.length} נשארו`} לתאם${waiting}.`;
    summary = `${head}${tail}`;
  }

  return {
    workDay,
    files: batches.map((b) => ({
      id: str(b.id),
      fileName: str(b.fileName),
      extractionStatus: str(b.extractionStatus) || null,
      checkStatus: str(b.checkStatus) || null,
      uploadedAt: str(b.uploadedAt) || null,
    })),
    pulled: pulled.length,
    pulledAmount: amountOf(pulled),
    matched: matched.length,
    matchedAmount: amountOf(matched),
    waitingDecision: waitingDecision.length,
    toMatch: open.length,
    toMatchAmount: amountOf(open),
    unidentified: unidentified.length,
    notChecked: notChecked.length,
    bounced: bounced.length,
    summary,
  };
}
