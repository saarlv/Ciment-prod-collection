import { useState } from 'react';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { InvoicesEntity } from '@/product-types';
import { HiddenDocsToggle } from '@/components/CustomerOpenInvoices';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { useInvoiceRowOpener } from '@/components/receipts/InvoicePopup';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EMPTY, HIDDEN_DOC_STATUSES, formatDate, formatForeignExtra, formatILS, formatMoney, formatNumber, isILS, PRIORITY_FORM_LABEL, round2 } from '@/utils/Format';

const HEAD = 'text-xs font-semibold text-muted-foreground';
const PAGE = 100;

export type DocsFilter = 'open' | 'closed' | 'all';

/**
 * The customer's documents (Invoices mirror), newest first, paged by 100. open = no reconciliation date in Priority,
 * closed = reconciled, all = every document. Every row opens the invoice pop-up.
 */
export function CustomerAllDocuments({ customerCode, filter = 'all' }: { customerCode: string; filter?: DocsFilter }) {
  const [showHidden, setShowHidden] = useState(false);
  const { rowProps, popup } = useInvoiceRowOpener();
  const byCustomer = { column: 'customerCode' as const, value: customerCode };
  const docs = useEntityGetAll(InvoicesEntity, {
    where:
      filter === 'all'
        ? byCustomer
        : { and: [byCustomer, { column: 'reconciledDate' as const, operator: filter === 'open' ? ('is null' as const) : ('is not null' as const) }] },
    orderBy: [
      { column: 'invoiceDate', direction: 'desc' },
      { column: 'invoiceNumber', direction: 'desc' },
    ],
    page: { size: PAGE },
  });

  if (docs.isError) return <div className="px-[21px] pb-[21px]"><LoadError what="המסמכים" /></div>;
  if (docs.isLoading) return <div className="px-[21px] pb-[21px]"><LoadingRows rows={4} /></div>;

  const all = docs.data ?? [];
  const hiddenCount = all.filter((d) => HIDDEN_DOC_STATUSES.includes(d.priorityDocStatus ?? '')).length;
  const rows = showHidden ? all : all.filter((d) => !HIDDEN_DOC_STATUSES.includes(d.priorityDocStatus ?? ''));
  const total = round2(rows.filter((d) => isILS(d.currencyCode)).reduce((s, d) => s + (d.amount ?? 0), 0));
  const foreignExtra = formatForeignExtra(rows.map((d) => ({ amount: d.amount, currencyCode: d.currencyCode })));

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-[13px] px-[21px] pb-[13px]">
        <dl className="flex flex-wrap items-center gap-x-[21px] text-[13px]">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{docs.hasNextPage ? `סה״כ ב־${formatNumber(rows.length)} שנטענו` : `סה״כ ${formatNumber(rows.length)} מסמכים`}</dt>
            <dd className="font-bold tabular-nums">{formatILS(total)}</dd>
          </div>
          {foreignExtra && <div className="text-muted-foreground tabular-nums">{foreignExtra}</div>}
        </dl>
        {hiddenCount > 0 && <HiddenDocsToggle checked={showHidden} onChange={setShowHidden} />}
      </div>
      {rows.length === 0 ? (
        <p className="px-[21px] pb-[21px] text-sm text-muted-foreground">
          {filter === 'open' ? 'אין ללקוח מסמכים פתוחים.' : filter === 'closed' ? 'אין ללקוח מסמכים סגורים.' : 'אין מסמכים ללקוח מפריוריטי.'}
        </p>
      ) : (
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, 'ps-[21px]')}>מסמך</TableHead>
              <TableHead className={HEAD}>סוג מסמך</TableHead>
              <TableHead className={HEAD}>טופס</TableHead>
              <TableHead className={HEAD}>תאריך</TableHead>
              <TableHead className={HEAD}>סכום</TableHead>
              <TableHead className={HEAD}>סטטוס בפריוריטי</TableHead>
              <TableHead className={HEAD}>סוכן</TableHead>
              <TableHead className={cn(HEAD, 'pe-[21px]')}>תאריך התאמה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id} {...rowProps(d.invoiceNumber)}>
                <TableCell className="ps-[21px] font-semibold text-link tabular-nums" dir="ltr">
                  {d.invoiceNumber || EMPTY}
                </TableCell>
                <TableCell>{d.documentType || EMPTY}</TableCell>
                <TableCell>{PRIORITY_FORM_LABEL[d.priorityForm ?? ''] ?? EMPTY}</TableCell>
                <TableCell className="tabular-nums">{formatDate(d.invoiceDate)}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(d.amount, d.currencyCode)}</TableCell>
                <TableCell>{d.priorityDocStatus || EMPTY}</TableCell>
                <TableCell>{d.salesAgentName || EMPTY}</TableCell>
                <TableCell className="pe-[21px] tabular-nums">{formatDate(d.reconciledDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {docs.hasNextPage && (
        <div className="px-[21px] py-[13px]">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => docs.fetchNextPage()} disabled={docs.isFetchingNextPage}>
            {docs.isFetchingNextPage && <Spinner data-icon="inline-start" />}
            {docs.isFetchingNextPage ? 'טוען…' : `טען עוד ${PAGE}`}
          </Button>
        </div>
      )}
      {popup}
    </div>
  );
}