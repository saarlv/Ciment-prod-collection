import { isInvoiceClosed } from '@/utils/InvoiceSubStatus';
import { useState } from 'react';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { InvoicesEntity } from '@/product-types';
import { Link } from 'react-router';
import { ArrowUpLeftIcon, InfoIcon, ReceiptIcon } from 'lucide-react';
import { AgentAvatar } from '@/components/AgentPanel';
import { InvoiceNumberLink } from '@/components/receipts/InvoicePopup';
import { StatusBadge } from '@/components/StatusBadge';
import { ReceiptStatusBadges } from '@/components/receipts/ReceiptStatusBadges';
import { useReceiptLineLinks } from '@/hooks/useReceiptLineLinks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ClosingReceipt, Customer360Invoice, Customer360Receipt } from '@/utils/CollectionsTypes';
import { formatDate, formatILS } from '@/utils/Format';

const OURS = 'שלנו';
const ESTIMATE_HINT = 'קבלה של Priority על כמה חשבוניות, מחולקת מהוותיקה לחדשה';

function ReceiptLink({ bankLineId, href }: { bankLineId?: string | null; href: (id: string) => string | null }) {
  const to = bankLineId ? href(bankLineId) : null;
  if (!to) return null;
  return (
    <Link to={to}className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
      לרשומה בתקבולים
      <ArrowUpLeftIcon className="size-3.5" />
    </Link>
  );
}

function EstimateMark() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`הערכה: ${ESTIMATE_HINT}`}
            className="inline-flex h-5 cursor-help items-center gap-1 rounded-full bg-warning-soft px-2 text-[11px] font-semibold text-warning-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <InfoIcon className="size-3" />
        הערכה
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-start">{ESTIMATE_HINT}</TooltipContent>
    </Tooltip>
  );
}

function ClosingReceiptRow({ r, href }: { r: ClosingReceipt; href: (id: string) => string | null }) {
  const ours = r.source === OURS;
  const number = ours ? r.receiptKey : r.priorityReceiptNumber || r.paymentRef;
  return (
    <li className="flex flex-col gap-1 rounded-[18px] bg-glass-card px-[13px] py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={ours ? 'h-5 rounded-full border-transparent bg-primary/12 px-2 text-[11px] font-semibold text-link' : 'h-5 rounded-full border-transparent bg-glass-inner px-2 text-[11px] font-semibold text-muted-foreground'}
        >
          {ours ? 'קבלה שלנו' : 'Priority'}
        </Badge>
        <span dir="ltr" className="text-[13px] font-bold">
          {number || '—'}
        </span>
        {r.isEstimate && <EstimateMark />}
        <span className="ms-auto text-sm font-bold tabular-nums">{formatILS(r.amount)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-[13px] gap-y-1 text-xs text-muted-foreground">
        <span>{formatDate(r.date)}</span>
        {r.method && <span>{r.method}</span>}
        {ours && r.priorityReceiptNumber && (
          <span>
            ב-Priority{' '}
            <span dir="ltr" className="font-semibold text-ink-2">
              {r.priorityReceiptNumber}
            </span>
          </span>
        )}
        {ours ? <ReceiptStatusBadges receipt={r} size="sm" /> : r.status && <StatusBadge value={r.status} className="h-5 text-[11px]" />}
        {ours && <ReceiptLink bankLineId={r.bankLineId} href={href} />}
      </div>
    </li>
  );
}

type DocMeta = { documentType?: string; salesAgentName?: string };

function ClosedInvoiceItem({ inv, href, meta }: { inv: Customer360Invoice; href: (id: string) => string | null; meta?: DocMeta }) {
  const receipts = inv.closingReceipts ?? [];
  return (
    <li className="grid gap-[13px] rounded-[22px] bg-glass-inner p-[13px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.618fr)]">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <InvoiceNumberLink invoiceNumber={inv.invoiceNumber} customerLink={false} />
          <StatusBadge value="שולמה" tone="done" className="h-5 text-[11px]" />
        </span>
        <span className="text-[22px] leading-tight font-extrabold tabular-nums">{formatILS(inv.amount)}</span>
        <dl className="grid grid-cols-2 gap-x-[13px] gap-y-1 text-xs">
          <dt className="text-muted-foreground">נסגרה</dt>
          <dd className="font-semibold">{formatDate(inv.closedAt)}</dd>
          <dt className="text-muted-foreground">פירעון</dt>
          <dd className="font-semibold">{formatDate(inv.dueDate)}</dd>
          <dt className="text-muted-foreground">תאריך חשבונית</dt>
          <dd className="font-semibold">{formatDate(inv.invoiceDate)}</dd>
          <dt className="text-muted-foreground">סוג מסמך</dt>
          <dd className="font-semibold">{meta?.documentType || '—'}</dd>
          <dt className="text-muted-foreground">סוכן</dt>
          <dd className="font-semibold">{meta?.salesAgentName || '—'}</dd>
        </dl>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">
          {receipts.length === 0 ? 'הקבלות שסגרו אותה' : receipts.length === 1 ? 'הקבלה שסגרה אותה' : `${receipts.length} הקבלות שסגרו אותה`}
        </span>
        {receipts.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {receipts.map((r, i) => (
              <ClosingReceiptRow key={`${r.receiptKey ?? r.paymentId ?? r.paymentRef ?? 'r'}-${i}`} r={r} href={href} />
            ))}
          </ul>
        )}
        {inv.closedWithoutReceipt && (
          <p className="rounded-[18px] bg-glass-card px-[13px] py-2 text-[13px] text-ink-2">
            נסגרה בלי קבלה (זיכוי או מחיקה)
            {receipts.length > 0 && <span className="text-muted-foreground tabular-nums"> · קבלות על {formatILS(inv.closingReceiptsTotal)} מתוך {formatILS(inv.amount)}</span>}
          </p>
        )}
        {receipts.length === 0 && !inv.closedWithoutReceipt && <p className="text-[13px] text-muted-foreground">לא נמצאה קבלה שסגרה אותה.</p>}
      </div>
    </li>
  );
}

