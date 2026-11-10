import type { CSSProperties, ReactNode } from 'react';
import { MailIcon, PhoneIcon, TriangleAlertIcon } from 'lucide-react';
import { CustomerLink } from '@/components/CustomerLink';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { cellAt } from '@/utils/AgingPanel';
import type { AgingColumns, Bucket } from '@/utils/AgingPanel';
import type { AgingContact, AgingCustomer, AgingTotals } from '@/utils/CollectionsTypes';
import { formatILS } from '@/utils/Format';

/** The zone tracks: לקוח | תנאי גבייה | אנשי קשר | balances. The panel never gets narrower than its periods. */
const TEMPLATE: Record<string, string> = {
  '11': 'grid-cols-[minmax(170px,1.25fr)_minmax(170px,1.6fr)_minmax(150px,1.2fr)_minmax(calc(var(--aging-cols)*112px),2.6fr)]',
  '10': 'grid-cols-[minmax(170px,1.25fr)_minmax(170px,1.6fr)_minmax(calc(var(--aging-cols)*112px),2.6fr)]',
  '01': 'grid-cols-[minmax(170px,1.25fr)_minmax(150px,1.2fr)_minmax(calc(var(--aging-cols)*112px),2.6fr)]',
  '00': 'grid-cols-[minmax(170px,1.25fr)_minmax(calc(var(--aging-cols)*112px),2.6fr)]',
};
const LEAD_SPAN = ['col-span-1', 'col-span-2', 'col-span-3'];

/** A signed amount for display: credits read "−₪…" at the same weight. */
function money(v?: number | null) {
  if (v === undefined || v === null) return formatILS(v);
  return v < 0 ? (
    <span dir="ltr" className="inline-block">
      −{formatILS(-v)}
    </span>
  ) : (
    formatILS(v)
  );
}

/** The monogram letter: the first letter of the name after "– " when there is one ("בדיקה – מגדלי השרון" → מ). */
function monogram(name?: string | null) {
  const n = (name ?? '').trim();
  const i = n.lastIndexOf('– ');
  return (i >= 0 ? n.slice(i + 2) : n).trim().charAt(0) || '?';
}

function StatusDot({ value }: { value: string }) {
  const tone = value === 'פעיל' ? 'ok' : value === 'חסום' ? 'critical' : 'warning';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] font-semibold',
        tone === 'ok' && 'text-ag-ok',
        tone === 'critical' && 'text-critical-ink',
        tone === 'warning' && 'text-warning-ink',
      )}
    >
      <span
        aria-hidden
        className={cn('size-[7px] rounded-full', tone === 'ok' && 'bg-ag-ok-dot', tone === 'critical' && 'bg-critical-ink', tone === 'warning' && 'bg-warning')}
      />
      {value}
    </span>
  );
}

/** The two small diamonds before each period label (navy + sky). */
function Diamonds() {
  return (
    <span aria-hidden className="inline-flex gap-px">
      <i className="size-[7px] rotate-45 bg-ag-navy" />
      <i className="size-[7px] rotate-45 bg-ag-sky" />
    </span>
  );
}

function Contact({ contact }: { contact?: AgingContact | null }) {
  if (!contact || (!contact.name && !contact.phone && !contact.email)) return <span className="text-[13.5px] text-ag-muted">אין איש קשר</span>;
  return (
    <>
      {contact.name && (
        <span className="truncate text-[14.5px] font-semibold" title={[contact.role, contact.email].filter(Boolean).join(' · ') || undefined}>
          {contact.name}
        </span>
      )}
      {contact.phone ? (
        <a href={`tel:${contact.phone}`} dir="ltr" className="inline-flex items-center gap-1.5 text-[13.5px] text-ag-cobalt hover:text-ag-cobalt-dark hover:underline">
          <PhoneIcon className="size-3.5" />
          {contact.phone}
        </a>
      ) : contact.email ? (
        <a href={`mailto:${contact.email}`} dir="ltr" className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] text-ag-cobalt hover:text-ag-cobalt-dark hover:underline">
          <MailIcon className="size-3.5 shrink-0" />
          <span className="truncate">{contact.email}</span>
        </a>
      ) : null}
    </>
  );
}

