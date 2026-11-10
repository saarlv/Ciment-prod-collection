// IdentifyCustomers as a shared function – plan 04.11 part B, stage 4 (b/identify-receipt). Identifies the customer of
// every bank line that enters the receipts run and STOPS there: no invoice match, no debt check. Deterministic, no AI.
// Called by the IdentifyCustomers action (the screen's "זהה מחדש"), SyncPriorityBankLines (bankLinesSource שורות
// פריוריטי) and ConfirmExtractedLines (bankLinesSource קובץ) for their new lines.
//
// The cascade (identifyLine, pure) and its confidence per rung: collections-identify-confidence.ts. Certain =
// confidence ≥ AgentSettings identifyCertainAt. A line is skipped when it is not money-in (פירעון צ׳ק / אחר), a
// returned cheque (it keeps its urgent receipt-bounced task, opened by the task sync – not a receipt), or its receipt is
// already approved / issued.
//
// A real run writes, per line, in the house order (compute → write → read back → status fields last; a failure rolls
// back what the run wrote for that line):
//   identified → ReceiptCheckSteps (stage זיהוי לקוח, the rung, evidence {confidence, candidates}, actor מערכת), the
//                customer proposal in MatchProposals (status מוצעת, customerIdMethod, no invoices – an earlier
//                customer-only proposal of the line is rewritten in place, a legacy invoice proposal is marked הוחלפה),
//                BankLines.checkStage ממתינה לאישור, the ONE draft Receipts row RCPT-<bankLineId> (non-status fields,
//                matchStatus empty) and LAST receiptStatus טיוטה – ממתינה לאישור + identifyStatus ודאי / לא ודאי.
//   unknown    → the step, earlier proposals הוחלפה, BankLines.checkStage לא מזוהה, an earlier DRAFT receipt removed.
// Tasks: uncertain → identify:<bankLineId> (זיהוי לקוח – לאישור); unknown → the scan's receipt-customer:<bankLineId>
// (לא זוהה, opened by the scoped task sync); certain → none (it waits in "אשר את כל הוודאיים"); identify:<id> closes
// when the line is certain / unknown / approved. customerAutoApproveAt (a number; empty = off): a line at or above it is
// issued at once through issueReceipts (mode auto). dryRun (default true) writes nothing. Nothing is sent and nothing is
// written to Priority.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { naturalCompare } from './collections-aging.ts';
import { addDays, diffDays, formatDateHe, israelLocalToUtcIso, resolveAsOf, toIsraelDate } from './collections-dates.ts';
import { buildOwnerMap, errText, formatIls, isFixtureCustomer, mapLimit, num, ownerOf, readAll, readByIds, readSettings, readWhereIn, round2, splitList, str } from './collections-data.ts';
import { BOUNCED, MP_PROPOSED, MP_REPLACED, normName } from './collections-matching.ts';
import {
  ACTOR_SYSTEM,
  BANK_LINE_KINDS,
  containsToken,
  CS_APPROVED,
  CS_AWAITING,
  CS_UNIDENTIFIED,
  isMoneyInLine,
  isNonReceiptLine,
  isVerifiedBankBatch,
  normForNames,
  payerTokens,
  refreshBatchCheckStatus,
  RES_AMBIGUOUS,
  RES_FOUND,
  RES_NOT_FOUND,
  ST_IDENTIFY,
  textHasAmount,
} from './collections-receipts.ts';
import { receiptKeyOf, RS_APPROVED, RS_DRAFT, RS_ISSUED } from './collections-receipt-record.ts';
import {
  IDENTIFY_CONFIDENCE,
  IDENTIFY_MAIL_DAYS,
  IDENTIFY_MAX_CANDIDATES,
  IDENTIFY_METHOD_LABEL,
  IDENTIFY_PROPOSAL_METHOD,
  IDENTIFY_RUNGS,
  IDENTIFY_STEP_RUNG,
  type IdentifyMethod,
  type IdentifyRung,
} from './collections-identify-confidence.ts';
import {
  AUTO_APPROVE_ACTOR,
  closeResolvedMissingApTasks,
  closeTasksByKeys,
  IDENTIFY_ACTOR,
  identifyTaskKey,
  IS_AUTO,
  IS_CERTAIN,
  IS_UNCERTAIN,
  IS_UNKNOWN,
  nextNoonIso,
  RSRC_BANK,
  stageTaskRow,
  TT_IDENTIFY,
  WriteJournal,
} from './collections-receipt-flow.ts';
import { certainAtOf, issueReceipts } from './collections-issue-receipt.ts';
import { computeSeverity, severityConfigFrom } from './collections-severity.ts';
import { syncTasksAfterWrite } from './collections-task-sync.ts';
import { openKeyedTask } from './collections-task-upsert.ts';
import { A_RECEIPT, taskKeyOf } from './collections-tasks.ts';
import { numberSettingOrNull, settingValue } from './plan-settings.ts';

