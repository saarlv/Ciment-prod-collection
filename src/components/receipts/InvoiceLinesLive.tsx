import { useEffect, useRef, useState } from 'react';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { InvoiceLinesEntity, InvoicesEntity, ReadInvoiceLinesLiveAction } from '@/product-types';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatILS, formatNumber } from '@/utils/Format';

const HEAD = 'h-8 text-xs font-semibold text-muted-foreground';

/**
 * The invoice's lines, read live from Priority once each time this mounts (ReadInvoiceLinesLive),
 * then shown from InvoiceLines. When the live read fails the last mirrored copy stays on screen.
 */
export function InvoiceLinesLive({ invoiceNumber, title = 'שורות החשבונית' }: { invoiceNumber: string; title?: string }) {
  const invoices = useEntityGetAll(InvoicesEntity, { where: { column: 'invoiceNumber', value: invoiceNumber } });
  const lines = useEntityGetAll(InvoiceLinesEntity, { where: { column: 'invoiceNumber', value: invoiceNumber } });
  const { executeFunction } = useExecuteAction(ReadInvoiceLinesLiveAction);
  const [reading, setReading] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const readFor = useRef<string | null>(null);
  const form = invoices.data?.[0]?.priorityForm ?? 'CINVOICES';
  const ready = !invoices.isLoading;

  useEffect(() => {
    if (!ready || !invoiceNumber || readFor.current === invoiceNumber) return;
    readFor.current = invoiceNumber;
    setReading(true);
    setLiveFailed(false);
    executeFunction({ invoiceNumber, form })
      .then((r) => setLiveFailed(!!r?.error))
      .catch(() => setLiveFailed(true))
      .finally(() => {
        setReading(false);
        lines.refetch();
      });
  }, [ready, invoiceNumber, form, executeFunction, lines]);

  const rows = [...(lines.data ?? [])].sort(
    (a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0) || (a.lineKey ?? '').localeCompare(b.lineKey ?? '', undefined, { numeric: true }),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
        {title}
        {rows.length ? ` (${rows.length})` : ''}
        {reading && (
          <span className="flex items-center gap-1 font-normal">
            <Spinner className="size-3" />
            קורא שורות מפריוריטי…
          </span>
        )}
      </span>
      {liveFailed && <span className="text-xs text-muted-foreground">לא ניתן לקרוא מפריוריטי כרגע — מוצג העותק האחרון</span>}
      {lines.isError ? (
        <LoadError what="שורות החשבונית" />
      ) : lines.isLoading ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{reading ? 'השורות נטענות…' : 'לחשבונית הזו לא נטענו שורות מ-Priority.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-[16px] bg-glass-card">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'ps-[13px]')}>מק״ט</TableHead>
                <TableHead className={HEAD}>תיאור</TableHead>
                <TableHead className={HEAD}>כמות</TableHead>
                <TableHead className={HEAD}>יחידה</TableHead>
                <TableHead className={HEAD}>מחיר</TableHead>
                <TableHead className={HEAD}>הנחה %</TableHead>
                <TableHead className={cn(HEAD, 'pe-[13px]')}>סה״כ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id} className="hover:bg-glass-faint">
                  <TableCell className="ps-[13px] py-1.5 text-xs" dir="ltr">
                    <span className="block text-start">{l.sku || '—'}</span>
                  </TableCell>
                  <TableCell className="max-w-48 truncate py-1.5" title={l.itemName ?? undefined}>
                    {l.itemName || '—'}
                  </TableCell>
                  <TableCell className="py-1.5 tabular-nums">{formatNumber(l.quantity)}</TableCell>
                  <TableCell className="py-1.5">{l.unit || '—'}</TableCell>
                  <TableCell className="py-1.5 tabular-nums">{formatILS(l.unitPrice)}</TableCell>
                  <TableCell className="py-1.5 tabular-nums">{l.discountPercent ? formatNumber(l.discountPercent) : '—'}</TableCell>
                  <TableCell className="pe-[13px] py-1.5 font-semibold tabular-nums">{formatILS(l.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}