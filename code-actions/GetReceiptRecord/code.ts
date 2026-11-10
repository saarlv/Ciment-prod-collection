import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf, sortableTime, toIsraelDate } from '../shared/collections-dates.ts';
import { buildOwnerMap, errText, num, numOrNull, ownerOf, readAll, readByIds, readWhereIn, round2, splitList, str } from '../shared/collections-data.ts';
import { isApprovedReceipt } from '../shared/collections-invoice-layer.ts';
import { noteTypeLabel, ST_ACTIVE } from '../shared/collections-notes.ts';
import { MP_APPROVED, MP_DONE, MP_PROPOSED } from '../shared/collections-matching.ts';
import { ST_IDENTIFY } from '../shared/collections-receipts.ts';
import { apContactOf, priorityInstructionOf, receiptKeyOf, receiptView } from '../shared/collections-receipt-record.ts';
import { debtCheckTaskKey, isOwnMovement, isZeroClose, monthBalancesOf, zeroAlertKey } from '../shared/collections-debt-check.ts';
import { allocateTaskKey } from '../shared/collections-allocation.ts';
import { RSRC_AGENT } from '../shared/collections-agent-receipts.ts';

// Read only – Nina's chat tool (the receipts screen reads the tables directly). One receipt's whole story in the flow
// identify → receipt → debt check → allocation, by bankLineId (a bank-file / Priority line) or receiptId (works for
// agent cheques, which have no bank line):
//   line          the bank line, or null for an agent cheque
//   customer      once identified: Priority status, terms, payment method, collection note, owner (CustomerOwners, else
//                 Priority), the AP contact (CustomerContacts isApContact, else Customers.apContact*)
//   identify      Receipts.identifyStatus / identifyConfidence and the identification step's method and candidates, plus
//                 the steps of the line's latest run; for an agent cheque {status: null, method: 'צ׳ק סוכן'}
//   receipt       the Receipts row with its send status and its mail draft (Approvals related to the receipt)
//   debtCheck     once checked: the stored result and months, the customer's per-month balances now (OpenMovements,
//                 without the receipt's own movement) and the task / alert key
//   allocation    after the debt check: matchStatus, allocated / unallocated, confidence, the ReceiptAllocations rows and
//                 the open allocation task key
//   customerNotes the customer's active CustomerNotes; priorityInstruction once the receipt is approved
// Writes nothing.
const ACTIVE_PROPOSALS = [MP_PROPOSED, MP_APPROVED, MP_DONE];
const OPEN_TASK = ['ממתין', 'בטיפול'];

const textOrNull = (v: unknown) => str(v).trim() || null;
const earliest = (rows: Item[]) => [...rows].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0] ?? null;
const evidenceOf = (s: Item | null | undefined): Item => {
  let ev: unknown = s?.evidence;
  if (typeof ev === 'string') {
    try {
      ev = JSON.parse(ev);
    } catch {
      ev = null;
    }
  }
  return ev && typeof ev === 'object' && !Array.isArray(ev) ? (ev as Item) : {};
};