const collapse = (v: unknown) => str(v).replace(/\s+/g, ' ').trim();
const ils = (n: number) => `${formatIls(n)} ש״ח`;
const digitRuns = (s: unknown) => str(s).match(/\d+/g) ?? [];

// ---------- data ----------
export interface IdentifyData {
  asOfDate: string;
  customers: Item[];
  customersByCode: Map<string, Item>;
  contacts: Item[];
  aliases: Item[];
  /** InboundEmails of the last IDENTIFY_MAIL_DAYS days (up to the end of asOfDate) */
  mails: Item[];
  ownerMap: Map<string, string>;
}

export function identifyData(x: { asOfDate: string; customers: Item[]; contacts?: Item[]; aliases?: Item[]; mails?: Item[]; owners?: Item[] }): IdentifyData {
  return {
    asOfDate: x.asOfDate,
    customers: x.customers,
    customersByCode: new Map(x.customers.map((c) => [str(c.customerCode).trim(), c])),
    contacts: x.contacts ?? [],
    aliases: x.aliases ?? [],
    mails: x.mails ?? [],
    ownerMap: buildOwnerMap(x.owners ?? []),
  };
}

export async function loadIdentifyData(client: BlocksClient, asOfDate: string): Promise<IdentifyData> {
  const sinceIso = israelLocalToUtcIso(addDays(asOfDate, -IDENTIFY_MAIL_DAYS), 0, 0);
  const untilIso = israelLocalToUtcIso(addDays(asOfDate, 1), 0, 0);
  const [customers, contacts, aliases, mails, owners] = await Promise.all([
    readAll(client, 'Customers'),
    readAll(client, 'CustomerContacts'),
    readAll(client, 'BankAliases', { column: 'status', value: 'מאושר' }),
    readAll(client, 'InboundEmails', { and: [{ column: 'receivedAt', operator: '>=', value: sinceIso }, { column: 'receivedAt', operator: '<', value: untilIso }] }),
    readAll(client, 'CustomerOwners'),
  ]);
  return identifyData({ asOfDate, customers, contacts, aliases, mails, owners });
}

// ---------- the cascade (pure) ----------
export interface IdentifyCandidate {
  customerCode: string;
  customerName: string;
  confidence: number;
  method: string;
}

export interface IdentifyResult {
  method: IdentifyMethod;
  /** the rung that decided (null = nothing found) */
  rung: IdentifyRung | null;
  confidence: number;
  customerCode: string;
  customerName: string;
  candidates: IdentifyCandidate[];
  /** one Hebrew line: why */
  evidence: string;
  /** every rung's matches (customerCode → how), for the step's evidence */
  hits: Partial<Record<IdentifyRung, { customerCode: string; how: string }[]>>;
}

const nameOf = (d: IdentifyData, code: string) => str(d.customersByCode.get(code)?.customerName) || code;

/** A customer the line may meet: test lines → test customers only, real lines → real customers only. */
const inScope = (d: IdentifyData, code: string) => !!code && d.customersByCode.has(code);

const mailText = (m: Item) => `${str(m.subject)}\n${str(m.bodyText)}`;
const isIrrelevantMail = (m: Item) => str(m.category) === 'לא רלוונטי' || str(m.status) === 'לא רלוונטית';

