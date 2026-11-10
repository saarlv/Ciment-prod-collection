import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf, toIsraelDate } from '../shared/collections-dates.ts';
import { createInChunks, deleteByIds, errText, mapLimit, readWhereIn, str } from '../shared/collections-data.ts';
import {
  BY_AGENT,
  BY_FALLBACK,
  type CustomerFact,
  fallbackSummary,
  normaliseFact,
  parseAgentSummaries,
  validateAgentSummaries,
} from '../shared/collections-customer-summary.ts';

/** facts as passed by the workflow: an array, or a JSON string of one. */
function factsFrom(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Last step of CustomerSummaryRun. Checks Iris's structured answer against the facts from PrepareCustomerSummaries
// and upserts one CustomerDailySummaries row per customer and summaryDate (a rerun the same day replaces the row;
// extra rows of that day are removed). Customers without a valid entry get the code summary (writtenBy קוד (גיבוי))
// with the action the same rules pick. Every written row is read back and compared. Never contacts anyone.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const errors: string[] = [];
  let summaryDate: string;
  try {
    summaryDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    return { summaryDate: str(input?.asOfDate), written: 0, byAgent: 0, byFallback: 0, rejected: [], writeVerified: false, errors: [errText(e)] };
  }

  const facts: CustomerFact[] = [];
  for (const raw of factsFrom(input?.facts)) {
    const f = normaliseFact(raw);
    if (f && !facts.some((x) => x.customerCode === f.customerCode)) facts.push(f);
  }
  if (!facts.length) return { summaryDate, written: 0, byAgent: 0, byFallback: 0, rejected: [], writeVerified: true, errors };

  const codes = new Set(facts.map((f) => f.customerCode));
  const parsed = parseAgentSummaries(input?.agentResult);
  const { kept, rejected } = validateAgentSummaries(parsed, codes);
  if (input?.agentResult !== undefined && input?.agentResult !== null && parsed === null) {
    rejected.push('תשובת הסוכנת לא נקראה (אין בה רשימת summaries)');
  }

  const writtenAt = new Date().toISOString();
  const planned: Item[] = facts.map((f) => {
    const agent = kept.get(f.customerCode);
    const text = agent ?? fallbackSummary(f);
    return {
      customerCode: f.customerCode,
      customerName: f.customerName,
      summaryDate,
      summary: text.summary,
      suggestedAction: text.suggestedAction,
      actionType: text.actionType,
      basis: f.basis,
      writtenBy: agent ? BY_AGENT : BY_FALLBACK,
      writtenAt,
      isTestFixture: f.isTestFixture,
    };
  });

  // upsert by (customerCode, summaryDate)
  const ofDay = (rows: Item[]) => rows.filter((r) => toIsraelDate(r.summaryDate) === summaryDate);
  const existing = ofDay(await readWhereIn(client, 'CustomerDailySummaries', 'customerCode', [...codes]));
  const existingByCode = new Map<string, Item[]>();
  for (const r of existing) {
    const c = str(r.customerCode);
    if (!existingByCode.has(c)) existingByCode.set(c, []);
    existingByCode.get(c)!.push(r);
  }
  const toUpdate: { id: string; row: Item }[] = [];
  const toCreate: Item[] = [];
  const duplicates: string[] = [];
  for (const row of planned) {
    const [first, ...rest] = existingByCode.get(row.customerCode) ?? [];
    if (first) toUpdate.push({ id: str(first.id), row });
    else toCreate.push(row);
    duplicates.push(...rest.map((r) => str(r.id)));
  }

  await mapLimit(toUpdate, 8, async ({ id, row }) => {
    try {
      await client.updateItem('CustomerDailySummaries', id, row);
    } catch (e) {
      errors.push(`עדכון הסיכום של ${row.customerCode} נכשל: ${errText(e)}`);
    }
  });
  if (toCreate.length) {
    try {
      await createInChunks(client, 'CustomerDailySummaries', toCreate);
    } catch (e) {
      errors.push(`שמירת סיכומים חדשים נכשלה: ${errText(e)}`);
    }
  }
  if (duplicates.length) {
    try {
      await deleteByIds(client, 'CustomerDailySummaries', duplicates);
    } catch (e) {
      errors.push(`מחיקת סיכומים כפולים נכשלה: ${errText(e)}`);
    }
  }

  // read back: exactly one row per customer for the day, with the planned text
  let writeVerified = false;
  let written = 0;
  try {
    const back = ofDay(await readWhereIn(client, 'CustomerDailySummaries', 'customerCode', [...codes]));
    const mismatched: string[] = [];
    for (const row of planned) {
      const rows = back.filter((r) => str(r.customerCode) === row.customerCode);
      const ok =
        rows.length === 1 &&
        str(rows[0].summary) === row.summary &&
        str(rows[0].actionType) === row.actionType &&
        str(rows[0].writtenBy) === row.writtenBy;
      if (ok) written += 1;
      else mismatched.push(row.customerCode);
    }
    writeVerified = mismatched.length === 0;
    if (mismatched.length) errors.push(`הסיכומים לא נשמרו כמתוכנן ללקוחות: ${mismatched.join(', ')}`);
  } catch (e) {
    errors.push(`אימות הכתיבה נכשל: ${errText(e)}`);
  }

  const byAgent = planned.filter((r) => r.writtenBy === BY_AGENT).length;
  return {
    summaryDate,
    written,
    byAgent,
    byFallback: planned.length - byAgent,
    rejected,
    writeVerified,
    errors,
  };
};
