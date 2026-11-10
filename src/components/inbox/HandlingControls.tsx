import { useState } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckIcon, HourglassIcon, RotateCcwIcon } from 'lucide-react';
import { SetEmailHandlingAction } from '@/product-types';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { HANDLED, NOT_HANDLED, WAITING } from '@/utils/Inbox';
import type { HandlingState } from '@/utils/Inbox';

const WAITING_SUGGESTIONS = ['ממתין ללקוח', 'ממתין ללוגיסטיקה', 'ממתין לאישור סוכן', 'ממתין להתאמת התקבול'];

/** SetEmailHandling for one or many mails; returns true when it was saved. */
export function useSetHandling() {
  const scope = useOwnerScope();
  const { executeFunction } = useExecuteAction(SetEmailHandlingAction);
  return async (ids: string[], state: HandlingState, waitingFor?: string): Promise<boolean> => {
    try {
      const res = await executeFunction({ inboundEmailIds: ids, state, waitingFor: state === WAITING ? waitingFor : undefined, by: scope.actorName });
      if (res?.errors?.length) {
        toast.add({ title: 'מצב הטיפול לא נשמר', description: res.errors.join(' · '), type: 'error' });
        return false;
      }
      const n = res?.updated ?? ids.length;
      toast.add({ title: n === 1 ? `המייל סומן ״${state}״` : `${n} מיילים סומנו ״${state}״`, type: 'success' });
      return true;
    } catch {
      toast.add({ title: 'מצב הטיפול לא נשמר', description: 'נסו שוב בעוד רגע.', type: 'error' });
      return false;
    }
  };
}

/** "ממתין" needs who we wait for: a small dialog with suggestions. */
function WaitingDialog({
  open,
  onOpenChange,
  count,
  initial,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  initial?: string | null;
  busy: boolean;
  onConfirm: (waitingFor: string) => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  const [touched, setTouched] = useState(false);
  const invalid = touched && !value.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{count === 1 ? 'סימון ״ממתין״' : `סימון ${count} מיילים ״ממתין״`}</DialogTitle>
          <DialogDescription>למי מחכים? זה יופיע בשורה ובפאנל של המייל.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="waiting-for">ממתין ל…</FieldLabel>
          <Input
            id="waiting-for"
            value={value}
            aria-invalid={invalid || undefined}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="לדוגמה: ממתין ללקוח"
            className="bg-glass-card"
          />
          {invalid ? <FieldError>חובה לכתוב למי מחכים.</FieldError> : <FieldDescription>אפשר לבחור ניסוח מוכן:</FieldDescription>}
          <div className="flex flex-wrap gap-1.5">
            {WAITING_SUGGESTIONS.map((s) => (
              <Button key={s} type="button" variant="ghost" size="sm" className="h-7 rounded-full bg-glass-soft px-2.5 text-xs" onClick={() => setValue(s)}>
                {s}
              </Button>
            ))}
          </div>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setTouched(true);
              if (value.trim()) onConfirm(value.trim());
            }}
          >
            {busy && <Spinner data-icon="inline-start" />}
            סימון ממתין
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The three handling buttons (טופל / ממתין / לא טופל) for one mail or a selection.
 * `current` hides the button of the state the mail is already in.
 */
export function HandlingButtons({
  ids,
  current,
  waitingFor,
  onDone,
  size = 'default',
}: {
  ids: string[];
  current?: HandlingState;
  waitingFor?: string | null;
  onDone?: () => void;
  size?: 'sm' | 'default';
}) {
  const setHandling = useSetHandling();
  const [busy, setBusy] = useState<HandlingState | null>(null);
  const [waitOpen, setWaitOpen] = useState(false);

  async function run(state: HandlingState, wait?: string) {
    setBusy(state);
    const ok = await setHandling(ids, state, wait);
    setBusy(null);
    if (ok) {
      setWaitOpen(false);
      onDone?.();
    }
  }

  const disabled = !!busy || ids.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {current !== HANDLED && (
        <Button size={size} variant="outline" disabled={disabled} onClick={() => run(HANDLED)}>
          {busy === HANDLED ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
          סימון טופל
        </Button>
      )}
      <Button size={size} variant="outline" disabled={disabled} onClick={() => setWaitOpen(true)}>
        <HourglassIcon data-icon="inline-start" />
        {current === WAITING ? 'שינוי ממתין' : 'סימון ממתין'}
      </Button>
      {current !== NOT_HANDLED && (
        <Button size={size} variant="ghost" disabled={disabled} onClick={() => run(NOT_HANDLED)}>
          {busy === NOT_HANDLED ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
          החזרה ל״לא טופל״
        </Button>
      )}
      {waitOpen && (
        <WaitingDialog
          open={waitOpen}
          onOpenChange={setWaitOpen}
          count={ids.length}
          initial={waitingFor}
          busy={busy === WAITING}
          onConfirm={(w) => run(WAITING, w)}
        />
      )}
    </div>
  );
}