import { useState } from 'react';
import { useEntityGetAll, useExecuteAction, useUser } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AlertTriangleIcon, PencilIcon, PlayIcon, XCircleIcon } from 'lucide-react';
import { BankLinesEntity, ConfirmExtractedLinesAction, RecordAgentFeedbackAction } from '@/product-types';
import type { BankLinesEntityLineTypeEnum } from '@/product-types';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { formatDate, formatDayMonth, formatILS, formatNumber } from '@/utils/Format';
import { identifyCountsLine } from '@/utils/ReceiptsIdentify';
import type { IdentifyCounts } from '@/utils/ReceiptsIdentify';
import type { BankLine, Batch } from '@/utils/ReceiptsDay';

type FieldKey = 'valueDate' | 'amount' | 'payerName' | 'reference' | 'lineType';

const HEAD = 'h-8 text-xs font-semibold text-muted-foreground';
const READER = 'BankFileReader';
const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'valueDate', label: 'תאריך ערך' },
  { key: 'amount', label: 'סכום' },
  { key: 'payerName', label: 'מעביר' },
  { key: 'reference', label: 'אסמכתא' },
  { key: 'lineType', label: 'סוג' },
];
const LINE_TYPES: BankLinesEntityLineTypeEnum[] = ['העברה', 'זיכוי בנק', 'פירעון צ׳ק', 'צ׳ק חוזר', 'אחר'];
const PILL = 'h-8 rounded-[16px] px-3 text-[13px] font-semibold aria-pressed:bg-glass-strong aria-pressed:text-link aria-pressed:shadow-glass-pill';

interface ConfirmResult {
  ok?: boolean;
  identify?: { counts?: IdentifyCounts; errors?: string[] };
  errors?: string[];
}

function shown(line: BankLine, key: FieldKey): string {
  const v = line[key];
  if (v === undefined || v === null || v === '') return '';
  if (key === 'valueDate') return formatDate(String(v));
  if (key === 'amount') return formatILS(Number(v));
  return String(v);
}

