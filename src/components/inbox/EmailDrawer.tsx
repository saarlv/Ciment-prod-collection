import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityWhereClause } from '@blocksdiy/blocks-client-sdk';
import { ArrowUpLeftIcon, BanIcon, CheckIcon, CornerDownLeftIcon, FileIcon, MessageCircleQuestionIcon, PhoneIcon, QuoteIcon } from 'lucide-react';
import { ApprovalsEntity, CollectionQueueEntity, DisputesEntity, EmailAttachmentsEntity } from '@/product-types';
import { AgentAvatar } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { StatusBadge } from '@/components/StatusBadge';
import { AskMayaSheet } from '@/components/inbox/AskMayaSheet';
import { DraftCard } from '@/components/inbox/DraftCard';
import { CaseLink, DocumentsSide, PanelSection, PriceSide, RemittanceSide } from '@/components/inbox/EmailEvidence';
import { HandlingButtons } from '@/components/inbox/HandlingControls';
import { DisputeChip, PromiseProposalCard, hasPendingProposal, hasProposal } from '@/components/inbox/PromiseProposal';
import { SlaRing } from '@/components/inbox/SlaRing';
import { InsuranceLinkCard, ManualTasksCard, SenderCard } from '@/components/inbox/SenderCards';
import { useInboxAgent } from '@/hooks/useInboxAgent';
import { useReceiptLineLinks } from '@/hooks/useReceiptLineLinks';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Markdown } from '@/components/ui/markdown';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { DOC_TYPE, PRICE_TYPE } from '@/utils/Disputes';
import type { Dispute } from '@/utils/Disputes';
import { formatDateTime, formatNumber } from '@/utils/Format';
import {
  CAT_DOCUMENTS,
  CAT_INSURANCE,
  CAT_PRICE,
  CAT_REMITTANCE,
  HANDLED,
  IRRELEVANT_CATEGORY,
  WAITING,
  draftsOfEmail,
  handlingOf,
  handlingTone,
  isIrrelevant,
  manualTasksOf,
  needsSenderCard,
  quotesOf,
  slaOf,
  typesOf,
  verificationTone,
} from '@/utils/Inbox';
import type { Approval, InboundEmail, QueueTask } from '@/utils/Inbox';

const OPEN_TASK = new Set(['ממתין', 'בטיפול']);

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold break-words">{children}</dd>
    </div>
  );
}

function kindOfFile(state?: string | null): 'done' | 'warning' | 'critical' | 'neutral' {
  if (state === 'חולץ') return 'done';
  if (state === 'דורש OCR' || state === 'ממתין') return 'warning';
  if (state === 'נכשל') return 'critical';
  return 'neutral';
}