/** Every rung's matches for one line (customerCode → how). */
export function rungHits(d: IdentifyData, line: Item): Record<IdentifyRung, Map<string, string>> {
  const payer = collapse(line.payerName);
  const key = normName(payer);
  const amount = round2(Math.abs(num(line.amount)));
  const hits: Record<IdentifyRung, Map<string, string>> = {
    companyId: new Map(),
    alias: new Map(),
    exactName: new Map(),
    contact: new Map(),
    recentMail: new Map(),
    partialName: new Map(),
  };
  const refRuns = new Set([...digitRuns(line.reference), ...digitRuns(line.payerName)]);
  const pTokens = payerTokens(payer);
  const pSet = new Set(pTokens);
  for (const c of d.customers) {
    const code = str(c.customerCode).trim();
    if (!inScope(d, code)) continue;
    const cid = digitRuns(c.companyId).join('');
    if (cid.length >= 8 && refRuns.has(cid)) hits.companyId.set(code, `ח״פ ${str(c.companyId)} מופיע באסמכתא`);
    if (key && normName(c.customerName) === key) hits.exactName.set(code, `שם הלקוח זהה לשם המעביר "${payer}"`);
    const cTokens = payerTokens(c.customerName);
    if (pTokens.length && cTokens.length && normName(c.customerName) !== key) {
      const cSet = new Set(cTokens);
      if (pTokens.every((t) => cSet.has(t)) || cTokens.every((t) => pSet.has(t))) hits.partialName.set(code, `שם חלקי: "${payer}" ו"${str(c.customerName)}"`);
    }
  }
  if (key) {
    for (const a of d.aliases) {
      const code = str(a.customerCode).trim();
      if (str(a.status) === 'מאושר' && normName(a.bankName) === key && inScope(d, code)) hits.alias.set(code, `כינוי מאושר "${str(a.bankName)}"`);
    }
    for (const ct of d.contacts) {
      const code = str(ct.customerCode).trim();
      if (inScope(d, code) && normName(ct.contactName) === key && !hits.contact.has(code)) hits.contact.set(code, `"${payer}" הוא איש הקשר ${str(ct.contactName)}`);
    }
  }
  if (pTokens.length && amount >= 1) {
    for (const m of d.mails) {
      const code = str(m.customerCode).trim();
      if (!code || isIrrelevantMail(m) || !inScope(d, code) || hits.recentMail.has(code)) continue;
      const text = mailText(m);
      if (!textHasAmount(text, amount)) continue;
      const nText = normForNames(text);
      const token = pTokens.find((t) => containsToken(nText, t));
      if (!token) continue;
      const when = toIsraelDate(m.receivedAt);
      hits.recentMail.set(code, `מייל מ-${str(m.fromName) || str(m.fromAddress)}${when ? ` (${formatDateHe(when)})` : ''} המקושר ללקוח, עם הסכום ${formatIls(amount)} והשם "${token}"`);
    }
  }
  return hits;
}

/** The customer of one line: the first rung (highest confidence) that finds a customer in scope decides. Pure. */
export function identifyLine(d: IdentifyData, line: Item): IdentifyResult {
  const hits = rungHits(d, line);
  const hitsOut: IdentifyResult['hits'] = {};
  for (const r of IDENTIFY_RUNGS) if (hits[r].size) hitsOut[r] = [...hits[r].entries()].map(([customerCode, how]) => ({ customerCode, how }));
  const payer = collapse(line.payerName);
  for (const rung of IDENTIFY_RUNGS) {
    const found = hits[rung];
    if (!found.size) continue;
    if (found.size === 1) {
      const [[code, how]] = [...found.entries()];
      const confidence = IDENTIFY_CONFIDENCE[rung];
      return {
        method: rung,
        rung,
        confidence,
        customerCode: code,
        customerName: nameOf(d, code),
        candidates: [{ customerCode: code, customerName: nameOf(d, code), confidence, method: IDENTIFY_METHOD_LABEL[rung] }],
        evidence: `${how} → ${code} ${nameOf(d, code)} (${IDENTIFY_METHOD_LABEL[rung]}, ביטחון ${confidence})`,
        hits: hitsOut,
      };
    }
    // several customers at the best rung: the one the other rungs also point to ranks first, then by code
    const support = (code: string) => IDENTIFY_RUNGS.filter((r) => hits[r].has(code)).length;
    const codes = [...found.keys()].sort((a, b) => support(b) - support(a) || naturalCompare(a, b)).slice(0, IDENTIFY_MAX_CANDIDATES);
    const confidence = IDENTIFY_CONFIDENCE.ambiguous;
    const top = codes[0];
    return {
      method: 'ambiguous',
      rung,
      confidence,
      customerCode: top,
      customerName: nameOf(d, top),
      candidates: codes.map((c) => ({ customerCode: c, customerName: nameOf(d, c), confidence, method: IDENTIFY_METHOD_LABEL[rung] })),
      evidence: `${found.size} לקוחות מתאימים ל"${payer}" (${IDENTIFY_METHOD_LABEL[rung]}): ${codes.map((c) => `${c} ${nameOf(d, c)}`).join('; ')} – מוצע ${top}, לבחור את הנכון`,
      hits: hitsOut,
    };
  }
  return {
    method: 'none',
    rung: null,
    confidence: IDENTIFY_CONFIDENCE.none,
    customerCode: '',
    customerName: '',
    candidates: [],
    evidence: payer ? `אין לקוח, ח״פ, כינוי, איש קשר או מייל אחרון שמתאימים ל"${payer}"` : 'אין שם מעביר בשורת הבנק',
    hits: hitsOut,
  };
}

