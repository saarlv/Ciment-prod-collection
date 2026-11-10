import { useState } from 'react';
import { SplitIcon } from 'lucide-react';
import { AllocationEditor, DebtCheckChip } from '@/components/receipts/SplitEditor';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatILS } from '@/utils/Format';

/** The receipt fields the strip reads — a Receipts row or GetReceiptRecord's receipt. */
export interface AllocationSource {
  receiptKey?: string | null;
  customerName?: string | null;
  amount?: number | null;
  allocatedAmount?: number | null;
  unallocatedAmount?: number | null;
  debtCheckResult?: string | null;
  debtCheckMonths?: string | null;
}

/**
 * On an approved receipt (Design 01 §2ד): the debt check's result with the months it closed, what is allocated and
 * what is still on account, and "פיזור לחשבוניות" opening the allocation editor. The match chip itself is shown by
 * ReceiptStatusBadges beside it, so it is not repeated here.
 */
export function AllocationSummary({ receipt, onChanged, className }: { receipt: AllocationSource; onChanged?: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const key = receipt.receiptKey ?? '';
  if (!key) return null;
  const amount = Number(receipt.amount ?? 0);
  const allocated = Number(receipt.allocatedAmount ?? 0);
  const onAccount = receipt.unallocatedAmount != null ? Number(receipt.unallocatedAmount) : Math.max(0, amount - allocated);
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <DebtCheckChip result={receipt.debtCheckResult} months={receipt.debtCheckMonths} />
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          מפוזר <span className="font-semibold text-ink-2 tabular-nums">{formatILS(allocated)}</span>
        </span>
        <span>
          על חשבון <span className="font-semibold text-ink-2 tabular-nums">{formatILS(onAccount)}</span>
        </span>
        <Button variant="ghost" size="xs" className="rounded-full bg-glass-soft" onClick={() => setOpen(true)}>
          <SplitIcon data-icon="inline-start" />
          פיזור לחשבוניות
        </Button>
      </span>
      <AllocationEditor
        receiptKey={key}
        title={[receipt.customerName, amount ? formatILS(amount) : null].filter(Boolean).join(' · ')}
        open={open}
        onOpenChange={setOpen}
        onApplied={onChanged}
      />
    </div>
  );
}