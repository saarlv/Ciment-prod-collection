import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

export const HEAD = 'text-xs font-semibold text-muted-foreground';

export function TestMark({ on }: { on?: boolean | null }) {
  return on ? <StatusBadge value="נתוני בדיקה" tone="neutral" /> : null;
}

export function ActiveBadge({ active }: { active?: boolean | null }) {
  return <StatusBadge value={active === false ? 'לא פעיל' : 'פעיל'} tone={active === false ? 'neutral' : 'done'} />;
}

/** The glass card of one roles list: title with count, one explaining line, "הוספה", then the table / states. */
export function RolesSection({
  title,
  count,
  description,
  addLabel,
  onAdd,
  isLoading,
  isError,
  errorWhat,
  children,
}: {
  title: string;
  count: number;
  description: ReactNode;
  addLabel: string;
  onAdd: () => void;
  isLoading: boolean;
  isError: boolean;
  errorWhat: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="glass glass-lift flex flex-col gap-[13px] overflow-hidden rounded-[26px] border">
      <div className="flex flex-wrap items-start justify-between gap-[13px] px-[21px] pt-[21px]">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-base font-bold">
            {title} <span className="font-medium text-muted-foreground">({count})</span>
          </h2>
          <span className="text-[13px] text-muted-foreground">{description}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd} disabled={isError}>
          <PlusIcon data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>
      {isError ? (
        <div className="px-[21px] pb-[21px]">
          <LoadError what={errorWhat} />
        </div>
      ) : isLoading ? (
        <LoadingRows rows={3} />
      ) : (
        children
      )}
      <div className="pb-[8px]" />
    </section>
  );
}

/** Edit + delete (with confirmation) for one row. */
export function RowActions({
  name,
  onEdit,
  onDelete,
  deleteNote,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
  deleteNote: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await onDelete();
      toast.add({ title: 'נמחק', description: name, type: 'success' });
      setOpen(false);
    } catch {
      toast.add({ title: 'המחיקה לא הצליחה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" aria-label={`עריכת ${name}`} onClick={onEdit}>
        <PencilIcon />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`מחיקת ${name}`} />}>
          <Trash2Icon />
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את {name}?</AlertDialogTitle>
            <AlertDialogDescription>{deleteNote}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>ביטול</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={remove}>
              {busy && <Spinner data-icon="inline-start" />}
              מחיקה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Add / edit dialog: the fields are the children; "שמירה" submits. The popup unmounts on close, so a form's state starts fresh each time. */
export function RoleFormDialog({
  open,
  onOpenChange,
  title,
  description,
  canSave,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  canSave: boolean;
  onSave: () => Promise<unknown>;
  children: ReactNode;
}) {
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave();
      toast.add({ title: 'נשמר', type: 'success' });
      onOpenChange(false);
    } catch {
      toast.add({ title: 'השמירה לא הצליחה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-[21px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              ביטול
            </Button>
            <Button type="submit" disabled={!canSave || saving}>
              {saving && <Spinner data-icon="inline-start" />}
              שמירה
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One labelled text input of a roles form. `ltr` for emails and phone numbers. */
export function TextField({
  id,
  label,
  value,
  onChange,
  ltr,
  type = 'text',
  required,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  ltr?: boolean;
  type?: 'text' | 'email' | 'tel';
  required?: boolean;
  hint?: string;
}) {
  const invalid = type === 'email' && !isValidEmail(value);
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span className="text-muted-foreground"> *</span>}
      </FieldLabel>
      <Input
        id={id}
        type={type}
        dir={ltr ? 'ltr' : 'auto'}
        value={value}
        required={required}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="bg-glass-card"
      />
      {invalid ? <FieldDescription>כתובת המייל לא תקינה.</FieldDescription> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

export const isValidEmail = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** The "פעיל" switch of a roles form. */
export function ActiveField({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field orientation="horizontal">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <FieldLabel htmlFor={id}>פעיל</FieldLabel>
    </Field>
  );
}