/** ודאי / לא ודאי / לא זוהה of a result at the certain threshold. */
export const identifyStatusOf = (r: IdentifyResult, certainAt: number) => (r.method === 'none' ? IS_UNKNOWN : r.confidence >= certainAt ? IS_CERTAIN : IS_UNCERTAIN);

/** MatchProposals.confidence (ודאי / גבוה / נמוך) of an identification. */
const proposalConfidence = (status: string, confidence: number) => (status === IS_CERTAIN ? 'ודאי' : confidence >= IDENTIFY_CONFIDENCE.partialName ? 'גבוה' : 'נמוך');

// ---------- the run ----------
export interface IdentifyDeps {
  nowIso?: string;
}

interface LineRun {
  line: Item;
  bankLineId: string;
  receiptKey: string;
  receipt: Item | null;
  proposals: Item[];
  result: IdentifyResult | null;
  status: string;
  out: Item;
  written: boolean;
  isTest: boolean;
}

const isApprovedReceipt = (r: Item | null) => [RS_APPROVED, RS_ISSUED].includes(str(r?.receiptStatus).trim());

/** Which lines the run looks at: bankLineIds, else the batch's lines, else today's pulls / verified files. */
async function selectLines(client: BlocksClient, input: Item, asOfDate: string): Promise<{ lines: Item[]; scope: string }> {
  const ids = [...new Set((Array.isArray(input?.bankLineIds) ? input.bankLineIds : []).map((x: unknown) => str(x).trim()).filter(Boolean))] as string[];
  if (ids.length) return { lines: await readWhereIn(client, 'BankLines', 'bankLineId', ids), scope: 'bankLineIds' };
  const batchId = str(input?.importBatchId).trim();
  if (batchId) return { lines: await readAll(client, 'BankLines', { column: 'importBatchId', value: batchId }), scope: `importBatchId ${batchId}` };
  const batches = (await readAll(client, 'ImportBatches', { column: 'kind', operator: 'in', value: BANK_LINE_KINDS })).filter(
    (b) => isVerifiedBankBatch(b) && (str(b.workDay).slice(0, 10) === asOfDate || toIsraelDate(b.uploadedAt) === asOfDate || toIsraelDate(b.verifiedAt) === asOfDate),
  );
  if (!batches.length) return { lines: [], scope: `today ${asOfDate}` };
  return { lines: await readWhereIn(client, 'BankLines', 'importBatchId', batches.map((b) => str(b.id))), scope: `today ${asOfDate}` };
}

