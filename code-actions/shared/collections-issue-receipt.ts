// IssueReceipt as a shared function – plan 04.11 part B, stage 4 (b/identify-receipt). A person approves the customer of
// identified bank lines and that approval issues the receipt; IdentifyCustomers calls the same function (mode auto)
// when customerAutoApproveAt is on.
//
// Modes:
//   certain – "אשר את כל הוודאיים": only a draft whose identifyStatus is ודאי AND whose identifyConfidence is still ≥
//             identifyCertainAt (re-checked here) is issued; every other line is returned in skipped.
//   one     – one line with the customer the person confirmed / picked (customerCode; required unless the draft is
//             certain). A line without a draft (unidentified) gets its receipt created now.
//   auto    – internal (IdentifyCustomers): the draft's own customer, approvedBy אישור אוטומטי (מערכת), identifyStatus
//             אושר אוטומטית. No alias is saved automatically – an alias is a person's decision.
//
// Per line, write order: compute → write (alias, receipt non-status fields, bank line, the customer proposal) → read
// back → the receipt's status fields LAST (receiptStatus אושרה – לא נשלחה, identifyStatus, matchStatus על חשבון –
// צריך פיזור) → read back; any failure rolls back what this line wrote. Then, NOT rolled back on failure: the receipt
// PDF (collections-receipt-doc.ts, the same file GenerateReceiptPdf previews) and one mail draft to the customer's AP
// contact (collections-outbox.ts saveOutboxDraft: kind דואל, component תקבולים, status ממתין) → sendStatus טיוטה –
// בדיקה; no AP contact with an email → sendStatus חסר איש קשר and the task missing-ap:<customerCode>. The line's
// identify:<id> task and its legacy receipt tasks close.
// Stage 5 (b/debt-allocation): right after, the debt check (collections-debt-check.ts checkDebt, in-process) runs for
// every receipt approved now and for already-approved receipts of the call that were never checked: נסגר לאפס → alert
// + פיזור מוצע – לאישור, else לברר מול הלקוח + task debt-check:<receiptKey>. Its failure (e.g. an empty OpenMovements
// mirror) never undoes the receipt: it is reported in errors ("בדיקת חוב: …") and in debtCheck, ok stays true.
// Stage 6: for every receipt whose debt check was decided, the allocation proposal (collections-allocation.ts
// proposeAllocation, in-process): allocationConfidence; a zero-closed receipt also gets the task קבלה – צריך פיזור;
// allocationAutoApproveAt (empty = off) applies it at once. Its failure never undoes the receipt ("פיזור: …", allocation).
// Idempotent: an approved receipt is skipped ("כבר אושרה") and never gets a second draft (Approvals is looked up by
// relatedTable Receipts + relatedId receiptKey); when its earlier PDF / draft step did not finish (no draft, sendStatus
// empty or חסר איש קשר) that step alone runs again. Nothing is sent and nothing is written to Priority.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { naturalCompare } from './collections-aging.ts';
import { formatDateHe, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, errText, formatIls, isFixtureCustomer, num, ownerOf, readAll, readByIds, readSettings, readWhereIn, round2, str } from './collections-data.ts';
import { BOUNCED, DECIDED_LINE_STATUSES, MP_PROPOSED, normName } from './collections-matching.ts';
import { C_RECEIPTS, readMailboxes, saveOutboxDraft } from './collections-outbox.ts';
import {
  ALIAS_SRC_MANUAL,
  ALIAS_SRC_MATCH,
  CS_APPROVED,
  isMoneyInLine,
  isNonReceiptLine,
  PRIORITY_NOT_SYNCED,
  refreshBatchCheckStatus,
} from './collections-receipts.ts';
import { receiptKeyOf, RS_APPROVED, RS_DRAFT, RS_ISSUED } from './collections-receipt-record.ts';
import { generateReceiptPdf } from './collections-receipt-doc.ts';
import { checkDebt } from './collections-debt-check.ts';
import { proposeAllocation } from './collections-allocation.ts';
import {
  AUTO_APPROVE_ACTOR,
  closeResolvedMissingApTasks,
  closeTasksByKeys,
  hasApEmail,
  identifyTaskKey,
  IS_APPROVED,
  IS_AUTO,
  IS_CERTAIN,
  legacyLineTaskKeys,
  missingApTaskKey,
  MP_DECIDED_APPROVED,
  MP_DECIDED_REJECTED,
  MS_ON_ACCOUNT_SPREAD,
  nextNoonIso,
  RSRC_BANK,
  SEND_DRAFT,
  SEND_MISSING_CONTACT,
  stageTaskRow,
  type StageTaskResult,
  TT_MISSING_AP,
  upsertReopenTask,
  WriteJournal,
} from './collections-receipt-flow.ts';
import { signerOf } from './collections-statement-pdf.ts';
import type { StatementSigner } from './collections-statement.ts';
import { computeSeverity, severityConfigFrom } from './collections-severity.ts';
import { A_RECEIPT } from './collections-tasks.ts';
import { numberSettingOrNull, planSettingOf } from './plan-settings.ts';

