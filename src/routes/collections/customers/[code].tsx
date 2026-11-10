import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import {
  ArrowRightIcon,
  ArrowUpLeftIcon,
  HandCoinsIcon,
  MessageSquarePlusIcon,
  MessageSquareTextIcon,
  PlusIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { CustomerNotesEntity, CustomersEntity, GetCustomer360Action, PaymentsEntity } from '@/product-types';
import { CustomerDailySummary } from '@/components/customer/CustomerDailySummary';
import { CustomerDetailsTab, CustomerFinanceTab } from '@/components/customer/CustomerPriorityDetails';
import { CustomerFeed } from '@/components/customer/CustomerFeed';
import { TamarCardChat } from '@/components/customer/TamarCardChat';
import { MonthNotesPopover } from '@/components/aging/MonthNotesPopover';
import type { NotesTarget } from '@/components/aging/MonthNotesPopover';
import { CreditExposureTab } from '@/components/credit/CreditExposureTab';
import { CustomerClosedInvoices } from '@/components/CustomerClosedInvoices';
import { CustomerOpenInvoices } from '@/components/CustomerOpenInvoices';
import { WAITING_FOR_OPEN_MOVEMENTS } from '@/hooks/useHasOpenMovements';
import { isInvoiceOpen, openAmountKnownOf } from '@/utils/InvoiceSubStatus';
import { CustomerAllDocuments } from '@/components/CustomerAllDocuments';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge, statusToneClass } from '@/components/StatusBadge';
import { useActionQuery } from '@/hooks/useActionQuery';
import { useNinaActivity } from '@/hooks/useNinaActivity';
import { useNinaFocus } from '@/hooks/useNinaFocus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ACTIVE_STATUS, PROMISE, commitmentProgress } from '@/utils/AgingMonths';
import { isCustomer360 } from '@/utils/CollectionsTypes';
import type { Customer360, Customer360Month, FeedRow } from '@/utils/CollectionsTypes';
import { CREDIT_TAB, formatPct1 } from '@/utils/CreditExposure';
import { EMPTY, formatDate, formatILS, formatMoney, formatMonth, round2, todayISO } from '@/utils/Format';

const OPEN_TAB = 'open';
const PAYMENTS_TAB = 'payments';
const CLOSED_TAB = 'closed';
const DETAILS_TAB = 'details';
const FINANCE_TAB = 'finance';

function Kpi({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('glass flex min-w-[min(100%,180px)] flex-1 flex-col gap-1.5 rounded-[22px] border p-[13px] px-[21px]', className)}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('glass glass-lift flex flex-col overflow-hidden rounded-[26px] border', className)}>
      <h2 className="p-[21px] pb-[13px] text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

type CardNote = FeedRow<typeof CustomerNotesEntity>;

/**
 * Re-reads the card when one of this customer's notes is written or changes elsewhere — the floating notes window,
 * Tamar recording one from her chat bubble, a colleague on another screen, or the commitments check setting an outcome.
 * The customer's notes are watched live; a change in any of them refreshes.
 */
function useRefreshOnNoteChanges(code: string, refresh: () => void) {
  const notes = useEntityGetAll(CustomerNotesEntity, { where: { column: 'customerCode', value: code }, page: { size: 500 } });
  const latest = notes.isLoading
    ? null
    : (notes.data ?? [])
        .map((n) => [n.id, n.status, n.outcome, n.amountReceived, n.amountRemaining, n.dueMonth, n.actionDate, n.reminderDate, n.amount, n.noteText].join('~'))
        .sort()
        .join('|');
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (latest === null) return;
    if (seen.current !== null && seen.current !== latest) refresh();
    seen.current = latest;
  }, [latest, refresh]);
}

type Outcome = 'קוימה' | 'קוימה חלקית' | 'לא קוימה' | 'פתוחה';

const COMMITMENT_CELLS: { outcome: Outcome; label: string }[] = [
  { outcome: 'קוימה', label: 'קוימו' },
  { outcome: 'קוימה חלקית', label: 'קוימה חלקית' },
  { outcome: 'לא קוימה', label: 'לא קוימו' },
  { outcome: 'פתוחה', label: 'פתוחות' },
];

