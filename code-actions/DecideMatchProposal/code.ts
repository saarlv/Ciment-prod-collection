import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf } from '../shared/collections-dates.ts';
import { SRC_AGING } from '../shared/collections-tasks.ts';
import { syncTasksAfterWrite } from '../shared/collections-task-sync.ts';
import { errText, readAll, readByIds, readWhereIn, str } from '../shared/collections-data.ts';
import { LINE_ISSUED, MP_APPROVED, MP_DONE, MP_PROPOSED } from '../shared/collections-matching.ts';
import { layerSummary, refreshInvoiceLayer } from '../shared/collections-invoice-layer.ts';
import { ACTOR_SYSTEM, ACTOR_USER, R_APPROVE, RES_FOUND, ST_DECISION } from '../shared/collections-receipts.ts';
import { priorityInstructionOf, RC_ISSUED, receiptKeyOf, receiptView, RS_APPROVED, RS_DRAFT, RS_ISSUED } from '../shared/collections-receipt-record.ts';
import { AUTO_APPROVE_ACTOR, WriteJournal } from '../shared/collections-receipt-flow.ts';

// Marks approved receipts as issued in Priority: a person issued the receipt in Priority by the copied instruction and
// types Priority's receipt number. The only decision since 08.11 is priorityDone; the customer and the receipt are
// approved by IssueReceipt and the allocation by ApplyAllocation, so the old decisions (approve / correct / reject /
// skip / resolveCustomer / approveReceipt / aliases) are refused and write nothing.
//
//   priorityDone {receiptId | proposalIds, priorityReceiptNumber?, decidedBy, decidedByEmail?, note?, asOfDate?, dryRun?}
//     Receipts.receiptStatus → הונפקה ב-Priority (issuedBy / issuedAt / priorityReceiptNumber), its ReceiptAllocations →
//     הונפקה ב-Priority, the customer proposal (MatchProposals) → בוצעה ב-Priority and BankLines.status → קבלה הונפקה
//     when the receipt came from a bank line; a ReceiptCheckSteps step (stage החלטה, actor משתמש) under the line's latest
//     run. Works by receiptId for agent cheques too (no bank line, no proposal). Refused (ok:false, Hebrew reason) when
//     the receipt is still a draft or already issued.
//
// Write order: allocations, proposal, bank line, steps and the receipt's other fields first, receiptStatus LAST, then the
// read-back; a failed write or read-back rolls back everything this decision wrote. The invoice layer and the tasks run
// only after a verified write and never undo it. dryRun writes nothing. Nothing is written to Priority; nothing is sent.
const DECISION = 'priorityDone';
/** Decisions removed on 08.11 with the invoice-matching ladder. */
const RETIRED_DECISIONS = ['approve', 'correct', 'reject', 'skip', 'resolveCustomer', 'approveReceipt', 'approveAlias', 'rejectAlias'];
export const RETIRED_DECISION =
  'ההחלטה הזו הוסרה (08.11): הלקוח והקבלה מאושרים בשלב "זיהוי" במסך התקבולים, והפיזור לחשבוניות בשלב "פיזור". כאן נשאר רק סימון "הונפקה ב-Priority".';
/** Proposal statuses that can be marked done (the customer proposal approved with the receipt, or still open). */
const MARKABLE_PROPOSAL = [MP_APPROVED, MP_PROPOSED];

interface Target {
  receipt: Item;
  proposal: Item | null;
  line: Item | null;
  allocations: Item[];
}

const earliest = (rows: Item[]) => [...rows].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0] ?? null;