export type IssueMode = 'certain' | 'one' | 'auto';
export const ISSUE_MODES: IssueMode[] = ['certain', 'one'];
export const SKIP_ALREADY = 'כבר אושרה';
const ALIAS_APPROVED = 'מאושר';
const DEFAULT_APPROVER = 'משתמש';
const COMPANY_SHORT = 'סימנט';

export interface IssueDeps {
  nowIso?: string;
  /** already-read AgentSettings (IdentifyCustomers passes its own) */
  settings?: Map<string, string>;
}

const collapse = (v: unknown) => str(v).replace(/\s+/g, ' ').trim();
const ils = (n: number) => `${formatIls(n)} ש״ח`;
const isApproved = (r: Item | null | undefined) => [RS_APPROVED, RS_ISSUED].includes(str(r?.receiptStatus).trim());
const earliest = (rows: Item[]) => [...rows].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0] ?? null;

/** The identifyCertainAt threshold (AgentSettings; the plan default when the row is empty or not a number). */
export function certainAtOf(settings: Map<string, string>): number {
  return numberSettingOrNull(settings, 'identifyCertainAt') ?? Number(planSettingOf('identifyCertainAt')?.value ?? 90);
}

/** The AP contact a receipt is mailed to: isApContact with an email; a ראשי one first, else by name. */
export function apMailContactOf(contacts: Item[], customerCode: string): Item | null {
  const list = contacts.filter((c) => str(c.customerCode).trim() === customerCode && hasApEmail(c));
  const primary = (c: Item) => (/ראשי/.test(str(c.roleFlags)) ? 0 : 1);
  return list.sort((a, b) => primary(a) - primary(b) || str(a.contactName).localeCompare(str(b.contactName), 'he') || naturalCompare(str(a.contactKey), str(b.contactKey)))[0] ?? null;
}

/** The mail to the AP contact (Hebrew, signed by the customer's bookkeeper). */
export function receiptMail(x: { receiptKey: string; amount: number; valueDate: string | null; reference: string; recipientName: string; signer: StatementSigner | null }) {
  const subject = `קבלה על תשלום ₪${formatIls(x.amount)} – ${COMPANY_SHORT}`;
  const phone = str(x.signer?.phone).trim();
  const ref = collapse(x.reference);
  const lines = [
    x.recipientName ? `שלום ${x.recipientName},` : 'שלום,',
    '',
    `מצורפת קבלה ${x.receiptKey} על ההעברה${x.valueDate ? ` מתאריך ${formatDateHe(x.valueDate)}` : ''} בסך ₪${formatIls(x.amount)}${ref ? `, אסמכתא ${ref}` : ''}.`,
    'הקבלה מצורפת לקובץ PDF.',
    phone ? `לבירורים ניתן לפנות בחזרה למייל או לנייד ${phone}.` : 'לבירורים ניתן לפנות בחזרה למייל.',
    '',
    'בברכה,',
    ...(x.signer?.name ? [x.signer.name, x.signer.role || 'מנהלת חשבונות'] : ['מחלקת הנהלת חשבונות']),
    'סימנט אי.אס. בע״מ',
  ];
  return { subject, body: lines.join('\n') };
}

interface AliasPlan {
  create?: Item;
  updateRow?: Item;
  fields?: Item;
  note?: string;
}

/**
 * The approved alias the approval saves (same rules as DecideMatchProposal resolveCustomer): when the person picked a
 * customer other than the proposal, or the payer name differs from the customer name, and the name has no approved
 * alias for this customer yet. A name approved for another customer is never re-pointed (note only).
 */
