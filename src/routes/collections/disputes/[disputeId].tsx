import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useEntityGetAll, useEntityGetOne, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, MailIcon, MessageCircleQuestionIcon } from 'lucide-react';
import { AnalyzePriceGapAction, ApprovalsEntity, DeliveryNotesEntity, DisputesEntity, InboundEmailsEntity, InvoicesEntity } from '@/product-types';
import { AgentAvatar, AgentPanel } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { LoadingRows, PageHeader } from '@/components/PageStates';
import { SafeRedirect } from '@/components/SafeRedirect';
import { StatusBadge } from '@/components/StatusBadge';
import { CaseDrafts } from '@/components/disputes/CaseDrafts';
import { DocumentsEvidence } from '@/components/disputes/DocumentsCase';
import { InvoiceLinesLive } from '@/components/receipts/InvoiceLinesLive';
import { PriceEvidence } from '@/components/disputes/PriceCase';
import { AskMayaSheet } from '@/components/inbox/AskMayaSheet';
import { useActionQuery } from '@/hooks/useActionQuery';
import { useInboxAgent } from '@/hooks/useInboxAgent';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CLOSED,
  DOC_TYPE,
  ESCALATED,
  KIND_LOGISTICS,
  KIND_PACKAGE,
  KIND_PRICE_REQUEST,
  PRICE_TYPE,
  ST_AGENT,
  ST_CREDIT,
  ST_MANAGER,
  ST_READY,
  ST_REMINDER,
  ST_WAIT_SCAN,
  countDocs,
  disputeTone,
  casesFolderUrl,
  invoicesOf,
  isPriceGapResult,
  isTestDispute,
  reasonsOf,
} from '@/utils/Disputes';
import type { CaseDraft, DeliveryNote, Dispute, InvoiceRow, PriceGapResult } from '@/utils/Disputes';
import { formatDateTime, formatILS, formatNumber } from '@/utils/Format';
import type { InboundEmail } from '@/utils/Inbox';

const KIND_SENTENCE: Record<string, string> = {
  [KIND_LOGISTICS]: 'פנייה ללוגיסטיקה',
  [KIND_PACKAGE]: 'חבילה ללקוח',
  [KIND_PRICE_REQUEST]: 'בקשת אישור מחיר',
};

const DOC_SUGGESTIONS = ['מה חסר כדי לסגור את המקרה?', 'מתי תצא התזכורת הבאה ללוגיסטיקה?', 'מה ייכלל בחבילה ללקוח?'];
const PRICE_SUGGESTIONS = ['למה יש פער בכל שורה?', 'איזה מייל מתאים כראיה לאישור הסוכן?', 'מה ייכתב בתקציר לזיכוי?'];

function Stat({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="mt-1 h-5 w-12" /> : <span className="truncate text-base font-bold tabular-nums">{value}</span>}
    </div>
  );
}

function docsHeadline(d: Dispute, scanned: number, expected: number, missing: string[]) {
  const invs = invoicesOf(d).join(', ');
  const count = expected ? `${scanned}/${expected} תעודות סרוקות` : 'לא נמצאו תעודות';
  const who = d.logisticsOwnerName || 'הלוגיסטיקה';
  switch (d.status) {
    case ST_WAIT_SCAN:
      return `${count} לחשבונית ${invs}. ביקשתי מ${who} לסרוק את ${missing.length ? missing.join(', ') : 'התעודות החסרות'}.`;
    case ST_REMINDER:
      return `${count} לחשבונית ${invs}. הבקשה ל${who} לא נענתה בזמן, אז הכנתי תזכורת.`;
    case ESCALATED:
      return `${count} לחשבונית ${invs}. התעודות לא נסרקו גם אחרי התזכורת, והמקרה הוסלם למנהל הגבייה.`;
    case ST_READY:
      return `כל התעודות של חשבונית ${invs} סרוקות (${count}). הכנתי חבילה ללקוח: החשבונית וכל הסריקות.`;
    case CLOSED:
      return `המקרה של חשבונית ${invs} נסגר.`;
    default:
      return `${count} לחשבונית ${invs}.`;
  }
}

