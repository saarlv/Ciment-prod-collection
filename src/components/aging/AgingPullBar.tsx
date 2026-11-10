import { useState } from 'react';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CloudDownloadIcon } from 'lucide-react';
import { ImportBatchesEntity, RunDayScheduleAction } from '@/product-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { pullResultLine } from '@/utils/AgingMonths';
import { formatDate, formatTime, israelDateOf, todayISO } from '@/utils/Format';

const MORNING_PULL = 'משיכת בוקר – Priority';
const WRITTEN = 'נכתב';

/**
 * The top of the aging report: when the open movements were last pulled from Priority ("נמשך מפריוריטי ב-HH:MM",
 * the latest successful ImportBatches row of the morning pull) and the screen's one primary button, which runs
 * RunDaySchedule in manual mode — the 06:00 phase only (customers, movements, open orders, the task scan). The
 * result is said once, on screen; the toast only says it finished. `onPulled` refreshes the report.
 */
export function AgingPullBar({ morningAt, onPulled }: { morningAt: string; onPulled: () => void }) {
  const today = todayISO();
  const pulls = useEntityGetAll(ImportBatchesEntity, {
    where: { and: [{ column: 'kind', value: MORNING_PULL }, { column: 'status', value: WRITTEN }] },
    orderBy: [{ column: 'uploadedAt', direction: 'desc' }],
    page: { size: 1 },
  });
  const { executeFunction } = useExecuteAction(RunDayScheduleAction);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const last = (pulls.data ?? []).find((b) => !b.isTestFixture) ?? pulls.data?.[0];
  const lastDay = israelDateOf(last?.uploadedAt);
  const pulledToday = !!last && lastDay === today;

  async function pull() {
    setRunning(true);
    setResult(null);
    try {
      const out = await executeFunction({ mode: 'ידני', dryRun: false });
      const line = pullResultLine(out);
      setResult(line);
      if (line.notice) toast.add({ title: 'החיבור לפריוריטי עדיין לא הוגדר', type: 'info' });
      else toast.add({ title: line.ok ? 'המשיכה מפריוריטי הסתיימה' : 'המשיכה מפריוריטי הסתיימה בלי להשלים', type: line.ok ? 'success' : 'error' });
      onPulled();
      pulls.refetch();
    } catch (e) {
      setResult({ ok: false, text: `המשיכה לא רצה – ${e instanceof Error && e.message ? e.message : 'השרת לא ענה'}. שום דבר לא נמחק, אפשר למשוך שוב.` });
      toast.add({ title: 'המשיכה לא רצה', type: 'error' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="glass-inner flex flex-col gap-2 p-[13px] md:p-[21px]">
      <div className="flex flex-wrap items-center gap-[13px]">
        <div className="flex min-w-0 flex-1 flex-col" aria-live="polite">
          {pulls.isLoading ? (
            <Skeleton className="h-6 w-56" />
          ) : pulls.isError ? (
            <span className="text-base font-bold">לא הצלחנו לבדוק מתי הייתה המשיכה האחרונה</span>
          ) : pulledToday ? (
            <span className="text-base font-bold">
              נמשך מפריוריטי ב-<span className="tabular-nums">{formatTime(last?.uploadedAt)}</span>
            </span>
          ) : (
            <span className="text-base font-bold">עוד לא נמשך מפריוריטי היום</span>
          )}
          <span className="text-[13px] text-muted-foreground">
            {running
              ? 'מושך לקוחות, תנועות פתוחות והזמנות פתוחות, ואחר כך סורק את המשימות. זה יכול לקחת דקה או שתיים.'
              : `${!pulledToday && last ? `המשיכה האחרונה: ${formatDate(lastDay)} ${formatTime(last.uploadedAt)}. ` : ''}המשיכה האוטומטית רצה בימים א׳–ה׳ ב-${morningAt}.`}
          </span>
        </div>
        <Button className="h-10 rounded-full px-[18px] font-semibold shadow-primary" disabled={running} onClick={() => void pull()}>
          {running ? <Spinner data-icon="inline-start" /> : <CloudDownloadIcon data-icon="inline-start" />}
          {running ? 'מושך…' : 'משוך עכשיו מפריוריטי'}
        </Button>
      </div>
      {result && (
        <p role="status" className={cn('text-[13px]', result.ok ? 'text-ink-2' : 'font-semibold text-critical-ink')}>
          {result.text}
        </p>
      )}
    </div>
  );
}