export function planApprovalAlias(x: {
  line: Item;
  customerCode: string;
  customerName: string;
  proposedCode: string;
  aliases: Item[];
  approvedBy: string;
  nowIso: string;
  isTest: boolean;
}): AliasPlan | null {
  const payer = collapse(x.line.payerName);
  const key = normName(payer);
  if (!key) return null;
  const picked = !!x.proposedCode && x.proposedCode !== x.customerCode;
  const noProposal = !x.proposedCode;
  if (!picked && key === normName(x.customerName)) return null;
  const same = x.aliases.filter((a) => normName(a.bankName) === key);
  if (same.some((a) => str(a.status) === ALIAS_APPROVED && str(a.customerCode) === x.customerCode)) return null;
  const elsewhere = same.find((a) => str(a.status) === ALIAS_APPROVED && str(a.customerCode) !== x.customerCode);
  if (elsewhere) return { note: `השם "${payer}" כבר מאושר ככינוי של ${str(elsewhere.customerCode)} ${str(elsewhere.customerName)} – לא נשמר כינוי ללקוח אחר` };
  const fields: Item = {
    bankName: payer,
    customerCode: x.customerCode,
    customerName: x.customerName,
    status: ALIAS_APPROVED,
    approvedBy: x.approvedBy,
    approvedAt: x.nowIso,
    source: picked || noProposal ? ALIAS_SRC_MANUAL : ALIAS_SRC_MATCH,
    evidenceEmailId: null,
    prioritySync: PRIORITY_NOT_SYNCED,
    isTestFixture: x.isTest,
  };
  const pending = same.find((a) => str(a.customerCode) === x.customerCode);
  return pending ? { updateRow: pending, fields } : { create: { ...fields, proposedFromBankLineId: str(x.line.bankLineId), proposedAt: x.nowIso }, fields };
}

interface LinePlan {
  bankLineId: string;
  receiptKey: string;
  line: Item;
  receipt: Item | null;
  proposal: Item | null;
  customer: Item;
  customerCode: string;
  customerName: string;
  amount: number;
  identifyStatus: string;
  alias: AliasPlan | null;
  isTest: boolean;
}

interface SendCtx {
  nowIso: string;
  asOfDate: string;
  approvedBy: string;
  contacts: Item[];
  team: Item[];
  ownerMap: Map<string, string>;
  approvals: Item[];
  mailboxes: Item[];
  settings: Map<string, string>;
}

