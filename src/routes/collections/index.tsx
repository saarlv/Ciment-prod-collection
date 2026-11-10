import { Link } from 'react-router';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircleIcon,
  ArrowUpLeftIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  CircleXIcon,
  HandCoinsIcon,
  LandmarkIcon,
  NotebookTextIcon,
  RotateCwIcon,
  ScaleIcon,
} from 'lucide-react';
import { GetWeekBriefAction } from '@/product-types';
import type {
  IGetWeekBriefActionOutput,
  IGetWeekBriefActionOutputGetWeekBriefActionOutputDaysItemObject as WeekDay,
  IGetWeekBriefActionOutputGetWeekBriefActionOutputItemsItemObject as WeekItem,
  IGetWeekBriefActionOutputGetWeekBriefActionOutputOverdueNoNoteItemObject as OverdueRow,
} from '@/product-types';
import { AgentAvatar, SystemMark } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { CreditAlertsCard } from '@/components/credit/CreditAlertsCard';
import { PageHeader } from '@/components/PageStates';
import { UrgentTasksCard } from '@/components/tasks/UrgentTasksCard';
import { useActionQuery } from '@/hooks/useActionQuery';
import { useCollectionsAgent } from '@/hooks/useCollectionsAgent';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { WAITING_FOR_OPEN_MOVEMENTS, useHasOpenMovements } from '@/hooks/useHasOpenMovements';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { TONE_CLASS } from '@/utils/AgingPanel';
import type { ChipTone } from '@/utils/AgingPanel';
import { isWeekBrief } from '@/utils/CollectionsTypes';
import { formatDate, formatDayLabel, formatDayMonth, formatILS, formatNumber, formatTime, israelDateOf } from '@/utils/Format';

type Brief = IGetWeekBriefActionOutput;

const AGING = '/collections/aging';
const RECEIPTS = '/collections/receipts';

/** The aging report focused on one customer (the aging page reads ?customer= into its customer filter). */
const agingUrl = (code?: string | null) => (code ? `${AGING}?customer=${encodeURIComponent(code)}` : AGING);

/** The kinds of a week item, in the note-type colours: פירעון neutral, הבטחה blue, שולם green, בירור amber, הופרה red. */
const KIND: Record<string, { tone: ChipTone; icon: LucideIcon }> = {
  פירעון: { tone: 'none', icon: CalendarClockIcon },
  'הבטחת תשלום': { tone: 'info', icon: HandCoinsIcon },
  'שולם לטענת הלקוח': { tone: 'done', icon: CircleCheckIcon },
  בירור: { tone: 'warning', icon: ScaleIcon },
  'הבטחה שהופרה': { tone: 'critical', icon: CircleXIcon },
};

function KindChip({ kind }: { kind?: string }) {
  const k = KIND[kind ?? ''] ?? KIND['פירעון'];
  return (
    <Badge variant="outline" className={cn('h-5 gap-1 rounded-full px-2 text-[11px] font-semibold', TONE_CLASS[k.tone])}>
      <k.icon />
      {kind || 'פירעון'}
    </Badge>
  );
}

function dataAsOfLabel(dataAsOf?: string | null) {
  if (!dataAsOf) return 'מועד המשיכה האחרונה מ-Priority לא ידוע';
  return `נכון ל־${formatDate(israelDateOf(dataAsOf))}, ${formatTime(dataAsOf)} · נמשך אוטומטית מ-Priority`;
}

/** One item of the week: the whole row opens the aging report on that customer; the name opens the card. */
function ItemRow({ item }: { item: WeekItem }) {
  return (
    <li className="relative">
      <Link
        to={agingUrl(item.customerCode)}
        aria-label={`${item.customerName ?? item.customerCode ?? ''}: ${item.kind ?? ''} ${formatILS(item.amount)}. פתיחה בדוח הגיול`}
        className="absolute inset-0 rounded-[14px] outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative flex flex-col gap-0.5 px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <KindChip kind={item.kind} />
          <CustomerLink code={item.customerCode} name={item.customerName} className="pointer-events-auto text-[13px]" />
          <span className="ms-auto text-[13px] font-bold tabular-nums">{formatILS(item.amount)}</span>
        </div>
        {(item.status || item.noteText) && (
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {item.status && <span className="shrink-0 font-semibold text-ink-2">{item.status}</span>}
            {item.noteText && <span className="truncate">· {item.noteText}</span>}
          </div>
        )}
      </div>
    </li>
  );
}

