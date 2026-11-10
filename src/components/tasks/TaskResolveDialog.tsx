import { useState } from 'react';
import type { FormEvent } from 'react';
import { useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CollectionQueueEntity } from '@/product-types';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import type { Task } from '@/utils/Tasks';

export type ResolveMode = 'done' | 'dismiss';

const COPY: Record<ResolveMode, { title: string; label: string; placeholder: string; submit: string; toast: string }> = {
  done: { title: 'סימון כטופל', label: 'מה נעשה', placeholder: 'למשל: דיברתי עם הלקוח, ישלם עד יום ה׳', submit: 'טופל', toast: 'המשימה סומנה כטופלה' },
  dismiss: { title: 'דחיית המשימה', label: 'למה נדחתה', placeholder: 'למשל: החשבונית בטיפול הסוכן, לא לפנות', submit: 'דחייה', toast: 'המשימה נדחתה' },
};

function ResolveForm({ task, mode, onDone }: { task: Task; mode: ResolveMode; onDone: () => void }) {
  const scope = useOwnerScope();
  const { updateFunction, isLoading } = useEntityUpdate(CollectionQueueEntity);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const copy = COPY[mode];
  const invalid = touched && !note.trim();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    const reason = note.trim();
    if (!reason) return;
    const now = new Date().toISOString();
    try {
      await updateFunction({
        id: task.id,
        data: {
          status: mode === 'done' ? 'טופל' : 'נדחה',
          resolvedAt: now,
          resolvedReason: reason,
          handledBy: scope.actorName,
          handledAt: now,
        },
      });
      toast.add({ title: copy.toast, description: 'הסריקה של 06:00 לא תפתח אותה מחדש כל עוד הבעיה נמשכת.', type: 'success' });
      onDone();
    } catch {
      toast.add({ title: 'המשימה לא נשמרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[21px]">
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{[task.customerName, task.title].filter(Boolean).join(' · ')}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="task-note">{copy.label}</FieldLabel>
          <Input
            id="task-note"
            autoFocus
            maxLength={160}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.placeholder}
            aria-invalid={invalid || undefined}
          />
          <FieldDescription>{invalid ? 'כתבו הערה קצרה, שתישאר בהיסטוריה של המשימה.' : 'משפט אחד. נשמר עם המשימה.'}</FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          ביטול
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Spinner data-icon="inline-start" />}
          {copy.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Closes a task by hand (טופל / נדחה) with a required short note. The form remounts on every open. */
export function TaskResolveDialog({ task, mode, onClose }: { task: Task | null; mode: ResolveMode; onClose: () => void }) {
  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{task && <ResolveForm key={`${task.id}:${mode}`} task={task} mode={mode} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}