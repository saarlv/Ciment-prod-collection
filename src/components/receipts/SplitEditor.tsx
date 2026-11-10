import { useState } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckCheckIcon, RotateCwIcon, XCircleIcon } from 'lucide-react';
import { ApplyAllocationAction, ProposeAllocationAction } from '@/product-types';
import { LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { InvoiceNumberLink } from '@/components/receipts/InvoicePopup';
import { useActionQuery } from '@/hooks/useActionQuery';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDate, formatILS, formatMonth, formatNumber, round2 } from '@/utils/Format';

const HEAD = 'h-8 text-xs font-semibold text-muted-foreground';
const CENT = 0.01;

/** One open invoice in ProposeAllocation's months[]. */
interface AllocInvoice {
  invoiceNumber: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  invoiceAmount?: number | null;
  /** The most this receipt can put on it (open in Priority minus every other receipt's allocation). */
  openBefore: number;
  proposed?: number;
  isPartial?: boolean;
  /** This receipt's current allocation on it (0 when none). */
  current?: number;
  otherReceipts?: { receiptKey: string; amount: number }[];
}

interface AllocMonth {
  dueMonth: string;
  monthLabel?: string;
  closedByDebtCheck?: boolean;
  openTotal?: number;
  invoices: AllocInvoice[];
}

type ProposeOutput = Omit<(typeof ProposeAllocationAction)['outputInstanceType'], 'months'> & { months?: AllocMonth[] };

interface RowState {
  on: boolean;
  amount: string;
}

const parseAmount = (text: string) => Number(text.replace(/[,\s₪]/g, ''));

/** The debt check's result as a chip: closed to zero = done, otherwise "לברר מול הלקוח" = warning. */
export function DebtCheckChip({ result, months, className }: { result?: string | null; months?: string | string[] | null; className?: string }) {
  if (!result) return <span className={cn('text-xs text-muted-foreground', className)}>בדיקת חוב עוד לא נקבעה</span>;
  const list = (Array.isArray(months) ? months : (months ?? '').split(',')).map((m) => m.trim()).filter(Boolean);
  const closed = result.startsWith('נסגר לאפס');
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} title="בדיקת החוב מול היתרות לפי חודש פירעון">
      <StatusBadge value={result} tone={closed ? 'done' : 'warning'} className="h-5 px-2 text-[11px]" />
      {closed && list.length > 0 && <span className="text-xs text-muted-foreground">{list.map(formatMonth).join(', ')}</span>}
    </span>
  );
}

function initialRows(data: ProposeOutput): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const m of data.months ?? [])
    for (const inv of m.invoices ?? []) {
      const base = Number((data.alreadyAllocated ? inv.current : inv.proposed) ?? 0);
      rows[inv.invoiceNumber] = { on: base > 0, amount: base > 0 ? String(round2(base)) : '' };
    }
  return rows;
}

