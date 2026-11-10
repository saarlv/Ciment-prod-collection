import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ChevronDownIcon, RefreshCwIcon } from 'lucide-react';
import { CustomerDailySummariesEntity, CustomerSummaryRunAction } from '@/product-types';
import { AgentAvatar } from '@/components/AgentPanel';
import { StatusBadge } from '@/components/StatusBadge';
import { useCardAgent } from '@/hooks/useCardAgent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDate, formatDayMonth, formatILS, formatTime, todayISO } from '@/utils/Format';

type Summary = (typeof CustomerDailySummariesEntity)['instanceType'];
type ActionType = NonNullable<Summary['actionType']>;

const ACTION_TONE: Record<ActionType, 'critical' | 'warning' | 'info' | 'done' | 'neutral'> = {
  להתקשר: 'critical',
  'לשלוח תזכורת': 'warning',
  'לבדוק בירור': 'warning',
  'לאשר הבטחה': 'info',
  'לטפל בתקבול': 'info',
  'לחכות למועד': 'neutral',
  'אין צורך בפעולה': 'done',
};

const CODE_FALLBACK = 'קוד (גיבוי)';

const none = (v: unknown) => (v === null || v === undefined || v === '' ? 'אין' : null);

function Basis({ basis }: { basis: NonNullable<Summary['basis']> }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'יתרה פתוחה', value: none(basis.openBalance) ?? formatILS(basis.openBalance) },
    { label: 'בפיגור', value: none(basis.overdueAmount) ?? formatILS(basis.overdueAmount) },
    { label: 'הפיגור הוותיק', value: none(basis.oldestOverdueDays) ?? `${basis.oldestOverdueDays} ימים` },
    { label: 'התחייבות פתוחה', value: none(basis.openPromise) ?? basis.openPromise },
    { label: 'התחייבויות שלא קוימו', value: basis.brokenPromises ?? 'אין' },
    { label: 'בירורים פתוחים', value: basis.openDisputes ?? 'אין' },
    { label: 'משימות פתוחות', value: basis.openTasks?.length ? basis.openTasks.join(' · ') : 'אין' },
    { label: 'הערה אחרונה', value: none(basis.latestNote) ?? basis.latestNote },
    { label: 'קשר אחרון', value: none(basis.lastContact) ?? basis.lastContact },
  ];
  return (
    <dl className="grid gap-x-[21px] gap-y-2 rounded-[22px] bg-glass-inner p-[13px] px-[21px] text-[13px] sm:grid-cols-[auto_1fr]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-semibold text-ink-2 tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Tamar's daily summary for this customer — the card's agent-first hero. The latest row of
 * CustomerDailySummaries, with the suggested step, the facts it rests on, and a refresh that reruns it for
 * this customer. `children` is the card's primary action and the promise-check line, kept in the hero.
 */
export function CustomerDailySummary({ code, children }: { code: string; children?: ReactNode }) {
  const tamar = useCardAgent();
  const q = useEntityGetAll(CustomerDailySummariesEntity, {
    where: { column: 'customerCode', value: code },
    orderBy: [{ column: 'summaryDate', direction: 'desc' }],
    page: { size: 1 },
  });
  const { executeFunction } = useExecuteAction(CustomerSummaryRunAction);
  const [running, setRunning] = useState(false);
  const [basisOpen, setBasisOpen] = useState(false);
  const row = (q.data ?? [])[0] as Summary | undefined;

  async function refresh() {
    setRunning(true);
    try {
      const res = (await executeFunction({ customerCode: code })) as { error?: string } | undefined;
      if (res?.error) toast.add({ title: 'הסיכום לא רוענן', description: res.error, type: 'error' });
      else toast.add({ title: `${tamar.name} כתבה סיכום חדש`, type: 'success' });
    } catch (e) {
      toast.add({ title: 'הסיכום לא רוענן', description: e instanceof Error ? e.message : 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setRunning(false);
    }
  }

  const refreshButton = (
    <Button variant="ghost" size="sm" onClick={refresh} disabled={running} className="rounded-full bg-glass-soft text-ink-2 hover:bg-glass-inner">
      {running ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      {running ? `${tamar.name} כותבת…` : 'רענן סיכום'}
    </Button>
  );

  const stamp = row?.summaryDate
    ? row.summaryDate === todayISO()
      ? `הבוקר${row.writtenAt ? ` · ${formatTime(row.writtenAt)}` : ''}`
      : formatDate(row.summaryDate)
    : null;

  return (
    <Card className="glass-hero glass-lift gap-[21px] [--card-spacing:21px] md:[--card-spacing:34px]">
      <CardHeader className="flex flex-col gap-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-[13px]">
          <div className="flex items-center gap-[13px]">
            <AgentAvatar size="lg" agent="tamar" />
            <div className="flex flex-col leading-tight">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{tamar.name}</span>
                <span className="text-[13px] text-muted-foreground">{tamar.jobTitle}</span>
              </div>
              <span className="text-[13px] text-muted-foreground">
                {stamp ? `הסיכום היומי · ${stamp}` : 'הסיכום היומי'}
                {row?.writtenBy === CODE_FALLBACK && <span className="ms-1.5 text-xs">· נכתב ע״י קוד (גיבוי)</span>}
              </span>
            </div>
          </div>
          {refreshButton}
        </div>
        {q.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : q.isError ? (
          <CardTitle className="text-base font-semibold text-muted-foreground">לא הצלחנו לטעון את הסיכום של {tamar.name}. רענון הדף או "רענן סיכום" ינסו שוב.</CardTitle>
        ) : !row ? (
          <CardTitle className="text-[21px] leading-[1.4] font-bold md:text-[22px]">
            {tamar.name} תכתוב סיכום מחר בבוקר (07:30)
          </CardTitle>
        ) : (
          <>
            <CardTitle className="text-[19px] leading-[1.55] font-bold md:text-[20px]">{row.summary}</CardTitle>
            {row.suggestedAction && (
              <div className="flex flex-wrap items-center gap-2 rounded-[22px] bg-glass-inner p-[13px] px-[21px]">
                {row.actionType && <StatusBadge value={row.actionType} tone={ACTION_TONE[row.actionType]} />}
                <span className="text-sm font-semibold text-ink-2">{row.suggestedAction}</span>
              </div>
            )}
            {row.basis && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  aria-expanded={basisOpen}
                  onClick={() => setBasisOpen((o) => !o)}
                  className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-link hover:underline"
                >
                  על מה זה מבוסס
                  <ChevronDownIcon className={cn('size-3.5 transition-transform duration-150', basisOpen && 'rotate-180')} />
                </button>
                {basisOpen && <Basis basis={row.basis} />}
              </div>
            )}
            {row.summaryDate && row.summaryDate !== todayISO() && (
              <span className="text-xs text-muted-foreground">הסיכום מ-{formatDayMonth(row.summaryDate)}; הבא ייכתב מחר בבוקר.</span>
            )}
          </>
        )}
      </CardHeader>
      {children && <CardContent className="flex flex-col gap-[13px]">{children}</CardContent>}
    </Card>
  );
}