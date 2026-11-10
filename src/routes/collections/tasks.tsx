import { useSearchParams } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CollectionQueueEntity } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { AgentEmpty, LoadError, LoadingRows, PageHeader } from '@/components/PageStates';
import { TasksTable } from '@/components/tasks/TasksTable';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { useReceiptLineLinks } from '@/hooks/useReceiptLineLinks';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { BellIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatILS } from '@/utils/Format';
import { CLOSED_STATUSES, OPEN_STATUSES, TASK_TABS, compareTasks, daysOpen, isAlertTask, isOpenTask, isTaskTab, receiptLineIdOf, tabOf } from '@/utils/Tasks';
import type { Task, TaskTab } from '@/utils/Tasks';

const TAB_TRIGGER = 'min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold';
const FILTER_TOGGLE = 'h-[42px] gap-1.5 rounded-[22px] bg-glass-soft px-4 text-ink-2';

const EMPTY_TAB: Record<TaskTab, string> = {
  all: 'אין משימות פתוחות',
  collect: 'אין משימות גבייה פתוחות',
  promises: 'אין הבטחות שהופרו',
  disputes: 'אין בירורים שהגיע מועד המעקב שלהם',
  inbox: 'אין פניות שמחכות לטיפול',
  receipts: 'אין תקבולים שמחכים לזיהוי, לבירור או לפיזור',
};

function count(n: number, one: string, many: string) {
  return n === 1 ? one : `${n} ${many}`;
}

/**
 * /collections/tasks — every open problem in one list: "דף הבנק לא עלה לפריוריטי" first, then severity and age, each
 * linked to its source. Alerts (isAlert — notices with nothing to do) stay out of the work list and show under the
 * התראות filter (?alerts=1).
 */
