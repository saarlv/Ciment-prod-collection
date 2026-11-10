import { useState } from 'react';
import { Link } from 'react-router';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckIcon, CornerDownLeftIcon, SaveIcon, XIcon } from 'lucide-react';
import { DecideApprovalAction } from '@/product-types';
import { StatusBadge } from '@/components/StatusBadge';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PdfViewer } from '@/components/ui/pdf-viewer';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import type { ApprovalDecisionResult } from '@/utils/CollectionsTypes';
import { formatDateTime, formatNumber } from '@/utils/Format';
import { APPROVED_NOT_SENT, referenceOf, splitUrls } from '@/utils/Inbox';
import type { Approval } from '@/utils/Inbox';

export type Decision = 'approve' | 'reject' | 'edit';

/** DecideApproval for drafts (by ids or a whole batch). Returns true when something was decided. */
export function useDecideApproval() {
  const scope = useOwnerScope();
  const { executeFunction } = useExecuteAction(DecideApprovalAction);
  return async (
    decision: Decision,
    target: { approvalIds?: string[]; batchId?: string },
    extra: { note?: string; subject?: string; body?: string } = {},
  ): Promise<ApprovalDecisionResult | null> => {
    try {
      const res = (await executeFunction({ decision, ...target, decidedBy: scope.actorName, ...extra })) as ApprovalDecisionResult;
      if (res.errors?.length) {
        toast.add({ title: 'ההחלטה לא נשמרה', description: res.errors.join(' · '), type: 'error' });
        return null;
      }
      if (!res.updated?.length && res.skipped?.length) {
        toast.add({ title: 'הטיוטה כבר לא ממתינה', description: 'מישהו אחר כבר החליט עליה.', type: 'error' });
        return null;
      }
      return res;
    } catch {
      toast.add({ title: 'ההחלטה לא נשמרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
      return null;
    }
  };
}

export function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
  count = 1,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (note: string) => void;
  busy: boolean;
  count?: number;
}) {
  const [note, setNote] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{count === 1 ? 'דחיית הטיוטה' : `דחיית ${formatNumber(count)} טיוטות`}</DialogTitle>
          <DialogDescription>הטיוטה תסומן ״נדחה״. שום דבר לא נשלח.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="reject-draft-note">למה? (לא חובה)</FieldLabel>
          <Textarea id="reject-draft-note" value={note} onChange={(e) => setNote(e.target.value)} className="bg-glass-card" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(note.trim())}>
            {busy && <Spinner data-icon="inline-start" />}
            דחה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One outbox draft: editable subject/body while pending, its PDF (the same file that is attached), and
 * approve / reject. Approving only moves it to "אושר – לא נשלח" — nothing is ever sent from the app.
 */
