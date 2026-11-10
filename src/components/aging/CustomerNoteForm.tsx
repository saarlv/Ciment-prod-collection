import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircleIcon, CalendarClockIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NoteRefusedError, noteFieldErrors } from '@/hooks/useCustomerNotesApi';
import type { NoteFields } from '@/hooks/useCustomerNotesApi';
import { cn } from '@/lib/utils';
import { NOTE_TYPES, OTHER, isActiveType, taskPreviewLine, taskPreviews } from '@/utils/AgingMonths';
import type { NoteType, SettingsMap } from '@/utils/AgingMonths';
import { AG_MENU, AG_PRIMARY_BTN, AG_SECONDARY_BTN, AG_TOGGLE } from '@/utils/AgingStyle';
import { formatILS, formatMonth } from '@/utils/Format';

const FIELD = 'rounded-[6px] border-ag-btn-border bg-ag-surface dark:bg-ag-surface';

/** The date's label per type (the date is required for the four active types). */
const DATE_LABEL: Record<NoteType, string> = {
  'התחייבות לתשלום': 'תאריך ההתחייבות',
  'תשלום באשראי': 'מועד התשלום באשראי',
  'צ׳ק אצל סוכן': 'תאריך הצ׳ק אצל הסוכן',
  'חזור אליי': 'לחזור ללקוח ב-',
  אחר: 'תאריך',
};

const EMPTY_FIELDS: NoteFields = { noteType: 'התחייבות לתשלום', customTypeLabel: '', noteText: '', actionDate: '', reminderDate: '', amount: null };

/**
 * The note form of the notes popover (Design 02 section 7): type (four active + אחר with a free label and the labels
 * already written as suggestions), content, date (required for the active types), reminder date and amount. Under an
 * active type it says which grouped task will open and when if the month does not reach zero.
 */
