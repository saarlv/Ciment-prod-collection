/**
 * The aging table as it is on screen, as rows for a spreadsheet: the customer columns that are shown,
 * one column per bucket in view (חוב קודם, the window months, חוב מאוחר), the total, and a totals row.
 * Amounts stay numbers, negative ones included (credit notes and unmatched receipts), so Excel can sum them.
 */
import { cellAt } from '@/utils/AgingPanel';
import type { AgingColumns, Bucket } from '@/utils/AgingPanel';
import type { AgingCustomer, AgingTotals } from '@/utils/CollectionsTypes';

export type SheetCell = string | number | null;

const DETAILS: { key: 'priorityStatus' | 'collectionNote' | 'paymentMethod' | 'paymentTermsLabel'; label: string }[] = [
  { key: 'priorityStatus', label: 'סטטוס' },
  { key: 'collectionNote', label: 'הערה לגבייה' },
  { key: 'paymentMethod', label: 'אמצעי תשלום' },
  { key: 'paymentTermsLabel', label: 'תנאי תשלום' },
];

function contactText(c: AgingCustomer): string {
  const ct = c.contact;
  if (!ct) return '';
  return [ct.name, ct.phone || ct.email].filter(Boolean).join(' · ');
}

function bucketTotal(totals: AgingTotals | undefined, b: Bucket): number | null {
  if (!totals) return null;
  if (b.kind === 'prior') return totals.priorDebt ?? 0;
  if (b.kind === 'later') return totals.laterDebt ?? 0;
  return totals.months?.find((m) => m.monthKey === b.key)?.amount ?? 0;
}

export function agingSheetRows(
  customers: AgingCustomer[],
  buckets: Bucket[],
  columns: AgingColumns,
  totals?: AgingTotals,
  totalsLabel = 'סה״כ',
): SheetCell[][] {
  const head: SheetCell[] = ['קוד לקוח', 'שם לקוח'];
  if (columns.details) head.push(...DETAILS.map((d) => d.label));
  if (columns.agent) head.push('סוכן מטעם סימנט');
  if (columns.contact) head.push('איש קשר של הלקוח');
  head.push(...buckets.map((b) => b.label), 'סה״כ');

  const rows: SheetCell[][] = customers.map((c) => {
    const row: SheetCell[] = [c.customerCode ?? '', c.customerName ?? ''];
    if (columns.details) row.push(...DETAILS.map((d) => c[d.key] ?? ''));
    if (columns.agent) row.push(c.salesAgentName ?? '');
    if (columns.contact) row.push(contactText(c));
    row.push(...buckets.map((b) => cellAt(c, b.key)?.amount ?? 0), c.total ?? 0);
    return row;
  });

  const lead = head.length - buckets.length - 1;
  const foot: SheetCell[] = [totalsLabel, ...Array.from({ length: lead - 1 }, () => null)];
  foot.push(...buckets.map((b) => bucketTotal(totals, b)), totals?.total ?? null);

  return [head, ...rows, foot];
}

/** "דוח-גיול-2026-10-26.xlsx" */
export function agingFileName(asOfDate: string): string {
  return `דוח-גיול-${asOfDate}.xlsx`;
}