/** PDF + mail draft (or the missing-contact task) of an approved receipt. Never throws; never undoes the approval. */
async function sendStage(client: BlocksClient, receipt: Item, customer: Item, ctx: SendCtx): Promise<Item> {
  const errors: string[] = [];
  const receiptKey = str(receipt.receiptKey);
  const code = str(customer.customerCode).trim();
  const out: Item = { sendStatus: str(receipt.sendStatus), sentToEmail: str(receipt.sentToEmail), approvalId: '', pdfUrl: '', taskKey: '', errors, task: null as StageTaskResult | null };
  const owner = ownerOf(code, customer, ctx.ownerMap);
  const signer = signerOf(owner, ctx.team);
  const existing = earliest(ctx.approvals.filter((a) => str(a.relatedTable) === 'Receipts' && str(a.relatedId) === receiptKey));
  if (existing && str(existing.status).trim() !== 'ממתין') {
    // a draft already decided – never a second one
    out.approvalId = str(existing.id);
    return out;
  }
  const contact = apMailContactOf(ctx.contacts, code);
  const isTest = isFixtureCustomer(customer, code) || receipt.isTestFixture === true;
  if (!contact) {
    try {
      await client.updateItem('Receipts', str(receipt.id), { sendStatus: SEND_MISSING_CONTACT, sentToEmail: null, sentAt: null });
      out.sendStatus = SEND_MISSING_CONTACT;
      out.sentToEmail = '';
    } catch (e) {
      errors.push(`Receipts ${receiptKey} (sendStatus): ${errText(e)}`);
    }
    // one task per customer, about every receipt of it still waiting for a contact
    let waiting: Item[] = [];
    try {
      waiting = (await readAll(client, 'Receipts', { column: 'customerCode', value: code })).filter((r) => str(r.sendStatus) === SEND_MISSING_CONTACT && isApproved(r));
    } catch {
      waiting = [receipt];
    }
    if (!waiting.some((r) => str(r.receiptKey) === receiptKey)) waiting.push({ ...receipt, sendStatus: SEND_MISSING_CONTACT });
    const total = round2(waiting.reduce((s, r) => s + Math.abs(num(r.amount)), 0));
    const name = str(customer.customerName) || code;
    const amount = round2(Math.abs(num(receipt.amount)));
    const row = stageTaskRow(missingApTaskKey(code), {
      taskType: TT_MISSING_AP,
      title: `חסר איש קשר הנהלת חשבונות – ${name}`,
      reasons: `${waiting.length === 1 ? 'קבלה מאושרת אחת' : `${waiting.length} קבלות מאושרות`} (סה״כ ${ils(total)}) לא ${waiting.length === 1 ? 'נשלחה' : 'נשלחו'}: ללקוח אין איש קשר מסומן כהנהלת חשבונות (isApContact) עם כתובת מייל. האחרונה: ${receiptKey} – ${ils(amount)}. להוסיף איש קשר כזה בכרטיס הלקוח ואז להפיק את טיוטת המייל מחדש ממסך התקבולים.`,
      recommendedAction: A_RECEIPT,
      severity: computeSeverity({ amount: total, daysOverdue: 0 }, severityConfigFrom(ctx.settings)),
      customerCode: code,
      customerName: name,
      owner: owner || null,
      amount: total,
      invoiceNumbers: [],
      relatedTable: 'Receipts',
      relatedId: receiptKey,
      dueAt: nextNoonIso(ctx.asOfDate),
      asOfDate: ctx.asOfDate,
      nowIso: ctx.nowIso,
      isTestFixture: isTest,
    });
    const task = await upsertReopenTask(client, row, ctx.nowIso, ctx.asOfDate);
    out.task = task;
    out.taskKey = task.taskKey;
    errors.push(...task.errors);
    return out;
  }

  const pdf = await generateReceiptPdf(client, { receipt, customer, signer });
  out.pdfUrl = pdf.url;
  if (!pdf.url) {
    errors.push(...(pdf.errors.length ? pdf.errors : [`הפקת ה-PDF של ${receiptKey} נכשלה`]).map((e) => `${receiptKey}: ${e} – טיוטת המייל לא נוצרה`));
    return out;
  }
  const email = str(contact.email).trim();
  const recipientName = collapse(contact.contactName);
  const mail = receiptMail({ receiptKey, amount: round2(Math.abs(num(receipt.amount))), valueDate: toIsraelDate(receipt.valueDate), reference: str(receipt.reference), recipientName, signer });
  const draft: Item = {
    customerCode: code,
    customerName: str(customer.customerName) || code,
    kind: 'דואל',
    recipientName: recipientName || null,
    recipientContact: email,
    subject: mail.subject,
    body: mail.body,
    reason: `קבלה ${receiptKey} אושרה – לשליחה להנהלת החשבונות של הלקוח (${recipientName || email})`,
    status: 'ממתין',
    draftedBy: ctx.approvedBy,
    draftedAt: ctx.nowIso,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    relatedTable: 'Receipts',
    relatedId: receiptKey,
    fromMailbox: null,
    attachmentUrls: pdf.url,
    isTestFixture: isTest,
  };
  try {
    const saved = await saveOutboxDraft(client, draft, { component: C_RECEIPTS, existing, mailboxes: ctx.mailboxes });
    out.approvalId = saved.id;
  } catch (e) {
    errors.push(`${receiptKey}: טיוטת המייל לא נשמרה – ${errText(e)}`);
    return out;
  }
  try {
    await client.updateItem('Receipts', str(receipt.id), { sendStatus: SEND_DRAFT, sentToEmail: email, sentAt: null });
    out.sendStatus = SEND_DRAFT;
    out.sentToEmail = email;
  } catch (e) {
    errors.push(`Receipts ${receiptKey} (sendStatus): ${errText(e)}`);
  }
  return out;
}

