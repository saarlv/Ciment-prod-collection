import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

export type ToolFallbackStatus = 'inProgress' | 'executing' | 'complete';

export interface ToolFallbackProps {
  name: string;
  parameters: unknown;
  status: ToolFallbackStatus;
  result: string | undefined;
}

type ToolFallbackVisualState = 'loading' | 'completed' | 'failed';

const getVisualState = (
  status: ToolFallbackStatus,
  result: string | undefined,
): ToolFallbackVisualState => {
  if (status !== 'complete') {
    return 'loading';
  }
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (/^"?(error|failed)/i.test(trimmed)) {
      return 'failed';
    }
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as { error?: unknown };
        if (parsed?.error) {
          return 'failed';
        }
      } catch {
        // not JSON, treat as completed
      }
    }
  }
  return 'completed';
};

export type ToolFallbackSize = 'sm' | 'md' | 'lg';

export const toolFallbackRowVariants = cva(
  'flex w-full min-w-0 items-baseline',
  {
    variants: {
      size: {
        sm: 'gap-1',
        md: 'gap-1.5',
        lg: 'gap-1.5',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export const toolFallbackTitleVariants = cva(
  'min-w-0 truncate font-normal leading-[1.6]',
  {
    variants: {
      size: {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export const toolFallbackTitleStateVariants = cva('', {
  variants: {
    state: {
      loading:
        'animate-shimmer bg-gradient-to-r from-muted-foreground/30 via-foreground/80 to-muted-foreground/30 bg-[length:200%_100%] bg-clip-text text-transparent',
      completed: 'text-muted-foreground/70',
      failed: 'text-destructive/80',
    },
  },
  defaultVariants: { state: 'loading' },
});

const TYPING_DOT_DELAYS_MS = [0, 200, 400] as const;

function TypingDots() {
  return (
    <span
      className="ms-px inline-flex items-baseline text-muted-foreground/60"
      aria-hidden="true"
    >
      {TYPING_DOT_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          className="animate-typing-dot"
          style={{ animationDelay: `${delay}ms` }}
        >
          .
        </span>
      ))}
    </span>
  );
}

interface ToolCallFallbackProps {
  name: string;
  parameters: unknown;
  status: ToolFallbackStatus;
  result: string | undefined;
  size?: ToolFallbackSize;
  background?: 'running' | 'finished';
}

export function ToolCallFallback({
  name,
  status,
  result,
  size = 'md',
  background,
}: ToolCallFallbackProps) {
  const visualState =
    background === 'running'
      ? 'loading'
      : background === 'finished'
        ? 'completed'
        : getVisualState(status, result);
  const isLoading = visualState === 'loading';
  const isRunningInBackground = background === 'running';

  return (
    <div className={cn(toolFallbackRowVariants({ size }))}>
      <span
        className={cn(
          toolFallbackTitleVariants({ size }),
          toolFallbackTitleStateVariants({ state: visualState }),
          isRunningInBackground ? 'flex-initial' : 'flex-1',
        )}
      >
        {isRunningInBackground ? `${name} · Running in background` : name}
      </span>
      {isLoading && <TypingDots />}
    </div>
  );
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line