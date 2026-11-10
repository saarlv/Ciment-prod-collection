import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { isValidDate } from '../shared/collections-dates.ts';
import { errText, readAll, readByIds, round2, str } from '../shared/collections-data.ts';
import { DECIDED_LINE_STATUSES } from '../shared/collections-matching.ts';
import {
  creditTotals,
  FLAG_LOW,
  FLAG_MISSING,
  NINA_AGENT,
  normLineType,
  READER_AGENT,
  toAmount,
  toDate,
  totalsCheckOf,
} from '../shared/collections-receipts.ts';

// Structured feedback on a receipts agent (no agent reply): "נקרא נכון / טעות בקריאה" on a reader line,
// "נינה צדקה / טעתה" on a checked line, and file comments (הערה). A צדק/טעה by the same person on the same
// agent + line + field replaces their earlier one; comments always add a row. BankFileReader + טעה with a
// line field and applyCorrection also corrects that BankLines field (correctedBy/At, flags cleared) and
// recomputes the batch's extracted count / total / totalsCheck.
const AGENTS = [READER_AGENT, NINA_AGENT];
const VERDICTS = ['צדק', 'טעה', 'הערה'];
const LINE_FIELDS = ['valueDate', 'amount', 'payerName', 'reference', 'lineType'];

export const invoke = async (input: any, context: any) => {
  const agentName = str(input?.agentName).trim();
  const verdict = str(input?.verdict).trim();
  const byName = str(input?.byName).trim();
  const byEmail = str(input?.byEmail).trim() || null;
  const field = str(input?.field).trim();
  const comment = str(input?.comment).trim() || null;
  const bankLineId = str(input?.bankLineId).trim();
  let importBatchId = str(input?.importBatchId).trim();
  const applyCorrection = input?.applyCorrection !== false && input?.applyCorrection !== 'false';
  const dryRun = input?.dryRun === true;
  const nowIso = new Date().toISOString();
  const out = { dryRun, feedbackId: '', replacedId: '', lineUpdated: false, batch: null as Item | null, errors: [] as string[] };
  const fail = (...errors: string[]) => ({ ...out, errors });

  if (!AGENTS.includes(agentName)) return fail(`סוכן לא מוכר: "${agentName}"`);
  if (!VERDICTS.includes(verdict)) return fail(`הכרעה לא מוכרת: "${verdict}"`);
  if (!byName) return fail('חסר שם נותן/ת המשוב (byName)');
  if (verdict === 'הערה' && !comment) return fail('הערה ריקה');

  const client = new BlocksClient(context);
  const line = bankLineId ? (await readAll(client, 'BankLines', { column: 'bankLineId', value: bankLineId }))[0] : undefined;
  if (bankLineId && !line) return fail(`שורת הבנק ${bankLineId} לא נמצאה`);
  if (!importBatchId && line) importBatchId = str(line.importBatchId);
  const [batch] = importBatchId ? await readByIds(client, 'ImportBatches', [importBatchId]) : [];
  if (importBatchId && !batch) return fail(`קובץ ${importBatchId} לא נמצא`);
  const isTest = false;

  // ---------- an optional correction of the reader's line ----------
  const valueGivenIn = str(input?.valueGiven);
  const valueCorrect = str(input?.valueCorrect).trim();
  let lineFields: Item | null = null;
  if (agentName === READER_AGENT && verdict === 'טעה' && applyCorrection && line && LINE_FIELDS.includes(field) && valueCorrect) {
    if (DECIDED_LINE_STATUSES.includes(str(line.status))) return fail('השורה כבר אושרה – אי אפשר לתקן את הקריאה שלה');
    let value: unknown = valueCorrect;
    if (field === 'valueDate') {
      value = toDate(valueCorrect);
      if (!value || !isValidDate(value)) return fail(`תאריך ערך לא תקין: "${valueCorrect}"`);
    } else if (field === 'amount') {
      value = toAmount(valueCorrect);
      if (value === null || value === 0) return fail(`סכום לא תקין: "${valueCorrect}"`);
    } else if (field === 'lineType') {
      value = normLineType(valueCorrect);
    }
    const next = { ...line, [field]: value };
    const complete = !!str(next.valueDate) && Number(next.amount) !== 0 && (!!str(next.payerName).trim() || !!str(next.reference).trim());
    const flags = str(line.extractionFlags)
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f && f !== FLAG_LOW && !(f === FLAG_MISSING && complete));
    lineFields = { [field]: value, correctedBy: byName, correctedAt: nowIso, extractionFlags: flags.length ? flags.join(', ') : null };
  }

  const row: Item = {
    agentName,
    importBatchId: importBatchId || null,
    bankLineId: bankLineId || null,
    verdict,
    field: field || null,
    valueGiven: valueGivenIn || (line && LINE_FIELDS.includes(field) ? str(line[field]) : '') || null,
    valueCorrect: valueCorrect || null,
    comment,
    byName,
    byEmail,
    at: nowIso,
    isTestFixture: isTest,
  };

  // the same person's earlier צדק/טעה on the same agent + line + field is replaced
  let previous: Item | undefined;
  if (verdict !== 'הערה') {
    const mine = await readAll(client, 'AgentFeedback', { and: [{ column: 'agentName', value: agentName }, { column: 'byName', value: byName }] });
    previous = mine
      .filter((f) => ['צדק', 'טעה'].includes(str(f.verdict)) && str(f.bankLineId) === bankLineId && str(f.importBatchId) === importBatchId && str(f.field) === field)
      .sort((a, b) => str(b.at).localeCompare(str(a.at)))[0];
  }

  if (dryRun) return { ...out, replacedId: str(previous?.id), plannedFeedback: row, plannedLineUpdate: lineFields };

  const errors: string[] = [];
  let created: Item | null = null;
  try {
    created = (await client.createItem('AgentFeedback', row)).item ?? null;
  } catch (e) {
    return fail(`AgentFeedback: ${errText(e)}`);
  }
  if (previous && created) {
    try {
      await client.deleteItem('AgentFeedback', str(previous.id));
    } catch (e) {
      errors.push(`AgentFeedback ${str(previous.id)}: ${errText(e)}`);
    }
  }

  let lineUpdated = false;
  let batchOut: Item | null = null;
  if (lineFields && line) {
    try {
      await client.updateItem('BankLines', str(line.id), lineFields);
      lineUpdated = true;
    } catch (e) {
      errors.push(`BankLines ${bankLineId}: ${errText(e)}`);
    }
    if (lineUpdated && importBatchId && batch && field === 'amount') {
      // the extracted totals count every credit the reader read (also lines not written as duplicates), so a
      // correction moves them by the difference of this one line
      const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
      const oldAmt = Number(line.amount) || 0;
      const newAmt = Number(lineFields.amount) || 0;
      let count = n(batch.extractedLineCount);
      let total = n(batch.extractedTotal);
      if (count === null || total === null) {
        const lines = await readAll(client, 'BankLines', { column: 'importBatchId', value: importBatchId });
        const t = creditTotals(lines.map((l) => ({ amount: str(l.id) === str(line.id) ? oldAmt : Number(l.amount) || 0 })));
        count = t.count;
        total = t.total;
      }
      count = count - (oldAmt > 0 ? 1 : 0) + (newAmt > 0 ? 1 : 0);
      total = round2(total - Math.max(oldAmt, 0) + Math.max(newAmt, 0));
      batchOut = { extractedLineCount: count, extractedTotal: total, totalsCheck: totalsCheckOf(count, total, n(batch.linesInFile), n(batch.totalInFile)) };
      try {
        await client.updateItem('ImportBatches', importBatchId, batchOut);
      } catch (e) {
        errors.push(`ImportBatches: ${errText(e)}`);
      }
    }
  }

  // read back
  const [fb] = created ? await readByIds(client, 'AgentFeedback', [str(created.id)]) : [];
  if (!fb || str(fb.verdict) !== verdict) errors.push('המשוב לא נקרא בחזרה');
  if (lineUpdated && line) {
    const [lb] = await readByIds(client, 'BankLines', [str(line.id)]);
    if (!lb || str(lb.correctedBy) !== byName) errors.push('התיקון בשורה לא נקרא בחזרה');
  }
  return { ...out, feedbackId: str(created?.id), replacedId: str(previous?.id), lineUpdated, batch: batchOut, errors };
};
