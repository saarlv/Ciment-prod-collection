import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { addDays, formatShortDate, israelLocalToUtcIso, previousBusinessDay, resolveAsOf, sortableTime, toIsraelDate } from '../shared/collections-dates.ts';
import {
  buildOwnerMap,
  createInChunks,
  DEFAULT_RECORDER,
  errText,
  formatIls,
  isFixtureCustomer,
  isTestCode,
  mapLimit,
  num,
  ownerOf,
  readAll,
  readByIds,
  readWhereIn,
  round2,
  splitList,
  str,
} from '../shared/collections-data.ts';
import { BOUNCED, LINE_ISSUED, LINE_UNIDENTIFIED } from '../shared/collections-matching.ts';
import { BANK_LINE_KINDS, CS_IDENTIFY, CS_PENDING, CS_UNIDENTIFIED, isMoneyInLine, isNonReceiptLine } from '../shared/collections-receipts.ts';
import { isApprovedReceipt, RS_APPROVED, RS_DRAFT, RS_ISSUED } from '../shared/collections-invoice-layer.ts';
import { DC_ASK, isZeroClose, MS_SPREAD_PROPOSED } from '../shared/collections-debt-check.ts';
import { MS_ON_ACCOUNT_SPREAD } from '../shared/collections-receipt-flow.ts';

// Nina's morning briefing, built deterministically from the rows, in the terms of the receipts flow (one flow per
// record since 08.11: identify → receipt → debt check → allocation):
//   - the bank import: lines and the money received (העברה / זיכוי בנק, + legacy צ׳ק deposits and untyped lines;
//     פירעון צ׳ק and אחר from the Priority pull are never counted or listed); bank batches are uploaded files (קובץ
//     בנק) and Priority pulls (שורות דפי בנק – Priority);
//   - identification: ודאי drafts waiting for "אשר את כל הוודאיים" (certainMatches), drafts to review (לא ודאי),
//     unidentified payers;
//   - receipts approved today (Receipts approved / issued whose preparedAt is the briefing date, any batch);
//   - the debt check of today's receipts: closed to 0 / to clarify with the customer;
//   - receipts waiting for allocation (approved, matchStatus פיזור מוצע – לאישור / על חשבון – צריך פיזור, any day);
//   - commitments (CustomerNotes התחייבות לתשלום) due, checked or closed today, bounced cheques and open tasks.
// One AgentBriefings row per bookkeeper owning a customer + one for כולם; a re-run updates that day's rows. Test imports
// produce test briefings (isTestFixture) from test data only; real imports from real data.
//
// Which bank lines: with importBatchId, that one batch. Without it, the lines of EVERY written (נכתב) bank batch of the
// briefing's scope uploaded on the briefing date (Israel) or whose dataDate is the previous business day or the
// briefing date. The scope (test / real) is that of the latest written batch; when no batch fits the window the latest
// written batch is used.
//
// The כולם briefing also lists the missing-delivery-note cases escalated to the collections manager
// (Disputes תעודת משלוח חסרה, status הוסלמה) – "לסיכום מנהל הגבייה".
const ALL = 'כולם';
const AGENT = DEFAULT_RECORDER;
const OPEN_TASK = ['ממתין', 'בטיפול'];
// CustomerNotes commitment outcomes (as in the artifact)
const NT_COMMITMENT = 'התחייבות לתשלום';
const ST_MONTH_ZERO = 'נסגרה – החודש התאפס';
const OUT_OPEN = 'פתוחה';
const OUT_KEPT = 'קוימה';
const OUT_PARTLY = 'קוימה חלקית';
const OUT_NOT_KEPT = 'לא קוימה';
/** the outcome shown for a commitment (a month that reached 0 counts as kept) */
const outcomeOf = (n: Item) => (str(n.status).trim() === ST_MONTH_ZERO ? OUT_KEPT : str(n.outcome).trim() || OUT_OPEN);
const MAX_LIST = 5;
const DOC_DISPUTE = 'תעודת משלוח חסרה';
const ESCALATED = 'הוסלמה';
/** Receipts.identifyStatus of a draft waiting in "אשר את כל הוודאיים" */
const IS_CERTAIN = 'ודאי';
/** matchStatus of an approved receipt that still waits for its allocation */
const WAITING_ALLOCATION = [MS_SPREAD_PROPOSED, MS_ON_ACCOUNT_SPREAD];
const APPROVED_STATUSES = [RS_APPROVED, RS_ISSUED];

