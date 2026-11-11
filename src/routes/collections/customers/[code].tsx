import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import {
  ArrowRightIcon,
  HandCoinsIcon,
  MessageSquarePlusIcon,
  MessageSquareTextIcon,
  PlusIcon,
} from 'lucide-react';
import { CustomerNotesEntity, CustomersEntity, GetCustomer360Action, PaymentsEntity } from '@/product-types';
import { CustomerDailySummary } from '@/components/customer/CustomerDailySummary';
import { CustomerDetailsTab, CustomerFinanceTab } from '@/components/customer/CustomerPriorityDetails';
import { CustomerFeed } from '@/components/customer/CustomerFeed';
import { TamarCardChat } from '@/components/customer/TamarCardChat';
import { MonthNotesPopover } from '@/components/aging/MonthNotesPopover';
import type { NotesTarget } from '@/components/aging/MonthNotesPopover';
import type { DocsFilter } from '@/components/CustomerAllDocuments';
import { CreditExposureTab } from '@/components/credit/CreditExposureTab';
import { CustomerClosedInvoices } from '@/components/CustomerClosedInvoices';
import { CustomerOpenInvoices } from '@/components/CustomerOpenInvoices';
import { WAITING_FOR_OPEN_MOVEMENTS } from '@/hooks/useHasOpenMovements';
import { openAmountKnownOf } from '@/utils/InvoiceSubStatus';
import { CustomerAllDocuments } from '@/components/CustomerAllDocuments';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge, statusToneClass } from '@/components/StatusBadge';
import { useActionQuery } from '@/hooks/useActionQuery';
import { useNinaActivity } from '@/hooks/useNinaActivity';
import { useNinaFocus } from '@/hooks/useNinaFocus';
import { useAsOfDate } from '@/hooks/useAsOfDate';
import { useCustomerOpenMovements } from '@/hooks/useCustomerOpenMovements';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ACTIVE_STATUS, PROMISE, commitmentProgress } from '@/utils/AgingMonths';
import { isCustomer360 } from '@/utils/CollectionsTypes';
import type { Customer360, Customer360Month, FeedRow } from '@/utils/CollectionsTypes';
import { CREDIT_TAB } from '@/utils/CreditExposure';
import { EMPTY, daysPastDue, formatDate, formatILS, formatMoney, formatMonth, formatNumber, round2, todayISO } from '@/utils/Format';

const DETAILS_TAB = 'details';
const FINANCE_TAB = 'finance';
const COLLECTION_TAB = 'collection';
const TRIGGER = 'min-h-[38px] flex-none rounded-[19px] px-5 text-[15px] text-ink-2 data-active:font-bold';
const PILL = 'h-8 rounded-[16px] px-3 text-[13px] font-semibold aria-pressed:bg-glass-strong aria-pressed:text-link aria-pressed:shadow-glass-pill';
const DOC_FILTERS: { value: DocsFilter; label: string }[] = [
  { value: 'open', label: 'פתוחות' },
  { value: 'closed', label: 'סגורות' },
  { value: 'all', label: 'הכל' },
];

/** Old ?tab= values (before the two primary tabs) → the tab and documents filter that now hold them. */
function resolveTab(param: string | null): { tab: string; filter: DocsFilter } {
  if (param === FINANCE_TAB || param === CREDIT_TAB || param === 'payments' || param === 'documents') return { tab: FINANCE_TAB, filter: 'open' };
  if (param === 'open') return { tab: FINANCE_TAB, filter: 'open' };
  if (param === 'closed' || param === 'receipts') return { tab: FINANCE_TAB, filter: 'closed' };
  if (param === COLLECTION_TAB) return { tab: COLLECTION_TAB, filter: 'open' };
  return { tab: DETAILS_TAB, filter: 'open' };
}

