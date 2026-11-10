import { BlocksClient, Item, WhereClause } from '../shared/blocks/blocks-client.ts';
import { resolveAsOf } from '../shared/collections-dates.ts';
import { buildOwnerMap, numberSetting, readAll, readSettings } from '../shared/collections-data.ts';
import { buildWindow, computeAging, latestSyncedAt } from '../shared/collections-aging.ts';
import { isApprovedReceipt, readPaymentSources } from '../shared/collections-invoice-layer.ts';

// Aging engine (read only). Window = monthsBack (default agingMonthsBack) months before the asOfDate month, that
// month, and monthsForward extra (future) months. Debt before the window → חוב קודם, after it → חוב מאוחר. Open
// amounts are net of payments the app already saw (invoice layer, computed live from our receipts' allocations and
// the approved / done matches), so a fully paid invoice leaves the report at once and a partly paid one stays with
// its remainingAmount. Notes are the CustomerNotes rows (one customer + one due month) in their due-month cell (notes /
// cellNotes); open commitments (התחייבות לתשלום, active, not kept) mark the cell (promises) and the customer
// (openPromises); invoices[].notes / latestNote / promise stay empty (notes are not per invoice). Each customer carries priorityStatus, collectionNote, paymentMethod and paymentTermsLabel.
// Negative amounts stay as they are in their month cell: credit notes, and the unallocated part of our receipts
// (kind קבלה לא מותאמת, at the receipt's value date). Balance check: total vs ledgerBalance − paidSeenPending (our
// allocations Priority does not show yet) − unallocatedPending (unallocated receipt parts Priority does not show
// yet: receipt מוכנה, or issued after the customer's last sync), so it holds before and after Priority catches up.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  const asOfDate = resolveAsOf(input?.asOfDate);

  const codes: string[] = Array.isArray(input?.customerCodes)
    ? input.customerCodes.map((c: unknown) => String(c).trim()).filter(Boolean)
    : [];
  const byCodes = (extra?: WhereClause): WhereClause | undefined => {
    const clauses: WhereClause[] = [];
    if (codes.length) clauses.push({ column: 'customerCode', operator: 'in', value: codes });
    if (extra) clauses.push(extra);
    if (clauses.length === 0) return undefined;
    return clauses.length === 1 ? clauses[0] : { and: clauses };
  };

  // one round trip: settings and every table in parallel (readAll answers a ≤500-row table in one go)
  // CustomerNotes (every status): each sits in its due-month cell, open commitments mark the cells (promises /
  // openPromises). The newest Invoices.syncedAt (open or not) says when Priority was last pulled. Approved /
  // recently done matches give the live invoice layer: open amounts net of payments the app already saw.
  const [settings, customers, invoices, notes, owners, contacts, lastSynced, payments, unallocatedReceipts] = await Promise.all([
    readSettings(client),
    readAll(client, 'Customers', byCodes()),
    readAll(client, 'Invoices', byCodes({ column: 'openAmount', operator: '!=', value: 0 })),
    readAll(client, 'CustomerNotes', byCodes()),
    readAll(client, 'CustomerOwners', byCodes()),
    readAll(client, 'CustomerContacts', byCodes()),
    client
      .queryTable('Invoices', {
        from: { table: 'Invoices' },
        where: byCodes({ column: 'syncedAt', operator: 'is not null' }),
        orderBy: [{ column: 'syncedAt', direction: 'desc' }],
        limit: 1,
      })
      .then((r) => (r?.items ?? []) as Item[])
      .catch(() => [] as Item[]),
    readPaymentSources(client, byCodes()),
    readAll(client, 'Receipts', byCodes({ column: 'unallocatedAmount', operator: '>', value: 0 })).then((rows) => rows.filter((r) => isApprovedReceipt(r))),
  ]);

  const monthsBackInput = Number(input?.monthsBack);
  const monthsBack = Number.isFinite(monthsBackInput) && input?.monthsBack !== null && input?.monthsBack !== ''
    ? monthsBackInput
    : numberSetting(settings, 'agingMonthsBack', 3);
  const monthsForwardInput = Number(input?.monthsForward);
  const monthsForward = Number.isFinite(monthsForwardInput) ? monthsForwardInput : 0;
  const window = buildWindow(asOfDate, monthsBack, monthsForward);

  const result = computeAging({
    window,
    customers,
    invoices,
    notes,
    contacts,
    matchProposals: payments,
    receipts: unallocatedReceipts,
    ownerMap: buildOwnerMap(owners),
    customerCodes: codes,
    bookkeeperName: input?.bookkeeperName,
    includeZero: input?.includeZero === true,
  });

  return {
    asOfDate,
    dataAsOf: latestSyncedAt([...lastSynced, ...invoices]),
    window: {
      monthsBack: window.monthsBack,
      monthsForward: window.monthsForward,
      monthKeys: window.monthKeys,
      firstMonth: window.firstMonth,
      lastMonth: window.lastMonth,
    },
    customers: result.customers,
    totals: result.totals,
  };
};
