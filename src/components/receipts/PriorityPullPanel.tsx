import { useState } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AlertCircleIcon, CloudDownloadIcon, InfoIcon, LandmarkIcon, SettingsIcon } from 'lucide-react';
import { SyncPriorityBankLinesAction } from '@/product-types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatNumber, formatTime } from '@/utils/Format';
import { identifyCountsLine } from '@/utils/ReceiptsIdentify';
import type { IdentifyCounts } from '@/utils/ReceiptsIdentify';
import { bankMissingLine, configErrorText, isNotConnected, syncResultLine } from '@/utils/ReceiptsDay';
import type { Batch, SyncOutput } from '@/utils/ReceiptsDay';
import { NOT_CONNECTED_TEXT } from '@/utils/ReceiptsDay';

type Outcome = { kind: 'done'; out: SyncOutput } | { kind: 'failed'; message: string };

/**
 * The top of the receipts screen: when today's bank statement lines were last pulled from Priority, and the
 * one primary action "משוך עכשיו מפריוריטי". There is no schedule until the Priority API exists (Saar's call),
 * so the pull runs only from here. Until Priority is connected the pull answers with a calm notice.
 * The pull identifies the new lines' customers (IdentifyCustomers, stage 4) and says what it found in one line.
 * `primary` = the pull is the screen's one primary button; once identified lines exist, "אשר את כל הוודאיים" is.
 * `onDone` lets the page refresh its lists.
 */
export function PriorityPullPanel({
  pull,
  pullsToday,
  loading,
  loadError,
  primary = true,
  onDone,
}: {
  pull?: Batch;
  pullsToday: number;
  loading: boolean;
  loadError: boolean;
  primary?: boolean;
  onDone?: () => void;
}) {
  const { executeFunction } = useExecuteAction(SyncPriorityBankLinesAction);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function runPull() {
    setRunning(true);
    setOutcome(null);
    try {
      const out = (await executeFunction({ dryRun: false })) as SyncOutput;
      setOutcome({ kind: 'done', out });
      if (isNotConnected(out)) toast.add({ title: NOT_CONNECTED_TEXT, type: 'info' });
      else if (out.errors?.length) toast.add({ title: 'המשיכה הסתיימה עם שגיאות', description: out.errors.join(' · '), type: 'error' });
      else toast.add({ title: 'המשיכה מפריוריטי הסתיימה', type: 'success' });
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'המשיכה לא הסתיימה.';
      setOutcome({ kind: 'failed', message });
      toast.add({ title: 'המשיכה לא הסתיימה', description: 'שורות שכבר נכתבו יופיעו במסך. אפשר למשוך שוב.', type: 'error' });
    } finally {
      setRunning(false);
      onDone?.();
    }
  }

  const pulled = outcome?.kind === 'done' ? outcome.out : null;
  const notConnected = !!pulled && isNotConnected(pulled);
  const done = notConnected ? null : pulled;
  const configError = configErrorText(done?.configError);
  const missingLine = done ? bankMissingLine(done) : null;
  const identifyLine = done ? identifyCountsLine((done.identify as { counts?: IdentifyCounts } | undefined)?.counts) : null;
  const pullFailed = pull?.status === 'נכשל';

  return (
    <section aria-label="משיכה מפריוריטי" className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px]">
      <div className="flex flex-wrap items-center gap-[13px]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-glass-inner">
          <LandmarkIcon className="size-5 text-ink-2" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col" aria-live="polite">
          {loading ? (
            <Skeleton className="h-6 w-56" />
          ) : loadError ? (
            <span className="text-lg font-bold">לא הצלחנו לטעון את מצב המשיכה</span>
          ) : pull ? (
            <span className="text-lg font-bold">
              נמשך מפריוריטי ב-<span className="tabular-nums">{formatTime(pull.uploadedAt)}</span>
            </span>
          ) : (
            <span className="text-lg font-bold">עוד לא נמשכו שורות של היום מפריוריטי</span>
          )}
          <span className="text-[13px] text-muted-foreground">
            {running
              ? 'מושך את שורות דפי הבנק ומזהה את הלקוח של כל העברה. זה יכול לקחת דקה–שתיים.'
              : pull
                ? `${pullsToday > 1 ? `${formatNumber(pullsToday)} משיכות היום · ` : ''}המשיכה האחרונה החזירה ${formatNumber(pull.rowsRead ?? 0)} שורות. משיכה נוספת מוסיפה רק שורות חדשות.`
                : 'אין משיכה אוטומטית עד שפריוריטי יחובר: השורות נמשכות רק מהכפתור.'}
          </span>
        </div>
        <Button
          variant={primary ? 'default' : 'outline'}
          className={cn('h-10 rounded-full px-[18px] font-semibold', primary && 'shadow-primary')}
          disabled={running || loading}
          onClick={() => void runPull()}
        >
          {running ? <Spinner data-icon="inline-start" /> : <CloudDownloadIcon data-icon="inline-start" />}
          {running ? 'מושך…' : 'משוך עכשיו מפריוריטי'}
        </Button>
      </div>


      {done && !done.errors?.length && (
        <p className="text-sm text-ink-2" role="status">
          {syncResultLine(done)}
          {missingLine ? ` ${missingLine}` : ''}
          {identifyLine ? ` ${identifyLine}` : ''}
        </p>
      )}

      {notConnected && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{NOT_CONNECTED_TEXT}</AlertTitle>
          <AlertDescription>כשהחיבור יוגדר, הכפתור ימשוך את שורות דפי הבנק של היום. בינתיים אפשר להעלות קובץ בנק.</AlertDescription>
        </Alert>
      )}

      {configError && (
        <Alert>
          <SettingsIcon />
          <AlertTitle>{configError}</AlertTitle>
          <AlertDescription>
            המשיכה רצה, אבל הבדיקה ״דפי בנק לא נטענו״ לא רצה. יש להשלים את שעות דפי הבנק בהגדרות התקבולים.
          </AlertDescription>
        </Alert>
      )}

      {done && !!done.errors?.length && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>המשיכה הסתיימה עם שגיאות</AlertTitle>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-1 ps-4">
              {done.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {outcome?.kind === 'failed' && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>המשיכה לא הסתיימה</AlertTitle>
          <AlertDescription>{outcome.message} שורות שכבר נכתבו יופיעו כאן. אפשר למשוך שוב – שורה שכבר נמשכה לא תיכתב פעמיים.</AlertDescription>
        </Alert>
      )}

      {!done && !running && pullFailed && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>המשיכה האחרונה נכשלה</AlertTitle>
          <AlertDescription>{pull?.errors || 'לא נכתבו שורות.'} אפשר למשוך שוב.</AlertDescription>
        </Alert>
      )}
    </section>
  );
}