const RECEIPTS_SHOWN = 5;

/** "שילם על: X, Y (חלקית)" and "לא שולם: א, ב · סה״כ …" for one receipt (Design 01 §2ד). */
function ReceiptCoverage({ r }: { r: Customer360Receipt }) {
  const covered = (r.covered ?? []).filter((c) => c.invoiceNumber);
  const open = (r.stillOpen ?? []).filter((o) => o.invoiceNumber);
  return (
    <div className="flex w-full flex-col gap-0.5 text-[13px]">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="text-muted-foreground">שילם על:</span>
        {covered.length === 0 ? (
          <span className="text-ink-2">עוד לא פוזרה לחשבוניות</span>
        ) : (
          covered.map((c, i) => (
            <span key={`${c.invoiceNumber}-${i}`} className="inline-flex items-center gap-1">
              <InvoiceNumberLink invoiceNumber={c.invoiceNumber} allocatedAmount={c.amount} customerLink={false} />
              {c.isPartial && <span className="text-xs font-semibold text-warning-ink">(חלקית)</span>}
              {i < covered.length - 1 && <span className="text-muted-foreground">,</span>}
            </span>
          ))
        )}
      </p>
      {open.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-muted-foreground">לא שולם:</span>
          {open.map((o, i) => (
            <span key={`${o.invoiceNumber}-${i}`} className="inline-flex items-center gap-1">
              <InvoiceNumberLink invoiceNumber={o.invoiceNumber} customerLink={false} />
              {i < open.length - 1 && <span className="text-muted-foreground">,</span>}
            </span>
          ))}
          <span className="font-semibold tabular-nums">· סה״כ {formatILS(r.stillOpenTotal ?? open.reduce((t, o) => t + (o.openAmount ?? 0), 0))}</span>
        </p>
      )}
    </div>
  );
}