export async function identifyCustomers(client: BlocksClient, input: Item, deps: IdentifyDeps = {}): Promise<Item> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const dryRun = input?.dryRun !== false && input?.dryRun !== 'false';
  const checkedBy = collapse(input?.checkedBy);
  const errors: string[] = [];
  const counts = { lines: 0, certain: 0, uncertain: 0, unidentified: 0, skipped: 0, autoApproved: 0 };
  const out: Item = { ok: false, dryRun, certainAt: 0, counts, lines: [] as Item[], writeVerified: false, taskSync: null, errors };
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    errors.push(errText(e));
    return out;
  }
  const settings = await readSettings(client);
  const certainAt = certainAtOf(settings);
  const autoApproveAt = numberSettingOrNull(settings, 'customerAutoApproveAt');
  out.certainAt = certainAt;
  if (autoApproveAt !== null) out.autoApproveAt = autoApproveAt;
  if (settingValue(settings, 'identifyCertainAt') !== '' && numberSettingOrNull(settings, 'identifyCertainAt') === null) {
    errors.push(`identifyCertainAt "${settingValue(settings, 'identifyCertainAt')}" אינו מספר – נעשה שימוש בברירת המחדל ${certainAt}`);
  }

  // ---------- read ----------
  let lines: Item[];
  try {
    lines = (await selectLines(client, input, asOfDate)).lines;
  } catch (e) {
    errors.push(`BankLines: ${errText(e)}`);
    return out;
  }
  // one row per bankLineId (the earliest)
  const byId = new Map<string, Item>();
  for (const l of [...lines].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))) if (str(l.bankLineId).trim() && !byId.has(str(l.bankLineId).trim())) byId.set(str(l.bankLineId).trim(), l);
  lines = [...byId.values()].sort((a, b) => (Number(a.lineNo) || 0) - (Number(b.lineNo) || 0) || naturalCompare(str(a.bankLineId), str(b.bankLineId)));
  counts.lines = lines.length;
  if (!lines.length) {
    out.ok = true;
    out.writeVerified = !dryRun;
    return out;
  }
  const ids = lines.map((l) => str(l.bankLineId).trim());
  const [receipts, proposals, data] = await Promise.all([
    readWhereIn(client, 'Receipts', 'receiptKey', ids.map(receiptKeyOf)),
    readWhereIn(client, 'MatchProposals', 'bankLineId', ids),
    loadIdentifyData(client, asOfDate),
  ]);

  // ---------- compute ----------
  const runs: LineRun[] = [];
  const bounced: string[] = [];
  for (const line of lines) {
    const bankLineId = str(line.bankLineId).trim();
    const receiptKey = receiptKeyOf(bankLineId);
    const receipt = [...receipts].filter((r) => str(r.receiptKey) === receiptKey).sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))[0] ?? null;
    const base: Item = {
      bankLineId,
      payerName: collapse(line.payerName),
      amount: round2(num(line.amount)),
      valueDate: toIsraelDate(line.valueDate) ?? '',
      customerCode: '',
      customerName: '',
      confidence: 0,
      identifyStatus: '',
      method: '',
      evidence: '',
      candidates: [],
      receiptKey: '',
      skippedReason: '',
      taskKey: '',
    };
    const skipWith = (reason: string, extra: Item = {}) => {
      counts.skipped++;
      out.lines.push({ ...base, ...extra, skippedReason: reason });
    };
    if (str(line.lineType).trim() === BOUNCED) {
      bounced.push(bankLineId);
      skipWith('צ׳ק חוזר – לא קבלה (משימה דחופה צ׳ק חוזר)');
      continue;
    }
    if (isNonReceiptLine(line) || !isMoneyInLine(line)) {
      skipWith(`שורה מסוג "${str(line.lineType) || 'לא ידוע'}" אינה נכנסת לזיהוי`);
      continue;
    }
    if (isApprovedReceipt(receipt) || str(line.checkStage).trim() === CS_APPROVED) {
      skipWith(`הקבלה כבר ${str(receipt?.receiptStatus) === RS_ISSUED ? 'הונפקה ב-Priority' : 'אושרה'} – לא נבדקה מחדש`, {
        receiptKey: str(receipt?.receiptKey),
        customerCode: str(receipt?.customerCode ?? line.customerCode),
        customerName: str(receipt?.customerName ?? line.customerName),
      });
      continue;
    }
    const result = identifyLine(data, line);
    const status = identifyStatusOf(result, certainAt);
    const o: Item = {
      ...base,
      customerCode: result.customerCode,
      customerName: result.customerName,
      confidence: result.confidence,
      identifyStatus: status,
      method: result.method === 'none' ? '' : IDENTIFY_METHOD_LABEL[result.method],
      evidence: result.evidence,
      candidates: result.candidates,
      receiptKey: status === IS_UNKNOWN ? '' : receiptKey,
      taskKey: status === IS_UNCERTAIN ? identifyTaskKey(bankLineId) : status === IS_UNKNOWN ? taskKeyOf('receipt-customer', bankLineId) : '',
    };
    out.lines.push(o);
    runs.push({ line, bankLineId, receiptKey, receipt, proposals: proposals.filter((p) => str(p.bankLineId).trim() === bankLineId), result, status, out: o, written: false, isTest: false });
  }
  const wantsAuto = (r: LineRun) => autoApproveAt !== null && r.status !== IS_UNKNOWN && r.result!.confidence >= autoApproveAt;
  for (const r of runs) {
    if (r.status === IS_CERTAIN) counts.certain++;
    else if (r.status === IS_UNCERTAIN) counts.uncertain++;
    else counts.unidentified++;
  }

  if (dryRun) {
    for (const r of runs.filter(wantsAuto)) {
      r.out.identifyStatus = IS_AUTO;
      r.out.taskKey = '';
      counts.autoApproved++;
    }
    out.ok = true;
    return out;
  }

  // ---------- write: line by line ----------
  const stepActor = checkedBy || IDENTIFY_ACTOR;
  const startMs = Date.parse(nowIso) || Date.now();
  let allVerified = true;
  await mapLimit(runs, 4, async (r) => {
    const j = new WriteJournal();
    try {
      const ok = await writeLine(client, r, j, { nowIso, certainAt, stepActor, checkRunId: `identify-${r.bankLineId}-${startMs}`, data });
      if (!ok.verified) {
        allVerified = false;
        const rb = await j.rollback(client);
        errors.push(`${r.bankLineId}: ${ok.why} – מה שנכתב לשורה בוטל`, ...rb);
        return;
      }
      r.written = true;
    } catch (e) {
      allVerified = false;
      const rb = await j.rollback(client);
      errors.push(`${r.bankLineId}: ${errText(e)} – מה שנכתב לשורה בוטל`, ...rb);
    }
  });
  const written = runs.filter((r) => r.written);
  for (const r of runs.filter((x) => !x.written)) Object.assign(r.out, { receiptKey: '', taskKey: '' });

  // ---------- automatic approval (customerAutoApproveAt) ----------
  let autoResult: Item | null = null;
  const autoIds = written.filter(wantsAuto).map((r) => r.bankLineId);
  if (autoIds.length) {
    try {
      autoResult = await issueReceipts(client, { mode: 'auto', bankLineIds: autoIds, asOfDate }, { nowIso, settings });
      for (const it of autoResult.issued ?? []) {
        const r = runs.find((x) => x.bankLineId === it.bankLineId);
        if (!r) continue;
        Object.assign(r.out, { identifyStatus: IS_AUTO, taskKey: str(it.taskKey) });
        r.status = IS_AUTO;
        counts.autoApproved++;
      }
      for (const s of autoResult.skipped ?? []) errors.push(`${s.bankLineId}: אישור אוטומטי לא בוצע – ${s.reason}`);
      errors.push(...(autoResult.errors ?? []).map((e: string) => `אישור אוטומטי: ${e}`));
    } catch (e) {
      errors.push(`אישור אוטומטי נכשל – השורות ממתינות לאישור: ${errText(e)}`);
    }
  }

  // ---------- tasks ----------
  const cfg = severityConfigFrom(settings);
  const identifyTasks: Item[] = [];
  for (const r of written.filter((x) => x.status === IS_UNCERTAIN)) {
    const res = r.result!;
    const amount = round2(Math.abs(num(r.line.amount)));
    const vd = toIsraelDate(r.line.valueDate);
    const days = vd ? Math.max(0, diffDays(asOfDate, vd)) : 0;
    const payer = collapse(r.line.payerName) || 'מעביר לא ידוע';
    const ref = collapse(r.line.reference);
    const others = res.candidates.filter((c) => c.customerCode !== res.customerCode);
    const row = stageTaskRow(identifyTaskKey(r.bankLineId), {
      taskType: TT_IDENTIFY,
      title: `זיהוי לקוח – לאישור – ${payer}: ${ils(amount)} → ${res.customerName} (${res.confidence})`,
      reasons: `${str(r.line.lineType).trim() || 'העברה'} של ${ils(amount)}${vd ? ` מ-${formatDateHe(vd)}` : ''}${ref ? `, אסמכתא ${ref}` : ''}, המעביר '${payer}': ${res.evidence}. רמת הביטחון ${res.confidence} מתחת לסף הוודאות ${certainAt}${others.length ? `; מועמדים נוספים: ${others.map((c) => `${c.customerCode} ${c.customerName}`).join(', ')}` : ''}. לאשר את הלקוח או לבחור אחר – האישור מוציא את הקבלה`,
      recommendedAction: A_RECEIPT,
      severity: computeSeverity({ amount, daysOverdue: days }, cfg),
      customerCode: res.customerCode || null,
      customerName: res.customerName || null,
      owner: res.customerCode ? ownerOf(res.customerCode, data.customersByCode.get(res.customerCode), data.ownerMap) || null : null,
      amount,
      invoiceNumbers: [],
      relatedTable: 'BankLines',
      relatedId: r.bankLineId,
      dueAt: nextNoonIso(asOfDate),
      asOfDate,
      nowIso,
      isTestFixture: r.isTest || isFixtureCustomer(data.customersByCode.get(res.customerCode), res.customerCode),
    });
    const t = await openKeyedTask(client, { row, nowIso, asOfDate, dryRun: false });
    identifyTasks.push(t);
    if (t.errors.length) errors.push(...t.errors);
    if (t.change === 'keptClosed') r.out.taskKey = '';
  }
  const closeIds = written.filter((x) => x.status === IS_CERTAIN || x.status === IS_UNKNOWN).map((x) => x.bankLineId);
  const closed = await closeTasksByKeys(client, closeIds.map(identifyTaskKey), 'הזיהוי השתנה – השורה ודאית או שהלקוח לא זוהה', nowIso);
  if (closed.errors.length) errors.push(...closed.errors);
  // receipt-customer:<id> (unknown) opens / closes, the legacy receipt tasks of re-identified lines close, a returned
  // cheque keeps its urgent task – all by the scan's own rules, scoped to these lines
  const sync = await syncTasksAfterWrite(client, { bankLineIds: [...written.map((r) => r.bankLineId), ...bounced] }, { asOfDate, nowIso, label: 'IdentifyCustomers' });
  if (sync.errors.length) errors.push(...sync.errors);
  const missingAp = await closeResolvedMissingApTasks(client, nowIso);
  if (missingAp.errors.length) errors.push(...missingAp.errors);
  for (const batchId of [...new Set(written.map((r) => str(r.line.importBatchId)).filter(Boolean))]) {
    await refreshBatchCheckStatus(client, batchId, { resume: true }).catch((e) => errors.push(`ImportBatches ${batchId}: ${errText(e)}`));
  }
  out.taskSync = { identifyTasks, closed, sync, missingAp, autoApprove: autoResult ? { issued: autoResult.issued, skipped: autoResult.skipped, taskSync: autoResult.taskSync } : null };
  out.writeVerified = allVerified && errors.length === 0;
  out.ok = allVerified;
  return out;
}

