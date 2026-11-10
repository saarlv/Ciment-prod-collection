import { StatusBadge } from '@/components/StatusBadge';

/** Where an AgentSettings value comes from; an assumption is flagged until Yaniv confirms it. */
export function BasisBadge({ basis }: { basis?: string | null }) {
  if (basis === 'הנחה') return <StatusBadge value="הנחה – לאשר עם יניב" tone="warning" />;
  if (basis === 'החלטת יניב' || basis === 'ברירת מחדל' || basis === 'הוגדר במסך') return <StatusBadge value={basis} tone="neutral" />;
  return null;
}