function priceHeadline(d: Dispute, total: number | undefined, reasons: string[]) {
  const inv = invoicesOf(d).join(', ');
  const gap = `פער של ${formatILS(total ?? d.disputedAmount)} בחשבונית ${inv}${reasons.length ? ` (${reasons.join(', ')})` : ''}`;
  const agent = d.salesAgentName || 'סוכן המכירות';
  const manager = d.salesManagerName || 'מנהל המכירות';
  switch (d.status) {
    case ST_AGENT:
      return `${gap}. הכנתי בקשת אישור ל${agent} ול${manager}; מחכה ל״סוכן אישר״.`;
    case ST_MANAGER:
      return `${gap}. ${agent} אישר; מחכה ל״מנהל אישר״ של ${manager}.`;
    case ST_CREDIT:
      return `${gap}. שני האישורים סומנו, והתקציר לזיכוי מוכן ליצירה ב-Priority.`;
    case CLOSED:
      return `${gap}. המקרה נסגר.`;
    default:
      return `${gap}.`;
  }
}

/** The email that opened the case, linked to its drawer in the inbox. */
function SourceEmail({ messageId, email, loading }: { messageId?: string | null; email?: InboundEmail; loading: boolean }) {
  if (!messageId) return <p className="text-[13px] text-muted-foreground">המקרה נפתח בלי מייל נכנס (מבדיקה ידנית או מהשעון).</p>;
  if (loading) return <Skeleton className="h-16 w-full rounded-[22px]" />;
  if (!email) return <p className="text-[13px] text-muted-foreground">המייל שפתח את המקרה כבר לא בתיבה.</p>;
  return (
    <div className="glass-inner flex flex-wrap items-center justify-between gap-[13px] p-[13px]">
      <div className="flex min-w-0 items-start gap-2">
        <MailIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">המייל שפתח את המקרה</span>
          <span className="truncate text-sm font-semibold">{email.subject || 'ללא נושא'}</span>
          <span className="text-xs text-muted-foreground">
            {email.fromName ? `${email.fromName} · ` : ''}
            <span dir="ltr">{email.fromAddress}</span> · {formatDateTime(email.receivedAt)}
          </span>
        </div>
      </div>
      <Link to={`/collections/inbox?email=${encodeURIComponent(email.id)}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
        פתיחת הפנייה
        <ArrowUpLeftIcon className="size-3.5" />
      </Link>
    </div>
  );
}

/** /collections/disputes/:disputeId — one documents or price case: what Maya did, the evidence, the drafts. */
export default function DisputeCasePage() {
  const { disputeId = '' } = useParams();
  const maya = useInboxAgent();
  const [askOpen, setAskOpen] = useState(false);

  const caseQ = useEntityGetOne(DisputesEntity, { id: disputeId }, { enabled: !!disputeId });
  const d = caseQ.data as Dispute | undefined;
  const isDocs = d?.disputeType === DOC_TYPE;
  const isPrice = d?.disputeType === PRICE_TYPE;
  const invs = d ? invoicesOf(d) : [];

  const emailQ = useEntityGetAll(InboundEmailsEntity, { where: { column: 'messageId', value: d?.inboundEmailId ?? '' } }, { enabled: !!d?.inboundEmailId });
  const draftsQ = useEntityGetAll(
    ApprovalsEntity,
    { where: { and: [{ column: 'relatedTable', value: 'Disputes' }, { column: 'relatedId', value: disputeId }] }, orderBy: [{ column: 'draftedAt', direction: 'desc' }] },
    { enabled: !!disputeId },
  );
  const notesQ = useEntityGetAll(
    DeliveryNotesEntity,
    { where: { column: 'invoiceNumber', operator: 'in', value: invs }, orderBy: [{ column: 'noteNumber', direction: 'asc' }] },
    { enabled: isDocs && invs.length > 0 },
  );
  const invoicesQ = useEntityGetAll(InvoicesEntity, { where: { column: 'invoiceNumber', operator: 'in', value: invs } }, { enabled: isDocs && invs.length > 0 });
  const { executeFunction: analyze } = useExecuteAction(AnalyzePriceGapAction);
  const gap = useActionQuery(analyze, { invoiceNumber: invs[0] ?? '', dryRun: true }, { enabled: isPrice && invs.length > 0, cache: 'priceGap', validate: isPriceGapResult });

  if (!disputeId || (!caseQ.isLoading && !d)) {
    return (
      <SafeRedirect
        to={casesFolderUrl()}
        fallback={
          <PageHeader
            title="המקרה לא נמצא"
            description="ייתכן שהקישור ישן או שהמקרה נמחק."
            actions={
              <Link to={casesFolderUrl()} className="text-sm font-semibold text-link hover:underline">
                לפניות
              </Link>
            }
          />
        }
      />
    );
  }

  if (!d) {
    return (
      <>
        <Skeleton className="h-11 w-72 max-w-full" />
        <Skeleton className="h-56 w-full rounded-[30px]" />
        <LoadingRows rows={4} />
      </>
    );
  }

  const email = (emailQ.data ?? [])[0] as InboundEmail | undefined;
  const drafts = (draftsQ.data ?? []) as CaseDraft[];
  const notes = ((notesQ.data ?? []) as DeliveryNote[]).slice().sort((a, b) => (a.noteNumber ?? '').localeCompare(b.noteNumber ?? '', 'en', { numeric: true }));
  const docCount = countDocs(invs, (invoicesQ.data ?? []) as InvoiceRow[], notes);
  const docsLoading = notesQ.isLoading || invoicesQ.isLoading;
  const analysis = gap.data as PriceGapResult | undefined;
  const reasons = analysis?.reasons?.length ? analysis.reasons : reasonsOf(d.description);
  const tab = isPrice ? 'prices' : 'docs';

  const headline = isDocs
    ? docsLoading
      ? <Skeleton className="h-7 w-80 max-w-full" />
      : docsHeadline(d, docCount.scanned, docCount.expected, docCount.missing)
    : isPrice
      ? priceHeadline(d, analysis?.totalGap, reasons)
      : d.description || 'מקרה פתוח.';

  const draftSentence = drafts.length
    ? `הכנתי ${drafts.length === 1 ? 'טיוטה אחת' : `${formatNumber(drafts.length)} טיוטות`}: ${drafts
        .map((a) => `${KIND_SENTENCE[a.kind ?? ''] ?? a.kind} (${a.status === 'ממתין' ? 'ממתין לאישור' : a.status})`)
        .join(', ')}. שום דבר לא נשלח.`
    : 'עוד לא הכנתי טיוטה למקרה הזה.';

  return (
    <>
      <PageHeader
        title={`מקרה ${d.disputeNumber || ''}`.trim()}
        description={`${isDocs ? 'תעודות משלוח חסרות' : isPrice ? 'הפרש מחיר' : d.disputeType ?? 'מקרה'} · ${d.customerName || d.customerCode || 'לקוח לא ידוע'}`}
        actions={
          <Link to={casesFolderUrl(tab)} className="glass-soft inline-flex min-h-10 items-center gap-1 rounded-[20px] px-4 text-sm font-semibold text-ink-2 hover:text-link">
            {isDocs ? 'לתיקיית התעודות בפניות' : 'לתיקיית המחירים בפניות'}
            <ArrowUpLeftIcon className="size-3.5" />
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge value={d.status} tone={disputeTone(d.status)} />
        {d.ballWith && <StatusBadge value={`הכדור אצל: ${d.ballWith}`} tone="neutral" />}
        {isTestDispute(d) && <StatusBadge value="נתוני בדיקה" tone="neutral" />}
        <span className="text-[13px] text-muted-foreground">
          <CustomerLink code={d.customerCode} name={d.customerName} className="inline" /> · אחראית: {d.ownerBookkeeperName || '—'} · נפתח {formatDateTime(d.openedAt)}
          {d.closedAt ? ` · נסגר ${formatDateTime(d.closedAt)}` : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-stretch gap-[21px]">
        <AgentPanel
          agent="maya"
          className="min-w-[min(100%,520px)] flex-[1.618_1_0px]"
          subtitle={`פתחה את המקרה ${formatDateTime(d.openedAt)}${email ? ` מהמייל של ${email.fromName || email.fromAddress}` : ''}`}
          headline={headline}
          description={draftSentence}
        >
          <SourceEmail messageId={d.inboundEmailId} email={email} loading={emailQ.isLoading} />
          {isDocs && d.description && (
            <div className="text-[13px] text-muted-foreground">
              <Markdown value={d.description} />
            </div>
          )}
          <Button
            variant="ghost"
            className="h-10 gap-2 self-start rounded-[20px] bg-glass-card px-3 text-[13px] font-semibold text-ink-2 hover:bg-glass-inner"
            onClick={() => setAskOpen(true)}
          >
            <AgentAvatar size="sm" agent="maya" className="size-6" />
            שאל את {maya.name}
            <MessageCircleQuestionIcon data-icon="inline-end" />
          </Button>
        </AgentPanel>

        <aside aria-label="המספרים" className="glass glass-lift flex min-w-[min(100%,300px)] flex-[1_1_0px] flex-col gap-[13px] rounded-[26px] border p-[21px]">
          {isDocs ? (
            <>
              <span className="text-[13px] font-semibold text-muted-foreground">תעודות סרוקות</span>
              {docsLoading ? (
                <Skeleton className="my-2 h-12 w-24" />
              ) : (
                <span dir="ltr" className="self-end text-[44px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums md:text-[54px]">
                  {docCount.scanned}/{docCount.expected}
                </span>
              )}
              <Separator />
              <div className="grid grid-cols-3 gap-2">
                <Stat label="חסרות" value={formatNumber(docCount.expected - docCount.scanned)} loading={docsLoading} />
                <Stat label="תזכורות" value={formatNumber(d.reminderCount ?? 0)} />
                <Stat label="תזכורת הבאה" value={d.status === ESCALATED || d.status === CLOSED || d.status === ST_READY ? '—' : formatDateTime(d.nextReminderAt)} />
              </div>
              <Separator />
              <span className="text-xs text-muted-foreground">
                קו מוצר: {d.productLine || '—'} · לוגיסטיקה: {d.logisticsOwnerName || 'אין איש קשר רשום'}
                {d.logisticsOwnerEmail ? (
                  <>
                    {' '}
                    (<span dir="ltr">{d.logisticsOwnerEmail}</span>)
                  </>
                ) : null}
              </span>
            </>
          ) : (
            <>
              <span className="text-[13px] font-semibold text-muted-foreground">פער לזיכוי</span>
              {isPrice && gap.isLoading ? (
                <Skeleton className="my-2 h-12 w-32" />
              ) : (
                <span className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums md:text-[54px]">{formatILS(analysis?.totalGap ?? d.disputedAmount)}</span>
              )}
              <Separator />
              <div className="grid grid-cols-3 gap-2">
                <Stat label="סוכן" value={d.salesAgentName || '—'} />
                <Stat label="מנהל" value={d.salesManagerName || '—'} />
                <Stat label="שורות עם פער" value={formatNumber((analysis?.lines ?? []).filter((l) => l.reason).length)} loading={isPrice && gap.isLoading} />
              </div>
              <Separator />
              <span className="text-xs text-muted-foreground">חשבונית {invs.join(', ') || '—'}{analysis?.siteName ? ` · אתר ${analysis.siteName}` : ''}</span>
            </>
          )}
        </aside>
      </div>

      {isDocs && <DocumentsEvidence dispute={d} notes={notes} isLoading={docsLoading} isError={notesQ.isError} />}
      {isPrice && invs.length > 0 && (
        <section aria-label="שורות החשבונית" className="glass glass-lift flex flex-col gap-[13px] rounded-[26px] border p-[21px]">
          {invs.map((n) => (
            <InvoiceLinesLive key={n} invoiceNumber={n} title={invs.length > 1 ? `שורות חשבונית ${n}` : 'שורות החשבונית'} />
          ))}
        </section>
      )}
      {isPrice && (
        <PriceEvidence
          dispute={d}
          gap={{ data: analysis, isLoading: gap.isLoading, isError: gap.isError, isRefreshing: gap.isRefreshing }}
          onMarked={gap.refresh}
        />
      )}

      <CaseDrafts drafts={drafts} isLoading={draftsQ.isLoading} isError={draftsQ.isError} allowPrimary={!isPrice || d.status === ST_CREDIT || d.status === CLOSED} />

      <AskMayaSheet
        open={askOpen}
        onOpenChange={setAskOpen}
        screen="מסמכים ומחירים"
        chatKey={`dispute-${d.id}`}
        chip={`מקרה ${d.disputeNumber || d.id} · ${d.customerName || d.customerCode || ''}`}
        suggestions={isPrice ? PRICE_SUGGESTIONS : DOC_SUGGESTIONS}
        context={{
          disputeId: d.id,
          disputeNumber: d.disputeNumber ?? null,
          disputeType: d.disputeType ?? null,
          status: d.status ?? null,
          customerCode: d.customerCode ?? null,
          customerName: d.customerName ?? null,
          invoiceNumbers: d.invoiceNumbers ?? null,
          inboundEmailId: email?.id ?? null,
          messageId: d.inboundEmailId ?? null,
          scanCounter: isDocs ? `${docCount.scanned}/${docCount.expected}` : null,
          missingNoteNumbers: isDocs ? docCount.missing.join(', ') || null : null,
          totalGap: isPrice ? (analysis?.totalGap ?? d.disputedAmount ?? null) : null,
          pendingDraftIds: drafts.filter((a) => a.status === 'ממתין').map((a) => a.id),
        }}
      />
    </>
  );
}