/** The mark beside the total when Priority's ledger balance differs from the sum of the open movements. */
function LedgerMark({ customer }: { customer: AgingCustomer }) {
  if (customer.balanceMatches !== false) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={`יתרת הכרטיס בפריוריטי שונה מהסה״כ ב-${formatILS(customer.balanceDiff)}`}
            className="inline-flex h-5 w-fit items-center gap-1 rounded-[4px] bg-critical-soft px-1.5 text-[11.5px] font-semibold text-critical-ink outline-none focus-visible:ring-2 focus-visible:ring-ag-cobalt"
          />
        }
      >
        <TriangleAlertIcon className="size-3" />
        <span dir="ltr">{(customer.balanceDiff ?? 0) > 0 ? '+' : '−'}{formatILS(Math.abs(customer.balanceDiff ?? 0))}</span>
      </TooltipTrigger>
      <TooltipContent>
        יתרת הכרטיס בפריוריטי {formatILS(customer.ledgerBalance)} · סכום התנועות הפתוחות {formatILS(customer.total)}
      </TooltipContent>
    </Tooltip>
  );
}

export function AgingCardsSkeleton() {
  return (
    <div className="flex flex-col gap-[10px]">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[92px] rounded-[8px] bg-ag-surface" />
      ))}
    </div>
  );
}

/**
 * The aging report as card rows (Saar's approved reference, 27.10): every customer is one white card in four zones —
 * לקוח · תנאי גבייה · אנשי קשר · a balances panel with one column per period (חוב קודם, the window months, חוב מאוחר)
 * and the customer's total. Each period shows its open total from the movements and, under it, the notes chip that
 * `renderNotes` draws. Wide content scrolls in its own box.
 */
