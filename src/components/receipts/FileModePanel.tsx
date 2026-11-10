import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useExecuteAction, useFileUpload } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { FileCheck2Icon, FileUpIcon, RotateCwIcon, ScanTextIcon, UploadIcon, XCircleIcon } from 'lucide-react';
import { ReadBankFileAction } from '@/product-types';
import { ExtractedLinesCheck } from '@/components/receipts/ExtractedLinesCheck';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { BANK_FILE_ACCEPT, bankFileKind, bankFileType, isAcceptedBankFile, sheetTextFromBuffer, sheetTextFromUrl } from '@/utils/BankFile';
import { formatDateTime, formatNumber, formatTime } from '@/utils/Format';
import type { Batch } from '@/utils/ReceiptsDay';

const READING = ['ממתין לקריאה', 'בקריאה'];
/** A read still "in progress" after this long is treated as stuck: it can be sent again. */
const STUCK_MS = 5 * 60_000;

interface ReadOutput {
  importBatchId?: string;
  isDuplicate?: boolean;
  errors?: string[];
}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'הקריאה נכשלה';
}

function Badge({ icon: Icon, busy }: { icon: typeof ScanTextIcon; busy?: boolean }) {
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-glass-inner">
      <Icon className="size-5 text-ink-2" />
      {busy && <Spinner className="absolute -end-1 -bottom-1 size-4 rounded-full bg-background text-muted-foreground" />}
    </span>
  );
}

/**
 * bankLinesSource "קובץ": today's bank file. Upload (PDF, Excel, CSV or an image; ReadBankFile → BankFileReader →
 * WriteExtractedLines), the reader at work, then the extracted lines to check and confirm (ExtractedLinesCheck);
 * a confirmed file shows as one line with "העלאת קובץ אחר". `primary` = the upload / confirm is the screen's one
 * primary button (until identified lines exist).
 */
