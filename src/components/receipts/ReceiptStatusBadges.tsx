import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import { matchStatusOf, receiptStatusOf } from '@/utils/ReceiptRecord';
import type { ReceiptStatusSource } from '@/utils/ReceiptRecord';

const SMALL = 'h-5 px-2 text-[11px]';

/**
 * A receipt's two states side by side, the same everywhere a receipt is listed: its status (טיוטה – ממתינה לאישור /
 * אושרה – לא נשלחה / הונפקה ב-Priority) and its allocation (פיזור מוצע – לאישור / על חשבון – צריך פיזור / מפוזרת /
 * מפוזרת – עודף על חשבון). Read through receiptStatusOf / matchStatusOf. Renders nothing when the receipt has neither.
 */
export function ReceiptStatusBadges({ receipt, size = 'md', className }: { receipt?: ReceiptStatusSource | null; size?: 'sm' | 'md'; className?: string }) {
  const rs = receiptStatusOf(receipt);
  const ms = matchStatusOf(receipt);
  if (!rs && !ms) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {rs && (
        <span title="סטטוס הקבלה" className="inline-flex">
          <StatusBadge value={rs} className={size === 'sm' ? SMALL : undefined} />
        </span>
      )}
      {ms && (
        <span title="סטטוס הפיזור" className="inline-flex">
          <StatusBadge value={ms} className={size === 'sm' ? SMALL : undefined} />
        </span>
      )}
    </span>
  );
}