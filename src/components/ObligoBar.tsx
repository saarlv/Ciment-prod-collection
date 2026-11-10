import type { CSSProperties } from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatPct } from '@/utils/Format';

/**
 * Obligo usage bar: calm blue under the threshold (80% by default), amber from the threshold to 100%,
 * red over the limit. With `showThreshold`, a thin mark on the track shows where the threshold sits.
 */
export function ObligoBar({
  pct,
  threshold = 80,
  showThreshold = false,
  className,
}: {
  pct?: number | null;
  threshold?: number;
  showThreshold?: boolean;
  className?: string;
}) {
  const value = pct ?? 0;
  const tone =
    value > 100
      ? '[&_[data-slot=progress-indicator]]:bg-destructive'
      : value >= threshold
        ? '[&_[data-slot=progress-indicator]]:bg-warning'
        : '[&_[data-slot=progress-indicator]]:bg-aging-4';
  const mark = Math.min(Math.max(threshold, 0), 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex-1">
        <Progress value={Math.min(value, 100)} className={tone} aria-label={`ניצול ${formatPct(pct)}`} />
        {showThreshold && (
          <span
            aria-hidden
            title={`סף ${formatPct(threshold)}`}
            style={{ '--obligo-mark': `${mark}%` } as CSSProperties}
            className="absolute start-(--obligo-mark) -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground/60 rtl:translate-x-1/2"
          />
        )}
      </div>
      <span
        className={cn(
          'w-10 text-end text-xs tabular-nums',
          value > 100 ? 'font-semibold text-destructive' : 'text-muted-foreground',
        )}
      >
        {pct === undefined || pct === null ? '—' : formatPct(pct)}
      </span>
    </div>
  );
}