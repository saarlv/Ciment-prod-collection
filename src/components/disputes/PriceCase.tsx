import { useState } from 'react';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AlertCircleIcon, CheckIcon, ClipboardCopyIcon, ShieldCheckIcon } from 'lucide-react';
import { CollectionQueueEntity, InboundEmailsEntity, MarkPriceApprovalAction } from '@/product-types';
import { AgentAvatar } from '@/components/AgentPanel';
import { AgentEmpty, LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { CLOSED, ST_CREDIT, STEP_AGENT, STEP_MANAGER } from '@/utils/Disputes';
import type { ApprovalStep, Dispute, MarkApprovalResult, PriceGapResult, PriceLine } from '@/utils/Disputes';
import { formatDate, formatDateTime, formatILS, formatNumber } from '@/utils/Format';
import type { InboundEmail } from '@/utils/Inbox';

const HEAD = 'text-xs font-semibold text-muted-foreground';

export interface GapQuery {
  data?: PriceGapResult;
  isLoading: boolean;
  isError: boolean;
  isRefreshing: boolean;
}

function validity(from?: string | null, to?: string | null) {
  if (!from && !to) return null;
  return `${from ? formatDate(from) : '…'} – ${to ? formatDate(to) : 'ללא תפוגה'}`;
}

function GapTable({ lines, total, undercharged }: { lines: PriceLine[]; total?: number; undercharged?: number }) {
  return (
    <Table className="min-w-[1240px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD, 'ps-[21px]')}>פריט</TableHead>
          <TableHead className={HEAD}>כמות</TableHead>
          <TableHead className={HEAD}>מחיר בחשבונית</TableHead>
          <TableHead className={HEAD}>מחירון</TableHead>
          <TableHead className={HEAD}>מחירון נוכחי</TableHead>
          <TableHead className={HEAD}>מקור המחיר</TableHead>
          <TableHead className={HEAD}>אישור מנהל</TableHead>
          <TableHead className={HEAD}>טקסט בהזמנה</TableHead>
          <TableHead className={HEAD}>פער ליח׳</TableHead>
          <TableHead className={HEAD}>פער בשורה</TableHead>
          <TableHead className={cn(HEAD, 'pe-[21px]')}>סיבה</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l, i) => {
          const gap = Number(l.gapTotal ?? 0);
          return (
            <TableRow key={l.lineKey ?? i} className={cn('hover:bg-glass-faint', !l.reason && 'text-muted-foreground')}>
              <TableCell className="max-w-56 ps-[21px] align-top whitespace-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">{l.itemName || '—'}</span>
                  {l.sku && (
                    <span dir="ltr" className="self-end text-xs text-muted-foreground">
                      {l.sku}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="align-top tabular-nums">{formatNumber(l.quantity)}</TableCell>
              <TableCell className="align-top font-semibold tabular-nums">{formatILS(l.unitPrice)}</TableCell>
              <TableCell className="align-top">
                {l.listPrice === null || l.listPrice === undefined ? (
                  <span className="text-xs">לא נמצא מחירון</span>
                ) : (
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-semibold tabular-nums">{formatILS(l.listPrice)}</span>
                    {l.listSource && <StatusBadge value={l.listSource === 'אתר' ? 'מחירון אתר' : 'מחירון לקוח'} tone="neutral" />}
                    {validity(l.validFrom, l.validTo) && <span className="text-xs text-muted-foreground tabular-nums">{validity(l.validFrom, l.validTo)}</span>}
                  </div>
                )}
              </TableCell>
              <TableCell className="align-top">
                {l.currentListPrice === null || l.currentListPrice === undefined ? (
                  '—'
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span className="tabular-nums">{formatILS(l.currentListPrice)}</span>
                    {l.currentValidFrom && <span className="text-xs text-muted-foreground">מ־{formatDate(l.currentValidFrom)}</span>}
                  </div>
                )}
              </TableCell>
              <TableCell className="align-top">{l.priceSource || '—'}</TableCell>
              <TableCell className="align-top text-[13px]">{l.managerApprovalStatus || '—'}</TableCell>
              <TableCell className="max-w-48 align-top text-[13px] whitespace-normal">{l.freeText || '—'}</TableCell>
              <TableCell className="align-top tabular-nums">{l.reason ? formatILS(l.gapPerUnit) : '—'}</TableCell>
              <TableCell className={cn('align-top tabular-nums', l.reason && gap > 0 && 'font-bold text-foreground')}>{l.reason ? formatILS(gap) : '—'}</TableCell>
              <TableCell className="pe-[21px] align-top">
                {l.reason ? <StatusBadge value={l.reason} tone={l.reason === 'ללא חיוב' ? 'neutral' : 'warning'} /> : <span className="text-xs">אין פער</span>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter className="bg-glass-faint">
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="ps-[21px] font-bold">
            סה״כ פער לזיכוי
            {undercharged ? <span className="ms-2 text-xs font-normal text-muted-foreground">שורות ללא חיוב: {formatILS(undercharged)} (לא לזיכוי)</span> : null}
          </TableCell>
          <TableCell colSpan={2} className="pe-[21px] text-base font-extrabold tabular-nums">
            {formatILS(total)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

/** The evidence window: pasted email text or a link, optionally taken from one of the customer's emails. */
function EvidenceDialog({
  open,
  onOpenChange,
  step,
  dispute,
  emails,
  onMarked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  step: ApprovalStep;
  dispute: Dispute;
  emails: InboundEmail[];
  onMarked: () => void;
}) {
  const scope = useOwnerScope();
  const { executeFunction: mark } = useExecuteAction(MarkPriceApprovalAction);
  const [evidence, setEvidence] = useState('');
  const [emailId, setEmailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const who = step === STEP_AGENT ? dispute.salesAgentName || 'הסוכן' : dispute.salesManagerName || 'המנהל';
  const items = [
    { label: 'בלי מייל – הדבקה ידנית', value: null as string | null },
    ...emails.map((e) => ({
      label: `${formatDateTime(e.receivedAt)} · ${e.fromName || e.fromAddress || ''} · ${e.subject || 'ללא נושא'}`,
      value: e.id as string | null,
    })),
  ];

  function pick(id: string | null) {
    setEmailId(id);
    setRefusal(null);
    const e = emails.find((x) => x.id === id);
    if (e) setEvidence([e.subject, e.bodyText].filter(Boolean).join('\n\n'));
  }

  async function confirm() {
    setBusy(true);
    setRefusal(null);
    try {
      const res = (await mark({
        disputeId: dispute.id,
        step,
        evidence,
        markedBy: scope.actorName,
        ...(emailId ? { evidenceInboundEmailId: emailId } : {}),
      })) as MarkApprovalResult;
      if (res.refused) setRefusal(res.reason || 'הסימון נחסם.');
      else if (res.errors?.length) setRefusal(res.errors.join(' · '));
      else {
        toast.add({ title: `נשמר: ${step}`, description: `${who} · סומן על ידי ${scope.actorName}`, type: 'success' });
        onMarked();
        onOpenChange(false);
        setEvidence('');
        setEmailId(null);
      }
    } catch {
      setRefusal('הסימון לא נשמר. נסו שוב בעוד רגע.');
    }
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setRefusal(null);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>סימון: {step}</DialogTitle>
          <DialogDescription>
            {who} אישר את המחיר מחוץ לאפליקציה. צרפו את הראיה: טקסט המייל או קישור. נשמרים מי סימן ומתי.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {emails.length > 0 && (
            <Field>
              <FieldLabel htmlFor="evidence-email">מייל של הלקוח כראיה (לא חובה)</FieldLabel>
              <Select items={items} value={emailId} onValueChange={(v) => pick((v as string | null) ?? null)}>
                <SelectTrigger id="evidence-email" className="w-full bg-glass-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {items.map((i) => (
                      <SelectItem key={i.value ?? 'none'} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>בחירה ממלאת את הנושא ואת גוף המייל, ושומרת הפניה למייל.</FieldDescription>
            </Field>
          )}
          <Field data-invalid={!!refusal || undefined}>
            <FieldLabel htmlFor="evidence-text">הראיה</FieldLabel>
            <Textarea
              id="evidence-text"
              dir="auto"
              rows={8}
              value={evidence}
              aria-invalid={!!refusal || undefined}
              onChange={(e) => {
                setEvidence(e.target.value);
                setRefusal(null);
              }}
              placeholder="הדביקו את מייל האישור, או קישור אליו"
              className="bg-glass-card"
            />
            {!evidence.trim() && <FieldDescription>חובה: בלי ראיה הסימון לא נשמר.</FieldDescription>}
          </Field>
        </FieldGroup>
        {refusal && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>הסימון נחסם</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button className="font-bold" disabled={busy} onClick={confirm}>
            {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
            סימון {step}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepCard({
  step,
  index,
  who,
  at,
  by,
  evidence,
  waitingNote,
  primary,
  disabled,
  onMark,
}: {
  step: ApprovalStep;
  index: number;
  who: string;
  at?: string | null;
  by?: string | null;
  evidence?: string | null;
  waitingNote?: string;
  primary: boolean;
  disabled: boolean;
  onMark: () => void;
}) {
  return (
    <div className={cn('glass-inner flex flex-1 flex-col gap-[13px] p-[21px]', waitingNote && !at && 'opacity-85')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">שלב {index}</span>
        <StatusBadge value={at ? 'סומן' : 'ממתין'} tone={at ? 'done' : 'warning'} />
      </div>
      <div className="flex flex-col">
        <h3 className="text-base font-bold">{step}</h3>
        <span className="text-[13px] text-muted-foreground">{who}</span>
      </div>
      {at ? (
        <>
          <span className="flex items-center gap-1.5 text-[13px]">
            <CheckIcon className="size-4 text-success-ink" />
            סומן על ידי <span className="font-semibold">{by || '—'}</span> · <span className="tabular-nums">{formatDateTime(at)}</span>
          </span>
          {evidence && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted-foreground">הראיה</span>
              <p dir="auto" className="max-h-48 overflow-y-auto rounded-[14px] bg-glass-card p-[13px] text-[13px] break-words whitespace-pre-wrap">
                {evidence}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {waitingNote && <span className="text-[13px] text-muted-foreground">{waitingNote}</span>}
          <Button
            variant={primary ? 'default' : 'outline'}
            className={cn('mt-auto h-10 self-start rounded-full px-[18px]', primary ? 'font-bold shadow-primary' : 'font-semibold')}
            disabled={disabled}
            onClick={onMark}
          >
            <ShieldCheckIcon data-icon="inline-start" />
            סימון: {step}
          </Button>
        </>
      )}
    </div>
  );
}

/** The price case below the hero: the per-line gap table, the two approval marks with evidence, the credit summary. */
export function PriceEvidence({ dispute, gap, onMarked }: { dispute: Dispute; gap: GapQuery; onMarked: () => void }) {
  const [dialogStep, setDialogStep] = useState<ApprovalStep | null>(null);
  const emailsQ = useEntityGetAll(
    InboundEmailsEntity,
    { where: { column: 'customerCode', value: dispute.customerCode ?? '' }, orderBy: [{ column: 'receivedAt', direction: 'desc' }], page: { size: 30 } },
    { enabled: !!dispute.customerCode },
  );
  const queueQ = useEntityGetAll(
    CollectionQueueEntity,
    { where: { column: 'customerCode', value: dispute.customerCode ?? '' }, orderBy: [{ column: 'queueDate', direction: 'desc' }] },
    { enabled: !!dispute.customerCode },
  );
  const emails = ((emailsQ.data ?? []) as InboundEmail[]).filter((e) => e.bodyStored !== false);
  const proposals = (queueQ.data ?? []).filter(
    (t) => (t.relatedTable === 'Disputes' && t.relatedId === dispute.id) || /אישור/.test(t.reasons ?? ''),
  );
  const closed = dispute.status === CLOSED;
  const agentDone = !!dispute.salesAgentApprovedAt;
  const managerDone = !!dispute.salesManagerApprovedAt;
  const a = gap.data;

  async function copyCredit() {
    try {
      await navigator.clipboard.writeText(dispute.creditDraftNote ?? '');
      toast.add({ title: 'התקציר הועתק', type: 'success' });
    } catch {
      toast.add({ title: 'ההעתקה לא הצליחה', description: 'סמנו את הטקסט והעתיקו ידנית.', type: 'error' });
    }
  }

  return (
    <>
      {dispute.status === ST_CREDIT && dispute.creditDraftNote && (
        <section aria-label="תקציר לזיכוי" className="glass-hero glass-lift flex flex-col gap-[13px] p-[21px] md:p-[34px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <h2 className="text-lg font-bold">תקציר לזיכוי — ליצירה ב-Priority על ידי אדם</h2>
              <span className="text-[13px] text-muted-foreground">שני האישורים סומנו. המערכת לא כותבת ל-Priority.</span>
            </div>
            <Button variant="ghost" className="rounded-full bg-glass-soft" onClick={copyCredit}>
              <ClipboardCopyIcon data-icon="inline-start" />
              העתקה
            </Button>
          </div>
          <p dir="auto" className="glass-inner p-[21px] text-sm leading-relaxed whitespace-pre-wrap">
            {dispute.creditDraftNote}
          </p>
        </section>
      )}

      <section aria-label="ניתוח הפער" className="glass glass-lift flex flex-col gap-[13px] overflow-hidden rounded-[26px] border">
        <div className="flex flex-wrap items-center justify-between gap-[13px] px-[21px] pt-[21px]">
          <div className="flex flex-col">
            <h2 className="text-base font-bold">
              ניתוח הפער לכל שורה {a?.lines && <span className="font-medium text-muted-foreground">({a.lines.length})</span>}
            </h2>
            <span className="text-[13px] text-muted-foreground">
              המחיר בחשבונית מול המחירון התקף בתאריך החשבונית: מחירון הלקוח קודם, אחר כך מחירון האתר{a?.siteName ? ` (${a.siteName})` : ''}.
            </span>
          </div>
          {gap.isRefreshing && <Spinner className="text-muted-foreground" />}
        </div>
        {gap.isError ? (
          <div className="px-[21px] pb-[21px]">
            <LoadError what="ניתוח הפער" />
          </div>
        ) : gap.isLoading ? (
          <LoadingRows rows={4} />
        ) : a?.refused || a?.errors?.length ? (
          <div className="px-[21px] pb-[21px]">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>הניתוח לא הושלם</AlertTitle>
              <AlertDescription>{a.refusalReason || a.errors?.join(' · ')}</AlertDescription>
            </Alert>
          </div>
        ) : !a?.lines?.length ? (
          <AgentEmpty agent="maya" title="אין שורות לחשבונית">
            מאיה משווה כל שורה בחשבונית למחירון. כשהשורות ייקלטו מ-Priority הניתוח יופיע כאן.
          </AgentEmpty>
        ) : (
          <GapTable lines={a.lines} total={a.totalGap} undercharged={a.underchargedTotal} />
        )}
        <div className="pb-[8px]" />
      </section>

      <section aria-label="סימוני האישור" className="glass glass-lift flex flex-col gap-[13px] rounded-[26px] border p-[21px]">
        <div className="flex flex-col">
          <h2 className="text-base font-bold">סימוני האישור</h2>
          <span className="text-[13px] text-muted-foreground">
            הסדר: קודם ״{STEP_AGENT}״, אחר כך ״{STEP_MANAGER}״. ראיה חובה בכל סימון. אחרי שני הסימונים המקרה עובר ל״{ST_CREDIT}״.
          </span>
        </div>
        <div className="flex flex-wrap gap-[13px] [&>*]:min-w-[min(100%,300px)]">
          <StepCard
            step={STEP_AGENT}
            index={1}
            who={dispute.salesAgentName || 'סוכן המכירות'}
            at={dispute.salesAgentApprovedAt}
            by={dispute.salesAgentApprovalMarkedBy}
            evidence={dispute.salesAgentApprovalEvidence}
            primary={!agentDone && !closed}
            disabled={closed}
            onMark={() => setDialogStep(STEP_AGENT)}
          />
          <StepCard
            step={STEP_MANAGER}
            index={2}
            who={dispute.salesManagerName || 'מנהל המכירות'}
            at={dispute.salesManagerApprovedAt}
            by={dispute.salesManagerApprovalMarkedBy}
            evidence={dispute.salesManagerApprovalEvidence}
            waitingNote={agentDone ? undefined : 'מחכה לאישור הסוכן. סימון לפני כן ייחסם.'}
            primary={agentDone && !managerDone && !closed}
            disabled={closed}
            onMark={() => setDialogStep(STEP_MANAGER)}
          />
        </div>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <AgentAvatar size="sm" agent="maya" />
          מאיה לא מסמנת אישורים. היא מציעה ומצרפת את המייל.
        </div>
        {proposals.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">ההצעות של מאיה</span>
            <ul className="flex flex-col gap-2">
              {proposals.map((t) => (
                <li key={t.id} className="glass-inner flex flex-wrap items-start justify-between gap-2 p-[13px] text-[13px]">
                  <span className="flex-1 whitespace-pre-wrap">{t.reasons || t.recommendedAction || '—'}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {t.assignedBookkeeperName}
                    <StatusBadge value={t.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {dialogStep && (
        <EvidenceDialog
          key={dialogStep}
          open={!!dialogStep}
          onOpenChange={(o) => !o && setDialogStep(null)}
          step={dialogStep}
          dispute={dispute}
          emails={emails}
          onMarked={onMarked}
        />
      )}
    </>
  );
}