const outcomeOf = (n: CardNote): Outcome => (n.outcome as Outcome | undefined) || 'פתוחה';

/**
 * The customer's commitments (notes of type התחייבות לתשלום) by outcome, with what came in and what is left. A commitment
 * still פתוחה counts only while the note is active (one closed before its check — its month reached 0 or closed by hand —
 * was never judged); an open one has nothing in yet and its promised amount (else the month's balance at writing) left.
 */
function countCommitments(notes: CardNote[]) {
  const out = new Map<Outcome, { count: number; received: number; remaining: number }>(COMMITMENT_CELLS.map((c) => [c.outcome, { count: 0, received: 0, remaining: 0 }]));
  for (const n of notes) {
    if (n.noteType !== PROMISE) continue;
    const o = outcomeOf(n);
    if (o === 'פתוחה' && n.status !== ACTIVE_STATUS) continue;
    const cell = out.get(o)!;
    cell.count += 1;
    cell.received = round2(cell.received + (n.amountReceived ?? 0));
    cell.remaining = round2(cell.remaining + (n.amountRemaining ?? (o === 'פתוחה' ? (n.amount ?? n.balanceAtNote ?? 0) : 0)));
  }
  return out;
}

/** "התחייבויות": a status-toned chip per outcome (קוימו / קוימה חלקית / לא קוימו / פתוחות), each with what came in and what is left. */
function CommitmentsStrip({ notes }: { notes: CardNote[] }) {
  const counts = countCommitments(notes);
  const total = COMMITMENT_CELLS.reduce((n, c) => n + counts.get(c.outcome)!.count, 0);
  return (
    <section aria-label="ההתחייבויות של הלקוח" className="glass flex flex-wrap items-center gap-x-[21px] gap-y-2 rounded-[22px] border px-[21px] py-[13px]">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <HandCoinsIcon className="size-4" />
        התחייבויות
      </span>
      {total === 0 ? (
        <span className="text-[13px] text-muted-foreground">אין עדיין התחייבויות ללקוח</span>
      ) : (
        <dl className="flex flex-wrap items-center gap-x-[21px] gap-y-2">
          {COMMITMENT_CELLS.map((c) => {
            const cell = counts.get(c.outcome)!;
            return (
              <div key={c.outcome} className="flex items-center gap-2">
                <div
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px]',
                    cell.count > 0 ? statusToneClass(c.outcome) : 'bg-glass-faint text-muted-foreground',
                  )}
                >
                  <dt>{c.label}</dt>
                  <dd className="font-extrabold tabular-nums">{cell.count}</dd>
                </div>
                {cell.count > 0 && (
                  <dd className="text-xs text-muted-foreground tabular-nums">
                    נכנס {formatILS(cell.received)} · נשאר {formatILS(cell.remaining)}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

/** The card's months table: each open due month (OpenMovements) with its movements, balance and active notes, and "הערה". */
function OpenMonthsPanel({ months, onOpenNotes }: { months: Customer360Month[]; onOpenNotes: (dueMonth: string, anchor: HTMLElement) => void }) {
  const head = 'h-9 text-xs font-semibold text-muted-foreground';
  return (
    <Panel title="חודשים פתוחים">
      {months.length === 0 ? (
        <p className="px-[21px] pb-[21px] text-sm text-muted-foreground">אין ללקוח תנועות פתוחות בפריוריטי.</p>
      ) : (
        <div className="overflow-x-auto pb-[13px]">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(head, 'ps-[21px]')}>חודש פירעון</TableHead>
                <TableHead className={head}>תנועות</TableHead>
                <TableHead className={head}>יתרה פתוחה</TableHead>
                <TableHead className={head}>הערות פעילות</TableHead>
                <TableHead className={cn(head, 'pe-[21px]')}>
                  <span className="sr-only">הערה</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => {
                const key = m.dueMonth ?? '';
                return (
                  <TableRow key={key} className="hover:bg-glass-faint">
                    <TableCell className="ps-[21px] font-semibold text-ink-2">{formatMonth(key)}</TableCell>
                    <TableCell className="tabular-nums">{m.movementCount ?? 0}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatILS(m.openTotal ?? 0)}</TableCell>
                    <TableCell>
                      {(m.activeNotes ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 tabular-nums">
                          <MessageSquareTextIcon className="size-3.5" />
                          {m.activeNotes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pe-[21px] text-end">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={(e) => onOpenNotes(key, e.currentTarget)}
                        aria-label={`הערות ל${formatMonth(key)}`}
                        className="rounded-full bg-glass-soft text-link"
                      >
                        <MessageSquarePlusIcon data-icon="inline-start" />
                        הערה
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

/** The summary's headline from the commitments: the latest one checked, else the open one, else none. */
function commitmentHeadline(notes: CardNote[], fallback: string): string {
  const commitments = notes.filter((n) => n.noteType === PROMISE);
  const lastChecked = commitments.filter((n) => n.checkedAt).sort((a, b) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''))[0];
  const open = commitments
    .filter((n) => n.status === ACTIVE_STATUS && outcomeOf(n) === 'פתוחה')
    .sort((a, b) => (a.actionDate ?? '').localeCompare(b.actionDate ?? ''))[0];
  const what = (n: CardNote) => `${typeof n.amount === 'number' ? ` של ${formatILS(n.amount)}` : ''} ל־${formatDate(n.actionDate)} (${formatMonth(n.dueMonth)})`;
  if (open) return `יש התחייבות פתוחה${what(open)}. היא תיבדק ביום שאחרי המועד, אחרי בדיקת דף הבנק.`;
  if (lastChecked) {
    const progress = commitmentProgress(lastChecked, formatILS);
    return `ההתחייבות${what(lastChecked)} נבדקה: ${outcomeOf(lastChecked)}${progress ? `, ${progress}` : ''}.`;
  }
  return `אין ללקוח התחייבויות פתוחות. ${fallback}`;
}

/** The פתוחות / סגורות tabs while no invoice of the customer has an open amount from Priority. */
function WaitingForOpenMovements() {
  return (
    <div className="flex flex-col gap-1 px-[21px] pb-[21px] text-sm text-muted-foreground">
      <p className="font-semibold text-ink-2">{WAITING_FOR_OPEN_MOVEMENTS}</p>
      <p>עד שיגיעו, אי אפשר לדעת אילו חשבוניות פתוחות ואילו נסגרו. כל המסמכים מופיעים בלשונית כל המסמכים.</p>
    </div>
  );
}

/** קבלות: every Priority receipt line of the customer (Payments mirror), newest first; reversals struck through. */
function CustomerPayments({ customerCode }: { customerCode: string }) {
  const q = useEntityGetAll(PaymentsEntity, {
    where: { column: 'customerCode', value: customerCode },
    orderBy: [{ column: 'paymentDate', direction: 'desc' }],
    page: { size: 1000 },
  });
  const head = 'h-9 text-xs font-semibold text-muted-foreground';
  if (q.isError) return <div className="px-[21px] pb-[21px]"><LoadError what="הקבלות" /></div>;
  if (q.isLoading) return <div className="px-[21px] pb-[21px]"><LoadingRows rows={4} /></div>;
  const rows = [...(q.data ?? [])].sort((a, b) => (b.receiptDate ?? b.paymentDate ?? '').localeCompare(a.receiptDate ?? a.paymentDate ?? ''));
  if (rows.length === 0) return <p className="px-[21px] pb-[21px] text-sm text-muted-foreground">אין קבלות ללקוח מפריוריטי.</p>;
  return (
    <div className="overflow-x-auto pb-[13px]">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, 'ps-[21px]')}>מס׳ קבלה</TableHead>
            <TableHead className={head}>תאריך</TableHead>
            <TableHead className={head}>אמצעי / סוג</TableHead>
            <TableHead className={head}>סכום</TableHead>
            <TableHead className={head}>מס׳ צ׳ק</TableHead>
            <TableHead className={head}>בנק / סניף</TableHead>
            <TableHead className={head}>פירעון</TableHead>
            <TableHead className={cn(head, 'pe-[21px]')}>סטטוס קבלה</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const bank = [p.bankName || p.bankCode, p.branch].filter(Boolean).join(' / ');
            return (
              <TableRow key={p.id} className={cn('hover:bg-glass-faint', p.isReversal && 'text-muted-foreground line-through')}>
                <TableCell className="ps-[21px] font-semibold" dir="ltr">{p.receiptNumber || EMPTY}</TableCell>
                <TableCell className="tabular-nums">{formatDate(p.receiptDate ?? p.paymentDate)}</TableCell>
                <TableCell>{p.paymentType || p.method || EMPTY}</TableCell>
                <TableCell className="font-semibold tabular-nums">{formatMoney(p.lineTotal ?? p.amount, p.currency)}</TableCell>
                <TableCell className="tabular-nums" dir="ltr">{p.chequeNumber || EMPTY}</TableCell>
                <TableCell>{bank || EMPTY}</TableCell>
                <TableCell className="tabular-nums">{formatDate(p.checkDueDate)}</TableCell>
                <TableCell className="pe-[21px]">{p.receiptStatus || EMPTY}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CustomerBody({ code }: { code: string }) {
  const cardQ = useEntityGetAll(CustomersEntity, { where: { column: 'customerCode', value: code } });
  const card = cardQ.data?.[0];
  const nina = useNinaActivity();
  const { executeFunction } = useExecuteAction(GetCustomer360Action);
  const q = useActionQuery(executeFunction, { customerCode: code, asOfDate: todayISO() }, { cache: 'customer360', validate: isCustomer360 });
  const data = q.data as (Customer360 & { error?: string }) | undefined;
  useNinaFocus(code, data?.customer?.customerName);
  useRefreshOnNoteChanges(code, q.refresh);
  const [notesTarget, setNotesTarget] = useState<NotesTarget | null>(null);
  // The card's tabs follow ?tab= (none = כל המסמכים / open / closed / credit), so היום's alerts open אובליגו directly. An old ?tab=receipts opens סגורות.
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tabsRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);
  const deepLinkedCredit = useRef(tabParam === CREDIT_TAB);
  const ready = !q.isLoading && !!data?.customer;
  useEffect(() => {
    if (!ready || scrolled.current || !deepLinkedCredit.current) return;
    scrolled.current = true;
    tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [ready]);
  function setTab(value: string, scroll = false) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === ALL_DOCS_TAB) next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true },
    );
    if (scroll) tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  if (q.isLoading)
    return (
      <>
        <Skeleton className="h-10 w-72" />
        <div className="flex flex-wrap gap-[13px]">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 min-w-[180px] flex-1 rounded-[22px]" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-[30px]" />
        <LoadingRows rows={6} />
      </>
    );
  if (q.isError)
    return (
      <>
        <Link to="/collections/customers" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRightIcon className="size-4" />
          כל הלקוחות
        </Link>
        <LoadError what="כרטיס הלקוח" />
      </>
    );
  const c = data?.customer;
  if (!c?.customerCode) return <Navigate to="/collections/customers" replace />;

  const kpis = data?.kpis ?? {};
  const insured = !!data?.insured;
  const tab = tabParam === CLOSED_TAB || tabParam === 'receipts' ? CLOSED_TAB : tabParam === CREDIT_TAB ? CREDIT_TAB : tabParam === PAYMENTS_TAB ? PAYMENTS_TAB : tabParam === OPEN_TAB ? OPEN_TAB : tabParam === DETAILS_TAB ? DETAILS_TAB : tabParam === FINANCE_TAB ? FINANCE_TAB : ALL_DOCS_TAB;
  const balance = kpis.openBalance ?? 0;
  const notes = data?.customerNotes ?? [];
  const openMonths = data?.openMonths ?? [];
  const contacts = data?.contacts ?? [];
  const receipts = data?.receipts ?? [];
  // פתוחות orders the open ones by severity score (CustomerOpenInvoices); סגורות lists the closed ones with their receipts.
  // Only invoices with an open amount from Priority can be called open or closed; the rest wait for open movements.
  const invoices = (data?.invoices ?? []).filter(openAmountKnownOf);
  const hasOpenData = invoices.length > 0;
  const openCount = invoices.filter(isInvoiceOpen).length;
  const closedCount = invoices.length - openCount;
  const balanceKnown = hasOpenData && kpis.openBalance !== null && kpis.openBalance !== undefined;
  const financeSummary = [
    { label: 'יתרה פתוחה', value: balanceKnown ? formatILS(balance) : WAITING_FOR_OPEN_MOVEMENTS },
    { label: 'מתוכה בפיגור', value: formatILS(kpis.overdue) },
    { label: 'חודשים פתוחים', value: String(openMonths.length) },
    { label: 'חשבוניות פתוחות', value: hasOpenData ? String(openCount) : '—' },
    { label: 'מסגרת אשראי', value: formatILS(c.creditLimit) },
    { label: 'ניצול ביטוח', value: kpis.insuranceUsePct === null || kpis.insuranceUsePct === undefined ? '—' : formatPct1(kpis.insuranceUsePct) },
    { label: 'תשלום אחרון', value: formatDate(kpis.lastPaymentDate) },
    { label: 'אמצעי תשלום', value: c.paymentMethod || '—' },
    { label: 'הערה לגבייה', value: c.collectionNote || '—' },
  ];
  const headline = commitmentHeadline(notes, nina.bankReady ? 'התקבולים שלו ממשיכים להיבדק מול שורות הבנק.' : `${nina.waitingFor} כדי לבדוק תקבולים.`);
  const openNotes = (dueMonth: string | null, anchor: HTMLElement) =>
    setNotesTarget({
      customerCode: c.customerCode ?? code,
      customerName: c.customerName,
      dueMonth,
      months: openMonths.filter((m) => !!m.dueMonth).map((m) => ({ key: m.dueMonth ?? '', balance: m.openTotal ?? 0 })),
      anchor,
    });

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/collections/customers" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRightIcon className="size-4" />
          כל הלקוחות
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.015em] md:text-[36px]">{c.customerName}</h1>
          <span className="text-sm text-muted-foreground">{c.customerCode}</span>
          <StatusBadge value={c.collectionStage} />
          <StatusBadge value={c.priorityStatus} />
          {c.doNotContact && <StatusBadge value="לא ליצור קשר" tone="critical" />}
          {q.isRefreshing && (
            <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-glass-soft px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Spinner className="size-3" />
              מתעדכן…
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {balanceKnown && <span className="me-1.5 font-bold text-foreground tabular-nums">יתרה {formatILS(balance)} ·</span>}
          {c.customerType ?? '—'} · תשלום אחרון {formatDate(kpis.lastPaymentDate)}
        </p>
      </div>

      <CustomerDailySummary code={c.customerCode}>
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <HandCoinsIcon className="mt-0.5 size-4 shrink-0" />
          <span>{headline}</span>
        </p>
        <Button onClick={(e) => openNotes(null, e.currentTarget)} className="h-11 self-start rounded-full px-[21px] font-bold shadow-primary">
          <PlusIcon data-icon="inline-start" />
          הוספת הערה
        </Button>
      </CustomerDailySummary>

      <div className="flex flex-wrap gap-[13px]">
        <Kpi label="יתרה">
          <span className="text-[26px] leading-tight font-extrabold tabular-nums">{balanceKnown ? formatILS(balance) : '—'}</span>
          {!balanceKnown ? (
            <span className="text-xs text-muted-foreground">{WAITING_FOR_OPEN_MOVEMENTS}</span>
          ) : balance < 0 ? (
            <Badge variant="outline" className="h-6 self-start rounded-full border-transparent bg-primary/12 text-link">
              יתרת זכות
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">מתוכה בפיגור {kpis.overdue === null || kpis.overdue === undefined ? '—' : formatILS(kpis.overdue)}</span>
          )}
          {(kpis.paidSeenPending ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">אחרי {formatILS(kpis.paidSeenPending)} שראינו בבנק ועוד לא ב-Priority</span>
          )}
        </Kpi>
        <Kpi label="מסגרת אשראי">
          <span className="text-base font-bold tabular-nums">{formatILS(c.creditLimit)}</span>
          <span className="text-xs text-muted-foreground">כמו ב-Priority</span>
        </Kpi>
        {insured && (
          <Kpi label="ביטוח אשראי">
            <span className="text-base font-bold tabular-nums">
              {kpis.insuranceUsePct === null || kpis.insuranceUsePct === undefined ? 'אין מכסה בתוקף' : `ניצול ${formatPct1(kpis.insuranceUsePct)}`}
            </span>
            <button
              type="button"
              onClick={() => setTab(CREDIT_TAB, true)}
              className="inline-flex items-center gap-1 self-start text-xs font-semibold text-link hover:underline"
            >
              אובליגו וביטוח
              <ArrowUpLeftIcon className="size-3.5" />
            </button>
          </Kpi>
        )}
        <Kpi label="אחראית">
          <span className="text-base font-bold">{data?.bookkeeperName ?? '—'}</span>
        </Kpi>
        <Kpi label="סוכן">
          <span className="text-base font-bold">
            {c.salesAgentName ?? '—'}
            {card?.salesAgentCode && <span className="ms-1.5 text-xs font-normal text-muted-foreground">קוד {card.salesAgentCode}</span>}
          </span>
          {c.salesAgentPhone && (
            <a href={`tel:${c.salesAgentPhone}`} dir="ltr" className="text-xs text-link hover:underline">
              {c.salesAgentPhone}
            </a>
          )}
        </Kpi>
      </div>

      <CommitmentsStrip notes={notes} />

      <OpenMonthsPanel months={openMonths} onOpenNotes={(m, anchor) => openNotes(m, anchor)} />

      <CustomerFeed data={data ?? {}} />

      <section ref={tabsRef} aria-label="חשבוניות ואובליגו" className="glass glass-lift flex scroll-mt-[90px] flex-col overflow-hidden rounded-[26px] border">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <div className="flex flex-wrap items-center justify-between gap-[13px] p-[21px] pb-[13px]">
            <TabsList className="h-auto gap-0.5 rounded-[22px] bg-glass-soft p-1 group-data-horizontal/tabs:h-auto">
              <TabsTrigger value={OPEN_TAB} className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
                {hasOpenData ? `פתוחות (${openCount})` : 'פתוחות'}
              </TabsTrigger>
              <TabsTrigger value={CLOSED_TAB} className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
                {hasOpenData ? `סגורות (${closedCount})` : 'סגורות'}
              </TabsTrigger>
              <TabsTrigger value={CREDIT_TAB} className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
                {insured && <ShieldCheckIcon data-icon="inline-start" />}
                אובליגו
              </TabsTrigger>
              <TabsTrigger value={PAYMENTS_TAB} className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
                קבלות
              </TabsTrigger>
              <TabsTrigger value={ALL_DOCS_TAB} className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
                כל המסמכים
              </TabsTrigger>
              <TabsTrigger value={DETAILS_TAB} className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
                פרטי לקוח
              </TabsTrigger>
              <TabsTrigger value={FINANCE_TAB} className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
                פיננסי
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={OPEN_TAB}>
            {hasOpenData ? <CustomerOpenInvoices customerCode={c.customerCode} invoices={invoices} /> : <WaitingForOpenMovements />}
          </TabsContent>
          <TabsContent value={CLOSED_TAB}>
            {hasOpenData ? <CustomerClosedInvoices customerCode={c.customerCode} invoices={invoices} receipts={receipts} /> : <WaitingForOpenMovements />}
          </TabsContent>
          <TabsContent value={CREDIT_TAB}>
            <CreditExposureTab code={c.customerCode} />
          </TabsContent>
          <TabsContent value={PAYMENTS_TAB}>
            <CustomerPayments customerCode={c.customerCode} />
          </TabsContent>
          <TabsContent value={DETAILS_TAB}>
            <CustomerDetailsTab code={c.customerCode} mirror={card} contacts={contacts} internalNotes={c.internalNotes} />
          </TabsContent>
          <TabsContent value={FINANCE_TAB}>
            <CustomerFinanceTab code={c.customerCode} mirror={card} summary={financeSummary} />
          </TabsContent>
          <TabsContent value={ALL_DOCS_TAB}>
            <CustomerAllDocuments customerCode={c.customerCode} />
          </TabsContent>
        </Tabs>
      </section>

      <MonthNotesPopover target={notesTarget} onClose={() => setNotesTarget(null)} />
      <TamarCardChat customerCode={c.customerCode} customerName={c.customerName} />
    </>
  );
}

const ALL_DOCS_TAB = 'documents';

export default function CustomerPage() {
  const { code } = useParams();
  if (!code) return <Navigate to="/collections/customers" replace />;
  return <CustomerBody key={code} code={code} />;
}