/** The mail's files: name, kind, extraction state, and the extracted text in a collapsible. */
function Attachments({ email }: { email: InboundEmail }) {
  const q = useEntityGetAll(EmailAttachmentsEntity, { where: { column: 'inboundEmailId', value: email.id } });
  const rows = q.data ?? [];
  if (q.isLoading) return <Skeleton className="h-12 w-full rounded-[22px]" />;
  if (q.isError) return <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את הקבצים המצורפים.</p>;
  if (rows.length === 0)
    return <p className="text-[13px] text-muted-foreground">{email.attachmentNames ? `קבצים במייל: ${email.attachmentNames} (עוד לא ירדו)` : 'אין קבצים מצורפים.'}</p>;
  return (
    <Accordion className="flex flex-col gap-2">
      {rows.map((a) => (
        <AccordionItem key={a.id} value={a.id} className="glass-inner border-none px-[13px]">
          <AccordionTrigger className="gap-2 py-[13px] hover:no-underline">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span dir="ltr" className="truncate text-sm font-semibold">
                {a.fileName || 'קובץ'}
              </span>
              <StatusBadge value={a.fileKind ?? 'אחר'} tone="neutral" />
              <StatusBadge value={a.extractionState ?? 'ממתין'} tone={kindOfFile(a.extractionState)} />
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-2 pb-[13px]">
            {a.fileUrl && (
              <a href={a.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
                פתיחת הקובץ
                <ArrowUpLeftIcon className="size-3.5" />
              </a>
            )}
            {a.extractionError && <p className="text-[13px] text-muted-foreground">{a.extractionError}</p>}
            {a.extractedText ? (
              <pre dir="auto" className="max-h-72 overflow-auto rounded-[16px] bg-glass-card p-[13px] font-sans text-xs whitespace-pre-wrap">
                {a.extractedText}
              </pre>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {a.extractionState === 'דורש OCR' ? 'קובץ סרוק או תמונה: הטקסט לא חולץ (דורש OCR).' : 'לא חולץ טקסט מהקובץ.'}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

/** Thread: is it a reply, to which outbound message, and the record it belongs to. */
function ThreadInfo({ email }: { email: InboundEmail }) {
  const bankLine = email.linkedTable === 'BankLines' ? (email.linkedId ?? '') : '';
  const links = useReceiptLineLinks(bankLine ? [bankLine] : []);
  const link = (to: string, label: string) => (
    <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
      {label}
      <ArrowUpLeftIcon className="size-3.5" />
    </Link>
  );
  let record: ReactNode = null;
  if (email.linkedTable && email.linkedId) {
    if (email.linkedTable === 'Disputes') record = link(`/collections/disputes/${encodeURIComponent(email.linkedId)}`, 'למקרה');
    else if (email.linkedTable === 'BankLines') {
      const to = links.href(email.linkedId);
      record = to ? link(to, 'לרשומה בתקבולים') : null;
    }
    else if (email.linkedTable === 'InboundEmails') record = link(`/collections/inbox?tab=inbox&email=${encodeURIComponent(email.linkedId)}`, 'לפנייה המקורית');
    else if (email.linkedTable === 'MailAutomationRuns') record = link('/collections/inbox?tab=automations', 'להרצת האוטומציה');
  }
  if (!email.isThreadReply && !email.threadOf && !record) return <p className="text-[13px] text-muted-foreground">מייל חדש, לא תשובה בשרשור.</p>;
  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      {email.isThreadReply && (
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <CornerDownLeftIcon className="size-4 text-muted-foreground" />
          תשובה בשרשור קיים – לא נפתחה פנייה חדשה
        </span>
      )}
      <div className="flex flex-wrap items-center gap-x-[13px] gap-y-1">
        {email.threadOf && link(`/collections/inbox?tab=outbox&status=all&draft=${encodeURIComponent(email.threadOf)}`, 'להודעה היוצאת שעליה ענו')}
        {record}
      </div>
    </div>
  );
}

/** Maya's enrichment: types with quotes, customer and how, sender role, verification and its basis, and what code rejected. */
function Enrichment({ email, mayaName }: { email: InboundEmail; mayaName: string }) {
  const q = quotesOf(email.classificationQuotes);
  const types = typesOf(email);
  return (
    <div className="flex flex-col gap-[13px]">
      {email.agentSummary && (
        <div className="glass-inner p-[13px] text-sm">
          <Markdown value={email.agentSummary} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">סוגים {email.classifiedBy ? `· מיינה: ${email.classifiedBy}` : ''}</span>
        {types.length === 0 ? (
          <span className="text-[13px] text-muted-foreground">עוד לא מוין.</span>
        ) : (
          <>
          <DisputeChip email={email} />
          {types.map((t) => {
            const quote = q.types.find((x) => x.type === t);
            return (
              <div key={t} className="flex flex-col gap-1">
                <StatusBadge value={t} tone={t === IRRELEVANT_CATEGORY ? 'neutral' : 'active'} className="self-start" />
                {quote?.quote ? (
                  <blockquote dir="auto" className="flex gap-1.5 border-s-2 border-glass-edge ps-2 text-[13px] text-muted-foreground">
                    <QuoteIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {quote.quote}
                      {quote.verified === false && <span className="font-semibold text-critical-ink"> · הציטוט לא נמצא במייל</span>}
                    </span>
                  </blockquote>
                ) : (
                  <span className="text-xs text-muted-foreground">אין ציטוט שמור לסוג הזה.</span>
                )}
              </div>
            );
          })}
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-[13px]">
        <Meta label="לקוח">
          {email.customerCode ? <CustomerLink code={email.customerCode} name={email.customerName} showCode /> : 'לא זוהה'}
          {email.customerMatchMethod && <span className="block text-xs font-normal text-muted-foreground">זוהה לפי: {email.customerMatchMethod}</span>}
        </Meta>
        <Meta label="תפקיד השולח">{email.senderRole || '—'}</Meta>
        <Meta label="אימות">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <StatusBadge value={email.senderVerification ?? 'לא נבדק'} tone={verificationTone(email.senderVerification)} />
            {email.identifiedBy === 'חתימה' && <StatusBadge value="לפי חתימה" tone="neutral" />}
          </span>
        </Meta>
        <Meta label="אחראית">{email.assignedBookkeeperName || '—'}</Meta>
      </dl>
      <p className="text-[13px] text-muted-foreground">
        על מה האימות נשען: {email.verificationBasis || (email.senderVerification === 'מאומת' ? 'השולח רשום אצל הלקוח.' : 'הכתובת לא רשומה כאיש קשר או כסוכן מורשה של הלקוח.')}
        {' '}
        {mayaName} אף פעם לא קובעת אימות; הקוד בודק.
      </p>

      {q.candidates.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">מועמדי לקוח שהקוד מצא</span>
          <ul className="flex flex-col gap-1 text-[13px]">
            {q.candidates.map((c, i) => (
              <li key={`${c.customerCode}-${i}`} className="flex flex-wrap items-center gap-2">
                {c.customerCode === email.customerCode && <CheckIcon className="size-3.5 text-success-ink" />}
                <CustomerLink code={c.customerCode} name={c.customerName} className="inline" />
                <span className="text-xs text-muted-foreground">
                  {c.customerCode} · {c.method || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q.invoices.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">חשבוניות שהוזכרו</span>
          {q.invoices.map((inv, i) => (
            <div key={`${inv.invoiceNumber}-${i}`} className="flex flex-col gap-0.5 text-[13px]">
              <span className="flex flex-wrap items-center gap-2">
                <span dir="ltr" className="font-semibold tabular-nums">
                  {inv.invoiceNumber}
                </span>
                {inv.verified === false && <StatusBadge value="ציטוט לא אומת" tone="critical" />}
                {inv.belongsToCustomer === false && <StatusBadge value="לא של הלקוח" tone="critical" />}
              </span>
              {inv.quote && <span className="text-muted-foreground">״{inv.quote}״</span>}
            </div>
          ))}
        </div>
      )}

      {q.rejected.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-[18px] bg-critical-soft p-[13px] text-critical-ink">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold">
            <BanIcon className="size-3.5" />
            מה הקוד פסל ממה ש{mayaName} החזירה
          </span>
          <ul className="flex flex-col gap-1 text-[13px]">
            {q.rejected.map((r, i) => (
              <li key={i}>
                <span className="font-semibold">{r.field || 'שדה'}</span>
                {r.value ? ` "${r.value}"` : ''} – {r.reason || 'לא צוינה סיבה'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The panel content once the mail is known. */
function PanelBody({ email, now }: { email: InboundEmail; now: number }) {
  const maya = useInboxAgent();
  const [askOpen, setAskOpen] = useState(false);
  const types = typesOf(email);
  const irrelevant = isIrrelevant(email);
  const state = handlingOf(email);

  const disputeWhere: EntityWhereClause<typeof DisputesEntity>[] = [];
  if (email.messageId) disputeWhere.push({ column: 'inboundEmailId', value: email.messageId });
  if (email.linkedTable === 'Disputes' && email.linkedId) disputeWhere.push({ column: 'id', value: email.linkedId });
  const disputesQ = useEntityGetAll(DisputesEntity, { where: { or: disputeWhere } }, { enabled: disputeWhere.length > 0 });
  const disputes = (disputesQ.data ?? []) as Dispute[];
  const disputeIds = disputes.map((d) => d.id);

  const draftWhere: EntityWhereClause<typeof ApprovalsEntity>[] = [
    { and: [{ column: 'relatedTable', value: 'InboundEmails' }, { column: 'relatedId', value: email.id }] },
  ];
  if (email.messageId) draftWhere.push({ column: 'inboundEmailId', value: email.messageId });
  if (disputeIds.length) draftWhere.push({ and: [{ column: 'relatedTable', value: 'Disputes' }, { column: 'relatedId', operator: 'in', value: disputeIds }] });
  const draftsQ = useEntityGetAll(ApprovalsEntity, { where: { or: draftWhere }, orderBy: [{ column: 'draftedAt', direction: 'desc' }] });
  const drafts = draftsOfEmail((draftsQ.data ?? []) as Approval[], email, disputeIds);
  const firstPending = drafts.find((d) => d.status === 'ממתין')?.id;
  // One accent button per screen: a pending promise proposal takes it from the drafts.
  const proposalPending = hasPendingProposal(email);

  const tasksQ = useEntityGetAll(CollectionQueueEntity, {
    where: { and: [{ column: 'relatedTable', value: 'InboundEmails' }, { column: 'relatedId', value: email.id }] },
  });
  const tasks = ((tasksQ.data ?? []) as QueueTask[]).filter((t) => OPEN_TASK.has(t.status ?? ''));

  const docCases = disputes.filter((d) => d.disputeType === DOC_TYPE);
  const priceCases = disputes.filter((d) => d.disputeType === PRICE_TYPE);
  const caseLinks = disputes.length > 0;

  return (
    <>
      <SheetHeader className="flex flex-col gap-[13px] p-[21px] pe-12">
        <div className="flex flex-wrap items-center gap-2">
          <SlaRing sla={slaOf(email, now)} dueAt={email.dueAt} />
          <StatusBadge value={state} tone={handlingTone(state)} />
          {state === WAITING && email.waitingFor && <span className="text-[13px] font-semibold text-warning-ink">{email.waitingFor}</span>}
          {state === HANDLED && email.handledBy && (
            <span className="text-[13px] text-muted-foreground">
              {email.handledBy} · {formatDateTime(email.handledAt)}
            </span>
          )}
          {email.isTestFixture && <StatusBadge value="נתוני בדיקה" tone="neutral" />}
        </div>
        <SheetTitle className="text-lg leading-snug font-bold">{email.subject || 'ללא נושא'}</SheetTitle>
        <SheetDescription className="text-[13px]">
          {email.fromName ? `${email.fromName} · ` : ''}
          <span dir="ltr">{email.fromAddress}</span>
          {email.senderRole ? ` · ${email.senderRole}` : ''} · {formatDateTime(email.receivedAt)}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <HandlingButtons ids={[email.id]} current={state} waitingFor={email.waitingFor} size="sm" />
          <Button
            variant="ghost"
            className="h-9 gap-2 rounded-[20px] bg-glass-card px-3 text-[13px] font-semibold text-ink-2 hover:bg-glass-inner"
            onClick={() => setAskOpen(true)}
          >
            <AgentAvatar size="sm" agent="maya" className="size-6" />
            שאלי את {maya.name}
            <MessageCircleQuestionIcon data-icon="inline-end" />
          </Button>
          {caseLinks && disputes.map((d) => <CaseLink key={d.id} d={d} />)}
        </div>
      </SheetHeader>
      <Separator />

      <div className="grid gap-[21px] p-[21px] lg:grid-cols-2">
        {/* Right side (RTL start): the mail and Maya's enrichment */}
        <div className="flex min-w-0 flex-col gap-[21px]">
          <PanelSection title="המייל">
            <dl className="grid grid-cols-2 gap-[13px]">
              <Meta label="מאת">
                {email.fromName && <span>{email.fromName} </span>}
                <span dir="ltr" className="font-normal break-all">
                  {email.fromAddress || '—'}
                </span>
              </Meta>
              <Meta label="אל">
                <span dir="ltr" className="break-all">
                  {email.mailbox || '—'}
                </span>
                {email.mailboxOwnerName && <span className="font-normal text-muted-foreground"> · {email.mailboxOwnerName}</span>}
              </Meta>
              <Meta label="תאריך">{formatDateTime(email.receivedAt)}</Meta>
              <Meta label="נושא">{email.subject || '—'}</Meta>
            </dl>
            {irrelevant || email.bodyStored === false ? (
              <p className="glass-inner p-[13px] text-sm text-muted-foreground">הגוף לא נשמר – המייל סווג לא רלוונטי ונסגר אוטומטית.</p>
            ) : (
              <div dir="auto" className="glass-inner max-h-80 overflow-y-auto p-[13px] text-sm whitespace-pre-wrap">
                {email.bodyText || 'המייל הגיע בלי טקסט.'}
              </div>
            )}
          </PanelSection>
          {!irrelevant && (
            <PanelSection title="קבצים מצורפים">
              <Attachments email={email} />
            </PanelSection>
          )}
          <PanelSection title={`מה ${maya.name} והקוד מצאו`}>
            <Enrichment email={email} mayaName={maya.name} />
          </PanelSection>
          <PanelSection title="שרשור">
            <ThreadInfo email={email} />
          </PanelSection>
          {tasks.length > 0 && (
            <PanelSection title="משימות פתוחות">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2 text-[13px]">
                  <PhoneIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{t.taskType}</span>
                    <span>{t.reasons}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.assignedBookkeeperName ? `${t.assignedBookkeeperName} · ` : ''}
                      {t.dueAt ? `עד ${formatDateTime(t.dueAt)}` : ''}
                    </span>
                  </div>
                </div>
              ))}
              <Link to="/collections" className="text-xs font-semibold text-link hover:underline">
                למשימות במסך היום
              </Link>
            </PanelSection>
          )}
        </div>

        {/* Left side (RTL end): what the code prepared, by type */}
        <div className="flex min-w-0 flex-col gap-[21px]">
          {needsSenderCard(email) && (
            <PanelSection title="שולח לא מוכר">
              <SenderCard email={email} />
            </PanelSection>
          )}
          {(types.includes(CAT_INSURANCE) || email.linkedTable === 'CreditLimitRequests') && (
            <PanelSection title="אישור ביטוח אשראי">
              <InsuranceLinkCard email={email} />
            </PanelSection>
          )}
          {manualTasksOf(email.classificationQuotes).length > 0 && (
            <PanelSection title="טיפול ידני">
              <ManualTasksCard email={email} />
            </PanelSection>
          )}
          {hasProposal(email) && (
            <PanelSection title="הבטחת תשלום">
              <PromiseProposalCard email={email} />
            </PanelSection>
          )}
          {types.includes(CAT_DOCUMENTS) && (
            <PanelSection title="תעודות וחשבוניות חסרות">
              {disputesQ.isLoading ? <Skeleton className="h-28 w-full rounded-[22px]" /> : <DocumentsSide disputes={docCases} />}
            </PanelSection>
          )}
          {types.includes(CAT_PRICE) && (
            <PanelSection title="הפרש מחיר">
              {disputesQ.isLoading ? <Skeleton className="h-28 w-full rounded-[22px]" /> : <PriceSide disputes={priceCases} />}
            </PanelSection>
          )}
          {types.includes(CAT_REMITTANCE) && (
            <PanelSection title="פירוט תשלום · הרשומה בתקבולים">
              <RemittanceSide email={email} />
            </PanelSection>
          )}
          <PanelSection
            title={drafts.length > 1 ? `הטיוטות (${formatNumber(drafts.length)})` : 'הטיוטה'}
            aside={<span className="text-xs text-muted-foreground">שום דבר לא נשלח</span>}
          >
            {draftsQ.isError ? (
              <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את הטיוטות.</p>
            ) : draftsQ.isLoading ? (
              <Skeleton className="h-48 w-full rounded-[22px]" />
            ) : drafts.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {irrelevant
                  ? 'מייל לא רלוונטי: אין צורך במענה.'
                  : email.senderVerification === 'לא מאומת'
                    ? 'אין טיוטה עם מסמכים כי השולח לא מאומת. יש משימה "לאמת שולח"; אחרי אימות אפשר לענות.'
                    : !email.classifiedBy
                      ? `${maya.name} עוד לא מיינה את המייל. הטיוטה תופיע כאן כשתהיה מוכנה.`
                      : 'לא הוכנה טיוטה למייל הזה.'}
              </p>
            ) : (
              drafts.map((d) => <DraftCard key={`${d.id}:${d.status}:${d.subject ?? ''}:${d.body ?? ''}`} draft={d} primary={!proposalPending && d.id === firstPending} />)
            )}
          </PanelSection>
        </div>
      </div>

      <AskMayaSheet
        open={askOpen}
        onOpenChange={setAskOpen}
        context={{
          inboundEmailId: email.id,
          messageId: email.messageId ?? null,
          subject: email.subject ?? null,
          from: email.fromAddress ?? null,
          category: email.category ?? null,
          verification: email.senderVerification ?? null,
          customerCode: email.customerCode ?? null,
          customerName: email.customerName ?? null,
          draftApprovalId: firstPending ?? drafts[0]?.id ?? null,
          draftStatus: drafts[0]?.status ?? null,
          categories: types.join(', ') || null,
          handlingState: state,
          disputeIds,
        }}
      />
    </>
  );
}

/**
 * The mail panel (?email=<id>): the mail, its files and Maya's enrichment on the right; what the code prepared
 * by type (PDF and drafts, scan counter, price gap, receipts record) on the left. Nothing here sends anything.
 */
export function EmailDrawer({
  email,
  open,
  onOpenChange,
  isLoading,
  now,
}: {
  email?: InboundEmail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  now: number;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="glass-menu gap-0 overflow-y-auto data-[side=left]:w-full data-[side=left]:sm:max-w-[1180px]">
        {email ? (
          <PanelBody key={email.id} email={email} now={now} />
        ) : (
          <>
            <SheetHeader className="p-[21px] pe-12">
              <SheetTitle>{isLoading ? 'טוען את המייל…' : 'המייל לא נמצא'}</SheetTitle>
              <SheetDescription>{isLoading ? 'רגע אחד.' : 'ייתכן שהקישור ישן או שהמייל נמחק.'}</SheetDescription>
            </SheetHeader>
            {isLoading ? (
              <div className="flex flex-col gap-2 p-[21px]">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyTitle>אין מייל כזה</EmptyTitle>
                  <EmptyDescription>חזרו לדואר הנכנס ובחרו מייל מהרשימה.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}