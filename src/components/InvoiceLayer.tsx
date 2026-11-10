import { StatusBadge } from '@/components/StatusBadge';
import { formatDayMonth, formatILS, israelDateOf } from '@/utils/Format';

/** The payment fields our invoice layer keeps on an invoice, plus Priority's own status. */
export interface InvoicePaymentFields {
  paymentState?: string | null;
  paidSeenAmount?: number | null;
  paidSeenAt?: string | null;
  paidPriorityDoneAt?: string | null;
  status?: string | null;
}

/** "12.10" from a datetime (Israel day) or a date. */
function dayOf(value?: string | null): string {
  if (!value) return '—';
  return formatDayMonth(value.length > 10 ? israelDateOf(value) : value);
}

/**
 * What we know about the invoice's payment: "נראה תשלום · 12.10 · 12,000 ₪" (an approved match, not yet in
 * Priority), "נקלט ב-Priority", or Priority's own status.
 */
export function PaymentStateCell({ inv }: { inv: InvoicePaymentFields }) {
  if (inv.paymentState === 'נראה תשלום')
    return (
      <span className="inline-flex flex-wrap items-center gap-1 rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-link tabular-nums">
        נראה תשלום · {dayOf(inv.paidSeenAt)} · {formatILS(inv.paidSeenAmount)}
      </span>
    );
  if (inv.paymentState === 'נקלט ב-Priority')
    return (
      <span className="flex flex-col items-start gap-0.5">
        <StatusBadge value="נקלט ב-Priority" tone="done" />
        {inv.paidPriorityDoneAt && <span className="text-[11px] text-muted-foreground">סומן {dayOf(inv.paidPriorityDoneAt)}</span>}
      </span>
    );
  return <StatusBadge value={inv.status} />;
}