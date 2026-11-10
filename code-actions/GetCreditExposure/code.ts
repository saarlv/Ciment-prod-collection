import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf, sortableTime } from '../shared/collections-dates.ts';
import { buildOwnerMap, errText, numOrNull, ownerOf, readAll, readSettings, readWhereIn, str } from '../shared/collections-data.ts';
import { alertsOf, creditViewsFor, expiryAlertDaysOf, insuredCodes, loadCreditSources, pickCover, tabUseOf, thresholdPctOf } from '../shared/collections-credit.ts';
import { OPEN_REQUEST_STATUSES } from '../shared/collections-insurance.ts';

// Read only. Credit insurance and obligo for the customer card tab אובליגו וביטוח, and the alerts on היום.
// - customerCode given: the customer's cover (תקף, else the newest; null = no tab), the static obligo as Priority
//   gives it, the dynamic obligo computed now (static − transfers in clarification − receipts not yet in Priority,
//   every adjustment with its reason and link), undeposited cheques apart (afterDeposit), use % and ILS against the
//   insured amount (level גבוה at insuranceThresholdPct, default 80), the breakdown by itemType and the customer's
//   open CreditLimitRequests row. Since 01.11 the tab shows for every customer: without a cover the obligo, breakdown
//   and cheques are still returned and use is measured against Customers.creditLimit (use.basis מסגרת אשראי; with a
//   cover use.basis ביטוח אשראי, numbers unchanged); with neither, use is null.
// - no customerCode: alerts for every insured customer (cover תקף): ניצול גבוה on the DYNAMIC use, פקיעה when the
//   cover expires within coverExpiryAlertDays (default 30). Optional bookkeeperName limits to one owner's customers.
// Writes nothing; no call to ICIC; nothing to Priority.
export const invoke = async (input: any, context: any) => {
  const errors: string[] = [];
  let asOfDate: string;
  try {
    asOfDate = resolveAsOf(input?.asOfDate);
  } catch (e) {
    return { customer: null, insured: false, cover: null, staticObligo: null, dynamicObligo: null, use: null, breakdown: [], openRequest: null, alerts: [], asOfDate: null, errors: [errText(e)] };
  }
  const customerCode = str(input?.customerCode).trim();
  const client = new BlocksClient(context);
  const settings = await readSettings(client);
  const thresholdPct = thresholdPctOf(settings);
  const expiryDays = expiryAlertDaysOf(settings);

  // ---------- one customer: the tab ----------
  if (customerCode) {
    const [src, customers, requests] = await Promise.all([
      loadCreditSources(client, [customerCode], { items: true }),
      readAll(client, 'Customers', { column: 'customerCode', value: customerCode }),
      readAll(client, 'CreditLimitRequests', { column: 'customerCode', value: customerCode }),
    ]);
    const customerRow = customers[0];
    const view = creditViewsFor(src, [customerCode], asOfDate, thresholdPct, expiryDays).get(customerCode)!;
    if (!customerRow && !view.insured) errors.push(`לקוח ${customerCode} לא נמצא`);
    const coverRow = pickCover(src.covers);
    const open = requests
      .filter((r) => OPEN_REQUEST_STATUSES.includes(str(r.status)))
      .sort((a, b) => sortableTime(b.requestCreatedAt) - sortableTime(a.requestCreatedAt) || Number(b.id ?? 0) - Number(a.id ?? 0))[0];
    return {
      customer: { customerCode, customerName: str(customerRow?.customerName) || str(coverRow?.customerName) || null },
      ...view,
      use: tabUseOf(view, numOrNull(customerRow?.creditLimit), thresholdPct),
      openRequest: open ?? null,
      alerts: [],
      asOfDate,
      errors,
    };
  }

  // ---------- every insured customer: the alerts ----------
  const src = await loadCreditSources(client, null);
  let codes = insuredCodes(src.covers);
  const bookkeeperName = str(input?.bookkeeperName).trim();
  const [customers, owners] = codes.length
    ? await Promise.all([readWhereIn(client, 'Customers', 'customerCode', codes), readWhereIn(client, 'CustomerOwners', 'customerCode', codes)])
    : [[], []];
  const customerOf = new Map<string, Item>();
  for (const c of [...customers].sort((a, b) => Number(a.id) - Number(b.id))) {
    const code = str(c.customerCode);
    if (code && !customerOf.has(code)) customerOf.set(code, c);
  }
  const ownerMap = buildOwnerMap(owners);
  const ownerFor = (code: string) => ownerOf(code, customerOf.get(code), ownerMap) || null;
  if (bookkeeperName) codes = codes.filter((code) => ownerFor(code) === bookkeeperName);

  const views = creditViewsFor(src, codes, asOfDate, thresholdPct, expiryDays);
  const coverName = (code: string) => str(pickCover(src.covers.filter((c) => str(c.customerCode) === code))?.customerName);
  const alerts = alertsOf(
    codes.map((code) => ({
      customerCode: code,
      customerName: str(customerOf.get(code)?.customerName) || coverName(code) || null,
      bookkeeperName: ownerFor(code),
      view: views.get(code)!,
    })),
  );
  return {
    customer: null,
    insured: codes.length > 0,
    cover: null,
    staticObligo: null,
    dynamicObligo: null,
    use: { thresholdPct, expiryAlertDays: expiryDays, insuredCustomers: codes.length },
    breakdown: [],
    openRequest: null,
    alerts,
    asOfDate,
    errors,
  };
};