export const invoke = async (input: any, context: any) => {
  const decision = str(input?.decision).trim() || DECISION;
  const decidedBy = str(input?.decidedBy).trim();
  const note = str(input?.note).trim();
  const dryRun = input?.dryRun === true;
  const priorityReceiptNumber = str(input?.priorityReceiptNumber).trim() || null;
  const receiptId = str(input?.receiptId).trim();
  const proposalIds: string[] = Array.isArray(input?.proposalIds) ? [...new Set<string>(input.proposalIds.map((x: unknown) => str(x).trim()).filter(Boolean))] : [];
  const out = {
    ok: false,
    dryRun,
    decision,
    results: [] as Item[],
    receipt: null as Item | null,
    priorityInstruction: null as string | null,
    writeVerified: false,
    verifyDetails: {} as Item,
    errors: [] as string[],
  };
  const fail = (...msgs: string[]) => ({ ...out, ok: false, writeVerified: false, errors: [...out.errors, ...msgs] });

  if (RETIRED_DECISIONS.includes(decision)) return fail(RETIRED_DECISION);
  if (decision !== DECISION) return fail(`החלטה לא מוכרת: "${decision}"`);
  if (!decidedBy) return fail('חסר שם המחליט (decidedBy)');
  if (!receiptId && !proposalIds.length) return fail('חסרה קבלה (receiptId) או הצעה (proposalIds)');
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    return fail(errText(e));
  }
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const client = new BlocksClient(context);
  console.log(`DecideMatchProposal: priorityDone by ${decidedBy} – receipt ${receiptId || '—'}, proposals ${proposalIds.join(',') || '—'}${dryRun ? ' (dryRun)' : ''}`);

  // ---------- resolve the receipts (and their proposal, bank line and allocations) ----------
  const problems: string[] = [];
  const receipts: Item[] = [];
  const proposalOfReceipt = new Map<string, Item>();
  if (receiptId) {
    const [r] = await readByIds(client, 'Receipts', [receiptId]);
    if (!r) return fail(`קבלה ${receiptId} לא נמצאה`);
    receipts.push(r);
  }
  if (proposalIds.length) {
    const proposals = await readByIds(client, 'MatchProposals', proposalIds);
    const byId = new Map(proposals.map((p) => [str(p.id), p]));
    const missing = proposalIds.filter((id) => !byId.has(id));
    if (missing.length) return fail(`הצעות לא נמצאו: ${missing.join(', ')}`);
    const keys = proposals.map((p) => str(p.receiptKey).trim() || receiptKeyOf(p.bankLineId));
    const lineIds = proposals.map((p) => str(p.bankLineId).trim()).filter(Boolean);
    const [byKey, byLine] = await Promise.all([readWhereIn(client, 'Receipts', 'receiptKey', keys), readWhereIn(client, 'Receipts', 'bankLineId', lineIds)]);
    for (const [i, p] of proposals.entries()) {
      const own = byKey.filter((r) => str(r.receiptKey) === keys[i]);
      const r = earliest(own.length ? own : byLine.filter((x) => str(x.bankLineId) === str(p.bankLineId)));
      if (!r) {
        problems.push(`להצעה ${str(p.id)} (${str(p.bankLineId)}) אין קבלה – יש לאשר את הלקוח והקבלה קודם`);
        continue;
      }
      if (!receipts.some((x) => str(x.id) === str(r.id))) receipts.push(r);
      proposalOfReceipt.set(str(r.id), p);
    }
  }
  if (problems.length) return fail(...problems);

  const keys = receipts.map((r) => str(r.receiptKey));
  const lineIds = [...new Set(receipts.map((r) => str(r.bankLineId).trim()).filter(Boolean))];
  const [lines, allocations, lineProposals] = await Promise.all([
    readWhereIn(client, 'BankLines', 'bankLineId', lineIds),
    readWhereIn(client, 'ReceiptAllocations', 'receiptKey', keys),
    readWhereIn(client, 'MatchProposals', 'bankLineId', lineIds),
  ]);
  const targets: Target[] = [];
  for (const r of receipts) {
    const key = str(r.receiptKey);
    const status = str(r.receiptStatus).trim();
    if (status === RS_DRAFT || !status) problems.push(`הקבלה ${key} עדיין טיוטה – יש לאשר אותה קודם (שלב "זיהוי" במסך התקבולים)`);
    else if (status === RS_ISSUED) problems.push(`הקבלה ${key} כבר הונפקה ב-Priority${str(r.priorityReceiptNumber) ? ` (מספר ${str(r.priorityReceiptNumber)})` : ''}`);
    else if (status !== RS_APPROVED) problems.push(`הקבלה ${key} בסטטוס לא צפוי "${status}"`);
    const lineId = str(r.bankLineId).trim();
    const line = lineId ? earliest(lines.filter((l) => str(l.bankLineId) === lineId)) : null;
    if (lineId && !line) problems.push(`שורת הבנק ${lineId} של הקבלה ${key} לא נמצאה`);
    let proposal = proposalOfReceipt.get(str(r.id)) ?? null;
    if (!proposal && lineId) {
      const own = lineProposals.filter((p) => str(p.bankLineId) === lineId);
      proposal = own.find((p) => str(p.id) === str(r.matchProposalId)) ?? earliest(own.filter((p) => str(p.status) === MP_APPROVED));
    }
    if (proposal && proposalOfReceipt.has(str(r.id)) && !MARKABLE_PROPOSAL.includes(str(proposal.status))) {
      problems.push(`ההצעה ${str(proposal.id)} בסטטוס "${str(proposal.status)}" – אפשר לסמן רק הצעה שאושרה`);
    }
    if (proposal && !MARKABLE_PROPOSAL.includes(str(proposal.status))) proposal = null;
    targets.push({ receipt: r, proposal, line, allocations: allocations.filter((a) => str(a.receiptKey) === key) });
  }
  if (problems.length) {
    console.log(`DecideMatchProposal: refused – ${problems.join(' | ')}`);
    return fail(...problems);
  }

  // ---------- plan ----------
  const isAuto = decidedBy === AUTO_APPROVE_ACTOR;
  const plans = targets.map((t) => {
    const key = str(t.receipt.receiptKey);
    const receiptFields: Item = { issuedBy: decidedBy, issuedAt: nowIso, ...(priorityReceiptNumber ? { priorityReceiptNumber } : {}) };
    const lineFields: Item | null = t.line
      ? { status: LINE_ISSUED, customerCode: str(t.receipt.customerCode) || str(t.line.customerCode) || null, customerName: str(t.receipt.customerName) || str(t.line.customerName) || null }
      : null;
    const proposalFields: Item | null = t.proposal ? { status: MP_DONE, priorityDoneBy: decidedBy, priorityDoneAt: nowIso } : null;
    const step: Item | null = t.line
      ? {
          importBatchId: str(t.line.importBatchId) || null,
          bankLineId: str(t.line.bankLineId),
          checkRunId: str(t.line.lastCheckRunId) || `decision-${str(t.line.bankLineId)}-${nowMs}`,
          stepNo: 0,
          stage: ST_DECISION,
          rung: R_APPROVE,
          result: RES_FOUND,
          detail: `${decidedBy} סימן/ה "קבלה הונפקה ב-Priority"${priorityReceiptNumber ? ` (מספר קבלה ${priorityReceiptNumber})` : ''}${note ? ` – ${note}` : ''}`,
          evidence: { receiptKey: key, priorityReceiptNumber, proposalId: t.proposal ? str(t.proposal.id) : null },
          actor: isAuto ? ACTOR_SYSTEM : ACTOR_USER,
          actorName: decidedBy,
          at: nowIso,
          isTestFixture: false,
        }
      : null;
    const issued = { ...t.receipt, ...receiptFields, receiptStatus: RS_ISSUED };
    const view = receiptView(issued, t.allocations.map((a) => ({ ...a, status: RC_ISSUED })));
    return { t, key, receiptFields, lineFields, proposalFields, step, view };
  });
  for (const p of plans) {
    out.results.push({
      receiptId: str(p.t.receipt.id),
      receiptKey: p.key,
      bankLineId: str(p.t.receipt.bankLineId) || null,
      receiptSource: str(p.t.receipt.receiptSource) || null,
      previousReceiptStatus: str(p.t.receipt.receiptStatus),
      receiptStatus: RS_ISSUED,
      priorityReceiptNumber,
      allocations: p.t.allocations.length,
      proposal: p.t.proposal ? { id: str(p.t.proposal.id), previousStatus: str(p.t.proposal.status), status: MP_DONE } : null,
      bankLine: p.t.line && p.lineFields ? { id: p.t.line.id, bankLineId: str(p.t.line.bankLineId), previousStatus: str(p.t.line.status), ...p.lineFields } : null,
      receipt: p.view,
      priorityInstruction: priorityInstructionOf(p.view),
    });
  }
  const first = plans[0];
  const receiptOut = (r: Item) => ({
    receiptKey: str(r.receiptKey),
    receiptId: str(r.id),
    bankLineId: str(r.bankLineId) || null,
    customerCode: str(r.customerCode) || null,
    customerName: str(r.customerName) || null,
    amount: r.amount ?? null,
    receiptStatus: str(r.receiptStatus) || null,
    matchStatus: str(r.matchStatus) || null,
    priorityReceiptNumber: str(r.priorityReceiptNumber) || null,
    issuedBy: str(r.issuedBy) || null,
    issuedAt: str(r.issuedAt) || null,
  });
  out.receipt = receiptOut({ ...first.t.receipt, ...first.receiptFields, receiptStatus: RS_ISSUED });
  out.priorityInstruction = priorityInstructionOf(first.view);

  if (dryRun) {
    return {
      ...out,
      ok: true,
      plannedWrites: plans.flatMap((p) => [
        ...p.t.allocations.map((a) => ({ table: 'ReceiptAllocations', id: str(a.id), fields: { status: RC_ISSUED } })),
        ...(p.proposalFields ? [{ table: 'MatchProposals', id: str(p.t.proposal!.id), fields: p.proposalFields }] : []),
        ...(p.lineFields ? [{ table: 'BankLines', id: str(p.t.line!.id), fields: p.lineFields }] : []),
        { table: 'Receipts', id: str(p.t.receipt.id), fields: { ...p.receiptFields, receiptStatus: RS_ISSUED } },
      ]),
      plannedCreates: plans.filter((p) => p.step).map((p) => ({ table: 'ReceiptCheckSteps', row: p.step })),
      verifyDetails: { note: 'dryRun – nothing was written.' },
    };
  }

  // ---------- write (journaled) ----------
  const journal = new WriteJournal();
  const errors: string[] = [];
  const createdSteps: Item[] = [];
  const verify: string[] = [];
  try {
    for (const p of plans) {
      for (const a of p.t.allocations) await journal.update(client, 'ReceiptAllocations', a, { status: RC_ISSUED });
      if (p.proposalFields) await journal.update(client, 'MatchProposals', p.t.proposal!, p.proposalFields);
      if (p.lineFields) await journal.update(client, 'BankLines', p.t.line!, p.lineFields);
      if (p.step) {
        const prior = await readAll(client, 'ReceiptCheckSteps', { column: 'checkRunId', value: str(p.step.checkRunId) });
        const stepNo = prior.reduce((m, s) => Math.max(m, Number(s.stepNo) || 0), 0) + 1;
        createdSteps.push(await journal.create(client, 'ReceiptCheckSteps', { ...p.step, stepNo }));
      }
      await journal.update(client, 'Receipts', p.t.receipt, p.receiptFields);
    }
    // receiptStatus LAST
    for (const p of plans) await journal.update(client, 'Receipts', p.t.receipt, { receiptStatus: RS_ISSUED });

    // ---------- read back ----------
    const [rBack, aBack, pBack, lBack, sBack] = await Promise.all([
      readByIds(client, 'Receipts', plans.map((p) => str(p.t.receipt.id))),
      readByIds(client, 'ReceiptAllocations', plans.flatMap((p) => p.t.allocations.map((a) => str(a.id)))),
      readByIds(client, 'MatchProposals', plans.filter((p) => p.t.proposal).map((p) => str(p.t.proposal!.id))),
      readByIds(client, 'BankLines', plans.filter((p) => p.t.line).map((p) => str(p.t.line!.id))),
      readByIds(client, 'ReceiptCheckSteps', createdSteps.map((s) => str(s.id))),
    ]);
    const byId = (rows: Item[]) => new Map(rows.map((r) => [str(r.id), r]));
    const rMap = byId(rBack);
    const aMap = byId(aBack);
    const pMap = byId(pBack);
    const lMap = byId(lBack);
    for (const p of plans) {
      const r = rMap.get(str(p.t.receipt.id));
      if (!r || str(r.receiptStatus) !== RS_ISSUED || str(r.issuedBy) !== decidedBy || (priorityReceiptNumber && str(r.priorityReceiptNumber) !== priorityReceiptNumber)) verify.push(`Receipts ${p.key}: לא נקראה בחזרה כמונפקת`);
      for (const a of p.t.allocations) if (str(aMap.get(str(a.id))?.status) !== RC_ISSUED) verify.push(`ReceiptAllocations ${str(a.id)}: הסטטוס לא נשמר`);
      if (p.t.proposal && str(pMap.get(str(p.t.proposal.id))?.status) !== MP_DONE) verify.push(`MatchProposals ${str(p.t.proposal.id)}: הסטטוס לא נשמר`);
      if (p.t.line && str(lMap.get(str(p.t.line.id))?.status) !== LINE_ISSUED) verify.push(`BankLines ${str(p.t.line.bankLineId)}: הסטטוס לא נשמר`);
      if (r) p.view = receiptView(r, p.t.allocations.map((a) => aMap.get(str(a.id)) ?? a));
    }
    if (sBack.length !== createdSteps.length) verify.push('ReceiptCheckSteps: צעד ההחלטה לא נקרא בחזרה');
    if (!verify.length) {
      const r0 = rMap.get(str(first.t.receipt.id));
      if (r0) out.receipt = receiptOut(r0);
      out.priorityInstruction = priorityInstructionOf(first.view);
      plans.forEach((p, i) => {
        out.results[i].receipt = p.view;
        out.results[i].priorityInstruction = priorityInstructionOf(p.view);
      });
    }
  } catch (e) {
    errors.push(errText(e));
  }
  if (errors.length || verify.length) {
    const rb = await journal.rollback(client);
    console.error(`DecideMatchProposal: not verified (${errors.length} errors, ${verify.length} problems) – rolled back`);
    return { ...fail(...errors, ...verify, 'הסימון לא נשמר במלואו – מה שנכתב בוטל', ...rb), receipt: null, priorityInstruction: null, verifyDetails: { problems: verify } };
  }
  console.log(`DecideMatchProposal: ${plans.length} receipt(s) marked issued in Priority (${plans.map((p) => p.key).join(', ')})`);

  // ---------- invoice layer and tasks (after a verified write; never undo it) ----------
  const after: string[] = [];
  const invoiceNumbers = [...new Set(plans.flatMap((p) => p.t.allocations.map((a) => str(a.invoiceNumber).trim())).filter(Boolean))];
  const customerCodes = [...new Set(plans.map((p) => str(p.t.receipt.customerCode).trim()).filter(Boolean))];
  let invoiceLayer: Item | null = null;
  if (invoiceNumbers.length) {
    try {
      const refreshed = await refreshInvoiceLayer(client, { invoiceNumbers, customerCodes, dryRun: false, nowIso });
      invoiceLayer = layerSummary(refreshed);
      after.push(...refreshed.errors.map((e) => `הסימון נשמר, אבל עדכון החשבוניות נכשל: ${e}`));
    } catch (e) {
      after.push(`הסימון נשמר, אבל עדכון החשבוניות נכשל: ${errText(e)}`);
    }
  }
  const bankLineIds = plans.map((p) => str(p.t.line?.bankLineId)).filter(Boolean);
  const taskSync = await syncTasksAfterWrite(
    client,
    [...(bankLineIds.length ? [{ bankLineIds }] : []), ...customerCodes.map((customerCode) => ({ customerCode, sources: [SRC_AGING] }))],
    { asOfDate, nowIso, label: 'DecideMatchProposal' },
  );

  return {
    ...out,
    ok: true,
    steps: createdSteps,
    invoiceLayer,
    taskSync,
    writeVerified: true,
    verifyDetails: { receipts: plans.length, allocations: plans.reduce((s, p) => s + p.t.allocations.length, 0), steps: createdSteps.length },
    errors: after,
  };
};