/**
 * certain / toReview: a draft receipt identified ודאי / not ודאי; unidentified: no customer found; pending: not
 * identified yet; approved: the receipt is approved or issued; bounced: a returned cheque; other: no receipt at all
 * (פירעון צ׳ק / אחר from the Priority pull) – listed nowhere, never money received.
 */
type Category = 'certain' | 'toReview' | 'unidentified' | 'pending' | 'approved' | 'bounced' | 'other';

const isTestRow = (r: Item) => r?.isTestFixture === true || r?.isTestFixture === 'true' || isTestCode(r?.customerCode);
const dayOf = (v: unknown) => toIsraelDate(v);

export interface BriefingInput {
  asOfDate: string;
  batch: Item | null;
  lines: Item[];
  /** the receipts of the lines, those approved on asOfDate (any batch) and those waiting for allocation */
  receipts?: Item[];
  customers: Item[];
  owners: Item[];
  promises: Item[];
  tasks: Item[];
  /** Disputes rows; the escalated document cases go into the כולם briefing. */
  disputes?: Item[];
  audience?: string;
}

export function buildBriefings(x: BriefingInput) {
  const T = x.asOfDate;
  const testScope = x.batch ? x.batch.isTestFixture === true || x.batch.isTestFixture === 'true' : false;
  const customers = x.customers.filter((c) => isFixtureCustomer(c, c.customerCode) === testScope);
  const customersByCode = new Map(customers.map((c) => [str(c.customerCode), c]));
  const ownerMap = buildOwnerMap(x.owners);
  const ownerOfCode = (code: string) => (code ? ownerOf(code, customersByCode.get(code), ownerMap) : '');
  const nameOf = (code: string, ...names: unknown[]) => names.map(str).find(Boolean) || str(customersByCode.get(code)?.customerName) || code;

  // ---- the receipts in scope (one per key, the earliest row) ----
  const receiptByKey = new Map<string, Item>();
  for (const r of [...(x.receipts ?? [])].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))) {
    const key = str(r.receiptKey).trim();
    if (key && !receiptByKey.has(key) && isTestRow(r) === testScope) receiptByKey.set(key, r);
  }
  const receiptByLine = new Map<string, Item>();
  for (const r of receiptByKey.values()) if (str(r.bankLineId)) receiptByLine.set(str(r.bankLineId), r);
  const receiptView = (r: Item | null | undefined) => ({
    receiptKey: r ? str(r.receiptKey) : null,
    receiptStatus: r ? str(r.receiptStatus) || null : null,
    identifyStatus: r ? str(r.identifyStatus) || null : null,
    identifyConfidence: r && r.identifyConfidence !== null && r.identifyConfidence !== undefined && r.identifyConfidence !== '' ? num(r.identifyConfidence) : null,
    debtCheckResult: r ? str(r.debtCheckResult) || null : null,
    matchStatus: r ? str(r.matchStatus) || null : null,
  });

  // ---- bank lines of the import with their receipt ----
  const taskByLine = new Map(x.tasks.filter((t) => str(t.relatedTable) === 'BankLines').map((t) => [str(t.relatedId), t]));
  const lineItems = [...x.lines]
    .sort((a, b) => str(a.bankLineId).localeCompare(str(b.bankLineId)))
    .map((l) => {
      const lineId = str(l.bankLineId);
      const receipt = receiptByLine.get(lineId) ?? receiptByKey.get(`RCPT-${lineId}`) ?? null;
      const task = taskByLine.get(lineId);
      const bounced = str(l.lineType) === BOUNCED;
      const code = str(receipt?.customerCode) || str(l.customerCode) || (bounced ? str(task?.customerCode) : '');
      const stage = str(l.checkStage).trim();
      let category: Category;
      if (bounced) category = 'bounced';
      else if (isNonReceiptLine(l)) category = 'other';
      else if (str(l.status) === LINE_ISSUED || isApprovedReceipt(receipt)) category = 'approved';
      else if (receipt && str(receipt.receiptStatus).trim() === RS_DRAFT) category = str(receipt.identifyStatus).trim() === IS_CERTAIN ? 'certain' : 'toReview';
      else if (!code && [CS_PENDING, CS_IDENTIFY].includes(stage)) category = 'pending';
      else if (!code || stage === CS_UNIDENTIFIED || str(l.status) === LINE_UNIDENTIFIED) category = 'unidentified';
      else category = 'toReview';
      const owner = (bounced ? str(task?.assignedBookkeeperName) : '') || ownerOfCode(code);
      return {
        category,
        bankLineId: lineId,
        valueDate: dayOf(l.valueDate),
        amount: num(l.amount),
        payerName: str(l.payerName),
        reference: str(l.reference) || null,
        lineType: str(l.lineType) || null,
        lineStatus: str(l.status),
        customerCode: code || null,
        customerName: code ? nameOf(code, receipt?.customerName, l.customerName, task?.customerName) : null,
        assignedBookkeeperName: owner || null,
        ...receiptView(receipt),
        reasoning: bounced ? str(task?.reasons) || str(l.reference) : null,
        taskId: bounced ? task?.id ?? null : null,
      };
    });

  // ---- receipts: approved today, their debt check, and the ones waiting for allocation ----
  const receiptItem = (r: Item) => {
    const code = str(r.customerCode);
    return {
      bankLineId: str(r.bankLineId) || null,
      receiptSource: str(r.receiptSource) || null,
      valueDate: dayOf(r.valueDate),
      amount: num(r.amount),
      payerName: str(r.payerName),
      customerCode: code || null,
      customerName: code ? nameOf(code, r.customerName) : null,
      assignedBookkeeperName: ownerOfCode(code) || null,
      approvedAt: str(r.preparedAt) || null,
      ...receiptView(r),
    };
  };
  const receipts = [...receiptByKey.values()];
  const approvedToday = receipts.filter((r) => APPROVED_STATUSES.includes(str(r.receiptStatus).trim()) && dayOf(r.preparedAt) === T).map(receiptItem);
  const todayKeys = new Set([...approvedToday.map((r) => r.receiptKey), ...lineItems.map((l) => l.receiptKey)].filter(Boolean));
  const checkedToday = receipts.filter((r) => todayKeys.has(str(r.receiptKey)) && isApprovedReceipt(r) && str(r.debtCheckResult).trim()).map(receiptItem);
  const waitingAllocation = receipts
    .filter((r) => isApprovedReceipt(r) && WAITING_ALLOCATION.includes(str(r.matchStatus).trim()))
    .map(receiptItem)
    .sort((a, b) => str(a.valueDate).localeCompare(str(b.valueDate)) || str(a.receiptKey).localeCompare(str(b.receiptKey)));

  // ---- commitments (CustomerNotes) due, checked or closed today ----
  const promiseItems = x.promises
    .filter((n) => str(n.noteType).trim() === NT_COMMITMENT && isTestRow(n) === testScope)
    .filter((n) => dayOf(n.actionDate) === T || dayOf(n.checkedAt) === T || dayOf(n.closedAt) === T)
    .map((n) => {
      const code = str(n.customerCode);
      const amount = n.amount === null || n.amount === undefined || n.amount === '' ? Math.max(0, num(n.balanceAtNote)) : num(n.amount);
      return {
        id: n.id ?? null,
        customerCode: code,
        customerName: nameOf(code, n.customerName),
        assignedBookkeeperName: ownerOfCode(code) || null,
        promisedAmount: round2(amount),
        promisedDate: dayOf(n.actionDate),
        checkOn: dayOf(n.actionDate),
        status: outcomeOf(n),
        matchedAmount: n.amountReceived === null || n.amountReceived === undefined ? null : num(n.amountReceived),
        dueMonth: str(n.dueMonth) || null,
        invoiceNumbers: null,
      };
    });

  // ---- open tasks ----
  const taskItems = x.tasks
    .filter((t) => OPEN_TASK.includes(str(t.status)) && isTestRow(t) === testScope)
    .map((t) => {
      const code = str(t.customerCode);
      return {
        id: t.id ?? null,
        customerCode: code || null,
        customerName: code ? nameOf(code, t.customerName) : null,
        assignedBookkeeperName: str(t.assignedBookkeeperName) || ownerOfCode(code) || null,
        taskType: str(t.taskType),
        priorityScore: num(t.priorityScore),
        reasons: str(t.reasons),
        dueAt: t.dueAt ?? null,
        status: str(t.status),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || str(a.customerCode).localeCompare(str(b.customerCode)));

  // ---- escalated missing-delivery-note cases (the collections manager's summary) ----
  const escalatedItems = (x.disputes ?? [])
    .filter((d) => str(d.disputeType) === DOC_DISPUTE && str(d.status) === ESCALATED && isTestRow(d) === testScope)
    .map((d) => {
      const code = str(d.customerCode);
      return {
        id: d.id ?? null,
        disputeNumber: str(d.disputeNumber),
        customerCode: code,
        customerName: nameOf(code, d.customerName),
        invoiceNumbers: splitList(d.invoiceNumbers).join(', '),
        missingNoteNumbers: str(d.missingNoteNumbers) || null,
        productLine: str(d.productLine) || null,
        logisticsOwnerName: str(d.logisticsOwnerName) || null,
        ownerBookkeeperName: str(d.ownerBookkeeperName) || ownerOfCode(code) || null,
      };
    })
    .sort((a, b) => a.disputeNumber.localeCompare(b.disputeNumber, 'en', { numeric: true }));

  // ---- audiences ----
  const owned = new Set<string>();
  for (const c of customers) {
    const o = ownerOfCode(str(c.customerCode));
    if (o) owned.add(o);
  }
  let audiences = [...[...owned].sort((a, b) => a.localeCompare(b, 'he')), ALL];
  const wanted = str(x.audience).trim();
  if (wanted) audiences = [wanted];

  const forAudience = (aud: string) => {
    const mine = (owner: string | null) => aud === ALL || owner === aud;
    // unidentified lines are a shared queue: every audience sees them
    const lines = lineItems.filter((l) => l.category === 'unidentified' || mine(l.assignedBookkeeperName));
    const of = (c: Category) => lines.filter((l) => l.category === c);
    const checked = checkedToday.filter((r) => mine(r.assignedBookkeeperName));
    return {
      lines,
      certain: of('certain'),
      toReview: of('toReview'),
      unidentified: of('unidentified'),
      bouncedChecks: of('bounced'),
      approvedToday: approvedToday.filter((r) => mine(r.assignedBookkeeperName)),
      debtClosedZero: checked.filter((r) => isZeroClose(r.debtCheckResult)),
      debtToClarify: checked.filter((r) => r.debtCheckResult === DC_ASK),
      waitingAllocation: waitingAllocation.filter((r) => mine(r.assignedBookkeeperName)),
      promises: promiseItems.filter((p) => mine(p.assignedBookkeeperName)),
      tasks: taskItems.filter((t) => mine(t.assignedBookkeeperName)),
    };
  };

  const briefings = audiences.map((aud) => {
    const s = forAudience(aud);
    // money received: העברה / זיכוי בנק (+ legacy צ׳ק deposits and untyped lines); never פירעון צ׳ק / אחר / צ׳ק חוזר
    const transfers = s.lines.filter((l) => l.category !== 'bounced' && l.category !== 'other' && isMoneyInLine({ amount: l.amount, lineType: l.lineType }));
    const transferSum = round2(transfers.reduce((t, l) => t + l.amount, 0));
    const pc = (st: string) => s.promises.filter((p) => p.status === st).length;
    const counts = {
      bankLines: s.lines.length,
      certainMatches: s.certain.length,
      toReview: s.toReview.length,
      unidentified: s.unidentified.length,
      receiptsApprovedToday: s.approvedToday.length,
      debtClosedZero: s.debtClosedZero.length,
      debtToClarify: s.debtToClarify.length,
      waitingAllocation: s.waitingAllocation.length,
      bouncedChecks: s.bouncedChecks.length,
      promisesDue: s.promises.filter((p) => p.checkOn === T && p.status === OUT_OPEN).length,
      // kept for the screens: commitments have no "payment seen" stage (CheckCommitments judges them from the receipts)
      promisesSeen: 0,
      promisesKept: pc(OUT_KEPT),
      promisesPartial: pc(OUT_PARTLY),
      promisesBroken: pc(OUT_NOT_KEPT),
      insuranceAlerts: 0,
      inboxDueSoon: 0,
      openTasks: s.tasks.length,
      ...(aud === ALL ? { escalatedDocumentCases: escalatedItems.length } : {}),
    };

    const head: string[] = [];
    head.push(
      transfers.length === 0
        ? 'לא נכנסו העברות חדשות'
        : transfers.length === 1
          ? `נכנסה העברה אחת, ${formatIls(transferSum)} ש״ח`
          : `נכנסו ${transfers.length} העברות, ${formatIls(transferSum)} ש״ח`,
    );
    if (counts.certainMatches === 1) head.push('זיהוי ודאי אחד מחכה לאישור');
    else if (counts.certainMatches > 1) head.push(`${counts.certainMatches} זיהויים ודאיים מחכים לאישור במנה`);
    if (counts.receiptsApprovedToday === 1) head.push('קבלה אחת אושרה היום');
    else if (counts.receiptsApprovedToday > 1) head.push(`${counts.receiptsApprovedToday} קבלות אושרו היום`);
    if (counts.waitingAllocation === 1) head.push('קבלה אחת מחכה לפיזור');
    else if (counts.waitingAllocation > 1) head.push(`${counts.waitingAllocation} קבלות מחכות לפיזור`);
    if (counts.bouncedChecks === 1) head.push('צ׳ק חוזר אחד');
    else if (counts.bouncedChecks > 1) head.push(`${counts.bouncedChecks} צ׳קים חוזרים`);
    if (counts.promisesBroken === 1) head.push('התחייבות אחת לא קוימה');
    else if (counts.promisesBroken > 1) head.push(`${counts.promisesBroken} התחייבויות לא קוימו`);
    const headline = head.join(' · ');

    const list = <T>(xs: T[], f: (x: T) => string) =>
      xs.slice(0, MAX_LIST).map(f).join(' · ') + (xs.length > MAX_LIST ? ` · ועוד ${xs.length - MAX_LIST}` : '');
    const who = (l: { customerName: string | null; customerCode: string | null; payerName: string }) =>
      l.customerName || l.customerCode || `'${l.payerName}'`;
    const body: string[] = [];
    if (s.bouncedChecks.length) {
      body.push(`- **צ׳קים חוזרים (${s.bouncedChecks.length}):** ${list(s.bouncedChecks, (l) => `${who(l)} – ${formatIls(Math.abs(l.amount))} ש״ח${l.reference ? ` (${l.reference})` : ''}`)}`);
    }
    if (s.certain.length) {
      const sum = round2(s.certain.reduce((t, l) => t + l.amount, 0));
      body.push(`- **זוהו בוודאות – לאישור במנה (${s.certain.length}, ${formatIls(sum)} ש״ח):** ${list(s.certain, (l) => `${who(l)} ${formatIls(l.amount)}`)}`);
    }
    if (s.toReview.length) {
      body.push(`- **זיהוי לבדיקה (${s.toReview.length}):** ${list(s.toReview, (l) => `${who(l)} ${formatIls(l.amount)}${l.identifyConfidence !== null ? ` (ביטחון ${l.identifyConfidence})` : ''}`)}`);
    }
    if (s.unidentified.length) {
      body.push(`- **לא מזוהה (${s.unidentified.length}):** ${list(s.unidentified, (l) => `'${l.payerName}' ${formatIls(l.amount)}`)}`);
    }
    if (s.approvedToday.length) {
      body.push(`- **קבלות שאושרו היום (${s.approvedToday.length}):** ${list(s.approvedToday, (r) => `${who(r)} ${formatIls(r.amount)}`)}`);
    }
    if (s.debtClosedZero.length || s.debtToClarify.length) {
      const parts = [
        s.debtClosedZero.length ? `נסגרו לאפס ${s.debtClosedZero.length}` : '',
        s.debtToClarify.length ? `לברר מול הלקוח ${s.debtToClarify.length} (${list(s.debtToClarify, (r) => `${who(r)} ${formatIls(r.amount)}`)})` : '',
      ].filter(Boolean);
      body.push(`- **בדיקת חוב:** ${parts.join(' · ')}`);
    }
    if (s.waitingAllocation.length) {
      body.push(`- **מחכות לפיזור לחשבוניות (${s.waitingAllocation.length}):** ${list(s.waitingAllocation, (r) => `${who(r)} ${formatIls(r.amount)} – ${r.matchStatus}`)}`);
    }
    if (s.promises.length) {
      const parts = [
        counts.promisesKept ? `קוימה ${counts.promisesKept}` : '',
        counts.promisesPartial ? `קוימה חלקית ${counts.promisesPartial}` : '',
        counts.promisesBroken ? `לא קוימה ${counts.promisesBroken}` : '',
        counts.promisesDue ? `מועדן היום ${counts.promisesDue}` : '',
      ].filter(Boolean);
      const named = list(s.promises, (p) => `${p.customerName} ${formatIls(p.promisedAmount)} – ${p.status}`);
      body.push(`- **התחייבויות לתשלום:** ${parts.join(' · ')}${named ? ` (${named})` : ''}`);
    }
    if (s.tasks.length) {
      body.push(`- **משימות פתוחות:** ${s.tasks.length}`);
    }
    if (aud === ALL && escalatedItems.length) {
      body.push(
        `- **לסיכום מנהל הגבייה – תעודות משלוח שהוסלמו (${escalatedItems.length}):** ${list(escalatedItems, (e) => `${e.customerName} – ${e.invoiceNumbers}${e.missingNoteNumbers ? ` (חסרות ${e.missingNoteNumbers})` : ''}`)}`,
      );
    }
    if (!body.length) body.push('- אין פריטים פתוחים להיום');

    return { audience: aud, headline, body: body.join('\n'), counts, sections: s };
  });

  const itemView = (l: (typeof lineItems)[number]) => ({
    bankLineId: l.bankLineId,
    valueDate: l.valueDate,
    valueDateShort: l.valueDate ? formatShortDate(l.valueDate) : null,
    amount: l.amount,
    payerName: l.payerName,
    customerCode: l.customerCode,
    customerName: l.customerName,
    assignedBookkeeperName: l.assignedBookkeeperName,
    receiptKey: l.receiptKey,
    receiptStatus: l.receiptStatus,
    identifyStatus: l.identifyStatus,
    identifyConfidence: l.identifyConfidence,
    debtCheckResult: l.debtCheckResult,
    matchStatus: l.matchStatus,
    reasoning: l.reasoning,
    lineStatus: l.lineStatus,
    taskId: l.taskId,
  });
  const main = briefings.find((b) => b.audience === (wanted || ALL)) ?? briefings[briefings.length - 1];
  const items = {
    audience: main.audience,
    certain: main.sections.certain.map(itemView),
    toReview: main.sections.toReview.map(itemView),
    unidentified: main.sections.unidentified.map(itemView),
    bouncedChecks: main.sections.bouncedChecks.map(itemView),
    approvedToday: main.sections.approvedToday,
    debtClosedZero: main.sections.debtClosedZero,
    debtToClarify: main.sections.debtToClarify,
    waitingAllocation: main.sections.waitingAllocation,
    promises: main.sections.promises,
    tasks: main.sections.tasks,
    escalatedDocumentCases: main.audience === ALL ? escalatedItems : [],
  };
  return { testScope, briefings, items };
}

const isTestBatch = (b: Item | null | undefined) => b?.isTestFixture === true || b?.isTestFixture === 'true';

/**
 * The bank batches a briefing without importBatchId covers (bug fix, see the header): every written
 * batch of the latest batch's scope uploaded on asOfDate (Israel) or with dataDate = the previous
 * business day / asOfDate. No batch in that window → the latest written batch alone (the old behaviour).
 */
export function briefingBatches(batches: Item[], asOfDate: string): { latest: Item | null; covered: Item[] } {
  const written = batches
    .filter((b) => str(b.status) === 'נכתב')
    .sort((a, b) => sortableTime(b.uploadedAt) - sortableTime(a.uploadedAt) || sortableTime(b.dataDate) - sortableTime(a.dataDate));
  const latest = written[0] ?? null;
  if (!latest) return { latest: null, covered: [] };
  const pbd = previousBusinessDay(asOfDate);
  const scope = isTestBatch(latest);
  const covered = written.filter((b) => {
    if (isTestBatch(b) !== scope) return false;
    const up = toIsraelDate(b.uploadedAt);
    const dd = toIsraelDate(b.dataDate);
    return up === asOfDate || dd === pbd || dd === asOfDate;
  });
  return { latest, covered: covered.length ? covered : [latest] };
}

export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const asOfDate = resolveAsOf(input?.asOfDate);
  const dryRun = input?.dryRun === true;
  const nowIso = new Date().toISOString();
  const batchIdInput = str(input?.importBatchId).trim();
  const errors: string[] = [];

  // the Israel day of asOfDate as a UTC window (exact date check again in memory)
  const dayStart = israelLocalToUtcIso(asOfDate, 0, 0);
  const dayEnd = israelLocalToUtcIso(addDays(asOfDate, 1), 0, 0);
  const [batches, customers, owners, promises, tasks, existingAll, disputes, approvedToday, waiting] = await Promise.all([
    // bank files and Priority bank-line pulls (plan r3 stage 2: no reading step, written = verified)
    readAll(client, 'ImportBatches', { column: 'kind', operator: 'in', value: BANK_LINE_KINDS }),
    readAll(client, 'Customers'),
    readAll(client, 'CustomerOwners'),
    readAll(client, 'CustomerNotes', { column: 'noteType', value: NT_COMMITMENT }),
    readAll(client, 'CollectionQueue', { column: 'status', operator: 'in', value: OPEN_TASK }),
    // filtered by date in memory (date columns may come back as midnight-UTC datetimes)
    readAll(client, 'AgentBriefings', { column: 'agentName', value: AGENT }),
    readAll(client, 'Disputes', { and: [{ column: 'disputeType', value: DOC_DISPUTE }, { column: 'status', value: ESCALATED }] }),
    // receipts approved today (any batch, agent cheques too) and receipts waiting for their allocation
    readAll(client, 'Receipts', {
      and: [
        { column: 'receiptStatus', operator: 'in', value: APPROVED_STATUSES },
        { column: 'preparedAt', operator: '>=', value: dayStart },
        { column: 'preparedAt', operator: '<', value: dayEnd },
      ],
    }),
    readAll(client, 'Receipts', { and: [{ column: 'receiptStatus', operator: 'in', value: APPROVED_STATUSES }, { column: 'matchStatus', operator: 'in', value: WAITING_ALLOCATION }] }),
  ]);
  let batch: Item | null = null;
  let covered: Item[] = [];
  if (batchIdInput) {
    batch = batches.find((b) => str(b.id) === batchIdInput) ?? null;
    if (!batch) errors.push(`קובץ הבנק ${batchIdInput} לא נמצא – התדריך נבנה בלי שורות בנק`);
    covered = batch ? [batch] : [];
  } else {
    const r = briefingBatches(batches, asOfDate);
    batch = r.latest;
    covered = r.covered;
  }
  const batchId = batch ? str(batch.id) : null;
  const coveredIds = covered.map((b) => str(b.id)).filter(Boolean);
  const [lines, lineReceipts] = coveredIds.length
    ? await (async () => {
        const ls = await readWhereIn(client, 'BankLines', 'importBatchId', coveredIds);
        const ids = ls.map((l) => str(l.bankLineId)).filter(Boolean);
        const rs = ids.length ? await readWhereIn(client, 'Receipts', 'bankLineId', ids) : [];
        return [ls, rs] as const;
      })()
    : [[], []];
  console.log(`WriteBriefing: ${asOfDate} – ${coveredIds.length} batches, ${lines.length} lines, ${lineReceipts.length} line receipts, ${approvedToday.length} approved today, ${waiting.length} waiting for allocation`);

  const built = buildBriefings({
    asOfDate,
    batch,
    lines: [...lines],
    receipts: [...lineReceipts, ...approvedToday, ...waiting],
    customers,
    owners,
    promises,
    tasks,
    disputes,
    audience: input?.audience,
  });

  const existing = existingAll.filter(
    (b) => str(b.agentName) === AGENT && toIsraelDate(b.briefingDate) === asOfDate && (b.isTestFixture === true || b.isTestFixture === 'true') === built.testScope,
  );
  const existingByAudience = new Map<string, Item>();
  for (const b of existing.sort((x, y) => sortableTime(x.briefingCreatedAt) - sortableTime(y.briefingCreatedAt))) existingByAudience.set(str(b.audience), b);

  const rows = built.briefings.map((b) => ({
    row: {
      briefingDate: asOfDate,
      agentName: AGENT,
      audience: b.audience,
      headline: b.headline,
      body: b.body,
      counts: b.counts,
      triggeredByImportId: batchIdInput || batchId,
      briefingCreatedAt: nowIso,
      isTestFixture: built.testScope,
    },
    existing: existingByAudience.get(b.audience) ?? null,
  }));
  const view = (r: (typeof rows)[number], id: unknown, action: string) => ({ id: id ?? null, action, ...r.row });

  if (dryRun) {
    return {
      dryRun,
      briefingDate: asOfDate,
      importBatchId: batchId,
      importBatchIds: coveredIds,
      isTestFixture: built.testScope,
      briefings: rows.map((r) => view(r, r.existing?.id, r.existing ? 'יעודכן' : 'ייווצר')),
      items: built.items,
      writeVerified: false,
      errors,
    };
  }

  const toCreate = rows.filter((r) => !r.existing);
  const toUpdate = rows.filter((r) => r.existing);
  let created: Item[] = [];
  try {
    created = await createInChunks(client, 'AgentBriefings', toCreate.map((r) => r.row));
  } catch (e) {
    errors.push(`AgentBriefings: ${errText(e)}`);
  }
  await mapLimit(toUpdate, 8, async (r) => {
    try {
      await client.updateItem('AgentBriefings', str(r.existing!.id), r.row);
    } catch (e) {
      errors.push(`AgentBriefings ${str(r.existing!.id)}: ${errText(e)}`);
    }
  });
  const idOf = (r: (typeof rows)[number]) => (r.existing ? str(r.existing.id) : str(created[toCreate.indexOf(r)]?.id));
  const back = await readByIds(client, 'AgentBriefings', rows.map(idOf));
  const backById = new Map(back.map((b) => [str(b.id), b]));
  const problems: string[] = [];
  for (const r of rows) {
    const b = backById.get(idOf(r));
    if (!b || str(b.audience) !== r.row.audience || str(b.headline) !== r.row.headline || str(b.body) !== r.row.body) {
      problems.push(`AgentBriefings ${r.row.audience}: לא נקרא בחזרה כמתוכנן`);
    }
  }
  return {
    dryRun,
    briefingDate: asOfDate,
    importBatchId: batchId,
    importBatchIds: coveredIds,
    isTestFixture: built.testScope,
    briefings: rows.map((r) => view(r, idOf(r) || null, r.existing ? 'עודכן' : 'נוצר')),
    items: built.items,
    writeVerified: errors.length === 0 && problems.length === 0 && created.length === toCreate.length,
    verifyDetails: { created: created.length, updated: toUpdate.length, problems },
    errors,
  };
};
