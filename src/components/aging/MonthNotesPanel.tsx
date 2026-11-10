import { useState } from 'react';
import type { ReactNode } from 'react';
import { CheckIcon, PencilIcon, PlusIcon, XIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PopoverDescription, PopoverTitle } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/toast';
import { CustomerNoteForm } from '@/components/aging/CustomerNoteForm';
import { useCustomerNotesApi } from '@/hooks/useCustomerNotesApi';
import type { NoteFields } from '@/hooks/useCustomerNotesApi';
import { cn } from '@/lib/utils';
import { PROMISE, commitmentProgress, isActiveNote, isActiveType, isNoteDue, noteTypeLabel } from '@/utils/AgingMonths';
import type { CustomerNote, SettingsMap } from '@/utils/AgingMonths';
import { AG_SECONDARY_BTN } from '@/utils/AgingStyle';
import { formatDate, formatDateTime, formatILS, formatMonth } from '@/utils/Format';

const OUTCOME_TONE: Record<string, string> = {
  פתוחה: 'bg-ag-cobalt-tint text-ag-cobalt',
  קוימה: 'bg-success-soft text-success-ink',
  'קוימה חלקית': 'bg-warning-soft text-warning-ink',
  'לא קוימה': 'bg-critical-soft text-critical-ink',
};

function fieldsOf(n: CustomerNote): NoteFields {
  return {
    noteType: n.noteType ?? 'אחר',
    customTypeLabel: n.customTypeLabel ?? '',
    noteText: n.noteText ?? '',
    actionDate: (n.actionDate ?? '').slice(0, 10),
    reminderDate: (n.reminderDate ?? '').slice(0, 10),
    amount: typeof n.amount === 'number' ? n.amount : null,
  };
}

/** One note: type, dates, amount, content, who and when; a commitment also shows its outcome and what came in. */
function NoteItem({
  note,
  today,
  showMonth,
  actions,
}: {
  note: CustomerNote;
  today: string;
  showMonth: boolean;
  actions?: ReactNode;
}) {
  const due = isNoteDue(note, today);
  const progress = commitmentProgress(note, formatILS);
  const facts = [
    note.actionDate ? `${isActiveType(note.noteType) ? 'ל-' : ''}${formatDate(note.actionDate)}` : null,
    typeof note.amount === 'number' ? formatILS(note.amount) : null,
    note.reminderDate ? `תזכורת ${formatDate(note.reminderDate)}` : null,
    showMonth && note.dueMonth ? formatMonth(note.dueMonth) : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-1 rounded-[6px] border border-ag-border bg-ag-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-bold text-ag-ink">{noteTypeLabel(note)}</span>
        {due && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-warning-ink">
            <span aria-hidden className="size-1.5 rounded-full bg-warning" />
            המועד הגיע
          </span>
        )}
        {note.noteType === PROMISE && note.outcome && (
          <Badge variant="outline" className={cn('h-5 rounded-[4px] border-transparent px-1.5 text-[11px]', OUTCOME_TONE[note.outcome])}>
            {note.outcome}
          </Badge>
        )}
        {actions && <span className="ms-auto flex items-center gap-0.5">{actions}</span>}
      </div>
      {facts.length > 0 && <span className="text-[12.5px] text-ag-ink-2 tabular-nums">{facts.join(' · ')}</span>}
      {progress && <span className="text-[12.5px] font-semibold text-ag-ink-2">{progress}</span>}
      {note.noteText && <p className="text-[13px] leading-snug whitespace-pre-line text-ag-note">{note.noteText}</p>}
      <span className="text-[11.5px] text-ag-muted">
        {[note.authorName, formatDateTime(note.noteCreatedAt ?? note.createdAt)].filter(Boolean).join(' · ')}
        {!isActiveNote(note) && note.status ? ` · ${note.status}${note.closedAt ? ` ${formatDate(note.closedAt.slice(0, 10))}` : ''}` : ''}
      </span>
    </li>
  );
}

/**
 * The floating notes window of one customer + month (Design 02 section 7): the customer, the month and its balance;
 * the active notes with edit and manual close; the closed ones folded as history; "+ הערה". For חוב קודם / חוב
 * מאוחר it lists the notes of every month in the bucket and the form asks which month. All writes go through
 * useCustomerNotesApi.
 */
