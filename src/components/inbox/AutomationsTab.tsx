import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useEntityGetAll, useEntityUpdate, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, EyeIcon, InfoIcon, PlayIcon, SaveIcon } from 'lucide-react';
import { MailAutomationRunsEntity, MailAutomationsEntity, RunMailAutomationAction } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { AgentEmpty, LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { CustomerMultiPicker, CustomerPicker } from '@/components/inbox/CustomerPicker';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PdfViewer } from '@/components/ui/pdf-viewer';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDateTime, formatILS, formatNumber } from '@/utils/Format';
import { splitList } from '@/utils/Inbox';

type Automation = (typeof MailAutomationsEntity)['instanceType'] & { id: string };
type Run = (typeof MailAutomationRunsEntity)['instanceType'] & { id: string };

const HEAD = 'text-xs font-semibold text-muted-foreground';
const AUDIENCE_ALL = 'כל הלקוחות ביתרת חובה';
const AUDIENCE_SELECTED = 'לקוחות נבחרים';
const AUDIENCE_ITEMS = [
  { value: AUDIENCE_ALL, label: AUDIENCE_ALL },
  { value: AUDIENCE_SELECTED, label: 'רשימת לקוחות נבחרת' },
];
const VARIABLES: { name: string; label: string }[] = [
  { name: 'customerName', label: 'שם הלקוח' },
  { name: 'customerCode', label: 'קוד לקוח' },
  { name: 'contactName', label: 'איש הקשר' },
  { name: 'asOfDate', label: 'נכון לתאריך' },
  { name: 'month', label: 'החודש' },
  { name: 'openTotal', label: 'סך החוב הפתוח' },
  { name: 'bookkeeperName', label: 'שם האחראית' },
  { name: 'bookkeeperPhone', label: 'טלפון האחראית' },
];

interface Eligible {
  customerCode?: string;
  customerName?: string;
  contactName?: string;
  contactEmail?: string;
  openTotal?: number;
  bookkeeperName?: string;
}
interface Excluded {
  customerCode?: string;
  customerName?: string;
  reason?: string;
}
interface Preview {
  customerCode?: string;
  customerName?: string;
  to?: string;
  toName?: string;
  subject?: string;
  body?: string;
  pdfUrl?: string;
  eligible?: boolean;
  note?: string;
}
interface RunResult {
  dryRun?: boolean;
  batchId?: string;
  eligible: Eligible[];
  excluded: Excluded[];
  preview?: Preview | null;
  draftsCreated?: number;
  runId?: string;
  summary?: string;
  errors: string[];
}

function asList<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
}

/** RunMailAutomation output, read defensively. */
function readRun(raw: unknown): RunResult {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const p = o.preview && typeof o.preview === 'object' ? (o.preview as Preview) : null;
  return {
    dryRun: o.dryRun as boolean | undefined,
    batchId: typeof o.batchId === 'string' ? o.batchId : undefined,
    eligible: asList<Eligible>(o.eligible),
    excluded: asList<Excluded>(o.excluded),
    preview: p,
    draftsCreated: typeof o.draftsCreated === 'number' ? o.draftsCreated : undefined,
    runId: typeof o.runId === 'string' ? o.runId : undefined,
    summary: typeof o.summary === 'string' ? o.summary : undefined,
    errors: Array.isArray(o.errors) ? (o.errors as unknown[]).map(String) : [],
  };
}

function outboxBatchUrl(batchId?: string) {
  const p = new URLSearchParams({ tab: 'outbox', component: 'מנה חודשית' });
  if (batchId) p.set('batch', batchId);
  return `/collections/inbox?${p.toString()}`;
}

