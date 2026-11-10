import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf } from '../shared/collections-dates.ts';
import {
  buildOwnerMap,
  createInChunks,
  DEFAULT_RECORDER,
  errText,
  numberSetting,
  ownerOf,
  readByIds,
  readSettings,
  readWhereIn,
  str,
} from '../shared/collections-data.ts';
import { DEFAULT_INCREASE_PCT, OUT_NO_COVER, OUT_PROPOSED, planProposals, REQ_PROPOSED, usePctOf } from '../shared/collections-insurance.ts';
import { creditViewsFor, expiryAlertDaysOf, insuredCodes, loadCreditSources, pickCover, thresholdPctOf } from '../shared/collections-credit.ts';

// Credit-insurance increase proposals (בסס״ח), ground work only: there are no API keys, so the insurer
// is never called. As of asOfDate (default today, Israel), every customer whose cover (CreditCovers) is in תקף is
// checked with the same dynamic obligo and threshold rule as GetCreditExposure (shared/collections-credit.ts):
// use% = dynamic obligo / insuredAmount × 100, one decimal, so a proposal and the ניצול גבוה alert always agree.
// At or above insuranceThresholdPct (AgentSettings, default 80) and with no open request (טיוטה, הוצעה
// ע״י הסוכנת, אושר – לא הוגש, ממתינה להגשה, הוגשה למבטח) → one CreditLimitRequests row in "הוצעה ע״י
// הסוכנת": requested = insured × (1 + insuranceIncreasePct/100) (default 50), whole shekels, and the ICIC
// request preview in insurerFields (REGISTERED_NO, BUYER_NAME, BUYER_ADDRESS from the customer card, COUNTRY_NO 916,
// CURRENCY_CODE NIS, PRODUCT_TYPE 1, SUM_REQUESTED, ORIG_COVER_NO = the cover's coverNo, IND_DEBTS Y/N from the aging
// report, CREDIT_DAYS and PAYTERMS_CODE לא ידוע – לברר עם יניב). Increases only – never a new-customer request.
// Writes nothing to Priority; sends nothing. dryRun returns the same proposals and writes nothing.
export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const nowIso = new Date().toISOString();
  const errors: string[] = [];
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    return { dryRun, asOfDate: null, thresholdPct: null, increasePct: null, checked: 0, customers: [], proposals: [], created: 0, writeVerified: false, errors: [errText(e)] };
  }
  const rawCodes = Array.isArray(input?.customerCodes) ? input.customerCodes : typeof input?.customerCodes === 'string' ? String(input.customerCodes).split(/[,\n;]/) : [];
  const wanted = [...new Set(rawCodes.map((x: unknown) => str(x).trim()).filter(Boolean))] as string[];
  const proposedBy = str(input?.proposedBy).trim() || DEFAULT_RECORDER;

  const client = new BlocksClient(context);
  const [settings, src] = await Promise.all([readSettings(client), loadCreditSources(client, wanted.length ? wanted : null)]);
  const thresholdPct = thresholdPctOf(settings);
  const increasePct = numberSetting(settings, 'insuranceIncreasePct', DEFAULT_INCREASE_PCT);

  // the customers checked: the requested ones (each, insured or not), else every customer with a cover in תקף
  const codes = wanted.length ? wanted : insuredCodes(src.covers);
  const cards = codes.length ? await readWhereIn(client, 'Customers', 'customerCode', codes) : [];
  // one card per code (the first row)
  const byCode = new Map<string, Item>();
  for (const c of [...cards].sort((a, b) => Number(a.id) - Number(b.id))) {
    const code = str(c.customerCode);
    if (code && !byCode.has(code)) byCode.set(code, c);
  }
  const views = creditViewsFor(src, codes, asOfDate, thresholdPct, expiryAlertDaysOf(settings));
  for (const code of wanted) if (!byCode.has(code) && !views.get(code)?.insured) errors.push(`לקוח ${code} לא נמצא`);
  const checkedCodes = codes.filter((code) => byCode.has(code) || views.get(code)?.insured);
  const entries = checkedCodes.map((code) => ({
    customerCode: code,
    customerName: str(pickCover(src.covers.filter((c) => str(c.customerCode) === code))?.customerName) || null,
    customer: byCode.get(code),
    view: views.get(code),
  }));

  // invoices (for IND_DEBTS) only of the customers at or over the threshold
  const overCodes = entries.filter((e) => (usePctOf(e.view) ?? -1) >= thresholdPct).map((e) => e.customerCode);
  const [owners, requests, invoices] = checkedCodes.length
    ? await Promise.all([
        readWhereIn(client, 'CustomerOwners', 'customerCode', checkedCodes),
        readWhereIn(client, 'CreditLimitRequests', 'customerCode', overCodes),
        readWhereIn(client, 'Invoices', 'customerCode', overCodes),
      ])
    : [[], [], []];
  const ownerMap = buildOwnerMap(owners);
  const planned = planProposals({
    asOfDate,
    nowIso,
    thresholdPct,
    increasePct,
    proposedBy,
    customers: entries,
    ownerOf: (code, c) => ownerOf(code, c, ownerMap),
    requests,
    invoices,
  });
  const base = {
    dryRun,
    asOfDate,
    thresholdPct,
    increasePct,
    checked: planned.customers.filter((c) => c.outcome !== OUT_NO_COVER).length,
    customers: planned.customers,
  };

  if (dryRun || !planned.rows.length) {
    return { ...base, proposals: planned.rows, created: 0, writeVerified: !dryRun && errors.length === 0, errors };
  }

  let created: Item[] = [];
  try {
    created = await createInChunks(client, 'CreditLimitRequests', planned.rows);
  } catch (e) {
    errors.push(`CreditLimitRequests: ${errText(e)}`);
  }
  const ids = created.map((r) => str(r.id)).filter(Boolean);
  const back = ids.length ? await readByIds(client, 'CreditLimitRequests', ids) : [];
  const problems: string[] = [];
  for (const row of planned.rows) {
    const b = back.find((x) => str(x.customerCode) === row.customerCode && str(x.status) === REQ_PROPOSED);
    if (!b) {
      problems.push(`${row.customerCode}: הבקשה לא נקראה בחזרה`);
      continue;
    }
    const fields = Array.isArray(b.insurerFields?.fields) ? b.insurerFields.fields : [];
    if (Number(b.requestedLimit) !== row.requestedLimit || fields.length !== row.insurerFields.fields.length || str(b.proposedBy) !== proposedBy) {
      problems.push(`${row.customerCode}: הבקשה נקראה בחזרה אחרת מהמתוכנן`);
    }
  }
  for (const c of planned.customers) {
    if (c.outcome !== OUT_PROPOSED) continue;
    const b = back.find((x) => str(x.customerCode) === c.customerCode);
    c.requestId = b ? str(b.id) : null;
  }
  errors.push(...problems);
  return {
    ...base,
    proposals: back.length ? back.sort((a, b) => planned.rows.findIndex((r) => r.customerCode === a.customerCode) - planned.rows.findIndex((r) => r.customerCode === b.customerCode)) : planned.rows,
    created: created.length,
    writeVerified: errors.length === 0 && created.length === planned.rows.length,
    errors,
  };
};