/** The editor itself, mounted with one ProposeAllocation result: the rows start from the proposal (or the current allocation). */
function EditorBody({ receiptKey, data, onApplied }: { receiptKey: string; data: ProposeOutput; onApplied: () => void }) {
  const scope = useOwnerScope();
  const { executeFunction: apply } = useExecuteAction(ApplyAllocationAction);
  const [rows, setRows] = useState<Record<string, RowState>>(() => initialRows(data));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const months = data.months ?? [];
  const receiptAmount = Number(data.amount ?? 0);
  const invoices = months.flatMap((m) => m.invoices ?? []);
  const picked = invoices.filter((inv) => rows[inv.invoiceNumber]?.on);
  const amountOf = (no: string) => parseAmount(rows[no]?.amount ?? '');
  const total = round2(picked.reduce((s, inv) => s + (Number.isFinite(amountOf(inv.invoiceNumber)) ? amountOf(inv.invoiceNumber) : 0), 0));
  const surplus = round2(receiptAmount - total);

  const rowError = (inv: AllocInvoice): string | null => {
    if (!rows[inv.invoiceNumber]?.on) return null;
    const a = amountOf(inv.invoiceNumber);
    if (!Number.isFinite(a) || a <= 0) return 'סכום חיובי';
    if (a > inv.openBefore + CENT) return `עד ${formatILS(inv.openBefore)}`;
    return null;
  };
  const anyRowError = picked.some((inv) => rowError(inv));
  const over = total > receiptAmount + CENT;
  const canApply = picked.length > 0 && !anyRowError && !over && !saving;

  function toggle(inv: AllocInvoice, on: boolean) {
    setErrors([]);
    setRows((rs) => {
      const cur = rs[inv.invoiceNumber] ?? { on: false, amount: '' };
      if (!on || cur.amount) return { ...rs, [inv.invoiceNumber]: { ...cur, on } };
      // Ticking an empty row fills it with what is left of the receipt, up to the invoice's open balance.
      const left = round2(Math.max(0, Math.min(inv.openBefore, receiptAmount - total)));
      return { ...rs, [inv.invoiceNumber]: { on, amount: left > 0 ? String(left) : '' } };
    });
  }

  function edit(no: string, amount: string) {
    setErrors([]);
    setRows((rs) => ({ ...rs, [no]: { on: rs[no]?.on ?? true, amount } }));
  }

  async function approve() {
    if (!canApply) return;
    setSaving(true);
    setErrors([]);
    try {
      const res = await apply({
        receiptKey,
        allocations: picked.map((inv) => ({ invoiceNumber: inv.invoiceNumber, amount: round2(amountOf(inv.invoiceNumber)) })),
        approvedBy: scope.actorName,
        dryRun: false,
      });
      if (!res?.ok) {
        setErrors(res?.errors?.length ? res.errors : ['הפיזור לא נשמר. שום דבר לא נכתב.']);
        return;
      }
      toast.add({
        title: 'הפיזור נשמר',
        description: `${formatILS(res.allocated ?? total)} פוזרו לחשבוניות${(res.unallocated ?? 0) > CENT ? ` · ${formatILS(res.unallocated)} זכות על חשבון` : ''}.`,
        type: 'success',
      });
      onApplied();
    } catch {
      setErrors(['הפיזור לא הסתיים. שום דבר לא נכתב – אפשר לנסות שוב.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-[13px] p-[21px]">
        {data.alreadyAllocated && (
          <p className="rounded-[16px] bg-glass-card px-[13px] py-2 text-[13px] text-ink-2">הקבלה כבר מפוזרת. הטבלה מציגה את הפיזור הנוכחי, ואישור מחליף אותו.</p>
        )}
        {months.length === 0 || invoices.length === 0 ? (
          <p className="rounded-[16px] bg-glass-card p-[13px] text-[13px] text-muted-foreground">
            אין ללקוח חשבוניות פתוחות. הקבלה נשארת זכות על חשבון, ואין מה לפזר כרגע.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[16px] bg-glass-card">
            <Table className="min-w-[600px] text-[13px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(HEAD, 'w-10 ps-[13px]')}>
                    <span className="sr-only">לפזר</span>
                  </TableHead>
                  <TableHead className={HEAD}>חשבונית</TableHead>
                  <TableHead className={HEAD}>פירעון</TableHead>
                  <TableHead className={HEAD}>פתוח</TableHead>
                  <TableHead className={cn(HEAD, 'pe-[13px]')}>סכום מהקבלה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <MonthRows key={m.dueMonth || 'none'} month={m} rows={rows} rowError={rowError} amountOf={amountOf} onToggle={toggle} onEdit={edit} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {errors.length > 0 && (
          <Alert variant="destructive">
            <XCircleIcon />
            <AlertTitle>הפיזור לא נשמר – שום דבר לא נכתב</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-0.5 ps-4">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-glass-edge bg-glass-strong p-[21px] backdrop-blur-xl">
        <dl className="flex flex-wrap items-baseline gap-x-[21px] gap-y-1" aria-live="polite">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">פוזר</dt>
            <dd className={cn('text-base font-bold tabular-nums', over && 'text-destructive')}>
              {formatILS(total)} <span className="text-xs font-medium text-muted-foreground">מתוך {formatILS(receiptAmount)}</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">יישאר זכות על חשבון</dt>
            <dd className="font-bold tabular-nums">{formatILS(Math.max(0, surplus))}</dd>
          </div>
          {over && <span className="text-xs font-semibold text-destructive">הסכום עובר את הקבלה ב-{formatILS(-surplus)}</span>}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-10 rounded-full px-[21px] font-bold shadow-primary" disabled={!canApply} onClick={approve}>
            {saving ? <Spinner data-icon="inline-start" /> : <CheckCheckIcon data-icon="inline-start" />}
            אשר פיזור
          </Button>
          <span className="text-xs text-muted-foreground">לחיצה אחת שומרת את הפיזור. שום דבר לא נכתב ל-Priority.</span>
        </div>
      </div>
    </>
  );
}

function MonthRows({
  month,
  rows,
  rowError,
  amountOf,
  onToggle,
  onEdit,
}: {
  month: AllocMonth;
  rows: Record<string, RowState>;
  rowError: (inv: AllocInvoice) => string | null;
  amountOf: (no: string) => number;
  onToggle: (inv: AllocInvoice, on: boolean) => void;
  onEdit: (no: string, amount: string) => void;
}) {
  const closed = !!month.closedByDebtCheck;
  return (
    <>
      <TableRow className={cn('hover:bg-transparent', closed ? 'bg-primary/[0.07]' : 'bg-glass-inner')}>
        <TableCell colSpan={5} className="px-[13px] py-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold">{month.monthLabel || formatMonth(month.dueMonth)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">פתוח {formatILS(month.openTotal ?? 0)}</span>
            {closed && <StatusBadge value="נסגר בבדיקת החוב" tone="info" className="h-5 px-2 text-[11px]" />}
          </span>
        </TableCell>
      </TableRow>
      {(month.invoices ?? []).map((inv) => {
        const r = rows[inv.invoiceNumber] ?? { on: false, amount: '' };
        const a = amountOf(inv.invoiceNumber);
        const error = rowError(inv);
        const partial = r.on && !error && a < inv.openBefore - CENT;
        const others = (inv.otherReceipts ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0);
        const id = `alloc-${inv.invoiceNumber}`;
        return (
          <TableRow key={inv.invoiceNumber} className={cn('align-top hover:bg-glass-faint', closed && 'bg-primary/[0.03]', r.on && 'bg-primary/[0.06]')}>
            <TableCell className="ps-[13px] py-2">
              <Checkbox id={`${id}-on`} checked={r.on} onCheckedChange={(v) => onToggle(inv, !!v)} aria-label={`לפזר לחשבונית ${inv.invoiceNumber}`} />
            </TableCell>
            <TableCell className="py-2">
              <span className="flex flex-col items-start gap-0.5">
                <InvoiceNumberLink invoiceNumber={inv.invoiceNumber} allocatedAmount={r.on && !error ? a : null} />
                {inv.invoiceAmount != null && Math.abs(inv.invoiceAmount - inv.openBefore) > CENT && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">מקור {formatILS(inv.invoiceAmount)}</span>
                )}
              </span>
            </TableCell>
            <TableCell className="py-2 whitespace-nowrap tabular-nums">{formatDate(inv.dueDate)}</TableCell>
            <TableCell className="py-2">
              <span className="flex flex-col">
                <span className="font-semibold tabular-nums">{formatILS(inv.openBefore)}</span>
                {others > CENT && (
                  <span className="text-[11px] text-muted-foreground tabular-nums" title={(inv.otherReceipts ?? []).map((o) => `${o.receiptKey}: ${formatILS(o.amount)}`).join('\n')}>
                    {formatILS(others)} בקבלות אחרות
                  </span>
                )}
              </span>
            </TableCell>
            <TableCell className="pe-[13px] py-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  id={`${id}-amount`}
                  inputMode="decimal"
                  dir="ltr"
                  value={r.amount}
                  disabled={!r.on}
                  onChange={(e) => onEdit(inv.invoiceNumber, e.target.value)}
                  aria-label={`הסכום לחשבונית ${inv.invoiceNumber}`}
                  aria-invalid={error ? true : undefined}
                  className="h-8 w-28 bg-glass-strong text-end tabular-nums"
                />
                {partial && <StatusBadge value="חלקית" className="h-5 px-2 text-[11px]" />}
              </div>
              {error && <span className="text-xs font-semibold text-destructive">{error}</span>}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

/** Loads the proposal (always dryRun) each time the editor opens, and mounts the editor on it. */
function EditorLoader({ receiptKey, onApplied }: { receiptKey: string; onApplied: () => void }) {
  const { executeFunction } = useExecuteAction(ProposeAllocationAction);
  const q = useActionQuery(executeFunction, { receiptKey, dryRun: true });
  const data = q.data as ProposeOutput | undefined;

  const failed = q.isError || (data && data.ok === false);
  if (q.isLoading) return <LoadingRows rows={5} />;
  if (failed || !data)
    return (
      <div className="p-[21px]">
        <Alert variant="destructive">
          <XCircleIcon />
          <AlertTitle>לא הצלחנו לטעון את החשבוניות הפתוחות</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            {data?.errors?.length ? (
              <ul className="flex list-disc flex-col gap-0.5 ps-4">
                {data.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : (
              'ההצעה לפיזור לא נטענה.'
            )}
            <Button variant="outline" size="sm" onClick={q.refresh}>
              <RotateCwIcon data-icon="inline-start" />
              נסו שוב
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-[21px] pt-[13px]">
        <DebtCheckChip result={data.debtCheckResult} months={data.closedMonths} />
        <span className="text-xs text-muted-foreground" title="רמת הביטחון של הפיזור המוצע, 0–100">
          ביטחון הפיזור <span className="font-semibold text-ink-2 tabular-nums">{formatNumber(data.allocationConfidence ?? 0)}</span>
        </span>
        {data.matchStatus && <StatusBadge value={data.matchStatus} className="h-5 px-2 text-[11px]" />}
      </div>
      <EditorBody key={JSON.stringify(data.months ?? [])} receiptKey={receiptKey} data={data} onApplied={onApplied} />
    </>
  );
}

/**
 * Plan 04.11 part B stage 6 — the allocation editor (Design 01 §2ד). A side sheet over one approved receipt: the
 * customer's open invoices grouped by due month (months the debt check closed are highlighted), each with its open
 * balance (the most this receipt can take), a tick and an amount — prefilled from the current allocation when the
 * receipt is already allocated, else from the proposal; a partial amount is marked. A running total and the credit
 * left on account. "אשר פיזור" sends ApplyAllocation in one click; its refusal lists the reasons and writes nothing.
 */
export function AllocationEditor({
  receiptKey,
  title,
  open,
  onOpenChange,
  onApplied,
}: {
  receiptKey: string;
  /** e.g. the customer and the receipt amount. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="glass-menu flex w-full flex-col gap-0 overflow-y-auto p-0 data-[side=left]:sm:max-w-[720px]">
        <SheetHeader className="border-b border-glass-edge p-[21px] pe-12">
          <SheetTitle className="text-lg font-bold">פיזור לחשבוניות</SheetTitle>
          <SheetDescription>
            {title} · <span dir="ltr">{receiptKey}</span>
          </SheetDescription>
        </SheetHeader>
        {open && (
          <EditorLoader
            receiptKey={receiptKey}
            onApplied={() => {
              onOpenChange(false);
              onApplied?.();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}