/** Who gets the mail and who is left out (with the reason). */
function AudienceLists({ result }: { result: RunResult }) {
  return (
    <div className="grid gap-[21px] lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="text-sm font-bold">
          יקבלו מייל <span className="font-medium text-muted-foreground">({formatNumber(result.eligible.length)})</span>
        </h4>
        {result.eligible.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">אף לקוח לא מתאים להרצה.</p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-[18px] bg-glass-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={HEAD}>לקוח</TableHead>
                  <TableHead className={HEAD}>חוב פתוח</TableHead>
                  <TableHead className={HEAD}>נמען</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.eligible.map((c, i) => (
                  <TableRow key={c.customerCode ?? i}>
                    <TableCell>
                      <CustomerLink code={c.customerCode} name={c.customerName} className="text-[13px]" />
                    </TableCell>
                    <TableCell className="text-[13px] font-semibold tabular-nums">{formatILS(c.openTotal)}</TableCell>
                    <TableCell className="text-xs">
                      {c.contactName && <span>{c.contactName} · </span>}
                      <span dir="ltr">{c.contactEmail || '—'}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="text-sm font-bold">
          מוחרגים <span className="font-medium text-muted-foreground">({formatNumber(result.excluded.length)})</span>
        </h4>
        {result.excluded.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">אף לקוח לא הוחרג.</p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-[18px] bg-glass-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={HEAD}>לקוח</TableHead>
                  <TableHead className={HEAD}>סיבה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.excluded.map((c, i) => (
                  <TableRow key={c.customerCode ?? i}>
                    <TableCell>
                      <CustomerLink code={c.customerCode} name={c.customerName} className="text-[13px]" />
                    </TableCell>
                    <TableCell className="text-[13px] whitespace-normal">{c.reason || 'לא צוינה סיבה'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/** "הרץ עכשיו": first a preview with counts, then the real run (drafts only). */
function RunNowDialog({ automation, open, onOpenChange }: { automation: Automation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const scope = useOwnerScope();
  const { executeFunction: run } = useExecuteAction(RunMailAutomationAction);
  const [phase, setPhase] = useState<'previewing' | 'preview' | 'running' | 'done' | 'error'>('previewing');
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [done, setDone] = useState<RunResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The dialog mounts when "הרץ עכשיו" is pressed: the dry run starts at once (and again on "נסו שוב").
  useEffect(() => {
    let cancelled = false;
    run({ automationId: automation.id, dryRun: true }).then(
      (raw) => {
        if (cancelled) return;
        const r = readRun(raw);
        setPreview(r);
        setPhase(r.errors.length && r.eligible.length === 0 ? 'error' : 'preview');
      },
      () => {
        if (cancelled) return;
        setPreview(null);
        setPhase('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [run, automation.id, attempt]);

  function runPreview() {
    setPhase('previewing');
    setAttempt((n) => n + 1);
  }

  async function runReal() {
    setPhase('running');
    try {
      const r = readRun(await run({ automationId: automation.id, dryRun: false, trigger: 'ידני', requestedBy: scope.actorName }));
      setDone(r);
      setPhase('done');
      toast.add({ title: r.summary || 'ההרצה הסתיימה', description: 'הטיוטות בדואר היוצא. שום דבר לא נשלח.', type: r.errors.length ? 'error' : 'success' });
    } catch {
      setPhase('preview');
      toast.add({ title: 'ההרצה נכשלה', description: 'לא נוצרו טיוטות. נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (phase !== 'running') onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>הרצת ״{automation.name || 'האוטומציה'}״ עכשיו</DialogTitle>
          <DialogDescription>קודם תצוגה: מי יקבל ומי מוחרג ולמה. רק אחרי אישור נוצרות טיוטות בדואר היוצא, וגם אז שום דבר לא נשלח.</DialogDescription>
        </DialogHeader>
        {phase === 'previewing' ? (
          <LoadingRows rows={5} />
        ) : phase === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-2">
              {preview?.errors.length ? preview.errors.join(' · ') : 'לא הצלחנו להכין תצוגה.'}
              <Button variant="outline" size="sm" onClick={runPreview}>
                נסו שוב
              </Button>
            </AlertDescription>
          </Alert>
        ) : phase === 'done' && done ? (
          <div className="flex flex-col gap-[13px]">
            <Alert>
              <InfoIcon />
              <AlertDescription>{done.summary || `נוצרו ${formatNumber(done.draftsCreated ?? 0)} טיוטות.`}</AlertDescription>
            </Alert>
            {done.errors.length > 0 && <p className="text-[13px] text-critical-ink">{done.errors.join(' · ')}</p>}
            <Link to={outboxBatchUrl(done.batchId)} onClick={() => onOpenChange(false)} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-link hover:underline">
              לטיוטות של ההרצה בדואר היוצא
              <ArrowUpLeftIcon className="size-3.5" />
            </Link>
          </div>
        ) : preview ? (
          <div className="flex flex-col gap-[13px]">
            <p className="text-sm font-semibold">{preview.summary}</p>
            {preview.errors.length > 0 && <p className="text-[13px] text-critical-ink">{preview.errors.join(' · ')}</p>}
            <AudienceLists result={preview} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={phase === 'running'} onClick={() => onOpenChange(false)}>
            {phase === 'done' ? 'סגירה' : 'ביטול'}
          </Button>
          {(phase === 'preview' || phase === 'running') && (
            <Button disabled={phase === 'running' || !preview?.eligible.length} onClick={runReal}>
              {phase === 'running' ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              יצירת {formatNumber(preview?.eligible.length ?? 0)} טיוטות
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunHistory({ automationId }: { automationId: string }) {
  const q = useEntityGetAll(MailAutomationRunsEntity, {
    where: { column: 'automationId', value: automationId },
    orderBy: [{ column: 'ranAt', direction: 'desc' }],
    page: { size: 20 },
  });
  const rows = (q.data ?? []) as Run[];
  if (q.isError) return <LoadError what="היסטוריית ההרצות" />;
  if (q.isLoading) return <LoadingRows rows={3} />;
  if (rows.length === 0) return <p className="text-[13px] text-muted-foreground">עוד לא הייתה הרצה. ההרצה הראשונה תירשם כאן, מתוזמנת או ידנית.</p>;
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={HEAD}>מתי</TableHead>
            <TableHead className={HEAD}>הפעלה</TableHead>
            <TableHead className={HEAD}>טיוטות</TableHead>
            <TableHead className={HEAD}>מוחרגים</TableHead>
            <TableHead className={HEAD}>סטטוס</TableHead>
            <TableHead className={HEAD}>שגיאות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="hover:bg-glass-faint">
              <TableCell className="align-top text-xs whitespace-nowrap tabular-nums">{formatDateTime(r.ranAt)}</TableCell>
              <TableCell className="align-top text-[13px]">
                {r.trigger || '—'}
                {r.requestedBy && <span className="block text-xs text-muted-foreground">{r.requestedBy}</span>}
              </TableCell>
              <TableCell className="align-top text-[13px]">
                <span className="font-semibold tabular-nums">{formatNumber(r.draftsCreated ?? 0)}</span>
                {r.batchId && (r.draftsCreated ?? 0) > 0 && (
                  <Link to={outboxBatchUrl(r.batchId)} className="ms-2 text-xs font-semibold text-link hover:underline">
                    בדואר היוצא
                  </Link>
                )}
              </TableCell>
              <TableCell className="max-w-72 align-top text-[13px] whitespace-normal">
                <span className="font-semibold tabular-nums">{formatNumber(r.excludedCount ?? 0)}</span>
                {r.excludedSummary && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">למה</summary>
                    <p className="whitespace-pre-wrap">{r.excludedSummary}</p>
                  </details>
                )}
              </TableCell>
              <TableCell className="align-top">
                <StatusBadge value={r.status} tone={r.status === 'נכשלה' ? 'critical' : 'done'} />
              </TableCell>
              <TableCell className="max-w-64 align-top text-xs whitespace-pre-wrap text-muted-foreground">{r.errors || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** One automation: settings, templates with variables, preview on a sample customer, run now, history. */
function AutomationCard({ automation }: { automation: Automation }) {
  const scope = useOwnerScope();
  const { updateFunction, isLoading: saving } = useEntityUpdate(MailAutomationsEntity);
  const { executeFunction: run } = useExecuteAction(RunMailAutomationAction);
  const [audience, setAudience] = useState<string>(automation.audience || AUDIENCE_ALL);
  const [codes, setCodes] = useState<string[]>(splitList(automation.customerCodes));
  const [day, setDay] = useState(String(automation.dayOfMonth ?? 5));
  const [hour, setHour] = useState(String(automation.hour ?? 8));
  const [subject, setSubject] = useState(automation.subjectTemplate ?? '');
  const [body, setBody] = useState(automation.bodyTemplate ?? '');
  const [focus, setFocus] = useState<'subject' | 'body'>('body');
  const [sample, setSample] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  const dayN = Number(day);
  const hourN = Number(hour);
  const dayBad = !Number.isInteger(dayN) || dayN < 1 || dayN > 28;
  const hourBad = !Number.isInteger(hourN) || hourN < 0 || hourN > 23;
  const codesBad = audience === AUDIENCE_SELECTED && codes.length === 0;
  const dirty =
    audience !== (automation.audience || AUDIENCE_ALL) ||
    codes.join(',') !== splitList(automation.customerCodes).join(',') ||
    dayN !== (automation.dayOfMonth ?? 5) ||
    hourN !== (automation.hour ?? 8) ||
    subject !== (automation.subjectTemplate ?? '') ||
    body !== (automation.bodyTemplate ?? '');

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    if (focus === 'subject') setSubject((s) => (s ? `${s} ${token}` : token));
    else setBody((b) => (b ? `${b}${b.endsWith('\n') || b.endsWith(' ') ? '' : ' '}${token}` : token));
  }

  async function save() {
    if (dayBad || hourBad || codesBad) return;
    try {
      await updateFunction({
        id: automation.id,
        data: {
          audience: audience as Automation['audience'],
          customerCodes: audience === AUDIENCE_SELECTED ? codes.join(', ') : '',
          dayOfMonth: dayN,
          hour: hourN,
          subjectTemplate: subject,
          bodyTemplate: body,
          updatedByName: scope.actorName,
          settingsUpdatedAt: new Date().toISOString(),
        },
      });
      toast.add({ title: 'ההגדרות נשמרו', type: 'success' });
    } catch {
      toast.add({ title: 'ההגדרות לא נשמרו', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  async function toggleActive(active: boolean) {
    setToggling(true);
    try {
      await updateFunction({ id: automation.id, data: { active, updatedByName: scope.actorName } });
      toast.add({ title: active ? 'האוטומציה פעילה' : 'האוטומציה הושהתה', description: active ? 'תרוץ במועד הבא ותכין טיוטות בלבד.' : 'לא תרוץ עד שתופעל שוב.', type: 'success' });
    } catch {
      toast.add({ title: 'השינוי לא נשמר', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
    setToggling(false);
  }

  async function runPreview() {
    if (!sample) return;
    setPreviewing(true);
    try {
      const r = readRun(await run({ automationId: automation.id, dryRun: true, previewCustomerCode: sample, subjectOverride: subject, bodyOverride: body }));
      setPreview(r);
      if (r.errors.length) toast.add({ title: 'בתצוגה יש הערות', description: r.errors.join(' · '), type: 'error' });
    } catch {
      toast.add({ title: 'התצוגה המקדימה נכשלה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
    setPreviewing(false);
  }

  const p = preview?.preview;

  return (
    <article className="glass glass-lift flex flex-col gap-[21px] rounded-[26px] border p-[21px]">
      <div className="flex flex-wrap items-start justify-between gap-[13px]">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{automation.name || automation.kind || 'אוטומציה'}</h2>
            <StatusBadge value={automation.active ? 'פעילה' : 'מושהית'} tone={automation.active ? 'done' : 'neutral'} />
          </div>
          <span className="text-[13px] text-muted-foreground">
            כל חודש ב-{automation.dayOfMonth ?? '—'} בשעה {String(automation.hour ?? 0).padStart(2, '0')}:00 · {automation.audience || AUDIENCE_ALL}
          </span>
          <span className="text-xs text-muted-foreground">
            הרצה אחרונה: {automation.lastRunAt ? `${formatDateTime(automation.lastRunAt)} · ${automation.lastRunSummary || ''}` : 'עוד לא רצה'}
          </span>
          {automation.updatedByName && (
            <span className="text-xs text-muted-foreground">
              עודכן ע״י {automation.updatedByName} · {formatDateTime(automation.settingsUpdatedAt)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-[13px]">
          <Field orientation="horizontal" className="w-auto">
            <Switch id={`active-${automation.id}`} checked={!!automation.active} disabled={toggling} onCheckedChange={(v) => toggleActive(!!v)} />
            <FieldLabel htmlFor={`active-${automation.id}`}>פעילה</FieldLabel>
          </Field>
          <Button className="rounded-full px-[18px] font-bold shadow-primary" onClick={() => setRunOpen(true)}>
            <PlayIcon data-icon="inline-start" />
            הרץ עכשיו
          </Button>
        </div>
      </div>
      <Alert>
        <InfoIcon />
        <AlertDescription>טיוטות בלבד: כל הרצה יוצרת טיוטות בדואר היוצא, ושום דבר לא נשלח. הרצה חוזרת באותו חודש מחליפה את הטיוטות הממתינות.</AlertDescription>
      </Alert>

      <Separator />
      <FieldGroup className="grid gap-[21px] md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`aud-${automation.id}`}>נמענים</FieldLabel>
          <Select items={AUDIENCE_ITEMS} value={audience} onValueChange={(v) => setAudience((v as string | null) ?? AUDIENCE_ALL)}>
            <SelectTrigger id={`aud-${automation.id}`} className="w-full bg-glass-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {AUDIENCE_ITEMS.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={dayBad || undefined}>
          <FieldLabel htmlFor={`day-${automation.id}`}>יום בחודש</FieldLabel>
          <Input id={`day-${automation.id}`} type="number" min={1} max={28} value={day} aria-invalid={dayBad || undefined} onChange={(e) => setDay(e.target.value)} className="bg-glass-card" />
          {dayBad ? <FieldError>יום בין 1 ל-28.</FieldError> : <FieldDescription>1–28, כדי שירוץ בכל חודש.</FieldDescription>}
        </Field>
        <Field data-invalid={hourBad || undefined}>
          <FieldLabel htmlFor={`hour-${automation.id}`}>שעה (שעון ישראל)</FieldLabel>
          <Input id={`hour-${automation.id}`} type="number" min={0} max={23} value={hour} aria-invalid={hourBad || undefined} onChange={(e) => setHour(e.target.value)} className="bg-glass-card" />
          {hourBad && <FieldError>שעה בין 0 ל-23.</FieldError>}
        </Field>
        {audience === AUDIENCE_SELECTED && (
          <Field data-invalid={codesBad || undefined} className="md:col-span-3">
            <FieldLabel htmlFor={`codes-${automation.id}`}>הלקוחות שיקבלו</FieldLabel>
            <CustomerMultiPicker id={`codes-${automation.id}`} value={codes} onChange={setCodes} />
            {codesBad && <FieldError>בחרו לפחות לקוח אחד.</FieldError>}
          </Field>
        )}
        <Field className="md:col-span-3">
          <FieldLabel htmlFor={`subj-${automation.id}`}>נושא</FieldLabel>
          <Input id={`subj-${automation.id}`} value={subject} onFocus={() => setFocus('subject')} onChange={(e) => setSubject(e.target.value)} className="bg-glass-card" />
        </Field>
        <Field className="md:col-span-3">
          <FieldLabel htmlFor={`body-${automation.id}`}>נוסח</FieldLabel>
          <Textarea id={`body-${automation.id}`} rows={9} value={body} onFocus={() => setFocus('body')} onChange={(e) => setBody(e.target.value)} className="bg-glass-card" />
          <FieldDescription>משתנים (לחיצה מוסיפה ל{focus === 'subject' ? 'נושא' : 'נוסח'}):</FieldDescription>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <Button key={v.name} type="button" variant="ghost" size="sm" className="h-7 rounded-full bg-glass-soft px-2.5 text-xs" onClick={() => insertVariable(v.name)} title={v.label}>
                <span dir="ltr">{`{{${v.name}}}`}</span>
                <span className="text-muted-foreground">{v.label}</span>
              </Button>
            ))}
          </div>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!dirty || saving || dayBad || hourBad || codesBad} onClick={save}>
          {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
          שמירת ההגדרות
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">יש שינויים שלא נשמרו. התצוגה המקדימה כבר משתמשת בהם.</span>}
      </div>

      <Separator />
      <section className="flex flex-col gap-[13px]">
        <h3 className="text-base font-bold">תצוגה מקדימה על לקוח לדוגמה</h3>
        <div className="flex flex-wrap items-end gap-[13px]">
          <Field className="w-auto min-w-72">
            <FieldLabel htmlFor={`sample-${automation.id}`} className="text-xs text-muted-foreground">
              לקוח לדוגמה
            </FieldLabel>
            <CustomerPicker id={`sample-${automation.id}`} value={sample} onChange={setSample} placeholder="בחרו לקוח…" className="bg-glass-card" />
          </Field>
          <Button variant="outline" disabled={!sample || previewing} onClick={runPreview}>
            {previewing ? <Spinner data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
            הצגת התצוגה
          </Button>
          <span className="text-xs text-muted-foreground">לא נכתב דבר ולא נוצרת טיוטה.</span>
        </div>
        {preview && (
          <div className="flex flex-col gap-[21px]">
            {p ? (
              <div className="grid gap-[21px] lg:grid-cols-2">
                <div className="glass-inner flex min-w-0 flex-col gap-2 p-[13px]">
                  {p.note && <StatusBadge value={p.note} tone="warning" className="h-auto self-start whitespace-normal" />}
                  <span className="text-xs text-muted-foreground">
                    אל: {p.toName ? `${p.toName} · ` : ''}
                    <span dir="ltr">{p.to || 'אין כתובת'}</span>
                  </span>
                  <span className="text-sm font-bold">{p.subject || 'ללא נושא'}</span>
                  <p className="text-sm whitespace-pre-wrap">{p.body || '—'}</p>
                </div>
                {p.pdfUrl ? (
                  <div className="h-[520px] overflow-hidden rounded-[22px] border border-glass-edge bg-glass-card">
                    <PdfViewer file={p.pdfUrl} defaultWidth={520} minWidth={300} />
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">לא הופק PDF לתצוגה.</p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">לא הופקה תצוגה ללקוח הזה.</p>
            )}
            <p className="text-sm font-semibold">{preview.summary}</p>
            <AudienceLists result={preview} />
          </div>
        )}
      </section>

      <Separator />
      <section className="flex flex-col gap-[13px]">
        <h3 className="text-base font-bold">היסטוריית ההרצות</h3>
        <RunHistory automationId={automation.id} />
      </section>

      {runOpen && <RunNowDialog automation={automation} open={runOpen} onOpenChange={setRunOpen} />}
    </article>
  );
}

/** Tab "אוטומציות": one card per MailAutomations row. Drafts only; nothing is sent. */
export function AutomationsTab() {
  const q = useEntityGetAll(MailAutomationsEntity, { orderBy: [{ column: 'name', direction: 'asc' }] });
  const rows = (q.data ?? []) as Automation[];
  const active = rows.filter((a) => a.active);
  const last = rows
    .filter((a) => a.lastRunAt)
    .sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? ''))[0];

  return (
    <>
      <AgentPanel
        agent="system"
        headline={
          q.isLoading
            ? 'טוען את האוטומציות…'
            : rows.length === 0
              ? 'אין עדיין אוטומציות מייל'
              : `${active.length === 1 ? 'אוטומציה אחת פעילה' : `${formatNumber(active.length)} אוטומציות פעילות`}${last ? `. ההרצה האחרונה: ${last.lastRunSummary || formatDateTime(last.lastRunAt)}` : '. עוד לא הייתה הרצה'}.`
        }
        description="בודק כל שעה אם הגיע היום והשעה של אוטומציה פעילה שעוד לא רצה החודש, ומכין טיוטות בדואר היוצא. לקוח מוחרג נרשם עם הסיבה. שום דבר לא נשלח."
      />
      {q.isError ? (
        <LoadError what="האוטומציות" />
      ) : q.isLoading ? (
        <LoadingRows rows={4} />
      ) : rows.length === 0 ? (
        <section className={cn('glass glass-lift rounded-[26px] border')}>
          <AgentEmpty title="אין אוטומציות">האוטומציה החודשית של חובות פתוחים תופיע כאן כשתוגדר בטבלת האוטומציות.</AgentEmpty>
        </section>
      ) : (
        rows.map((a) => <AutomationCard key={`${a.id}:${a.settingsUpdatedAt ?? ''}`} automation={a} />)
      )}
    </>
  );
}