export default function TasksPage() {
  const scope = useOwnerScope();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: TaskTab = isTaskTab(rawTab) ? rawTab : 'all';
  const closedView = params.get('view') === 'closed';
  const alertsOnly = params.get('alerts') === '1';

  const openQ = useEntityGetAll(CollectionQueueEntity, {
    where: { column: 'status', operator: 'in', value: [...OPEN_STATUSES] },
    page: { size: 500 },
  });
  const closedQ = useEntityGetAll(
    CollectionQueueEntity,
    {
      where: { column: 'status', operator: 'in', value: [...CLOSED_STATUSES] },
      orderBy: [{ column: 'resolvedAt', direction: 'desc' }],
      page: { size: 50 },
    },
    { enabled: closedView },
  );

  const openAll = ((openQ.data ?? []) as Task[])
    .filter((t) => isOpenTask(t) && scope.isVisible(t.customerCode, t.assignedBookkeeperName))
    .sort(compareTasks);
  const closedAll = ((closedQ.data ?? []) as Task[]).filter((t) => !isOpenTask(t) && scope.isVisible(t.customerCode, t.assignedBookkeeperName));
  // The work list never mixes in alerts; the התראות filter shows only them.
  const open = openAll.filter((t) => !isAlertTask(t));
  const alertCount = (closedView ? closedAll : openAll).filter(isAlertTask).length;
  const scoped = (closedView ? closedAll : openAll).filter((t) => isAlertTask(t) === alertsOnly);
  const source = scoped;
  const rows = tab === 'all' ? source : source.filter((t) => tabOf(t) === tab);
  const tabCount = (key: TaskTab) => (key === 'all' ? source.length : source.filter((t) => tabOf(t) === key).length);

  const receiptLinks = useReceiptLineLinks(rows.map(receiptLineIdOf));

  const query = closedView ? closedQ : openQ;
  const loading = query.isLoading || scope.isLoading;
  const openLoading = openQ.isLoading || scope.isLoading;

  const critical = open.filter((t) => t.severity === 'קריטית').length;
  const inHand = open.filter((t) => t.status === 'בטיפול').length;
  const oldest = open.reduce((m, t) => Math.max(m, daysOpen(t) ?? 0), 0);
  const atStake = open.reduce((s, t) => s + (t.amount ?? 0), 0);

  const headline = openLoading ? (
    <Skeleton className="h-7 w-80 max-w-full" />
  ) : open.length === 0 ? (
    'אין משימות פתוחות. הסריקה הבאה בשש בבוקר'
  ) : (
    `${count(open.length, 'משימה פתוחה אחת', 'משימות פתוחות')}${critical ? `, ${count(critical, 'אחת קריטית', 'קריטיות')}` : ''}. הוותיקה פתוחה ${
      oldest === 0 ? 'מהיום' : oldest === 1 ? 'יום אחד' : oldest === 2 ? 'יומיים' : `${oldest} ימים`
    }`
  );

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageHeader title="משימות" description="כל בעיה שצריך לטפל בה, לפי חומרה ואז ותק. כל משימה מובילה ישר למקור." />

      <div className="flex flex-wrap gap-[21px]">
        <AgentPanel
          className="min-w-[min(100%,520px)] flex-[1.618_1_0px]"
          subtitle="סריקת המשימות · א׳–ה׳ ב-06:00"
          headline={headline}
          description="כל בוקר הסריקה עוברת על דוח הגיול, ההבטחות, הפניות והתקבולים: פותחת משימה אחת לכל בעיה, מעדכנת את הקיימות וסוגרת לבד את מה שנפתר. משימה שסגרתם נשארת סגורה."
        />
        <aside aria-label="סיכום המשימות" className="glass flex min-w-[min(100%,300px)] flex-[1_1_0px] flex-col gap-[13px] rounded-[26px] border p-[21px]">
          <span className="text-[13px] font-semibold text-muted-foreground">סכום במשימות הפתוחות</span>
          {openLoading ? (
            <Skeleton className="my-2 h-12 w-48" />
          ) : (
            <span className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums md:text-[54px]">{formatILS(atStake)}</span>
          )}
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'ממתינות', value: open.length - inHand },
              { label: 'בטיפול', value: inHand },
            ].map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                {openLoading ? <Skeleton className="mt-1 h-5 w-12" /> : <span className="text-base font-bold tabular-nums">{s.value}</span>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section aria-label="רשימת המשימות" className="glass glass-lift flex flex-col overflow-hidden rounded-[26px] border">
        <div className="flex flex-wrap items-center justify-between gap-[13px] p-[21px]">
          <Tabs value={tab} onValueChange={(v) => setParam('tab', v === 'all' ? null : String(v))}>
            <TabsList aria-label="סוג המשימה" className="h-auto flex-wrap gap-0.5 rounded-[22px] bg-glass-soft p-1 group-data-horizontal/tabs:h-auto">
              {TASK_TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className={TAB_TRIGGER}>
                  {t.label}
                  {!loading && <span className="rounded-full bg-glass-inner px-1.5 text-xs font-semibold tabular-nums">{tabCount(t.key)}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-[13px]">
          <Toggle
            pressed={alertsOnly}
            onPressedChange={(on) => setParam('alerts', on ? '1' : null)}
            aria-label="רק התראות"
            className={cn(FILTER_TOGGLE, 'aria-pressed:bg-primary/12 aria-pressed:font-semibold aria-pressed:text-link')}
          >
            <BellIcon />
            התראות
            {!loading && <span className="rounded-full bg-glass-inner px-1.5 text-xs font-semibold tabular-nums">{alertCount}</span>}
          </Toggle>
          <Tabs value={closedView ? 'closed' : 'open'} onValueChange={(v) => setParam('view', v === 'closed' ? 'closed' : null)}>
            <TabsList aria-label="מצב" className="h-auto gap-0.5 rounded-[22px] bg-glass-soft p-1 group-data-horizontal/tabs:h-auto">
              <TabsTrigger value="open" className={TAB_TRIGGER}>
                פתוחות
              </TabsTrigger>
              <TabsTrigger value="closed" className={TAB_TRIGGER}>
                נסגרו לאחרונה
              </TabsTrigger>
            </TabsList>
          </Tabs>
          </div>
        </div>

        {query.isError ? (
          <div className="px-[21px] pb-[21px]">
            <LoadError what="המשימות" />
          </div>
        ) : loading ? (
          <LoadingRows />
        ) : source.length === 0 && alertsOnly ? (
          <p className="px-[21px] pb-[21px] text-center text-sm text-muted-foreground">
            {closedView ? 'לא נסגרו לאחרונה התראות.' : 'אין התראות פתוחות. התראה היא הודעה בלי פעולה, למשל חודש שנסגר לאפס.'}
          </p>
        ) : source.length === 0 ? (
          closedView ? (
            <AgentEmpty title="עוד לא נסגרו משימות">משימה שתסמנו כטופלה או תדחו, ומשימה שהסריקה סוגרת כי הבעיה נפתרה, תופיע כאן עם הסיבה.</AgentEmpty>
          ) : (
            <AgentEmpty title="אין משימות פתוחות">
              הסריקה של 06:00 (א׳–ה׳) פותחת כאן משימה כשחשבונית בפיגור בלי הבטחה או בירור, כשהבטחה הופרה, כשמגיע מועד מעקב של בירור, כשמייל
              מחכה לטיפול או טיוטה לאישור, וכשתקבול מחכה לזיהוי, לבירור החוב או לפיזור.
            </AgentEmpty>
          )
        ) : rows.length === 0 ? (
          <p className="px-[21px] pb-[21px] text-center text-sm text-muted-foreground">{closedView ? 'לא נסגרו לאחרונה משימות מהסוג הזה.' : EMPTY_TAB[tab]}</p>
        ) : (
          <div className="overflow-x-auto">
            <TasksTable tasks={rows} closed={closedView} receiptHref={receiptLinks.href} />
          </div>
        )}
        {closedView && closedQ.hasNextPage && (
          <Button variant="outline" className="m-[21px] mt-0 self-center" onClick={() => closedQ.fetchNextPage()} disabled={closedQ.isFetchingNextPage}>
            {closedQ.isFetchingNextPage ? 'טוען…' : 'משימות סגורות נוספות'}
          </Button>
        )}
        {!closedView && openQ.hasNextPage && (
          <Button variant="outline" className="m-[21px] mt-0 self-center" onClick={() => openQ.fetchNextPage()} disabled={openQ.isFetchingNextPage}>
            {openQ.isFetchingNextPage ? 'טוען…' : 'משימות פתוחות נוספות'}
          </Button>
        )}
      </section>
    </>
  );
}