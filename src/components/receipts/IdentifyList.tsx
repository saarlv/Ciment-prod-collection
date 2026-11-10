import { useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { Link } from 'react-router';
import { getRouteUrl } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AlertCircleIcon, CheckCheckIcon, CheckIcon, MailIcon, MailWarningIcon, PanelLeftOpenIcon, RefreshCwIcon, ScanSearchIcon, XIcon } from 'lucide-react';
import { CustomerLink } from '@/components/CustomerLink';
import { StatusBadge } from '@/components/StatusBadge';
import { useCustomerLabels } from '@/components/inbox/CustomerPicker';
import { AllocationSummary } from '@/components/receipts/AllocationSummary';
import { ReceiptPdfButton } from '@/components/receipts/ReceiptPdfButton';
import { ReceiptStatusBadges } from '@/components/receipts/ReceiptStatusBadges';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDate, formatILS, formatNumber, formatTime } from '@/utils/Format';
import { WAITING, certainLines, outboxHref, pickerOptions } from '@/utils/ReceiptsIdentify';
import type { IssueResult, LineIdentity } from '@/utils/ReceiptsIdentify';

const HEAD = 'text-xs font-semibold text-muted-foreground';

/** The confidence: a calm number and a thin bar, with a tick where "certain" starts. */
export function Confidence({ value, certainAt }: { value: number; certainAt: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-flex items-center gap-2" title={`ודאי מ-${formatNumber(certainAt)}`}>
      <span className="w-7 text-end font-semibold tabular-nums">{formatNumber(v)}</span>
      <span
        aria-hidden
        className="relative h-1.5 w-14 overflow-hidden rounded-full bg-glass-inner"
        style={{ '--conf': `${v}%`, '--certain': `${Math.min(99, certainAt)}%` } as CSSProperties}
      >
        <span className="absolute inset-y-0 start-0 w-(--conf) rounded-full bg-ink-2/55" />
        <span className="absolute inset-y-0 start-(--certain) w-px bg-link" />
      </span>
    </span>
  );
}