function Kpi({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('glass flex min-w-[min(100%,180px)] flex-1 flex-col gap-1.5 rounded-[22px] border p-[13px] px-[21px]', className)}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Panel({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section aria-label={title} className={cn('glass glass-lift flex flex-col overflow-hidden rounded-[26px] border', className)}>
      <div className="flex flex-wrap items-center justify-between gap-[13px] p-[21px] pb-[13px]">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
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
      <p>עד שיגיעו, אי אפשר לדעת אילו חשבוניות פתוחות ואילו נסגרו. כל המסמכים מופיעים בלשונית פיננסי.</p>
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

type CustomerRow = (typeof CustomersEntity)['instanceType'];

/** "זכות על חשבון – קבלות שלא הותאמו": receipts left open on the customer's ledger. Hidden when there are none. */
function OnAccountReceipts({ customerCode }: { customerCode: string }) {
  const q = useCustomerOpenMovements(customerCode);
  const rows = (q.data ?? []).filter((m) => m.docType === 'קבלה');
  if (q.isError) return <LoadError what="הקבלות שלא הותאמו" />;
  if (q.isLoading || rows.length === 0) return null;
  const head = 'h-9 text-xs font-semibold text-muted-foreground';
  return (
    <Panel title="זכות על חשבון – קבלות שלא הותאמו">
      <p className="-mt-1 px-[21px] pb-[13px] text-[13px] text-muted-foreground">קבלות שעוד לא הותאמו לחשבוניות בפריוריטי. הן מקטינות את החוב הפעיל.</p>
      <div className="overflow-x-auto pb-[13px]">
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(head, 'ps-[21px]')}>קבלה</TableHead>
              <TableHead className={head}>תאריך</TableHead>
              <TableHead className={head}>פירעון</TableHead>
              <TableHead className={cn(head, 'pe-[21px]')}>סכום</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id} className="hover:bg-glass-faint">
                <TableCell className="ps-[21px] font-semibold tabular-nums" dir="ltr">{m.docNumber || EMPTY}</TableCell>
                <TableCell className="tabular-nums">{formatDate(m.docDate)}</TableCell>
                <TableCell className="tabular-nums">{formatDate(m.dueDate)}</TableCell>
                <TableCell className="pe-[21px] font-semibold tabular-nums">{formatILS(m.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

/** The finance tab: ledger KPIs from the Customers row, on-account receipts, the documents (paged), receipts, terms, credit. */
function FinanceTab({ card, deepLinkedCredit, initialFilter }: { card: CustomerRow; deepLinkedCredit: boolean; initialFilter: DocsFilter }) {
  const code = card.customerCode ?? '';
  const asOf = useAsOfDate();
  const [docsFilter, setDocsFilter] = useState<DocsFilter>(initialFilter);
  const ledgerRead = !!card.movementsSyncedAt;
  const known = (v?: number | null) => (ledgerRead && v !== null && v !== undefined ? formatILS(v) : EMPTY);
  const oldestLate = ledgerRead ? daysPastDue(card.oldestDueDate, asOf) : null;
  const waiting = <span className="text-xs text-muted-foreground">{WAITING_FOR_OPEN_MOVEMENTS}</span>;
  const scrolled = useRef(false);
  useEffect(() => {
    if (!deepLinkedCredit || scrolled.current) return;
    scrolled.current = true;
    document.getElementById('credit')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [deepLinkedCredit]);
  return (
    <>
      <div className="flex flex-wrap gap-[13px]">
        <Kpi label="חוב פעיל">
          <span className="text-[26px] leading-tight font-extrabold tabular-nums">{known(card.openBalance)}</span>
          {ledgerRead ? <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(card.openMovementCount ?? 0)} תנועות פתוחות בפריוריטי</span> : waiting}
        </Kpi>
        <Kpi label="בפיגור">
          <span className={cn('text-[26px] leading-tight font-extrabold tabular-nums', ledgerRead && (card.overdueAmount ?? 0) > 0 && 'text-critical-ink')}>{known(card.overdueAmount)}</span>
          {ledgerRead ? <span className="text-xs text-muted-foreground tabular-nums">נכון ל־{formatDate(asOf)}</span> : waiting}
        </Kpi>
        <Kpi label="זכות על חשבון">
          <span className="text-[26px] leading-tight font-extrabold tabular-nums">{ledgerRead && card.onAccountCredit != null ? formatILS(Math.abs(card.onAccountCredit)) : EMPTY}</span>
          {ledgerRead ? <span className="text-xs text-muted-foreground">קבלות שלא הותאמו</span> : waiting}
        </Kpi>
        <Kpi label="פירעון הכי ישן">
          <span className="text-[26px] leading-tight font-extrabold tabular-nums">{ledgerRead ? formatDate(card.oldestDueDate) : EMPTY}</span>
          {!ledgerRead ? waiting : oldestLate ? <span className="text-xs font-semibold text-critical-ink tabular-nums">{formatNumber(oldestLate)} ימי פיגור</span> : null}
        </Kpi>
        <Kpi label="אובליגו / מסגרת אשראי">
          <span className="text-base font-bold tabular-nums">{formatILS(card.creditLimit)}</span>
          {typeof card.obligoLimit === 'number' && <span className="text-xs text-muted-foreground tabular-nums">מסגרת אובליגו {formatILS(card.obligoLimit)}</span>}
        </Kpi>
        <Kpi label="תנאי תשלום">
          <span className="text-base font-bold">{card.paymentTermsLabel || card.paymentMethod || EMPTY}</span>
          <span className="text-xs text-muted-foreground">תשלום אחרון {formatDate(card.lastPaymentDate)}</span>
        </Kpi>
      </div>

      {ledgerRead && <OnAccountReceipts customerCode={code} />}

      <Panel
        title="חשבוניות ומסמכים"
        action={
          <ToggleGroup
            aria-label="סינון מסמכים"
            value={[docsFilter]}
            onValueChange={(v) => v[0] && setDocsFilter(v[0] as DocsFilter)}
            className="gap-0.5 rounded-[20px] bg-glass-card p-1"
          >
            {DOC_FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className={PILL}>
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      >
        <div className="overflow-x-auto">
          <CustomerAllDocuments key={docsFilter} customerCode={code} filter={docsFilter} ledgerRead={ledgerRead} />
        </div>
      </Panel>

      <Panel title="קבלות">
        <CustomerPayments customerCode={code} />
      </Panel>

      <Panel title="תנאים, אשראי ובנק">
        <CustomerFinanceTab code={code} mirror={card} />
      </Panel>

      <Panel title="אובליגו וביטוח" className="scroll-mt-[90px]">
        <div id="credit" className="scroll-mt-[90px]">
          <CreditExposureTab code={code} />
        </div>
      </Panel>
    </>
  );
}

/** גבייה ופעילות: the only tab that runs GetCustomer360 (notes, months, invoices by urgency, closed + receipts, feed). */
function CollectionTab({ card }: { card: CustomerRow }) {
  const code = card.customerCode ?? '';
  const nina = useNinaActivity();
  const { executeFunction } = useExecuteAction(GetCustomer360Action);
  const q = useActionQuery(executeFunction, { customerCode: code, asOfDate: todayISO() }, { cache: 'customer360', validate: isCustomer360 });
  const data = q.data as (Customer360 & { error?: string }) | undefined;
  useRefreshOnNoteChanges(code, q.refresh);
  const [notesTarget, setNotesTarget] = useState<NotesTarget | null>(null);

  if (q.isLoading)
    return (
      <>
        <Skeleton className="h-40 w-full rounded-[30px]" />
        <LoadingRows rows={6} />
      </>
    );
  if (q.isError || !data) return <LoadError what="נתוני הגבייה של הלקוח" />;

  const notes = data.customerNotes ?? [];
  const openMonths = data.openMonths ?? [];
  const receipts = data.receipts ?? [];
  const invoices = (data.invoices ?? []).filter(openAmountKnownOf);
  const hasOpenData = invoices.length > 0;
  const headline = commitmentHeadline(notes, nina.bankReady ? 'התקבולים שלו ממשיכים להיבדק מול שורות הבנק.' : `${nina.waitingFor} כדי לבדוק תקבולים.`);
  const openNotes = (dueMonth: string | null, anchor: HTMLElement) =>
    setNotesTarget({
      customerCode: code,
      customerName: card.customerName,
      dueMonth,
      months: openMonths.filter((m) => !!m.dueMonth).map((m) => ({ key: m.dueMonth ?? '', balance: m.openTotal ?? 0 })),
      anchor,
    });

  return (
    <>
      {q.isRefreshing && (
        <span role="status" className="inline-flex items-center gap-1.5 self-start rounded-full bg-glass-soft px-3 py-1 text-xs font-semibold text-muted-foreground">
          <Spinner className="size-3" />
          מתעדכן…
        </span>
      )}
      <CustomerDailySummary code={code}>
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <HandCoinsIcon className="mt-0.5 size-4 shrink-0" />
          <span>{headline}</span>
        </p>
        <Button onClick={(e) => openNotes(null, e.currentTarget)} className="h-11 self-start rounded-full px-[21px] font-bold shadow-primary">
          <PlusIcon data-icon="inline-start" />
          הוספת הערה
        </Button>
      </CustomerDailySummary>
      <CommitmentsStrip notes={notes} />
      <OpenMonthsPanel months={openMonths} onOpenNotes={(m, anchor) => openNotes(m, anchor)} />
      <Panel title="חשבוניות פתוחות לפי דחיפות">
        {hasOpenData ? <CustomerOpenInvoices customerCode={code} invoices={invoices} /> : <WaitingForOpenMovements />}
      </Panel>
      <Panel title="חשבוניות שנסגרו והקבלות שסגרו אותן">
        {hasOpenData ? <CustomerClosedInvoices customerCode={code} invoices={invoices} receipts={receipts} /> : <WaitingForOpenMovements />}
      </Panel>
      <CustomerFeed data={data} />
      <MonthNotesPopover target={notesTarget} onClose={() => setNotesTarget(null)} />
    </>
  );
}

function CustomerBody({ code }: { code: string }) {
  // Header and KPIs come from this one Customers row; each tab loads its own data only when opened.
  const cardQ = useEntityGetAll(CustomersEntity, { where: { column: 'customerCode', value: code }, page: { size: 1 } });
  const card = cardQ.data?.[0];
  const scope = useOwnerScope();
  useNinaFocus(code, card?.customerName);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const resolved = resolveTab(tabParam);
  const tabsRef = useRef<HTMLElement>(null);
  const [deepLinkedCredit] = useState(tabParam === CREDIT_TAB);
  function setTab(value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === DETAILS_TAB) next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  }

  if (cardQ.isLoading)
    return (
      <>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-40 w-full rounded-[30px]" />
      </>
    );
  if (cardQ.isError)
    return (
      <>
        <Link to="/collections/customers" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRightIcon className="size-4" />
          כל הלקוחות
        </Link>
        <LoadError what="כרטיס הלקוח" />
      </>
    );
  if (!card?.customerCode) return <Navigate to="/collections/customers" replace />;

  const ledgerRead = !!card.movementsSyncedAt;
  const debtText = ledgerRead && card.openBalance != null ? formatILS(card.openBalance) : EMPTY;
  const tab = resolved.tab;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/collections/customers" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRightIcon className="size-4" />
          כל הלקוחות
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.015em] md:text-[34px]">{card.customerName}</h1>
          <span className="text-sm text-muted-foreground">{card.customerCode}</span>
          <StatusBadge value={card.collectionStage} />
          <StatusBadge value={card.priorityStatus} />
          {card.doNotContact && <StatusBadge value="לא ליצור קשר" tone="critical" />}
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <span className="font-bold text-foreground tabular-nums">חוב פעיל {debtText}</span>
          {ledgerRead ? (
            <span className="tabular-nums">· {formatNumber(card.openMovementCount ?? 0)} תנועות פתוחות</span>
          ) : (
            <span>· {WAITING_FOR_OPEN_MOVEMENTS}</span>
          )}
          <span>· אחראית {scope.ownerOf(card.customerCode, card.assignedBookkeeperName) || EMPTY}</span>
          <span>· סוכן {card.salesAgentName || EMPTY}</span>
          {card.salesAgentPhone && (
            <a href={`tel:${card.salesAgentPhone}`} dir="ltr" className="text-link hover:underline">
              {card.salesAgentPhone}
            </a>
          )}
        </p>
      </div>

      <section ref={tabsRef} aria-label="כרטיס לקוח" className="flex scroll-mt-[90px] flex-col gap-[21px]">
        {/* Base UI unmounts closed panels, so each tab's reads start only when it is opened. */}
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-[21px]">
          <TabsList className="h-auto gap-0.5 self-start rounded-[24px] bg-glass-soft p-1 group-data-horizontal/tabs:h-auto">
            <TabsTrigger value={DETAILS_TAB} className={TRIGGER}>
              פרטי לקוח
            </TabsTrigger>
            <TabsTrigger value={FINANCE_TAB} className={TRIGGER}>
              פיננסי
            </TabsTrigger>
            <TabsTrigger value={COLLECTION_TAB} className={TRIGGER}>
              גבייה ופעילות
            </TabsTrigger>
          </TabsList>

          <TabsContent value={DETAILS_TAB} className="glass glass-lift flex flex-col overflow-hidden rounded-[26px] border pt-[21px]">
            <CustomerDetailsTab code={card.customerCode} mirror={card} internalNotes={card.internalNotes} />
          </TabsContent>

          <TabsContent value={FINANCE_TAB} className="flex flex-col gap-[21px]">
            <FinanceTab card={card} deepLinkedCredit={deepLinkedCredit} initialFilter={resolved.filter} />
          </TabsContent>

          <TabsContent value={COLLECTION_TAB} className="flex flex-col gap-[21px]">
            <CollectionTab card={card} />
          </TabsContent>
        </Tabs>
      </section>

      <TamarCardChat customerCode={card.customerCode} customerName={card.customerName} />
    </>
  );
}

export default function CustomerPage() {
  const { code } = useParams();
  if (!code) return <Navigate to="/collections/customers" replace />;
  return <CustomerBody key={code} code={code} />;
}