export async function issueReceipts(client: BlocksClient, input: Item, deps: IssueDeps = {}): Promise<Item> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const mode = str(input?.mode).trim() as IssueMode;
  const dryRun = input?.dryRun === true || input?.dryRun === 'true';
  const ids = [...new Set((Array.isArray(input?.bankLineIds) ? input.bankLineIds : []).map((x: unknown) => str(x).trim()).filter(Boolean))] as string[];
  const errors: string[] = [];
  const out: Item = { ok: false, dryRun, issued: [] as Item[], skipped: [] as Item[], writeVerified: false, taskSync: null, errors };
  if (!['certain', 'one', 'auto'].includes(mode)) {
    errors.push(`מצב לא מוכר: "${mode}" (certain / one)`);
    return out;
  }
  if (!ids.length) {
    errors.push('חסרות שורות בנק (bankLineIds)');
    return out;
  }
  if (mode === 'one' && ids.length !== 1) {
    errors.push('במצב one מאשרים שורה אחת בלבד');
    return out;
  }
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    errors.push(errText(e));
    return out;
  }
  const approvedBy = mode === 'auto' ? AUTO_APPROVE_ACTOR : collapse(input?.approvedBy) || DEFAULT_APPROVER;
  const pickedCode = mode === 'one' ? str(input?.customerCode).trim() : '';
  const keys = ids.map(receiptKeyOf);

  const settings = deps.settings ?? (await readSettings(client));
  const certainAt = certainAtOf(settings);
  const [lineRows, receiptRows, proposalRows, aliases, team, approvals, mailboxes] = await Promise.all([
    readWhereIn(client, 'BankLines', 'bankLineId', ids),
    readWhereIn(client, 'Receipts', 'receiptKey', keys),
    readWhereIn(client, 'MatchProposals', 'bankLineId', ids),
    readAll(client, 'BankAliases'),
    readAll(client, 'TeamMembers').catch(() => [] as Item[]),
    readWhereIn(client, 'Approvals', 'relatedId', keys).then((rows) => rows.filter((a) => str(a.relatedTable) === 'Receipts')),
    readMailboxes(client),
  ]);
  const lineOf = (id: string) => earliest(lineRows.filter((l) => str(l.bankLineId) === id));
  const receiptOf = (id: string) => earliest(receiptRows.filter((r) => str(r.receiptKey) === receiptKeyOf(id)));
  const proposalOf = (id: string) =>
    [...proposalRows]
      .filter((p) => str(p.bankLineId) === id && str(p.status) === MP_PROPOSED && !str(p.invoiceNumbers).trim())
      .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? null;
  const codes = [...new Set([...receiptRows.map((r) => str(r.customerCode).trim()), pickedCode].filter(Boolean))];
  const [customers, contacts, owners] = codes.length
    ? await Promise.all([readWhereIn(client, 'Customers', 'customerCode', codes), readWhereIn(client, 'CustomerContacts', 'customerCode', codes), readWhereIn(client, 'CustomerOwners', 'customerCode', codes)])
    : [[], [], []];
  const customerOf = (code: string) => customers.find((c) => str(c.customerCode).trim() === code) ?? null;
  const sendCtx: SendCtx = { nowIso, asOfDate, approvedBy, contacts, team, ownerMap: buildOwnerMap(owners), approvals, mailboxes, settings };

  // ---------- plan ----------
  const plans: LinePlan[] = [];
  const retries: { bankLineId: string; receipt: Item; customer: Item }[] = [];
  const skip = (bankLineId: string, reason: string) => out.skipped.push({ bankLineId, reason });
  for (const id of ids) {
    const line = lineOf(id);
    if (!line) {
      skip(id, 'שורת הבנק לא נמצאה');
      continue;
    }
    const receipt = receiptOf(id);
    if (isApproved(receipt)) {
      skip(id, SKIP_ALREADY);
      const c = customerOf(str(receipt!.customerCode).trim());
      const hasDraft = approvals.some((a) => str(a.relatedId) === receiptKeyOf(id));
      if (c && !hasDraft && ['', SEND_MISSING_CONTACT].includes(str(receipt!.sendStatus).trim()) && mode !== 'auto') retries.push({ bankLineId: id, receipt: receipt!, customer: c });
      continue;
    }
    if (str(line.lineType).trim() === BOUNCED) {
      skip(id, 'צ׳ק חוזר – זו לא קבלה');
      continue;
    }
    if (isNonReceiptLine(line) || !isMoneyInLine(line)) {
      skip(id, `שורה מסוג "${str(line.lineType) || 'לא ידוע'}" אינה תקבול`);
      continue;
    }
    if (DECIDED_LINE_STATUSES.includes(str(line.status)) || str(line.checkStage) === CS_APPROVED) {
      skip(id, SKIP_ALREADY);
      continue;
    }
    const isDraft = !!receipt && [RS_DRAFT, ''].includes(str(receipt.receiptStatus).trim());
    const draftCertain = isDraft && str(receipt!.identifyStatus).trim() === IS_CERTAIN && num(receipt!.identifyConfidence) >= certainAt && !!str(receipt!.customerCode).trim();
    let code = '';
    if (mode === 'certain') {
      if (!draftCertain) {
        skip(id, receipt && str(receipt.identifyStatus).trim() === IS_CERTAIN ? `רמת הביטחון ${num(receipt.identifyConfidence)} מתחת לסף ${certainAt} – לאשר אחד-אחד` : 'הזיהוי לא ודאי – לאשר אחד-אחד');
        continue;
      }
      code = str(receipt!.customerCode).trim();
    } else if (mode === 'auto') {
      if (!isDraft || !str(receipt!.customerCode).trim()) {
        skip(id, 'אין טיוטת קבלה עם לקוח לאישור אוטומטי');
        continue;
      }
      code = str(receipt!.customerCode).trim();
    } else {
      code = pickedCode || (draftCertain ? str(receipt!.customerCode).trim() : '');
      if (!code) {
        skip(id, 'הזיהוי אינו ודאי – יש לבחור לקוח (customerCode)');
        continue;
      }
    }
    const customer = customerOf(code);
    if (!customer) {
      skip(id, `הלקוח ${code} לא נמצא`);
      continue;
    }
    const customerName = str(customer.customerName) || code;
    const proposal = proposalOf(id);
    const proposedCode = str(receipt?.customerCode).trim() || str(proposal?.customerCode).trim();
    const alias =
      mode === 'auto' ? null : planApprovalAlias({ line, customerCode: code, customerName, proposedCode, aliases, approvedBy, nowIso, isTest: false });
    plans.push({
      bankLineId: id,
      receiptKey: receiptKeyOf(id),
      line,
      receipt,
      proposal,
      customer,
      customerCode: code,
      customerName,
      amount: round2(Math.abs(num(line.amount))),
      identifyStatus: mode === 'auto' ? IS_AUTO : IS_APPROVED,
      alias,
      isTest: false,
    });
  }

  if (dryRun) {
    for (const p of plans) {
      const contact = apMailContactOf(contacts, p.customerCode);
      out.issued.push({
        bankLineId: p.bankLineId,
        receiptKey: p.receiptKey,
        customerCode: p.customerCode,
        customerName: p.customerName,
        amount: p.amount,
        identifyStatus: p.identifyStatus,
        sendStatus: contact ? SEND_DRAFT : SEND_MISSING_CONTACT,
        sentToEmail: contact ? str(contact.email).trim() : '',
        approvalId: '',
        pdfUrl: '',
        aliasSaved: !!(p.alias?.create || p.alias?.updateRow),
        taskKey: contact ? '' : missingApTaskKey(p.customerCode),
        ...(p.alias?.note ? { aliasNote: p.alias.note } : {}),
      });
    }
    for (const r of retries) out.skipped.find((s: Item) => s.bankLineId === r.bankLineId).retrySend = true;
    out.ok = true;
    return out;
  }

  // ---------- write: one line at a time ----------
  let allVerified = true;
  const approved: { plan: LinePlan; receipt: Item }[] = [];
  for (const p of plans) {
    const j = new WriteJournal();
    const fail = async (msg: string) => {
      allVerified = false;
      const rb = await j.rollback(client);
      errors.push(`${p.bankLineId}: ${msg} – מה שנכתב לשורה בוטל`, ...rb);
    };
    try {
      // 1. the alias (born approved)
      let aliasSaved = false;
      let aliasId = '';
      if (p.alias?.create) {
        aliasId = str((await j.create(client, 'BankAliases', p.alias.create)).id);
        aliasSaved = true;
      } else if (p.alias?.updateRow && p.alias.fields) {
        await j.update(client, 'BankAliases', p.alias.updateRow, p.alias.fields);
        aliasId = str(p.alias.updateRow.id);
        aliasSaved = true;
      }
      // 2. the receipt's non-status fields (created when the line had none)
      const fields: Item = {
        receiptKey: p.receiptKey,
        bankLineId: p.bankLineId,
        importBatchId: str(p.line.importBatchId) || null,
        customerCode: p.customerCode,
        customerName: p.customerName,
        payerName: collapse(p.line.payerName) || null,
        reference: collapse(p.line.reference) || null,
        valueDate: toIsraelDate(p.line.valueDate),
        amount: p.amount,
        allocatedAmount: 0,
        unallocatedAmount: p.amount,
        receiptSource: RSRC_BANK,
        preparedBy: approvedBy,
        preparedAt: nowIso,
        isTestFixture: p.isTest,
      };
      let receiptId = '';
      if (p.receipt) {
        await j.update(client, 'Receipts', p.receipt, fields);
        receiptId = str(p.receipt.id);
      } else {
        const created = await j.create(client, 'Receipts', {
          ...fields,
          matchProposalId: null,
          identifyConfidence: 0,
          priorityReceiptNumber: null,
          issuedBy: null,
          issuedAt: null,
          sendStatus: null,
          sentToEmail: null,
          sentAt: null,
        });
        receiptId = str(created.id);
      }
      // 3. the bank line
      await j.update(client, 'BankLines', p.line, { customerCode: p.customerCode, customerName: p.customerName, receiptKey: p.receiptKey, checkStage: CS_APPROVED, lastCheckedAt: nowIso });
      // 4. the customer proposal: approved when the person kept it, rejected when they picked another customer
      if (p.proposal) {
        const keep = str(p.proposal.customerCode).trim() === p.customerCode;
        await j.update(client, 'MatchProposals', p.proposal, { status: keep ? MP_DECIDED_APPROVED : MP_DECIDED_REJECTED, decidedBy: approvedBy, decidedAt: nowIso });
      }
      // read back
      const [[rBack], [lBack], aBack] = await Promise.all([
        readByIds(client, 'Receipts', [receiptId]).catch(() => [] as Item[]),
        readByIds(client, 'BankLines', [str(p.line.id)]).catch(() => [] as Item[]),
        aliasId ? readByIds(client, 'BankAliases', [aliasId]).catch(() => [] as Item[]) : Promise.resolve([] as Item[]),
      ]);
      if (!rBack || str(rBack.customerCode) !== p.customerCode || Math.abs(num(rBack.amount) - p.amount) > 0.005 || str(rBack.receiptKey) !== p.receiptKey) {
        await fail(`הקבלה ${p.receiptKey} לא נקראה בחזרה כפי שנכתבה`);
        continue;
      }
      if (!lBack || str(lBack.checkStage) !== CS_APPROVED || str(lBack.receiptKey) !== p.receiptKey) {
        await fail(`שורת הבנק לא נקראה בחזרה כמאושרת`);
        continue;
      }
      if (aliasId && (!aBack[0] || str(aBack[0].status) !== ALIAS_APPROVED)) {
        await fail('הכינוי לא נשמר כמאושר');
        continue;
      }
      // 5. status fields LAST
      const statusFields = { receiptStatus: RS_APPROVED, identifyStatus: p.identifyStatus, matchStatus: MS_ON_ACCOUNT_SPREAD };
      await j.update(client, 'Receipts', rBack, statusFields);
      const [r2] = await readByIds(client, 'Receipts', [receiptId]);
      if (!r2 || str(r2.receiptStatus) !== RS_APPROVED || str(r2.identifyStatus) !== p.identifyStatus || str(r2.matchStatus) !== MS_ON_ACCOUNT_SPREAD) {
        await fail(`סטטוס הקבלה ${p.receiptKey} לא נשמר`);
        continue;
      }
      approved.push({ plan: p, receipt: r2 });
      out.issued.push({
        bankLineId: p.bankLineId,
        receiptKey: p.receiptKey,
        customerCode: p.customerCode,
        customerName: p.customerName,
        amount: p.amount,
        identifyStatus: p.identifyStatus,
        sendStatus: '',
        sentToEmail: '',
        approvalId: '',
        pdfUrl: '',
        aliasSaved,
        taskKey: '',
        ...(p.alias?.note ? { aliasNote: p.alias.note } : {}),
      });
    } catch (e) {
      await fail(errText(e));
    }
  }

  // ---------- after the approval (never rolls it back): PDF + draft / missing-contact task, tasks ----------
  let sendOk = true;
  const taskResults: Item[] = [];
  for (const a of approved) {
    const s = await sendStage(client, a.receipt, a.plan.customer, sendCtx);
    const item = out.issued.find((x: Item) => x.bankLineId === a.plan.bankLineId);
    Object.assign(item, { sendStatus: s.sendStatus, sentToEmail: s.sentToEmail, approvalId: s.approvalId, pdfUrl: s.pdfUrl, taskKey: s.taskKey });
    if (s.task) taskResults.push(s.task);
    if (s.errors.length) {
      sendOk = false;
      errors.push(...s.errors);
    }
  }
  for (const r of retries) {
    const s = await sendStage(client, r.receipt, r.customer, sendCtx);
    Object.assign(out.skipped.find((x: Item) => x.bankLineId === r.bankLineId), { retrySend: true, sendStatus: s.sendStatus, approvalId: s.approvalId, pdfUrl: s.pdfUrl, taskKey: s.taskKey });
    if (s.task) taskResults.push(s.task);
    if (s.errors.length) {
      sendOk = false;
      errors.push(...s.errors);
    }
  }
  // ---------- the debt check (stage 5), right after the approval; a failure never undoes the receipt ----------
  // the receipts approved now, plus already-approved ones of this call that were never checked (e.g. an empty mirror then)
  const unchecked = ids
    .map((id) => receiptOf(id))
    .filter((r): r is Item => !!r && isApproved(r) && !str(r.debtCheckResult).trim())
    .map((r) => str(r.receiptKey));
  const debtKeys = [...new Set([...approved.map((a) => a.plan.receiptKey), ...unchecked])];
  if (debtKeys.length) {
    try {
      const dc = await checkDebt(client, { receiptKeys: debtKeys, asOfDate }, { nowIso, settings });
      out.debtCheck = dc;
      for (const r of dc.results ?? []) {
        const item = out.issued.find((x: Item) => x.receiptKey === r.receiptKey) ?? out.skipped.find((x: Item) => receiptKeyOf(x.bankLineId) === r.receiptKey);
        if (item) Object.assign(item, { debtCheckResult: str(r.result), debtCheckMonths: (r.months ?? []).join(','), debtTaskKey: str(r.taskKey) });
      }
      errors.push(...(dc.errors ?? []).map((e: string) => `בדיקת חוב: ${e}`));
    } catch (e) {
      out.debtCheck = { ok: false, errors: [errText(e)] };
      errors.push(`בדיקת חוב: ${errText(e)} – הקבלה נשארת מאושרת, אפשר להריץ את בדיקת החוב שוב`);
    }
  }
  // ---------- the allocation proposal (stage 6), right after a decided debt check; never undoes the receipt ----------
  const decided = ((out.debtCheck?.results ?? []) as Item[]).filter((r) => str(r.result).trim() && !r.skippedReason && r.writeVerified !== false).map((r) => str(r.receiptKey));
  if (decided.length) {
    out.allocation = [];
    for (const receiptKey of decided) {
      try {
        const p = await proposeAllocation(client, { receiptKey, asOfDate }, { nowIso, settings });
        out.allocation.push({ receiptKey, ok: p.ok, allocationConfidence: p.allocationConfidence, proposedTotal: p.proposedTotal, surplus: p.surplus, autoApplied: p.autoApplied, matchStatus: p.matchStatus, taskKey: p.taskKey, alreadyAllocated: p.alreadyAllocated === true });
        const item = out.issued.find((x: Item) => x.receiptKey === receiptKey) ?? out.skipped.find((x: Item) => receiptKeyOf(x.bankLineId) === receiptKey);
        if (item && p.ok) Object.assign(item, { allocationConfidence: p.allocationConfidence, autoAllocated: p.autoApplied === true, matchStatus: p.matchStatus });
        errors.push(...(p.errors ?? []).map((e: string) => `פיזור: ${e}`));
      } catch (e) {
        out.allocation.push({ receiptKey, ok: false });
        errors.push(`פיזור: ${receiptKey}: ${errText(e)} – הקבלה נשארת מאושרת, אפשר להציע פיזור שוב`);
      }
    }
  }

  const doneIds = approved.map((a) => a.plan.bankLineId);
  if (doneIds.length) {
    const closed = await closeTasksByKeys(client, doneIds.flatMap((id) => [identifyTaskKey(id), ...legacyLineTaskKeys(id)]), `הלקוח אושר על ידי ${approvedBy} – הקבלה הוצאה`, nowIso);
    taskResults.push(closed);
    if (closed.errors.length) errors.push(...closed.errors);
  }
  const resolved = await closeResolvedMissingApTasks(client, nowIso);
  if (resolved.change !== 'none' || resolved.errors.length) taskResults.push(resolved);
  for (const batchId of [...new Set(approved.map((a) => str(a.plan.line.importBatchId)).filter(Boolean))]) {
    await refreshBatchCheckStatus(client, batchId).catch((e) => errors.push(`ImportBatches ${batchId}: ${errText(e)}`));
  }
  out.taskSync = { tasks: taskResults };
  out.writeVerified = allVerified && sendOk && taskResults.every((t) => t.writeVerified !== false);
  out.ok = allVerified;
  return out;
}
