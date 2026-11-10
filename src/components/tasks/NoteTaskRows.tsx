import { useState } from 'react';
import { useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckIcon, MessageSquareTextIcon } from 'lucide-react';
import { CollectionQueueEntity } from '@/product-types';
import type { NotesTarget } from '@/components/aging/MonthNotesPopover';
import { StatusBadge } from '@/components/StatusBadge';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDateTime, formatILS, formatMonth } from '@/utils/Format';
import { isRowHandled, markRowHandled, noteRowKey, noteRowsOf } from '@/utils/NoteTaskRows';
import type { Task } from '@/utils/Tasks';

const HEAD = 'px-2 py-1.5 text-start text-xs font-semibold text-muted-foreground';
const money = (v?: number | null) => (typeof v === 'number' ? formatILS(v) : '—');

/**
 * A grouped note task opened up (Design 02 section 6): one row per customer + month — לקוח, חודש, הובטח, נכנס, נשאר.
 * Each row opens the floating notes window of that customer and month; "טופל" marks the row in itemsJson (the engine
 * keeps the mark). Once every row is handled the task can be closed with one click.
 */
export function NoteTaskRows({ task, closed, onOpenNotes }: { task: Task; closed: boolean; onOpenNotes: (target: NotesTarget) => void }) {
  const scope = useOwnerScope();
  const { updateFunction } = useEntityUpdate(CollectionQueueEntity);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = noteRowsOf(task.itemsJson);
  const handledCount = rows.filter(isRowHandled).length;
  const allHandled = rows.length > 0 && handledCount === rows.length;

  async function markHandled(key: string) {
    setBusy(key);
    try {
      // The live task's rows at click time, so a colleague's mark from a moment ago is kept.
      await updateFunction({ id: task.id, data: { itemsJson: markRowHandled(noteRowsOf(task.itemsJson), key, scope.actorName, new Date().toISOString()) } });
    } catch {
      toast.add({ title: 'השורה לא סומנה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function closeTask() {
    setBusy('task');
    const now = new Date().toISOString();
    try {
      await updateFunction({
        id: task.id,
        data: { status: 'טופל', resolvedAt: now, resolvedReason: 'כל השורות טופלו', handledBy: scope.actorName, handledAt: now },
      });
      toast.add({ title: 'המשימה נסגרה', description: 'כל השורות שלה טופלו.', type: 'success' });
    } catch {
      toast.add({ title: 'המשימה לא נסגרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return <p className="px-2 py-2 text-[13px] text-muted-foreground">אין שורות במשימה.</p>;

  return (
    <div className="flex flex-col gap-2 rounded-[18px] bg-glass-inner p-[13px] shadow-glass-pill">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className={HEAD}>לקוח</th>
            <th className={HEAD}>חודש</th>
            <th className={HEAD}>הובטח</th>
            <th className={HEAD}>נכנס</th>
            <th className={HEAD}>נשאר</th>
            <th className={HEAD}>
              <span className="sr-only">טיפול</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = noteRowKey(r);
            const handled = isRowHandled(r);
            const month = (r.dueMonth ?? '').slice(0, 7);
            return (
              <tr key={key} className={cn('border-t border-border/60', handled && 'text-muted-foreground')}>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={(e) =>
                      r.customerCode && onOpenNotes({ customerCode: r.customerCode, customerName: r.customerName, dueMonth: month || null, anchor: e.currentTarget })
                    }
                    disabled={!r.customerCode || !month}
                    aria-label={`ההערות של ${r.customerName ?? r.customerCode ?? ''} ל${formatMonth(month)}`}
                    className="inline-flex items-center gap-1.5 rounded-sm text-start font-semibold text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:no-underline"
                  >
                    <MessageSquareTextIcon className="size-3.5 shrink-0" />
                    <span className={cn(handled && 'text-muted-foreground')}>{r.customerName || r.customerCode || '—'}</span>
                    {r.customerCode && <span className="text-xs font-normal text-muted-foreground">{r.customerCode}</span>}
                  </button>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{month ? formatMonth(month) : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{money(r.promised)}</td>
                <td className="px-2 py-1.5 tabular-nums">{money(r.received)}</td>
                <td className={cn('px-2 py-1.5 tabular-nums', !handled && 'font-semibold text-ink-2')}>{money(r.remaining)}</td>
                <td className="px-2 py-1.5 text-end whitespace-nowrap">
                  {handled ? (
                    <span className="text-xs" title={formatDateTime(r.handledAt)}>
                      טופל ע״י {r.handledBy ?? '—'}
                    </span>
                  ) : closed ? (
                    r.outcome ? <StatusBadge value={r.outcome} className="h-5 text-[11px]" /> : null
                  ) : (
                    <Button variant="outline" size="xs" className="rounded-full bg-glass-card" onClick={() => void markHandled(key)} disabled={busy !== null}>
                      {busy === key ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                      טופל
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!closed && (
        <div className="flex flex-wrap items-center justify-end gap-[13px] px-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {allHandled ? 'כל השורות טופלו.' : `טופלו ${handledCount} מתוך ${rows.length}`}
          </span>
          {allHandled && (
            <Button size="sm" className="rounded-full" onClick={() => void closeTask()} disabled={busy !== null}>
              {busy === 'task' ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
              סגירת המשימה
            </Button>
          )}
        </div>
      )}
    </div>
  );
}