export const invoke = async (input: any, context: any) => {
  const bankLineId = str(input?.bankLineId).trim();
  const receiptId = str(input?.receiptId).trim();
  const base = {
    line: null as Item | null,
    customer: null as Item | null,
    identify: null as Item | null,
    receipt: null as Item | null,
    debtCheck: null as Item | null,
    allocation: null as Item | null,
    customerNotes: [] as Item[],
    priorityInstruction: null as string | null,
    errors: [] as string[],
    asOfDate: null as string | null,
  };
  if (!bankLineId && !receiptId) return { ...base, errors: ['חסר מזהה: שורת בנק (bankLineId) או קבלה (receiptId)'] };
  if (bankLineId && receiptId) return { ...base, errors: ['יש לשלוח רק אחד: bankLineId או receiptId'] };
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    return { ...base, errors: [errText(e)] };
  }
  base.asOfDate = asOfDate;
  const client = new BlocksClient(context);
  console.log(`GetReceiptRecord: ${bankLineId ? `bankLineId ${bankLineId}` : `receiptId ${receiptId}`} as of ${asOfDate}`);

  // ---------- round 1: the receipt and / or the line ----------
  let receiptRow: Item | null = null;
  let lineId = bankLineId;
  if (receiptId) {
    [receiptRow] = await readByIds(client, 'Receipts', [receiptId]);
    if (!receiptRow) return { ...base, errors: [`קבלה ${receiptId} לא נמצאה`] };
    lineId = str(receiptRow.bankLineId).trim();
  }
  const byLine = { column: 'bankLineId', value: lineId };
  const none = Promise.resolve([] as Item[]);
  const [lines, lineReceipts, proposals, steps] = await Promise.all([
    lineId ? readAll(client, 'BankLines', byLine) : none,
    lineId && !receiptRow ? readAll(client, 'Receipts', byLine) : none,
    lineId ? readAll(client, 'MatchProposals', byLine) : none,
    lineId ? readAll(client, 'ReceiptCheckSteps', byLine) : none,
  ]);
  const line = earliest(lines);
  if (bankLineId && !line) return { ...base, errors: [`שורת הבנק ${bankLineId} לא נמצאה`] };
  if (!receiptRow) receiptRow = lineReceipts.find((r) => str(r.receiptKey) === (str(line?.receiptKey) || receiptKeyOf(lineId))) ?? earliest(lineReceipts);
  const proposal =
    proposals
      .filter((p) => ACTIVE_PROPOSALS.includes(str(p.status)))
      .sort((a, b) => sortableTime(b.proposedAt) - sortableTime(a.proposedAt) || Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? null;
  const code = str(receiptRow?.customerCode).trim() || str(line?.customerCode).trim() || str(proposal?.customerCode).trim();
  const key = str(receiptRow?.receiptKey).trim();

  // ---------- round 2: the customer, the receipt's allocations, mail draft and tasks ----------
  const byCode = { column: 'customerCode', value: code };
  const taskKeys = key ? [debtCheckTaskKey(key), zeroAlertKey(key), allocateTaskKey(key)] : [];
  const [customers, contacts, owners, notes, movements, allocations, approvals, tasks] = await Promise.all([
    code ? readAll(client, 'Customers', byCode) : none,
    code ? readAll(client, 'CustomerContacts', byCode) : none,
    code ? readAll(client, 'CustomerOwners', byCode) : none,
    code ? readAll(client, 'CustomerNotes', { and: [byCode, { column: 'status', value: ST_ACTIVE }] }) : none,
    code && receiptRow?.debtCheckResult ? readAll(client, 'OpenMovements', byCode) : none,
    key ? readAll(client, 'ReceiptAllocations', { column: 'receiptKey', value: key }) : none,
    key ? readAll(client, 'Approvals', { and: [{ column: 'relatedTable', value: 'Receipts' }, { column: 'relatedId', value: key }] }) : none,
    taskKeys.length ? readWhereIn(client, 'CollectionQueue', 'taskKey', taskKeys) : none,
  ]);
  const customerRow = customers[0] ?? null;
  console.log(`GetReceiptRecord: customer ${code || '—'}, receipt ${key || '—'}, ${allocations.length} allocations, ${steps.length} steps`);

  // ---------- line ----------
  const lineOut = line
    ? {
        bankLineId: str(line.bankLineId),
        valueDate: toIsraelDate(line.valueDate),
        amount: round2(num(line.amount)),
        payerName: textOrNull(line.payerName),
        reference: textOrNull(line.reference),
        lineType: textOrNull(line.lineType),
        status: textOrNull(line.status),
        checkStage: textOrNull(line.checkStage),
      }
    : null;

  // ---------- customer ----------
  let customer: Item | null = null;
  if (code) {
    const contact = apContactOf(customerRow ?? { customerCode: code }, contacts);
    customer = {
      customerCode: code,
      customerName: str(customerRow?.customerName) || str(receiptRow?.customerName) || str(proposal?.customerName) || str(line?.customerName) || code,
      priorityStatus: textOrNull(customerRow?.priorityStatus),
      paymentTermsLabel: textOrNull(customerRow?.paymentTermsLabel),
      paymentMethod: textOrNull(customerRow?.paymentMethod),
      collectionNote: textOrNull(customerRow?.collectionNote),
      salesAgentName: textOrNull(customerRow?.salesAgentName),
      assignedBookkeeperName: ownerOf(code, customerRow ?? undefined, buildOwnerMap(owners)) || null,
      apContact: contact ? { name: contact.name, email: contact.email, phone: contact.phone } : null,
    };
  }

  // ---------- identify ----------
  const isAgentCheque = !line && str(receiptRow?.receiptSource).trim() === RSRC_AGENT;
  let identify: Item;
  if (isAgentCheque || (!line && receiptRow)) {
    identify = { status: null, confidence: null, method: RSRC_AGENT, candidates: [], steps: [] };
  } else {
    const runId = str(line?.lastCheckRunId).trim();
    const runSteps = steps
      .filter((s) => !runId || str(s.checkRunId) === runId)
      .sort((a, b) => sortableTime(a.at) - sortableTime(b.at) || Number(a.stepNo ?? 0) - Number(b.stepNo ?? 0) || Number(a.id ?? 0) - Number(b.id ?? 0));
    const idStep = [...runSteps].reverse().find((s) => str(s.stage) === ST_IDENTIFY) ?? null;
    const ev = evidenceOf(idStep);
    const candidates = (Array.isArray(ev.candidates) ? ev.candidates : []).map((c: Item) => ({
      customerCode: str(c.customerCode),
      customerName: str(c.customerName) || str(c.customerCode),
      confidence: numOrNull(c.confidence),
      method: textOrNull(c.method),
    }));
    identify = {
      status: textOrNull(receiptRow?.identifyStatus) ?? textOrNull(ev.identifyStatus),
      confidence: numOrNull(receiptRow?.identifyConfidence) ?? numOrNull(ev.confidence),
      method: textOrNull(ev.method) ?? textOrNull(proposal?.customerIdMethod),
      candidates,
      steps: runSteps.map((s) => ({
        rung: textOrNull(s.rung),
        result: textOrNull(s.result),
        summary: textOrNull(s.detail),
        actor: textOrNull(s.actorName) ?? textOrNull(s.actor),
        at: textOrNull(s.at),
      })),
    };
  }

  // ---------- receipt ----------
  let receipt: Item | null = null;
  if (receiptRow) {
    const draft = [...approvals].sort((a, b) => sortableTime(b.draftedAt) - sortableTime(a.draftedAt) || Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? null;
    receipt = {
      receiptId: str(receiptRow.id),
      receiptKey: key,
      receiptSource: textOrNull(receiptRow.receiptSource),
      amount: round2(num(receiptRow.amount)),
      valueDate: toIsraelDate(receiptRow.valueDate),
      receiptStatus: textOrNull(receiptRow.receiptStatus),
      sendStatus: textOrNull(receiptRow.sendStatus),
      mailApprovalId: draft ? str(draft.id) : null,
      mailApprovalStatus: draft ? textOrNull(draft.status) : null,
      priorityReceiptNumber: textOrNull(receiptRow.priorityReceiptNumber),
      preparedBy: textOrNull(receiptRow.preparedBy),
      preparedAt: textOrNull(receiptRow.preparedAt),
      issuedBy: textOrNull(receiptRow.issuedBy),
      issuedAt: textOrNull(receiptRow.issuedAt),
    };
  }

  // ---------- debt check ----------
  const openTaskKey = (k: string) => (tasks.some((t) => str(t.taskKey) === k && (!str(t.status).trim() || OPEN_TASK.includes(str(t.status).trim()))) ? k : null);
  const anyTaskKey = (k: string) => (tasks.some((t) => str(t.taskKey) === k) ? k : null);
  let debtCheck: Item | null = null;
  const result = str(receiptRow?.debtCheckResult).trim();
  if (receiptRow && result) {
    const own = movements.filter((m) => !isOwnMovement(m, receiptRow!));
    debtCheck = {
      result,
      months: splitList(receiptRow.debtCheckMonths),
      monthBalances: monthBalancesOf(own).months.map((m) => ({ dueMonth: m.month, openAmount: m.balance, cumulative: m.cumulative })),
      taskKey: anyTaskKey(isZeroClose(result) ? zeroAlertKey(key) : debtCheckTaskKey(key)),
    };
  }

  // ---------- allocation ----------
  let allocation: Item | null = null;
  if (receiptRow && (result || allocations.length)) {
    allocation = {
      matchStatus: textOrNull(receiptRow.matchStatus),
      allocatedAmount: round2(num(receiptRow.allocatedAmount)),
      unallocatedAmount: round2(num(receiptRow.unallocatedAmount)),
      allocationConfidence: numOrNull(receiptRow.allocationConfidence),
      rows: [...allocations]
        .sort((a, b) => str(toIsraelDate(a.dueDate)).localeCompare(str(toIsraelDate(b.dueDate))) || str(a.invoiceNumber).localeCompare(str(b.invoiceNumber), undefined, { numeric: true }))
        .map((a) => ({
          id: a.id ?? null,
          invoiceNumber: str(a.invoiceNumber),
          dueDate: toIsraelDate(a.dueDate),
          amount: round2(num(a.amount)),
          openBefore: numOrNull(a.openBefore),
          openAfter: numOrNull(a.openAfter) ?? (numOrNull(a.openBefore) === null ? null : round2(Math.max(0, num(a.openBefore) - num(a.amount)))),
          kind: textOrNull(a.kind),
          isPartial: a.isPartial === true || a.isPartial === 'true',
          source: textOrNull(a.source),
          status: textOrNull(a.status),
        })),
      taskKey: openTaskKey(allocateTaskKey(key)),
    };
  }

  // ---------- the customer's open notes ----------
  const customerNotes = [...notes]
    .sort((a, b) => str(a.dueMonth).localeCompare(str(b.dueMonth)) || sortableTime(b.noteCreatedAt) - sortableTime(a.noteCreatedAt))
    .map((n) => ({
      id: n.id ?? null,
      dueMonth: textOrNull(n.dueMonth),
      noteType: noteTypeLabel(n),
      actionDate: toIsraelDate(n.actionDate),
      noteAmount: numOrNull(n.amount),
      noteText: str(n.noteText),
      outcome: textOrNull(n.outcome),
      authorName: textOrNull(n.authorName),
    }));

  return {
    ...base,
    line: lineOut,
    customer,
    identify,
    receipt,
    debtCheck,
    allocation,
    customerNotes,
    // only an approved receipt is keyed into Priority – a draft has no instruction yet
    priorityInstruction: receiptRow && isApprovedReceipt(receiptRow) ? priorityInstructionOf(receiptView(receiptRow, allocations)) : null,
  };
};
