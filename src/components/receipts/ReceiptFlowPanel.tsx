import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { getRouteUrl, useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AlertCircleIcon, ArrowUpLeftIcon, CheckIcon, ClipboardCopyIcon, MailIcon, MailWarningIcon, ScanSearchIcon, SplitIcon, StampIcon, XIcon } from 'lucide-react';
import {
  ApprovalsEntity,
  BankLinesEntity,
  CollectionQueueEntity,
  CustomerContactsEntity,
  CustomerNotesEntity,
  CustomersEntity,
  DecideMatchProposalAction,
  IdentifyCustomersAction,
  IssueReceiptAction,
  MatchProposalsEntity,
  OpenMovementsEntity,
  ReceiptAllocationsEntity,
  ReceiptCheckStepsEntity,
  ReceiptsEntity,
} from '@/product-types';
import { NoteTypeBadge } from '@/components/aging/NoteTypes';
import { CustomerLink } from '@/components/CustomerLink';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { Confidence, LinePicker } from '@/components/receipts/IdentifyList';
import { InvoiceNumberLink } from '@/components/receipts/InvoicePopup';
import { ReceiptPdfButton } from '@/components/receipts/ReceiptPdfButton';
import { ReceiptStatusBadges } from '@/components/receipts/ReceiptStatusBadges';
import { AllocationEditor, DebtCheckChip } from '@/components/receipts/SplitEditor';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { useReceiptsSource } from '@/hooks/useReceiptsSource';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { noteTypeOf } from '@/utils/AgingPanel';
import { capitalizeName, formatDate, formatDateTime, formatILS, formatMonth, formatNumber } from '@/utils/Format';
import { RECEIPT_APPROVED, isApprovedReceipt, matchStatusOf, receiptStatusOf } from '@/utils/ReceiptRecord';
import {
  DEBT_ASK,
  allocationKindOf,
  apContactOf,
  closedMonthsOf,
  flowStepsOf,
  isAgentCheque,
  monthBalancesOf,
  onAccountOf,
  priorityInstruction,
  sortedAllocations,
  waitingLineOf,
} from '@/utils/ReceiptFlow';
import type { FlowReceipt, StepTone } from '@/utils/ReceiptFlow';
import { WAITING, identityOf, latestIdentifyStep, outboxHref, pickerOptions, waitingIdentity } from '@/utils/ReceiptsIdentify';
import type { IssueResult, LineIdentity } from '@/utils/ReceiptsIdentify';

const HEAD = 'h-8 text-xs font-semibold text-muted-foreground';
const PRIMARY = 'h-10 self-start rounded-full px-[18px] font-semibold shadow-primary';
const OUTLINE = 'h-9 self-start rounded-full';
const CENT = 0.01;

const CIRCLE: Record<StepTone, string> = {
  done: 'bg-success-soft text-success-ink',
  current: 'bg-glass-strong text-ink-2 ring-2 ring-link/45',
  attention: 'bg-warning-soft text-warning-ink',
  waiting: 'bg-glass-inner text-muted-foreground',
};

/** One step of the vertical stepper: a numbered circle (a tick once done) on a thin rail, its title and evidence. */
function Step({ n, title, tone, last, children }: { n: number; title: string; tone: StepTone; last?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-[13px]">
      <div className="flex flex-col items-center">
        <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums', CIRCLE[tone])}>
          {tone === 'done' ? <CheckIcon className="size-4" /> : n}
        </span>
        {!last && <span aria-hidden className="my-1 w-px flex-1 bg-border" />}
      </div>
      <section aria-label={title} className={cn('flex min-w-0 flex-1 flex-col gap-2', !last && 'pb-[21px]')}>
        <h3 className={cn('pt-1 text-[15px] font-bold', tone === 'waiting' && 'text-muted-foreground')}>{title}</h3>
        {children}
      </section>
    </li>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-[21px] gap-y-2 rounded-[18px] bg-glass-inner p-[13px] text-[13px] sm:grid-cols-3">{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-semibold text-ink-2">{children}</dd>
    </div>
  );
}

