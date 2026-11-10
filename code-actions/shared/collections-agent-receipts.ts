// Field agents' cheque receipts – plan 04.11 part B, stage 7 (b/debt-allocation). PullAgentReceipts and the 09:00 / 10:00
// bank-check phase of RunDaySchedule (right after the receipts run).
//
// Source: the Payments mirror (Priority's receipts). An agent receipt = method צ׳ק / צ׳ק דחוי with collectedBy set (the
// field sales agent who issued it in Priority), paymentDate within [asOfDate − sinceDays, asOfDate]. Office receipts
// (collectedBy empty), transfers and cards are never read. How Priority marks an agent receipt is still an open question
// (plan: ask Gila and Navit) – until the API, collectedBy is the marker.
//
// Per agent payment, ONE Receipts row – receiptKey RCPT-AGT-<paymentRef> (stable, so a rerun never creates a second one):
// receiptSource צ׳ק סוכן, the customer already known (no identification step: identifyStatus אושר, identifyConfidence
// 100), receiptStatus אושרה – לא נשלחה (issued in Priority by the agent; nothing is sent – no receipt mail, no draft),
// matchStatus על חשבון – צריך פיזור, priorityReceiptNumber = Payments.receiptNumber, valueDate = paymentDate (the day the
// cheque was received; a post-dated cheque's due date goes in reference), preparedBy = the agent, isTestFixture for
// test data. Skipped: no paymentRef / customer / positive amount, a customer missing from Customers, and a payment that is
// the Priority copy of a receipt we already hold (its receiptNumber is another receipt's priorityReceiptNumber).
// Created → read back (a concurrent duplicate is removed, the earliest row wins).
//
// Then, in-process, the same path as a bank receipt after approval: CheckDebt (collections-debt-check.ts) for every
// receipt created now and every earlier agent receipt that never got a decided debt check, then ProposeAllocation
// (collections-allocation.ts) for each decided one – allocationAutoApproveAt applies there as for any receipt. A failure
// there never undoes the receipt (reported in errors; the next run retries only the missing check).
//
// Notes: the customer's ACTIVE CustomerNotes of type צ׳ק אצל סוכן whose dueMonth is a month the cheque pays – the months
// the debt check closed (debtCheckMonths) plus every due month the allocation proposal puts money on – close, when the
// note has no amount or the cheque covers it (amount ≥ the note's amount). Closed through the notes engine
// (collections-notes.ts updateCustomerNote, close: status נסגרה ידנית + closedAt – the enum's only closing value besides
// "the month reached 0"), with a sentence appended to noteText saying which cheque closed it; the grouped note tasks are
// refreshed by the engine's own sync. A note is closed once even when two cheques match it.
//
// dryRun: writes nothing; lists what would be created, a debt-check preview per payment, and the notes the preview's
// months would close. Never writes to Priority and never contacts anyone.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { addDays, formatDateHe, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { errText, formatIls, isFixtureCustomer, num, numOrNull, readAll, readSettings, readWhereIn, round2, str } from './collections-data.ts';
import { checkDebt, isZeroClose, previewDebtCheck } from './collections-debt-check.ts';
import { proposeAllocation } from './collections-allocation.ts';
import { IS_APPROVED, MS_ON_ACCOUNT_SPREAD } from './collections-receipt-flow.ts';
import { RS_APPROVED } from './collections-receipt-record.ts';
import { isActiveNote, NT_AGENT_CHEQUE, updateCustomerNote } from './collections-notes.ts';
import { noteWriteSyncs } from './collections-note-runs.ts';

// ---------- enums (exactly as in the table artifacts) ----------
/** Payments.method values of a cheque */
export const METHOD_CHEQUE = 'צ׳ק';
export const METHOD_POSTDATED = 'צ׳ק דחוי';
export const AGENT_CHEQUE_METHODS = [METHOD_CHEQUE, METHOD_POSTDATED];
/** Receipts.receiptSource */
export const RSRC_AGENT = 'צ׳ק סוכן';
export const DEFAULT_SINCE_DAYS = 14;
const MAX_SINCE_DAYS = 365;
const LABEL = 'PullAgentReceipts';
const EPS = 0.01 + 1e-9;