export function FileModePanel({
  batches,
  loading,
  loadError,
  primary,
  now,
  onConfirmed,
}: {
  batches: Batch[];
  /** The page clock (ms), for a read that got stuck. */
  now: number;
  loading: boolean;
  loadError: boolean;
  primary: boolean;
  onConfirmed: (note: string | null) => void;
}) {
  const scope = useOwnerScope();
  const input = useRef<HTMLInputElement>(null);
  const { executeFunction: readFile } = useExecuteAction(ReadBankFileAction);
  const { uploadFunction, uploadPercentage } = useFileUpload();
  const [preparing, setPreparing] = useState<null | 'upload'>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadOther, setUploadOther] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busy = !!preparing || !!reading;

  const latest = batches[0];
  const status = latest?.extractionStatus ?? '';
  const stuck = !!latest && READING.includes(status) && !reading && now - new Date(latest.uploadedAt ?? 0).getTime() > STUCK_MS;

  async function read(args: { fileUrl: string; fileName: string; fileSize?: number; fileType?: string; fileText?: string; importBatchId?: string }) {
    setReading(args.fileName);
    setUploadOther(false);
    try {
      const out = (await readFile({ ...args, fileText: args.fileText ?? '', uploadedBy: scope.actorName })) as ReadOutput | null;
      if (out?.isDuplicate) toast.add({ title: 'הקובץ הזה כבר הועלה היום', description: 'מוצג הקובץ שכבר נקרא.', type: 'info' });
      else if (out?.errors?.length) setError(out.errors.join(' · '));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setReading(null);
    }
  }

  async function prepare(kind: 'upload', work: () => Promise<void>) {
    if (busy) return;
    setPreparing(kind);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPreparing(null);
    }
  }

  function take(file?: File | null) {
    if (!file || busy) return;
    if (!isAcceptedBankFile(file)) {
      setError('אפשר להעלות PDF, Excel, CSV או תמונה של דף החשבון.');
      return;
    }
    void prepare('upload', async () => {
      const fileType = bankFileType(file);
      const fileText = bankFileKind(file.name, fileType) === 'sheet' ? sheetTextFromBuffer(await file.arrayBuffer(), file.name, fileType) : '';
      const fileUrl = await uploadFunction(file);
      void read({ fileUrl, fileName: file.name, fileSize: file.size, fileType, fileText });
    });
  }

  function retry(batch: Batch) {
    const fileUrl = batch.fileUrl;
    if (!fileUrl) {
      setError('לקובץ הזה אין קישור שמור. העלו אותו שוב.');
      return;
    }
    const fileName = batch.fileName || 'bank-file';
    const fileType = batch.fileType || undefined;
    void prepare('upload', async () => {
      const fileText = bankFileKind(fileName, fileType) === 'sheet' ? await sheetTextFromUrl(fileUrl, fileName, fileType) : '';
      void read({ fileUrl, fileName, fileSize: batch.fileSize || undefined, fileType, fileText, importBatchId: batch.id });
    });
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    take(e.target.files?.[0]);
    e.target.value = '';
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files?.[0]);
  }

  const errorAlert = error && (
    <Alert variant="destructive">
      <XCircleIcon />
      <AlertTitle>הקובץ לא נקרא</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        {error}
        <Button variant="outline" size="sm" onClick={() => setError(null)}>
          הבנתי
        </Button>
      </AlertDescription>
    </Alert>
  );

  if (loading) return <Skeleton className="h-28 w-full rounded-[26px]" />;

  if (reading || (latest && READING.includes(status) && !stuck)) {
    return (
      <section aria-label="קריאת הקובץ" aria-live="polite" className="glass flex items-center gap-[13px] rounded-[26px] border p-[21px]">
        <Badge icon={ScanTextIcon} busy />
        <div className="flex min-w-0 flex-col">
          <span className="text-lg font-bold">קורא את קובץ הבנק…</span>
          <span className="text-[13px] text-muted-foreground">
            <span dir="ltr">{reading ?? latest?.fileName}</span> · סוכן הקריאה מוציא את ההעברות לטבלה. זה לוקח בדרך כלל דקה–שתיים.
          </span>
        </div>
      </section>
    );
  }

  const failed = latest && (status === 'נכשל' || stuck);
  if (latest && !uploadOther && (failed || status === 'נקרא – לאימות' || status === 'אומת')) {
    if (status === 'נקרא – לאימות') return <ExtractedLinesCheck batch={latest} primary={primary} onConfirmed={onConfirmed} />;
    return (
      <section aria-label="קובץ הבנק של היום" className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px]">
        <div className="flex flex-wrap items-center gap-[13px]">
          <Badge icon={failed ? ScanTextIcon : FileCheck2Icon} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-bold">
              {failed ? (stuck ? 'קריאת הקובץ נתקעה' : 'קריאת הקובץ נכשלה') : `קובץ הבנק אומת ב-${formatTime(latest.verifiedAt)}`}
            </span>
            <span className="text-[13px] text-muted-foreground">
              <span dir="ltr">{latest.fileName}</span>
              {failed
                ? ` · ${latest.errors || 'סוכן הקריאה לא החזיר שורות.'}`
                : ` · ${formatNumber(latest.extractedLineCount ?? 0)} שורות · אומת ע״י ${latest.verifiedBy || '—'} · הועלה ${formatDateTime(latest.uploadedAt)}`}
            </span>
          </div>
          {failed && (
            <Button className={cn('h-10 rounded-full px-[18px] font-semibold', primary && 'shadow-primary')} variant={primary ? 'default' : 'outline'} disabled={busy} onClick={() => retry(latest)}>
              {preparing ? <Spinner data-icon="inline-start" /> : <RotateCwIcon data-icon="inline-start" />}
              קרא שוב
            </Button>
          )}
          <Button variant="ghost" className="h-10 rounded-full bg-glass-soft px-[18px]" disabled={busy} onClick={() => setUploadOther(true)}>
            <UploadIcon data-icon="inline-start" />
            העלאת קובץ אחר
          </Button>
        </div>
        {errorAlert}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-[13px]">
      <section
        aria-label="העלאת קובץ הבנק"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'glass flex flex-wrap items-center gap-[13px] rounded-[26px] border-2 border-dashed border-glass-edge p-[21px] transition-colors',
          dragging && 'border-primary/50 bg-glass-strong',
        )}
      >
        <Badge icon={FileUpIcon} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-bold">{loadError ? 'לא הצלחנו לבדוק אם הועלה קובץ היום' : 'העלאת קובץ דף הבנק של היום'}</span>
          <span className="text-[13px] text-muted-foreground">PDF, Excel, CSV או תמונה, בלחיצה או בגרירה. סוכן הקריאה מוציא את ההעברות, ואתם מאשרים את השורות לפני הזיהוי.</span>
          {preparing === 'upload' && uploadPercentage > 0 && uploadPercentage < 100 && <Progress value={uploadPercentage} className="mt-1 w-64 max-w-full" aria-label="התקדמות ההעלאה" />}
        </div>
        {uploadOther && (
          <Button variant="ghost" className="h-10 rounded-full" disabled={busy} onClick={() => setUploadOther(false)}>
            חזרה לקובץ שהועלה
          </Button>
        )}
        <Button
          variant={primary ? 'default' : 'outline'}
          className={cn('h-10 rounded-full px-[18px] font-semibold', primary && 'shadow-primary')}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {preparing === 'upload' ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
          {preparing === 'upload' ? 'מעלה…' : 'בחירת קובץ'}
        </Button>
        <input ref={input} type="file" accept={BANK_FILE_ACCEPT} onChange={onPick} className="sr-only" aria-label="קובץ הבנק" tabIndex={-1} />
      </section>
      {errorAlert}
    </div>
  );
}