export function AgingCards({
  customers,
  buckets: allBuckets,
  focus,
  totals,
  totalsLabel,
  columns,
  renderNotes,
}: {
  customers: AgingCustomer[];
  buckets: Bucket[];
  focus: string;
  totals?: AgingTotals;
  totalsLabel: string;
  columns: AgingColumns;
  /** The notes chip of one customer + period (null when the notes column is hidden). */
  renderNotes: (customer: AgingCustomer, bucket: Bucket) => ReactNode;
}) {
  const buckets = focus === 'all' ? allBuckets : allBuckets.filter((b) => b.key === focus);
  const people = columns.agent || columns.contact;
  const template = TEMPLATE[`${columns.details ? 1 : 0}${people ? 1 : 0}`];
  const zones = 2 + (columns.details ? 1 : 0) + (people ? 1 : 0);
  const cols = buckets.length + 1;
  const rowFrame = 'grid items-stretch gap-x-[21px] ps-[21px] pe-[10px]';

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div className="flex min-w-[calc(var(--aging-cols)*112px_+_620px)] flex-col gap-[10px] pb-1" style={{ '--aging-cols': cols } as CSSProperties}>
        <div className={cn(rowFrame, template, 'text-[12.5px] font-semibold text-ag-muted')}>
          <span>לקוח</span>
          {columns.details && <span>תנאי גבייה</span>}
          {people && <span>אנשי קשר</span>}
          <div className="flex gap-4 px-4">
            {buckets.map((b) => (
              <span key={b.key} className="flex min-w-0 flex-1 basis-0 items-center gap-[7px] text-[13.5px] font-bold text-ag-ink">
                <Diamonds />
                <span className="truncate">{b.label}</span>
              </span>
            ))}
            <span className="w-[104px] shrink-0 ps-4">סה״כ</span>
          </div>
        </div>

        <ul className="flex flex-col gap-[10px]" aria-label="לקוחות בדוח">
          {customers.map((c) => {
            const code = c.customerCode ?? '';
            return (
              <li
                key={code}
                className={cn(rowFrame, template, 'rounded-[8px] border bg-ag-surface py-[8px]', c.balanceMatches === false ? 'border-critical-ink/35' : 'border-ag-border')}
              >
                <div className="flex min-w-0 items-start gap-3 py-2">
                  <span
                    aria-hidden
                    className="aging-mono-diamond flex size-8 flex-none items-center justify-center rounded-[6px] bg-ag-cobalt-tint text-sm font-extrabold text-ag-cobalt"
                  >
                    {monogram(c.customerName)}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <CustomerLink code={c.customerCode} name={c.customerName} className="text-base leading-tight font-bold text-ag-ink hover:text-ag-cobalt" />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ag-muted">
                      <span dir="ltr" className="font-mono">
                        {code}
                      </span>
                      {columns.details && c.priorityStatus && <StatusDot value={c.priorityStatus} />}
                    </div>
                    {c.creditBalance && (
                      <Badge variant="outline" className="h-5 w-fit rounded-[4px] border-transparent bg-ag-cobalt-tint px-1.5 text-[11.5px] text-ag-cobalt">
                        יתרת זכות
                      </Badge>
                    )}
                  </div>
                </div>

                {columns.details && (
                  <div className="flex min-w-0 flex-col gap-1.5 py-2">
                    {(c.paymentMethod || c.paymentTermsLabel) && (
                      <div className="flex flex-wrap gap-1.5">
                        {[c.paymentMethod, c.paymentTermsLabel].filter(Boolean).map((t) => (
                          <Badge key={t} variant="outline" className="h-auto rounded-[4px] border-transparent bg-ag-page px-2 py-[3px] text-[12.5px] font-normal text-ag-ink-2">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {c.collectionNote && <p className="text-[13.5px] leading-normal text-ag-note">{c.collectionNote}</p>}
                  </div>
                )}

                {people && (
                  <div className="flex min-w-0 flex-col items-start gap-1 py-2">
                    {columns.contact && <Contact contact={c.contact} />}
                    {columns.agent && <span className="text-[12.5px] text-ag-muted">סוכן: {c.salesAgentName || '—'}</span>}
                  </div>
                )}

                <div className="flex min-w-0 gap-4 rounded-[6px] bg-ag-panel px-4 py-3">
                  {buckets.map((b) => {
                    const amount = cellAt(c, b.key)?.amount ?? 0;
                    return (
                      <div key={b.key} className="group/cell flex min-w-0 flex-1 basis-0 flex-col items-start gap-1.5">
                        <span className="flex h-6 items-center text-[17px] leading-6 font-bold whitespace-nowrap text-ag-ink" aria-label={`${b.label}: ${amount === 0 ? 'אין חוב' : formatILS(amount)}`}>
                          {amount === 0 ? <span aria-hidden className="block h-0.5 w-3.5 rounded-full bg-ag-empty" /> : money(amount)}
                        </span>
                        {columns.notes && renderNotes(c, b)}
                      </div>
                    );
                  })}
                  <div className="flex w-[104px] shrink-0 flex-col gap-1 border-s border-ag-border ps-4">
                    <span className="h-6 text-[17px] leading-6 font-extrabold whitespace-nowrap">{money(c.total)}</span>
                    <LedgerMark customer={c} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {totals && (
          <div className={cn(rowFrame, template, 'rounded-[8px] border border-ag-border bg-ag-surface py-[8px]')}>
            <div className={cn('flex items-center py-2 text-sm font-bold', LEAD_SPAN[zones - 2])}>
              {totalsLabel}
              {totals.customers !== undefined && <span className="ms-1.5 font-normal text-ag-muted">· {totals.customers} לקוחות</span>}
            </div>
            <div className="flex min-w-0 items-center gap-4 rounded-[6px] bg-ag-panel px-4 py-2">
              {buckets.map((b) => {
                const amount = b.kind === 'prior' ? totals.priorDebt : b.kind === 'later' ? totals.laterDebt : totals.months?.find((x) => x.monthKey === b.key)?.amount;
                return (
                  <span key={b.key} className="min-w-0 flex-1 basis-0 text-[15px] font-bold whitespace-nowrap">
                    {money(amount)}
                  </span>
                );
              })}
              <span className="w-[104px] shrink-0 border-s border-ag-border ps-4 text-[17px] font-extrabold whitespace-nowrap">{money(totals.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}