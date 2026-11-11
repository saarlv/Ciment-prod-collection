import { useState } from 'react';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { useAsOfDate } from '@/hooks/useAsOfDate';
import { useCustomerOpenMovements } from '@/hooks/useCustomerOpenMovements';
import { WAITING_FOR_OPEN_MOVEMENTS } from '@/hooks/useHasOpenMovements';
import { InvoicesEntity } from '@/product-types';
import { HiddenDocsToggle } from '@/components/CustomerOpenInvoices';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { useInvoiceRowOpener } from '@/components/receipts/InvoicePopup';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { isIls } from '@/utils/Currency';
import { EMPTY, HIDDEN_DOC_STATUSES, daysPastDue, formatDate, formatForeignExtra, formatILS, formatMoney, formatNumber, PRIORITY_FORM_LABEL, round2 } from '@/utils/Format';

const HEAD = 'text-xs font-semibold text-muted-foreground';
const PAGE = 100;

export type DocsFilter = 'open' | 'closed' | 'all';

/**
 * The customer's documents (Invoices mirror), paged on the server by 100. open = invoice numbers among the customer's
 * open movements in Priority (earliest due first), closed = every other document, all = every document (newest first).
 * Open/closed is never inferred from Priority's reconciliation date. Every row opens the invoice pop-up.
 */
export function CustomerAllDocuments({ customerCode, filter = 'all', ledgerRead }: { customerCode: string; filter?: DocsFilter; ledgerRead: boolean }) {
  const [showHidden, setShowHidden] = useState(false);
  const { rowProps, popup } = useInvoiceRowOpener();
  const asOf = useAsOfDate();
  const needsLedger = filter !== 'all';
  const movements = useCustomerOpenMovements(customerCode, needsLedger && ledgerRead);
  const openNumbers = [...new Set((movements.data ?? []).map((m) => (m.docNumber ?? '').trim()).filter(Boolean))];
  const byCustomer = { column: 'customerCode' as const, value: customerCode };
  const where =
    filter === 'all' || (filter === 'closed' && openNumbers.length === 0)
      ? byCustomer
      : { and: [byCustomer, { column: 'invoiceNumber' as const, operator: filter === 'open' ? ('in' as const) : ('not in' as const), value: openNumbers }] };
  const ready = !needsLedger || (ledgerRead && !movements.isLoading && !movements.isError);
  const docs = useEntityGetAll(
    InvoicesEntity,
    {
      where,
      orderBy:
        filter === 'open'
          ? [{ column: 'dueDate', direction: 'asc' }, { column: 'invoiceNumber', direction: 'asc' }]
          : [{ column: 'invoiceDate', direction: 'desc' }, { column: 'invoiceNumber', direction: 'desc' }],
      page: { size: PAGE },
    },
    { enabled: ready && !(filter === 'open' && openNumbers.length === 0) },
  );

  if (needsLedger && !ledgerRead)
    return (
      <div className="flex flex-col gap-1 px-[21px] pb-[21px] text-sm text-muted-foreground">
        <p className="font-semibold text-ink-2">{WAITING_FOR_OPEN_MOVEMENTS}</p>
        <p>עד שיגיעו אי אפשר לדעת אילו מסמכים פתוחים ואילו נסגרו. כל המסמכים מופיעים תחת ״הכל״.</p>
      </div>
    );
  if (movements.isError) return <div className="px-[21px] pb-[21px]"><LoadError what="התנועות הפתוחות" /></div>;
  if (filter === 'open' && !movements.isLoading && openNumbers.length === 0)
    return <p className="px-[21px] pb-[21px] text-sm text-muted-foreground">אין ללקוח מסמכים פתוחים בפריוריטי.</p>;
  if (docs.isError) return <div className="px-[21px] pb-[21px]"><LoadError what="המסמכים" /></div>;
  if (!ready || docs.isLoading) return <div className="px-[21px] pb-[21px]"><LoadingRows rows={4} /></div>;

  const all = docs.data ?? [];
  const hiddenCount = all.filter((d) => HIDDEN_DOC_STATUSES.includes(d.priorityDocStatus ?? '')).length;
  const rows = showHidden ? all : all.filter((d) => !HIDDEN_DOC_STATUSES.includes(d.priorityDocStatus ?? ''));
  const isOpen = filter === 'open';
  const valueOf = (d: (typeof rows)[number]) => (isOpen ? (d.openAmount ?? 0) : (d.amount ?? 0));
  const total = round2(rows.filter((d) => isIls(d.currencyCode)).reduce((s, d) => s + valueOf(d), 0));
  const foreignExtra = formatForeignExtra(rows.map((d) => ({ amount: valueOf(d), currencyCode: d.currencyCode })));

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
              {isOpen && <TableHead className={HEAD}>פירעון</TableHead>}
              {isOpen && <TableHead className={HEAD}>ימי פיגור</TableHead>}
              <TableHead className={HEAD}>סכום</TableHead>
              <TableHead className={HEAD}>יתרה פתוחה</TableHead>
              <TableHead className={HEAD}>סטטוס בפריוריטי</TableHead>
              <TableHead className={cn(HEAD, 'pe-[21px]')}>סוכן</TableHead>
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
                {isOpen && <TableCell className="tabular-nums">{formatDate(d.dueDate)}</TableCell>}
                {isOpen && <TableCell className={cn('tabular-nums', (d.openAmount ?? 0) > 0 && daysPastDue(d.dueDate, asOf) && 'font-semibold text-critical-ink')}>{(d.openAmount ?? 0) > 0 ? (daysPastDue(d.dueDate, asOf) ?? '') : ''}</TableCell>}
                <TableCell className="tabular-nums">{formatMoney(d.amount, d.currencyCode)}</TableCell>
                <TableCell className="tabular-nums">
                  {d.openAmount === null || d.openAmount === undefined ? (
                    <span className="text-xs text-muted-foreground">{WAITING_FOR_OPEN_MOVEMENTS}</span>
                  ) : d.openAmount === 0 ? (
                    <span className="text-muted-foreground">סגורה</span>
                  ) : (
                    <span className="font-semibold">{formatMoney(d.openAmount, d.currencyCode)}</span>
                  )}
                </TableCell>
                <TableCell>{d.priorityDocStatus || EMPTY}</TableCell>
                <TableCell className="pe-[21px]">{d.salesAgentName || EMPTY}</TableCell>
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