/** The customer of an uncertain / unidentified line: its candidates first, then every customer. */
export function LinePicker({ row, value, onChange }: { row: LineIdentity; value: string | null; onChange: (code: string | null) => void }) {
  const { codes, label } = useCustomerLabels();
  const options = pickerOptions(row);
  const conf = new Map(options.map((c) => [c.customerCode, c.confidence]));
  const first = options.map((c) => c.customerCode);
  const items = [...first, ...codes.filter((c) => !conf.has(c))];
  const text = (code: string) => {
    const base = label.get(code) ?? `${options.find((o) => o.customerCode === code)?.customerName ?? code} · ${code}`;
    return conf.has(code) ? `${base} · ${formatNumber(conf.get(code))}` : base;
  };
  return (
    <Combobox items={items} value={value} onValueChange={(v) => onChange((v as string | null) || null)} itemToStringLabel={(code) => text(code as string)}>
      <ComboboxInput aria-label={`לקוח לשורה של ${row.line.payerName || 'מעביר לא ידוע'}`} placeholder="בחירת לקוח…" showClear={!!value} className="w-60 bg-glass-card" />
      <ComboboxContent>
        <ComboboxEmpty>לא נמצא לקוח.</ComboboxEmpty>
        <ComboboxList>
          {(code: string) => (
            <ComboboxItem key={code} value={code}>
              <span className={cn(conf.has(code) && 'font-semibold')}>{text(code)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** After approval: the receipt pair, its PDF, the mail draft (or the missing contact), then the debt check and the allocation. */
function IssuedCell({ row, approvalId, busy, onRetry, onAllocated }: { row: LineIdentity; approvalId?: string; busy: boolean; onRetry: () => void; onAllocated?: () => void }) {
  const r = row.receipt;
  const send = r?.sendStatus ?? '';
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <ReceiptStatusBadges receipt={r} size="sm" />
        {r?.receiptKey && <ReceiptPdfButton receiptKey={r.receiptKey} label={`${row.customerName ?? ''} · ${formatILS(row.line.amount)} · ${formatDate(row.line.valueDate)}`} />}
      </span>
      {send === 'חסר איש קשר' ? (
        <Link
          to={getRouteUrl('collections/customers/:code', { code: row.customerCode ?? '' })}
          className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink hover:underline"
        >
          <MailWarningIcon className="size-3.5" />
          חסר איש קשר הנהלת חשבונות
        </Link>
      ) : send === 'טיוטה – בדיקה' ? (
        <Link to={outboxHref(approvalId)} className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
          <MailIcon className="size-3.5" />
          טיוטה ל-<span dir="ltr">{r?.sentToEmail}</span> – ממתינה לאישור בדואר יוצא
        </Link>
      ) : send === 'נשלחה' ? (
        <span className="text-xs text-muted-foreground">
          נשלחה ל-<span dir="ltr">{r?.sentToEmail}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          המייל לא הוכן
          <Button variant="ghost" size="xs" className="rounded-full bg-glass-soft" disabled={busy} onClick={onRetry}>
            {busy ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
            הכנה שוב
          </Button>
        </span>
      )}
      {r?.receiptKey && <AllocationSummary receipt={r} onChanged={onAllocated} className="mt-0.5" />}
    </div>
  );
}

/**
 * A click on the row itself opens the record; clicks on its own controls (buttons, links, the picker) stay theirs, and
 * so do clicks inside a dialog or sheet a cell opened (portaled, but React still bubbles them to the row).
 */
export const fromControl = (e: MouseEvent<HTMLElement>) =>
  !e.currentTarget.contains(e.target as Node) || !!(e.target as HTMLElement).closest('button, a, input, label, [role="combobox"], [role="listbox"]');

function IdentifyRow({
  row,
  certainAt,
  highlighted,
  approvalId,
  busy,
  onApprove,
  onIdentify,
  onOpen,
  onAllocated,
}: {
  row: LineIdentity;
  certainAt: number;
  highlighted: boolean;
  approvalId?: string;
  busy: boolean;
  onApprove: (customerCode: string | null) => void;
  onIdentify: () => void;
  onOpen: () => void;
  onAllocated?: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(row.customerCode ?? pickerOptions(row)[0]?.customerCode ?? null);
  const l = row.line;
  const open = row.state === 'לא ודאי' || row.state === 'לא זוהה';
  const waiting = row.state === WAITING;
  return (
    <TableRow
      data-line={row.bankLineId}
      aria-current={highlighted ? 'true' : undefined}
      onClick={(e) => {
        if (!fromControl(e)) onOpen();
      }}
      className={cn('cursor-pointer align-top hover:bg-glass-faint', highlighted && 'bg-glass-inner hover:bg-glass-inner')}
    >
      <TableCell className="max-w-56 ps-[21px] py-2.5">
        <button
          type="button"
          onClick={onOpen}
          title="פתיחת הרשומה"
          className="flex max-w-full cursor-pointer items-center gap-1 rounded-[6px] text-start font-semibold outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">{l.payerName || '—'}</span>
          <PanelLeftOpenIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        {l.reference && l.reference !== l.payerName && (
          <span dir="auto" className="block truncate text-xs text-muted-foreground" title={l.reference}>
            {l.reference}
          </span>
        )}
      </TableCell>
      <TableCell className="py-2.5 font-semibold whitespace-nowrap tabular-nums">{formatILS(l.amount)}</TableCell>
      <TableCell className="py-2.5 whitespace-nowrap tabular-nums">{formatDate(l.valueDate)}</TableCell>
      <TableCell className="py-2 whitespace-normal">
        {open ? (
          <LinePicker row={row} value={picked} onChange={setPicked} />
        ) : waiting ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <CustomerLink code={row.customerCode} name={row.customerName} className="text-[13px]" />
        )}
      </TableCell>
      <TableCell className="py-2.5">{row.state === 'לא זוהה' || waiting ? <span className="text-muted-foreground">—</span> : <Confidence value={row.confidence} certainAt={certainAt} />}</TableCell>
      <TableCell className="max-w-64 py-2.5 whitespace-normal">
        {row.method && <span className="text-xs font-semibold text-ink-2">{row.method}</span>}
        {row.evidence && <span className="line-clamp-2 text-xs text-muted-foreground" title={row.evidence}>{row.evidence}</span>}
        {!row.method && !row.evidence && <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="pe-[21px] py-2 whitespace-normal">
        {row.state === 'אושר' ? (
          <IssuedCell row={row} approvalId={approvalId} busy={busy} onRetry={() => onApprove(row.customerCode)} onAllocated={onAllocated} />
        ) : (
          <div className="flex flex-col items-start gap-1.5">
            <StatusBadge value={row.status} className="h-5 px-2 text-[11px]" />
            {waiting ? (
              <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={onIdentify}>
                {busy ? <Spinner data-icon="inline-start" /> : <ScanSearchIcon data-icon="inline-start" />}
                זהה
              </Button>
            ) : open ? (
              <Button variant="outline" size="sm" className="rounded-full" disabled={busy || !picked} onClick={() => onApprove(picked)}>
                {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                אשר לקוח והוצא קבלה
              </Button>
            ) : (
              <Button variant="ghost" size="xs" className="rounded-full bg-glass-soft" disabled={busy} onClick={() => onApprove(row.customerCode)}>
                {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                אשר
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

/** IssueReceipt's skipped lines and errors, said plainly. */
function IssueOutcome({ result, payerOf, onDismiss }: { result: IssueResult; payerOf: (id?: string) => string; onDismiss: () => void }) {
  const skipped = result.skipped ?? [];
  const errors = result.errors ?? [];
  if (!skipped.length && !errors.length) return null;
  return (
    <Alert variant={errors.length ? 'destructive' : 'default'}>
      <AlertCircleIcon />
      <AlertTitle className="flex items-center justify-between gap-2">
        {errors.length ? 'חלק מהקבלות לא הוצאו' : `${formatNumber(skipped.length)} שורות לא אושרו`}
        <Button variant="ghost" size="icon-xs" aria-label="סגירה" onClick={onDismiss}>
          <XIcon />
        </Button>
      </AlertTitle>
      <AlertDescription>
        <ul className="flex list-disc flex-col gap-0.5 ps-4">
          {skipped.map((s, i) => (
            <li key={`s${i}`}>
              <span className="font-semibold">{payerOf(s.bankLineId)}</span>: {s.reason || 'לא אושרה'}
            </li>
          ))}
          {errors.map((e, i) => (
            <li key={`e${i}`}>{e}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The identification list (08.11 flow, its first step): every one of today's העברה / זיכוי בנק lines, a line no run
 * has reached shown as "ממתינה לזיהוי" with "זהה". Clicking a row opens its record panel (ReceiptFlowPanel). The header strip ("השורות הגיעו ב-HH:MM · N שורות · M ודאיות", the screen's one primary
 * button "אשר את כל הוודאיים (M)" behind a confirm with the count and total, and "זהה מחדש"), then one table of the
 * day's lines — ממתינה לזיהוי, לא זוהה and לא ודאי first, then ודאי, then approved — each with its proposed customer,
 * confidence, method and evidence; open lines get a customer picker and "אשר לקוח והוצא קבלה".
 */
export function IdentifySection({
  rows,
  certainAt,
  arrivedAt,
  highlight,
  approvalIds,
  issuing,
  reidentifying,
  lastIssue,
  identifyNote,
  onApproveAll,
  onApproveOne,
  onIdentifyOne,
  onOpen,
  onReidentify,
  onDismissIssue,
  onAllocated,
}: {
  rows: LineIdentity[];
  certainAt: number;
  arrivedAt: string | null;
  highlight: string | null;
  approvalIds: Map<string, string>;
  issuing: string[];
  reidentifying: boolean;
  lastIssue: IssueResult | null;
  identifyNote: string | null;
  onApproveAll: (bankLineIds: string[]) => void;
  onApproveOne: (bankLineId: string, customerCode: string | null) => void;
  /** "זהה" on a line no identification has reached yet. */
  onIdentifyOne: (bankLineId: string) => void;
  /** Opens the line's record panel. */
  onOpen: (bankLineId: string) => void;
  onReidentify: () => void;
  onDismissIssue: () => void;
  /** After ApplyAllocation saved a receipt's allocation. */
  onAllocated?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const certain = certainLines(rows);
  const total = certain.reduce((s, r) => s + (r.line.amount ?? 0), 0);
  const busyAll = certain.some((r) => issuing.includes(r.bankLineId));
  const open = rows.filter((r) => r.state === 'לא ודאי' || r.state === 'לא זוהה').length;
  const waiting = rows.filter((r) => r.state === WAITING).length;
  const payerOf = (id?: string) => rows.find((r) => r.bankLineId === id)?.line.payerName || id || 'שורה';

  return (
    <section aria-label="זיהוי לקוחות" className="glass flex min-w-0 flex-col gap-[13px] overflow-hidden rounded-[26px] border">
      <div className="flex flex-wrap items-center gap-[13px] px-[21px] pt-[21px]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-glass-inner">
          <ScanSearchIcon className="size-5 text-ink-2" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col" aria-live="polite">
          <h2 className="text-lg font-bold">
            {arrivedAt ? (
              <>
                השורות הגיעו ב-<span className="tabular-nums">{formatTime(arrivedAt)}</span> ·{' '}
              </>
            ) : null}
            <span className="tabular-nums">{formatNumber(rows.length)}</span> שורות · <span className="tabular-nums">{formatNumber(certain.length)}</span> ודאיות
          </h2>
          <span className="text-[13px] text-muted-foreground">
            {waiting > 0 ? `${formatNumber(waiting)} ממתינות לזיהוי. ` : ''}
            {open > 0 ? `${formatNumber(open)} מחכות לבחירת לקוח. ` : ''}ודאי = ביטחון {formatNumber(certainAt)} ומעלה. האישור מוציא את הקבלה ומכין מייל להנהלת החשבונות של הלקוח.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" className="h-10 rounded-full bg-glass-soft px-[18px]" disabled={reidentifying} onClick={onReidentify}>
            {reidentifying ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
            זהה מחדש
          </Button>
          <Button className="h-10 rounded-full px-[18px] font-semibold shadow-primary" disabled={certain.length === 0 || busyAll} onClick={() => setConfirming(true)}>
            {busyAll ? <Spinner data-icon="inline-start" /> : <CheckCheckIcon data-icon="inline-start" />}
            אשר את כל הוודאיים ({formatNumber(certain.length)})
          </Button>
        </div>
      </div>

      {(identifyNote || lastIssue) && (
        <div className="flex flex-col gap-2 px-[21px]">
          {identifyNote && (
            <p className="text-sm text-ink-2" role="status">
              {identifyNote}
            </p>
          )}
          {lastIssue && <IssueOutcome result={lastIssue} payerOf={payerOf} onDismiss={onDismissIssue} />}
        </div>
      )}

      <div className="overflow-x-auto pb-[8px]">
        <Table className="min-w-[1040px] text-[13px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, 'ps-[21px]')}>מעביר</TableHead>
              <TableHead className={HEAD}>סכום</TableHead>
              <TableHead className={HEAD}>ערך</TableHead>
              <TableHead className={HEAD}>לקוח מוצע</TableHead>
              <TableHead className={HEAD}>ביטחון</TableHead>
              <TableHead className={HEAD}>שיטה וראיה</TableHead>
              <TableHead className={cn(HEAD, 'pe-[21px]')}>מצב</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <IdentifyRow
                key={`${r.bankLineId}:${r.state}:${r.customerCode ?? ''}`}
                row={r}
                certainAt={certainAt}
                highlighted={r.bankLineId === highlight}
                approvalId={r.receipt?.receiptKey ? approvalIds.get(r.receipt.receiptKey) : undefined}
                busy={issuing.includes(r.bankLineId)}
                onApprove={(code) => onApproveOne(r.bankLineId, code)}
                onIdentify={() => onIdentifyOne(r.bankLineId)}
                onOpen={() => onOpen(r.bankLineId)}
                onAllocated={onAllocated}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              לאשר {formatNumber(certain.length)} קבלות בסך {formatILS(total)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              כל שורה ודאית מאושרת ללקוח שזוהה: הקבלה יוצאת, ה-PDF מופק ונכתבת טיוטת מייל לאיש הקשר בהנהלת החשבונות של הלקוח (אדם מאשר אותה לפני שליחה). אי אפשר לבטל אישור.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                onApproveAll(certain.map((r) => r.bankLineId));
              }}
            >
              אישור והוצאת {formatNumber(certain.length)} קבלות
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}