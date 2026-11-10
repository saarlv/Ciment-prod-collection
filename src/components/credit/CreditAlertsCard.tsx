import { Link } from 'react-router';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CalendarClockIcon, GaugeIcon, RotateCwIcon, ShieldCheckIcon } from 'lucide-react';
import { GetCreditExposureAction } from '@/product-types';
import { SystemMark } from '@/components/AgentPanel';
import { InsuranceProposalsDialog } from '@/components/credit/InsuranceProposalsDialog';
import { useActionQuery } from '@/hooks/useActionQuery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { EXPIRY_KIND, HIGH_USE_KIND, creditTabUrl, daysToExpiryLabel, formatPct1, isCreditExposure } from '@/utils/CreditExposure';
import type { CreditAlert, CreditExposure } from '@/utils/CreditExposure';
import { formatDate, formatILS, todayISO } from '@/utils/Format';

function headlineOf(high: number, expiring: number, insuredCustomers?: number | null): string {
  if (high === 0 && expiring === 0)
    return insuredCustomers ? `כל ${insuredCustomers} הלקוחות המבוטחים מתחת לסף, ואין מכסה שפוקעת בקרוב.` : 'אין כרגע לקוחות עם ביטוח אשראי.';
  const parts: string[] = [];
  if (high > 0) parts.push(high === 1 ? 'לקוח אחד הגיע לסף הניצול' : `${high} לקוחות הגיעו לסף הניצול`);
  if (expiring > 0) parts.push(expiring === 1 ? 'מכסה אחת פוקעת בקרוב' : `${expiring} מכסות פוקעות בקרוב`);
  return `${parts.join(', ו')}.`;
}

function AlertRow({ a }: { a: CreditAlert }) {
  const high = a.kind === HIGH_USE_KIND;
  const Icon = high ? GaugeIcon : CalendarClockIcon;
  const detail = high
    ? `${formatPct1(a.dynamicPct)} מתוך ${formatILS(a.insuredAmount)} מבוטח`
    : `${daysToExpiryLabel(a.daysToExpiry)} · תוקף ${formatDate(a.validUntil)}`;
  if (!a.customerCode) return null;
  return (
    <li>
      <Link
        to={creditTabUrl(a.customerCode)}
        aria-label={`${a.customerName ?? a.customerCode}: ${a.kind ?? ''}, ${detail}. פתיחת אובליגו וביטוח`}
        className="flex flex-col gap-0.5 rounded-[14px] px-2.5 py-2 outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline" className="h-5 gap-1 rounded-full border-transparent bg-warning-soft px-2 text-[11px] font-semibold text-warning-ink">
            <Icon />
            {a.kind}
          </Badge>
          <span className="truncate text-[13px] font-semibold text-foreground">{a.customerName ?? a.customerCode}</span>
        </span>
        <span className={cn('text-xs text-muted-foreground tabular-nums')}>{detail}</span>
      </Link>
    </li>
  );
}

/**
 * היום: the two credit-insurance alerts (ניצול גבוה on the dynamic obligo, פקיעה of the cover), computed in
 * code by GetCreditExposure without a customer, each a link straight to the customer's אובליגו וביטוח tab;
 * plus "בדיקת לקוחות מעל הסף", which opens increase proposals (ProposeInsuranceRequests).
 */
export function CreditAlertsCard({ bookkeeperName, className }: { bookkeeperName?: string | null; className?: string }) {
  const { executeFunction } = useExecuteAction(GetCreditExposureAction);
  const input = bookkeeperName ? { asOfDate: todayISO(), bookkeeperName } : { asOfDate: todayISO() };
  const q = useActionQuery(executeFunction, input, { cache: 'creditAlerts', validate: isCreditExposure });
  const d = q.data as CreditExposure | undefined;
  const alerts = d?.alerts ?? [];
  const high = alerts.filter((a) => a.kind === HIGH_USE_KIND);
  const expiring = alerts.filter((a) => a.kind === EXPIRY_KIND);

  return (
    <section aria-label="ביטוח אשראי" className={cn('glass flex flex-col gap-[13px] rounded-[26px] border p-[21px]', className)}>
      <div className="flex items-center gap-[13px]">
        <SystemMark icon={ShieldCheckIcon} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-bold">ביטוח אשראי</span>
          <span className="text-[13px] text-muted-foreground">ניצול גבוה ופקיעת מכסות</span>
        </div>
      </div>
      {q.isLoading ? (
        <>
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-10 w-full" />
        </>
      ) : q.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-ink-2">לא הצלחנו לטעון את התראות הביטוח.</p>
          <Button variant="outline" size="sm" onClick={q.refresh}>
            <RotateCwIcon data-icon="inline-start" />
            ניסיון נוסף
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink-2">{headlineOf(high.length, expiring.length, d?.use?.insuredCustomers)}</p>
          {alerts.length > 0 && (
            <ul className="-mx-2.5 flex flex-col">
              {alerts.map((a, i) => (
                <AlertRow key={`${a.kind}-${a.customerCode}-${i}`} a={a} />
              ))}
            </ul>
          )}
          <InsuranceProposalsDialog onCreated={q.refresh} />
        </>
      )}
    </section>
  );
}