const flagsOf = (l: BankLine) =>
  (l.extractionFlags ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

/** A line the reader got wrong: which field, the right value; the line is corrected and the file's totals recomputed. */
function CorrectionDialog({ batch, line, onClose }: { batch: Batch; line: BankLine; onClose: () => void }) {
  const scope = useOwnerScope();
  const user = useUser();
  const { executeFunction, isLoading } = useExecuteAction(RecordAgentFeedbackAction);
  const [field, setField] = useState<FieldKey>('payerName');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const given = line[field] === undefined || line[field] === null ? '' : String(line[field]);
  const trimmed = value.trim();
  const invalid = !trimmed || trimmed === given || (field === 'amount' && !Number.isFinite(Number(trimmed)));

  async function submit() {
    if (invalid) return;
    setErrors([]);
    try {
      const res = (await executeFunction({
        agentName: READER,
        importBatchId: batch.id,
        bankLineId: line.bankLineId,
        verdict: 'טעה',
        field,
        valueGiven: given,
        valueCorrect: field === 'amount' ? String(Number(trimmed)) : trimmed,
        applyCorrection: true,
        byName: scope.actorName,
        ...(user.email ? { byEmail: user.email } : {}),
      })) as { errors?: string[] } | null;
      if (res?.errors?.length) {
        setErrors(res.errors);
        return;
      }
      toast.add({ title: 'התיקון נשמר', description: 'השורה תוקנה והסיכום של הקובץ חושב מחדש.', type: 'success' });
      onClose();
    } catch {
      setErrors(['התיקון לא נשמר. נסו שוב בעוד רגע.']);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>תיקון שורה {line.lineNo ?? '—'}</DialogTitle>
          <DialogDescription>
            {line.payerName || 'מעביר לא ידוע'} · {formatILS(line.amount)}. בחרו את השדה שנקרא לא נכון ורשמו את הערך הנכון מדף הבנק.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>השדה</FieldLabel>
            <ToggleGroup
              aria-label="השדה שנקרא לא נכון"
              value={[field]}
              onValueChange={(v) => {
                const next = FIELDS.find((f) => f.key === v[0])?.key;
                if (next) {
                  setField(next);
                  setValue('');
                }
              }}
              className="flex-wrap gap-0.5 rounded-[20px] bg-glass-card p-1"
            >
              {FIELDS.map((f) => (
                <ToggleGroupItem key={f.key} value={f.key} className={PILL}>
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              נקרא: <span className="font-semibold text-ink-2">{shown(line, field) || 'ריק'}</span>
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="line-correct">הערך הנכון</FieldLabel>
            {field === 'lineType' ? (
              <ToggleGroup aria-label="הסוג הנכון" value={value ? [value] : []} onValueChange={(v) => setValue(v[0] ?? '')} className="flex-wrap gap-0.5 rounded-[20px] bg-glass-card p-1">
                {LINE_TYPES.map((t) => (
                  <ToggleGroupItem key={t} value={t} className={PILL}>
                    {t}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <Input
                id="line-correct"
                type={field === 'valueDate' ? 'date' : field === 'amount' ? 'number' : 'text'}
                inputMode={field === 'amount' ? 'decimal' : undefined}
                step={field === 'amount' ? '0.01' : undefined}
                dir={field === 'payerName' ? undefined : 'ltr'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="bg-glass-card"
              />
            )}
          </Field>
        </FieldGroup>
        {errors.length > 0 && (
          <Alert variant="destructive">
            <XCircleIcon />
            <AlertTitle>התיקון לא נשמר</AlertTitle>
            <AlertDescription>{errors.join(' · ')}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={submit} disabled={invalid || isLoading}>
            {isLoading && <Spinner data-icon="inline-start" />}
            שמירת התיקון
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * File mode, after the reader: the file's totals against its own summary row, the extracted lines with a
 * correction per line, "בדקתי מול הבנק" when the totals don't match, and "אישור השורות וזיהוי לקוחות"
 * (ConfirmExtractedLines, which then identifies the file's customers).
 */
export function ExtractedLinesCheck({ batch, primary, onConfirmed }: { batch: Batch; primary: boolean; onConfirmed: (note: string | null) => void }) {
  const scope = useOwnerScope();
  const linesQ = useEntityGetAll(BankLinesEntity, { where: { column: 'importBatchId', value: batch.id }, orderBy: [{ column: 'lineNo', direction: 'asc' }] });
  const { executeFunction: confirm, isLoading: confirming } = useExecuteAction(ConfirmExtractedLinesAction);
  const [fixing, setFixing] = useState<BankLine | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const lines = linesQ.data ?? [];
  const mismatch = batch.totalsCheck === 'לא תואם';
  const read = `נקראו ${formatNumber(batch.extractedLineCount ?? lines.length)} שורות, סה״כ ${formatILS(batch.extractedTotal ?? lines.reduce((s, l) => s + (l.amount ?? 0), 0))}`;

  async function submit() {
    setErrors([]);
    try {
      const res = (await confirm({ importBatchId: batch.id, verifiedBy: scope.actorName, ...(mismatch ? { totalsAcknowledged: acknowledged } : {}) })) as ConfirmResult | null;
      if (!res?.ok || res.errors?.length) {
        setErrors(res?.errors?.length ? res.errors : ['השורות לא אושרו.']);
        return;
      }
      const note = identifyCountsLine(res.identify?.counts);
      toast.add({ title: 'השורות אושרו', description: note ?? 'הזיהוי רץ על שורות הקובץ.', type: 'success' });
      if (res.identify?.errors?.length) setErrors(res.identify.errors);
      onConfirmed(note);
    } catch {
      setErrors(['השורות לא אושרו. נסו שוב בעוד רגע.']);
    }
  }

  return (
    <section aria-label="אישור שורות הקובץ" className="glass flex min-w-0 flex-col gap-[13px] overflow-hidden rounded-[26px] border">
      <div className="flex flex-col gap-1 px-[21px] pt-[21px]">
        <span className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted-foreground">
          קובץ דף הבנק
          <span dir="ltr" className="truncate">
            {batch.fileName ?? ''}
          </span>
        </span>
        <p className="text-lg leading-snug font-bold">
          {read}.{batch.totalsCheck === 'תואם' ? ' תואם לסיכום בקובץ.' : ''}
        </p>
        <span className="text-[13px] text-muted-foreground">בדקו כל שורה מול דף הבנק ותקנו מה שנקרא לא נכון. אחרי האישור הזיהוי רץ על השורות.</span>
      </div>

      {mismatch && (
        <div className="px-[21px]">
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>
              לא תואם: בקובץ {formatNumber(batch.linesInFile)} שורות, סה״כ {formatILS(batch.totalInFile)}
            </AlertTitle>
            <AlertDescription>בדקו את השורות מול הבנק. כדי לאשר צריך לסמן ״בדקתי מול הבנק״.</AlertDescription>
          </Alert>
        </div>
      )}
      {batch.totalsCheck === 'אין סיכום בקובץ' && (
        <div className="px-[21px]">
          <Alert>
            <AlertTriangleIcon />
            <AlertTitle>אין סיכום בקובץ – בדקו מול הבנק</AlertTitle>
            <AlertDescription>בקובץ אין שורת סיכום להשוות אליה, ולכן המספר והסכום לא נבדקו אוטומטית.</AlertDescription>
          </Alert>
        </div>
      )}

      {linesQ.isError ? (
        <div className="px-[21px]">
          <LoadError what="שורות הקובץ" />
        </div>
      ) : linesQ.isLoading ? (
        <LoadingRows rows={4} />
      ) : lines.length === 0 ? (
        <p className="px-[21px] text-[13px] text-muted-foreground">סוכן הקריאה לא מצא תנועות זכות בקובץ.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[760px] text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'w-10 ps-[21px]')}>#</TableHead>
                <TableHead className={HEAD}>ערך</TableHead>
                <TableHead className={HEAD}>סכום</TableHead>
                <TableHead className={HEAD}>מעביר</TableHead>
                <TableHead className={HEAD}>אסמכתא</TableHead>
                <TableHead className={HEAD}>סוג</TableHead>
                <TableHead className={HEAD}>דגלים</TableHead>
                <TableHead className={cn(HEAD, 'pe-[21px]')}>
                  <span className="sr-only">תיקון</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const chips = [...flagsOf(l), ...(l.correctedBy ? [`תוקן · ${l.correctedBy}`] : [])];
                return (
                  <TableRow key={l.id} className="hover:bg-glass-faint">
                    <TableCell className="ps-[21px] py-1.5 text-xs text-muted-foreground tabular-nums">{l.lineNo ?? '—'}</TableCell>
                    <TableCell className="py-1.5 text-xs tabular-nums" title={formatDate(l.valueDate)}>
                      {formatDayMonth(l.valueDate)}
                    </TableCell>
                    <TableCell className={cn('py-1.5 font-bold whitespace-nowrap tabular-nums', (l.amount ?? 0) < 0 && 'text-critical-ink')}>{formatILS(l.amount)}</TableCell>
                    <TableCell className="max-w-56 truncate py-1.5 font-semibold" title={l.payerName ?? undefined}>
                      {l.payerName || '—'}
                    </TableCell>
                    <TableCell dir="ltr" className="max-w-32 truncate py-1.5 text-start text-xs text-muted-foreground" title={l.reference ?? undefined}>
                      {l.reference || '—'}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs whitespace-nowrap">{l.lineType ?? '—'}</TableCell>
                    <TableCell className="py-1.5">
                      {chips.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-0.5">
                          {chips.map((f) => (
                            <StatusBadge key={f} value={f} tone={f.startsWith('תוקן') ? 'info' : 'warning'} className="h-5 px-1.5 text-[11px]" />
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pe-[21px] py-1">
                      <Button variant="ghost" size="xs" className="rounded-full bg-glass-soft" aria-label={`תיקון שורה ${l.lineNo ?? ''}`} onClick={() => setFixing(l)}>
                        <PencilIcon data-icon="inline-start" />
                        תיקון
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-[13px] px-[21px] pb-[21px]">
        {mismatch && (
          <Field orientation="horizontal">
            <Checkbox id="totals-ack" checked={acknowledged} onCheckedChange={(v) => setAcknowledged(!!v)} />
            <FieldLabel htmlFor="totals-ack">בדקתי מול הבנק – המספר או הסכום לא תואמים לסיכום שבקובץ, והשורות נכונות</FieldLabel>
          </Field>
        )}
        {errors.length > 0 && (
          <Alert variant="destructive">
            <XCircleIcon />
            <AlertTitle>לא הכול הסתדר</AlertTitle>
            <AlertDescription>{errors.join(' · ')}</AlertDescription>
          </Alert>
        )}
        <Button
          variant={primary ? 'default' : 'outline'}
          className={cn('h-10 self-start rounded-full px-[18px] font-semibold', primary && 'shadow-primary')}
          onClick={() => void submit()}
          disabled={confirming || linesQ.isLoading || lines.length === 0 || (mismatch && !acknowledged)}
        >
          {confirming ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
          אישור השורות וזיהוי לקוחות
        </Button>
      </div>

      {fixing && <CorrectionDialog key={fixing.id} batch={batch} line={fixing} onClose={() => setFixing(null)} />}
    </section>
  );
}