/** One day of the week board: weekday and date, its total, and its items; today is lit, past days are quiet. */
function DayRow({ day, items }: { day: WeekDay; items: WeekItem[] }) {
  const empty = items.length === 0;
  return (
    <section
      aria-label={formatDayLabel(day.date)}
      className={cn(
        'grid grid-cols-[76px_minmax(0,1fr)] gap-x-[13px] rounded-[18px] px-[13px] py-2',
        day.isToday ? 'bg-glass-strong shadow-glass-pill ring-1 ring-primary/30' : 'bg-glass-faint',
        day.isPast && !day.isToday && 'opacity-70',
      )}
    >
      <div className="flex flex-col py-1">
        <span className={cn('text-sm font-bold', day.isToday && 'text-link')}>
          {day.weekday ?? ''} {formatDayMonth(day.date)}
        </span>
        {day.isToday ? (
          <span className="text-[11px] font-semibold text-link">היום</span>
        ) : (
          !empty && <span className="text-[11px] text-muted-foreground tabular-nums">{formatILS(day.amount)}</span>
        )}
        {day.isToday && !empty && <span className="text-[11px] text-muted-foreground tabular-nums">{formatILS(day.amount)}</span>}
      </div>
      {empty ? (
        <span className="self-center py-1 text-xs text-muted-foreground">אין</span>
      ) : (
        <ul className="flex flex-col">
          {items.map((it) => (
            <ItemRow key={it.id} item={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, sub, lead }: { label: string; value: string; sub?: string; lead?: boolean }) {
  return (
    <div className="flex min-w-[130px] flex-1 flex-col gap-0.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className={cn('font-extrabold tracking-[-0.01em] tabular-nums', lead ? 'text-[28px] leading-tight' : 'text-lg leading-snug')}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

function OverdueList({ rows }: { rows: OverdueRow[] }) {
  return (
    <section aria-label="בפיגור בלי הערה" className="flex flex-col gap-1.5">
      <h3 className="text-sm font-bold">
        בפיגור בלי הערה <span className="font-medium text-muted-foreground">· 14 הימים האחרונים</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">לכל לקוח בפיגור נכתבה הערה בשבועיים האחרונים.</p>
      ) : (
        <ol className="flex flex-col">
          {rows.slice(0, 5).map((r) => (
            <li key={r.customerCode} className="relative">
              <Link
                to={agingUrl(r.customerCode)}
                aria-label={`${r.customerName ?? r.customerCode ?? ''}: ${formatILS(r.overdueAmount)} בפיגור בלי הערה. פתיחה בדוח הגיול`}
                className="absolute inset-0 rounded-[14px] outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="pointer-events-none relative flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5">
                <CustomerLink code={r.customerCode} name={r.customerName} className="pointer-events-auto text-[13px]" />
                <span className="text-xs text-muted-foreground">
                  פירעון ותיק {formatDate(r.oldestDueDate)} · {r.lastNoteAt ? `הערה אחרונה ${formatDate(israelDateOf(r.lastNoteAt))}` : 'אין הערה'}
                </span>
                <span className="ms-auto text-[13px] font-bold tabular-nums">{formatILS(r.overdueAmount)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Top right, the primary panel: the calendar week at a glance (computed in code by GetWeekBrief), the KPIs and the week board. */
function AgingWeekPanel({ brief, loading }: { brief?: Brief; loading: boolean }) {
  const aging = brief?.aging;
  const k = aging?.kpis ?? {};
  const openData = useHasOpenMovements().hasData;
  const items = aging?.items ?? [];
  const days = brief?.week?.days ?? [];
  const undated = items.filter((i) => !i.date);
  const byDate = (date?: string) => items.filter((i) => i.date === date);

  return (
    <section aria-label="מה צופן השבוע" className="glass-hero flex min-w-[min(100%,520px)] flex-[1.618_1_0px] flex-col gap-[21px] p-[21px] md:p-[34px]">
      <div className="flex flex-wrap items-center gap-[13px]">
        <SystemMark size="lg" icon={CalendarDaysIcon} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="font-bold">השבוע במבט אחד</span>
          <span className="text-[13px] text-muted-foreground">מסקנות דוח הגיול לשבוע הקלנדרי</span>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-32 rounded-full" />
        ) : (
          brief?.week?.label && (
            <Badge variant="outline" className="h-7 rounded-full border-transparent bg-glass-strong px-3 text-[13px] font-semibold text-ink-2 shadow-glass-pill">
              השבוע · {brief.week.label}
            </Badge>
          )
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-[85%]" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="flex flex-col gap-[13px]">
          <h2 className="text-[22px] leading-[1.35] font-bold md:text-[26px]">{aging?.headline || 'אין עדיין תמונה של השבוע.'}</h2>
          {(aging?.conclusions ?? []).length > 0 && (
            <ul className="flex flex-col gap-1">
              {(aging?.conclusions ?? []).map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-ink-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="glass-inner flex flex-wrap gap-[21px] p-[13px] md:p-[21px]">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 min-w-[130px] flex-1" />)
        ) : (
          <>
            <Stat
              lead
              label="נכנס לפירעון השבוע"
              value={openData ? formatILS(k.dueThisWeekAmount ?? 0) : '—'}
              sub={openData ? `${formatNumber(k.dueThisWeekCount ?? 0)} חשבוניות · ${formatNumber(k.dueThisWeekCustomers ?? 0)} לקוחות` : WAITING_FOR_OPEN_MOVEMENTS}
            />
            <Stat
              label="הובטח השבוע"
              value={formatILS(k.promisedThisWeekAmount ?? 0)}
              sub={`${formatNumber(k.promisedThisWeekCount ?? 0)} הבטחות · נראו ${formatILS(k.promisesSeenAmount ?? 0)}`}
            />
            <Stat
              label="טוענים ששילמו"
              value={openData ? formatILS(k.claimedPaidOpenAmount ?? 0) : '—'}
              sub={openData ? `${formatNumber(k.claimedPaidOpenCount ?? 0)} חשבוניות, עוד לא ראינו בבנק` : WAITING_FOR_OPEN_MOVEMENTS}
            />
            <Stat
              label="בפיגור בלי הערה"
              value={openData ? formatILS(k.overdueNoNoteAmount ?? 0) : '—'}
              sub={openData ? `${formatNumber(k.overdueNoNoteCustomers ?? 0)} לקוחות` : WAITING_FOR_OPEN_MOVEMENTS}
            />
          </>
        )}
      </div>

      <section aria-label="השבוע לפי ימים" className="flex flex-col gap-1.5">
        <h3 className="text-sm font-bold">השבוע לפי ימים</h3>
        {loading ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-full rounded-[18px]" />)
        ) : (
          <>
            {items.length === 0 && (
              <p className="rounded-[18px] bg-glass-faint px-[13px] py-2.5 text-[13px] text-muted-foreground">
                אין השבוע פירעונות, הבטחות או בירורים. המסך יתעדכן כשיופיע משהו.
              </p>
            )}
            {days.map((d) => (
              <DayRow key={d.date} day={d} items={byDate(d.date)} />
            ))}
            {undated.length > 0 && (
              <section aria-label="בלי תאריך" className="flex flex-col gap-0.5 rounded-[18px] border border-dashed border-ink-2/20 px-[13px] py-2">
                <span className="py-1 text-sm font-bold">
                  בלי תאריך / מהשבוע שעבר <span className="font-medium text-muted-foreground">({undated.length})</span>
                </span>
                <ul className="flex flex-col">
                  {undated.map((it) => (
                    <ItemRow key={it.id} item={it} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>

      {!loading && <OverdueList rows={aging?.overdueNoNote ?? []} />}

      <div className="flex flex-wrap items-center gap-x-[21px] gap-y-2">
        <Link to={AGING} className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
          לדוח הגיול
          <ArrowUpLeftIcon className="size-3.5" />
        </Link>
        <Link to="/collections/briefings" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:underline">
          <NotebookTextIcon className="size-3.5" />
          כל תדריכי הבוקר
        </Link>
      </div>
    </section>
  );
}

/** Top left, narrow: Nina's receipts of the work day in three numbers. */
function ReceiptsPanel({ brief, loading }: { brief?: Brief; loading: boolean }) {
  const nina = useCollectionsAgent();
  const r = brief?.receipts;
  const pulled = r?.pulled ?? 0;
  const matched = r?.matched ?? 0;
  const noFile = !loading && (r?.files ?? []).length === 0;
  const extras = [
    (r?.waitingDecision ?? 0) > 0 ? `${formatNumber(r?.waitingDecision)} מחכות להחלטה` : null,
    (r?.unidentified ?? 0) > 0 ? `${formatNumber(r?.unidentified)} לא מזוהות` : null,
    (r?.bounced ?? 0) > 0 ? `${formatNumber(r?.bounced)} צ׳קים חוזרים` : null,
  ].filter(Boolean);
  const toReceipts = (
    <Button nativeButton={false} className="h-10 self-start rounded-full px-[18px] font-semibold shadow-primary" render={<Link to={RECEIPTS} />}>
      <LandmarkIcon data-icon="inline-start" />
      למסך התקבולים
    </Button>
  );

  return (
    <section aria-label="התקבולים של היום" className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px]">
      <div className="flex items-center gap-[13px]">
        <AgentAvatar agent="nina" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-bold">
            {nina.name} <span className="text-[13px] font-normal text-muted-foreground">· תקבולים</span>
          </span>
          <span className="text-[13px] text-muted-foreground">{loading ? 'יום העבודה' : `יום העבודה: ${formatDayLabel(r?.workDay)}`}</span>
        </div>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-14 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-2 w-full" />
        </>
      ) : noFile ? (
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia>
              <AgentAvatar agent="nina" size="sm" />
            </EmptyMedia>
            <EmptyTitle>עוד לא נמשכו שורות של היום מפריוריטי</EmptyTitle>
            <EmptyDescription>{r?.summary || 'אחרי המשיכה מפריוריטי נינה תזהה את הלקוחות, תוציא קבלות ותפזר אותן לחשבוניות.'}</EmptyDescription>
          </EmptyHeader>
          {toReceipts}
        </Empty>
      ) : (
        <>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-muted-foreground">נמשכו היום</span>
            <span className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums">{formatNumber(pulled)}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">העברות · {formatILS(r?.pulledAmount ?? 0)}</span>
          </div>
          <div className="grid grid-cols-2 gap-[13px]">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-muted-foreground">טופלו</span>
              <span className="text-2xl font-extrabold tabular-nums">{formatNumber(matched)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatILS(r?.matchedAmount ?? 0)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-muted-foreground">נשארו לטפל</span>
              <span className="text-2xl font-extrabold tabular-nums">{formatNumber(r?.toMatch ?? 0)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatILS(r?.toMatchAmount ?? 0)}</span>
            </div>
          </div>
          <Progress value={pulled > 0 ? Math.round((matched / pulled) * 100) : 0} aria-label={`טופלו ${matched} מתוך ${pulled}`} />
          {extras.length > 0 && <p className="text-xs text-muted-foreground">{extras.join(' · ')}</p>}
          <Separator />
          {r?.summary && <p className="text-sm text-ink-2">{r.summary}</p>}
          {toReceipts}
        </>
      )}
    </section>
  );
}

/**
 * היום — the home screen, from zero (25.10): on the right the calendar week at a glance (code, no agent) from
 * the aging report (headline, KPIs, a board by day, overdue with no note); on the left Nina's receipts
 * of the work day in short, then the 5 most urgent open tasks and the credit alerts. One GetWeekBrief call, scoped
 * by "שלי / של כולם" (the tasks card reads CollectionQueue under the same scope).
 */
export default function TodayPage() {
  const scope = useOwnerScope();
  const { executeFunction } = useExecuteAction(GetWeekBriefAction);
  const q = useActionQuery(executeFunction, scope.bookkeeperFilter ? { bookkeeperName: scope.bookkeeperFilter } : {}, {
    cache: 'weekBrief',
    validate: isWeekBrief,
  });
  const brief = q.data as Brief | undefined;
  const loading = q.isLoading;

  return (
    <>
      <PageHeader
        title="היום"
        description={loading ? 'טוען את תמונת השבוע…' : dataAsOfLabel(brief?.dataAsOf)}
        actions={
          <Button variant="ghost" size="sm" className="rounded-full bg-glass-soft" onClick={q.refresh} disabled={loading || q.isRefreshing}>
            {q.isRefreshing ? <Spinner data-icon="inline-start" /> : <RotateCwIcon data-icon="inline-start" />}
            רענון
          </Button>
        }
      />

      {q.isError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>לא הצלחנו לטעון את תמונת השבוע</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            בדקו את החיבור ונסו שוב בעוד רגע.
            <Button variant="outline" size="sm" onClick={q.refresh}>
              <RotateCwIcon data-icon="inline-start" />
              ניסיון נוסף
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-wrap items-start gap-[21px]">
          <AgingWeekPanel brief={brief} loading={loading} />
          <div className="flex min-w-[min(100%,300px)] flex-[1_1_0px] flex-col gap-[21px]">
            <ReceiptsPanel brief={brief} loading={loading} />
            <UrgentTasksCard />
            <CreditAlertsCard bookkeeperName={scope.bookkeeperFilter} />
          </div>
        </div>
      )}
    </>
  );
}