/** The customer's receipts, newest first: what each paid, what is still open, and any amount left on account. */
function CustomerReceipts({ receipts, href }: { receipts: Customer360Receipt[]; href: (id: string) => string | null }) {
  const [all, setAll] = useState(false);
  const shown = all ? receipts : receipts.slice(0, RECEIPTS_SHOWN);
  return (
    <section aria-label="הקבלות של הלקוח" className="flex flex-col gap-1.5 rounded-[22px] bg-glass-strong p-[13px] shadow-glass-pill">
      <h3 className="text-sm font-bold">קבלות</h3>
      <ul className="flex flex-col gap-1.5">
        {shown.map((r) => (
          <li key={r.receiptKey} className="flex flex-wrap items-center gap-x-[13px] gap-y-1 rounded-[18px] bg-glass-card px-[13px] py-2 text-[13px]">
            <ReceiptIcon className="size-4 text-muted-foreground" />
            <span dir="ltr" className="font-bold">
              {r.receiptKey}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(r.valueDate)} · קבלה של {formatILS(r.amount)}
            </span>
            <ReceiptStatusBadges receipt={r} size="sm" />
            <ReceiptLink bankLineId={r.bankLineId} href={href} />
            {(r.unallocatedAmount ?? 0) > 0 && <span className="ms-auto font-bold tabular-nums">{formatILS(r.unallocatedAmount)} על חשבון</span>}
            <ReceiptCoverage r={r} />
          </li>
        ))}
      </ul>
      {receipts.length > RECEIPTS_SHOWN && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((v) => !v)}>
          {all ? 'פחות קבלות' : `כל הקבלות (${receipts.length})`}
        </Button>
      )}
    </section>
  );
}

/**
 * The customer card's סגורות tab: the customer's receipts on top (what each paid, what is still open, on account), then every closed invoice
 * (newest closing first) with the receipts that closed it, as GetCustomer360 matched them by the promise engine's rule.
 */
export function CustomerClosedInvoices({
  customerCode,
  invoices,
  receipts,
}: {
  customerCode: string;
  invoices: Customer360Invoice[];
  receipts: Customer360Receipt[];
}) {
  // GetCustomer360 does not carry the document type or agent; read them off the customer's Invoices mirror rows.
  const docs = useEntityGetAll(InvoicesEntity, { where: { column: 'customerCode', value: customerCode }, page: { size: 1000 } });
  const metaOf = new Map((docs.data ?? []).map((d) => [d.invoiceNumber ?? '', { documentType: d.documentType, salesAgentName: d.salesAgentName }]));
  const closed = invoices
    .filter(isInvoiceClosed)
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '') || (b.dueDate ?? '').localeCompare(a.dueDate ?? ''));
  const href = useReceiptLineLinks([...closed.flatMap((i) => (i.closingReceipts ?? []).map((r) => r.bankLineId)), ...receipts.map((r) => r.bankLineId)]).href;

  if (closed.length === 0 && receipts.length === 0)
    return (
      <Empty className="pb-[21px]">
        <EmptyHeader>
          <EmptyMedia>
            <AgentAvatar agent="nina" />
          </EmptyMedia>
          <EmptyTitle>אין עדיין חשבוניות סגורות</EmptyTitle>
          <EmptyDescription>חשבונית שנסגרת בקבלה תופיע כאן, יחד עם הקבלה שסגרה אותה.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-[13px] px-[13px] pb-[21px] md:px-[21px]">
      {receipts.length > 0 && <CustomerReceipts receipts={receipts} href={href} />}
      {closed.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">אין עדיין חשבוניות סגורות.</p>
      ) : (
        <ul className="flex flex-col gap-[13px]">
          {closed.map((inv) => (
            <ClosedInvoiceItem key={inv.invoiceNumber} inv={inv} href={href} meta={metaOf.get(inv.invoiceNumber ?? '')} />
          ))}
        </ul>
      )}
    </div>
  );
}