export function CustomerNoteForm({
  initial = EMPTY_FIELDS,
  months,
  suggestions,
  settings,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: NoteFields;
  /** For חוב קודם / חוב מאוחר: the months to choose from, with their balance. Omitted = the month is fixed. */
  months?: { key: string; balance: number }[];
  suggestions: string[];
  settings: SettingsMap;
  saving: boolean;
  submitLabel: string;
  onSubmit: (fields: NoteFields, month: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<NoteFields>(initial);
  const [amountText, setAmountText] = useState(initial.amount === null ? '' : String(initial.amount));
  const [month, setMonth] = useState<string | null>(months?.[0]?.key ?? null);
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const set = (patch: Partial<NoteFields>) => setF((v) => ({ ...v, ...patch }));

  const amount = amountText.trim() === '' ? null : Number(amountText.replace(/[,\s₪]/g, ''));
  const fields: NoteFields = { ...f, amount };
  const errors: Partial<Record<string, string>> = { ...noteFieldErrors(fields) };
  // A date or amount already written can be changed but not emptied here: the note is then closed and a new one written.
  if (initial.reminderDate && !f.reminderDate) errors.reminderDate = 'אי אפשר לרוקן תזכורת קיימת. אפשר לשנות אותה, או לסגור את ההערה ולכתוב חדשה';
  if (initial.amount !== null && amount === null) errors.amount = 'אי אפשר לרוקן סכום קיים. אפשר לשנות אותו';
  if (!isActiveType(f.noteType) && initial.actionDate && !f.actionDate) errors.actionDate = 'אי אפשר לרוקן תאריך קיים. אפשר לשנות אותו';
  if (months && !month) errors.month = 'צריך לבחור חודש';
  const err = (k: string) => (showErrors ? errors[k] : undefined);

  const active = isActiveType(f.noteType);
  const previews = taskPreviews(f.noteType, f.actionDate, f.reminderDate, settings);
  const shownSuggestions = suggestions.filter((s) => s !== f.customTypeLabel.trim()).slice(0, 6);
  const monthItems = (months ?? []).map((m) => ({ value: m.key, label: `${m.key ? formatMonth(m.key) : 'ללא חודש פירעון'} · ${formatILS(m.balance)}` }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    setFailed(null);
    if (Object.keys(errors).length > 0) return;
    try {
      await onSubmit(fields, month);
    } catch (e) {
      setFailed(e instanceof NoteRefusedError && e.message ? e.message : 'ההערה לא נשמרה. נסו שוב בעוד רגע.');
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[13px]">
      <FieldGroup className="gap-[13px]">
        {months && (
          <Field data-invalid={!!err('month') || undefined}>
            <FieldLabel htmlFor="note-month">חודש פירעון</FieldLabel>
            <Select items={monthItems} value={month} onValueChange={(v) => setMonth(v)}>
              <SelectTrigger id="note-month" className={cn(FIELD, 'w-full')} aria-invalid={!!err('month') || undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={AG_MENU}>
                <SelectGroup>
                  {monthItems.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {err('month') && <FieldError>{err('month')}</FieldError>}
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="note-type">סוג</FieldLabel>
          <ToggleGroup
            id="note-type"
            variant="outline"
            size="sm"
            spacing={1}
            value={[f.noteType]}
            onValueChange={(v) => {
              const next = NOTE_TYPES.find((t) => t === v[0]);
              if (next) set({ noteType: next });
            }}
            className="flex-wrap"
          >
            {NOTE_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t} className={AG_TOGGLE}>
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        {f.noteType === OTHER && (
          <Field data-invalid={!!err('customTypeLabel') || undefined}>
            <FieldLabel htmlFor="note-custom-type">איזה סוג</FieldLabel>
            <Input
              id="note-custom-type"
              value={f.customTypeLabel}
              onChange={(e) => set({ customTypeLabel: e.target.value })}
              placeholder="למשל: ממתין לזיכוי"
              aria-invalid={!!err('customTypeLabel') || undefined}
              className={FIELD}
            />
            {shownSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="סוגים שכבר נכתבו">
                {shownSuggestions.map((s) => (
                  <Button key={s} type="button" variant="outline" size="xs" className={AG_SECONDARY_BTN} onClick={() => set({ customTypeLabel: s })}>
                    {s}
                  </Button>
                ))}
              </div>
            )}
            {err('customTypeLabel') && <FieldError>{err('customTypeLabel')}</FieldError>}
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="note-text">תוכן</FieldLabel>
          <Textarea id="note-text" value={f.noteText} onChange={(e) => set({ noteText: e.target.value })} rows={2} placeholder="מה סוכם עם הלקוח" className={FIELD} />
        </Field>

        <div className="grid grid-cols-2 gap-[13px]">
          <Field data-invalid={!!err('actionDate') || undefined}>
            <FieldLabel htmlFor="note-date">
              {DATE_LABEL[f.noteType]}
              {active ? ' *' : ''}
            </FieldLabel>
            <Input
              id="note-date"
              type="date"
              value={f.actionDate}
              onChange={(e) => set({ actionDate: e.target.value })}
              aria-invalid={!!err('actionDate') || undefined}
              className={FIELD}
            />
            {err('actionDate') && <FieldError>{err('actionDate')}</FieldError>}
          </Field>
          <Field data-invalid={!!err('reminderDate') || undefined}>
            <FieldLabel htmlFor="note-reminder">תזכורת</FieldLabel>
            <Input
              id="note-reminder"
              type="date"
              value={f.reminderDate}
              onChange={(e) => set({ reminderDate: e.target.value })}
              aria-invalid={!!err('reminderDate') || undefined}
              className={FIELD}
            />
            {err('reminderDate') && <FieldError>{err('reminderDate')}</FieldError>}
          </Field>
        </div>

        <Field data-invalid={!!err('amount') || undefined}>
          <FieldLabel htmlFor="note-amount">סכום (₪)</FieldLabel>
          <Input
            id="note-amount"
            inputMode="decimal"
            dir="ltr"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="לא חובה"
            aria-invalid={!!err('amount') || undefined}
            className={cn(FIELD, 'w-40 text-start tabular-nums')}
          />
          {err('amount') && <FieldError>{err('amount')}</FieldError>}
        </Field>

        {(active || previews.length > 0) && (
          <div className="flex flex-col gap-1 rounded-[6px] bg-ag-cobalt-tint px-3 py-2 text-[12.5px] text-ag-cobalt" aria-live="polite">
            {previews.length > 0 ? (
              previews.map((p) => (
                <span key={`${p.taskType}-${p.date}`} className="flex items-start gap-1.5">
                  <CalendarClockIcon className="mt-0.5 size-3.5 shrink-0" />
                  {taskPreviewLine(p)}
                </span>
              ))
            ) : (
              <FieldDescription className="text-[12.5px] text-ag-cobalt">בחרו תאריך, ויופיע כאן מתי תיפתח המשימה אם החודש לא יתאפס.</FieldDescription>
            )}
          </div>
        )}
      </FieldGroup>

      {failed && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{failed}</AlertTitle>
          <AlertDescription>מה שכתבתם נשאר בטופס.</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving} className={cn(AG_PRIMARY_BTN, 'h-8')}>
          {saving && <Spinner data-icon="inline-start" />}
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" className={cn(AG_SECONDARY_BTN, 'h-8')} onClick={onCancel} disabled={saving}>
          ביטול
        </Button>
      </div>
    </form>
  );
}