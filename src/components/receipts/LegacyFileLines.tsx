import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { FileTextIcon } from 'lucide-react';
import { BankLinesEntity } from '@/product-types';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDate, formatILS } from '@/utils/Format';
import { legacyLineChip } from '@/utils/ReceiptsDay';

const HEAD = 'text-xs font-semibold text-muted-foreground';
const ITEM = 'legacy';

/**
 * "שורות ישנות מקובץ (לצפייה)": bank lines that came from an uploaded file before plan r3 stage 2 (no
 * priorityLineId). Collapsed by default and read only — they are loaded only when opened, newest first.
 * `highlight` (a ?line= link to one of them) opens the section and marks that row. `excludeBatchIds` are today's
 * uploaded files (bankLinesSource קובץ, stage 4): their lines are on the screen above, not old.
 */
export function LegacyFileLines({
  open,
  onOpenChange,
  highlight,
  excludeBatchIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlight?: string | null;
  excludeBatchIds?: string[];
}) {
  const q = useEntityGetAll(
    BankLinesEntity,
    {
      where: {
        and: [
          { or: [{ column: 'priorityLineId', operator: 'is null' }, { column: 'priorityLineId', value: '' }] },
          ...(excludeBatchIds.length ? [{ column: 'importBatchId', operator: 'not in', value: excludeBatchIds }] : []),
        ],
      },
      orderBy: [
        { column: 'valueDate', direction: 'desc' },
        { column: 'lineNo', direction: 'asc' },
      ],
      page: { size: 50 },
    },
    { enabled: open },
  );
  const rows = q.data ?? [];

  return (
    <Accordion value={open ? [ITEM] : []} onValueChange={(v) => onOpenChange(v.includes(ITEM))} className="glass rounded-[26px] border">
      <AccordionItem value={ITEM} className="data-open:bg-transparent">
        <AccordionTrigger className="items-center px-[21px] py-[13px] hover:no-underline">
          <span className="flex items-center gap-2">
            <FileTextIcon className="size-4 text-muted-foreground" />
            <span className="text-[15px] font-bold">שורות ישנות מקובץ (לצפייה)</span>
            <span className="text-xs font-normal text-muted-foreground">מלפני המשיכה מפריוריטי · לא נבדקות שוב</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-2 px-0 pb-[13px]">
          {q.isError ? (
            <div className="px-[21px]">
              <LoadError what="השורות הישנות" />
            </div>
          ) : q.isLoading ? (
            <LoadingRows rows={4} />
          ) : rows.length === 0 ? (
            <p className="px-[21px] text-[13px] text-muted-foreground">אין שורות ישנות מקובץ.</p>
          ) : (
            <>
              <div className="max-h-[420px] overflow-auto">
                <Table className="min-w-[560px] text-[13px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={cn(HEAD, 'ps-[21px]')}>תאריך</TableHead>
                      <TableHead className={HEAD}>שם מעביר</TableHead>
                      <TableHead className={HEAD}>סכום</TableHead>
                      <TableHead className={HEAD}>סוג</TableHead>
                      <TableHead className={HEAD}>לקוח</TableHead>
                      <TableHead className={cn(HEAD, 'pe-[21px]')}>מצב</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((l) => {
                      const chip = legacyLineChip(l);
                      return (
                        <TableRow key={l.id} aria-current={l.bankLineId === highlight ? 'true' : undefined} className={cn('hover:bg-transparent', l.bankLineId === highlight && 'bg-glass-inner')}>
                          <TableCell className="ps-[21px] py-1.5 whitespace-nowrap tabular-nums">{formatDate(l.valueDate)}</TableCell>
                          <TableCell className="max-w-64 truncate py-1.5 font-semibold" title={l.payerName ?? undefined}>
                            {l.payerName || '—'}
                          </TableCell>
                          <TableCell className={cn('py-1.5 whitespace-nowrap tabular-nums', (l.amount ?? 0) < 0 && 'text-critical-ink')}>{formatILS(l.amount)}</TableCell>
                          <TableCell className="py-1.5 whitespace-nowrap">{l.lineType ?? '—'}</TableCell>
                          <TableCell className="max-w-48 truncate py-1.5">{l.customerName || '—'}</TableCell>
                          <TableCell className="pe-[21px] py-1.5">
                            <StatusBadge value={chip.label} tone={chip.tone} className="h-5 px-2 text-[11px]" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {q.hasNextPage && (
                <Button variant="ghost" size="sm" className="self-center rounded-full bg-glass-soft" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                  {q.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                  עוד שורות
                </Button>
              )}
            </>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}