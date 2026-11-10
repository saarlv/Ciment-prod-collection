import { useState } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CheckIcon, HandshakeIcon, QuoteIcon, ScaleIcon } from 'lucide-react';
import { GetCustomer360Action } from '@/product-types';
import { CustomerLink } from '@/components/CustomerLink';
import { useActionQuery } from '@/hooks/useActionQuery';
import { NoteRefusedError, useCustomerNotesApi } from '@/hooks/useCustomerNotesApi';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { invoicesOf, isCredit, isUnmatchedReceipt } from '@/utils/AgingPanel';
import { isCustomer360 } from '@/utils/CollectionsTypes';
import type { AgingInvoice, Customer360 } from '@/utils/CollectionsTypes';
import { formatDate, formatDateTime, formatILS, todayISO } from '@/utils/Format';
import { PROPOSAL_APPROVED, PROPOSAL_PENDING, disputeOf, promiseOf } from '@/utils/Inbox';
import type { InboundEmail, PromiseProposal } from '@/utils/Inbox';

interface OpenRow {
  inv: AgingInvoice;
  number: string;
}

function Quote({ text, verified }: { text?: string; verified?: boolean }) {
  if (!text) return null;
  return (
    <blockquote dir="auto" className="flex gap-1.5 border-s-2 border-glass-edge ps-2 text-[13px] text-muted-foreground">
      <QuoteIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {text}
        {verified === false && <span className="font-semibold text-critical-ink"> · הציטוט לא נמצא במייל</span>}
      </span>
    </blockquote>
  );
}

/** The customer's open invoices (the same read as the customer card, shared in the tab). */
function useOpenInvoices(customerCode: string) {
  const { executeFunction } = useExecuteAction(GetCustomer360Action);
  const q = useActionQuery(
    executeFunction,
    { customerCode, asOfDate: todayISO() },
    { cache: 'customer360', validate: isCustomer360, enabled: !!customerCode },
  );
  const data = q.data as (Customer360 & { error?: string }) | undefined;
  const rows: OpenRow[] = (data?.aging ? invoicesOf(data.aging) : [])
    .filter(({ inv }) => !!inv.invoiceNumber && !isUnmatchedReceipt(inv) && !isCredit(inv))
    .map(({ inv }) => ({ inv, number: inv.invoiceNumber ?? '' }))
    .sort((a, b) => (a.inv.dueDate ?? '9999').localeCompare(b.inv.dueDate ?? '9999'));
  return { rows, isLoading: q.isLoading, isError: q.isError || !!data?.error, refresh: q.refresh };
}

