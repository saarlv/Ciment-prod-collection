import { useState } from 'react';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { DisputesEntity, InvoicesEntity } from '@/product-types';
import { PaymentStateCell } from '@/components/InvoiceLayer';
import { useInvoiceRowOpener } from '@/components/receipts/InvoicePopup';
import type { ComponentProps } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { useCollectionsSettings } from '@/hooks/useCollectionsSettings';
import { useIsraelToday } from '@/hooks/useIsraelToday';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isIls } from '@/utils/Currency';
import type { Customer360Invoice } from '@/utils/CollectionsTypes';
import { HIDDEN_DOC_STATUSES, formatDate, formatForeignExtra, formatILS, formatMoney, round2 } from '@/utils/Format';
import { Switch } from '@/components/ui/switch';
import { invoiceNumbersOf, invoiceSubStatusOf, isInvoiceOpen } from '@/utils/InvoiceSubStatus';
import type { InvoiceSubStatus } from '@/utils/InvoiceSubStatus';
import { daysOverdueOf, daysUntil, severityLevel, severityScore } from '@/utils/Severity';
import type { SeverityLevel } from '@/utils/Severity';

const HEAD = 'text-xs font-semibold text-muted-foreground';
const COLUMNS = 10;

type SortKey = 'score' | 'due' | 'amount';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'score', label: 'ציון' },
  { value: 'due', label: 'תאריך פירעון' },
  { value: 'amount', label: 'סכום' },
];

interface Row {
  inv: Customer360Invoice;
  /** What is still open: remainingAmount, else openAmount. */
  remaining: number;
  daysOverdue: number;
  /** Days until due (negative = overdue); null without a due date. */
  dueIn: number | null;
  score: number;
  level: SeverityLevel;
  sub: InvoiceSubStatus;
  currencyCode?: string | null;
}

function compare(sort: SortKey) {
  const byDue = (a: Row, b: Row) => (a.inv.dueDate ?? '9999').localeCompare(b.inv.dueDate ?? '9999');
  const byScore = (a: Row, b: Row) => b.score - a.score;
  const byAmount = (a: Row, b: Row) => b.remaining - a.remaining;
  if (sort === 'due') return (a: Row, b: Row) => byDue(a, b) || byScore(a, b);
  if (sort === 'amount') return (a: Row, b: Row) => byAmount(a, b) || byScore(a, b);
  return (a: Row, b: Row) => byScore(a, b) || byDue(a, b);
}

