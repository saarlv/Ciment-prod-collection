import { CheckIcon, MinusIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/Format';
import type { SlaState } from '@/utils/Inbox';

const R = 14;
const C = 2 * Math.PI * R;

const TONE_INK: Record<SlaState['tone'], string> = {
  ok: 'text-ink-2',
  warning: 'text-warning-ink',
  critical: 'text-critical-ink',
  done: 'text-success-ink',
  none: 'text-muted-foreground',
};

/**
 * The 24-hour reply ring: fills as the reply window passes (amber under 6 hours, red once overdue),
 * and turns into a green check when the reply was approved or the email is irrelevant.
 */
export function SlaRing({ sla, dueAt, showLabel = true, className }: { sla: SlaState; dueAt?: string | null; showLabel?: boolean; className?: string }) {
  const hoursLeft = Math.max(0, Math.ceil(sla.leftMs / 3_600_000));
  const ring =
    sla.tone === 'done' ? (
      <span className="flex size-[34px] items-center justify-center rounded-full bg-success-soft text-success-ink">
        <CheckIcon className="size-4" />
      </span>
    ) : sla.tone === 'none' ? (
      <span className="flex size-[34px] items-center justify-center rounded-full bg-glass-inner text-muted-foreground">
        <MinusIcon className="size-4" />
      </span>
    ) : (
      <span className={cn('relative flex size-[34px] items-center justify-center', TONE_INK[sla.tone])}>
        <svg viewBox="0 0 34 34" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="17" cy="17" r={R} fill="none" strokeWidth="3.5" className="stroke-glass-edge" />
          <circle
            cx="17"
            cy="17"
            r={R}
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - sla.elapsed)}
          />
        </svg>
        <span className="text-[11px] font-bold tabular-nums">{sla.tone === 'critical' ? '!' : hoursLeft}</span>
      </span>
    );

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn('inline-flex items-center gap-2', className)} />}
        aria-label={`${sla.label}${dueAt ? `, מועד מענה ${formatDateTime(dueAt)}` : ''}`}
      >
        {ring}
        {showLabel && <span className={cn('text-xs font-semibold whitespace-nowrap tabular-nums', TONE_INK[sla.tone])}>{sla.label}</span>}
      </TooltipTrigger>
      <TooltipContent>{dueAt ? `מועד מענה: ${formatDateTime(dueAt)}` : 'אין מועד מענה'}</TooltipContent>
    </Tooltip>
  );
}