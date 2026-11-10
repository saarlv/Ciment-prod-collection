import { useState } from 'react';
import { Link } from 'react-router';
import { getRouteUrl, useEntityGetOne, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, CheckIcon, ClipboardListIcon, ShieldCheckIcon, UserCheckIcon, UserXIcon } from 'lucide-react';
import { ConfirmSenderAction, CreditLimitRequestsEntity } from '@/product-types';
import { CustomerLink } from '@/components/CustomerLink';
import { StatusBadge } from '@/components/StatusBadge';
import { CustomerPicker } from '@/components/inbox/CustomerPicker';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { CREDIT_TAB } from '@/utils/CreditExposure';
import { formatDateTime, formatILS } from '@/utils/Format';
import { insuranceOf, manualTasksOf, senderDecisionOf, signatureOf } from '@/utils/Inbox';
import type { InboundEmail } from '@/utils/Inbox';

const LINK = 'inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline';

function Row({ label, value, ltr }: { label: string; value?: string; ltr?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd dir={ltr ? 'ltr' : 'auto'} className="text-sm font-semibold break-words">
        {value}
      </dd>
    </div>
  );
}

type Mode = 'idle' | 'other' | 'reject';

/**
 * "זה הלקוח X?" — an unknown sender's signature, the customer the code suggests from it, and the person's decision:
 * confirm (saves the contact, verifies the mail), another customer, or "not a customer's sender". ConfirmSender does the writing.
 */
