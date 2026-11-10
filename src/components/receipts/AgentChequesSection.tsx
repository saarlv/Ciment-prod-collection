import { useState } from 'react';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AlertCircleIcon, DownloadIcon, PanelLeftOpenIcon, WalletCardsIcon, XIcon } from 'lucide-react';
import { PullAgentReceiptsAction, ReceiptsEntity } from '@/product-types';
import { CustomerLink } from '@/components/CustomerLink';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { AllocationSummary } from '@/components/receipts/AllocationSummary';
import { fromControl } from '@/components/receipts/IdentifyList';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { capitalizeName, formatDate, formatILS, formatNumber } from '@/utils/Format';
import { AGENT_CHEQUE } from '@/utils/ReceiptFlow';
import { matchStatusOf } from '@/utils/ReceiptRecord';

const HEAD = 'text-xs font-semibold text-muted-foreground';


/**
 * "צ׳קים של סוכנים" (plan 04.11 part B stage 7): field agents' cheque receipts (receiptSource צ׳ק סוכן, no bank
 * line), newest first, each with its match, the debt check and the allocation editor — the same as an approved
 * bank receipt. One outline button pulls them now (PullAgentReceipts; it also runs every morning at 09:00). A cheque
 * starts at the debt check (no identification); clicking its row opens the record panel (?receipt=<receiptKey>).
 */
export function AgentChequesSection({ onOpen }: { onOpen: (receiptKey: string) => void }) {
  const q = useEntityGetAll(ReceiptsEntity, {
    where: { column: 'receiptSource', value: AGENT_CHEQUE },
    orderBy: [{ column: 'valueDate', direction: 'desc' }],
    page: { size: 25 },
  });
  const { executeFunction: pull } = useExecuteAction(PullAgentReceiptsAction);
  const [pulling, setPulling] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const rows = q.data ?? [];

  async function runPull() {
    setPulling(true);
    setErrors([]);
    try {
      const out = await pull({});
      const errs = out?.errors ?? [];
      setErrors(errs);
      toast.add({
        title: out?.summary || (out?.ok === false ? 'המשיכה לא הצליחה' : `${formatNumber(out?.created ?? 0)} צ׳קים חדשים`),
        type: out?.ok === false ? 'error' : 'success',
      });
    } catch {
      setErrors(['המשיכה לא הסתיימה. צ׳ק שכבר נקלט לא ייקלט פעמיים – אפשר לנסות שוב.']);
    } finally {
      setPulling(false);
    }
  }

  return (
    <section aria-label="צ׳קים של סוכנים" className="glass flex min-w-0 flex-col gap-[13px] overflow-hidden rounded-[26px] border">
      <div className="flex flex-wrap items-center gap-[13px] px-[21px] pt-[21px]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-glass-inner">
          <WalletCardsIcon className="size-5 text-ink-2" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-[15px] font-bold">
            צ׳קים של סוכנים <span className="font-medium text-muted-foreground">({formatNumber(rows.length)}{q.hasNextPage ? '+' : ''})</span>
          </h2>
          <span className="text-[13px] text-muted-foreground">צ׳קים שסוכני השטח גבו. המשיכה קוראת 14 ימים אחורה ורצה כל בוקר ב-09:00, אחרי ריצת התקבולים.</span>
        </div>
        <Button variant="outline" className="h-10 rounded-full px-[18px]" disabled={pulling} onClick={runPull}>
          {pulling ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
          משוך צ׳קים של סוכנים
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="px-[21px]">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle className="flex items-center justify-between gap-2">
              חלק מהצ׳קים לא נקלטו
              <Button variant="ghost" size="icon-xs" aria-label="סגירה" onClick={() => setErrors([])}>
                <XIcon />
              </Button>
            </AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-0.5 ps-4">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {q.isError ? (
        <div className="px-[21px] pb-[21px]">
          <LoadError what="הצ׳קים של הסוכנים" />
        </div>
      ) : q.isLoading ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <p className="px-[21px] pb-[21px] text-[13px] text-muted-foreground">אין צ׳קים של סוכנים שנקלטו.</p>
      ) : (
        <div className="overflow-x-auto pb-[8px]">
          <Table className="min-w-[900px] text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'ps-[21px]')}>לקוח</TableHead>
                <TableHead className={HEAD}>סכום</TableHead>
                <TableHead className={HEAD}>תאריך</TableHead>
                <TableHead className={HEAD}>סוכן · קבלה ב-Priority</TableHead>
                <TableHead className={HEAD}>פיזור</TableHead>
                <TableHead className={cn(HEAD, 'pe-[21px]')}>חוב ופיזור</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={(e) => {
                    if (r.receiptKey && !fromControl(e)) onOpen(r.receiptKey);
                  }}
                  className="cursor-pointer align-top hover:bg-glass-faint"
                >
                  <TableCell className="max-w-56 ps-[21px] py-2.5 whitespace-normal">
                    <span className="flex items-start gap-1">
                      <CustomerLink code={r.customerCode} name={r.customerName} className="text-[13px]" />
                      {r.receiptKey && (
                        <Button variant="ghost" size="icon-xs" aria-label={`פתיחת הרשומה של ${r.customerName || r.receiptKey}`} onClick={() => onOpen(r.receiptKey ?? '')}>
                          <PanelLeftOpenIcon />
                        </Button>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 font-semibold whitespace-nowrap tabular-nums">{formatILS(r.amount)}</TableCell>
                  <TableCell className="py-2.5 whitespace-nowrap tabular-nums">{formatDate(r.valueDate)}</TableCell>
                  <TableCell className="py-2.5">
                    <span className="flex flex-col">
                      <span>{r.preparedBy ? capitalizeName(r.preparedBy) : '—'}</span>
                      {r.priorityReceiptNumber && (
                        <span dir="ltr" className="text-end text-xs text-muted-foreground">
                          {r.priorityReceiptNumber}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5">{matchStatusOf(r) ? <StatusBadge value={matchStatusOf(r)} className="h-5 px-2 text-[11px]" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="pe-[21px] py-2 whitespace-normal">
                    <AllocationSummary receipt={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {q.hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" className="rounded-full bg-glass-soft" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                {q.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                עוד צ׳קים
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}