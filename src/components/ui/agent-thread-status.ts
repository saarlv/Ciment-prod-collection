import type { AgentThreadStatus } from '@blocksdiy/react-common/agent-threads';

/*
 * How a conversation's status reads on screen — one vocabulary for every surface that marks a
 * conversation (the agent layout's sidebar rows, the floating agent chat's header). Pure and
 * dependency-free (type-only imports) so the compiler's registry specs pin it; the mark's
 * rendering is `AgentThreadStatusMark` in agent-chat.
 */

/**
 * A status's mark. The attention states differ by shape and colour (a destructive dot, a muted
 * spinner, a destructive ring); the resting states are a muted dot, so every known status is
 * marked and named — the label carries the meaning where two marks share a shape. Partial map
 * so a frozen copy survives a new `AgentThreadStatus`: a status this copy predates is unmarked.
 */
export interface StatusMark {
  shape?: 'dot' | 'ring' | 'spinner';
  colorClassName?: string;
  srLabel?: string;
}

export const UNKNOWN_STATUS_MARK: StatusMark = {};

const RESTING_DOT = {
  shape: 'dot',
  colorClassName: 'text-muted-foreground',
} as const;

export const STATUS_MARKS: Readonly<
  Partial<Record<AgentThreadStatus, StatusMark>>
> = {
  interrupted: {
    shape: 'dot',
    colorClassName: 'text-destructive',
    srLabel: 'Waiting for your response',
  },
  busy: {
    shape: 'spinner',
    colorClassName: 'text-muted-foreground',
    srLabel: 'In progress',
  },
  idle: { ...RESTING_DOT, srLabel: 'Idle' },
  waiting_on_agent: { ...RESTING_DOT, srLabel: 'Waiting for the agent' },
  error: {
    shape: 'ring',
    colorClassName: 'text-destructive',
    srLabel: 'Ended with an error',
  },
};

export const statusMark = (status: AgentThreadStatus): StatusMark =>
  STATUS_MARKS[status] ?? UNKNOWN_STATUS_MARK;

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line