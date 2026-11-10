import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CalendarCheckIcon, HistoryIcon, SettingsIcon } from 'lucide-react';
import { ApprovalsEntity, BankLinesEntity, IdentifyCustomersAction, ImportBatchesEntity, IssueReceiptAction, ReceiptCheckStepsEntity, ReceiptsEntity } from '@/product-types';
import type { IssueReceiptActionInputModeEnum } from '@/product-types';
import { LoadError, LoadingRows, PageHeader } from '@/components/PageStates';
import { AgentChequesSection } from '@/components/receipts/AgentChequesSection';
import { FileModePanel } from '@/components/receipts/FileModePanel';
import { IdentifySection } from '@/components/receipts/IdentifyList';
import { LegacyFileLines } from '@/components/receipts/LegacyFileLines';
import { PriorityPullPanel } from '@/components/receipts/PriorityPullPanel';
import { ReceiptFlowPanel } from '@/components/receipts/ReceiptFlowPanel';
import { useIsraelToday } from '@/hooks/useIsraelToday';
import { useNinaFocus } from '@/hooks/useNinaFocus';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { useReceiptsSource } from '@/hooks/useReceiptsSource';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDate, formatDayLabel, formatILS, formatNumber, israelDayStartISO } from '@/utils/Format';
import { FILE_KIND, PRIORITY_KIND, entersCheck, isPriorityLine, latestPull } from '@/utils/ReceiptsDay';
import type { BankLine } from '@/utils/ReceiptsDay';
import { SOURCE_LABEL, SOURCE_PRIORITY, compareIdentities, identifyCountsLine, identityOf, waitingIdentity } from '@/utils/ReceiptsIdentify';
import type { IdentifyCounts, IssueResult } from '@/utils/ReceiptsIdentify';

const HEAD = 'text-xs font-semibold text-muted-foreground';