interface WriteCtx {
  nowIso: string;
  certainAt: number;
  stepActor: string;
  checkRunId: string;
  data: IdentifyData;
}

/** One line's writes, in order, each recorded in the journal; returns whether everything read back. */
async function writeLine(client: BlocksClient, r: LineRun, j: WriteJournal, ctx: WriteCtx): Promise<{ verified: boolean; why: string }> {
  const res = r.result!;
  const line = r.line;
  const unknown = r.status === IS_UNKNOWN;
  const amount = round2(Math.abs(num(line.amount)));
  const importBatchId = str(line.importBatchId) || null;
  const owner = res.customerCode ? ownerOf(res.customerCode, ctx.data.customersByCode.get(res.customerCode), ctx.data.ownerMap) : '';

  // 1. the identification step
  const step = await j.create(client, 'ReceiptCheckSteps', {
    importBatchId,
    bankLineId: r.bankLineId,
    checkRunId: ctx.checkRunId,
    stepNo: 1,
    stage: ST_IDENTIFY,
    rung: res.rung ? IDENTIFY_STEP_RUNG[res.rung] : IDENTIFY_STEP_RUNG.exactName,
    result: unknown ? RES_NOT_FOUND : res.method === 'ambiguous' ? RES_AMBIGUOUS : RES_FOUND,
    detail: res.evidence,
    evidence: {
      confidence: res.confidence,
      method: res.method === 'none' ? IDENTIFY_METHOD_LABEL.none : IDENTIFY_METHOD_LABEL[res.method],
      rung: res.rung,
      identifyStatus: r.status,
      certainAt: ctx.certainAt,
      customerCode: res.customerCode || null,
      candidates: res.candidates,
      hits: res.hits,
    },
    actor: ACTOR_SYSTEM,
    actorName: ctx.stepActor,
    at: ctx.nowIso,
    isTestFixture: r.isTest,
  });

  // 2. the customer proposal (one מוצעת row per line)
  const pending = r.proposals.filter((p) => str(p.status) === MP_PROPOSED).sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
  const ours = pending.filter((p) => !splitList(p.invoiceNumbers).length);
  const keep = unknown ? null : (ours[0] ?? null);
  for (const p of pending) if (p !== keep) await j.update(client, 'MatchProposals', p, { status: MP_REPLACED });
  let proposalId = '';
  if (!unknown) {
    const fields: Item = {
      bankLineId: r.bankLineId,
      valueDate: toIsraelDate(line.valueDate),
      amount,
      payerName: collapse(line.payerName) || null,
      customerCode: res.customerCode,
      customerName: res.customerName,
      customerIdMethod: IDENTIFY_PROPOSAL_METHOD[res.rung!],
      invoiceNumbers: null,
      allocations: null,
      confidence: proposalConfidence(r.status, res.confidence),
      reasoning: res.evidence,
      assignedBookkeeperName: owner || null,
      status: MP_PROPOSED,
      proposedAt: ctx.nowIso,
      decidedBy: null,
      decidedAt: null,
      isTestFixture: r.isTest,
      checkRunId: ctx.checkRunId,
      importBatchId,
      receiptKey: r.receiptKey,
    };
    if (keep) {
      await j.update(client, 'MatchProposals', keep, fields);
      proposalId = str(keep.id);
    } else proposalId = str((await j.create(client, 'MatchProposals', fields)).id);
  }

  // 3. the bank line
  const lineFields: Item = { checkStage: unknown ? CS_UNIDENTIFIED : CS_AWAITING, receiptKey: unknown ? null : r.receiptKey, lastCheckRunId: ctx.checkRunId, lastCheckedAt: ctx.nowIso };
  await j.update(client, 'BankLines', line, lineFields);

  // 4. the receipt: unknown → an earlier draft goes; identified → the draft's non-status fields
  let receiptId = '';
  if (unknown) {
    if (r.receipt && [RS_DRAFT, ''].includes(str(r.receipt.receiptStatus).trim())) await j.remove(client, 'Receipts', r.receipt);
  } else {
    const fields: Item = {
      receiptKey: r.receiptKey,
      bankLineId: r.bankLineId,
      importBatchId,
      matchProposalId: proposalId || null,
      customerCode: res.customerCode,
      customerName: res.customerName,
      payerName: collapse(line.payerName) || null,
      reference: collapse(line.reference) || null,
      valueDate: toIsraelDate(line.valueDate),
      amount,
      allocatedAmount: 0,
      unallocatedAmount: amount,
      matchStatus: null,
      identifyConfidence: res.confidence,
      receiptSource: RSRC_BANK,
      isTestFixture: r.isTest,
    };
    if (r.receipt) {
      await j.update(client, 'Receipts', r.receipt, fields);
      receiptId = str(r.receipt.id);
    } else {
      receiptId = str(
        (
          await j.create(client, 'Receipts', {
            ...fields,
            priorityReceiptNumber: null,
            preparedBy: null,
            preparedAt: null,
            issuedBy: null,
            issuedAt: null,
            sendStatus: null,
            sentToEmail: null,
            sentAt: null,
          })
        ).id,
      );
    }
  }

  // 5. read back
  const [[sBack], [lBack], pBack, rBack] = await Promise.all([
    readByIds(client, 'ReceiptCheckSteps', [str(step.id)]),
    readByIds(client, 'BankLines', [str(line.id)]),
    proposalId ? readByIds(client, 'MatchProposals', [proposalId]) : Promise.resolve([] as Item[]),
    receiptId ? readByIds(client, 'Receipts', [receiptId]) : Promise.resolve([] as Item[]),
  ]);
  if (!sBack || str(sBack.bankLineId) !== r.bankLineId) return { verified: false, why: 'שלב הזיהוי לא נקרא בחזרה' };
  if (!lBack || str(lBack.checkStage) !== lineFields.checkStage) return { verified: false, why: 'שורת הבנק לא נקראה בחזרה כפי שנכתבה' };
  if (!unknown) {
    if (!pBack[0] || str(pBack[0].status) !== MP_PROPOSED || str(pBack[0].customerCode) !== res.customerCode) return { verified: false, why: 'הצעת הלקוח לא נקראה בחזרה' };
    const rb = rBack[0];
    if (!rb || str(rb.receiptKey) !== r.receiptKey || str(rb.customerCode) !== res.customerCode || Math.abs(num(rb.amount) - amount) > 0.005 || num(rb.identifyConfidence) !== res.confidence) {
      return { verified: false, why: `הקבלה ${r.receiptKey} לא נקראה בחזרה כפי שנכתבה` };
    }
    // 6. status fields LAST
    const statusFields = { receiptStatus: RS_DRAFT, identifyStatus: r.status };
    await j.update(client, 'Receipts', rb, statusFields);
    const [r2] = await readByIds(client, 'Receipts', [receiptId]);
    if (!r2 || str(r2.receiptStatus) !== RS_DRAFT || str(r2.identifyStatus) !== r.status) return { verified: false, why: `סטטוס הקבלה ${r.receiptKey} לא נשמר` };
  } else if (r.receipt && [RS_DRAFT, ''].includes(str(r.receipt.receiptStatus).trim())) {
    const left = await readWhereIn(client, 'Receipts', 'receiptKey', [r.receiptKey]);
    if (left.some((x) => str(x.id) === str(r.receipt!.id))) return { verified: false, why: 'טיוטת הקבלה הקודמת לא הוסרה' };
  }
  return { verified: true, why: '' };
}

export { AUTO_APPROVE_ACTOR };
