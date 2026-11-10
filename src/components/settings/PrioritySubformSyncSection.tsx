import { useState } from 'react';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { RefreshCwIcon } from 'lucide-react';
import { PrioritySyncCursorsEntity, SyncPrioritySubformsAction, SyncRunsEntity } from '@/product-types';
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

type Scope = 'contacts' | 'payments';
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'contacts', label: 'אנשי קשר' },
  { value: 'payments', label: 'שורות תקבול' },
];
const MAX_CONTINUATIONS = 5;
const HEAD = 'text-xs font-semibold text-muted-foreground';
const scopeLabel = (t?: string) => SCOPES.find((x) => x.value === t)?.label ?? t ?? '—';

/** Settings → imports: run SyncPrioritySubforms by hand (dry-run by default) and show its latest run and cursors. */
export function PrioritySubformSyncSection() {
  const [dryRun, setDryRun] = useState(true);
  const [resume, setResume] = useState(true);
  const [scopes, setScopes] = useState<Scope[]>(['contacts', 'payments']);
  const [runError, setRunError] = useState<string | null>(null);
  const [part, setPart] = useState(0);
  const { executeFunction, isLoading: running } = useExecuteAction(SyncPrioritySubformsAction);
  const last = useEntityGetAll(SyncRunsEntity, {
    where: { column: 'syncKind', value: 'priority-direct' },
    orderBy: [{ column: 'startedAt', direction: 'desc' }],
    page: { size: 1 },
  });
  const cursors = useEntityGetAll(PrioritySyncCursorsEntity);
  const run = last.data?.[0];

  function toggleScope(s: Scope, on: boolean) {
    setScopes((prev) => (on ? [...new Set([...prev, s])] : prev.filter((x) => x !== s)));
  }

  async function syncNow() {
    setRunError(null);
    try {
      let result = await executeFunction({ dryRun, scopes, resume, trigger: 'ידני' });
      if (!dryRun) {
        for (let n = 1; n <= MAX_CONTINUATIONS && result?.needsResume; n++) {
          setPart(n + 1);
          result = await executeFunction({ dryRun, scopes, resume: true, trigger: 'ידני' });
        }
        if (result?.needsResume) setRunError(`הקריאה לא הסתיימה אחרי ${MAX_CONTINUATIONS} המשכים. אפשר להריץ שוב והיא תמשיך מהמקום שנעצר.`);
      }
      if (result?.errors?.length) setRunError(result.errors.join('\n'));
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'הסנכרון נכשל');
    } finally {
      setPart(0);
      last.refetch();
      cursors.refetch();
    }
  }

  return (
    <section aria-label="סנכרון ישיר מפריוריטי" className="glass glass-lift flex flex-col gap-[21px] rounded-[26px] border p-[21px]">
      <div className="flex flex-col">
        <h2 className="text-base font-bold">סנכרון ישיר מפריוריטי (אנשי קשר ותקבולים)</h2>
        <span className="text-[13px] text-muted-foreground">רץ אוטומטית כל יום ב-07:00. קריאה בלבד — לא נכתב דבר לפריוריטי.</span>
      </div>

      <div className="flex flex-wrap items-center gap-[21px]">
        <div className="flex items-center gap-2">
          <Switch id="psync-dry" checked={dryRun} onCheckedChange={setDryRun} disabled={running} />
          <Label htmlFor="psync-dry">בדיקה בלבד, בלי כתיבה</Label>
        </div>
        {SCOPES.map((s) => (
          <div key={s.value} className="flex items-center gap-2">
            <Checkbox id={`psync-${s.value}`} checked={scopes.includes(s.value)} onCheckedChange={(v) => toggleScope(s.value, !!v)} disabled={running} />
            <Label htmlFor={`psync-${s.value}`}>{s.label}</Label>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Checkbox id="psync-resume" checked={resume} onCheckedChange={(v) => setResume(!!v)} disabled={running} />
          <Label htmlFor="psync-resume">המשך מהמקום שנעצר</Label>
        </div>
        <Button className="ms-auto" onClick={syncNow} disabled={running || scopes.length === 0}>
          {running ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
          {running ? (part > 1 ? `ממשיך קריאה… חלק ${part}` : 'מסנכרן… זה יכול לקחת כמה דקות') : 'סנכרן עכשיו'}
        </Button>
      </div>

      {runError && (
        <Alert variant="destructive">
          <AlertTitle>הסנכרון לא הושלם</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{runError}</AlertDescription>
        </Alert>
      )}

      {cursors.isError ? (
        <LoadError what="מצב הקריאה" />
      ) : (cursors.data ?? []).length > 0 ? (
        <ul className="flex flex-wrap gap-[13px]">
          {SCOPES.map((s) => {
            const c = (cursors.data ?? []).find((x) => x.scope === s.value);
            if (!c) return null;
            return (
              <li key={s.value} className="flex flex-col gap-0.5 rounded-[16px] bg-glass-inner px-[13px] py-2 text-[13px]">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {s.label}
                  {c.mode && <StatusBadge value={c.mode} tone="neutral" className="h-5 text-[11px]" />}
                  {c.phase && <StatusBadge value={c.phase} tone={c.phase === 'הושלם' ? 'neutral' : 'info'} className="h-5 text-[11px]" />}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(c.pendingCount ?? 0) > 0 ? `נותרו ${formatNumber(c.pendingCount)} לקריאה · ` : ''}
                  קריאה מלאה אחרונה {c.lastFullReadAt ? formatDateTime(c.lastFullReadAt) : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {last.isError ? (
        <LoadError what="הריצה האחרונה" />
      ) : last.isLoading ? (
        <LoadingRows rows={2} />
      ) : !run ? (
        <p className="text-[13px] text-muted-foreground">עוד לא רץ סנכרון ישיר.</p>
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
          </dl>
          {run.error && <p className="text-xs whitespace-pre-wrap text-critical-ink">{run.error}</p>}
          {(run.perTable ?? []).length > 0 && (
            <div className="overflow-x-auto rounded-[16px] bg-glass-card">
              <Table className="min-w-[720px] text-[13px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(HEAD, 'ps-[13px]')}>טבלה</TableHead>
                    <TableHead className={HEAD}>נקראו</TableHead>
                    <TableHead className={HEAD}>נוספו</TableHead>
                    <TableHead className={HEAD}>עודכנו</TableHead>
                    <TableHead className={HEAD}>ללא שינוי</TableHead>
                    <TableHead className={HEAD}>סומנו כנמחקו</TableHead>
                    <TableHead className={HEAD}>שער</TableHead>
                    <TableHead className={cn(HEAD, 'pe-[13px]')}>שגיאה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(run.perTable ?? []).map((t, i) => (
                    <TableRow key={t.table ?? i} className="hover:bg-glass-faint">
                      <TableCell className="ps-[13px]">
                        <div className="font-semibold">{scopeLabel(t.table)}</div>
                        {t.sourceTable && <div className="text-xs text-muted-foreground" dir="ltr">{t.sourceTable}</div>}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.sourceRows)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.inserted)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.updated)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.unchanged)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(t.markedDeletedInSource)}</TableCell>
                      <TableCell>{t.gate === 'incomplete read' ? <span className="font-semibold text-critical-ink">קריאה חלקית</span> : t.gate === 'passed' ? 'עבר' : t.gate || '—'}</TableCell>
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