/** "לא מטופלות": today's פירעון צ׳ק / אחר lines — shown only, no actions. */
function UnhandledLines({ lines }: { lines: BankLine[] }) {
  return (
    <section aria-label="לא מטופלות" className="glass flex min-w-0 flex-col gap-2 overflow-hidden rounded-[26px] border">
      <div className="flex flex-col px-[13px] pt-[13px] md:px-4">
        <h2 className="text-[15px] font-bold">
          לא מטופלות <span className="font-medium text-muted-foreground">({lines.length})</span>
        </h2>
        <span className="text-xs text-muted-foreground">מוצג בלבד – לא נכנס לזרימת התקבולים</span>
      </div>
      <div className="overflow-x-auto pb-[8px]">
        <Table className="min-w-[480px] text-[13px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, 'ps-[13px] md:ps-4')}>תאריך</TableHead>
              <TableHead className={HEAD}>תיאור</TableHead>
              <TableHead className={HEAD}>סכום</TableHead>
              <TableHead className={cn(HEAD, 'pe-[13px] md:pe-4')}>סוג</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id} className="hover:bg-transparent">
                <TableCell className="ps-[13px] py-1.5 whitespace-nowrap tabular-nums md:ps-4">{formatDate(l.valueDate)}</TableCell>
                <TableCell className="max-w-72 truncate py-1.5" title={l.reference ?? undefined}>
                  <span className="font-semibold">{l.payerName || '—'}</span>
                  {l.reference && l.reference !== l.payerName ? <span className="text-muted-foreground"> · {l.reference}</span> : null}
                </TableCell>
                <TableCell className={cn('py-1.5 whitespace-nowrap tabular-nums', (l.amount ?? 0) < 0 && 'text-critical-ink')}>{formatILS(l.amount)}</TableCell>
                <TableCell className="pe-[13px] py-1.5 whitespace-nowrap text-muted-foreground md:pe-4">{l.lineType ?? 'אחר'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

const latestIso = (...values: (string | null | undefined)[]) => values.filter((v): v is string => !!v).sort().at(-1) ?? null;

/**
 * /collections/receipts — one flow (08.11): every one of today's העברה / זיכוי בנק lines is in the identification
 * list (a line no run reached shows "ממתינה לזיהוי" with "זהה"); approving the customer issues the receipt
 * (IssueReceipt), then the debt check and the allocation follow. Clicking a row (or an agent cheque) opens the one
 * record panel — ?line=<bankLineId> or ?receipt=<receiptKey> — with the four steps זיהוי → קבלה → בדיקת חוב → פיזור.
 * The header names where the lines come from (AgentSettings bankLinesSource); פירעון צ׳ק / אחר are shown only; old
 * file lines stay collapsed and read only.
 */
export default function ReceiptsPage() {
  const { today, now } = useIsraelToday();
  const scope = useOwnerScope();
  const [params, setParams] = useSearchParams();
  const lineParam = params.get('line');
  const receiptParam = params.get('receipt');
  const settings = useReceiptsSource();
  const [legacyOpen, setLegacyOpen] = useState<boolean | null>(null);
  const { executeFunction: issue } = useExecuteAction(IssueReceiptAction);
  const { executeFunction: identify } = useExecuteAction(IdentifyCustomersAction);
  const [issuing, setIssuing] = useState<string[]>([]);
  const [lastIssue, setLastIssue] = useState<IssueResult | null>(null);
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, string>>({});
  const [identifyNote, setIdentifyNote] = useState<string | null>(null);
  const [reidentifying, setReidentifying] = useState(false);
  const [identifying, setIdentifying] = useState<string[]>([]);

  const dayStart = israelDayStartISO(today);
  const pullsQ = useEntityGetAll(ImportBatchesEntity, {
    where: { and: [{ column: 'kind', value: PRIORITY_KIND }, { column: 'dataDate', value: today }] },
    orderBy: [{ column: 'uploadedAt', direction: 'desc' }],
  });
  const filesQ = useEntityGetAll(ImportBatchesEntity, {
    where: { and: [{ column: 'kind', value: FILE_KIND }, { column: 'uploadedAt', operator: '>=', value: dayStart }] },
    orderBy: [{ column: 'uploadedAt', direction: 'desc' }],
  });
  const linesQ = useEntityGetAll(BankLinesEntity, {
    where: { and: [{ column: 'priorityLineId', operator: 'is not null' }, { column: 'syncedAt', operator: '>=', value: dayStart }] },
    orderBy: [
      { column: 'valueDate', direction: 'asc' },
      { column: 'lineNo', direction: 'asc' },
    ],
  });
  const fileBatches = filesQ.data ?? [];
  const fileBatchIds = fileBatches.map((b) => b.id);
  const verifiedFiles = fileBatches.filter((b) => b.extractionStatus === 'אומת');
  const verifiedIds = verifiedFiles.map((b) => b.id);
  const fileLinesQ = useEntityGetAll(
    BankLinesEntity,
    { where: { column: 'importBatchId', operator: 'in', value: verifiedIds }, orderBy: [{ column: 'lineNo', direction: 'asc' }] },
    { enabled: verifiedIds.length > 0 },
  );
  const priorityLines = (linesQ.data ?? []).filter(isPriorityLine);
  const todayLines = [...priorityLines, ...(verifiedIds.length ? (fileLinesQ.data ?? []) : []).filter((l) => !priorityLines.some((p) => p.id === l.id))];
  const inToday = !!lineParam && todayLines.some((l) => l.bankLineId === lineParam);

  // A link to a line that is not one of today's: read it on its own.
  const linkedQ = useEntityGetAll(BankLinesEntity, { where: { column: 'bankLineId', value: lineParam ?? '' } }, { enabled: !!lineParam && !linesQ.isLoading && !inToday });
  const linked = !inToday && lineParam ? (linkedQ.data ?? [])[0] : undefined;
  const linkedOther = linked && isPriorityLine(linked) ? linked : undefined;
  const linkedLegacy = linked && !isPriorityLine(linked) ? linked : undefined;

  const shown = linkedOther ? [linkedOther, ...todayLines] : todayLines;
  const checkLines = shown.filter(entersCheck);
  const unhandled = shown.filter((l) => !entersCheck(l));

  // A line's identification lives on its draft receipt (identifyStatus) or, for an unknown payer, its step; a line
  // with neither is waiting for its first identification — it is listed too, never hidden.
  const ids = checkLines.map((l) => l.bankLineId).filter((id): id is string => !!id);
  const receiptsQ = useEntityGetAll(ReceiptsEntity, { where: { column: 'bankLineId', operator: 'in', value: ids } }, { enabled: ids.length > 0 });
  const stepsQ = useEntityGetAll(
    ReceiptCheckStepsEntity,
    { where: { and: [{ column: 'bankLineId', operator: 'in', value: ids }, { column: 'stage', value: 'זיהוי לקוח' }] } },
    { enabled: ids.length > 0 },
  );
  const receipts = receiptsQ.data ?? [];
  const steps = stepsQ.data ?? [];
  const identities = checkLines
    .filter((l) => !!l.bankLineId)
    .map((l) => identityOf(l, receipts, steps) ?? waitingIdentity(l))
    .sort(compareIdentities);
  const identifyLoading = ids.length > 0 && (receiptsQ.isLoading || stepsQ.isLoading);

  const receiptKeys = identities.filter((r) => r.state === 'אושר' && r.receipt?.receiptKey).map((r) => r.receipt?.receiptKey ?? '');
  const approvalsQ = useEntityGetAll(
    ApprovalsEntity,
    { where: { and: [{ column: 'relatedTable', value: 'Receipts' }, { column: 'relatedId', operator: 'in', value: receiptKeys }] } },
    { enabled: receiptKeys.length > 0 },
  );
  const approvalIds = new Map<string, string>(Object.entries(sessionDrafts));
  for (const a of approvalsQ.data ?? []) if (a.relatedId && !approvalIds.has(a.relatedId)) approvalIds.set(a.relatedId, a.id);

  const pulls = pullsQ.data ?? [];
  const pull = latestPull(pulls, today);
  const arrivedAt = latestIso(pull?.uploadedAt, ...verifiedFiles.map((b) => b.verifiedAt));
  const focused = identities.find((r) => r.bankLineId === lineParam) ?? null;
  const focusedReceipt = focused?.receipt ?? receipts.find((r) => r.receiptKey === receiptParam) ?? null;
  useNinaFocus(focused?.customerCode ?? focusedReceipt?.customerCode, focused?.customerName ?? focusedReceipt?.customerName, {
    importBatchId: focused?.line.importBatchId ?? pull?.id ?? null,
    bankLineId: focused?.bankLineId ?? null,
  });

  const highlightShown = !!lineParam && identities.some((r) => r.bankLineId === lineParam);
  useEffect(() => {
    if (!highlightShown) return;
    const row = [...document.querySelectorAll<HTMLElement>('[data-line]')].find((el) => el.dataset.line === lineParam);
    row?.scrollIntoView({ block: 'center' });
  }, [highlightShown, lineParam]);

  /** ?line= / ?receipt= — the record panel's address; one at a time, null closes it. */
  function setRecord(next: { line?: string; receipt?: string } | null) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('line');
        p.delete('receipt');
        if (next?.line) p.set('line', next.line);
        if (next?.receipt) p.set('receipt', next.receipt);
        return p;
      },
      { replace: true },
    );
  }

  function refreshLists() {
    pullsQ.refetch();
    filesQ.refetch();
    linesQ.refetch();
    if (verifiedIds.length) fileLinesQ.refetch();
    if (ids.length) {
      receiptsQ.refetch();
      stepsQ.refetch();
    }
    if (receiptKeys.length) approvalsQ.refetch();
  }

  async function runIssue(mode: IssueReceiptActionInputModeEnum, bankLineIds: string[], customerCode?: string | null) {
    if (!bankLineIds.length || bankLineIds.some((id) => issuing.includes(id))) return;
    setIssuing((prev) => [...prev, ...bankLineIds]);
    setLastIssue(null);
    try {
      const out = ((await issue({ mode, bankLineIds, ...(customerCode ? { customerCode } : {}), approvedBy: scope.actorName, dryRun: false })) ?? {}) as IssueResult;
      setLastIssue(out);
      const drafts: Record<string, string> = {};
      for (const i of out.issued ?? []) if (i.receiptKey && i.approvalId) drafts[i.receiptKey] = i.approvalId;
      if (Object.keys(drafts).length) setSessionDrafts((prev) => ({ ...prev, ...drafts }));
      const n = out.issued?.length ?? 0;
      if (n > 0) toast.add({ title: n === 1 ? 'הקבלה יצאה' : `${formatNumber(n)} קבלות יצאו`, description: 'טיוטות המייל מחכות לאישור בדואר יוצא.', type: 'success' });
    } catch {
      setLastIssue({ errors: ['האישור לא הסתיים. קבלה שכבר אושרה לא תאושר פעמיים – אפשר לנסות שוב.'] });
    } finally {
      setIssuing((prev) => prev.filter((id) => !bankLineIds.includes(id)));
      refreshLists();
    }
  }

  async function identifyOne(bankLineId: string) {
    if (identifying.includes(bankLineId)) return;
    setIdentifying((prev) => [...prev, bankLineId]);
    setIdentifyNote(null);
    try {
      const out = (await identify({ dryRun: false, bankLineIds: [bankLineId], checkedBy: scope.actorName })) as { counts?: IdentifyCounts; errors?: string[] } | null;
      const errors = out?.errors ?? [];
      setIdentifyNote([identifyCountsLine(out?.counts), errors.length ? `שגיאות: ${errors.join(' · ')}` : null].filter(Boolean).join(' '));
    } catch {
      setIdentifyNote('הזיהוי לא הסתיים. נסו שוב בעוד רגע.');
    } finally {
      setIdentifying((prev) => prev.filter((id) => id !== bankLineId));
      refreshLists();
    }
  }

  async function reidentify() {
    const open = identities.filter((r) => r.state !== 'אושר').map((r) => r.bankLineId);
    if (!open.length) {
      setIdentifyNote('אין שורות פתוחות לזהות מחדש – כל השורות של היום אושרו.');
      return;
    }
    setReidentifying(true);
    setIdentifyNote(null);
    try {
      const out = (await identify({ dryRun: false, bankLineIds: open, checkedBy: scope.actorName })) as { counts?: IdentifyCounts; errors?: string[] } | null;
      const errors = out?.errors ?? [];
      setIdentifyNote([identifyCountsLine(out?.counts), errors.length ? `שגיאות: ${errors.join(' · ')}` : null].filter(Boolean).join(' '));
    } catch {
      setIdentifyNote('הזיהוי לא הסתיים. נסו שוב בעוד רגע.');
    } finally {
      setReidentifying(false);
      refreshLists();
    }
  }

  const priorityMode = settings.source === SOURCE_PRIORITY;
  const hasIdentify = identities.length > 0;
  const loading = linesQ.isLoading || pullsQ.isLoading || filesQ.isLoading;
  const somethingArrived = !!pull || verifiedFiles.length > 0;

  return (
    <>
      <PageHeader
        title="תקבולים"
        description={`${formatDayLabel(today)} (היום) · כל העברה מקבלת לקוח עם רמת ביטחון, ואישור הלקוח מוציא את הקבלה. שום דבר לא נכתב ל-Priority.`}
        actions={
          <Link
            to="/collections/settings"
            className="glass-soft inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] text-ink-2 hover:text-link"
            title="מקור שורות דף הבנק נקבע בהגדרות"
          >
            <SettingsIcon className="size-4 text-muted-foreground" />
            מקור השורות: <span className="font-semibold">{settings.isLoading ? '…' : SOURCE_LABEL[settings.source]}</span> · שינוי בהגדרות
          </Link>
        }
      />

      {settings.isLoading ? null : priorityMode ? (
        <PriorityPullPanel pull={pull} pullsToday={pulls.length} loading={pullsQ.isLoading} loadError={pullsQ.isError} primary={!hasIdentify} onDone={refreshLists} />
      ) : (
        <FileModePanel
          batches={fileBatches}
          loading={filesQ.isLoading}
          loadError={filesQ.isError}
          primary={!hasIdentify}
          now={now}
          onConfirmed={(note) => {
            setIdentifyNote(note);
            refreshLists();
          }}
        />
      )}

      {linkedOther && (
        <Alert>
          <HistoryIcon />
          <AlertTitle>רשומה מ-{formatDate(linkedOther.valueDate)}, שנמשכה ביום אחר</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            היא מוצגת כאן לצד השורות של היום.
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setRecord(null)}>
              <CalendarCheckIcon data-icon="inline-start" />
              רק השורות של היום
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {linesQ.isError || fileLinesQ.isError ? (
        <LoadError what="שורות דפי הבנק" />
      ) : loading || identifyLoading ? (
        <LoadingRows rows={5} />
      ) : hasIdentify ? (
        <IdentifySection
          rows={identities}
          certainAt={settings.certainAt}
          arrivedAt={arrivedAt}
          highlight={lineParam}
          approvalIds={approvalIds}
          issuing={[...issuing, ...identifying]}
          reidentifying={reidentifying}
          lastIssue={lastIssue}
          identifyNote={identifyNote}
          onApproveAll={(bankLineIds) => void runIssue('certain', bankLineIds)}
          onApproveOne={(bankLineId, code) => void runIssue('one', [bankLineId], code)}
          onIdentifyOne={(bankLineId) => void identifyOne(bankLineId)}
          onOpen={(bankLineId) => setRecord({ line: bankLineId })}
          onReidentify={() => void reidentify()}
          onDismissIssue={() => setLastIssue(null)}
          onAllocated={refreshLists}
        />
      ) : somethingArrived ? (
        <section aria-label="זיהוי לקוחות" className="glass flex flex-col rounded-[26px] border p-[21px]">
          <h2 className="text-[15px] font-bold">
            זיהוי לקוחות <span className="font-medium text-muted-foreground">(0)</span>
          </h2>
          <span className="text-[13px] text-muted-foreground">אין היום העברות או זיכויי בנק לזיהוי.</span>
        </section>
      ) : null}
      {receiptsQ.isError || stepsQ.isError ? <LoadError what="זיהוי הלקוחות" /> : null}

      <AgentChequesSection onOpen={(receiptKey) => setRecord({ receipt: receiptKey })} />

      {!loading && !linesQ.isError && unhandled.length > 0 && <UnhandledLines lines={unhandled} />}

      <LegacyFileLines open={legacyOpen ?? !!linkedLegacy} onOpenChange={setLegacyOpen} highlight={linkedLegacy?.bankLineId} excludeBatchIds={fileBatchIds} />

      <ReceiptFlowPanel
        open={!!receiptParam || (!!lineParam && !linkedLegacy)}
        onOpenChange={(o) => !o && setRecord(null)}
        receiptKey={receiptParam}
        bankLineId={receiptParam ? null : lineParam}
      />
    </>
  );
}