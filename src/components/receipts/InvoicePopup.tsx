import { useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { FileQuestionIcon, FileTextIcon, ScanTextIcon } from 'lucide-react';
import { CustomerNotesEntity, InvoicesEntity, ReceiptAllocationsEntity, ReceiptsEntity } from '@/product-types';
import { PaymentStateCell } from '@/components/InvoiceLayer';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { ReceiptStatusBadges } from '@/components/receipts/ReceiptStatusBadges';
import { InvoiceLinesLive } from '@/components/receipts/InvoiceLinesLive';
import { CustomerPopupLink } from '@/components/receipts/CustomerPopup';
import { useElementWidth } from '@/hooks/useElementWidth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PdfViewer } from '@/components/ui/pdf-viewer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { noteTypeLabel } from '@/utils/AgingMonths';
import { bankFileKind, openableFileUrl } from '@/utils/BankFile';
import { EMPTY, PRIORITY_FORM_LABEL, daysOverdue, formatDate, formatDateTime, formatILS, formatMoney, formatNumber, isILS } from '@/utils/Format';

const HEAD = 'h-8 text-xs font-semibold text-muted-foreground';
const stop = (e: SyntheticEvent) => e.stopPropagation();

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', wide && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[13px] font-semibold text-ink-2">{children}</dd>
    </div>
  );
}

/** The invoice as it was sent: PDF in the viewer fitted to the column, an image as-is. */
function InvoiceSource({ url, invoiceNumber }: { url: string; invoiceNumber: string }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const kind = bankFileKind(url.split('?')[0], null);
  if (kind === 'image') {
    return (
      <div className="min-h-0 flex-1 overflow-auto rounded-[18px] bg-glass-card">
        <img src={openableFileUrl(url)} alt={`צילום חשבונית ${invoiceNumber}`} className="w-full" />
      </div>
    );
  }
  return (
    <div ref={ref} className="min-h-[420px] flex-1 overflow-hidden rounded-[18px] bg-glass-card">
      {width > 0 && <PdfViewer key={width} file={url} defaultWidth={Math.max(320, width - 24)} minWidth={280} />}
    </div>
  );
}

/**
 * One invoice in a large split pop-up: on the right what was pulled from Priority (header fields, the
 * lines, and the amount this proposal allocates to it), on the left the invoice as it was sent to the
 * customer. Read from Invoices / InvoiceLines filtered by invoiceNumber.
 */