function ProposalForm({ email, proposal }: { email: InboundEmail; proposal: PromiseProposal }) {
  const scope = useOwnerScope();
  const customerCode = email.customerCode ?? '';
  const open = useOpenInvoices(customerCode);
  const { approveEmailPromise, isSaving: saving } = useCustomerNotesApi();

  const [amount, setAmount] = useState(proposal.amount ? String(proposal.amount) : '');
  const [date, setDate] = useState(proposal.date ?? '');
  const [picked, setPicked] = useState<string[]>(proposal.invoiceNumbers);
  const [errors, setErrors] = useState<string[]>([]);

  const selected = open.rows.filter((r) => picked.includes(r.number));
  const oldest = selected[0];
  // A commitment is a note on one due month: the oldest picked invoice's.
  const dueMonth = (oldest?.inv.dueDate ?? '').slice(0, 7);
  const amountNum = Number(amount);
  const amountBad = amount !== '' && (!Number.isFinite(amountNum) || amountNum <= 0);
  const missingAmount = amount === '' && !proposal.amount;
  const missingDate = !date;

  const blocker = !customerCode
    ? 'צריך לזהות לקוח קודם'
    : open.isLoading
      ? null
      : selected.length === 0
        ? 'בחרו לפחות חשבונית פתוחה אחת'
        : missingAmount || amountBad
          ? 'חסר סכום'
          : missingDate
            ? 'חסר תאריך'
            : null;

  function toggle(number: string, on: boolean) {
    setPicked((p) => (on ? [...p.filter((n) => n !== number), number] : p.filter((n) => n !== number)));
    setErrors([]);
  }

  async function approve() {
    if (blocker || !oldest) return;
    setErrors([]);
    try {
      await approveEmailPromise({
        customerCode,
        sourceEmailId: email.id,
        dueMonth: dueMonth || undefined,
        actionDate: date && date !== proposal.date ? date : undefined,
        amount: amount !== '' && amountNum !== proposal.amount ? amountNum : undefined,
        authorName: scope.actorName,
      });
      toast.add({
        title: 'ההתחייבות אושרה',
        description: `נרשמה כהתחייבות לתשלום${dueMonth ? ` על חודש ${dueMonth}` : ''} והמייל סומן טופל.`,
        type: 'success',
      });
      open.refresh();
    } catch (e) {
      setErrors([e instanceof NoteRefusedError ? e.message : 'ההתחייבות לא נרשמה. נסו שוב בעוד רגע.']);
    }
  }

  return (
    <article className="glass-inner flex flex-col gap-[13px] p-[13px]">
      <header className="flex items-center gap-2">
        <HandshakeIcon className="size-4 text-link" />
        <h3 className="text-sm font-bold">הצעת התחייבות מהמייל</h3>
        <span className="ms-auto text-xs text-muted-foreground">שום דבר לא נרשם עד האישור</span>
      </header>
      <Quote text={proposal.quote} verified={proposal.verified} />

      <FieldGroup className="gap-[13px]">
        <div className="grid gap-[13px] sm:grid-cols-2">
          <Field data-invalid={amountBad || undefined}>
            <FieldLabel htmlFor={`promise-amount-${email.id}`}>סכום</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`promise-amount-${email.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                dir="ltr"
                value={amount}
                aria-invalid={amountBad || undefined}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setErrors([]);
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>₪</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            {amountBad && <FieldError>סכום גדול מאפס</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`promise-date-${email.id}`}>תאריך</FieldLabel>
            <Input
              id={`promise-date-${email.id}`}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setErrors([]);
              }}
            />
          </Field>
        </div>

        <FieldSet className="gap-2">
          <FieldLegend variant="label">חשבוניות</FieldLegend>
          {!customerCode ? (
            <p className="text-[13px] text-muted-foreground">אחרי זיהוי הלקוח יופיעו כאן החשבוניות הפתוחות שלו.</p>
          ) : open.isLoading ? (
            <Skeleton className="h-24 w-full rounded-[16px]" />
          ) : open.isError ? (
            <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את החשבוניות הפתוחות של הלקוח. סגרו ופתחו את המייל שוב.</p>
          ) : open.rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">אין ללקוח חשבוניות פתוחות.</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {open.rows.map((r) => {
                const id = `promise-inv-${email.id}-${r.number}`;
                const on = picked.includes(r.number);
                return (
                  <li key={r.number}>
                    <Field orientation="horizontal" className="items-center gap-2 rounded-[12px] px-1.5 py-1 hover:bg-glass-faint">
                      <Checkbox id={id} checked={on} onCheckedChange={(v) => toggle(r.number, !!v)} />
                      <FieldLabel htmlFor={id} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] font-normal">
                        <span dir="ltr" className="font-semibold tabular-nums">
                          {r.number}
                        </span>
                        <span className="text-muted-foreground">פירעון {formatDate(r.inv.dueDate)}</span>
                        <span className="ms-auto tabular-nums">{formatILS(r.inv.remainingAmount ?? r.inv.openAmount)}</span>
                      </FieldLabel>
                    </Field>
                  </li>
                );
              })}
            </ul>
          )}
          {dueMonth && selected.length > 1 && (
            <p className="text-xs text-muted-foreground">התחייבות אחת על כל החשבוניות שנבחרו; היא נרשמת על חודש הפירעון של הוותיקה ({dueMonth}).</p>
          )}
        </FieldSet>
      </FieldGroup>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-[14px] bg-critical-soft p-[13px] text-[13px] text-critical-ink">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="rounded-full px-[18px] font-bold shadow-primary" disabled={!!blocker || saving || open.isLoading} onClick={approve}>
          {saving ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
          אשר התחייבות
        </Button>
        {blocker && <span className="text-xs font-semibold text-warning-ink">{blocker}</span>}
      </div>
    </article>
  );
}

function ApprovedPromise({ email, proposal }: { email: InboundEmail; proposal: PromiseProposal }) {
  return (
    <article className="glass-inner flex flex-col gap-2 p-[13px] text-[13px]">
      <header className="flex flex-wrap items-center gap-2">
        <CheckIcon className="size-4 text-success-ink" />
        <h3 className="text-sm font-bold">ההתחייבות אושרה</h3>
        <span className="text-muted-foreground">
          {proposal.approvedBy || '—'}
          {proposal.approvedAt ? ` · ${formatDateTime(proposal.approvedAt)}` : ''}
        </span>
      </header>
      <p>
        <span className="font-semibold tabular-nums">{proposal.amount ? formatILS(proposal.amount) : 'בלי סכום'}</span>
        {proposal.date ? ` עד ${formatDate(proposal.date)}` : ''}
        {proposal.method ? ` · ${proposal.method}` : ''}
      </p>
      {proposal.invoiceNumbers.length > 0 && (
        <p className="text-muted-foreground">
          חשבוניות:{' '}
          <span dir="ltr" className="tabular-nums">
            {proposal.invoiceNumbers.join(', ')}
          </span>
        </p>
      )}
      {email.customerCode && <CustomerLink code={email.customerCode} name={email.customerName} className="self-start font-semibold" />}
    </article>
  );
}

/** Maya's promise proposal on the mail: approve it as a commitment (CustomerNotes) with one click, or see who approved it. */
export function PromiseProposalCard({ email }: { email: InboundEmail }) {
  const proposal = promiseOf(email.classificationQuotes);
  if (!proposal) return null;
  if (proposal.status === PROPOSAL_APPROVED) return <ApprovedPromise email={email} proposal={proposal} />;
  if (proposal.status !== PROPOSAL_PENDING) return null;
  return <ProposalForm key={`${email.id}:${proposal.status}`} email={email} proposal={proposal} />;
}

export function hasPendingProposal(email: InboundEmail): boolean {
  return promiseOf(email.classificationQuotes)?.status === PROPOSAL_PENDING;
}

export function hasProposal(email: InboundEmail): boolean {
  const s = promiseOf(email.classificationQuotes)?.status;
  return s === PROPOSAL_PENDING || s === PROPOSAL_APPROVED;
}

/** A conditional payment or a wrong-invoice claim: the reason as a chip, the quote in its tooltip. */
export function DisputeChip({ email }: { email: InboundEmail }) {
  const d = disputeOf(email.classificationQuotes);
  if (!d) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <ScaleIcon className="size-3.5 shrink-0" />
          <span className="truncate">בירור: {d.reason || 'לא צוינה סיבה'}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-80 text-start">{d.quote ? `״${d.quote}״` : 'אין ציטוט שמור.'}</TooltipContent>
      </Tooltip>
      {d.invoiceNumbers.length > 0 && (
        <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
          {d.invoiceNumbers.join(', ')}
        </span>
      )}
    </div>
  );
}