/** IssueReceipt's skipped reason or errors, one Alert. */
function Outcome({ result, onDismiss }: { result: IssueResult; onDismiss: () => void }) {
  const items = [...(result.skipped ?? []).map((s) => s.reason || 'השורה לא אושרה'), ...(result.errors ?? [])];
  if (!items.length) return null;
  return (
    <Alert variant={result.errors?.length ? 'destructive' : 'default'}>
      <AlertCircleIcon />
      <AlertTitle className="flex items-center justify-between gap-2">
        הקבלה לא יצאה
        <Button variant="ghost" size="icon-xs" aria-label="סגירה" onClick={onDismiss}>
          <XIcon />
        </Button>
      </AlertTitle>
      <AlertDescription>{items.join(' · ')}</AlertDescription>
    </Alert>
  );
}

/** Step 1 — identification: the customer, the confidence and how it was found, candidates, the run's steps; approve here. */
function IdentifyStep({ identity, receipt, certainAt, tone, lineId, onChanged }: { identity: LineIdentity | null; receipt: FlowReceipt | null; certainAt: number; tone: StepTone; lineId: string; onChanged: () => void }) {
  const scope = useOwnerScope();
  const { executeFunction: identify } = useExecuteAction(IdentifyCustomersAction);
  const { executeFunction: issue } = useExecuteAction(IssueReceiptAction);
  const [picked, setPicked] = useState<string | null>(identity ? (identity.customerCode ?? pickerOptions(identity)[0]?.customerCode ?? null) : null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<IssueResult | null>(null);
  const stepsQ = useEntityGetAll(
    ReceiptCheckStepsEntity,
    { where: { and: [{ column: 'bankLineId', value: lineId }, { column: 'stage', value: 'זיהוי לקוח' }] }, orderBy: [{ column: 'at', direction: 'asc' }] },
    { enabled: !!lineId },
  );

  if (isAgentCheque(receipt))
    return (
      <Step n={1} title="זיהוי" tone="done">
        <p className="text-[13px] text-ink-2">
          צ׳ק סוכן – בלי זיהוי. הלקוח: <CustomerLink code={receipt?.customerCode} name={receipt?.customerName} className="text-[13px]" />
        </p>
      </Step>
    );
  if (!identity)
    return (
      <Step n={1} title="זיהוי" tone="waiting">
        <Waiting>אין לרשומה שורת בנק לזיהוי.</Waiting>
      </Step>
    );

  const line = identity.line;
  const runSteps = (() => {
    const all = stepsQ.data ?? [];
    const latest = latestIdentifyStep(all, line);
    return latest?.checkRunId ? all.filter((s) => s.checkRunId === latest.checkRunId) : all;
  })();
  const open = identity.state === 'לא זוהה' || identity.state === 'לא ודאי';
  const certain = identity.state === 'ודאי';

  async function runIdentify() {
    setBusy(true);
    setNote(null);
    try {
      const out = (await identify({ dryRun: false, bankLineIds: [lineId], checkedBy: scope.actorName })) as { errors?: string[] } | null;
      setNote(out?.errors?.length ? `הזיהוי לא הסתיים: ${out.errors.join(' · ')}` : null);
    } catch {
      setNote('הזיהוי לא הסתיים. נסו שוב בעוד רגע.');
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  async function approve(customerCode: string | null) {
    if (!customerCode) return;
    setBusy(true);
    setOutcome(null);
    try {
      const out = ((await issue({ mode: 'one', bankLineIds: [lineId], customerCode, approvedBy: scope.actorName, dryRun: false })) ?? {}) as IssueResult;
      setOutcome(out);
      if ((out.issued?.length ?? 0) > 0) toast.add({ title: 'הקבלה יצאה', description: 'טיוטת המייל מחכה לאישור בדואר יוצא.', type: 'success' });
    } catch {
      setOutcome({ errors: ['האישור לא הסתיים. קבלה שכבר אושרה לא תאושר פעמיים – אפשר לנסות שוב.'] });
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <Step n={1} title="זיהוי" tone={tone}>
      {identity.state === WAITING ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-ink-2">השורה עוד לא עברה זיהוי לקוח.</p>
          <Button className={PRIMARY} disabled={busy} onClick={runIdentify}>
            {busy ? <Spinner data-icon="inline-start" /> : <ScanSearchIcon data-icon="inline-start" />}
            זהה
          </Button>
          {note && <p className="text-[13px] text-destructive">{note}</p>}
        </div>
      ) : (
        <>
          <Facts>
            <Fact label="לקוח">{identity.customerCode ? <CustomerLink code={identity.customerCode} name={identity.customerName} className="text-[13px]" /> : 'לא זוהה'}</Fact>
            <Fact label="ביטחון">
              <span className="flex flex-wrap items-center gap-2">
                {identity.state !== 'לא זוהה' && <Confidence value={identity.confidence} certainAt={certainAt} />}
                <StatusBadge value={identity.status} className="h-5 px-2 text-[11px]" />
              </span>
            </Fact>
            <Fact label="שיטה">{identity.method || '—'}</Fact>
          </Facts>
          {identity.evidence && <p className="text-[13px] text-ink-2">{identity.evidence}</p>}
          {identity.candidates.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted-foreground">מועמדים</span>
              <ul className="flex flex-col gap-0.5 text-[13px]">
                {[...identity.candidates]
                  .sort((a, b) => b.confidence - a.confidence)
                  .map((c) => (
                    <li key={c.customerCode} className="flex flex-wrap items-baseline gap-x-2">
                      <CustomerLink code={c.customerCode} name={c.customerName} className="text-[13px]" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatNumber(c.confidence)}
                        {c.method ? ` · ${c.method}` : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {(open || certain) && (
            <div className="flex flex-wrap items-center gap-2">
              {open && <LinePicker row={identity} value={picked} onChange={setPicked} />}
              <Button className={PRIMARY} disabled={busy || !(open ? picked : identity.customerCode)} onClick={() => void approve(open ? picked : identity.customerCode)}>
                {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                {open ? 'אשר לקוח והוצא קבלה' : 'אשר והוצא קבלה'}
              </Button>
            </div>
          )}
          {outcome && <Outcome result={outcome} onDismiss={() => setOutcome(null)} />}
          {runSteps.length > 0 && (
            <Accordion className="rounded-[18px] bg-glass-card">
              <AccordionItem value="steps" className="data-open:bg-transparent">
                <AccordionTrigger className="px-[13px] py-2 text-[13px] hover:no-underline">צעדי הזיהוי ({formatNumber(runSteps.length)})</AccordionTrigger>
                <AccordionContent className="px-[13px] pb-[13px]">
                  <ol className="flex flex-col gap-1.5 text-[13px]">
                    {runSteps.map((s) => (
                      <li key={s.id} className="flex flex-col">
                        <span className="text-ink-2">{s.detail || s.result || '—'}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {[s.result, s.actorName ? capitalizeName(s.actorName) : null, formatDateTime(s.at)].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </>
      )}
    </Step>
  );
}

/** Step 2 — the receipt: its status, the PDF, the mail to accounts payable, the Priority instruction and "הונפקה ב-Priority". */
function ReceiptStep({ receipt, tone, waitingLine, onChanged }: { receipt: FlowReceipt | null; tone: StepTone; waitingLine: string; onChanged: () => void }) {
  const scope = useOwnerScope();
  const { executeFunction: decide } = useExecuteAction(DecideMatchProposalAction);
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const key = receipt?.receiptKey ?? '';
  const approved = isApprovedReceipt(receipt);
  const allocationsQ = useEntityGetAll(ReceiptAllocationsEntity, { where: { column: 'receiptKey', value: key } }, { enabled: approved && !!key });
  const approvalsQ = useEntityGetAll(
    ApprovalsEntity,
    { where: { and: [{ column: 'relatedTable', value: 'Receipts' }, { column: 'relatedId', value: key }] }, orderBy: [{ column: 'draftedAt', direction: 'desc' }] },
    { enabled: approved && !!key },
  );

  if (!receipt || !approved)
    return (
      <Step n={2} title="קבלה" tone="waiting">
        <Waiting>{waitingLine}</Waiting>
      </Step>
    );

  const cheque = isAgentCheque(receipt);
  const allocations = allocationsQ.data ?? [];
  const approvalId = approvalsQ.data?.[0]?.id;
  // Bank receipts and agent cheques alike: DecideMatchProposal marks the receipt by its row id.
  const canMark = receiptStatusOf(receipt) === RECEIPT_APPROVED && !!receipt.id;
  const instruction = priorityInstruction(receipt, allocations);

  async function markIssued() {
    if (!canMark || !number.trim()) return;
    setSaving(true);
    setErrors([]);
    try {
      const out = (await decide({ decision: 'priorityDone', receiptId: receipt?.id ?? '', priorityReceiptNumber: number.trim(), decidedBy: scope.actorName, dryRun: false })) as { ok?: boolean; reason?: string; errors?: string[] } | null;
      if (out?.errors?.length) setErrors(out.errors);
      else if (out?.ok === false) setErrors([out.reason || 'הסימון נדחה.']);
      else toast.add({ title: 'סומן שהקבלה הונפקה ב-Priority', type: 'success' });
    } catch {
      setErrors(['הסימון לא הסתיים. אפשר לנסות שוב.']);
    } finally {
      setSaving(false);
      onChanged();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(instruction);
      toast.add({ title: 'ההוראה הועתקה', type: 'success' });
    } catch {
      toast.add({ title: 'לא הצלחנו להעתיק – אפשר לסמן את הטקסט ולהעתיק ידנית', type: 'error' });
    }
  }

  const send = receipt.sendStatus ?? '';
  return (
    <Step n={2} title="קבלה" tone={tone}>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge value={receiptStatusOf(receipt)} className="h-5 px-2 text-[11px]" />
        {key && <ReceiptPdfButton receiptKey={key} label={`${receipt.customerName ?? ''} · ${formatILS(receipt.amount)} · ${formatDate(receipt.valueDate)}`} />}
      </span>
      {cheque ? null : send === 'חסר איש קשר' ? (
        <Link
          to={getRouteUrl('collections/customers/:code', { code: receipt.customerCode ?? '' })}
          className="inline-flex items-center gap-1 self-start rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-ink hover:underline"
        >
          <MailWarningIcon className="size-3.5" />
          חסר איש קשר הנהלת חשבונות
        </Link>
      ) : send === 'טיוטה – בדיקה' ? (
        <Link to={outboxHref(approvalId)} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-link hover:underline">
          <MailIcon className="size-3.5" />
          טיוטה ל-<span dir="ltr">{receipt.sentToEmail}</span> – ממתינה לאישור בדואר יוצא
        </Link>
      ) : send === 'נשלחה' ? (
        <span className="text-[13px] text-muted-foreground">
          נשלחה ל-<span dir="ltr">{receipt.sentToEmail}</span>
          {receipt.sentAt ? ` · ${formatDateTime(receipt.sentAt)}` : ''}
        </span>
      ) : (
        <span className="text-[13px] text-muted-foreground">המייל להנהלת החשבונות לא הוכן.</span>
      )}

      {receipt.priorityReceiptNumber ? (
        <p className="text-[13px] text-ink-2">
          הונפקה ב-Priority · מספר <span className="font-semibold" dir="ltr">{receipt.priorityReceiptNumber}</span>
          {receipt.issuedBy ? ` · ${capitalizeName(receipt.issuedBy)}` : ''}
          {receipt.issuedAt ? ` · ${formatDateTime(receipt.issuedAt)}` : ''}
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-[18px] bg-glass-card p-[13px]">
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">להעתקה ל-Priority</span>
            <Button variant="ghost" size="xs" className="rounded-full bg-glass-soft" onClick={() => void copy()}>
              <ClipboardCopyIcon data-icon="inline-start" />
              העתקה
            </Button>
          </span>
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{instruction}</pre>
          {canMark && (
            <div className="flex flex-wrap items-end gap-2">
              <Field className="w-48">
                <FieldLabel htmlFor="priority-receipt-number">מספר הקבלה ב-Priority</FieldLabel>
                <Input id="priority-receipt-number" dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} className="bg-glass-strong" />
              </Field>
              <Button className={tone === 'current' ? PRIMARY : OUTLINE} variant={tone === 'current' ? 'default' : 'outline'} disabled={saving || !number.trim()} onClick={() => void markIssued()}>
                {saving ? <Spinner data-icon="inline-start" /> : <StampIcon data-icon="inline-start" />}
                הונפקה ב-Priority
              </Button>
            </div>
          )}
          {errors.length > 0 && <p className="text-[13px] text-destructive">{errors.join(' · ')}</p>}
        </div>
      )}
    </Step>
  );
}

/** Step 3 — the debt check: the result, the months it closed, and the customer's open balance per due month. */
function DebtStep({ receipt, tone, waitingLine }: { receipt: FlowReceipt | null; tone: StepTone; waitingLine: string }) {
  const code = receipt?.customerCode ?? '';
  const key = receipt?.receiptKey ?? '';
  const reached = !!receipt?.debtCheckResult && isApprovedReceipt(receipt);
  const movementsQ = useEntityGetAll(OpenMovementsEntity, { where: { column: 'customerCode', value: code } }, { enabled: reached && !!code });
  const taskQ = useEntityGetAll(CollectionQueueEntity, { where: { column: 'taskKey', value: `debt-check:${key}` } }, { enabled: reached && receipt?.debtCheckResult === DEBT_ASK && !!key });
  if (!receipt || !reached)
    return (
      <Step n={3} title="בדיקת חוב" tone="waiting">
        <Waiting>{waitingLine}</Waiting>
      </Step>
    );
  const { months, undated } = monthBalancesOf(movementsQ.data ?? [], receipt);
  const closed = closedMonthsOf(receipt);
  const task = taskQ.data?.[0];
  return (
    <Step n={3} title="בדיקת חוב" tone={tone}>
      <DebtCheckChip result={receipt.debtCheckResult} months={closed} />
      {receipt.debtCheckResult === DEBT_ASK && (
        <p className="text-[13px] text-ink-2">
          הסכום {formatILS(receipt.amount)} לא סוגר אף חודש פירעון.{' '}
          <Link to="/collections/tasks?tab=receipts" className="font-semibold text-link hover:underline">
            {task ? `למשימה: ${task.title || task.taskType}` : 'למשימות התקבולים'}
          </Link>
          {task?.status && <StatusBadge value={task.status} className="ms-1.5 h-5 px-2 text-[11px]" />}
        </p>
      )}
      {movementsQ.isError ? (
        <LoadError what="היתרות לפי חודש" />
      ) : movementsQ.isLoading ? (
        <LoadingRows rows={2} />
      ) : months.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">אין ללקוח תנועות פתוחות ב-Priority.</p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] bg-glass-card">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'ps-[13px]')}>חודש פירעון</TableHead>
                <TableHead className={HEAD}>יתרה</TableHead>
                <TableHead className={cn(HEAD, 'pe-[13px]')}>מצטבר</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month} className={cn('hover:bg-transparent', m.closed && 'bg-primary/[0.07] hover:bg-primary/[0.07]')}>
                  <TableCell className="ps-[13px] py-1.5 font-semibold">
                    {formatMonth(m.month)}
                    {m.closed && <span className="ms-1.5 text-[11px] font-semibold text-link">נסגר בבדיקה</span>}
                  </TableCell>
                  <TableCell className={cn('py-1.5 tabular-nums', m.balance < 0 && 'text-success-ink')}>{formatILS(m.balance)}</TableCell>
                  <TableCell className="pe-[13px] py-1.5 tabular-nums">{formatILS(m.cumulative)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-[13px] pb-2 text-[11px] text-muted-foreground">
            היתרה הפתוחה ב-Priority היום, בלי הקבלה עצמה{undated ? ` · ${formatNumber(undated)} תנועות בלי חודש פירעון לא נספרו` : ''}.
          </p>
        </div>
      )}
    </Step>
  );
}

/** Step 4 — the allocation: its state, allocated / on account, the rows, and the editor to change or approve it. */
function AllocationStep({ receipt, tone, waitingLine, onChanged }: { receipt: FlowReceipt | null; tone: StepTone; waitingLine: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const key = receipt?.receiptKey ?? '';
  const reached = isApprovedReceipt(receipt) && !!matchStatusOf(receipt);
  const allocationsQ = useEntityGetAll(ReceiptAllocationsEntity, { where: { column: 'receiptKey', value: key } }, { enabled: reached && !!key });
  if (!receipt || !reached)
    return (
      <Step n={4} title="פיזור" tone="waiting" last>
        <Waiting>{waitingLine}</Waiting>
      </Step>
    );
  const rows = sortedAllocations(allocationsQ.data ?? []);
  const onAccount = onAccountOf(receipt, rows);
  const allocated = receipt.allocatedAmount != null ? Number(receipt.allocatedAmount) : rows.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  return (
    <Step n={4} title="פיזור" tone={tone} last>
      <span className="flex flex-wrap items-center gap-x-[13px] gap-y-1 text-[13px]">
        <StatusBadge value={matchStatusOf(receipt)} className="h-5 px-2 text-[11px]" />
        <span className="text-muted-foreground">
          מפוזר <span className="font-semibold text-ink-2 tabular-nums">{formatILS(allocated)}</span>
        </span>
        <span className="text-muted-foreground">
          על חשבון <span className="font-semibold text-ink-2 tabular-nums">{formatILS(onAccount)}</span>
        </span>
        {receipt.allocationConfidence != null && (
          <span className="text-muted-foreground" title="רמת הביטחון של הפיזור המוצע, 0–100">
            ביטחון <span className="font-semibold text-ink-2 tabular-nums">{formatNumber(receipt.allocationConfidence)}</span>
          </span>
        )}
      </span>
      {allocationsQ.isError ? (
        <LoadError what="שורות הפיזור" />
      ) : allocationsQ.isLoading ? (
        <LoadingRows rows={2} />
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-[18px] bg-glass-card">
          <Table className="min-w-[460px] text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'ps-[13px]')}>חשבונית</TableHead>
                <TableHead className={HEAD}>פירעון</TableHead>
                <TableHead className={HEAD}>סכום</TableHead>
                <TableHead className={cn(HEAD, 'pe-[13px]')}>יתרה לפני → אחרי</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} className="hover:bg-transparent">
                  <TableCell className="ps-[13px] py-1.5">
                    <InvoiceNumberLink invoiceNumber={a.invoiceNumber} allocatedAmount={a.amount} />
                  </TableCell>
                  <TableCell className="py-1.5 whitespace-nowrap tabular-nums">{formatDate(a.dueDate)}</TableCell>
                  <TableCell className="py-1.5 font-semibold whitespace-nowrap tabular-nums">
                    {formatILS(a.amount)}
                    {allocationKindOf(a) === 'חלקית' && <StatusBadge value="חלקית" className="ms-1.5 h-5 px-2 text-[11px]" />}
                  </TableCell>
                  <TableCell className="pe-[13px] py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">
                    {a.openBefore != null ? formatILS(a.openBefore) : '—'} → {a.openAfter != null ? formatILS(a.openAfter) : a.openBefore != null ? formatILS(Number(a.openBefore) - Number(a.amount ?? 0)) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{onAccount > CENT ? 'הקבלה עוד לא פוזרה לחשבוניות – כולה זכות על חשבון.' : 'אין שורות פיזור.'}</p>
      )}
      <Button className={tone === 'done' ? OUTLINE : PRIMARY} variant={tone === 'done' ? 'outline' : 'default'} onClick={() => setEditing(true)}>
        <SplitIcon data-icon="inline-start" />
        {tone === 'done' ? 'עריכת הפיזור' : 'פיזור לחשבוניות'}
      </Button>
      <AllocationEditor
        receiptKey={key}
        title={[receipt.customerName, formatILS(receipt.amount)].filter(Boolean).join(' · ')}
        open={editing}
        onOpenChange={setEditing}
        onApplied={onChanged}
      />
    </Step>
  );
}

/** Beside the stepper: what matters about the customer for this receipt, and their open notes per month. */
function CustomerSide({ code }: { code: string }) {
  const customerQ = useEntityGetAll(CustomersEntity, { where: { column: 'customerCode', value: code } }, { enabled: !!code });
  const contactsQ = useEntityGetAll(CustomerContactsEntity, { where: { column: 'customerCode', value: code } }, { enabled: !!code });
  const notesQ = useEntityGetAll(
    CustomerNotesEntity,
    { where: { and: [{ column: 'customerCode', value: code }, { column: 'status', value: 'פעילה' }] }, orderBy: [{ column: 'dueMonth', direction: 'asc' }] },
    { enabled: !!code },
  );
  if (!code)
    return (
      <aside aria-label="הלקוח" className="flex flex-col gap-2 rounded-[22px] bg-glass-inner p-[13px]">
        <h3 className="text-[13px] font-bold">הלקוח</h3>
        <p className="text-[13px] text-muted-foreground">אחרי הזיהוי יופיעו כאן תנאי התשלום, איש הקשר והערות הגבייה.</p>
      </aside>
    );
  const c = customerQ.data?.[0];
  const ap = apContactOf(c, contactsQ.data ?? []);
  const terms = c?.paymentTermsLabel || (c?.paymentTermsDays ? `שוטף+${c.paymentTermsDays}` : '—');
  const notes = notesQ.data ?? [];
  const byMonth = new Map<string, typeof notes>();
  for (const n of notes) byMonth.set(n.dueMonth || '', [...(byMonth.get(n.dueMonth || '') ?? []), n]);
  return (
    <aside aria-label="הלקוח" className="flex flex-col gap-[13px] rounded-[22px] bg-glass-inner p-[13px]">
      <div className="flex flex-col gap-0.5">
        <CustomerLink code={code} name={c?.customerName} showCode className="text-[15px]" />
      </div>
      {customerQ.isError ? (
        <LoadError what="כרטיס הלקוח" />
      ) : customerQ.isLoading ? (
        <LoadingRows rows={2} />
      ) : (
        <dl className="flex flex-col gap-2 text-[13px]">
          <Fact label="תנאי תשלום">{terms}</Fact>
          <Fact label="אמצעי תשלום">{c?.paymentMethod || '—'}</Fact>
          <Fact label="הערת גבייה">{c?.collectionNote || '—'}</Fact>
          <Fact label="איש קשר הנהלת חשבונות">
            {ap ? (
              <span className="flex flex-col font-normal">
                <span className="font-semibold">{ap.name || '—'}</span>
                {ap.email && <span dir="ltr" className="text-start text-xs text-muted-foreground">{ap.email}</span>}
                {ap.phone && <span dir="ltr" className="text-start text-xs text-muted-foreground">{ap.phone}</span>}
              </span>
            ) : (
              <span className="text-warning-ink">חסר</span>
            )}
          </Fact>
        </dl>
      )}
      <div className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold text-muted-foreground">הערות פתוחות</h4>
        {notesQ.isError ? (
          <LoadError what="ההערות" />
        ) : notesQ.isLoading ? (
          <LoadingRows rows={1} />
        ) : notes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">אין הערות פתוחות.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...byMonth.entries()].map(([month, list]) => (
              <li key={month || 'none'} className="flex flex-col gap-1">
                <span className="text-xs font-bold">{month ? formatMonth(month) : 'בלי חודש'}</span>
                {list.map((n) => (
                  <span key={n.id} className="flex flex-col gap-0.5 rounded-[14px] bg-glass-card px-2 py-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <NoteTypeBadge type={noteTypeOf({ noteType: n.noteType ?? undefined })} className="h-5 text-[11px]" />
                      {[n.actionDate ? formatDate(n.actionDate) : null, n.amount ? formatILS(n.amount) : null].filter(Boolean).length > 0 && (
                        <span className="text-xs font-semibold text-ink-2 tabular-nums">{[n.actionDate ? formatDate(n.actionDate) : null, n.amount ? formatILS(n.amount) : null].filter(Boolean).join(' · ')}</span>
                      )}
                    </span>
                    {n.noteText && <span className="line-clamp-2 text-xs text-ink-2">{n.noteText}</span>}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link to={getRouteUrl('collections/customers/:code', { code })} className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
        לכרטיס הלקוח
        <ArrowUpLeftIcon className="size-3.5" />
      </Link>
    </aside>
  );
}

function ReceiptFlowBody({ receiptKey, bankLineId, context }: { receiptKey?: string | null; bankLineId?: string | null; context?: ReactNode }) {
  const settings = useReceiptsSource();
  const receiptsQ = useEntityGetAll(ReceiptsEntity, { where: receiptKey ? { column: 'receiptKey', value: receiptKey } : { column: 'bankLineId', value: bankLineId ?? '' } });
  const receipts = receiptsQ.data ?? [];
  const receipt = receipts.find((r) => !!r.identifyStatus) ?? receipts.find((r) => isApprovedReceipt(r)) ?? receipts[0] ?? null;
  const lineId = bankLineId || receipt?.bankLineId || '';
  const lineQ = useEntityGetAll(BankLinesEntity, { where: { column: 'bankLineId', value: lineId } }, { enabled: !!lineId });
  const stepsQ = useEntityGetAll(ReceiptCheckStepsEntity, { where: { and: [{ column: 'bankLineId', value: lineId }, { column: 'stage', value: 'זיהוי לקוח' }] } }, { enabled: !!lineId });
  const proposalQ = useEntityGetAll(MatchProposalsEntity, { where: { column: 'id', value: receipt?.matchProposalId ?? '' } }, { enabled: !!receipt?.matchProposalId });
  const line = lineQ.data?.[0];
  const loading = receiptsQ.isLoading || (!!lineId && (lineQ.isLoading || stepsQ.isLoading));

  function refresh() {
    receiptsQ.refetch();
    if (lineId) {
      lineQ.refetch();
      stepsQ.refetch();
    }
    if (receipt?.matchProposalId) proposalQ.refetch();
  }

  const header = (title: string, description: ReactNode, badges?: ReactNode) => (
    <SheetHeader className="border-b border-glass-edge p-[21px] pe-12">
      <SheetTitle className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {title}
        {badges}
      </SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
  );

  if (receiptsQ.isError || lineQ.isError)
    return (
      <>
        {header('רשומת תקבול', 'הרשומה לא נטענה')}
        <div className="p-[21px]">
          <LoadError what="רשומת התקבול" />
        </div>
      </>
    );
  if (loading)
    return (
      <>
        {header('רשומת תקבול', 'טוען…')}
        <LoadingRows rows={6} />
      </>
    );
  if (!receipt && !line)
    return (
      <>
        {header('רשומת תקבול', 'לא נמצאה')}
        <p className="p-[21px] text-[13px] text-muted-foreground">הרשומה לא נמצאה. ייתכן שהשורה נמחקה או שהקישור ישן.</p>
      </>
    );

  const found = line ? (identityOf(line, receipts, stepsQ.data ?? []) ?? waitingIdentity(line)) : null;
  const idMethod = proposalQ.data?.[0]?.customerIdMethod;
  const identity = found && !found.method && idMethod ? { ...found, method: idMethod } : found;
  const state = identity?.state ?? null;
  const steps = flowStepsOf(state, receipt);
  const code = receipt?.customerCode || identity?.customerCode || '';
  const amount = line?.amount ?? receipt?.amount;
  const title = isAgentCheque(receipt) ? `צ׳ק סוכן · ${receipt?.customerName || code}` : line?.payerName || receipt?.payerName || 'מעביר לא ידוע';
  const description = [formatILS(amount), formatDate(line?.valueDate ?? receipt?.valueDate), line?.reference || receipt?.reference || null].filter(Boolean).join(' · ');

  return (
    <>
      {header(title, description, <ReceiptStatusBadges receipt={receipt} size="sm" />)}
      <div className="grid gap-[21px] p-[21px] md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-[13px]">
          {context}
          <ol className="flex flex-col">
            <IdentifyStep
              key={`${identity?.state ?? ''}:${identity?.customerCode ?? ''}`}
              identity={identity}
              receipt={receipt}
              certainAt={settings.certainAt}
              tone={steps.identify}
              lineId={lineId}
              onChanged={refresh}
            />
            <ReceiptStep receipt={receipt} tone={steps.receipt} waitingLine={waitingLineOf('receipt', state, receipt)} onChanged={refresh} />
            <DebtStep receipt={receipt} tone={steps.debt} waitingLine={waitingLineOf('debt', state, receipt)} />
            <AllocationStep receipt={receipt} tone={steps.allocation} waitingLine={waitingLineOf('allocation', state, receipt)} onChanged={refresh} />
          </ol>
        </div>
        <CustomerSide code={code} />
      </div>
    </>
  );
}

/**
 * The one receipt record (08.11): a side sheet over the receipts screen or a task, reading the entities directly —
 * the bank line, the receipt, its identification steps, allocations, the customer's open movements, contacts, notes,
 * the mail draft and the tasks — as a vertical four-step stepper: זיהוי → קבלה → בדיקת חוב → פיזור, each with its
 * status and evidence, and a waiting line when not reached. Opened by ?line=<bankLineId> or ?receipt=<receiptKey>.
 */
export function ReceiptFlowPanel({
  receiptKey,
  bankLineId,
  open,
  onOpenChange,
  context,
}: {
  receiptKey?: string | null;
  bankLineId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown above the stepper, e.g. the task that opened the record. */
  context?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="glass-menu flex w-full flex-col gap-0 overflow-y-auto p-0 data-[side=left]:sm:max-w-[920px]">
        {open && (receiptKey || bankLineId) ? (
          <ReceiptFlowBody key={`${receiptKey ?? ''}:${bankLineId ?? ''}`} receiptKey={receiptKey} bankLineId={bankLineId} context={context} />
        ) : (
          <SheetHeader className="p-[21px] pe-12">
            <SheetTitle>רשומת תקבול</SheetTitle>
            <SheetDescription>לא נבחרה רשומה.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}