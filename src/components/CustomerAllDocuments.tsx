import { useState } from 'react';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { InvoicesEntity } from '@/product-types';
import { HiddenDocsToggle } from '@/components/CustomerOpenInvoices';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { InvoiceNumberLink } from '@/components/receipts/InvoicePopup';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EMPTY, HIDDEN_DOC_STATUSES, formatDate, formatForeignExtra, formatILS, formatMoney, formatNumber, isILS, round2 } from '@/utils/Format';

const HEAD = 'text-xs font-semibold text-muted-foreground';
const PAGE = 100;
const FORM_LABEL: Record<string, string> = { CINVOICES: 'חשבונית', AINVOICES: 'חשבונית יצוא/מט״ח' };

/** כל המסמכים: every Invoices mirror row of the customer, newest first, paged by 100. */
export function CustomerAllDocuments({ customerCode }: { customerCode: string }) {
  const [showHidden, setShowHidden] = useState(false);
  const docs = useEntityGetAll(InvoicesEntity, {
    where: { column: 'customerCode', value: customerCode },
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
        <p className="px-[21px] pb-[21px] text-sm text-muted-foreground">אין מסמכים ללקוח מפריוריטי.</p>
      ) : (
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, 'ps-[21px]')}>מסמך</TableHead>
              <TableHead className={HEAD}>סוג</TableHead>
              <TableHead className={HEAD}>תאריך</TableHead>
              <TableHead className={HEAD}>סכום</TableHead>
              <TableHead className={HEAD}>סטטוס בפריוריטי</TableHead>
              <TableHead className={cn(HEAD, 'pe-[21px]')}>תאריך התאמה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id} className="hover:bg-glass-faint">
                <TableCell className="ps-[21px]">
                  <InvoiceNumberLink invoiceNumber={d.invoiceNumber} customerLink={false} />
                </TableCell>
                <TableCell>{FORM_LABEL[d.priorityForm ?? ''] ?? EMPTY}</TableCell>
                <TableCell className="tabular-nums">{formatDate(d.invoiceDate)}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(d.amount, d.currencyCode)}</TableCell>
                <TableCell>{d.priorityDocStatus || EMPTY}</TableCell>
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
    </div>
  );
}