export const agentReceiptKey = (paymentRef: unknown) => `RCPT-AGT-${str(paymentRef).trim()}`;
export const isAgentPayment = (p: Item) => AGENT_CHEQUE_METHODS.includes(str(p.method).trim()) && str(p.collectedBy).trim() !== '';
const ils = (n: number) => `${formatIls(n)} ש״ח`;
const earliest = (rows: Item[]) => [...rows].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0] ?? null;

// ---------- pure ----------
/** The Receipts row of one agent payment (customer = the Customers row when known). Pure. */
export function agentReceiptRow(p: Item, customer: Item | undefined, nowIso: string): Item {
  const code = str(p.customerCode).trim();
  const name = str(customer?.customerName).trim() || str(p.customerName).trim() || code;
  const amount = round2(Math.abs(num(p.amount)));
  const method = str(p.method).trim();
  const number = str(p.receiptNumber).trim();
  const due = toIsraelDate(p.checkDueDate);
  const agent = str(p.collectedBy).trim();
  return {
    receiptKey: agentReceiptKey(p.paymentRef),
    bankLineId: null,
    importBatchId: null,
    matchProposalId: null,
    customerCode: code,
    customerName: name,
    payerName: name,
    reference: `${method}${number ? ` – קבלה ${number}` : ''}${method === METHOD_POSTDATED && due ? `, לפירעון ${formatDateHe(due)}` : ''} (סוכן: ${agent})`,
    valueDate: toIsraelDate(p.paymentDate),
    amount,
    allocatedAmount: 0,
    unallocatedAmount: amount,
    matchStatus: MS_ON_ACCOUNT_SPREAD,
    receiptStatus: RS_APPROVED,
    priorityReceiptNumber: number || null,
    preparedBy: agent,
    preparedAt: nowIso,
    issuedBy: null,
    issuedAt: null,
    isTestFixture: false,
    identifyConfidence: 100,
    identifyStatus: IS_APPROVED,
    debtCheckResult: null,
    debtCheckMonths: null,
    allocationConfidence: null,
    sentToEmail: null,
    sentAt: null,
    sendStatus: null,
    receiptSource: RSRC_AGENT,
  };
}

/**
 * The due months a cheque pays: the months its debt check closed, plus every month the allocation proposal puts money on
 * (proposal.months[].invoices[].proposed > 0). Pure.
 */
export function paidMonthsOf(x: { debtCheckResult?: unknown; debtCheckMonths?: unknown; proposalMonths?: Item[] | null }): string[] {
  const out = new Set<string>();
  if (isZeroClose(str(x.debtCheckResult).trim())) for (const m of str(x.debtCheckMonths).split(',')) if (m.trim()) out.add(m.trim());
  for (const m of x.proposalMonths ?? []) {
    if ((m?.invoices ?? []).some((i: Item) => num(i.proposed) > 0.005) && str(m.dueMonth).trim()) out.add(str(m.dueMonth).trim());
  }
  return [...out].sort();
}

/** Which of the customer's active צ׳ק אצל סוכן notes a cheque closes, and why the others of those months stay. Pure. */
export function notesToClose(notes: Item[], x: { customerCode: string; months: string[]; amount: number }): { close: Item[]; kept: { noteId: string; reason: string }[] } {
  const months = new Set(x.months);
  const close: Item[] = [];
  const kept: { noteId: string; reason: string }[] = [];
  for (const n of notes) {
    if (str(n.customerCode).trim() !== x.customerCode || str(n.noteType).trim() !== NT_AGENT_CHEQUE || !isActiveNote(n)) continue;
    if (!months.has(str(n.dueMonth).trim())) continue;
    const noteAmount = numOrNull(n.amount);
    if (noteAmount !== null && noteAmount > 0 && x.amount < noteAmount - EPS) {
      kept.push({ noteId: str(n.id), reason: `הצ׳ק (${ils(x.amount)}) קטן מהסכום שבהערה (${ils(noteAmount)}) – ההערה נשארת פעילה` });
      continue;
    }
    close.push(n);
  }
  return { close, kept };
}

