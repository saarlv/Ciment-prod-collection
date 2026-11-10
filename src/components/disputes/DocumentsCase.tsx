import { useState } from 'react';
import type { ReactNode } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckIcon, ClockIcon, ExternalLinkIcon, FlaskConicalIcon, RefreshCwIcon, ScanLineIcon, XIcon } from 'lucide-react';
import { CheckDocumentScansAction } from '@/product-types';
import { AgentEmpty, LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { CLOSED, disputeTone } from '@/utils/Disputes';
import type { CheckScansResult, DeliveryNote, Dispute, ScanCheckCase } from '@/utils/Disputes';
import { formatDate, formatDateTime, formatNumber } from '@/utils/Format';

const HEAD = 'text-xs font-semibold text-muted-foreground';

type Outcome = { title: string; tone: 'default' | 'destructive'; lines: ReactNode[] };

function caseLines(c: ScanCheckCase | undefined): ReactNode[] {
  if (!c) return [];
  const out: ReactNode[] = [];
  out.push(
    <span key="action" className="flex flex-wrap items-center gap-1.5">
      הפעולה: <StatusBadge value={c.action || 'ללא שינוי'} tone={c.action === 'ללא שינוי' ? 'neutral' : disputeTone(c.after)} />
      {c.steps && c.steps.length > 1 && <span className="text-xs text-muted-foreground">({c.steps.join(' ← ')})</span>}
    </span>,
  );
  if (c.before && c.after) out.push(<span key="status">סטטוס: {c.before === c.after ? c.after : `${c.before} ← ${c.after}`}</span>);
  if (typeof c.scanned === 'number' && typeof c.expected === 'number')
    out.push(
      <span key="count" dir="ltr" className="self-start tabular-nums">
        {c.scanned}/{c.expected}
      </span>,
    );
  if (c.clockUsed) out.push(<span key="clock">{c.clockUsed}</span>);
  if (c.note) out.push(<span key="note">{c.note}</span>);
  return out;
}

/** The delivery notes of the case's invoices: scanned ✓/✗, when, and the scan link. */
function NotesTable({ notes }: { notes: DeliveryNote[] }) {
  return (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD, 'ps-[21px]')}>תעודה</TableHead>
          <TableHead className={HEAD}>חשבונית</TableHead>
          <TableHead className={HEAD}>תאריך אספקה</TableHead>
          <TableHead className={HEAD}>אתר</TableHead>
          <TableHead className={HEAD}>סרוקה</TableHead>
          <TableHead className={HEAD}>נסרקה</TableHead>
          <TableHead className={cn(HEAD, 'pe-[21px]')}>סריקה</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {notes.map((n) => (
          <TableRow key={n.id} className="hover:bg-glass-faint">
            <TableCell className="ps-[21px] font-semibold tabular-nums" dir="ltr">
              {n.noteNumber || '—'}
            </TableCell>
            <TableCell className="tabular-nums" dir="ltr">
              {n.invoiceNumber || '—'}
            </TableCell>
            <TableCell className="tabular-nums">{formatDate(n.deliveryDate)}</TableCell>
            <TableCell>{n.siteName || '—'}</TableCell>
            <TableCell>
              {n.scanned ? (
                <span className="inline-flex items-center gap-1 text-success-ink">
                  <CheckIcon className="size-4" />
                  <span className="text-xs font-semibold">סרוקה</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-critical-ink">
                  <XIcon className="size-4" />
                  <span className="text-xs font-semibold">חסרה</span>
                </span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(n.scannedAt)}</TableCell>
            <TableCell className="pe-[21px]">
              {n.scanUrl ? (
                <a href={n.scanUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
                  <ExternalLinkIcon className="size-3.5" />
                  פתיחה
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The documents case below the hero: the delivery-notes table and "בדיקה מחדש" on the real clock.
 */
export function DocumentsEvidence({ dispute, notes, isLoading, isError }: { dispute: Dispute; notes: DeliveryNote[]; isLoading: boolean; isError: boolean }) {
  const scope = useOwnerScope();
  const closed = dispute.status === CLOSED;
  const { executeFunction: checkScans } = useExecuteAction(CheckDocumentScansAction);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function runCheck(asOf: string | null, key: string) {
    setBusy(key);
    try {
      const res = (await checkScans({ disputeId: dispute.id, requestedBy: scope.actorName, ...(asOf ? { asOfDate: asOf } : {}) })) as CheckScansResult;
      const c = res.cases?.find((x) => x.disputeId === dispute.id) ?? res.cases?.[0];
      const lines = caseLines(c);
      if (res.asOf) lines.push(<span key="asof">נבדק נכון ל־{formatDateTime(res.asOf)}</span>);
      if (res.testClockNote) lines.push(<span key="tc">{res.testClockNote}</span>);
      if (res.errors?.length) lines.push(<span key="err">{res.errors.join(' · ')}</span>);
      setOutcome({ title: c?.action || (res.errors?.length ? 'הבדיקה לא הושלמה' : 'ללא שינוי'), tone: res.errors?.length ? 'destructive' : 'default', lines });
    } catch {
      toast.add({ title: 'הבדיקה לא רצה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
    setBusy(null);
  }


  return (
    <>
      <section aria-label="תעודות המשלוח" className="glass glass-lift flex flex-col gap-[13px] overflow-hidden rounded-[26px] border">
        <div className="flex flex-wrap items-center justify-between gap-[13px] px-[21px] pt-[21px]">
          <div className="flex flex-col">
            <h2 className="text-base font-bold">
              תעודות המשלוח <span className="font-medium text-muted-foreground">({notes.length})</span>
            </h2>
            <span className="text-[13px] text-muted-foreground">מתוך Priority. כשכל התעודות סרוקות, מאיה מכינה חבילה ללקוח: החשבונית וכל הסריקות.</span>
          </div>
          <Button variant="outline" className="h-10 rounded-full px-[18px] font-semibold" disabled={!!busy || closed} onClick={() => runCheck(null, 'now')}>
            {busy === 'now' ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
            בדיקה מחדש
          </Button>
        </div>
        {isError ? (
          <div className="px-[21px] pb-[21px]">
            <LoadError what="תעודות המשלוח" />
          </div>
        ) : isLoading ? (
          <LoadingRows rows={4} />
        ) : notes.length === 0 ? (
          <AgentEmpty agent="maya" title="אין תעודות משלוח ב-Priority לחשבוניות האלה">
            מאיה סופרת לפי מספר התעודות שהחשבונית מצפה לו. כשהתעודות ייקלטו מ-Priority הן יופיעו כאן.
          </AgentEmpty>
        ) : (
          <NotesTable notes={notes} />
        )}
        <div className="pb-[8px]" />
      </section>

      {outcome && (
        <Alert variant={outcome.tone} className="glass border">
          <ScanLineIcon />
          <AlertTitle>{outcome.title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">{outcome.lines}</AlertDescription>
        </Alert>
      )}

    </>
  );
}