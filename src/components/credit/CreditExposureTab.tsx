import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import {
  AlertCircleIcon,
  ArrowUpLeftIcon,
  BanknoteIcon,
  CheckIcon,
  CalendarClockIcon,
  ExpandIcon,
  FileClockIcon,
  RefreshCwIcon,
  RotateCwIcon,
  GaugeIcon,
  LandmarkIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { DecideInsuranceRequestAction, GetCreditExposureAction } from '@/product-types';
import { SystemMark } from '@/components/AgentPanel';
import { StatusBadge } from '@/components/StatusBadge';
import { useActionQuery } from '@/hooks/useActionQuery';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { useReceiptLineLinks } from '@/hooks/useReceiptLineLinks';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  CREDIT_LIMIT_BASIS,
  EXPOSURE_TYPES,
  TRANSFER_KIND,
  daysToExpiryLabel,
  formatPct1,
  isCreditExposure,
  isHigh,
} from '@/utils/CreditExposure';
import type { CreditAdjustment, CreditExposure, CreditUse, ExposureGroup, OpenCreditRequest } from '@/utils/CreditExposure';
import { formatDate, formatDateTime, formatILS, todayISO } from '@/utils/Format';

const HEAD = 'text-xs font-semibold text-muted-foreground';

function when(at?: string | null) {
  if (!at) return '—';
  return at.length > 10 ? formatDateTime(at) : formatDate(at);
}

