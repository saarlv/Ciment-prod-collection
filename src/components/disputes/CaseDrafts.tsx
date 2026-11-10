import { useState } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckIcon, EyeIcon, EyeOffIcon, ExternalLinkIcon, XIcon } from 'lucide-react';
import { DecideApprovalAction } from '@/product-types';
import { AgentEmpty, LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { PdfViewer } from '@/components/ui/pdf-viewer';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import type { ApprovalDecisionResult } from '@/utils/CollectionsTypes';
import { KIND_LOGISTICS, KIND_PACKAGE, KIND_PRICE_REQUEST } from '@/utils/Disputes';
import type { CaseDraft } from '@/utils/Disputes';
import { formatDateTime } from '@/utils/Format';
import { APPROVED_NOT_SENT, splitUrls } from '@/utils/Inbox';

const KIND_LABEL: Record<string, string> = {
  [KIND_LOGISTICS]: 'פנייה ללוגיסטיקה',
  [KIND_PACKAGE]: 'חבילה ללקוח',
  [KIND_PRICE_REQUEST]: 'בקשת אישור מחיר',
};

/** File name for a link: the last path segment, decoded. */
function fileLabel(url: string, i: number) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    return last || `קובץ ${i + 1}`;
  } catch {
    return `קובץ ${i + 1}`;
  }
}

/** One attachment: a link that opens it, and an inline PDF preview on demand. */
function Attachment({ url, index }: { url: string; index: number }) {
  const [preview, setPreview] = useState(false);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-[13px] font-semibold text-link hover:underline">
          <ExternalLinkIcon className="size-3.5 shrink-0" />
          <span dir="ltr" className="truncate">
            {fileLabel(url, index)}
          </span>
        </a>
        <Button variant="ghost" size="sm" className="h-7 rounded-full bg-glass-soft px-2.5 text-xs" onClick={() => setPreview((p) => !p)}>
          {preview ? <EyeOffIcon data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
          {preview ? 'הסתרת התצוגה' : 'תצוגה מקדימה'}
        </Button>
      </div>
      {preview && (
        <div className="h-[520px] overflow-hidden rounded-[22px] border border-glass-edge bg-glass-card">
          <PdfViewer file={url} defaultWidth={560} minWidth={320} />
        </div>
      )}
    </li>
  );
}