const closingSentence = (r: Item) =>
  `נסגרה: הצ׳ק התקבל – ${str(r.priorityReceiptNumber) ? `קבלה ${str(r.priorityReceiptNumber)} ב-Priority, ` : ''}${ils(num(r.amount))} מהסוכן ${str(r.preparedBy)}${
    toIsraelDate(r.valueDate) ? ` (${formatDateHe(toIsraelDate(r.valueDate)!)})` : ''
  }.`;

// ---------- I/O ----------
export interface AgentReceiptsDeps {
  nowIso?: string;
  /** already-read AgentSettings (RunDaySchedule passes its own) */
  settings?: Map<string, string>;
}

interface Planned {
  payment: Item;
  receiptKey: string;
  out: Item;
  existing: Item | null;
  customer: Item | undefined;
}

/**
 * input: { asOfDate?, sinceDays? (default 14), dryRun? (default false) }.
 * Returns { ok, dryRun, asOfDate, sinceDate, found, created, skipped, rechecked, receipts[], notesClosed[], notesKept[],
 * writeVerified, errors, summary }.
 */
export async function pullAgentReceipts(client: BlocksClient, input: Item = {}, deps: AgentReceiptsDeps = {}): Promise<Item> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const dryRun = input?.dryRun === true || input?.dryRun === 'true';
  const errors: string[] = [];
  const out: Item = {
    ok: false,
    dryRun,
    asOfDate: '',
    sinceDate: '',
    found: 0,
    created: 0,
    skipped: 0,
    rechecked: 0,
    receipts: [] as Item[],
    notesClosed: [] as string[],
    notesKept: [] as Item[],
    writeVerified: false,
    errors,
    summary: '',
  };
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    errors.push(errText(e));
    out.summary = 'הצ׳קים של הסוכנים לא נמשכו – התאריך לא תקין';
    return out;
  }
  const rawDays = input?.sinceDays;
  const sinceDays = rawDays === undefined || rawDays === null || rawDays === '' ? DEFAULT_SINCE_DAYS : Number(rawDays);
  if (!Number.isFinite(sinceDays) || sinceDays < 0 || sinceDays > MAX_SINCE_DAYS) {
    errors.push(`sinceDays חייב להיות מספר בין 0 ל-${MAX_SINCE_DAYS} (התקבל "${str(rawDays)}")`);
    out.summary = 'הצ׳קים של הסוכנים לא נמשכו – טווח הימים לא תקין';
    return out;
  }
  const sinceDate = addDays(asOfDate, -Math.floor(sinceDays));
  Object.assign(out, { asOfDate, sinceDate });

  // ---------- read ----------
  let payments: Item[];
  try {
    payments = (
      await readAll(client, 'Payments', {
        and: [
          { column: 'method', operator: 'in', value: AGENT_CHEQUE_METHODS },
          { column: 'collectedBy', operator: 'is not null' },
          { column: 'paymentDate', operator: '>=', value: sinceDate },
        ],
      })
    ).filter((p) => {
      const d = toIsraelDate(p.paymentDate);
      return isAgentPayment(p) && !!d && d >= sinceDate && d <= asOfDate;
    });
  } catch (e) {
    errors.push(`Payments: ${errText(e)} – לא נמשכו צ׳קים`);
    out.summary = 'קריאת הקבלות מ-Priority נכשלה – לא נמשכו צ׳קים של סוכנים';
    return out;
  }
  // one row per paymentRef (the earliest)
  const byRef = new Map<string, Item>();
  for (const p of [...payments].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))) {
    const ref = str(p.paymentRef).trim();
    if (ref && !byRef.has(ref)) byRef.set(ref, p);
  }
  const noRef = payments.filter((p) => !str(p.paymentRef).trim());
  out.found = byRef.size + noRef.length;

  const keys = [...byRef.keys()].map(agentReceiptKey);
  const codes = [...new Set([...byRef.values()].map((p) => str(p.customerCode).trim()).filter(Boolean))];
  const numbers = [...new Set([...byRef.values()].map((p) => str(p.receiptNumber).trim()).filter(Boolean))];
  let existing: Item[];
  let customers: Item[];
  let sameNumber: Item[];
  let settings: Map<string, string>;
  try {
    [existing, customers, sameNumber, settings] = await Promise.all([
      keys.length ? readWhereIn(client, 'Receipts', 'receiptKey', keys) : Promise.resolve([] as Item[]),
      codes.length ? readWhereIn(client, 'Customers', 'customerCode', codes) : Promise.resolve([] as Item[]),
      numbers.length ? readWhereIn(client, 'Receipts', 'priorityReceiptNumber', numbers) : Promise.resolve([] as Item[]),
      deps.settings ? Promise.resolve(deps.settings) : readSettings(client),
    ]);
  } catch (e) {
    errors.push(`קריאת הקבלות הקיימות נכשלה – לא נוצרה אף קבלה: ${errText(e)}`);
    out.summary = 'קריאת הנתונים נכשלה – לא נמשכו צ׳קים של סוכנים';
    return out;
  }

  // ---------- plan ----------
  const planned: Planned[] = [];
  for (const p of noRef) {
    out.receipts.push({ paymentRef: '', customerCode: str(p.customerCode), amount: round2(num(p.amount)), status: 'דולגה', skippedReason: 'לקבלה ב-Priority אין מזהה (paymentRef)' });
    out.skipped++;
  }
  for (const [ref, p] of byRef) {
    const receiptKey = agentReceiptKey(ref);
    const code = str(p.customerCode).trim();
    const amount = round2(num(p.amount));
    const number = str(p.receiptNumber).trim();
    const customer = customers.find((c) => str(c.customerCode).trim() === code);
    const mine = earliest(existing.filter((r) => str(r.receiptKey) === receiptKey));
    const base: Item = {
      paymentRef: ref,
      receiptKey,
      customerCode: code,
      customerName: str(customer?.customerName) || str(p.customerName) || code,
      amount,
      method: str(p.method),
      paymentDate: toIsraelDate(p.paymentDate),
      checkDueDate: toIsraelDate(p.checkDueDate),
      collectedBy: str(p.collectedBy).trim(),
      priorityReceiptNumber: number || null,
    };
    const skip = (reason: string) => {
      out.receipts.push({ ...base, receiptKey: '', status: 'דולגה', skippedReason: reason });
      out.skipped++;
    };
    if (mine) {
      const decided = !!str(mine.debtCheckResult).trim();
      if (decided) {
        out.receipts.push({ ...base, status: 'קיימת', skippedReason: 'הקבלה כבר נקלטה', debtCheckResult: str(mine.debtCheckResult), matchStatus: str(mine.matchStatus) });
        out.skipped++;
      } else {
        // created earlier, its debt check never decided (e.g. an empty mirror then): only the missing check runs
        planned.push({ payment: p, receiptKey, out: { ...base, status: 'נבדקה שוב' }, existing: mine, customer });
      }
      continue;
    }
    if (!code) skip('לקבלה אין קוד לקוח');
    else if (amount <= 0.005) skip('סכום הקבלה אינו חיובי');
    else if (!customer) skip(`הלקוח ${code} לא נמצא בכרטיסי הלקוחות – להריץ משיכת לקוחות ואז שוב`);
    else if (str(p.bankLineId).trim()) skip('הקבלה נבנתה משורת בנק – היא כבר במסלול דף הבנק');
    else if (number && sameNumber.some((r) => str(r.priorityReceiptNumber).trim() === number && str(r.receiptKey) !== receiptKey)) skip(`קבלה ${number} כבר רשומה אצלנו כקבלה אחרת`);
    else planned.push({ payment: p, receiptKey, out: { ...base, status: 'נוצרה' }, existing: null, customer });
  }

  // ---------- dryRun: what would happen ----------
  let notes: Item[] = [];
  const planCodes = [...new Set(planned.map((x) => str(x.payment.customerCode).trim()))];
  if (planCodes.length) {
    try {
      notes = (await readWhereIn(client, 'CustomerNotes', 'customerCode', planCodes)).filter((n) => str(n.noteType).trim() === NT_AGENT_CHEQUE && isActiveNote(n));
    } catch (e) {
      errors.push(`CustomerNotes: ${errText(e)} – הערות "${NT_AGENT_CHEQUE}" לא נבדקו`);
    }
  }
  if (dryRun) {
    const wouldClose = new Set<string>();
    for (const x of planned) {
      const amount = num(x.out.amount);
      const pv = await previewDebtCheck(client, x.out.customerCode, amount);
      const ev = pv.evaluation;
      const months = ev ? paidMonthsOf({ debtCheckResult: ev.result, debtCheckMonths: ev.months.join(',') }) : [];
      const n = notesToClose(notes, { customerCode: x.out.customerCode, months, amount });
      const close = n.close.map((c) => str(c.id)).filter((id) => !wouldClose.has(id));
      close.forEach((id) => wouldClose.add(id));
      out.receipts.push({ ...x.out, debtCheckResult: ev?.result ?? null, debtCheckMonths: ev?.months.join(',') ?? null, explanation: ev?.explanation ?? pv.error, notesClosed: close });
      out.notesKept.push(...n.kept);
      if (x.existing) out.rechecked++;
      else out.created++;
    }
    out.notesClosed = [...wouldClose];
    out.ok = true;
    out.summary = summaryOf(out, true);
    return out;
  }

  // ---------- write: one receipt at a time ----------
  let verified = true;
  const ready: Planned[] = [];
  for (const x of planned) {
    if (x.existing) {
      ready.push(x);
      out.rechecked++;
      continue;
    }
    const row = agentReceiptRow(x.payment, x.customer, nowIso);
    let createdId = '';
    try {
      createdId = str((await client.createItem('Receipts', row))?.item?.id);
      const rows = await readWhereIn(client, 'Receipts', 'receiptKey', [x.receiptKey]);
      const first = earliest(rows);
      if (!first) throw new Error('הקבלה לא נקראה בחזרה');
      if (createdId && str(first.id) !== createdId) {
        // another run created it first: ours goes, theirs stands
        await client.deleteItem('Receipts', createdId).catch(() => undefined);
      }
      if (str(first.receiptStatus) !== RS_APPROVED || str(first.customerCode) !== row.customerCode || Math.abs(num(first.amount) - row.amount) > 0.005 || str(first.receiptSource) !== RSRC_AGENT) {
        throw new Error('הקבלה לא נקראה בחזרה כפי שנכתבה');
      }
      x.existing = first;
      ready.push(x);
      out.created++;
    } catch (e) {
      verified = false;
      if (createdId) await client.deleteItem('Receipts', createdId).catch(() => undefined);
      errors.push(`${x.receiptKey}: ${errText(e)} – הקבלה לא נוצרה`);
      out.receipts.push({ ...x.out, receiptKey: '', status: 'נכשלה', skippedReason: errText(e) });
    }
  }

  // ---------- the debt check, then the allocation proposal (the same path as an approved bank receipt) ----------
  const debtByKey = new Map<string, Item>();
  const allocByKey = new Map<string, Item>();
  if (ready.length) {
    try {
      const dc = await checkDebt(client, { receiptKeys: ready.map((x) => x.receiptKey), asOfDate }, { nowIso, settings });
      for (const r of dc.results ?? []) debtByKey.set(str(r.receiptKey), r);
      errors.push(...(dc.errors ?? []).map((e: string) => `בדיקת חוב: ${e}`));
    } catch (e) {
      errors.push(`בדיקת חוב: ${errText(e)} – הקבלות נשארות, הבדיקה תרוץ שוב בריצה הבאה`);
    }
    for (const x of ready) {
      const d = debtByKey.get(x.receiptKey);
      if (!d || !str(d.result).trim() || d.skippedReason || d.writeVerified === false) continue;
      try {
        const p = await proposeAllocation(client, { receiptKey: x.receiptKey, asOfDate }, { nowIso, settings });
        allocByKey.set(x.receiptKey, p);
        errors.push(...(p.errors ?? []).map((e: string) => `פיזור ${x.receiptKey}: ${e}`));
      } catch (e) {
        errors.push(`פיזור ${x.receiptKey}: ${errText(e)} – הקבלה נשארת, אפשר להציע פיזור שוב`);
      }
    }
  }

  // ---------- the צ׳ק אצל סוכן notes ----------
  const closedIds = new Set<string>();
  for (const x of ready) {
    const d = debtByKey.get(x.receiptKey);
    const p = allocByKey.get(x.receiptKey);
    const months = paidMonthsOf({ debtCheckResult: d?.result, debtCheckMonths: (d?.months ?? []).join(','), proposalMonths: p?.ok ? p.months : null });
    const n = notesToClose(
      notes.filter((nt) => !closedIds.has(str(nt.id))),
      { customerCode: str(x.out.customerCode), months, amount: num(x.out.amount) },
    );
    out.notesKept.push(...n.kept);
    const closedHere: string[] = [];
    for (const note of n.close) {
      const sentence = closingSentence(x.existing ?? agentReceiptRow(x.payment, x.customer, nowIso));
      const text = [str(note.noteText).trim(), sentence].filter(Boolean).join(' · ');
      try {
        const u = await updateCustomerNote(client, { noteId: str(note.id), close: true, noteText: text }, { ...noteWriteSyncs(LABEL), nowIso, asOfDate });
        if (u.errors.length || !u.writeVerified) {
          verified = false;
          errors.push(...u.errors.map((e) => `הערה ${str(note.id)}: ${e}`));
          if (!u.errors.length) errors.push(`הערה ${str(note.id)}: הסגירה לא נקראה בחזרה`);
          continue;
        }
        errors.push(...((u.taskSync?.errors ?? []) as string[]).map((e) => `משימות ההערות: ${e}`));
        closedIds.add(str(note.id));
        closedHere.push(str(note.id));
      } catch (e) {
        verified = false;
        errors.push(`הערה ${str(note.id)}: ${errText(e)} – לא נסגרה`);
      }
    }
    out.receipts.push({
      ...x.out,
      debtCheckResult: str(d?.result) || null,
      debtCheckMonths: (d?.months ?? []).join(',') || null,
      debtTaskKey: str(d?.taskKey) || null,
      explanation: str(d?.explanation) || str(d?.skippedReason) || null,
      allocationConfidence: p?.ok ? p.allocationConfidence : null,
      autoAllocated: p?.autoApplied === true,
      matchStatus: p?.ok ? str(p.matchStatus) : str(d?.matchStatus) || MS_ON_ACCOUNT_SPREAD,
      allocateTaskKey: str(p?.taskKey) || null,
      paidMonths: months,
      notesClosed: closedHere,
    });
  }
  out.notesClosed = [...closedIds];
  out.ok = verified;
  out.writeVerified = verified;
  out.summary = summaryOf(out, false);
  return out;
}

/** One Hebrew sentence for the run summary / the screen's toast. */
function summaryOf(out: Item, dry: boolean): string {
  if (!out.found) return `אין צ׳קים של סוכנים מ-${formatDateHe(out.sinceDate)} עד ${formatDateHe(out.asOfDate)}`;
  const created = num(out.created);
  const parts = [
    `${out.found} צ׳קים של סוכנים`,
    created ? `${created} ${dry ? 'ייקלטו כקבלות' : 'נקלטו כקבלות'}` : 'אף צ׳ק חדש',
    out.rechecked ? `${out.rechecked} ${dry ? 'ייבדקו שוב' : 'נבדקו שוב'}` : '',
    out.skipped ? `${out.skipped} דולגו (כבר נקלטו או חסרים פרטים)` : '',
    out.notesClosed.length ? `${out.notesClosed.length} הערות "${NT_AGENT_CHEQUE}" ${dry ? 'ייסגרו' : 'נסגרו'}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/** The RunDaySchedule step's counts (rows read / written). */
export const agentStepCounts = (r: Item) => ({ rowsRead: num(r.found), rowsWritten: num(r.created) + (r.notesClosed?.length ?? 0) });

