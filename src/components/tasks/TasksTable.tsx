import { Fragment, useState } from 'react';
import { useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon, PanelLeftOpenIcon, PlayIcon, XIcon } from 'lucide-react';
import { CollectionQueueEntity } from '@/product-types';
import { MonthNotesPopover } from '@/components/aging/MonthNotesPopover';
import type { NotesTarget } from '@/components/aging/MonthNotesPopover';
import { CustomerLink } from '@/components/CustomerLink';
import { StatusBadge } from '@/components/StatusBadge';
import { InvoiceNumberLink } from '@/components/receipts/InvoicePopup';
import { NoteTaskRows } from '@/components/tasks/NoteTaskRows';
import { TaskReceiptSheet } from '@/components/tasks/TaskReceiptSheet';
import { TaskResolveDialog } from '@/components/tasks/TaskResolveDialog';
import { TaskSourceLink } from '@/components/tasks/TaskSourceLink';
import type { ResolveMode } from '@/components/tasks/TaskResolveDialog';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatILS, israelDateOf } from '@/utils/Format';
import { isNoteTask, isRowHandled, noteRowsOf } from '@/utils/NoteTaskRows';
import { daysOpen, daysOpenLabel, invoiceListOf, isAlertTask, isUrgentBankTask, receiptTaskKind } from '@/utils/Tasks';
import type { ReceiptTaskKind, Task } from '@/utils/Tasks';

const HEAD = 'h-9 text-xs font-semibold text-muted-foreground';

/** The button that opens a receipts task's record panel, by what the task needs. */
const RECEIPT_ACTION: Record<ReceiptTaskKind, string> = {
  identify: 'לאישור הלקוח',
  customer: 'שייך ללקוח',
  allocate: 'לפיזור',
  'debt-check': 'לבדיקת החוב',
  'debt-zero': 'לרשומה',
};

/** The source to open, with the component that raised the task under it. */
function SourceCell({ task, receiptHref }: { task: Task; receiptHref: (id: string) => string | null }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <TaskSourceLink task={task} receiptHref={receiptHref} />
      <span className="text-xs text-muted-foreground">{task.source ?? 'ידני'}</span>
    </div>
  );
}

function InvoicesCell({ task }: { task: Task }) {
  const list = invoiceListOf(task);
  if (list.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = list.slice(0, 2);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {shown.map((n) => (
        <InvoiceNumberLink key={n} invoiceNumber={n} className="text-[13px]" />
      ))}
      {list.length > shown.length && (
        <span className="text-xs text-muted-foreground" title={list.slice(2).join(', ')}>
          +{list.length - shown.length}
        </span>
      )}
    </div>
  );
}