/** שולם: what receipts applied to the invoice; hover or focus lists them. */
function PaidCell({ inv }: { inv: Customer360Invoice }) {
  const paid = inv.paidAmount ?? 0;
  if (paid <= 0) return <>—</>;
  const receipts = inv.paidReceipts ?? [];
  if (receipts.length === 0) return <>{formatILS(paid)}</>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`שולם ${formatILS(paid)}, ${receipts.length === 1 ? 'קבלה אחת' : `${receipts.length} קבלות`}`}
            className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        {formatILS(paid)}
      </TooltipTrigger>
      <TooltipContent className="max-w-80 text-start">
        <ul className="flex flex-col gap-1">
          {receipts.map((r, i) => (
            <li key={`${r.receiptKey ?? r.priorityReceiptNumber ?? r.paymentRef ?? ''}-${i}`} className="flex flex-wrap items-center gap-x-2 tabular-nums">
              <span className="font-semibold">{r.source === 'שלנו' ? r.receiptKey : r.priorityReceiptNumber || r.paymentRef || '—'}</span>
              <span>{formatDate(r.date)}</span>
              <span>{formatILS(r.amount)}</span>
              {r.isEstimate && <span className="font-semibold">הערכה</span>}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/** The cancelled/draft toggle, shared with the customer documents list. */
export function HiddenDocsToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
      הצג מבוטלות וטיוטות
    </label>
  );
}

function InvoiceRow({ row, rowProps }: { row: Row; rowProps: ComponentProps<typeof TableRow> }) {
  const { inv } = row;
  return (
    <TableRow {...rowProps}>
      <TableCell className="ps-[21px] align-top">
        <span className="flex flex-col items-start gap-1">
          <span dir="ltr" className="font-semibold text-link tabular-nums">{inv.invoiceNumber || '—'}</span>
          <StatusBadge value={row.sub} className="h-5" />
          {(inv.receipts ?? []).length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {(inv.receipts ?? []).length === 1 ? 'קבלה אחת' : `${(inv.receipts ?? []).length} קבלות`}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="align-top">{formatDate(inv.invoiceDate)}</TableCell>
      <TableCell className="align-top">
        {formatDate(inv.dueDate)}
        {row.dueIn !== null && row.dueIn >= 0 && (
          <div className="text-[11px] text-muted-foreground tabular-nums">{row.dueIn === 0 ? 'היום' : `בעוד ${row.dueIn} ימים`}</div>
        )}
      </TableCell>
      <TableCell className={cn('align-top tabular-nums', row.daysOverdue > 0 && 'font-semibold text-critical-ink')}>
        {row.daysOverdue > 0 ? row.daysOverdue : '—'}
      </TableCell>
      <TableCell className="align-top">
        <span className="flex flex-col items-start gap-0.5">
          <StatusBadge value={row.level} className="h-5 text-[11px]" />
          <span className="text-[11px] text-muted-foreground tabular-nums">ציון {Math.round(row.score)}</span>
        </span>
      </TableCell>
      <TableCell className="align-top tabular-nums">{formatMoney(inv.amount, row.currencyCode)}</TableCell>
      <TableCell className="align-top tabular-nums">
        <PaidCell inv={inv} />
      </TableCell>
      <TableCell className="align-top font-semibold tabular-nums">{formatMoney(row.remaining, row.currencyCode)}</TableCell>
      <TableCell className="align-top text-xs tabular-nums">{inv.expected ? `${inv.scannedCount ?? 0}/${inv.expected}` : '—'}</TableCell>
      <TableCell className="pe-[21px] align-top">
        <PaymentStateCell inv={inv} />
      </TableCell>
    </TableRow>
  );
}

/**
 * The invoices tab of the customer card: open invoices sorted by the severity score (70% amount / 30% days by default,
 * switchable to due date or amount), each with its sub-status chip and the paid amount in its own column. Shown: the
 * overdue ones and those due within openInvoicesDueWindowDays; the rest fold into one row that opens in place. Notes are
 * written per month (the card's months table), not per invoice. Closed invoices live in the סגורות tab.
 */
export function CustomerOpenInvoices({ customerCode, invoices }: { customerCode: string; invoices: Customer360Invoice[] }) {
  const { today } = useIsraelToday();
  const settings = useCollectionsSettings();
  const [sort, setSort] = useState<SortKey>('score');
  const [showFar, setShowFar] = useState(false);
  const { rowProps, popup } = useInvoiceRowOpener();
  const byCode = { column: 'customerCode', value: customerCode };
  const disputes = useEntityGetAll(DisputesEntity, { where: byCode });
  const [showHidden, setShowHidden] = useState(false);
  // Priority's document status and currency live on the Invoices mirror; joined by invoice number.
  // Only the open invoices' own rows — never the customer's whole document history.
  const openNumbers = invoices.filter(isInvoiceOpen).map((i) => (i.invoiceNumber ?? '').trim()).filter(Boolean);
  const mirror = useEntityGetAll(
    InvoicesEntity,
    { where: { column: 'invoiceNumber', operator: 'in', value: openNumbers }, page: { size: 1000 } },
    { enabled: openNumbers.length > 0 },
  );
  const mirrorByNo = new Map((mirror.data ?? []).map((m) => [(m.invoiceNumber ?? '').trim(), m]));
  const isHidden = (inv: Customer360Invoice) => HIDDEN_DOC_STATUSES.includes(mirrorByNo.get((inv.invoiceNumber ?? '').trim())?.priorityDocStatus ?? '');

  // For invoices whose stored subStatus is not computed yet: what is open on them, by the same precedence as the layer.
  const disputed = new Set(
    (disputes.data ?? []).filter((d) => d.status && d.status !== 'נסגרה').flatMap((d) => invoiceNumbersOf(d.invoiceNumbers)),
  );

  // No open amount from Priority yet: the invoice can be neither open nor closed, so it is left out.
  const unpaid = invoices.filter(isInvoiceOpen);
  const hiddenCount = unpaid.filter(isHidden).length;
  const rows: Row[] = unpaid.filter((inv) => showHidden || !isHidden(inv)).map((inv) => {
    const no = (inv.invoiceNumber ?? '').trim();
    const remaining = inv.remainingAmount ?? inv.openAmount ?? 0;
    // Credits (negative open amount) are never late: days overdue only on a positive open amount.
    const daysOverdue = remaining > 0 ? daysOverdueOf(inv.dueDate, today) : 0;
    const score = severityScore(remaining, daysOverdue, settings.severity);
    return {
      inv,
      remaining,
      daysOverdue,
      dueIn: daysUntil(inv.dueDate, today),
      score,
      level: severityLevel(score, settings.severity),
      sub: invoiceSubStatusOf(inv, { hasOpenDispute: disputed.has(no) }),
      currencyCode: mirrorByNo.get(no)?.currencyCode,
    };
  });
  const open = rows;
  const near = open.filter((r) => r.dueIn === null || r.dueIn <= settings.dueWindowDays).sort(compare(sort));
  const far = open.filter((r) => r.dueIn !== null && r.dueIn > settings.dueWindowDays).sort(compare(sort));
  const farIls = far.filter((r) => isIls(r.currencyCode));
  const farTotal = farIls.reduce((n, r) => n + r.remaining, 0);
  const farExtra = formatForeignExtra(far.map((r) => ({ amount: r.remaining, currencyCode: r.currencyCode })));
  const totalOpen = round2(open.filter((r) => isIls(r.currencyCode)).reduce((n, r) => n + r.remaining, 0));
  const foreignExtra = formatForeignExtra(open.map((r) => ({ amount: r.remaining, currencyCode: r.currencyCode })));

  if (open.length === 0)
    return (
      <div className="flex flex-col gap-2 px-[21px] pb-[21px]">
        <p className="text-sm text-muted-foreground">אין חשבוניות פתוחות ללקוח.</p>
        {hiddenCount > 0 && <HiddenDocsToggle checked={showHidden} onChange={setShowHidden} />}
      </div>
    );

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-[13px] px-[21px] pb-[13px]">
        <span className="text-[13px] text-muted-foreground">
          מוצגות חשבוניות בפיגור ואלה שפירעונן ב־{settings.dueWindowDays} הימים הקרובים.
        </span>
        <dl className="flex flex-wrap items-center gap-x-[21px] text-[13px]">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">פתוח</dt>
            <dd className="font-bold tabular-nums">{formatILS(totalOpen)}</dd>
          </div>
          {foreignExtra && <div className="text-muted-foreground tabular-nums">{foreignExtra}</div>}
          {hiddenCount > 0 && <HiddenDocsToggle checked={showHidden} onChange={setShowHidden} />}
        </dl>
        {open.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">מיון</span>
            <ToggleGroup
              aria-label="מיון החשבוניות הפתוחות"
              value={[sort]}
              onValueChange={(v) => {
                const next = SORTS.find((s) => s.value === v[0]);
                if (next) setSort(next.value);
              }}
              spacing={0}
              className="rounded-[22px] bg-glass-soft p-1"
            >
              {SORTS.map((s) => (
                <ToggleGroupItem
                  key={s.value}
                  value={s.value}
                  className="h-[30px] rounded-[17px] px-3 text-xs text-ink-2 hover:bg-glass-inner aria-pressed:bg-glass-strong aria-pressed:font-semibold aria-pressed:text-link aria-pressed:shadow-glass-pill"
                >
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
      </div>
      <Table className="min-w-[1060px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD, 'ps-[21px]')}>מסמך</TableHead>
            <TableHead className={HEAD}>תאריך</TableHead>
            <TableHead className={HEAD}>פירעון</TableHead>
            <TableHead className={HEAD}>ימי פיגור</TableHead>
            <TableHead className={HEAD}>חומרה</TableHead>
            <TableHead className={HEAD}>סכום</TableHead>
            <TableHead className={HEAD}>שולם</TableHead>
            <TableHead className={HEAD}>פתוח</TableHead>
            <TableHead className={HEAD}>תעודות</TableHead>
            <TableHead className={cn(HEAD, 'pe-[21px]')}>תשלום</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {near.map((r) => (
            <InvoiceRow key={r.inv.invoiceNumber} row={r} rowProps={rowProps(r.inv.invoiceNumber)} />
          ))}
          {far.length > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMNS} className="px-[21px] py-2">
                <button
                  type="button"
                  aria-expanded={showFar}
                  onClick={() => setShowFar((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-glass-soft px-3 py-1.5 text-[13px] font-semibold text-link outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showFar ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                  {showFar
                    ? `הסתרת ${far.length === 1 ? 'החשבונית' : `${far.length} החשבוניות`} שפירעונן רחוק`
                    : `עוד ${far.length === 1 ? 'חשבונית אחת' : `${far.length} חשבוניות`} שפירעונן רחוק (${[farTotal > 0 || !farExtra ? formatILS(farTotal) : '', farExtra].filter(Boolean).join(' · ')})`}
                </button>
              </TableCell>
            </TableRow>
          )}
          {showFar && far.map((r) => <InvoiceRow key={r.inv.invoiceNumber} row={r} rowProps={rowProps(r.inv.invoiceNumber)} />)}
        </TableBody>
      </Table>
      {popup}
    </div>
  );
}