function Block({ title, icon: Icon, hint, children, className }: { title: string; icon: typeof ShieldCheckIcon; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('glass-inner flex min-w-0 flex-col gap-[13px] p-[13px] md:p-[21px]', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <span className="ms-auto text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Use bar: calm blue under the threshold, the warning colour from it on. No separate level above 100%. */
function UseBar({ pct, threshold, high }: { pct?: number | null; threshold: number; high: boolean }) {
  const mark = Math.min(Math.max(threshold, 0), 100);
  return (
    <div className="relative">
      <Progress
        value={Math.min(Math.max(pct ?? 0, 0), 100)}
        aria-label={`ניצול ${formatPct1(pct)}`}
        className={high ? '[&_[data-slot=progress-indicator]]:bg-warning' : '[&_[data-slot=progress-indicator]]:bg-aging-4'}
      />
      <span
        aria-hidden
        title={`סף ${formatPct1(threshold)}`}
        style={{ '--use-mark': `${mark}%` } as CSSProperties}
        className="absolute start-(--use-mark) -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground/60 rtl:translate-x-1/2"
      />
    </div>
  );
}

function UseCard({ label, sub, use, basisAmount, threshold, lead }: { label: string; sub: string; use?: CreditUse | null; basisAmount?: number | null; threshold: number; lead?: boolean }) {
  const high = isHigh(use, threshold);
  const headroom = use?.headroom;
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5 rounded-[22px] p-[13px]', high ? 'bg-warning-soft/70' : 'bg-glass-card')}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        {high && <StatusBadge value="גבוה" className="h-5 text-[11px]" />}
      </div>
      <span className={cn('leading-none font-extrabold tracking-[-0.02em] tabular-nums', lead ? 'text-[40px]' : 'text-[28px]', high && 'text-warning-ink')}>
        {use ? formatPct1(use.pct) : '—'}
      </span>
      <span className="text-[13px] text-ink-2 tabular-nums">
        {formatILS(use?.amount)} <span className="text-muted-foreground">מתוך {formatILS(basisAmount)}</span>
      </span>
      {use && <UseBar pct={use.pct} threshold={threshold} high={high} />}
      <span className="text-xs text-muted-foreground tabular-nums">
        {headroom === undefined || headroom === null ? sub : headroom >= 0 ? `נשארו ${formatILS(headroom)} · ${sub}` : `מעל המסגרת ב־${formatILS(-headroom)} · ${sub}`}
      </span>
    </div>
  );
}

/** A dummy ICIC action: shown, never wired. */
function IcicButton({ icon: Icon, label }: { icon: typeof ShieldCheckIcon; label: string }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" disabled className="rounded-full">
        <Icon data-icon="inline-start" />
        {label}
      </Button>
      <span className="text-[11px] text-muted-foreground">יחובר ל-ICIC</span>
    </span>
  );
}

function AdjustmentRow({ a, href }: { a: CreditAdjustment; href?: string }) {
  const transfer = a.kind === TRANSFER_KIND;
  return (
    <li className="flex flex-col gap-1 rounded-[18px] bg-glass-card px-[13px] py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('h-5 rounded-full border-transparent px-2 text-[11px] font-semibold', transfer ? 'bg-warning-soft text-warning-ink' : 'bg-primary/12 text-link')}>
          {a.kind}
        </Badge>
        <span className="text-[13px] font-semibold">{a.payerName || a.receiptKey || '—'}</span>
        <span className="text-xs text-muted-foreground">{formatDate(a.valueDate)}</span>
        <span className="ms-auto text-sm font-bold tabular-nums">−{formatILS(a.amount)}</span>
      </div>
      {a.reason && <p className="text-xs leading-relaxed text-ink-2">{a.reason}</p>}
      {transfer && href && (
        <Link to={href} className="inline-flex items-center gap-1 self-start text-xs font-semibold text-link hover:underline">
          לרשומה בתקבולים
          <ArrowUpLeftIcon className="size-3.5" />
        </Link>
      )}
    </li>
  );
}

function BreakdownTable({ groups }: { groups: ExposureGroup[] }) {
  const ordered = EXPOSURE_TYPES.map((t) => groups.find((g) => g.itemType === t) ?? { itemType: t, count: 0, total: 0, items: [] });
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[620px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD, 'ps-[21px]')}>מסמך</TableHead>
            <TableHead className={HEAD}>תאריך מסמך</TableHead>
            <TableHead className={HEAD}>פירעון</TableHead>
            <TableHead className={cn(HEAD, 'pe-[21px] text-end')}>סכום</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map((g) => {
            const items = g.items ?? [];
            const empty = items.length === 0;
            return [
              <TableRow key={`h-${g.itemType}`} className={cn('bg-glass-faint hover:bg-glass-faint', empty && 'text-muted-foreground')}>
                <TableCell colSpan={3} className="ps-[21px] text-[13px] font-bold">
                  {g.itemType} <span className="font-normal text-muted-foreground tabular-nums">({g.count ?? items.length})</span>
                  {empty && <span className="ms-2 text-xs font-normal">אין</span>}
                </TableCell>
                <TableCell className="pe-[21px] text-end text-[13px] font-bold tabular-nums">{empty ? '—' : formatILS(g.total)}</TableCell>
              </TableRow>,
              ...items.map((it, i) => (
                <TableRow key={`${g.itemType}-${it.id ?? i}`} className="hover:bg-glass-faint">
                  <TableCell className="ps-[21px] font-medium">
                    <span dir="ltr">{it.reference || '—'}</span>
                  </TableCell>
                  <TableCell>{formatDate(it.docDate)}</TableCell>
                  <TableCell>{formatDate(it.dueDate)}</TableCell>
                  <TableCell className="pe-[21px] text-end tabular-nums">{formatILS(it.amount)}</TableCell>
                </TableRow>
              )),
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** The tab's summary, in one sentence from the numbers (code, no agent). */
function exposureSentence(d: CreditExposure, threshold: number): string {
  const cover = d.cover;
  const dyn = d.use?.dynamic;
  const stat = d.use?.static;
  const byLimit = !cover || d.use?.basis === CREDIT_LIMIT_BASIS;
  const basisAmount = d.use?.basisAmount ?? d.use?.insuredAmount ?? cover?.insuredAmount;
  const parts: string[] = [];
  if (!dyn || !basisAmount) {
    if (!cover) parts.push(`האובליגו הדינמי עומד על ${formatILS(d.dynamicObligo?.amount)}. אין ללקוח ביטוח אשראי ולא מוגדרת לו מסגרת אשראי ב-Priority, אז לא מחושב ניצול.`);
    else parts.push(cover.status && cover.status !== 'תקף' ? `המכסה בסטטוס ${cover.status}, ואין כרגע מסגרת מבוטחת לחשב מולה ניצול.` : 'אין כרגע מסגרת מבוטחת לחשב מולה ניצול.');
  } else {
    const adj = d.dynamicObligo?.adjustments ?? [];
    let s = `האובליגו הדינמי עומד על ${formatPct1(dyn.pct)} ${byLimit ? 'ממסגרת האשראי' : 'מהמסגרת המבוטחת'} (${formatILS(dyn.amount)} מתוך ${formatILS(basisAmount)})`;
    if (adj.length > 0) s += `, אחרי ${formatILS(d.dynamicObligo?.adjustmentsTotal)} שכבר נכנסו ועוד לא ב-Priority (בסטטי ${formatPct1(stat?.pct)})`;
    s += isHigh(dyn, threshold) ? `, כלומר מעל הסף של ${formatPct1(threshold)}.` : '.';
    parts.push(s);
    const cheques = d.dynamicObligo?.undepositedCheques ?? [];
    if (cheques.length > 0 && d.use?.afterDeposit)
      parts.push(`אחרי הפקדת ${cheques.length === 1 ? 'הצ׳ק' : `${cheques.length} הצ׳קים`} הוא צפוי לרדת ל-${formatPct1(d.use.afterDeposit.pct)}.`);
  }
  if (cover?.expiringSoon) parts.push(cover.expired || (cover.daysToExpiry ?? 0) < 0 ? `המכסה פגה ב-${formatDate(cover.validUntil)}.` : `המכסה פוקעת ${daysToExpiryLabel(cover.daysToExpiry)}, ב-${formatDate(cover.validUntil)}.`);
  return parts.join(' ');
}

const PROPOSED = 'הוצעה ע״י הסוכנת';

interface DecideResult {
  refused?: boolean;
  reason?: string;
  errors?: string[];
}

/**
 * The customer's open increase proposal. A proposal in הוצעה ע״י הסוכנת (shown "הוצעה") gets "אישור":
 * DecideInsuranceRequest moves it to אושר – לא הוגש. Nothing is submitted to the insurer.
 */
function OpenRequestCard({ req, onDecided }: { req: OpenCreditRequest; onDecided: () => void }) {
  const scope = useOwnerScope();
  const { executeFunction } = useExecuteAction(DecideInsuranceRequestAction);
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<string | null>(null);
  const status = decided ?? req.status;
  const canApprove = status === PROPOSED && !!req.id;

  async function approve() {
    if (!req.id) return;
    setBusy(true);
    try {
      const res = (await executeFunction({ requestId: String(req.id), decidedBy: scope.actorName })) as DecideResult | undefined;
      if (res?.refused) {
        toast.add({ title: 'ההצעה לא אושרה', description: res.reason || 'הבקשה כבר לא במצב שאפשר לאשר.', type: 'error' });
        return;
      }
      if (res?.errors?.length) {
        toast.add({ title: 'ההצעה לא אושרה', description: res.errors.join(' · '), type: 'error' });
        return;
      }
      setDecided('אושר – לא הוגש');
      toast.add({ title: 'ההצעה אושרה', description: 'הסטטוס: אושר – לא הוגש. שום דבר לא נשלח לבסס״ח.', type: 'success' });
      onDecided();
    } catch {
      toast.add({ title: 'ההצעה לא אושרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-[18px] bg-glass-card px-[13px] py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <FileClockIcon className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-bold">הצעת הגדלה</span>
        <StatusBadge value={status} className="ms-auto h-5 text-[11px]" />
      </div>
      <span className="text-[13px] tabular-nums">
        {formatILS(req.currentLimit)} ← <strong>{formatILS(req.requestedLimit)}</strong>
      </span>
      {req.justification && <p className="text-xs leading-relaxed text-ink-2">{req.justification}</p>}
      <span className="text-[11px] text-muted-foreground">
        {req.proposedBy ? `${req.proposedBy} · ` : ''}
        {when(req.requestCreatedAt)} · שום דבר לא נשלח לבסס״ח
      </span>
      {canApprove && (
        <Button size="sm" className="mt-1 self-start rounded-full" onClick={approve} disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
          אישור
        </Button>
      )}
    </div>
  );
}

/**
 * The customer card's tab "אובליגו", for every customer: the summary sentence, the cover (with the dummy ICIC buttons) or,
 * without a cover, Priority's credit limit as the basis,
 * static vs dynamic use, what moves the dynamic obligo, the cheques expected to drop on deposit, and the
 * breakdown by type, from GetCreditExposure. The open increase proposal can be approved here.
 */
export function CreditExposureTab({ code }: { code: string }) {
  const { executeFunction } = useExecuteAction(GetCreditExposureAction);
  const q = useActionQuery(executeFunction, { customerCode: code, asOfDate: todayISO() }, { cache: 'creditExposure', validate: isCreditExposure });
  const d = q.data as CreditExposure | undefined;
  const adjustments = d?.dynamicObligo?.adjustments ?? [];
  const receiptLink = useReceiptLineLinks(adjustments.map((a) => a.bankLineId)).href;

  if (q.isLoading)
    return (
      <div className="flex flex-col gap-[13px] px-[21px] pb-[21px]">
        <Skeleton className="h-16 w-full rounded-[22px]" />
        <div className="grid gap-[13px] lg:grid-cols-2">
          <Skeleton className="h-48 rounded-[22px]" />
          <Skeleton className="h-48 rounded-[22px]" />
        </div>
        <Skeleton className="h-40 rounded-[22px]" />
      </div>
    );
  if (q.isError || !d)
    return (
      <div className="px-[21px] pb-[21px]">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>לא הצלחנו לטעון את האובליגו</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            בדקו את החיבור ונסו שוב בעוד רגע.
            <Button variant="outline" size="sm" onClick={q.refresh}>
              <RotateCwIcon data-icon="inline-start" />
              ניסיון נוסף
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  const cover = d.insured ? d.cover : null;

  const threshold = d.use?.thresholdPct ?? 80;
  const basisAmount = d.use?.basisAmount ?? d.use?.insuredAmount ?? cover?.insuredAmount;
  const dyn = d.dynamicObligo;
  const cheques = dyn?.undepositedCheques ?? [];
  const req = d.openRequest;

  return (
    <div className="flex flex-col gap-[13px] px-[13px] pb-[21px] md:px-[21px]">
      <div className="flex items-start gap-[13px] rounded-[22px] bg-glass-strong p-[13px] shadow-glass-pill md:p-4">
        <SystemMark icon={GaugeIcon} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold text-muted-foreground">בקצרה</span>
          <p className="text-[15px] leading-relaxed font-semibold text-foreground">{exposureSentence(d, threshold)}</p>
        </div>
      </div>

      <div className="grid items-start gap-[13px] lg:grid-cols-[1fr_1.618fr]">
        {cover ? (
        <Block title="ביטוח" icon={ShieldCheckIcon} hint={cover.syncedAt ? `סונכרן ${when(cover.syncedAt)}` : 'מועד הסנכרון לא ידוע'}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[21px] gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">מבטח</dt>
            <dd className="font-semibold">{cover.insurer || '—'}</dd>
            <dt className="text-muted-foreground">מספר מכסה</dt>
            <dd dir="ltr" className="text-start font-semibold">
              {cover.coverNo || '—'}
            </dd>
            <dt className="text-muted-foreground">מסגרת מבוטחת</dt>
            <dd className="text-base font-bold tabular-nums">{formatILS(cover.insuredAmount)}</dd>
            <dt className="text-muted-foreground">תוקף</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{formatDate(cover.validUntil)}</span>
              {cover.expiringSoon ? (
                <StatusBadge value={daysToExpiryLabel(cover.daysToExpiry)} tone="warning" className="h-5 text-[11px]" />
              ) : (
                <span className="text-xs text-muted-foreground">{daysToExpiryLabel(cover.daysToExpiry)}</span>
              )}
            </dd>
            <dt className="text-muted-foreground">סטטוס</dt>
            <dd>
              <StatusBadge value={cover.status} className="h-5 text-[11px]" />
            </dd>
            {cover.coverSource && (
              <>
                <dt className="text-muted-foreground">מקור</dt>
                <dd className="font-semibold">{cover.coverSource}</dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-[13px] pt-1">
            <IcicButton icon={ExpandIcon} label="הרחבת מסגרת" />
            {cover.expiringSoon && <IcicButton icon={RefreshCwIcon} label="חידוש" />}
          </div>
          {req && <OpenRequestCard key={req.id ?? "open"} req={req} onDecided={q.refresh} />}
        </Block>
        ) : (
        <Block title="מסגרת אשראי" icon={LandmarkIcon} hint="כמו ב-Priority">
          <p className="text-[13px] font-semibold text-ink-2">אין ביטוח אשראי · מול מסגרת האשראי</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[21px] gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">מסגרת אשראי</dt>
            <dd className="text-base font-bold tabular-nums">{d.use?.creditLimit || d.use?.basisAmount ? formatILS(d.use?.creditLimit ?? d.use?.basisAmount) : 'לא מוגדרת'}</dd>
          </dl>
          {req && <OpenRequestCard key={req.id ?? 'open'} req={req} onDecided={q.refresh} />}
        </Block>
        )}

        <Block title="ניצול" icon={BanknoteIcon} hint={`${cover ? 'מול הסכום המבוטח' : 'מול מסגרת האשראי'} · הסף ${formatPct1(threshold)}`}>
          <div className="flex flex-wrap gap-[13px]">
            <UseCard label="אובליגו סטטי" sub="כמו ב-Priority" use={d.use?.static} basisAmount={basisAmount} threshold={threshold} />
            <UseCard lead label="אובליגו דינמי" sub="מתוקן לפי מה שבאמצע עבודה" use={d.use?.dynamic} basisAmount={basisAmount} threshold={threshold} />
          </div>
          {!d.use?.dynamic && (
            <p className="text-xs text-muted-foreground">{cover ? 'אין מסגרת מבוטחת בתוקף, אז לא מחושב ניצול.' : 'אין מסגרת אשראי ב-Priority, אז לא מחושב ניצול.'}</p>
          )}
        </Block>
      </div>

      <div className="grid items-start gap-[13px] lg:grid-cols-[1.618fr_1fr]">
        <Block title="מסטטי לדינמי" icon={ShieldCheckIcon} hint={d.staticObligo?.asOf ? `Priority חישב ${when(d.staticObligo.asOf)}` : undefined}>
          <div className="flex items-baseline justify-between gap-2 rounded-[18px] bg-glass-card px-[13px] py-2.5">
            <span className="text-[13px] font-semibold">אובליגו סטטי · מ-Priority</span>
            <span className="text-base font-bold tabular-nums">{formatILS(d.staticObligo?.amount ?? dyn?.staticAmount)}</span>
          </div>
          {adjustments.length === 0 ? (
            <p className="px-1 text-[13px] text-muted-foreground">אין העברות בבירור או קבלות שמחכות ל-Priority. הדינמי שווה לסטטי.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {adjustments.map((a, i) => (
                <AdjustmentRow key={`${a.bankLineId ?? a.receiptKey ?? a.matchProposalId ?? i}`} a={a} href={(a.bankLineId && receiptLink(a.bankLineId)) || undefined} />
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between gap-2 rounded-[18px] bg-glass-strong px-[13px] py-2.5 shadow-glass-pill">
            <span className="text-[13px] font-bold">אובליגו דינמי</span>
            <span className="text-lg font-extrabold tabular-nums">{formatILS(dyn?.amount)}</span>
          </div>
        </Block>

        <Block title="צפוי לרדת בהפקדה" icon={CalendarClockIcon} hint="צ׳קים שלא הופקדו">
          {cheques.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">אין צ׳קים שמחכים להפקדה.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {cheques.map((c, i) => (
                  <li key={c.id ?? i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[18px] bg-glass-card px-[13px] py-2">
                    <span dir="ltr" className="text-[13px] font-semibold">
                      {c.reference || '—'}
                    </span>
                    <span className="text-xs text-muted-foreground">פירעון {formatDate(c.dueDate)}</span>
                    <span className="ms-auto text-[13px] font-bold tabular-nums">{formatILS(c.amount)}</span>
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1 px-1 text-[13px]">
                <dt className="text-muted-foreground">סך הצ׳קים</dt>
                <dd className="font-semibold tabular-nums">{formatILS(dyn?.chequesTotal)}</dd>
                <dt className="font-semibold">אחרי הפקדה</dt>
                <dd className="font-bold tabular-nums">
                  {formatILS(dyn?.afterDeposit)}
                  {d.use?.afterDeposit && <span className="ms-1.5 text-xs font-normal text-muted-foreground">({formatPct1(d.use.afterDeposit.pct)})</span>}
                </dd>
              </dl>
              <p className="px-1 text-xs text-muted-foreground">לא יורד מהאובליגו הדינמי עד ההפקדה, כי צ׳ק יכול לחזור.</p>
            </>
          )}
        </Block>
      </div>

      <section aria-label="פירוט האובליגו" className="glass-inner flex flex-col gap-1 overflow-hidden pt-[13px] md:pt-[21px]">
        <h3 className="px-[21px] text-sm font-bold">פירוט האובליגו</h3>
        <BreakdownTable groups={d.breakdown ?? []} />
      </section>
    </div>
  );
}