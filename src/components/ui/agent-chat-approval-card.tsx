import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import * as React from 'react';
import { stringify } from 'yaml';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Mirrors `ApprovalCardView` from `@blocksdiy/react-common/new-agent-chat`. Declared
 * here, not imported: an installed copy must type-check against the react-common it
 * runs with, which may predate tool approvals.
 */
export interface ToolApprovalCardView {
  key: string;
  title: string;
  /** The tool input as given. */
  args: Record<string, unknown>;
  status: 'waiting' | 'approved' | 'rejected';
  statusLine: string;
  request: { interruptId: string; index: number } | null;
  /** Decided here but not sent yet (another card of the pause is open). Absent on older react-common copies. */
  waitingForOthers?: boolean;
}

export function ToolApprovalCard({
  card,
  disabled = false,
  approveDisabled = false,
  onDecide,
  renderDetails,
  summary,
  trailing,
  className,
}: {
  card: ToolApprovalCardView;
  disabled?: boolean;
  /** Disables Approve only (Reject stays available). */
  approveDisabled?: boolean;
  renderDetails?: (value: Record<string, unknown>) => React.ReactNode;
  onDecide?: (decision: 'approve' | 'reject') => Promise<void>;
  /** A waiting card's whole body: the title, this, then the buttons under it. */
  summary?: React.ReactNode;
  /** Appended to the end of the decided one-line state. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const [submitting, setSubmitting] = React.useState<
    'approve' | 'reject' | null
  >(null);
  const decidable = card.request !== null && Boolean(onDecide);
  const locked = !decidable || disabled || submitting !== null;
  const rejectChosen = card.status === 'rejected' || submitting === 'reject';
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const args = card.args;
  const hasArgs = Object.keys(args).length > 0;

  const decide = async (decision: 'approve' | 'reject') => {
    if (!onDecide) {
      return;
    }
    setSubmitting(decision);
    try {
      await onDecide(decision);
    } catch {
      // The card stays decidable; the chat surfaces the run error.
    } finally {
      setSubmitting(null);
    }
  };

  const detailsToggle = hasArgs ? (
    <button
      type="button"
      aria-expanded={detailsOpen}
      onClick={() => setDetailsOpen((open) => !open)}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
    >
      {detailsOpen ? 'Hide details' : 'Show details'}
      {detailsOpen ? (
        <ChevronDown className="size-3.5" />
      ) : (
        <ChevronRight className="size-3.5 rtl:rotate-180" />
      )}
    </button>
  ) : null;
  const details =
    hasArgs && detailsOpen ? (
      <div className="mt-2">
        {renderDetails ? (
          renderDetails(args)
        ) : (
          <pre className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap">
            {stringify(args, { lineWidth: 0 })}
          </pre>
        )}
      </div>
    ) : null;

  if (card.status !== 'waiting') {
    // "Approved · waiting for your decision…" → "Approved · <title> · waiting for…"
    const [statusLabel, ...statusRest] = card.statusLine.split(' · ');
    return (
      <div
        data-slot="tool-approval-card"
        data-status={card.status}
        className={cn('w-full text-sm text-muted-foreground', className)}
      >
        <div
          aria-live="polite"
          className="flex flex-wrap items-baseline gap-x-1.5"
        >
          {card.status === 'approved' ? (
            <Check className="size-3.5 shrink-0 self-center text-success" />
          ) : (
            <X className="size-3.5 shrink-0 self-center text-destructive" />
          )}
          <span className="min-w-0 break-words">
            {[statusLabel, card.title, ...statusRest].join(' · ')}
          </span>
          {detailsToggle ? (
            <span className="text-xs">
              <span aria-hidden="true">· </span>
              {detailsToggle}
            </span>
          ) : null}
          {trailing ? (
            <span className="text-xs">
              <span aria-hidden="true">· </span>
              {trailing}
            </span>
          ) : null}
        </div>
        {details}
      </div>
    );
  }

  const actions = (
    <div className="ms-auto flex shrink-0 gap-2">
      <Button
        type="button"
        size="sm"
        variant={rejectChosen ? 'default' : 'outline'}
        disabled={locked}
        onClick={() => void decide('reject')}
      >
        Reject
      </Button>
      <Button
        type="button"
        size="sm"
        variant={rejectChosen ? 'outline' : 'default'}
        disabled={locked || approveDisabled}
        onClick={() => void decide('approve')}
      >
        Approve
      </Button>
    </div>
  );
  const boxClassName = cn(
    'w-full rounded-lg border bg-card px-3 py-2.5 text-card-foreground',
    className,
  );

  // The summary IS the request: title, summary, then the buttons under it. No status line
  // (kept for screen readers). Details only when the caller renders them: a summary that is
  // itself the whole request would just be repeated.
  if (summary) {
    return (
      <div
        data-slot="tool-approval-card"
        data-status={card.status}
        className={boxClassName}
      >
        <p dir="auto" className="text-sm font-medium break-words">
          {card.title}
        </p>
        <span className="sr-only" aria-live="polite">
          {card.statusLine}
        </span>
        <div className="mt-1.5">{summary}</div>
        {renderDetails ? details : null}
        <div className="mt-3 flex items-center gap-2">
          {renderDetails && detailsToggle ? (
            <span className="text-xs">{detailsToggle}</span>
          ) : null}
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div
      data-slot="tool-approval-card"
      data-status={card.status}
      className={boxClassName}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[8rem] flex-1">
          <p dir="auto" className="text-sm font-medium break-words">
            {card.title}
          </p>
          <p className="text-xs text-muted-foreground">
            <span aria-live="polite">{card.statusLine}</span>
            {detailsToggle ? (
              <>
                <span aria-hidden="true"> · </span>
                {detailsToggle}
              </>
            ) : null}
          </p>
        </div>
        {actions}
      </div>
      {details}
    </div>
  );
}

/**
 * Whether a line-clamped element hides part of its text: null until measured, then measured
 * again when its width changes (the floating panel and the full page wrap very differently)
 * and once the fonts are in. Counting characters cannot tell: 360 characters are 8 lines in
 * the panel and 4 on the page.
 */
function useClampedOverflow(
  active: boolean,
): [(element: HTMLElement | null) => void, boolean | null] {
  // A callback ref into state: the measurement follows the element React actually mounted,
  // not a stale handle from an earlier render.
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  const [overflows, setOverflows] = React.useState<boolean | null>(null);
  React.useLayoutEffect(() => {
    if (!active || !element) {
      return;
    }
    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    void document.fonts?.ready.then(measure);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, active]);
  return [setElement, overflows];
}

/** A decided rule: its text, the decision, and (an approved rule in the source chat) a way to the feedback conversation. */
export function RuleDecisionCard({
  text,
  decision,
  onOpen,
}: {
  text: string;
  decision: 'approved' | 'rejected';
  /** Opens the feedback conversation; absent inside that conversation itself, and for a rejected rule. */
  onOpen?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [bodyRef, overflows] = useClampedOverflow(!expanded);
  const toggleable = expanded || overflows === true;
  const approved = decision === 'approved';
  const DecisionIcon = approved ? Check : X;
  const body = (
    <span
      ref={bodyRef}
      className={cn(
        // Tailwind v4 emits `block` after `line-clamp-*`, so the clamp's `-webkit-box` display
        // must not be paired with `block`.
        'text-sm break-words whitespace-pre-wrap',
        expanded ? 'block' : 'line-clamp-3',
      )}
    >
      {text}
    </span>
  );
  return (
    <div
      data-slot="rule-decision-card"
      data-decision={decision}
      className="flex w-full flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 text-card-foreground"
    >
      {text ? (
        // One stable wrapper whatever the measurement says: re-parenting the span would
        // replace the element under the observer. It is a plain block until it overflows.
        <button
          type="button"
          aria-expanded={toggleable ? expanded : undefined}
          tabIndex={toggleable ? undefined : -1}
          className={cn(
            'w-full text-start',
            toggleable
              ? 'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
              : 'cursor-default',
          )}
          onClick={toggleable ? () => setExpanded((open) => !open) : undefined}
        >
          {body}
        </button>
      ) : null}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div
          data-slot="rule-decision-status"
          className={cn(
            'flex items-center gap-1.5',
            approved ? 'text-success' : 'text-destructive',
          )}
        >
          <DecisionIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{approved ? 'Approved' : 'Rejected'}</span>
        </div>
        {approved && onOpen ? (
          <button
            type="button"
            data-slot="update-config-feedback-link"
            className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={onOpen}
          >
            Open
            <ChevronRight
              className="size-3.5 rtl:rotate-180"
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line