function RowActions({ task, onResolve }: { task: Task; onResolve: (task: Task, mode: ResolveMode) => void }) {
  const scope = useOwnerScope();
  const { updateFunction } = useEntityUpdate(CollectionQueueEntity);
  async function startHandling() {
    try {
      await updateFunction({ id: task.id, data: { status: 'בטיפול', handledBy: scope.actorName, handledAt: new Date().toISOString() } });
    } catch {
      toast.add({ title: 'לא הצלחנו לעדכן את המשימה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`פעולות למשימה ${task.title ?? ''}`} className="rounded-full" />}>
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-menu min-w-44 rounded-[18px] p-1.5 ring-0">
        <DropdownMenuGroup>
          {task.status !== 'בטיפול' && (
            <DropdownMenuItem onClick={startHandling} className="rounded-[12px]">
              <PlayIcon />
              בטיפול
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onResolve(task, 'done')} className="rounded-[12px]">
            <CheckIcon />
            טופל…
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onResolve(task, 'dismiss')} className="rounded-[12px]">
            <XIcon />
            דחה…
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const COLUMNS = 9;

/**
 * The tasks list: severity, customer, title, invoices, amount, days open (or, for closed tasks, when and why they
 * closed), owner, and the source to open. Open tasks get the status menu (בטיפול / טופל / דחה) — alerts get none.
 * "דף הבנק לא עלה לפריוריטי" carries a דחוף chip. A grouped note task (notes:*) opens into its rows.
 */
export function TasksTable({ tasks, closed, receiptHref }: { tasks: Task[]; closed: boolean; receiptHref: (id: string) => string | null }) {
  const scope = useOwnerScope();
  const [resolving, setResolving] = useState<{ task: Task; mode: ResolveMode } | null>(null);
  const [deciding, setDeciding] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [notesTarget, setNotesTarget] = useState<NotesTarget | null>(null);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <Table className="min-w-[1080px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD, 'ps-[21px]')}>חומרה</TableHead>
            <TableHead className={HEAD}>לקוח</TableHead>
            <TableHead className={HEAD}>כותרת</TableHead>
            <TableHead className={HEAD}>חשבוניות</TableHead>
            <TableHead className={HEAD}>סכום</TableHead>
            <TableHead className={HEAD}>{closed ? 'נסגרה' : 'פתוחה'}</TableHead>
            <TableHead className={HEAD}>אחראית</TableHead>
            <TableHead className={HEAD}>מקור</TableHead>
            <TableHead className={cn(HEAD, 'pe-[21px]')}>
              <span className="sr-only">פעולות</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => {
            const days = daysOpen(t);
            const grouped = isNoteTask(t);
            const groupRows = grouped ? noteRowsOf(t.itemsJson) : [];
            const open = grouped && expanded.has(t.id);
            return (
              <Fragment key={t.id}>
              <TableRow className={cn('hover:bg-glass-faint', open && 'border-b-0')}>
                <TableCell className="ps-[21px] align-top">
                  <StatusBadge value={t.severity} />
                </TableCell>
                <TableCell className="align-top">
                  <CustomerLink code={t.customerCode} name={t.customerName} showCode />
                </TableCell>
                <TableCell className="max-w-80 align-top whitespace-normal">
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {isUrgentBankTask(t) && !closed && <StatusBadge value="דחוף" tone="critical" className="h-5 px-2 text-[11px]" />}
                      <span className="text-[13px] leading-snug font-semibold text-ink-2">{t.title || t.reasons || t.taskType || '—'}</span>
                    </span>
                    {grouped && groupRows.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="self-start rounded-full text-link"
                        aria-expanded={open}
                        onClick={() => toggle(t.id)}
                      >
                        {open ? <ChevronUpIcon data-icon="inline-start" /> : <ChevronDownIcon data-icon="inline-start" />}
                        {groupRows.length === 1 ? 'שורה אחת' : `${groupRows.length} שורות`}
                        {groupRows.some(isRowHandled) && ` · טופלו ${groupRows.filter(isRowHandled).length}`}
                      </Button>
                    )}
                    {!closed && receiptTaskKind(t) && (
                      <Button variant="outline" size="sm" className="self-start rounded-full bg-glass-card" onClick={() => setDeciding(t)}>
                        <PanelLeftOpenIcon data-icon="inline-start" />
                        {RECEIPT_ACTION[receiptTaskKind(t) ?? 'debt-zero']}
                      </Button>
                    )}
                    {closed ? (
                      <span className="text-xs text-muted-foreground">
                        <StatusBadge value={t.status} className="me-1.5 h-5 px-2 text-[11px]" />
                        {t.resolvedReason}
                      </span>
                    ) : (
                      t.status === 'בטיפול' && (
                        <span className="text-xs text-muted-foreground">
                          <StatusBadge value="בטיפול" className="me-1.5 h-5 px-2 text-[11px]" />
                          {t.handledBy}
                        </span>
                      )
                    )}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <InvoicesCell task={t} />
                </TableCell>
                <TableCell className="align-top font-semibold tabular-nums">{t.amount ? formatILS(t.amount) : '—'}</TableCell>
                <TableCell className="align-top text-[13px] tabular-nums">
                  {closed ? (
                    <span title={formatDateTime(t.resolvedAt)}>{formatDate(israelDateOf(t.resolvedAt))}</span>
                  ) : (
                    <span title={t.openedAt ? `נפתחה ${formatDateTime(t.openedAt)}` : undefined} className={cn(days !== null && days >= 7 && 'font-semibold text-ink-2')}>
                      {daysOpenLabel(days)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="align-top text-[13px]">{scope.ownerOf(t.customerCode, t.assignedBookkeeperName) ?? '—'}</TableCell>
                <TableCell className="align-top">
                  <SourceCell task={t} receiptHref={receiptHref} />
                </TableCell>
                <TableCell className="pe-[21px] align-top">
                  {!closed && !isAlertTask(t) && <RowActions task={t} onResolve={(task, mode) => setResolving({ task, mode })} />}
                </TableCell>
              </TableRow>
              {open && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMNS} className="px-[21px] pt-0 pb-[13px] whitespace-normal">
                    <NoteTaskRows task={t} closed={closed} onOpenNotes={setNotesTarget} />
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <TaskReceiptSheet task={deciding} receiptHref={receiptHref} onClose={() => setDeciding(null)} />
      <MonthNotesPopover target={notesTarget} onClose={() => setNotesTarget(null)} />
      <TaskResolveDialog task={resolving?.task ?? null} mode={resolving?.mode ?? 'done'} onClose={() => setResolving(null)} />
    </>
  );
}