export function SenderCard({ email }: { email: InboundEmail }) {
  const scope = useOwnerScope();
  const sig = signatureOf(email.classificationQuotes);
  const decision = senderDecisionOf(email.classificationQuotes);
  const suggestion = sig?.suggestion ?? null;
  const suggestedCode = suggestion?.customerCode ?? email.suggestedCustomerCode ?? null;
  const suggestedName = suggestion?.customerName ?? (suggestedCode === email.customerCode ? email.customerName : undefined);
  const { executeFunction } = useExecuteAction(ConfirmSenderAction);
  const [mode, setMode] = useState<Mode>(suggestedCode ? 'idle' : 'other');
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(input: { mode: 'confirm' | 'reject'; customerCode?: string; note?: string }) {
    setBusy(true);
    setResult(null);
    try {
      const out = await executeFunction({ inboundEmailId: email.id, decidedBy: scope.actorName, ...input });
      const errors = (out as { errors?: string[] } | undefined)?.errors ?? [];
      setResult({ ok: errors.length === 0, text: out?.message || (errors.length ? errors.join(' · ') : 'נשמר.') });
      if (errors.length === 0) setMode('idle');
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? `לא הצלחנו לשמור: ${err.message}` : 'לא הצלחנו לשמור. נסו שוב.' });
    } finally {
      setBusy(false);
    }
  }

  const signatureBlock = sig && (
    <div className="flex flex-col gap-[13px]">
      <dl className="grid grid-cols-2 gap-[13px]">
        <Row label="שם" value={sig.personName ?? email.fromName ?? undefined} />
        <Row label="תפקיד" value={sig.title} />
        <Row label="חברה" value={sig.companyName} />
        <Row label="טקסט הלוגו" value={sig.logoText} />
      </dl>
      {sig.quote && (
        <pre dir="auto" className="glass-inner max-h-40 overflow-auto p-[13px] font-sans text-[13px] whitespace-pre-wrap text-ink-2">
          {sig.quote}
          {sig.verified === false && <span className="block pt-1 text-xs font-semibold text-critical-ink">החתימה לא נמצאה כלשונה במייל</span>}
        </pre>
      )}
    </div>
  );

  if (decision) {
    const confirmed = decision.mode === 'confirm';
    return (
      <div className="flex flex-col gap-[13px]">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {confirmed ? <UserCheckIcon className="size-4 text-success-ink" /> : <UserXIcon className="size-4 text-muted-foreground" />}
          <span className="font-semibold">{confirmed ? 'השולח אושר כאיש קשר של' : 'סומן: השולח לא שייך ללקוח'}</span>
          {confirmed && decision.customerCode && <CustomerLink code={decision.customerCode} name={decision.customerName} showCode className="inline" />}
        </div>
        <span className="text-xs text-muted-foreground">
          {decision.decidedBy || 'לא ידוע'}
          {decision.decidedAt ? ` · ${formatDateTime(decision.decidedAt)}` : ''}
          {decision.note ? ` · ${decision.note}` : ''}
        </span>
        {result && (
          <Alert variant={result.ok ? 'default' : 'destructive'}>
            <AlertDescription>{result.text}</AlertDescription>
          </Alert>
        )}
        {signatureBlock}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[13px]">
      {suggestedCode ? (
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold">
            זה הלקוח <CustomerLink code={suggestedCode} name={suggestedName} className="inline" />?
          </span>
          <span className="text-xs text-muted-foreground">
            <span dir="ltr">{suggestedCode}</span>
            {suggestion?.how || suggestion?.matchedOn
              ? ` · זוהה לפי ${suggestion.how || suggestion.matchedOn}${suggestion.value ? ` ״${suggestion.value}״` : ''}`
              : ''}
          </span>
        </div>
      ) : (
        <span className="text-sm font-semibold">השולח לא רשום אצל אף לקוח, ולא נמצא לקוח שמתאים לחתימה. בחרו את הלקוח שלו.</span>
      )}

      {signatureBlock}

      {result && (
        <Alert variant={result.ok ? 'default' : 'destructive'}>
          <AlertDescription>{result.text}</AlertDescription>
        </Alert>
      )}

      {mode === 'idle' && suggestedCode && (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => run({ mode: 'confirm', customerCode: suggestedCode })}>
            {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
            אשר ושמור איש קשר
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setMode('other')}>
            בחר לקוח אחר
          </Button>
        </div>
      )}

      {mode === 'other' && (
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel htmlFor={`sender-customer-${email.id}`} className="text-xs text-muted-foreground">
              הלקוח של השולח
            </FieldLabel>
            <CustomerPicker id={`sender-customer-${email.id}`} value={picked} onChange={setPicked} placeholder="חיפוש לקוח…" />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy || !picked} onClick={() => picked && run({ mode: 'confirm', customerCode: picked })}>
              {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
              אשר ושמור איש קשר
            </Button>
            {suggestedCode && (
              <Button variant="ghost" disabled={busy} onClick={() => setMode('idle')}>
                ביטול
              </Button>
            )}
          </div>
        </div>
      )}

      {mode === 'reject' ? (
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel htmlFor={`sender-note-${email.id}`} className="text-xs text-muted-foreground">
              למה השולח לא שייך ללקוח?
            </FieldLabel>
            <Textarea id={`sender-note-${email.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="bg-glass-card" />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={busy || !note.trim()} onClick={() => run({ mode: 'reject', note: note.trim() })}>
              {busy && <Spinner data-icon="inline-start" />}
              שמירה
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setMode(suggestedCode ? 'idle' : 'other')}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setMode('reject')} className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline">
          השולח לא שייך ללקוח
        </button>
      )}
    </div>
  );
}

/** An insurer's approval mail: the open credit-limit request it was linked to. The amount is approved there, by a person. */
export function InsuranceLinkCard({ email }: { email: InboundEmail }) {
  const ins = insuranceOf(email.classificationQuotes);
  const requestId = email.linkedTable === 'CreditLimitRequests' ? (email.linkedId ?? ins?.requestId) : ins?.requestId;
  const q = useEntityGetOne(CreditLimitRequestsEntity, { id: requestId ?? '' }, { enabled: !!requestId });
  if (!requestId) {
    return <p className="text-[13px] text-muted-foreground">לא נמצאה בקשת ביטוח פתוחה ללקוח. נפתחה משימה לאחראית לבדוק לאיזו בקשה המייל שייך.</p>;
  }
  const req = q.data;
  const code = req?.customerCode ?? ins?.customerCode ?? email.customerCode ?? null;
  const limit = req?.requestedLimit ?? ins?.requestedLimit;
  const status = req?.status ?? ins?.status;
  return (
    <div className="glass-inner flex flex-col gap-2 p-[13px]">
      <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold">
        <ShieldCheckIcon className="size-4 text-muted-foreground" />
        בקשת הגדלת מסגרת
        {limit ? <span className="tabular-nums">{formatILS(limit)}</span> : null}
        {status && <StatusBadge value={status} tone="warning" />}
      </span>
      <span className="text-xs text-muted-foreground">
        {code ? `${req?.customerName ?? ins?.customerName ?? ''} · ` : ''}
        {ins?.companyId ? `ח.פ ${ins.companyId} · ` : ''}
        {ins?.matchedBy ? `קושר לפי ${ins.matchedBy}` : ''}
      </span>
      {q.isError && <span className="text-xs text-muted-foreground">לא הצלחנו לטעון את הבקשה.</span>}
      <p className="text-[13px]">שום דבר לא אושר אוטומטית: מי שמטפלת בביטוח מאשרת את הסכום במסך הביטוח של הלקוח.</p>
      {code && (
        <Link to={`${getRouteUrl('collections/customers/:code', { code })}?tab=${CREDIT_TAB}`} className={LINK}>
          לבקשה במסך הביטוח
          <ArrowUpLeftIcon className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

/** Types the code doesn't handle (documents, price): the manual tasks it opened, each linked to the tasks page. */
export function ManualTasksCard({ email }: { email: InboundEmail }) {
  const tasks = manualTasksOf(email.classificationQuotes);
  if (tasks.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((t, i) => (
        <div key={t.taskKey ?? t.taskId ?? i} className="flex items-start gap-2 text-[13px]">
          <ClipboardListIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{t.taskType || 'משימה ידנית'}</span>
            <Link to="/collections/tasks?tab=inbox" className={LINK}>
              למשימה במסך המשימות
              <ArrowUpLeftIcon className="size-3.5" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}