function RejectDialog({ open, onOpenChange, onConfirm, busy }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (note: string) => void; busy: boolean }) {
  const [note, setNote] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>דחיית הטיוטה</DialogTitle>
          <DialogDescription>הטיוטה תסומן נדחתה. המקרה נשאר פתוח.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="reject-case-draft-note">למה? (לא חובה)</FieldLabel>
          <Textarea id="reject-case-draft-note" value={note} onChange={(e) => setNote(e.target.value)} className="bg-glass-card" />
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

function DraftCard({ draft, primary }: { draft: CaseDraft; primary: boolean }) {
  const scope = useOwnerScope();
  const { executeFunction: decide } = useExecuteAction(DecideApprovalAction);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const pending = draft.status === 'ממתין';
  const urls = splitUrls(draft.attachmentUrls);

  async function run(decision: 'approve' | 'reject', note?: string) {
    setBusy(decision);
    try {
      const res = (await decide({ decision, approvalIds: [draft.id], decidedBy: scope.actorName, ...(note ? { note } : {}) })) as ApprovalDecisionResult;
      if (res.errors?.length) toast.add({ title: 'ההחלטה לא נשמרה', description: res.errors.join(' · '), type: 'error' });
      else if (!res.updated?.length && res.skipped?.length) toast.add({ title: 'הטיוטה כבר לא ממתינה', description: 'מישהו אחר כבר החליט עליה.', type: 'error' });
      else if (decision === 'approve') toast.add({ title: APPROVED_NOT_SENT, description: 'הטיוטה אושרה. שום דבר לא נשלח מהאפליקציה.', type: 'success' });
      else {
        toast.add({ title: 'הטיוטה נדחתה', type: 'success' });
        setRejectOpen(false);
      }
    } catch {
      toast.add({ title: 'ההחלטה לא נשמרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
    setBusy(null);
  }

  return (
    <article className="glass-inner flex flex-col gap-[13px] p-[21px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={KIND_LABEL[draft.kind ?? ''] ?? draft.kind} tone="active" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {draft.draftedBy ? `${draft.draftedBy} · ` : ''}
            {formatDateTime(draft.draftedAt)}
          </span>
          {draft.isTestFixture && <StatusBadge value="נתוני בדיקה" tone="neutral" />}
        </div>
        <StatusBadge value={pending ? 'ממתין לאישור' : draft.status} tone={pending ? 'warning' : undefined} />
      </div>
      <dl className="grid gap-[13px] sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">אל</dt>
          <dd className="text-sm font-semibold break-words">
            {draft.recipientName && <span>{draft.recipientName} · </span>}
            <span dir="ltr">{draft.recipientContact || 'אין נמען רשום'}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">מתיבה</dt>
          <dd className="text-sm font-semibold" dir="ltr">
            {draft.fromMailbox || '—'}
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{draft.subject || 'ללא נושא'}</span>
        <p dir="auto" className="max-h-72 overflow-y-auto text-sm whitespace-pre-wrap">
          {draft.body || '—'}
        </p>
      </div>
      {draft.reason && <p className="text-[13px] text-muted-foreground">למה: {draft.reason}</p>}
      {urls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">קבצים מצורפים ({urls.length})</span>
          <ul className="flex flex-col gap-2">
            {urls.map((u, i) => (
              <Attachment key={`${u}-${i}`} url={u} index={i} />
            ))}
          </ul>
        </div>
      )}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={primary ? 'default' : 'outline'}
            className={primary ? 'h-10 rounded-full px-[18px] font-bold shadow-primary' : 'h-10 rounded-full px-[18px] font-semibold'}
            disabled={!!busy}
            onClick={() => run('approve')}
          >
            {busy === 'approve' ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
            אשר
          </Button>
          <Button variant="ghost" disabled={!!busy} onClick={() => setRejectOpen(true)}>
            <XIcon data-icon="inline-start" />
            דחה
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
      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onConfirm={(note) => run('reject', note)} busy={busy === 'reject'} />
    </article>
  );
}

/** Every draft Maya prepared on a case (relatedTable Disputes): approve stops at "אושר – לא נשלח"; nothing is sent. */
export function CaseDrafts({
  drafts,
  isLoading,
  isError,
  allowPrimary = true,
}: {
  drafts: CaseDraft[];
  isLoading: boolean;
  isError: boolean;
  /** False when the screen's one primary button is elsewhere (the next approval mark). */
  allowPrimary?: boolean;
}) {
  const firstPending = allowPrimary ? drafts.find((d) => d.status === 'ממתין')?.id : undefined;
  return (
    <section aria-label="טיוטות המקרה" className="glass glass-lift flex flex-col gap-[13px] overflow-hidden rounded-[26px] border">
      <div className="flex flex-col px-[21px] pt-[21px]">
        <h2 className="text-base font-bold">
          הטיוטות של מאיה <span className="font-medium text-muted-foreground">({drafts.length})</span>
        </h2>
        <span className="text-[13px] text-muted-foreground">שום דבר לא נשלח. אישור מסמן ״{APPROVED_NOT_SENT}״, ואת השליחה עושים מחוץ לאפליקציה.</span>
      </div>
      {isError ? (
        <div className="px-[21px] pb-[21px]">
          <LoadError what="הטיוטות" />
        </div>
      ) : isLoading ? (
        <LoadingRows rows={3} />
      ) : drafts.length === 0 ? (
        <AgentEmpty agent="maya" title="אין טיוטות במקרה">
          מאיה מכינה כאן את הפנייה ללוגיסטיקה, התזכורת, החבילה ללקוח או בקשת אישור המחיר, לפי שלב המקרה.
        </AgentEmpty>
      ) : (
        <div className="flex flex-col gap-[13px] px-[21px]">
          {drafts.map((d) => (
            <DraftCard key={`${d.id}:${d.status}`} draft={d} primary={d.id === firstPending} />
          ))}
        </div>
      )}
      <div className="pb-[8px]" />
    </section>
  );
}