export function MonthNotesPanel({
  customerName,
  customerCode,
  customerId,
  periodLabel,
  balance,
  months,
  fixedMonth,
  notes,
  suggestions,
  settings,
  today,
  authorName,
}: {
  customerName: string;
  customerCode: string;
  customerId: string | null;
  periodLabel: string;
  balance: number;
  /** For חוב קודם / חוב מאוחר: the bucket's months with their balance. */
  months: { key: string; balance: number }[];
  /** The window month the cell is (null for חוב קודם / חוב מאוחר). */
  fixedMonth: string | null;
  notes: CustomerNote[];
  suggestions: string[];
  settings: SettingsMap;
  today: string;
  authorName: string;
}) {
  const api = useCustomerNotesApi();
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string }>({ kind: 'list' });
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  // The engine's line about the grouped task the last saved note will open ("תיפתח משימה ב-12.11 אם החודש לא יתאפס").
  const [saved, setSaved] = useState<{ month: string; preview: string | null } | null>(null);
  const active = notes.filter(isActiveNote);
  const closed = notes.filter((n) => !isActiveNote(n));
  const balanceOf = (m: string) => (fixedMonth ? balance : (months.find((x) => x.key === m)?.balance ?? 0));

  async function add(fields: NoteFields, month: string | null) {
    const dueMonth = fixedMonth ?? month ?? '';
    const { taskPreview } = await api.addCustomerNote({ ...fields, customerId, customerCode, customerName, dueMonth, balanceAtNote: balanceOf(dueMonth), authorName });
    setSaved({ month: dueMonth, preview: taskPreview });
    setMode({ kind: 'list' });
    toast.add({ title: 'ההערה נשמרה', description: `${customerName} · ${formatMonth(dueMonth)}`, type: 'success' });
  }

  async function edit(id: string, fields: NoteFields) {
    await api.updateCustomerNote(id, fields);
    setMode({ kind: 'list' });
    toast.add({ title: 'ההערה עודכנה', type: 'success' });
  }

  async function close(id: string) {
    try {
      await api.closeCustomerNote(id);
      setConfirmClose(null);
      toast.add({ title: 'ההערה נסגרה', description: 'היא עברה להיסטוריה של החודש.', type: 'success' });
    } catch {
      toast.add({ title: 'ההערה לא נסגרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  const choosable = months.filter((m) => !!m.key);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5 px-4 pt-4 pb-3">
        <PopoverTitle className="text-[15px] leading-tight font-bold text-ag-ink">{customerName}</PopoverTitle>
        <PopoverDescription className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ag-muted">
          <span>{periodLabel}</span>
          <span className="text-[15px] font-bold text-ag-ink tabular-nums">{formatILS(balance)}</span>
        </PopoverDescription>
      </div>
      <Separator className="bg-ag-border" />

      <div className="flex flex-col gap-[10px] p-4">
        {mode.kind === 'new' ? (
          <CustomerNoteForm
            months={fixedMonth ? undefined : choosable}
            suggestions={suggestions}
            settings={settings}
            saving={api.isSaving}
            submitLabel="שמירת הערה"
            onSubmit={add}
            onCancel={() => setMode({ kind: 'list' })}
          />
        ) : (
          <>
            {saved?.preview && mode.kind === 'list' && (
              <p className="rounded-[6px] bg-ag-cobalt-tint px-3 py-2 text-[12.5px] text-ag-cobalt" aria-live="polite">
                <span className="font-semibold">ההערה נשמרה{fixedMonth ? '' : ` ל${formatMonth(saved.month)}`}.</span> {saved.preview}
              </p>
            )}
            {active.length === 0 ? (
              <p className="text-[13px] text-ag-muted">אין הערות פעילות {fixedMonth ? 'בחודש הזה' : 'בחודשים האלה'}.</p>
            ) : (
              <ul className="flex flex-col gap-2" aria-label="הערות פעילות">
                {active.map((n) =>
                  mode.kind === 'edit' && mode.id === n.id ? (
                    <li key={n.id} className="rounded-[6px] border border-ag-cobalt/30 bg-ag-surface p-3">
                      <CustomerNoteForm
                        initial={fieldsOf(n)}
                        suggestions={suggestions}
                        settings={settings}
                        saving={api.isSaving}
                        submitLabel="שמירת שינויים"
                        onSubmit={(fields) => edit(n.id, fields)}
                        onCancel={() => setMode({ kind: 'list' })}
                      />
                    </li>
                  ) : (
                    <NoteItem
                      key={n.id}
                      note={n}
                      today={today}
                      showMonth={!fixedMonth}
                      actions={
                        confirmClose === n.id ? (
                          <>
                            <span className="text-[12px] text-ag-muted">לסגור?</span>
                            <Button variant="ghost" size="icon-xs" aria-label="כן, לסגור את ההערה" onClick={() => void close(n.id)} disabled={api.isSaving}>
                              <CheckIcon />
                            </Button>
                            <Button variant="ghost" size="icon-xs" aria-label="לא לסגור" onClick={() => setConfirmClose(null)}>
                              <XIcon />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon-xs" aria-label="עריכת ההערה" title="עריכה" onClick={() => setMode({ kind: 'edit', id: n.id })}>
                              <PencilIcon />
                            </Button>
                            <Button variant="ghost" size="xs" className="text-ag-muted" onClick={() => setConfirmClose(n.id)}>
                              סגירה
                            </Button>
                          </>
                        )
                      }
                    />
                  ),
                )}
              </ul>
            )}

            {mode.kind === 'list' && (
              <Button
                variant="outline"
                size="sm"
                className={cn(AG_SECONDARY_BTN, 'h-8 self-start')}
                onClick={() => setMode({ kind: 'new' })}
                disabled={!fixedMonth && choosable.length === 0}
              >
                <PlusIcon data-icon="inline-start" />
                הערה
              </Button>
            )}
          </>
        )}

        {closed.length > 0 && mode.kind === 'list' && (
          <Accordion className="rounded-[6px] border border-ag-border px-3">
            <AccordionItem value="history" className="border-0">
              <AccordionTrigger className="py-2 text-[13px] font-semibold text-ag-muted hover:no-underline">היסטוריה ({closed.length})</AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-2 pb-2" aria-label="הערות סגורות">
                  {closed.map((n) => (
                    <NoteItem key={n.id} note={n} today={today} showMonth={!fixedMonth} />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  );
}