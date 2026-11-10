import { Link, useSearchParams } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, InfoIcon, ReceiptTextIcon } from 'lucide-react';
import { ImportBatchesEntity } from '@/product-types';
import type { ImportBatchesEntityKindEnum } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { AgentEmpty, LoadError, LoadingRows, PageHeader } from '@/components/PageStates';
import { SettingsTabs } from '@/components/SettingsTabs';
import { BrainSyncSection } from '@/components/settings/BrainSyncSection';
import { PrioritySubformSyncSection } from '@/components/settings/PrioritySubformSyncSection';
import { StatusBadge } from '@/components/StatusBadge';
import { useNinaActivity } from '@/hooks/useNinaActivity';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatDayLabel, formatNumber } from '@/utils/Format';

const BANK: ImportBatchesEntityKindEnum = 'קובץ בנק';
const KINDS: ImportBatchesEntityKindEnum[] = [BANK, 'חשבוניות פתוחות', 'דוח גיול', 'כרטיסי לקוח', 'אנשי קשר'];
const HEAD = 'text-xs font-semibold text-muted-foreground';
const INACTIVE_HINT = 'הסוג יופעל כשיגיע קובץ לדוגמה';

function isKind(v: string | null): v is ImportBatchesEntityKindEnum {
  return !!v && (KINDS as string[]).includes(v);
}

export default function ImportsPage() {
  const nina = useNinaActivity();
  const [params, setParams] = useSearchParams();
  const kindParam = params.get('kind');
  const kind: ImportBatchesEntityKindEnum = isKind(kindParam) ? kindParam : BANK;

  const history = useEntityGetAll(ImportBatchesEntity, {
    orderBy: [{ column: 'uploadedAt', direction: 'desc' }],
    page: { size: 50 },
  });
  const rows = history.data ?? [];

  function setKind(next: ImportBatchesEntityKindEnum) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('kind', next);
        return p;
      },
      { replace: true },
    );
  }

  const kindItems = KINDS.map((k) => ({ label: k === BANK ? `${k} · נמשך מפריוריטי` : `${k} · לא פעיל`, value: k }));

  const headline = nina.isLoading ? (
    <Skeleton className="h-7 w-80 max-w-full" />
  ) : nina.bankReady ? (
    `שורות הבנק של ${formatDayLabel(nina.lastBankDay)} כבר נמשכו`
  ) : (
    nina.waitingFor
  );

  return (
    <>
      <PageHeader title="ייבוא קבצים" description="קובצי Priority שהדוחות והבדיקות נבנים מהם עד שיהיה חיבור ישיר. שורות הבנק נמשכות מפריוריטי במסך התקבולים." actions={<SettingsTabs />} />

      <AgentPanel
        headline={headline}
        description={`${nina.summary} שורות הבנק נמשכות מפריוריטי ונבדקות במסך התקבולים, רשומה אחר רשומה. שום דבר לא נכתב ל-Priority.`}
      />

      <BrainSyncSection />
      <PrioritySubformSyncSection />

      <section aria-label="העלאת קובץ" className="glass glass-lift flex flex-col gap-[21px] rounded-[26px] border p-[21px]">
        <h2 className="text-base font-bold">העלאת קובץ</h2>
        <FieldGroup className="grid gap-[21px] md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="import-kind">סוג הקובץ</FieldLabel>
            <Select
              items={kindItems}
              value={kind}
              onValueChange={(v) => {
                if (isKind(v as string | null)) setKind(v as ImportBatchesEntityKindEnum);
              }}
            >
              <SelectTrigger id="import-kind" className="w-full bg-glass-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {kindItems.map((k) => (
                    <SelectItem key={k.value} value={k.value} disabled={k.value !== BANK}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>קובץ בנק כבר לא מועלה: השורות נמשכות מפריוריטי במסך התקבולים. שאר הסוגים: {INACTIVE_HINT}.</FieldDescription>
          </Field>
        </FieldGroup>

        {kind === BANK ? (
          <Alert>
            <ReceiptTextIcon />
            <AlertTitle>שורות הבנק נמשכות מפריוריטי במסך התקבולים</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              שם לוחצים ״משוך עכשיו מפריוריטי״ ושורות דפי הבנק של היום נמשכות; נינה בודקת את ההעברות וזיכויי הבנק רשומה אחר רשומה.
              <Link to="/collections/receipts" className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
                למסך התקבולים
                <ArrowUpLeftIcon className="size-3.5" />
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <InfoIcon />
            <AlertTitle>{kind}: {INACTIVE_HINT}</AlertTitle>
            <AlertDescription>שורות הבנק נמשכות מפריוריטי במסך התקבולים; שאר הסוגים עוד לא פעילים.</AlertDescription>
          </Alert>
        )}
      </section>

      <section aria-label="היסטוריית ייבוא" className="glass glass-lift flex flex-col overflow-hidden rounded-[26px] border">
        <div className="flex flex-col p-[21px]">
          <h2 className="text-base font-bold">
            היסטוריית ייבוא <span className="font-medium text-muted-foreground">({rows.length})</span>
          </h2>
          <span className="text-[13px] text-muted-foreground">כל קובץ שנקלט, מתי ובידי מי</span>
        </div>
        {history.isError ? (
          <div className="px-[21px] pb-[21px]">
            <LoadError what="היסטוריית הייבוא" />
          </div>
        ) : history.isLoading ? (
          <LoadingRows rows={3} />
        ) : rows.length === 0 ? (
          <AgentEmpty title="עוד לא נקלטו קבצים">{nina.waitingFor}, ולקובץ החשבוניות הפתוחות.</AgentEmpty>
        ) : (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'ps-[21px]')}>קובץ</TableHead>
                <TableHead className={HEAD}>סוג</TableHead>
                <TableHead className={HEAD}>נתונים ל־</TableHead>
                <TableHead className={HEAD}>הועלה</TableHead>
                <TableHead className={HEAD}>שורות (נקראו / נכתבו)</TableHead>
                <TableHead className={HEAD}>שגיאות</TableHead>
                <TableHead className={cn(HEAD, 'pe-[21px]')}>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id} className="hover:bg-glass-faint">
                  <TableCell className="ps-[21px] font-semibold">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span dir="ltr">{b.fileName ?? '—'}</span>
                      {b.isTestFixture && <StatusBadge value="בדיקה" tone="neutral" />}
                    </span>
                  </TableCell>
                  <TableCell>{b.kind ?? '—'}</TableCell>
                  <TableCell>{formatDate(b.dataDate)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.uploadedBy ?? '—'}
                    <div>{formatDateTime(b.uploadedAt)}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatNumber(b.rowsRead)} / {formatNumber(b.rowsWritten)}
                  </TableCell>
                  <TableCell className="max-w-56 text-xs whitespace-pre-wrap text-critical-ink">{b.errors || '—'}</TableCell>
                  <TableCell className="pe-[21px]">
                    <StatusBadge value={b.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {history.hasNextPage && (
          <Button variant="outline" className="m-[21px] mt-0 self-center" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
            {history.isFetchingNextPage ? 'טוען…' : 'טעינת קבצים נוספים'}
          </Button>
        )}
      </section>
    </>
  );
}