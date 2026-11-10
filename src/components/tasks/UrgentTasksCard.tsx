import { Link } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, ListTodoIcon } from 'lucide-react';
import { CollectionQueueEntity } from '@/product-types';
import { SystemMark } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { StatusBadge } from '@/components/StatusBadge';
import { TaskSourceLink } from '@/components/tasks/TaskSourceLink';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { useReceiptLineLinks } from '@/hooks/useReceiptLineLinks';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDateTime, formatILS } from '@/utils/Format';
import { OPEN_STATUSES, compareTasks, daysOpen, daysOpenLabel, isOpenTask } from '@/utils/Tasks';
import type { Task } from '@/utils/Tasks';

const TASKS = '/collections/tasks';
const SHOWN = 5;

function UrgentTaskRow({ task, receiptHref }: { task: Task; receiptHref: (id: string) => string | null }) {
  const days = daysOpen(task);
  return (
    <li className="flex flex-col gap-0.5 rounded-[14px] px-2.5 py-2 hover:bg-glass-inner">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge value={task.severity} className="h-5 px-2 text-[11px]" />
        <CustomerLink code={task.customerCode} name={task.customerName} className="min-w-0 text-[13px]" />
        <span className="ms-auto text-[13px] font-bold tabular-nums">{task.amount ? formatILS(task.amount) : ''}</span>
      </div>
      <span className="truncate text-[13px] text-ink-2">{task.title || task.reasons || task.taskType || '—'}</span>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span
          title={task.openedAt ? `נפתחה ${formatDateTime(task.openedAt)}` : undefined}
          className={cn('tabular-nums', days !== null && days >= 7 && 'font-semibold text-ink-2')}
        >
          {days === 0 ? daysOpenLabel(days) : `פתוחה ${daysOpenLabel(days)}`}
        </span>
        {task.status === 'בטיפול' && <span>· בטיפול{task.handledBy ? ` אצל ${task.handledBy}` : ''}</span>}
        <span aria-hidden>·</span>
        <TaskSourceLink task={task} receiptHref={receiptHref} className="text-xs" />
      </div>
    </li>
  );
}

/**
 * היום: the five most urgent open tasks (same sort and the same top-bar "שלי / של כולם" scope as /collections/tasks),
 * each with its severity, customer, title, amount, days open and the source to open; a link to the whole list.
 */
export function UrgentTasksCard({ className }: { className?: string }) {
  const scope = useOwnerScope();
  const q = useEntityGetAll(CollectionQueueEntity, {
    where: { column: 'status', operator: 'in', value: [...OPEN_STATUSES] },
    page: { size: 500 },
  });
  const open = ((q.data ?? []) as Task[]).filter((t) => isOpenTask(t) && scope.isVisible(t.customerCode, t.assignedBookkeeperName)).sort(compareTasks);
  const top = open.slice(0, SHOWN);
  const receiptLinks = useReceiptLineLinks(top.filter((t) => t.relatedTable === 'BankLines').map((t) => t.relatedId));
  const loading = q.isLoading || scope.isLoading;
  const total = `${open.length}${q.hasNextPage ? '+' : ''}`;

  return (
    <section aria-label="המשימות הדחופות" className={cn('glass flex flex-col gap-[13px] rounded-[26px] border p-[21px]', className)}>
      <div className="flex items-center gap-[13px]">
        <SystemMark icon={ListTodoIcon} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-bold">5 המשימות הדחופות</span>
          <span className="text-[13px] text-muted-foreground">לפי חומרה ואז ותק · מהסריקה של 06:00</span>
        </div>
      </div>

      {loading ? (
        Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-[14px]" />)
      ) : q.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-ink-2">לא הצלחנו לטעון את המשימות.</p>
          <Link to={TASKS} className="text-[13px] font-semibold text-link hover:underline">
            לדף המשימות
          </Link>
        </div>
      ) : top.length === 0 ? (
        <Empty className="py-4">
          <EmptyHeader>
            <EmptyMedia>
              <SystemMark size="sm" icon={ListTodoIcon} />
            </EmptyMedia>
            <EmptyTitle>אין משימות פתוחות</EmptyTitle>
            <EmptyDescription>
              הסריקה של 06:00 (א׳–ה׳) פותחת משימה כשחשבונית בפיגור בלי הבטחה או בירור, כשהבטחה הופרה, כשמגיע מועד מעקב של בירור, כשמייל מחכה לטיפול
              או טיוטה לאישור, וכשתקבול לא זוהה או ממתין לבדיקה.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="-mx-2.5 flex flex-col">
          {top.map((t) => (
            <UrgentTaskRow key={t.id} task={t} receiptHref={receiptLinks.href} />
          ))}
        </ol>
      )}

      {!loading && !q.isError && (
        <Link to={TASKS} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-link hover:underline">
          לכל המשימות ({total})
          <ArrowUpLeftIcon className="size-3.5" />
        </Link>
      )}
    </section>
  );
}