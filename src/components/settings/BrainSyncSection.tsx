import { useState } from 'react';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { RefreshCwIcon } from 'lucide-react';
import { SyncFromBrainAction, SyncRunsEntity } from '@/product-types';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDateTime, formatNumber } from '@/utils/Format';

type SyncTable = 'customers' | 'invoices';
const TABLES: { value: SyncTable; label: string }[] = [
  { value: 'customers', label: 'לקוחות' },
  { value: 'invoices', label: 'חשבוניות' },
];
const MAX_CONTINUATIONS = 5;
const HEAD = 'text-xs font-semibold text-muted-foreground';
const tableLabel = (t?: string) => TABLES.find((x) => x.value === t)?.label ?? t ?? '—';

/** Settings → imports: run SyncFromBrain by hand (dry-run by default) and show the latest SyncRuns row. */
export function BrainSyncSection() {
  const [dryRun, setDryRun] = useState(true);
  const [tables, setTables] = useState<SyncTable[]>(['customers', 'invoices']);
  const [runError, setRunError] = useState<string | null>(null);
  const [part, setPart] = useState(0);
  const { executeFunction, isLoading: running } = useExecuteAction(SyncFromBrainAction);
  const last = useEntityGetAll(SyncRunsEntity, { orderBy: [{ column: 'startedAt', direction: 'desc' }], page: { size: 10 } });
  // Priority-direct runs have their own section; this one shows only the Brain sync.
  const run = (last.data ?? []).find((r) => r.syncKind !== 'priority-direct');

  function toggleTable(t: SyncTable, on: boolean) {
    setTables((prev) => (on ? [...new Set([...prev, t])] : prev.filter((x) => x !== t)));
  }

  async function syncNow() {
    setRunError(null);
    try {
      let result = await executeFunction({ dryRun, tables, trigger: 'ידני' });
      // Invoices stopped at the time budget: keep reading from where it stopped, up to 5 continuations.
      for (let n = 1; n <= MAX_CONTINUATIONS && result?.resumeFrom; n++) {
        setPart(n + 1);
        result = await executeFunction({ dryRun, tables, trigger: 'ידני', resumeFrom: result.resumeFrom });
      }
      if (result?.resumeFrom) setRunError(`הקריאה לא הסתיימה אחרי ${MAX_CONTINUATIONS} המשכים. אפשר להריץ שוב.`);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'הסנכרון נכשל');
    } finally {
      setPart(0);
      last.refetch();
    }
  }

  return (
    <section aria-label="סנכרון מפריוריטי" className="glass glass-lift flex flex-col gap-[21px] rounded-[26px] border p-[21px]">
      <div className="flex flex-col">
        <h2 className="text-base font-bold">סנכרון מפריוריטי (Brain)</h2>
        <span className="text-[13px] text-muted-foreground">לקוחות וחשבוניות הם מראה אחד לאחד של Priority. רץ אוטומטית ב-06:30 וב-18:30</span>
      </div>

      <div className="flex flex-wrap items-center gap-[21px]">
        <div className="flex items-center gap-2">
          <Switch id="sync-dry" checked={dryRun} onCheckedChange={setDryRun} disabled={running} />
          <Label htmlFor="sync-dry">בדיקה בלבד, בלי כתיבה</Label>
        </div>
        {TABLES.map((t) => (
          <div key={t.value} className="flex items-center gap-2">
            <Checkbox id={`sync-${t.value}`} checked={tables.includes(t.value)} onCheckedChange={(v) => toggleTable(t.value, !!v)} disabled={running} />
            <Label htmlFor={`sync-${t.value}`}>{t.label}</Label>
          </div>
        ))}
        <Button className="ms-auto" onClick={syncNow} disabled={running || tables.length === 0}>
          {running ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
          {running ? (part > 1 ? `ממשיך קריאה… חלק ${part}` : 'מסנכרן… זה יכול לקחת כמה דקות') : 'סנכרן עכשיו'}
        </Button>
      </div>

      {runError && (
        <Alert variant="destructive">
          <AlertTitle>הסנכרון נכשל</AlertTitle>
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      )}

      {last.isError ? (
        <LoadError what="הריצה האחרונה" />
      ) : last.isLoading ? (
        <LoadingRows rows={2} />
      ) : !run ? (
        <p className="text-[13px] text-muted-foreground">עוד לא רץ סנכרון.</p>
      ) : (
        <div className="flex flex-col gap-[13px]">
          <dl className="flex flex-wrap items-center gap-x-[21px] gap-y-1 text-[13px]">
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">ריצה אחרונה</dt>
              <dd>
                <StatusBadge value={run.status} />
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">התחלה</dt>
              <dd className="tabular-nums">{formatDateTime(run.startedAt)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">סיום</dt>
              <dd className="tabular-nums">{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">הפעלה</dt>
              <dd>{run.trigger ?? '—'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">מצב</dt>
              <dd>{run.dryRun ? 'בדיקה בלבד' : 'כתיבה'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">נתוני Brain נכונים ל־</dt>
              <dd className="tabular-nums">{formatDateTime(run.brainDataAsOf)}</dd>
            </div>
            {run.resumeFrom && (
              <div>
                <StatusBadge value="הקריאה תמשיך" tone="info" />
              </div>
            )}
          </dl>
          {run.error && <p className="text-xs whitespace-pre-wrap text-critical-ink">{run.error}</p>}
          {(run.perTable ?? []).length > 0 && (
            <div className="overflow-x-auto rounded-[16px] bg-glass-card">
              <Table className="min-w-[860px] text-[13px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(HEAD, 'ps-[13px]')}>טבלה</TableHead>
                    <TableHead className={HEAD}>נקראו / צפוי</TableHead>
                    <TableHead className={HEAD}>נוספו</TableHead>
                    <TableHead className={HEAD}>עודכנו</TableHead>
                    <TableHead className={HEAD}>ללא שינוי</TableHead>
                    <TableHead className={HEAD}>דולגו (חדש באפליקציה)</TableHead>
                    <TableHead className={HEAD}>סומנו כנמחקו במקור</TableHead>
                    <TableHead className={HEAD}>כתיבה אומתה</TableHead>
                    <TableHead className={HEAD}>שער</TableHead>
                    <TableHead className={cn(HEAD, 'pe-[13px]')}>שגיאה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(run.perTable ?? []).map((t, i) => (
                    <TableRow key={t.table ?? i} className="hover:bg-glass-faint">
                      <TableCell className="ps-[13px]">
                        <div className="font-semibold">{tableLabel(t.table)}</div>
                        {t.sourceTable && <div className="text-xs text-muted-foreground" dir="ltr">{t.sourceTable}</div>}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {t.expectedRows == null ? (
                          formatNumber(t.sourceRows)
                        ) : (
                          <span className={cn(t.sourceRows !== t.expectedRows && 'rounded-md bg-warning-soft px-1.5 py-0.5 font-semibold text-warning-ink')}>
                            {formatNumber(t.sourceRows)} / {formatNumber(t.expectedRows)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.inserted)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.updated)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.unchanged)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.skippedNewerInApp)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.markedDeletedInSource)}</TableCell>
                      <TableCell>{t.writeVerified === undefined || t.writeVerified === null ? '—' : t.writeVerified ? 'כן' : 'לא'}</TableCell>
                      <TableCell>{t.gate === 'incomplete read' ? <span className="font-semibold text-critical-ink">קריאה חלקית (נחסם)</span> : t.gate || '—'}</TableCell>
                      <TableCell className="pe-[13px] max-w-56 text-xs whitespace-pre-wrap text-critical-ink">{t.error || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}