export function InvoicePopup({
  invoiceNumber,
  allocatedAmount,
  customerLink = true,
  onClose,
}: {
  invoiceNumber: string;
  /** The amount the proposal on screen allocates to this invoice, when opened from a proposal. */
  allocatedAmount?: number | null;
  /** False when opened from the customer pop-up, so the customer is plain text there. */
  customerLink?: boolean;
  onClose: () => void;
}) {
  const invoices = useEntityGetAll(InvoicesEntity, { where: { column: 'invoiceNumber', value: invoiceNumber } });
  const inv = invoices.data?.[0];
  const allocations = useEntityGetAll(ReceiptAllocationsEntity, { where: { column: 'invoiceNumber', value: invoiceNumber } });
  const receiptKeys = [...new Set((allocations.data ?? []).map((a) => a.receiptKey ?? '').filter(Boolean))];
  const receipts = useEntityGetAll(ReceiptsEntity, { where: { column: 'receiptKey', operator: 'in', value: receiptKeys } }, { enabled: receiptKeys.length > 0 });
  const receiptOf = new Map((receipts.data ?? []).map((r) => [r.receiptKey ?? '', r]));
  const customerNotes = useEntityGetAll(
    CustomerNotesEntity,
    { where: { column: 'customerCode', value: inv?.customerCode ?? '' }, orderBy: [{ column: 'noteCreatedAt', direction: 'desc' }] },
    { enabled: !!inv?.customerCode },
  );
  // Notes are per customer and due month: the customer's notes on this invoice's due month, newest first.
  const dueMonth = inv?.dueMonth || (inv?.dueDate ?? '').slice(0, 7);
  const notes = dueMonth ? (customerNotes.data ?? []).filter((n) => n.dueMonth === dueMonth) : [];
  const overdue = daysOverdue(inv?.dueDate);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-menu flex h-[85vh] w-[92vw] max-w-[1200px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
        <DialogHeader className="border-b border-glass-edge px-[21px] py-[13px] pe-14">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-bold">
            <FileTextIcon className="size-5 text-muted-foreground" />
            {inv?.documentType ?? 'חשבונית'} <span dir="ltr">{invoiceNumber}</span>
            {inv?.status && <StatusBadge value={inv.status} />}
          </DialogTitle>
          <DialogDescription>
            {inv ? `${inv.customerName ?? inv.customerCode ?? ''} · ${formatMoney(inv.amount, inv.currencyCode)} · פירעון ${formatDate(inv.dueDate)}` : 'הנתונים שנשלפו מ-Priority לצד החשבונית כפי שנשלחה ללקוח.'}
          </DialogDescription>
        </DialogHeader>

        {invoices.isError ? (
          <div className="p-[21px]">
            <LoadError what="החשבונית" />
          </div>
        ) : invoices.isLoading ? (
          <LoadingRows rows={6} />
        ) : !inv ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia>
                <FileQuestionIcon />
              </EmptyMedia>
              <EmptyTitle>החשבונית לא נמצאה</EmptyTitle>
              <EmptyDescription>
                אין במערכת חשבונית שמספרה <span dir="ltr">{invoiceNumber}</span>. ייתכן שהיא עוד לא נטענה מ-Priority.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:overflow-hidden">
            <section aria-label="הנתונים שנשלפו" className="flex min-h-0 flex-col gap-[13px] p-[21px] lg:overflow-y-auto">
              <h3 className="text-sm font-bold">הנתונים שנשלפו</h3>
              {allocatedAmount != null && (
                <div className="flex items-baseline justify-between gap-2 rounded-[18px] bg-primary/10 px-[13px] py-2.5">
                  <span className="text-[13px] font-semibold text-link">בהתאמה הזו</span>
                  <span className="text-base font-extrabold text-link tabular-nums">{formatILS(allocatedAmount)}</span>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-[21px] gap-y-[13px] rounded-[18px] bg-glass-inner p-[13px]">
                <Fact label="מספר חשבונית">
                  <span dir="ltr">{inv.invoiceNumber}</span>
                </Fact>
                <Fact label="סוג מסמך">{inv.documentType ?? 'חשבונית'}</Fact>
                <Fact label="טופס">{PRIORITY_FORM_LABEL[inv.priorityForm ?? ''] ?? EMPTY}</Fact>
                <Fact label="מטבע">{isILS(inv.currencyCode) ? 'ש״ח' : inv.currencyCode}</Fact>
                <Fact label="לקוח" wide>
                  {customerLink ? (
                    <CustomerPopupLink code={inv.customerCode} name={inv.customerName} showCode />
                  ) : (
                    <span>
                      {inv.customerName ?? '—'} <span className="text-xs font-normal text-muted-foreground">{inv.customerCode}</span>
                    </span>
                  )}
                </Fact>
                <Fact label="תאריך חשבונית">{formatDate(inv.invoiceDate)}</Fact>
                <Fact label="תאריך פירעון">
                  {formatDate(inv.dueDate)}
                  {overdue && overdue > 0 && (inv.openAmount ?? 0) > 0 ? <span className="ms-1.5 text-xs font-semibold text-critical-ink">באיחור {formatNumber(overdue)} ימים</span> : null}
                </Fact>
                <Fact label="סכום">
                  <span className="tabular-nums">{formatMoney(inv.amount, inv.currencyCode)}</span>
                </Fact>
                <Fact label="יתרה פתוחה ב-Priority">
                  <span className="tabular-nums">{formatILS(inv.openAmount)}</span>
                </Fact>
                <Fact label="נשאר לתשלום">
                  <span className="tabular-nums">{formatILS(inv.remainingAmount ?? inv.openAmount)}</span>
                </Fact>
                <Fact label="מצב תשלום">{inv.paymentStatus ? <StatusBadge value={inv.paymentStatus} /> : '—'}</Fact>
                <Fact label="סטטוס ב-Priority">{inv.status ? <StatusBadge value={inv.status} /> : '—'}</Fact>
                <Fact label="סטטוס מסמך בפריוריטי">{inv.priorityDocStatus || EMPTY}</Fact>
                <Fact label="תאריך התאמה">{formatDate(inv.reconciledDate)}</Fact>
                {inv.paymentState && (
                  <Fact label="תשלום שראינו">
                    <PaymentStateCell inv={inv} />
                  </Fact>
                )}
                <Fact label="סוכן">{inv.salesAgentName || '—'}</Fact>
              </dl>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">הקבלות שהותאמו לחשבונית{(allocations.data ?? []).length ? ` (${(allocations.data ?? []).length})` : ''}</span>
                {allocations.isError ? (
                  <LoadError what="הקבלות של החשבונית" />
                ) : allocations.isLoading ? (
                  <LoadingRows rows={2} />
                ) : (allocations.data ?? []).length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">עוד לא הותאמה לחשבונית קבלה.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {(allocations.data ?? []).map((a) => {
                      const r = receiptOf.get(a.receiptKey ?? '');
                      return (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] bg-glass-inner px-[13px] py-2">
                          <span className="flex min-w-0 flex-col">
                            <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                              <span dir="ltr">{a.receiptKey}</span>
                              {r ? <ReceiptStatusBadges receipt={r} size="sm" /> : <StatusBadge value={a.status} className="h-5 text-[11px]" />}
                              {a.kind && <StatusBadge value={a.kind} className="h-5 text-[11px]" />}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ערך {formatDate(r?.valueDate)}
                              {r?.priorityReceiptNumber ? ` · Priority ${r.priorityReceiptNumber}` : ''}
                              {a.source ? ` · ${a.source}` : ''}
                            </span>
                          </span>
                          <span className="font-bold tabular-nums">{formatILS(a.amount)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">הערות על חודש הפירעון{notes.length ? ` (${notes.length})` : ''}</span>
                {customerNotes.isError ? (
                  <LoadError what="ההערות" />
                ) : customerNotes.isLoading ? (
                  <LoadingRows rows={2} />
                ) : notes.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">אין עדיין הערה על חודש הפירעון של החשבונית.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {notes.map((n) => {
                      const facts = [n.actionDate ? formatDate(n.actionDate) : null, n.amount ? formatILS(n.amount) : null].filter(Boolean);
                      return (
                        <li key={n.id} className="flex flex-col gap-0.5 rounded-[16px] bg-glass-inner px-[13px] py-2">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-ink-2">{noteTypeLabel(n)}</span>
                            {facts.length > 0 && <span className="text-xs font-semibold text-ink-2 tabular-nums">{facts.join(' · ')}</span>}
                            {n.status && n.status !== 'פעילה' && <StatusBadge value={n.status} tone="neutral" className="h-5" />}
                          </span>
                          {n.noteText && <span className="text-[13px] text-ink-2">{n.noteText}</span>}
                          <span className="text-[11px] text-muted-foreground">
                            {n.authorName || '—'} · {formatDateTime(n.noteCreatedAt)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <InvoiceLinesLive invoiceNumber={invoiceNumber} />
            </section>

            <section aria-label="המקור" className="flex min-h-[480px] flex-col gap-2 border-glass-edge p-[13px] lg:min-h-0 lg:border-s">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="flex items-center gap-1.5 text-sm font-bold">
                  <ScanTextIcon className="size-4 text-muted-foreground" />
                  המקור
                </h3>
              </div>
              {inv.sourceDocUrl ? (
                <InvoiceSource url={inv.sourceDocUrl} invoiceNumber={invoiceNumber} />
              ) : (
                <Empty className="flex-1 rounded-[18px] bg-glass-faint py-12">
                  <EmptyHeader>
                    <EmptyMedia>
                      <FileQuestionIcon />
                    </EmptyMedia>
                    <EmptyTitle>צילום החשבונית עוד לא הגיע מ-Priority</EmptyTitle>
                    <EmptyDescription>כשהצילום של החשבונית שנשלחה ללקוח יגיע, הוא יוצג כאן ליד הנתונים.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** An invoice number that opens its pop-up. Safe inside clickable rows: the click stays here. */
export function InvoiceNumberLink({
  invoiceNumber,
  allocatedAmount,
  customerLink,
  className,
  children,
}: {
  invoiceNumber?: string | null;
  allocatedAmount?: number | null;
  customerLink?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!invoiceNumber) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="contents" onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        dir="ltr"
        title={`פתיחת חשבונית ${invoiceNumber}`}
        onClick={() => setOpen(true)}
        className={cn('cursor-pointer rounded-[6px] font-semibold text-link tabular-nums underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring', className)}
      >
        {children ?? invoiceNumber}
      </button>
      {open && <InvoicePopup invoiceNumber={invoiceNumber} allocatedAmount={allocatedAmount} customerLink={customerLink} onClose={() => setOpen(false)} />}
    </span>
  );
}