export function DraftCard({ draft, primary = false, showPdf = true }: { draft: Approval; primary?: boolean; showPdf?: boolean }) {
  const decide = useDecideApproval();
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [body, setBody] = useState(draft.body ?? '');
  const [busy, setBusy] = useState<Decision | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const pending = draft.status === 'ממתין';
  const dirty = pending && (subject !== (draft.subject ?? '') || body !== (draft.body ?? ''));
  const urls = splitUrls(draft.attachmentUrls);
  const id = `draft-${draft.id}`;

  async function save() {
    setBusy('edit');
    if (await decide('edit', { approvalIds: [draft.id] }, { subject, body })) toast.add({ title: 'השינויים בטיוטה נשמרו', type: 'success' });
    setBusy(null);
  }

  async function approve() {
    setBusy('approve');
    const ok = (!dirty || (await decide('edit', { approvalIds: [draft.id] }, { subject, body }))) && (await decide('approve', { approvalIds: [draft.id] }));
    if (ok) toast.add({ title: APPROVED_NOT_SENT, description: 'הטיוטה אושרה. שום דבר לא נשלח מהאפליקציה.', type: 'success' });
    setBusy(null);
  }

  async function reject(note: string) {
    setBusy('reject');
    if (await decide('reject', { approvalIds: [draft.id] }, note ? { note } : {})) {
      toast.add({ title: 'הטיוטה נדחתה', type: 'success' });
      setRejectOpen(false);
    }
    setBusy(null);
  }

  return (
    <article className="glass-inner flex flex-col gap-[13px] p-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{draft.kind || 'טיוטה'}</span>
        <StatusBadge value={pending ? 'ממתין לאישור' : draft.status} tone={pending ? 'warning' : undefined} />
        {draft.component && <StatusBadge value={draft.component} tone="neutral" />}
        <span dir="ltr" className="ms-auto text-xs font-semibold text-muted-foreground tabular-nums">
          {referenceOf(draft)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-[13px] text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">מתיבה</dt>
          <dd dir="ltr" className="text-end font-semibold break-all">
            {draft.fromMailbox || '—'}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">אל</dt>
          <dd className="font-semibold break-words">
            {draft.recipientName && <span>{draft.recipientName} · </span>}
            <span dir="ltr">{draft.recipientContact || '—'}</span>
          </dd>
        </div>
      </dl>
      {pending ? (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-subject`}>נושא</FieldLabel>
            <Input id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-glass-card" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-body`}>גוף</FieldLabel>
            <Textarea id={`${id}-body`} value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="bg-glass-card" />
            <FieldDescription>חתום בשם האחראית. אפשר לערוך לפני האישור.</FieldDescription>
          </Field>
        </FieldGroup>
      ) : (
        <div className="flex flex-col gap-2 rounded-[18px] bg-glass-card p-[13px]">
          <span className="text-sm font-bold">{draft.subject || 'ללא נושא'}</span>
          <p className="text-sm whitespace-pre-wrap">{draft.body || '—'}</p>
        </div>
      )}
      {draft.reason && <p className="text-[13px] text-muted-foreground">למה: {draft.reason}</p>}

      {showPdf &&
        (urls.length > 0 ? (
          urls.map((url, i) => (
            <div key={url} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                קובץ מצורף{urls.length > 1 ? ` ${i + 1}` : ''} · זה הקובץ שיצורף למייל
              </span>
              <div className="h-[520px] overflow-hidden rounded-[22px] border border-glass-edge bg-glass-card">
                <PdfViewer file={url} defaultWidth={520} minWidth={300} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">אין קובץ מצורף לטיוטה.</p>
        ))}

      {(draft.replyCount ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <CornerDownLeftIcon className="size-4 text-muted-foreground" />
          <span>
            {draft.replyCount === 1 ? 'התקבלה תשובה אחת' : `התקבלו ${formatNumber(draft.replyCount)} תשובות`}
            {draft.lastReplyAt ? `, האחרונה ${formatDateTime(draft.lastReplyAt)}` : ''}
          </span>
          {draft.lastReplyEmailId && (
            <Link
              to={`/collections/inbox?tab=inbox&email=${encodeURIComponent(draft.lastReplyEmailId)}`}
              className="font-semibold text-link hover:underline"
            >
              פתיחת התשובה
            </Link>
          )}
        </div>
      )}

      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button className={primary ? 'rounded-full px-[18px] font-bold shadow-primary' : undefined} variant={primary ? 'default' : 'outline'} disabled={!!busy} onClick={approve}>
            {busy === 'approve' ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
            אישור
          </Button>
          {dirty && (
            <Button variant="outline" disabled={!!busy} onClick={save}>
              {busy === 'edit' ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              שמירת העריכה
            </Button>
          )}
          <Button variant="ghost" disabled={!!busy} onClick={() => setRejectOpen(true)}>
            <XIcon data-icon="inline-start" />
            דחייה
          </Button>
          <span className="text-xs text-muted-foreground">אישור לא שולח דבר: הטיוטה נעצרת ב״{APPROVED_NOT_SENT}״.</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {draft.decidedBy ? `${draft.decidedBy} · ` : ''}
          {formatDateTime(draft.decidedAt)}
          {draft.decisionNote ? ` · ${draft.decisionNote}` : ''}
        </p>
      )}
      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onConfirm={reject} busy={busy === 'reject'} />
    </article>
  );
}