import { useState } from 'react';
import { Link } from 'react-router';
import { getRouteUrl } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon } from 'lucide-react';
import { InvoicePopup } from '@/components/receipts/InvoicePopup';
import { cn } from '@/lib/utils';
import { SOURCE_LABEL, invoiceListOf, receiptLineIdOf, receiptRecordHref, sourceKindOf } from '@/utils/Tasks';
import type { Task } from '@/utils/Tasks';

const LINK = 'inline-flex items-center gap-1 text-[13px] font-semibold text-link underline-offset-2 hover:underline';

/**
 * "Open the source" of a task: the invoice window (in place), the mail panel, the draft, the receipt record, the
 * dispute case or the customer card. `receiptHref` resolves a bank line to its record (useReceiptLineLinks).
 */
export function TaskSourceLink({ task, receiptHref, className }: { task: Task; receiptHref: (id: string) => string | null; className?: string }) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const kind = sourceKindOf(task);
  const id = task.relatedId ?? '';
  const label = (
    <>
      {SOURCE_LABEL[kind]}
      <ArrowUpLeftIcon aria-hidden className="size-3.5" />
    </>
  );
  let to: string | null = null;
  if (kind === 'email') to = `/collections/inbox?email=${encodeURIComponent(id)}`;
  else if (kind === 'draft') to = `/collections/inbox?tab=outbox&status=all&draft=${encodeURIComponent(id)}`;
  else if (kind === 'dispute') to = getRouteUrl('collections/disputes/:disputeId', { disputeId: id });
  else if (kind === 'bankDay') to = '/collections/receipts';
  else if (kind === 'receipt') {
    const lineId = receiptLineIdOf(task);
    to = receiptRecordHref(task) ?? (lineId ? receiptHref(lineId) : null) ?? '/collections/receipts';
  }
  else if ((kind === 'customer' || kind === 'contact') && task.customerCode) to = getRouteUrl('collections/customers/:code', { code: task.customerCode });
  const first = invoiceListOf(task)[0];

  if (kind === 'invoice' && first) {
    return (
      <>
        <button
          type="button"
          onClick={() => setInvoiceOpen(true)}
          className={cn(LINK, 'cursor-pointer rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
        >
          {label}
        </button>
        {invoiceOpen && <InvoicePopup invoiceNumber={first} onClose={() => setInvoiceOpen(false)} />}
      </>
    );
  }
  if (to) {
    return (
      <Link to={to} className={cn(LINK, className)}>
        {label}
      </Link>
    );
  }
  return <span className={cn('text-[13px] text-muted-foreground', className)}>—</span>;
}