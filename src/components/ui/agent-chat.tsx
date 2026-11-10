import 'streamdown/styles.css';

import { AgentChat as SDKAgentChat } from '@blocksdiy/blocks-client-sdk';
import { useClient, useUser } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { AgentThreadStatus } from '@blocksdiy/react-common/agent-threads';
import type { AgentChatComponent } from '@blocksdiy/react-common/new-agent-chat';
import * as AgentChatPrimitive from '@blocksdiy/react-common/new-agent-chat';
import { cva, type VariantProps } from 'class-variance-authority';
import { format, isToday } from 'date-fns';
import {
  AlarmClock,
  ArrowUp,
  CircleAlert,
  File,
  FileImage,
  FileText,
  Loader2,
  MessageCirclePlus,
  Paperclip,
  Repeat,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { motion, MotionProps } from 'motion/react';
import * as React from 'react';
import { Streamdown, type ThemeInput } from 'streamdown';
// import { code as streamdownCode } from '@streamdown/code';
// import { mermaid as streamdownMermaid } from '@streamdown/mermaid';
import { z } from 'zod';

import {
  RuleDecisionCard,
  ToolApprovalCard,
  type ToolApprovalCardView,
} from '@/components/ui/agent-chat-approval-card';
import {
  AgentChatProductTypesProvider,
  ChatCodeComponent,
} from '@/components/ui/agent-chat-code-component';
import {
  ASK_USER_TOOL_NAME,
  type AskUserParameters,
  GET_USER_CHOICE_TOOL_DESCRIPTION,
  GET_USER_CHOICE_TOOL_NAME,
  getUserChoiceParametersSchema,
  GetUserChoiceToolResult,
  TypedAnswer,
} from '@/components/ui/agent-chat-get-user-choice';
import {
  isPlainObject,
  isStructuredOutputMessage,
  type StructuredOutput,
  structuredOutputOf,
  structuredOutputToYamlBlock,
} from '@/components/ui/agent-chat-structured-output-value';
import {
  finishedTaskIdsOf,
  longRunningTaskIdOf,
} from '@/components/ui/agent-chat-task-status';
import {
  ToolCallFallback,
  toolFallbackRowVariants,
  type ToolFallbackSize,
  type ToolFallbackStatus,
  toolFallbackTitleStateVariants,
  toolFallbackTitleVariants,
} from '@/components/ui/agent-chat-tool-fallback';
import {
  UPDATE_CONFIG_TITLE,
  UPDATE_CONFIG_TOOL_NAME,
  updateConfigCardText,
  updateConfigDetailsText,
  updateConfigOutcomeOf,
  updateConfigShownText,
} from '@/components/ui/agent-chat-update-config';
import { AgentFeedbackLinksContext } from '@/components/ui/agent-feedback-links';
import {
  isFeedbackRefLine,
  leadingFeedbackRateOf,
} from '@/components/ui/agent-feedback-ref';
import { statusMark } from '@/components/ui/agent-thread-status';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import * as ProductTypes from '@/product-types';

export type Message = AgentChatPrimitive.Message;
export type Attachment = AgentChatPrimitive.Attachment;

// The feedback wire protocol is react-common's, re-exported so app code keeps this import path.
// Same skew guard as the primitives further down: an installed react-common older than the
// protocol still renders every chat, with the protocol as it was when this copy shipped.
export const FEEDBACK_MESSAGE_NAME =
  AgentChatPrimitive.FEEDBACK_MESSAGE_NAME ?? 'feedback';
export const isFeedbackTag: (text: string) => boolean =
  AgentChatPrimitive.isFeedbackTag ??
  ((text) => /^\s*<feedback\b[^>]*\/?>\s*$/i.test(text));
export const isFeedbackMessage: (message: {
  role: string;
  name?: string;
}) => boolean =
  AgentChatPrimitive.isFeedbackMessage ??
  ((message) =>
    message.role === 'user' && message.name === FEEDBACK_MESSAGE_NAME);
export type FeedbackRate = AgentChatPrimitive.FeedbackRate;

export interface AgentChatTurnFeedback {
  messageId: string;
  rate: 1 | -1;
}

/**
 * Shared thumb labels/icons per rating, in the rating's semantic colour at 100% (Design
 * Intent) where a rating is chosen: `markClassName` colours the pressed thumb's glyph under
 * a message — the one place a thumb fills, on no seat (`aria-pressed:` outranks the ghost
 * hover) — and `seatClassName` recolours the armed composer pill, the theme's filled Button
 * (primary as it comes for whole-conversation feedback, whose mark is the trigger's own
 * icon). Every other thumb stays outlined. `success` is a token the items declare
 * (`cssVars` in registry.json), as the presets ship none.
 */
export const FEEDBACK_SENTIMENT: Record<
  FeedbackRate,
  {
    label: string;
    actionLabel: string;
    Icon: React.ComponentType<{ className?: string }>;
    markClassName?: string;
    seatClassName?: string;
  }
> = {
  1: {
    label: 'Positive',
    actionLabel: 'Good response',
    Icon: ThumbsUp,
    markClassName: 'aria-pressed:text-success',
    seatClassName: 'bg-success text-white hover:bg-success/90',
  },
  '-1': {
    label: 'Negative',
    actionLabel: 'Bad response',
    Icon: ThumbsDown,
    markClassName: 'aria-pressed:text-destructive',
    seatClassName: 'bg-destructive text-white hover:bg-destructive/90',
  },
  0: {
    label: 'Neutral',
    actionLabel: 'Give feedback',
    Icon: MessageCirclePlus,
  },
};

/** The chat's density scale — transcript, composer, headers and the surfaces that frame them. */
export type AgentChatSize = 'sm' | 'md' | 'lg';

/** The title of a conversation nothing was sent in yet — every surface names it the same. */
export const NEW_CHAT_TITLE = 'New chat';

/** Focus the composer under `root` (the runtime's textarea, `data-slot="agent-chat-input"`): picking a conversation is picking up the talk. */
export const focusAgentChatInput = (
  root: ParentNode | null | undefined,
  options?: FocusOptions,
): void => {
  root
    ?.querySelector<HTMLTextAreaElement>('[data-slot="agent-chat-input"]')
    ?.focus(options);
};

/** The chat runtime's send seam (`AgentChatProps.onUserMessageSent`), as a surface's session handles it. */
export type AgentChatUserMessageSentHandler = NonNullable<
  AgentChatProps['onUserMessageSent']
>;

/**
 * One stable `onUserMessageSent` for the chat runtime that forwards to whichever session is
 * mounted inside it: the runtime's prop never changes identity, so re-pointing the surface at
 * another conversation never re-renders the runtime for the seam's sake.
 */
export function useUserMessageSentSeam(): {
  notifyRef: React.RefObject<AgentChatUserMessageSentHandler | null>;
  onUserMessageSent: AgentChatUserMessageSentHandler;
} {
  const notifyRef = React.useRef<AgentChatUserMessageSentHandler | null>(null);
  const onUserMessageSent = React.useCallback<AgentChatUserMessageSentHandler>(
    (text, message) => {
      notifyRef.current?.(text, message);
    },
    [],
  );
  return { notifyRef, onUserMessageSent };
}

export interface AgentChatLoadErrorProps extends Omit<
  React.ComponentProps<typeof Empty>,
  'children'
> {
  onRetry: () => void;
  /** Actions beside "Try again" — a surface's own close, say. */
  children?: React.ReactNode;
  /** Classes for the actions row. */
  actionsClassName?: string;
}

/** The surface could not resolve its agent: what happened, what to do, and the surface's own actions beside the retry. */
export function AgentChatLoadError({
  onRetry,
  children,
  actionsClassName,
  ...props
}: AgentChatLoadErrorProps) {
  return (
    <Empty role="alert" {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load this agent</EmptyTitle>
        <EmptyDescription>
          Check your connection and try again.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className={actionsClassName}>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
        {children}
      </EmptyContent>
    </Empty>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Thread status mark — one rendering for every surface that marks a conversation         */
/* ------------------------------------------------------------------------------------ */

export interface AgentThreadStatusMarkProps extends React.ComponentProps<'span'> {
  status: AgentThreadStatus;
}

/**
 * A conversation's status by shape (agent-thread-status: a dot for waiting on you, a spinner
 * for a run in progress, a ring for ended with an error, a muted dot at rest), with the status
 * read out for screen readers. The box keeps its size for an unmarked status, so a column of
 * marks stays aligned. Rendered by the agent layout's sidebar rows and the floating agent
 * chat's header.
 */
export function AgentThreadStatusMark({
  status,
  className,
  ...props
}: AgentThreadStatusMarkProps) {
  const { shape, colorClassName, srLabel } = statusMark(status);
  return (
    <span
      data-slot="agent-thread-status-mark"
      data-status={status}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center',
        colorClassName,
        className,
      )}
      {...props}
    >
      {/* size-3! beats a parent's [&_svg]:size-4 (sidebar buttons). */}
      {shape === 'spinner' ? (
        <Loader2
          aria-hidden
          className="size-3! animate-spin motion-reduce:animate-none"
        />
      ) : shape ? (
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            shape === 'ring' ? 'border-2 border-current' : 'bg-current',
          )}
        />
      ) : null}
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </span>
  );
}

export interface AgentChatMessageSlotArgs {
  messageId: string;
  message: Message;
  role: 'assistant' | 'user';
  isStreaming: boolean;
}

const GENERATE_DYNAMIC_CHAT_COMPONENT_TOOL_NAME =
  'generate_dynamic_chat_component';
const CHAT_COMPONENT_MESSAGE_PART_CLASS_NAME = 'w-full md:w-full';

export const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) {
    return FileImage;
  }

  if (fileType.includes('pdf') || fileType.includes('doc')) {
    return FileText;
  }

  return File;
};

/** `epochMs` as a Date, or null when absent or not a real instant (nothing to show). */
const toTurnDate = (epochMs: number | undefined): Date | null => {
  if (epochMs === undefined) {
    return null;
  }
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * The time under a turn: bare `dateFormat` (a clock time) today, prefixed with the day
 * otherwise — a bare "10:31" under last week's message would read as this morning's.
 */
const formatTurnTime = (date: Date, dateFormat: string): string =>
  format(date, isToday(date) ? dateFormat : `PP, ${dateFormat}`);

/** react-common's `ScheduledTrigger`, restated: an installed react-common older than the line
 *  has neither the type nor `scheduledTriggerByMessageId` (same skew guard as below). */
interface AgentChatScheduledTriggerValue {
  kind: 'reminder' | 'schedule';
  title?: string;
  recurring?: boolean;
}

/** The line above a turn a fired reminder or schedule started, read from the stored trigger
 *  (never from the run's hidden prompt). It reads as one of the turn's steps: a message part in
 *  the tool steps' own type and colour. No time: the turn's own time shows on hover. */
function AgentChatScheduledTrigger({
  trigger,
  size,
}: {
  trigger: AgentChatScheduledTriggerValue;
  size: ToolFallbackSize;
}) {
  const label = trigger.kind === 'schedule' ? 'Scheduled' : 'Reminder';
  const Icon = trigger.recurring ? Repeat : AlarmClock;
  const text = trigger.title ? `${label} · ${trigger.title}` : label;
  const spoken = [
    `Started by ${trigger.kind === 'schedule' ? 'a schedule' : 'a reminder'}`,
    trigger.title,
    trigger.recurring ? 'recurring' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <AgentChatMessagePart size={size} role="assistant">
      <div
        data-slot="agent-chat-scheduled-trigger"
        className={cn(toolFallbackRowVariants({ size }), 'items-center')}
      >
        <span className="sr-only">{spoken}</span>
        <Icon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground/70"
        />
        <span
          aria-hidden
          title={text}
          className={cn(
            toolFallbackTitleVariants({ size }),
            toolFallbackTitleStateVariants({ state: 'completed' }),
            'flex-1',
          )}
        >
          {text}
        </span>
      </div>
    </AgentChatMessagePart>
  );
}

const chatComponentParametersSchema = z.object({}).loose();
type ChatComponentJsonSchemaInput = Parameters<typeof z.fromJSONSchema>[0];

const parseChatComponentInputSchema = (
  input: AgentChatComponent['input'] | string | undefined,
): ChatComponentJsonSchemaInput | undefined => {
  if (!input) {
    return undefined;
  }

  if (typeof input !== 'string') {
    return input as ChatComponentJsonSchemaInput;
  }

  const normalizedInput = input
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(normalizedInput) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ChatComponentJsonSchemaInput)
      : undefined;
  } catch {
    return undefined;
  }
};

const getChatComponentParametersSchema = (component: AgentChatComponent) => {
  const inputSchema = parseChatComponentInputSchema(component.input);
  if (!inputSchema) {
    return chatComponentParametersSchema;
  }

  try {
    return z.fromJSONSchema(
      inputSchema,
    ) as typeof chatComponentParametersSchema;
  } catch {
    return chatComponentParametersSchema;
  }
};

/**
 * The chat's root — and the single place its type scale is set. The transcript inherits it
 * (Streamdown renders `text-inherit`), so messages and the composer read at one size per
 * `size`; the composer repeats the same scale explicitly (see agentChatInputVariants for why).
 */
export const agentChatContentVariants = cva('flex flex-col h-full relative', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

/**
 * The transcript's horizontal inset per size — one scale, so the header's title, the avatar
 * column and the composer's edge share an x. Consumed as padding by the message groups
 * (below) and by chrome that lines up with the text (the conversation header, via
 * agentChatColumnInsetVariants), and as margin by the boxed composer
 * (agentChatFooterVariants' compound `mx`, the same numbers).
 */
const COLUMN_INSET_CLASS_NAMES = {
  sm: 'px-4',
  md: 'px-4',
  lg: 'px-6',
} as const;

/**
 * The user bubble's horizontal text inset per size — the composer's (its padding + the
 * input's `px`), so a sent message reads as the composer's twin. One constant for the
 * bubble (agentChatMessagePartVariants) and the turn footer under it
 * (agentChatTurnFooterVariants), which ends where the bubble's last character does.
 */
const USER_BUBBLE_INSET_CLASS_NAMES = {
  sm: 'px-3',
  md: 'px-3.5',
  lg: 'px-5',
} as const;

export const agentChatColumnInsetVariants = cva('', {
  variants: {
    size: COLUMN_INSET_CLASS_NAMES,
  },
  defaultVariants: {
    size: 'md',
  },
});

// One turn. Its vertical padding is half the space between turns (16 / 24 / 32px) — the
// ChatGPT/Claude rhythm — and the same in both directions, since neither role's box adds
// anything of its own below it (see AgentChatMessageGroup's streaming slot).
export const agentChatMessageGroupVariants = cva(
  'flex group relative flex transition-colors',
  {
    variants: {
      size: {
        sm: `py-2 gap-x-4 ${COLUMN_INSET_CLASS_NAMES.sm}`,
        md: `py-3 gap-x-4 ${COLUMN_INSET_CLASS_NAMES.md}`,
        lg: `py-4 gap-x-6 ${COLUMN_INSET_CLASS_NAMES.lg}`,
      },
      role: {
        user: 'flex-row-reverse',
        assistant: 'flex-row',
      },
    },
    defaultVariants: {
      size: 'md',
      role: 'assistant',
    },
  },
);

// `relative`: the timestamp overlay is anchored to this column's bottom edge.
const agentChatMessageGroupContentVariants = cva(
  'relative flex min-w-0 flex-1 flex-col',
  {
    variants: {
      role: {
        user: 'items-end',
        assistant: 'items-start',
      },
    },
    defaultVariants: {
      role: 'assistant',
    },
  },
);

export const agentChatMessagesVariants = cva('', {
  variants: {
    size: {
      sm: '',
      md: '',
      lg: '',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

/**
 * One message's box.
 * - Assistant: bare text, `py-1.5` so its first line centers on the avatar beside it —
 *   (avatar − line-height) / 2 is 6px at every size (32/20, 36/24, 40/28).
 * - User: a bubble cut like the composer — the same `rounded-4xl` (a pill at one line, a soft
 *   rectangle when it wraps) and the same text inset the composer's text has from its edge
 *   (its padding + the input's `px`: 12 / 14 / 20px), so a sent message reads as the
 *   composer's twin. Capped at 80% of the column (shadcn's Bubble), so a long prompt is a
 *   block on the user's side, not a bar across the transcript.
 */
export const agentChatMessagePartVariants = cva(
  'relative flex flex-col py-1.5',
  {
    variants: {
      size: {
        sm: '',
        md: '',
        lg: '',
      },
      role: {
        user: 'rounded-4xl bg-primary text-primary-foreground max-w-[80%]',
        assistant: 'max-w-full',
      },
    },
    compoundVariants: [
      {
        role: 'user',
        size: 'sm',
        class: `${USER_BUBBLE_INSET_CLASS_NAMES.sm} py-2`,
      },
      {
        role: 'user',
        size: 'md',
        class: `${USER_BUBBLE_INSET_CLASS_NAMES.md} py-2.5`,
      },
      {
        role: 'user',
        size: 'lg',
        class: `${USER_BUBBLE_INSET_CLASS_NAMES.lg} py-3`,
      },
    ],
    defaultVariants: {
      size: 'md',
      role: 'assistant',
    },
  },
);

export const agentChatLoadingDotsWrapperVariants = cva('flex items-center', {
  variants: {
    size: {
      sm: 'h-5',
      md: 'h-6',
      lg: 'h-7',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export const agentChatLoadingDotsVariants = cva(
  "text-[2px] relative mx-[3.5em] inline-block size-[2.5em] animate-bubble-loader rounded-full text-muted-foreground/70 indent-[-9999em] transform-[translateZ(0)_translateY(-2.5em)] [animation-delay:-0.16s] [animation-fill-mode:both] before:absolute before:start-[-3.5em] before:top-0 before:size-[2.5em] before:animate-bubble-loader before:rounded-full before:content-[''] before:[animation-delay:-0.32s] before:[animation-fill-mode:both] after:absolute after:start-[3.5em] after:top-0 after:size-[2.5em] after:animate-bubble-loader after:rounded-full after:content-[''] after:[animation-fill-mode:both]",
  {
    variants: {
      size: {
        sm: '',
        md: '',
        lg: '',
      },
      state: {
        active: '',
        paused: 'paused before:paused after:paused',
      },
    },
    defaultVariants: {
      size: 'md',
      state: 'active',
    },
  },
);

export const agentChatMessageAvatarVariants = cva('shrink-0 hidden md:flex', {
  variants: {
    role: {
      user: '',
      assistant: '',
    },
    size: {
      sm: 'h-8 w-8',
      md: 'h-9 w-9',
      lg: 'h-10 w-10',
    },
  },
  defaultVariants: {
    role: 'assistant',
    size: 'md',
  },
});

export const agentChatMessageAvatarFallbackVariants = cva('', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

/**
 * The turn's footer — its time and, under an assistant turn, the thumbs — revealed while
 * the turn is hovered or holds focus (a thumb, a copy button, a link — keyboard parity
 * with the pointer), and kept shown while a thumb is chosen (`aria-pressed`), so the
 * turn being rated stays marked. Laid over the gap between turns rather than in flow —
 * as BubbleReactions overlays a bubble — so a row that is invisible most of the time
 * costs the transcript no space and the turn rhythm stays what
 * agentChatMessageGroupVariants says. Anchored to the content column's bottom edge and
 * padded down by (turn padding − half a text-xs line), which centers the 16px line on the
 * group's edge: in the gap, touching neither turn. Hidden under a group another of the
 * same role follows: the footer belongs under the last of them. Stays in the
 * accessibility tree while invisible, so a screen reader hears it after the turn and a
 * keyboard reaches the thumbs.
 */
export const agentChatTurnFooterVariants = cva(
  'absolute inset-x-0 top-full flex items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-pressed=true]]:opacity-100 has-[[aria-expanded=true]]:opacity-100 [[data-message-role=user]:has(+[data-message-role=user])_&]:hidden [[data-message-role=assistant]:has(+[data-message-role=assistant])_&]:hidden',
  {
    variants: {
      role: {
        user: 'flex-row-reverse',
        assistant: 'flex-row',
      },
      size: {
        sm: 'pt-0',
        md: 'pt-1',
        lg: 'pt-2',
      },
    },
    compoundVariants: [
      // Under a bubble the time ends where its last character does; assistant text starts
      // at the column edge, and so does its time.
      { role: 'user', size: 'sm', class: USER_BUBBLE_INSET_CLASS_NAMES.sm },
      { role: 'user', size: 'md', class: USER_BUBBLE_INSET_CLASS_NAMES.md },
      { role: 'user', size: 'lg', class: USER_BUBBLE_INSET_CLASS_NAMES.lg },
    ],
    defaultVariants: {
      role: 'assistant',
      size: 'md',
    },
  },
);

/**
 * An icon button in a turn's footer (a thumb): the theme's smallest icon Button — ghost,
 * `icon-xs` (a 24px target around a 12px icon, the text-xs glyph size, in the theme's
 * radius, hover and focus ring) — pulled onto the footer's 16px line with negative
 * margins, so the row keeps its height and the target its size. Pressed: the icon filled,
 * in the rating's colour (FEEDBACK_SENTIMENT.markClassName), no seat. Muted like the time
 * beside it otherwise, from the footer's colour. (Not `Toggle`/`ToggleGroup`: their
 * smallest size is 28px, and their APIs differ between the base and radix flavors.)
 */
const agentChatTurnActionClassName =
  '-my-1 [&[aria-pressed=true]_svg]:fill-current';

/**
 * The bubble a thumb opens — Send the rating as it is, or Add comment, ghost buttons with a
 * divider — on the theme's popover surface, sized to its content, outlined in the theme's
 * `border` (the card's and the divider's colour; the surface's own `foreground/10` washes
 * out), with an arrow on the side facing the thumb (the kit's Popover exports none, and the
 * primitive's differs between the base and radix flavors): a rotated square clipped to its
 * outer half, outlined by borders on its two outward edges — a ring is a shadow outside the
 * box, which the clip would take with it. `align="start"` keeps the arrow
 * over the thumb — the bubble grows away from it instead of being centred and then shifted by
 * a collision — and the bubble starts 16px before the thumb (`alignOffset`) so the arrow, at
 * `start-6`, sits past the theme's corner radius on the straight edge: -16 + 24 + 4 = the
 * thumb's 12px centre. Drawn for the two sides the bubble takes (above, or below when there
 * is no room above); none on the rare sideways placement.
 */
const AGENT_CHAT_TURN_FEEDBACK_MENU_ALIGN_OFFSET = -16;
// z-[70]: above the floating agent chat's layer (z-[60]), where this chat may live.
const agentChatTurnFeedbackMenuClassName =
  'group/feedback-menu relative z-[70] w-auto flex-row gap-1 p-1 ring-border';
const agentChatTurnFeedbackArrowClassName =
  'absolute start-6 hidden size-2 rotate-45 border-border bg-popover group-data-[side=bottom]/feedback-menu:-top-1 group-data-[side=bottom]/feedback-menu:block group-data-[side=bottom]/feedback-menu:border-t group-data-[side=bottom]/feedback-menu:border-l group-data-[side=bottom]/feedback-menu:[clip-path:polygon(0_0,100%_0,0_100%)] group-data-[side=top]/feedback-menu:-bottom-1 group-data-[side=top]/feedback-menu:block group-data-[side=top]/feedback-menu:border-r group-data-[side=top]/feedback-menu:border-b group-data-[side=top]/feedback-menu:[clip-path:polygon(100%_0,100%_100%,0_100%)]';

/**
 * The composer's surface. Theme tokens only, so every variant follows the app's theme
 * (and its `--radius`: `rounded-4xl` is the theme's pill token — Badge wears it too — so
 * a square theme gets a square composer). Every variant keeps a 1px border box so
 * switching between them never moves the content.
 *
 * - `divider` — a hairline above, edge to edge. For a chat that already sits inside a
 *   card or dialog, whose frame is the host's. The default.
 * - `filled` — the app's muted surface with no stroke (ChatGPT, Gemini): one calm object
 *   on a page. What the agent conversation page uses.
 * - `outline` — the app's input chrome, the same tokens as `<InputGroup />`:
 *   `border-input`, `dark:bg-input/30`, ring-colored while the input has focus. For hosts
 *   whose inputs are outlined and should match.
 *
 * `filled` and `outline` are pills at one line and soft rectangles once the text grows, and
 * they stand inside the transcript's horizontal inset (the compound `mx` below — the same
 * numbers as COLUMN_INSET_CLASS_NAMES), so the composer's edges line up with the message
 * column above it.
 */
export const agentChatFooterVariants = cva(
  'flex flex-col shrink-0 transition-colors',
  {
    variants: {
      size: {
        sm: '',
        md: '',
        lg: '',
      },
      variant: {
        divider: 'border-t',
        filled: 'rounded-4xl border border-transparent bg-muted',
        outline:
          'rounded-4xl border border-input has-[[data-slot=agent-chat-input]:focus-visible]:border-ring dark:bg-input/30',
      },
    },
    compoundVariants: [
      { variant: ['filled', 'outline'], size: ['sm', 'md'], class: 'mx-4' },
      { variant: ['filled', 'outline'], size: 'lg', class: 'mx-6' },
    ],
    defaultVariants: {
      size: 'md',
      variant: 'divider',
    },
  },
);

export const agentChatFetchingContentVariants = cva(
  'flex flex-col items-center',
  {
    variants: {
      size: {
        sm: 'gap-2 [&>svg]:h-7 [&>svg]:w-7 [&>span]:text-sm',
        md: 'gap-2 [&>svg]:h-9 [&>svg]:w-9 [&>span]:text-base',
        lg: 'gap-3 [&>svg]:h-11 [&>svg]:w-11 [&>span]:text-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

const agentChatFetchingOverlayVariants = cva(
  'absolute inset-0 bg-background flex items-center justify-center transition-opacity duration-200 ease-out data-[state=open]:opacity-100 data-[state=closed]:opacity-0 data-[state=open]:pointer-events-auto data-[state=closed]:pointer-events-none',
);

// Staged attachments, above the input. Inset to the text's own start (the composer's padding
// plus the input's `px`), so chips line up with the first character — and clear the pill's
// corner curve, which a chip flush to the padding would cut into.
const agentChatFooterAttachmentsVariants = cva('flex overflow-auto pb-0', {
  variants: {
    size: {
      sm: 'gap-1 px-3 pt-1',
      md: 'gap-1.5 px-3.5 pt-1.5',
      lg: 'gap-2 px-5 pt-2',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const agentChatAttachmentBadgeVariants = cva(
  'group/attachment inline-flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4 shrink-0',
  {
    variants: {
      size: {
        sm: 'text-sm gap-1 px-2 h-7 max-w-[150px]',
        md: 'text-base gap-1.5 px-3 h-9 max-w-[200px]',
        lg: 'text-lg gap-2 px-4 h-11 max-w-[250px]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

const agentChatAttachmentRemoveVariants = cva(
  'shrink-0 hover:bg-accent rounded-full p-1 -m-1 [&>svg]:h-4 [&>svg]:w-4 invisible group-hover/attachment:visible',
);

const agentChatAttachmentFileNameVariants = cva('font-normal truncate grow');

// Also worn by the composer's measuring mirror (see useComposerExpanded), so the text
// metrics it measures with are exactly the textarea's.
const agentChatInputVariants = cva(
  '[field-sizing:content] min-h-[auto] max-h-48 resize-none border-none bg-transparent shadow-none hover:shadow-none focus:shadow-none focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
  {
    variants: {
      // The chat's type scale (agentChatContentVariants), repeated: a shadcn Textarea sets
      // its own `text-base md:text-sm`, so the input can't inherit it — and on phones it
      // stays 16px whatever the size (`text-base` before `md:`), or iOS zooms in on focus.
      // One line is a tight row (`py-1` + the size's line-height); the toolbar centers it
      // on the action buttons, whatever height the app's Button style gives them.
      size: {
        sm: 'px-2 py-1 text-base leading-5 md:text-sm',
        md: 'px-2 py-1 text-base leading-6 md:text-base',
        lg: 'px-3 py-1 text-lg leading-7 md:text-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

// The composer row. `items-center`, not `items-end`: collapsed, the input is one line by
// definition (useComposerExpanded), so centering aligns it with the action buttons whatever
// height the app's Button style gives them (nova's `icon` is 32px, luma's 36px); expanded,
// the actions have wrapped onto their own row, so the alignment axis no longer matters.
// `flex-wrap` is what lets them wrap; `relative` anchors the measuring mirror.
// The padding is the ring around the round buttons — tight, and tighter as sizes shrink.
const agentChatFooterToolbarVariants = cva('flex', {
  variants: {
    mode: {
      voice: 'items-center',
      input: 'relative flex-wrap items-center',
    },
    size: {
      sm: 'gap-1 p-1',
      md: 'gap-1.5 p-1.5',
      lg: 'gap-2 p-2',
    },
  },
  defaultVariants: {
    mode: 'input',
    size: 'md',
  },
});

// The composer's action buttons as one group: end-aligned, so once the actions wrap under
// the textarea they sit at the end of their own row — the trailing edge in either direction.
const agentChatFooterActionsVariants = cva(
  'ms-auto flex shrink-0 items-center',
  {
    variants: {
      size: {
        sm: 'gap-1',
        md: 'gap-1.5',
        lg: 'gap-2',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

/**
 * The composer's action buttons per chat density — the attach and send buttons', and
 * any control a host seats beside them (`inputEndAdornment`): a Button `size`, and the
 * round cut the composer gives them (concentric with its pill corners).
 */
export const agentChatComposerButtonSize = (
  size: 'sm' | 'md' | 'lg',
): 'icon-sm' | 'icon' | 'icon-lg' =>
  size === 'sm' ? 'icon-sm' : size === 'lg' ? 'icon-lg' : 'icon';

export const AGENT_CHAT_COMPOSER_BUTTON_CLASS_NAME = 'rounded-full';

/**
 * The ChatGPT/Gemini composer geometry. One row while the prompt fits beside the actions;
 * once it would wrap — or holds a newline — the textarea takes the full width and the
 * actions drop to their own row beneath, so the text runs edge to edge and the last row is
 * the buttons'. Decided from the prompt's single-line width (an invisible mirror wearing the
 * textarea's exact classes) against the width the textarea has beside the actions. That is a
 * pure function of prompt + container, so the two layouts never flip-flop — a height-based
 * check would: a wider textarea means fewer lines, which collapses it, which wraps it again.
 */
function useComposerExpanded(prompt: string) {
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const mirrorRef = React.useRef<HTMLSpanElement>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);

  const measure = React.useCallback(() => {
    const toolbar = toolbarRef.current;
    const actions = actionsRef.current;
    const mirror = mirrorRef.current;
    if (!toolbar || !actions || !mirror) {
      return;
    }
    const toolbarStyle = getComputedStyle(toolbar);
    const contentWidth =
      toolbar.getBoundingClientRect().width -
      parseFloat(toolbarStyle.paddingLeft) -
      parseFloat(toolbarStyle.paddingRight);
    const widthBesideActions =
      contentWidth -
      actions.getBoundingClientRect().width -
      (parseFloat(toolbarStyle.columnGap) || 0);
    // Fractional widths on both sides, and a 1px bias toward expanding: wrapping a hair
    // early is invisible, wrapping beside the buttons for one keystroke is not.
    const promptWidth = mirror.getBoundingClientRect().width + 1;
    setIsExpanded(prompt.includes('\n') || promptWidth > widthBesideActions);
  }, [prompt]);

  // Layout effect: the mirror carries the new prompt in the same commit, and the row must
  // be decided before paint. Also keeps the ref the resize observer reads current (written
  // here, not during render).
  const measureRef = React.useRef(measure);
  React.useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  }, [measure]);

  // The width beside the actions changes with the panel (a sidebar toggling, the window).
  // Subscribed once, reading the latest `measure` through the ref, so a keystroke doesn't
  // tear the observer down and back up.
  React.useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) {
      return;
    }
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  return { isExpanded, toolbarRef, actionsRef, mirrorRef };
}

// Hoisted: Streamdown's memo compares `shikiTheme` by reference, so an inline tuple
// re-rendered every settled message on each parent render.
const streamdownShikiTheme: [ThemeInput, ThemeInput] = ['dracula', 'dracula'];

const agentChatStreamdownVariants = cva(
  'text-inherit [&_[data-streamdown=link].text-primary]:!text-inherit [&_[data-streamdown=link]]:underline-offset-2',
);

// A structured answer is data, not code: show the whole YAML block, wrapped, without the
// language header. The copy and download actions stay, in their own row (Streamdown pulls
// them up into the header with a negative margin).
const agentChatStructuredOutputVariants = cva(
  '[&_[data-streamdown=code-block-header]]:hidden [&_div:has(>[data-streamdown=code-block-actions])]:mt-0! [&_[data-streamdown=code-block-body]]:max-h-none! [&_pre]:break-words [&_pre]:whitespace-pre-wrap',
);

const agentChatMessageFilePartVariants = cva('py-1.5');

type AgentChatMessageGroupPrimitiveProps = React.ComponentProps<'div'> & {
  messageGroup: { messageIds: string[]; role: 'assistant' | 'user' };
  isLast?: boolean;
};

// react-common is pinned "latest" in generated apps, so an installed copy can predate this hook
// — same skew guard as AgentChatMessageGroupPrimitive below. Falling back to the raw flag keeps
// the old animation behaviour instead of blanking the chat with "is not a function".
const useTextGrowthAnimating =
  AgentChatPrimitive.useTextGrowthAnimating ??
  ((_text: string | undefined, isStreaming: boolean) => isStreaming);

// Same skew guard: an installed react-common older than run focus has no hook — no run is
// ever focused there, so every group reads "not focused".
const NO_RUN_FOCUS: AgentChatPrimitive.AgentChatRunFocusValue = {
  messageIds: new Set<string>(),
  isHighlighted: false,
};
const useAgentChatRunFocus: () => AgentChatPrimitive.AgentChatRunFocusValue =
  AgentChatPrimitive.useAgentChatRunFocus ?? (() => NO_RUN_FOCUS);

const AgentChatMessageGroupPrimitive =
  AgentChatPrimitive.AgentChatMessageGroup ??
  function AgentChatMessageGroupPrimitiveFallback({
    messageGroup,
    isLast: _isLast,
    ...props
  }: AgentChatMessageGroupPrimitiveProps) {
    return (
      <div
        data-slot="agent-chat-message-group"
        data-message-group={messageGroup.role}
        data-message-group-role={messageGroup.role}
        {...props}
      />
    );
  };

interface AgentChatAttachmentBadgeProps extends VariantProps<
  typeof agentChatAttachmentBadgeVariants
> {
  attachment: Attachment;
  onRemove?: () => void;
  className?: string;
}

function AttachmentFileIcon({ fileType }: { fileType: string }) {
  if (fileType.startsWith('image/')) {
    return <FileImage className="shrink-0" />;
  }

  if (fileType.includes('pdf') || fileType.includes('doc')) {
    return <FileText className="shrink-0" />;
  }

  return <File className="shrink-0" />;
}

function AgentChatAttachmentBadge({
  attachment,
  onRemove,
  size = 'md',
  className,
}: AgentChatAttachmentBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(agentChatAttachmentBadgeVariants({ size }), className)}
    >
      <AttachmentFileIcon fileType={attachment.fileType} />
      <span className={agentChatAttachmentFileNameVariants()}>
        {attachment.fileName}
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          className={agentChatAttachmentRemoveVariants()}
          aria-label="Remove attachment"
        >
          <X />
          <span className="sr-only">Remove attachment</span>
        </button>
      )}
    </Badge>
  );
}

function AgentChatAvatar({
  role = 'assistant',
  size = 'md',
  className,
}: VariantProps<typeof agentChatMessageAvatarVariants> & {
  className?: string;
}) {
  const client = useClient();
  const user = client.getUser();
  const { agent } = useAgentChat();
  const initials =
    role === 'assistant' ? agentInitials(agent) : userInitials(user);

  return (
    <Avatar
      className={cn(agentChatMessageAvatarVariants({ role, size }), className)}
    >
      <AvatarImage
        src={role === 'user' ? user.profileImageUrl : agent?.photoUrl}
      />
      <AvatarFallback
        className={agentChatMessageAvatarFallbackVariants({ size })}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function AgentChatLoadingDots({
  show,
  size = 'md',
  ...props
}: MotionProps &
  VariantProps<typeof agentChatLoadingDotsWrapperVariants> & {
    show: boolean;
  }) {
  const loadingDotsState = show ? 'active' : 'paused';

  return (
    <motion.div
      className={cn(agentChatLoadingDotsWrapperVariants({ size }))}
      initial={false}
      animate={{ opacity: show ? 1 : 0 }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      transition={{ duration: 0.16, ease: 'easeInOut' }}
      {...props}
    >
      <span
        aria-hidden={!show}
        aria-label="Is agent thinking"
        className={agentChatLoadingDotsVariants({
          size,
          state: loadingDotsState,
        })}
      />
    </motion.div>
  );
}

interface AgentChatMessageProps {
  messageId: string;
  isStreaming: boolean;
}

const GenerateDynamicChatComponentToolResult = ({
  status,
  result,
  size = 'md',
}: {
  toolCallId: string;
  result: string;
  status: AgentChatPrimitive.ToolCallStatus;
  parameters: Record<string, unknown>;
  size?: 'sm' | 'md' | 'lg';
}) => {
  let parsedResult: {
    code?: string;
    props?: Record<string, unknown>;
  };

  try {
    parsedResult = JSON.parse(result) as typeof parsedResult;
  } catch (error) {
    const message =
      result ||
      (error instanceof Error ? error.message : 'Invalid component result');
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {message}
      </div>
    );
  }

  return (
    <ChatCodeComponent
      status={status}
      code={parsedResult.code}
      props={parsedResult.props}
      size={size}
    />
  );
};

const ChatComponentToolResult = ({
  status,
  component,
  parameters,
  respond,
  result,
}: {
  status: AgentChatPrimitive.ToolCallStatus;
  component: AgentChatComponent;
  parameters: Record<string, unknown>;
  respond?: (result: unknown) => Promise<void>;
  result?: unknown;
}) => {
  return (
    <ChatCodeComponent
      status={status}
      code={component.code}
      props={parameters}
      respond={respond}
      result={result}
    />
  );
};

interface MessageTextContentProps {
  text?: string;
  isStreaming: boolean;
}

function AgentChatMessageTextPart({
  text,
  isStreaming,
  ...props
}: VariantProps<typeof agentChatMessagePartVariants> &
  MessageTextContentProps & { className?: string }) {
  // Above the empty-text guard: hooks cannot sit after an early return.
  const isTextGrowing = useTextGrowthAnimating(text, isStreaming);

  if (!text) {
    return null;
  }

  // Both props follow whether THIS text is growing, never the run-level flag. Streamdown's
  // animated streaming path renders one `<span data-sd-animate>` per word where static renders
  // a text node, so keying either one on the run flag rebuilt a settled message's whole text
  // when answering a parked question resumed the run. Gating `mode` too leaves the settled
  // message's DOM completely untouched — not even the inter-block whitespace nodes churn.
  return (
    // `dir` here, not on Streamdown: any dir passed to Streamdown makes it wrap every block in
    // a `display: contents` box while streaming, which voids its own block spacing.
    <AgentChatMessagePart {...props} dir="auto">
      <Streamdown
        mode={isTextGrowing ? 'streaming' : 'static'}
        animated
        isAnimating={isTextGrowing}
        className={agentChatStreamdownVariants()}
        // plugins={{ code: streamdownCode, mermaid: streamdownMermaid }}
        shikiTheme={streamdownShikiTheme}
      >
        {text}
      </Streamdown>
    </AgentChatMessagePart>
  );
}

function AgentChatMessageFilePart({
  attachment,
  size,
  className,
}: {
  attachment: Attachment;
  size: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div className={cn(agentChatMessageFilePartVariants(), className)}>
      <AgentChatAttachmentBadge attachment={attachment} size={size} />
    </div>
  );
}

function AgentChatMessagePart({
  className,
  size,
  role = 'assistant',
  ...props
}: Omit<React.ComponentProps<'div'>, 'role'> &
  VariantProps<typeof agentChatMessagePartVariants>) {
  return (
    <div
      data-slot="agent-chat-message-part"
      className={cn(agentChatMessagePartVariants({ size, role }), className)}
      {...props}
    />
  );
}

export function AgentChatMessageGroup({
  size,
  hideAvatar,
  dateFormat,
  className,
  messageGroup,
  showTimestamps,
  isLast: isLastMessageGroup,
  fadeIn = false,
  renderMessage,
  feedback,
  onFeedbackChange,
  onFeedbackSend,
  ...props
}: {
  size: 'sm' | 'md' | 'lg';
  hideAvatar: boolean;
  dateFormat: string;
  className?: string;
  messageGroup: { messageIds: string[]; role: 'assistant' | 'user' };
  showTimestamps: boolean;
  isLast: boolean;
  /** Fade the group in as it lands (see AgentChatMessages). */
  fadeIn?: boolean;
  renderMessage?: AgentChatMessagesProps['renderMessage'];
  feedback?: AgentChatMessagesProps['feedback'];
  onFeedbackChange?: AgentChatMessagesProps['onFeedbackChange'];
  onFeedbackSend?: AgentChatMessagesProps['onFeedbackSend'];
}) {
  const chat = useAgentChat();
  const { messageById, isThinking, runIdByMessageId, runStartedAt } = chat;
  const { scheduledTriggerByMessageId } = chat as {
    scheduledTriggerByMessageId?: ReadonlyMap<
      string,
      AgentChatScheduledTriggerValue
    >;
  };
  // A group holding a message of the run the conversation was opened at (`focusRunId`):
  // it is where the transcript scrolls to, and it is tinted for a moment so the eye lands
  // on it. Neutral surface, not a primary tint; the tint fades with the group's color
  // transition.
  const runFocus = useAgentChatRunFocus();
  const isRunFocused = messageGroup.messageIds.some((messageId) =>
    runFocus.messageIds.has(messageId),
  );
  const isRunHighlighted = isRunFocused && runFocus.isHighlighted;
  // The group's time is its latest turn's: the run of its last message, and when that
  // run started (undefined for a turn from before run times — then no row at all).
  const lastMessageIdInGroup =
    messageGroup.messageIds[messageGroup.messageIds.length - 1];
  const lastRunId = runIdByMessageId?.get(lastMessageIdInGroup);
  const turnDate = toTurnDate(
    lastRunId ? runStartedAt?.get(lastRunId) : undefined,
  );
  const isStreamingMessageGroup = isThinking && isLastMessageGroup;
  // A turn a fired reminder or schedule started: the line says so, above the reply.
  // An installed react-common older than the line has no map: no line, as before.
  const firstMessageIdInGroup = messageGroup.messageIds[0];
  const scheduledTrigger =
    messageGroup.role === 'assistant'
      ? scheduledTriggerByMessageId?.get(firstMessageIdInGroup)
      : undefined;
  const showTurnTime = showTimestamps && turnDate !== null;
  // A reply cut off by Stop, as the server flagged it (an older runtime strips `metadata`).
  const isStoppedTurn =
    messageGroup.role === 'assistant' &&
    !isStreamingMessageGroup &&
    (
      messageById.get(lastMessageIdInGroup) as
        | { metadata?: Record<string, unknown> }
        | undefined
    )?.metadata?.['blocks.stopped'] === true;
  const showTurnFeedback =
    onFeedbackChange !== undefined &&
    messageGroup.role === 'assistant' &&
    !isStreamingMessageGroup;

  return (
    <AgentChatMessageGroupPrimitive
      className={cn(
        fadeIn && 'animate-in fade-in duration-300 ease-out',
        agentChatMessageGroupVariants({ size, role: messageGroup.role }),
        isRunFocused && 'scroll-mt-3 rounded-lg',
        isRunHighlighted && 'bg-muted',
        className,
      )}
      data-run-focused={isRunFocused ? '' : undefined}
      data-run-highlighted={isRunHighlighted ? '' : undefined}
      messageGroup={messageGroup}
    >
      {!hideAvatar && messageGroup.role === 'assistant' && (
        <AgentChatAvatar role={messageGroup.role} size={size} />
      )}
      <div
        className={cn(
          agentChatMessageGroupContentVariants({ role: messageGroup.role }),
          className,
        )}
        {...props}
      >
        {scheduledTrigger && (
          <AgentChatScheduledTrigger trigger={scheduledTrigger} size={size} />
        )}
        {messageGroup.messageIds.map((messageId, index) => {
          const isLastMessage = index === messageGroup.messageIds.length - 1;
          const isStreaming = isStreamingMessageGroup && isLastMessage;
          const message = messageById.get(messageId);
          const custom =
            message && renderMessage
              ? renderMessage({
                  messageId,
                  message,
                  role: messageGroup.role,
                  isStreaming,
                })
              : undefined;

          return custom !== undefined ? (
            <React.Fragment key={messageId}>{custom}</React.Fragment>
          ) : (
            <AgentChatMessage
              key={messageId}
              messageId={messageId}
              size={size}
              isStreaming={isStreaming}
              className={className}
            />
          );
        })}
        {/* The thinking dots, only while THIS group is the one streaming. Mounted for every
            assistant group and merely faded out, the slot kept a full line of dead space under
            each reply — the turn after an assistant message sat 3× farther than the turn after
            a user's. The run keeps the group "streaming" until it ends, so the slot is stable
            for the whole reply and leaves with the run, as a typing indicator does. */}
        {messageGroup.role === 'assistant' && isStreamingMessageGroup && (
          <AgentChatMessagePart
            size={size}
            role={messageGroup.role}
            className={className}
          >
            <AgentChatLoadingDots show size={size} />
          </AgentChatMessagePart>
        )}
        {(showTurnTime || showTurnFeedback || isStoppedTurn) && (
          <div
            data-slot="agent-chat-turn-footer"
            className={cn(
              agentChatTurnFooterVariants({
                size,
                role: messageGroup.role,
              }),
              // Shown without a hover, like the builder chat's: it is the reply's outcome.
              isStoppedTurn && 'opacity-100',
            )}
          >
            {showTurnFeedback && (
              <AgentChatTurnFeedback
                messageId={lastMessageIdInGroup}
                feedback={feedback}
                onChange={onFeedbackChange}
                onSend={onFeedbackSend}
              />
            )}
            {showTurnTime && (
              <time
                data-slot="agent-chat-message-timestamp"
                dateTime={turnDate.toISOString()}
              >
                {formatTurnTime(turnDate, dateFormat)}
              </time>
            )}
            {isStoppedTurn && (
              <span data-slot="agent-chat-turn-stopped" className="font-medium">
                Stopped
              </span>
            )}
          </div>
        )}
      </div>
    </AgentChatMessageGroupPrimitive>
  );
}

function AgentChatTurnFeedback({
  messageId,
  feedback,
  onChange,
  onSend,
}: {
  messageId: string;
  feedback?: AgentChatTurnFeedback | null;
  onChange: (feedback: AgentChatTurnFeedback | null) => void;
  onSend?: AgentChatMessagesProps['onFeedbackSend'];
}) {
  const activeRate = feedback?.messageId === messageId ? feedback.rate : null;
  return (
    <div
      data-slot="agent-chat-turn-feedback"
      role="group"
      aria-label="Rate this response"
      className="-ms-1.5 flex items-center gap-0.5"
    >
      {([1, -1] as const).map((rate) => (
        <AgentChatTurnFeedbackThumb
          key={rate}
          rating={{ messageId, rate }}
          isActive={activeRate === rate}
          onChange={onChange}
          onSend={onSend}
        />
      ))}
    </div>
  );
}

/**
 * One thumb. Unpressed, a click opens the bubble: **Send** sends the rating as it is (while
 * the chat can send — the same gate as the composer), **Add comment** arms the composer with it
 * (`onChange`). Pressed — the composer is armed with this rating — a click clears it instead.
 * The trigger IS the thumb button (the kit's trigger, in the Button's ghost `icon-xs` dress;
 * no slot prop, which the flavors spell differently): the primitive marks it expanded while
 * the bubble is open, which the ghost variant seats like any open menu.
 */
function AgentChatTurnFeedbackThumb({
  rating,
  isActive,
  onChange,
  onSend,
}: {
  rating: AgentChatTurnFeedback;
  isActive: boolean;
  onChange: (feedback: AgentChatTurnFeedback | null) => void;
  onSend?: AgentChatMessagesProps['onFeedbackSend'];
}) {
  const { Icon, actionLabel, markClassName } = FEEDBACK_SENTIMENT[rating.rate];
  const { isThinking, isAgentReady, isFetchingMessages } = useAgentChat();
  const [open, setOpen] = React.useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && isActive) {
          onChange(null);
          return;
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        aria-pressed={isActive}
        aria-label={actionLabel}
        title={actionLabel}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
          agentChatTurnActionClassName,
          markClassName,
        )}
      >
        <Icon />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        alignOffset={AGENT_CHAT_TURN_FEEDBACK_MENU_ALIGN_OFFSET}
        className={agentChatTurnFeedbackMenuClassName}
      >
        <span aria-hidden className={agentChatTurnFeedbackArrowClassName} />
        {onSend && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={isThinking || !isAgentReady || isFetchingMessages}
              onClick={() => {
                setOpen(false);
                void onSend(rating);
              }}
            >
              Send
            </Button>
            <Separator orientation="vertical" />
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            setOpen(false);
            onChange(rating);
          }}
        >
          Add comment
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * An agent's structured answer: the step's chat component when it named one and
 * the component is here, else the YAML block. A component that fails to render
 * falls back to YAML too.
 */
function StructuredOutputAnswer({
  structured,
  size,
  className,
}: {
  structured: StructuredOutput;
  size?: 'sm' | 'md' | 'lg' | null;
  className?: string;
}) {
  const chat = useAgentChat();
  // Same skew guard as the hooks above: an installed react-common older than this
  // field has no loading signal, so treat components as loaded.
  const componentsLoading =
    (chat as { componentsLoading?: boolean }).componentsLoading === true;
  const [failed, setFailed] = React.useState(false);
  const onError = React.useCallback(() => setFailed(true), []);
  // `structuredOutputOf` re-parses on every chat re-render (each streamed token,
  // each keystroke); a content-keyed copy keeps `props` stable so the live
  // component doesn't remount and lose its state.
  const valueJson = JSON.stringify(structured.value);
  const value = React.useMemo(
    () => JSON.parse(valueJson) as unknown,
    [valueJson],
  );
  const component = structured.componentId
    ? chat.components.find((c) => c.id === structured.componentId)
    : undefined;

  if (structured.componentId && !failed && isPlainObject(value)) {
    if (component && !component.userInterrupt) {
      return (
        <AgentChatMessagePart
          data-structured-output="component"
          size={size}
          role="assistant"
          className={cn(CHAT_COMPONENT_MESSAGE_PART_CLASS_NAME, className)}
        >
          <ChatCodeComponent
            status={AgentChatPrimitive.ToolCallStatus.Complete}
            code={component.code}
            props={value}
            onError={onError}
          />
        </AgentChatMessagePart>
      );
    }
    if (!component && componentsLoading) {
      return (
        <AgentChatMessagePart
          data-structured-output="loading"
          aria-busy
          size={size}
          role="assistant"
          className={cn(CHAT_COMPONENT_MESSAGE_PART_CLASS_NAME, className)}
        >
          <Skeleton className="h-24 w-full rounded-xl" />
        </AgentChatMessagePart>
      );
    }
  }

  return (
    <AgentChatMessageTextPart
      data-structured-output="yaml"
      size={size}
      role="assistant"
      text={structuredOutputToYamlBlock(value)}
      isStreaming={false}
      className={cn(agentChatStructuredOutputVariants(), className)}
    />
  );
}

export function AgentChatMessage({
  messageId,
  size = 'md',
  isStreaming,
  className,
}: AgentChatMessageProps &
  VariantProps<typeof agentChatMessageGroupVariants> &
  React.ComponentProps<'div'>) {
  const { messageById, toolMessages, renderToolCall } = useAgentChat();
  const message = messageById.get(messageId);

  if (!message) {
    return null;
  }

  if (message.role !== 'user' && message.role !== 'assistant') {
    return null;
  }

  // Flagged by the server (a Send Message step with a schema). An older runtime
  // strips `metadata`; the message then renders as before.
  const structured = isStructuredOutputMessage(message)
    ? structuredOutputOf(message)
    : null;
  // A ToolStrategy answer is a tool call. It is the answer, not a tool step, so
  // `hideToolsUi` does not hide it (chat components follow the same rule).
  const structuredToolCallId =
    structured?.kind === 'toolCall' ? structured.toolCallId : undefined;

  const toolCallElements =
    message.role === 'assistant'
      ? message.toolCalls
          ?.map((toolCall) => {
            if (structured && toolCall.id === structuredToolCallId) {
              return (
                <StructuredOutputAnswer
                  key={toolCall.id}
                  structured={structured}
                  size={size}
                />
              );
            }
            return renderToolCall({
              toolCall,
              toolMessage: toolMessages.find(
                (m) => m.toolCallId === toolCall.id,
              ),
            });
          })
          .filter((element) => element !== null) || []
      : [];

  const leadingRate = leadingFeedbackRateOf(message);
  const hidesFeedbackTag = isFeedbackMessage(message);
  // A thumb + comment is [marker, line, comment]: the first two text parts are the agent's
  // context, not the user's words.
  const textPartTexts =
    typeof message.content === 'string'
      ? [message.content]
      : (message.content ?? []).flatMap((part) =>
          part.type === 'text' ? [part.text] : [],
        );
  const isHiddenText = (text: string, textIndex = 0) =>
    (hidesFeedbackTag && isFeedbackTag(text)) ||
    (leadingRate !== null &&
      (textIndex === 0 ||
        (textIndex === 1 && isFeedbackRefLine(textPartTexts[1] ?? ''))));

  return (
    <>
      {structured?.kind === 'content' ? (
        <StructuredOutputAnswer
          structured={structured}
          size={size}
          className={className}
        />
      ) : message.content ? (
        typeof message.content === 'string' ? (
          isHiddenText(message.content) ? null : (
            <AgentChatMessageTextPart
              size={size}
              role={message.role}
              text={message.content}
              isStreaming={isStreaming}
              className={className}
            />
          )
        ) : (
          message.content.map((part, index, parts) => {
            const textIndex = parts
              .slice(0, index)
              .filter((p) => p.type === 'text').length;
            return (
              <React.Fragment
                key={`message-${message.id}-part-${part.type}-${index}`}
              >
                {part.type === 'text' &&
                  !isHiddenText(part.text, textIndex) && (
                    <AgentChatMessageTextPart
                      size={size}
                      role={message.role}
                      text={part.text}
                      isStreaming={isStreaming}
                      className={className}
                    />
                  )}
                {(part.type === 'document' ||
                  part.type === 'image' ||
                  part.type === 'video') && (
                  <AgentChatMessageFilePart
                    size={size || 'md'}
                    className={className}
                    attachment={{
                      url: part.source.value,
                      fileName:
                        (part.metadata as { filename?: string })?.filename ??
                        '',
                      fileType: part.source.mimeType ?? '',
                    }}
                  />
                )}
              </React.Fragment>
            );
          })
        )
      ) : null}
      {toolCallElements.map((toolCallElement, index) => {
        return (
          <React.Fragment key={`message-${messageId}-tool-call-${index}`}>
            {toolCallElement}
          </React.Fragment>
        );
      })}
    </>
  );
}

export interface AgentChatThinkingProps {
  size?: 'sm' | 'md' | 'lg';
}

export function AgentChatThinking(
  _props: AgentChatThinkingProps & React.ComponentProps<'div'>,
) {
  return null;
}

export function AgentChatFetching({
  size = 'md',
  className,
  ...props
}: VariantProps<typeof agentChatFetchingContentVariants> &
  React.ComponentProps<'div'>) {
  return (
    <AgentChatPrimitive.AgentChatFetching
      className={cn(agentChatFetchingOverlayVariants(), className)}
      {...props}
    >
      <div className={agentChatFetchingContentVariants({ size })}>
        <Loader2 className="animate-spin text-muted-foreground/60" />
      </div>
    </AgentChatPrimitive.AgentChatFetching>
  );
}

export interface AgentChatProps {
  agentChat: SDKAgentChat;
  /**
   * @deprecated Pass `defaultThreadId`. A `chatId` alone opens the thread derived from it, so
   * existing apps keep their conversations.
   */
  chatId?: string;
  /**
   * The thread to open. Without it, a signed-in user resumes their most recent thread with the
   * agent (else a new one); an anonymous visitor gets a new thread on every mount.
   */
  defaultThreadId?: string;
  noPersistency?: boolean;
  chatContext?: any;
  chatContextFiles?: Attachment[];
  useAgentBlockDirectChat?: boolean;
  children?: React.ReactNode;
  /** After a user send; second arg optional on older react-common (`name` marks feedback). */
  onUserMessageSent?: (text: string, message?: { name?: string }) => void;
  /**
   * Skip the agent-chat's `initialPrompt` auto-send. Set by surfaces that mint a
   * fresh thread per conversation (the agent inbox), where the auto-send would index
   * a ghost turn for every draft.
   */
  disableInitialPrompt?: boolean;
  /**
   * Fires when the agent-chat block or its agent can't be loaded (a failed request, or
   * no such block). The chat renders nothing in that state, so a host that gates its own
   * chrome on the chat resolving (the agent layout) shows an error instead of waiting.
   */
  onLoadError?: (error: Error) => void;
}

/* ------------------------------------------------------------------------------------ */
/* Persona helpers — shared by every surface that shows the agent's or the user's face  */
/* ------------------------------------------------------------------------------------ */

/** What to call an agent: its title, else its job title (a brand-new agent has no title yet). */
export const agentDisplayName = (
  agent: { title?: string; jobTitle?: string } | null | undefined,
): string => agent?.title || agent?.jobTitle || 'Agent';

/**
 * An avatar fallback for a name: the first letters of its first two words, or the first
 * two letters of a single word, uppercased ("Support Bot" → "SB", "Leo" → "LE").
 */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  // Code points, not code units — a name starting with an emoji must not split it.
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[1])[0]];
  return letters.join('').toUpperCase();
};

/** The agent's avatar fallback: the initials of its display name. */
export const agentInitials = (
  agent: { title?: string; jobTitle?: string } | null | undefined,
): string => initialsOf(agentDisplayName(agent));

/**
 * The signed-in user's avatar fallback: first + last initials, else the initials of the
 * name or email, else "U".
 */
export const userInitials = (user: {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
}): string =>
  initialsOf([user.firstName, user.lastName].filter(Boolean).join(' ')) ||
  initialsOf(user.name || user.email || '') ||
  'U';

export function AgentChat({
  agentChat,
  chatContext,
  noPersistency,
  useAgentBlockDirectChat,
  ...props
}: AgentChatProps) {
  const client = useClient();
  const user = client.getUser();
  const agentChatProps = agentChat.getAgentChatComponentProps() as ReturnType<
    typeof agentChat.getAgentChatComponentProps
  > & {
    agentId?: string;
    componentIds?: string[];
  };
  const { agentChatId, agentId, componentIds, appId, token } = agentChatProps;

  const finalChatContext = {
    currentUserData: user,
    chatContext,
  };

  return (
    <AgentChatProductTypesProvider value={ProductTypes}>
      <AgentChatPrimitive.AgentChatRoot
        appId={appId}
        token={token}
        agentId={agentId}
        useAgentBlockDirectChat={useAgentBlockDirectChat}
        agentChatId={agentChatId}
        noPersistency={noPersistency ?? !user.isAuthenticated}
        chatContext={finalChatContext}
        componentIds={componentIds}
        supportsServerInterrupt
        {...props}
      />
    </AgentChatProductTypesProvider>
  );
}

// What tool approval adds to react-common's `useAgentChat()`. Read through
// this cast: an older react-common lacks the fields, and then no card is drawn.
interface ToolApprovalChat {
  approvalCardsFor?: (toolCallId: string) => ToolApprovalCardView[];
  // Absent on older react-common copies: the step then shows the raw tool name.
  toolTitleFor?: (toolCallId: string, toolName: string) => string;
  decideApproval?: (decision: {
    interruptId: string;
    index: number;
    decision: 'approve' | 'edit' | 'reject';
    args?: Record<string, unknown>;
  }) => Promise<void>;
}

// Same rule as react-common's `toolStepVisibleBelowCards`, inlined for older
// react-common copies: a sub-agent's `task` step always renders under its cards; a
// parent call's only once approved and sent (while waiting it has not run; a
// rejected call never runs; an approval waiting for the pause's other cards has not
// been sent yet).
const toolStepVisibleBelowCards = (
  toolName: string,
  cards: ToolApprovalCardView[],
): boolean =>
  toolName === 'task' ||
  cards.every(
    (card) => card.status === 'approved' && card.waitingForOthers !== true,
  );

function useFinishedTaskIds(): ReadonlySet<string> {
  const { messages } = useAgentChat();
  return React.useMemo(
    () => finishedTaskIdsOf((messages ?? []) as never[]),
    [messages],
  );
}

// A component, not inline JSX: `useDefaultRenderTool` freezes its `render` closure to
// the deps below, and the cards must follow the chat's pending state.
function DefaultToolCallPart({
  size,
  hidden,
  name,
  toolCallId,
  parameters,
  status,
  result,
}: {
  size: 'sm' | 'md' | 'lg';
  hidden: boolean;
  name: string;
  toolCallId: string;
  parameters: unknown;
  status: ToolFallbackStatus;
  result?: string;
}) {
  const chat = useAgentChat();
  const { approvalCardsFor, decideApproval, toolTitleFor } =
    chat as ToolApprovalChat;
  const cards = approvalCardsFor?.(toolCallId) ?? [];
  const finishedTaskIds = useFinishedTaskIds();
  const taskId = longRunningTaskIdOf(
    typeof result === 'string' ? result : undefined,
  );
  const background = taskId
    ? finishedTaskIds.has(taskId)
      ? 'finished'
      : 'running'
    : undefined;
  const step = (
    <ToolCallFallback
      name={toolTitleFor?.(toolCallId, name) ?? name}
      parameters={parameters}
      status={status}
      result={result}
      size={size}
      background={background}
    />
  );

  // Cards show even with `hideToolsUi`: the run cannot go on without them.
  if (cards.length > 0) {
    return (
      <AgentChatMessagePart size={size} className="w-full">
        <div className="flex w-full flex-col gap-2">
          {cards.map((card) => (
            <ToolApprovalCard
              key={card.key}
              card={card}
              disabled={chat.isThinking}
              renderDetails={(value) => (
                <AgentChatMessageTextPart
                  data-structured-output="yaml"
                  size={size}
                  role="assistant"
                  text={structuredOutputToYamlBlock(value)}
                  isStreaming={false}
                  className={agentChatStructuredOutputVariants()}
                />
              )}
              onDecide={
                card.request && decideApproval
                  ? (decision) => decideApproval({ ...card.request!, decision })
                  : undefined
              }
            />
          ))}
          {!hidden && toolStepVisibleBelowCards(name, cards) ? step : null}
        </div>
      </AgentChatMessagePart>
    );
  }
  if (hidden) {
    return <></>;
  }
  return <AgentChatMessagePart size={size}>{step}</AgentChatMessagePart>;
}

const DefaultToolCall = ({
  size = 'md',
  hidden = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  hidden?: boolean;
}) => {
  AgentChatPrimitive.useDefaultRenderTool(
    {
      render: ({ name, toolCallId, parameters, status, result }) => (
        <DefaultToolCallPart
          size={size}
          hidden={hidden}
          name={name}
          toolCallId={toolCallId}
          parameters={parameters}
          status={status}
          result={result}
        />
      ),
    },
    [hidden, size],
  );

  return null;
};

// The self-config tool's own card: the agent's short summary of the change with Approve and
// Reject while it waits (nothing to edit; the full request behind it under a collapsed Show
// details), and once approved, where the change continues (a
// feedback thread) or that it started here. A component, not inline JSX: `useRenderTool`
// freezes its `render` closure.
function UpdateMyConfigurationToolCall({
  size = 'md',
  toolCallId,
  parameters,
  status,
  result,
}: {
  size?: 'sm' | 'md' | 'lg';
  toolCallId: string;
  parameters: unknown;
  status?: string;
  result?: string;
}) {
  const chat = useAgentChat();
  const { approvalCardsFor, decideApproval, toolTitleFor } =
    chat as ToolApprovalChat;
  const links = React.useContext(AgentFeedbackLinksContext);
  const cards = approvalCardsFor?.(toolCallId) ?? [];
  const cardText = updateConfigCardText(parameters);
  const detailsText = updateConfigDetailsText(parameters);
  const outcome = updateConfigOutcomeOf(result, toolCallId);
  const finishedTaskIds = useFinishedTaskIds();
  const backgroundTaskId =
    outcome.kind === 'started' ? outcome.taskId : undefined;
  const step = (
    <ToolCallFallback
      name={
        toolTitleFor?.(toolCallId, UPDATE_CONFIG_TOOL_NAME) ??
        UPDATE_CONFIG_TOOL_NAME
      }
      parameters={parameters}
      status={status as ToolFallbackStatus}
      result={result}
      size={size}
      background={
        backgroundTaskId
          ? finishedTaskIds.has(backgroundTaskId)
            ? 'finished'
            : 'running'
          : undefined
      }
    />
  );

  const unavailable =
    outcome.kind === 'unavailable' ? (
      <p className="text-sm text-muted-foreground">
        The approval card couldn&apos;t be shown here, so nothing changed.
      </p>
    ) : null;

  // No card: Talk to <agent> (no approval), or a chat before tool approvals.
  if (cards.length === 0) {
    return (
      <AgentChatMessagePart size={size}>
        {unavailable ?? step}
      </AgentChatMessagePart>
    );
  }

  return (
    <AgentChatMessagePart size={size} className="w-full">
      <div className="flex w-full flex-col gap-2">
        {cards.map((card) => {
          const shownText =
            card.status === 'waiting'
              ? cardText
              : updateConfigShownText(card.args, cardText);
          const changeParagraph = shownText ? (
            <p className="text-sm break-words whitespace-pre-wrap">
              {shownText}
            </p>
          ) : undefined;
          if (card.status !== 'waiting') {
            return (
              <RuleDecisionCard
                key={card.key}
                text={shownText}
                decision={card.status}
                onOpen={
                  outcome.kind === 'moved' && links
                    ? () => links.openThread(outcome.feedbackThreadId)
                    : undefined
                }
              />
            );
          }
          return (
            <ToolApprovalCard
              key={card.key}
              card={{ ...card, title: UPDATE_CONFIG_TITLE }}
              disabled={chat.isThinking}
              summary={changeParagraph}
              renderDetails={
                detailsText
                  ? () => (
                      <p
                        dir="auto"
                        data-slot="update-config-details"
                        className="text-xs break-words whitespace-pre-wrap text-muted-foreground"
                      >
                        {detailsText}
                      </p>
                    )
                  : undefined
              }
              onDecide={
                card.request && decideApproval
                  ? (decision) => decideApproval({ ...card.request!, decision })
                  : undefined
              }
            />
          );
        })}
        {unavailable}
        {outcome.kind === 'other' ||
        backgroundTaskId ||
        (outcome.kind === 'failed' &&
          cards.some((card) => card.status === 'approved'))
          ? step
          : null}
      </div>
    </AgentChatMessagePart>
  );
}

// A renderer only: the backend declares the tool.
const UpdateMyConfigurationRegistration = ({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg';
}) => {
  AgentChatPrimitive.useRenderTool(
    {
      name: UPDATE_CONFIG_TOOL_NAME,
      parameters: z.object({}).loose(),
      render: (props) => (
        <UpdateMyConfigurationToolCall size={size} {...props} />
      ),
    },
    [size],
  );

  return null;
};

const GetUserChoiceToolRegistration = ({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg';
}) => {
  AgentChatPrimitive.useHumanInTheLoop(
    {
      name: GET_USER_CHOICE_TOOL_NAME,
      description: GET_USER_CHOICE_TOOL_DESCRIPTION,
      parameters: getUserChoiceParametersSchema,
      render: (renderProps) => {
        return (
          <AgentChatMessagePart size={size} role="assistant">
            <GetUserChoiceToolResult
              args={renderProps.args}
              result={renderProps.result}
              respond={renderProps.respond}
            />
          </AgentChatMessagePart>
        );
      },
    },
    [size],
  );

  return null;
};

const GenerateDynamicChatComponentToolCall = ({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg';
}) => {
  AgentChatPrimitive.useRenderTool(
    {
      name: GENERATE_DYNAMIC_CHAT_COMPONENT_TOOL_NAME,
      parameters: z.object({}).loose(),
      render: ({ toolCallId, status, result, parameters }) => {
        if (status !== AgentChatPrimitive.ToolCallStatus.Complete || !result) {
          return <></>;
        }

        return (
          <AgentChatMessagePart
            size={size}
            className={CHAT_COMPONENT_MESSAGE_PART_CLASS_NAME}
          >
            <GenerateDynamicChatComponentToolResult
              toolCallId={toolCallId}
              status={status as AgentChatPrimitive.ToolCallStatus}
              result={result}
              parameters={parameters}
              size={size}
            />
          </AgentChatMessagePart>
        );
      },
    },
    [size],
  );

  return null;
};

const typedMessageOf = (result?: string): string | undefined => {
  if (!result) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(result) as { typedMessage?: unknown };
    const text = parsed?.typedMessage;
    return typeof text === 'string' && text.trim() !== '' ? text : undefined;
  } catch {
    return undefined;
  }
};

function ChatComponentServerInterrupt({
  size = 'md',
  component,
  toolCallId,
  parameters,
  status,
  result,
}: {
  size?: 'sm' | 'md' | 'lg';
  component: AgentChatComponent;
  toolCallId: string;
  parameters: Record<string, unknown>;
  status: string;
  result?: string;
}) {
  const { isThinking, answerInterrupt } = useAgentChat();

  const respond =
    result || isThinking
      ? undefined
      : async (answer: unknown) => {
          await answerInterrupt({ toolCallId, answer });
        };

  const typedMessage = typedMessageOf(result);

  return (
    <AgentChatMessagePart
      size={size}
      role="assistant"
      className={CHAT_COMPONENT_MESSAGE_PART_CLASS_NAME}
    >
      <ChatComponentToolResult
        status={status as AgentChatPrimitive.ToolCallStatus}
        component={component}
        parameters={parameters}
        respond={respond}
        result={result}
      />
      {typedMessage ? (
        <div className="mt-3">
          <TypedAnswer text={typedMessage} size={size} />
        </div>
      ) : null}
    </AgentChatMessagePart>
  );
}

const ChatComponentServerInterruptToolCall = ({
  size = 'md',
  component,
}: {
  size?: 'sm' | 'md' | 'lg';
  component: AgentChatComponent;
}) => {
  const toolName = `ask-component-${AgentChatPrimitive.getAgentChatComponentToolName(
    component.name,
  )}`;

  AgentChatPrimitive.useRenderTool(
    {
      name: toolName,
      parameters: z.object({}).loose(),
      render: (props) => (
        <ChatComponentServerInterrupt
          size={size}
          component={component}
          {...props}
        />
      ),
    },
    [component, size, toolName],
  );

  return null;
};

const ChatComponentRenderToolCall = ({
  size = 'md',
  component,
}: {
  size?: 'sm' | 'md' | 'lg';
  component: AgentChatComponent;
}) => {
  const parametersSchema = React.useMemo(
    () => getChatComponentParametersSchema(component),
    [component],
  );
  const toolName = `show-component-${AgentChatPrimitive.getAgentChatComponentToolName(
    component.name,
  )}`;

  AgentChatPrimitive.useFrontendTool(
    {
      name: toolName,
      description: component.description,
      parameters: parametersSchema,
      handler: async () =>
        `<prebuilt_chat_component_rendered tool="${toolName}" component="${component.name}" status="success" />`,
      render: ({ status, args }) => {
        return (
          <AgentChatMessagePart
            size={size}
            role="assistant"
            className={CHAT_COMPONENT_MESSAGE_PART_CLASS_NAME}
          >
            <ChatComponentToolResult
              status={status as AgentChatPrimitive.ToolCallStatus}
              component={component}
              parameters={args as Record<string, unknown>}
            />
          </AgentChatMessagePart>
        );
      },
    },
    [component, parametersSchema, size, toolName],
  );

  return null;
};

/** Has enough of the call streamed in to draw it? Args arrive token by token. */
const isCompleteAskUserQuestion = (
  args: AskUserParameters,
  argsSettled: boolean,
) => {
  const isFilled = (value: unknown) =>
    typeof value === 'string' && value.trim() !== '';

  // A question OR an answer control is enough. The welcome seed sends `question`
  // as "" whenever the chat's Question field was never authored -- which is every
  // config predating that field -- and the card renders those fine: the label goes
  // `sr-only` and the options carry the turn.
  const hasOption = Array.isArray(args.options) && args.options.length > 0;
  if (!isFilled(args.question) && !hasOption) {
    return false;
  }

  // Nothing to wait for: a text question has no control, and no options will ever
  // arrive for one.
  if (args.type === 'text') {
    return true;
  }

  // `some`, never `every`: options stream in, so the array passes through
  // [complete, partial], where `every` is false -- unmounting the whole part and
  // remounting it, once per arriving option. `some` only goes false -> true.
  const hasUsableOption =
    Array.isArray(args.options) &&
    args.options.some(
      (option) => isFilled(option?.value) && isFilled(option?.label),
    );

  if (hasUsableOption) {
    return true;
  }

  // An optionless select is malformed but answerable via the automatic Other.
  // Only once SETTLED: while args stream, empty `options` just means "not yet".
  return argsSettled;
};

// A renderer only: the backend declares `ask_user`, and registering the name here
// too would be a duplicate declaration, which Anthropic rejects outright.
//
// A component, not inline JSX, because `useRenderTool` freezes the `render` closure
// for the life of the registration — anything live has to be read inside the tree.
function AskUserToolCall({
  size = 'md',
  toolCallId,
  parameters,
  result,
  status,
}: {
  size?: 'sm' | 'md' | 'lg';
  toolCallId: string;
  parameters: Record<string, unknown>;
  result?: string;
  status?: string;
}) {
  const { isThinking, answerInterrupt } = useAgentChat();
  const args = parameters as AskUserParameters;
  // NOT `=== Complete`: that status carries a result, so under `!result` it can
  // never hold and the optionless-select rescue below would be dead. Args have
  // finished streaming for every status except InProgress.
  const argsSettled =
    status !== (AgentChatPrimitive.ToolCallStatus.InProgress as string);

  // Hand-rolled rather than a `safeParse`: the backend owns validation, and a
  // strict parse would blank the card over a field this renderer ignores. Arguments
  // also arrive token by token, so a half-streamed question must not draw.
  if (!result && !isCompleteAskUserQuestion(args, argsSettled)) {
    return null;
  }

  // Answered, or a run in flight: omitting `respond` is what read-only means to
  // `GetUserChoiceTool`.
  const respond =
    result || isThinking
      ? undefined
      : async (answer: unknown) => {
          await answerInterrupt({ toolCallId, answer });
        };

  return (
    <AgentChatMessagePart size={size} role="assistant" className="w-full">
      <GetUserChoiceToolResult args={args} result={result} respond={respond} />
    </AgentChatMessagePart>
  );
}

// Driven only by the transcript, never by the interrupt stream: a parked question
// arrives from BOTH (persisted, and re-emitted as an interrupt on every reconnect),
// so rendering both would draw it twice.
const AskUserToolCallRegistration = ({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg';
}) => {
  AgentChatPrimitive.useRenderTool(
    {
      name: ASK_USER_TOOL_NAME,
      parameters: z.object({}).loose(),
      // `deps` must stay `[size]`: re-registering hands subscribers a new render
      // identity, React remounts the subtree, and the card loses the answer the
      // user just picked.
      render: (props) => <AskUserToolCall size={size} {...props} />,
    },
    [size],
  );

  return null;
};

// HITL chat_component (`userInterrupt`) paused in the BROWSER: CopilotKit holds the
// handler promise, `respond(payload)` resolves it, and the payload comes back as an
// ordinary tool RESULT — not a LangGraph `Command(resume=...)`.
const ChatComponentInterruptToolCall = ({
  size = 'md',
  component,
}: {
  size?: 'sm' | 'md' | 'lg';
  component: AgentChatComponent;
}) => {
  const parametersSchema = React.useMemo(
    () => getChatComponentParametersSchema(component),
    [component],
  );
  const toolName = `show-component-${AgentChatPrimitive.getAgentChatComponentToolName(
    component.name,
  )}`;

  AgentChatPrimitive.useHumanInTheLoop(
    {
      name: toolName,
      description: component.description,
      parameters: parametersSchema,
      render: (renderProps) => {
        // `result` is the payload the user previously sent via `respond(...)`.
        // On reload the HITL tool call is replayed WITH its result, so we feed
        // it back into the component (see ChatCodeComponent's `result`) so it
        // can rehydrate its answered state instead of rendering fresh.
        const { status, args, respond, result } = renderProps;
        return (
          <AgentChatMessagePart
            size={size}
            role="assistant"
            className={CHAT_COMPONENT_MESSAGE_PART_CLASS_NAME}
          >
            <ChatComponentToolResult
              status={status as AgentChatPrimitive.ToolCallStatus}
              component={component}
              parameters={args as Record<string, unknown>}
              respond={respond}
              result={result}
            />
          </AgentChatMessagePart>
        );
      },
    },
    [component, parametersSchema, size, toolName],
  );

  return null;
};

export type AgentChatContentProps = VariantProps<
  typeof agentChatContentVariants
> &
  React.ComponentProps<'div'>;

const ChatComponentToolCall = ({
  size = 'md',
  component,
}: {
  size?: 'sm' | 'md' | 'lg';
  component: AgentChatComponent;
}) => {
  if (component.userInterrupt) {
    // Both, always: the two carry DIFFERENT tool names and the backend strips
    // whichever it takes over, so the model is still offered exactly one. Picking
    // one here would depend on server state this file cannot see.
    return (
      <>
        <ChatComponentInterruptToolCall size={size} component={component} />
        <ChatComponentServerInterruptToolCall
          size={size}
          component={component}
        />
      </>
    );
  }
  return <ChatComponentRenderToolCall size={size} component={component} />;
};

export function AgentChatContent({
  size = 'md',
  className,
  ...props
}: VariantProps<typeof agentChatContentVariants> &
  React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="agent-chat-content"
      className={cn(agentChatContentVariants({ size }), className)}
      {...props}
    />
  );
}

export interface AgentChatMessagesProps {
  /**
   * The time of a turn under its messages, revealed on hover (the run's start — what
   * ChatGPT-style UIs show). Only for turns the platform has a time for: threads from
   * before run times show none.
   */
  showTimestamps?: boolean;
  /** date-fns format of that time (default `HH:mm`); turns from another day get the day first. */
  dateFormat?: string;
  hideAvatar?: boolean;
  messageClassName?: string;
  /**
   * Open the conversation at an agent run (turn): the `agentRunId` a row the agent wrote
   * carries (`metadata.$row.createdByAgentRunId`, or a column's `updatedByAgentRunId`).
   * Once the transcript replays, the run's first message is scrolled into view and its
   * messages are tinted briefly. A no-op when the run is not in this conversation — an
   * older thread, or a run from another conversation.
   */
  focusRunId?: string;
  /**
   * A host's rendering for one message in place of the bubble: return an element for it,
   * `null` to hide the message, or `undefined` to keep the default. Called per message.
   */
  renderMessage?: (
    args: AgentChatMessageSlotArgs,
  ) => React.ReactNode | undefined;
  feedback?: AgentChatTurnFeedback | null;
  onFeedbackChange?: (feedback: AgentChatTurnFeedback | null) => void;
  /**
   * Send a rating as it is, no comment — a thumb's **Send**. Without it a thumb offers only
   * **Add comment** (`onFeedbackChange`).
   */
  onFeedbackSend?: (feedback: AgentChatTurnFeedback) => void | Promise<void>;
}

export type AgentChatMessagesComponentProps = AgentChatMessagesProps &
  VariantProps<typeof agentChatMessagesVariants> &
  React.ComponentProps<'div'>;

/**
 * The chat's wire tool registrations (frontend tools, HITL, chat components) — the
 * hooks are provider-context registrations, so this renders nothing. Kept as one unit
 * so the transcript view and the empty-state hero branch register the exact same set:
 * whichever of the two is mounted, the next run's payload advertises the full toolset.
 */
function AgentChatToolRegistrations({
  size,
}: {
  size?: 'sm' | 'md' | 'lg' | null;
}) {
  const { agentChat, components } = useAgentChat();
  const resolvedSize = size ?? 'md';

  return (
    <>
      <GetUserChoiceToolRegistration size={resolvedSize} />
      <AskUserToolCallRegistration size={resolvedSize} />
      <UpdateMyConfigurationRegistration size={resolvedSize} />
      <DefaultToolCall
        size={resolvedSize}
        hidden={agentChat?.hideToolsUi === true}
      />
      {!agentChat ||
      agentChat.disableGeneratingDynamicChatComponent === true ? null : (
        <GenerateDynamicChatComponentToolCall size={resolvedSize} />
      )}
      {components.map((component) => (
        <ChatComponentToolCall
          size={resolvedSize}
          component={component}
          key={`chat-component-tool-call-${component.id}`}
        />
      ))}
    </>
  );
}

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 5) {
    return 'Good evening';
  }
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
};

export interface AgentChatWelcomeProps extends React.ComponentProps<'div'> {
  /** Starter prompts shown as chips; each sends as the conversation's first message. */
  suggestions?: string[];
}

/**
 * The built-in welcome for a conversation with no messages yet: the agent's face (the
 * persona the chat runtime resolved), a time-of-day greeting with the signed-in user's
 * first name, and the host's suggestion chips. Renders inside the chat provider, so a
 * chip sends through the exact composer pipeline (same readiness gate as the send button).
 * `AgentChatMessagesOrEmpty` mounts it when `suggestions` is passed; hosts can also render
 * it themselves as an `emptyState`.
 */
export function AgentChatWelcome({
  suggestions = [],
  className,
  ...props
}: AgentChatWelcomeProps) {
  const { agent, sendMessage, isThinking, isAgentReady, isFetchingMessages } =
    useAgentChat();
  const { firstName } = useUser();
  const canSendMessage = isAgentReady && !isThinking && !isFetchingMessages;
  const name = agentDisplayName(agent);

  return (
    <Empty data-slot="agent-chat-welcome" className={className} {...props}>
      <EmptyHeader>
        <EmptyMedia>
          <Avatar className="size-16">
            <AvatarImage src={agent?.photoUrl} alt={name} />
            <AvatarFallback className="text-lg">
              {agentInitials(agent)}
            </AvatarFallback>
          </Avatar>
        </EmptyMedia>
        <EmptyTitle>
          {firstName ? `${getGreeting()}, ${firstName}` : getGreeting()}
        </EmptyTitle>
        <EmptyDescription>
          {suggestions.length > 0
            ? `Pick a prompt or write your own to start a conversation with ${name}.`
            : `Send a message to start a conversation with ${name}.`}
        </EmptyDescription>
      </EmptyHeader>
      {suggestions.length > 0 && (
        // max-w widened for layout only: three chips should sit on one line when they fit.
        <EmptyContent className="max-w-xl flex-row flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="sm"
              disabled={!canSendMessage}
              // Same rejection guard as the composer path: sendMessage rethrows run failures.
              onClick={() =>
                void sendMessage({ content: suggestion }).catch(() => undefined)
              }
            >
              {suggestion}
            </Button>
          ))}
        </EmptyContent>
      )}
    </Empty>
  );
}

/**
 * Swaps the transcript area for an empty-state hero while the conversation has no
 * messages yet — the provider, composer, and voice stack around it stay untouched.
 * `suggestions` turns on the built-in `AgentChatWelcome` (pass `[]` for the welcome
 * without chips); `emptyState` replaces it with the host's own hero.
 * The fetching gate hides the hero during replay, but readiness can flip true a frame
 * before replayed messages land — hosts that must never flash the hero over an existing
 * conversation should enable it only when the conversation is known to be new
 * (the agent layout does so on its new-chat page only). The wire tool
 * registrations normally live inside AgentChatMessages, which the hero branch unmounts —
 * and the first send builds its request payload synchronously, before any re-render can
 * mount them — so the hero branch re-registers them itself; without that, the first
 * turn of every fresh conversation would advertise zero frontend tools.
 * A custom hero can call `useAgentChat()` (e.g. `sendMessage`) since it renders inside
 * the chat provider.
 */
export function AgentChatMessagesOrEmpty({
  emptyState,
  suggestions,
  assumeEmpty = false,
  ...messagesProps
}: AgentChatMessagesComponentProps & {
  emptyState?: React.ReactNode;
  suggestions?: string[];
  /**
   * The host KNOWS this conversation has no messages (a draft nothing was ever sent in):
   * show the hero at once instead of waiting for the connect round-trip to confirm the
   * obvious. Never set it for a conversation that may have history — the fetching gate
   * is what keeps the hero from flashing over a replay.
   */
  assumeEmpty?: boolean;
}) {
  const { messages, isFetchingMessages } = useAgentChat();
  const hero =
    emptyState ??
    (suggestions ? <AgentChatWelcome suggestions={suggestions} /> : undefined);
  // "Has messages" means something a person can read: a user message, or an assistant
  // message with text or tool calls. The runtime holds a content-less assistant message
  // while a run is open — including the connect run that opens a fresh thread — and that
  // placeholder must not push the welcome out for the duration of a round-trip.
  const hasMessages = messages.some(
    (message) =>
      message.role === 'user' ||
      (typeof message.content === 'string'
        ? message.content.trim().length > 0
        : Array.isArray(message.content) && message.content.length > 0) ||
      ('toolCalls' in message &&
        Array.isArray(message.toolCalls) &&
        message.toolCalls.length > 0),
  );

  if (hero && (assumeEmpty || !isFetchingMessages) && !hasMessages) {
    return (
      <div
        data-slot="agent-chat-empty-state"
        className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto"
      >
        <AgentChatToolRegistrations size={messagesProps.size} />
        {/* my-auto, not justify-center: in a scroll container, justify-center clips the
            top of an overflowing hero beyond scroll reach; auto margins center only
            when there's room. */}
        <div className="my-auto">{hero}</div>
      </div>
    );
  }

  return <AgentChatMessages {...messagesProps} />;
}

export function AgentChatMessages({
  size = 'md',
  hideAvatar = false,
  showTimestamps = true,
  dateFormat = 'HH:mm',
  messageClassName,
  focusRunId,
  renderMessage,
  feedback,
  onFeedbackChange,
  onFeedbackSend,
  className,
  ...props
}: AgentChatMessagesComponentProps) {
  const { messageGroups } = useAgentChat();
  const resolvedSize = size ?? 'md';
  // Groups that ARRIVE fade in — a replayed transcript as a whole, a live turn one group
  // at a time — so a conversation switch shows nothing, then the messages, with no
  // loading chrome in between. Groups already on screen when this list mounts (a route
  // change re-rendering an ongoing conversation, e.g. the first send's URL swap) must not
  // blink, so the set present at mount is captured once and excluded.
  const [groupsPresentAtMount] = React.useState(
    () => new Set(messageGroups.map((group) => group.messageIds[0])),
  );

  return (
    <AgentChatPrimitive.AgentChatMessages
      className={cn(
        agentChatMessagesVariants({ size: resolvedSize }),
        className,
      )}
      scrollAreaClassName="relative"
      // Only when set: an installed react-common older than run focus would forward the
      // unknown prop to its DOM node.
      {...(focusRunId ? { focusRunId } : {})}
      {...props}
    >
      <AgentChatToolRegistrations size={resolvedSize} />
      {messageGroups.map((messageGroup, index) => (
        // Keyed by the first message, not the index: the card holds the answer in
        // local state, and an index key remounts it when groups shift.
        <AgentChatMessageGroup
          key={messageGroup.messageIds[0]}
          messageGroup={messageGroup}
          isLast={index === messageGroups.length - 1}
          size={resolvedSize}
          hideAvatar={hideAvatar}
          dateFormat={dateFormat}
          className={messageClassName}
          showTimestamps={showTimestamps}
          fadeIn={!groupsPresentAtMount.has(messageGroup.messageIds[0])}
          renderMessage={renderMessage}
          feedback={feedback}
          onFeedbackChange={onFeedbackChange}
          onFeedbackSend={onFeedbackSend}
        />
      ))}
    </AgentChatPrimitive.AgentChatMessages>
  );
}

interface AgentChatInputProps {
  sendOnEnter?: boolean;
}

export function AgentChatInput({
  className,
  // A variant, not the `<textarea>` attribute — it must not reach the DOM.
  size,
  onSubmit,
  sendOnEnter = true,
  placeholder = 'Type a message...',
  ...props
}: AgentChatInputProps &
  VariantProps<typeof agentChatInputVariants> &
  React.ComponentProps<'textarea'>) {
  return (
    <AgentChatPrimitive.AgentChatInput
      render={
        <Textarea
          placeholder={placeholder}
          dir="auto"
          className={cn(agentChatInputVariants({ size }), className)}
          onSubmit={sendOnEnter ? undefined : onSubmit}
          {...props}
        />
      }
    />
  );
}

interface AgentChatFooterProps {
  withVoice?: boolean;
  placeholder?: string;
  inputClassName?: string;
  sendButtonClassName?: string;
  attachmentButtonClassName?: string;
  /**
   * A host's control at the start of the composer's action group — after the input,
   * before the attach and send buttons (a mode trigger, or the pill of the mode that is
   * on). Sized by the host; the composer lays it out with its own buttons.
   */
  inputEndAdornment?: React.ReactNode;
}

export function AgentChatFooter({
  withVoice = false,
  ...props
}: AgentChatFooterProps &
  VariantProps<typeof agentChatFooterVariants> &
  React.ComponentProps<'div'>) {
  if (withVoice) {
    return <AgentChatFooterInner withVoice {...props} />;
  }

  return <AgentChatFooterInner {...props} />;
}

export function AgentChatFooterInner({
  size = 'md',
  variant,
  className,
  placeholder,
  inputClassName,
  sendButtonClassName,
  attachmentButtonClassName,
  inputEndAdornment,
  // Voice mode is parked (see the commented blocks below); taken off `props` so it
  // never reaches the DOM as an attribute.
  withVoice: _withVoice,
  children,
  ...props
}: AgentChatFooterProps &
  VariantProps<typeof agentChatFooterVariants> &
  React.ComponentProps<'div'>) {
  const chat = useAgentChat();
  const {
    attachments,
    removeAttachment,
    agentChat,
    prompt,
    isAgentReady,
    isFetchingMessages,
    isThinking,
  } = chat;
  // The send button stops a running reply Stop applies to (react-common's send trigger).
  // `canStop` is newer than some published @blocksdiy/react-common: read it without assuming it.
  const stops = isThinking && (chat as { canStop?: boolean }).canStop === true;
  const disableAttachments = agentChat
    ? agentChat.disableAttachments === true
    : true;
  const { isExpanded, toolbarRef, actionsRef, mirrorRef } =
    useComposerExpanded(prompt);
  // const { isConnected, isConnecting, isSpeaking, stream, startVoiceCall, endVoiceCall } =
  //   AgentChatPrimitive.useAgentChatVoice();

  // const isVoiceActive = withVoice && (isConnected || isConnecting);
  // The Button's own icon scale — the input's one-line height is sized to it (see
  // agentChatInputVariants). Round, as composer actions are (shadcn's input-group demo,
  // prompt-kit, ChatGPT): concentric with the box's pill corners, whatever the direction.
  const iconSize = agentChatComposerButtonSize(size ?? 'md');
  const iconButtonClassName = AGENT_CHAT_COMPOSER_BUTTON_CLASS_NAME;
  const isVoiceActive = false;

  return (
    // A group, as shadcn's InputGroup is: the input and its actions announce as one control.
    // Styling hooks for hosts, no props needed: `[data-slot=agent-chat-footer]`,
    // `data-variant`, `data-size`; the composer row below carries `data-state`.
    <div
      role="group"
      aria-label="Message composer"
      data-slot="agent-chat-footer"
      data-variant={variant ?? 'divider'}
      data-size={size}
      className={cn(agentChatFooterVariants({ size, variant }), className)}
      {...props}
    >
      {isVoiceActive ? (
        <div
          className={agentChatFooterToolbarVariants({ mode: 'voice', size })}
        >
          {/* <LiveWaveform
              active={isConnected && !isSpeaking}
              processing={isConnecting || isSpeaking}
              stream={stream}
              mode="scrolling"
              height={size === "lg" ? 76 : 64}
              barWidth={3}
              barGap={2}
              fadeEdges
              style={{
                transition: "color 0.2s ease-in-out",
                color: isSpeaking
                  ? "var(--muted-foreground)"
                  : !isConnected || isConnecting
                    ? "var(--muted-foreground)"
                    : "var(--primary)",
              }}
            />
            <Button
              onClick={endVoiceCall}
              variant="outline"
              size={size === "sm" || size === "md" ? "sm" : "md"}
            >
              <X />
              <span>{isConnecting ? "Connecting..." : "Voice mode"}</span>
            </Button> */}
        </div>
      ) : (
        <>
          {!disableAttachments && attachments.length > 0 && (
            <div className={agentChatFooterAttachmentsVariants({ size })}>
              {attachments.map((attachment) => (
                <AgentChatAttachmentBadge
                  key={attachment.url}
                  attachment={attachment}
                  size={size}
                  onRemove={() => removeAttachment(attachment.url)}
                />
              ))}
            </div>
          )}

          <div
            ref={toolbarRef}
            data-slot="agent-chat-composer"
            data-state={isExpanded ? 'expanded' : 'collapsed'}
            className={agentChatFooterToolbarVariants({ mode: 'input', size })}
          >
            <AgentChatInput
              size={size}
              placeholder={placeholder}
              // Expanded: a full-width row of its own, the actions wrap beneath it.
              className={cn(
                'min-w-0',
                isExpanded ? 'basis-full' : 'flex-1',
                inputClassName,
              )}
            />

            {/* The measuring mirror: the prompt on one unbroken line in the textarea's own
                classes (font, padding — the host's `inputClassName` included, so an override
                there is measured too), clipped to the toolbar and invisible. Its width is
                what useComposerExpanded compares against the room beside the actions. */}
            <div
              aria-hidden
              className="pointer-events-none invisible absolute inset-0 overflow-hidden"
            >
              <span
                ref={mirrorRef}
                dir="auto"
                className={cn(
                  agentChatInputVariants({ size }),
                  inputClassName,
                  'inline-block whitespace-pre',
                )}
              >
                {prompt}
              </span>
            </div>

            <div
              ref={actionsRef}
              data-slot="agent-chat-composer-actions"
              className={agentChatFooterActionsVariants({ size })}
            >
              {/* Inside the measured action group, so the room the text has beside the
                  buttons accounts for it (useComposerExpanded). */}
              {inputEndAdornment}

              {!disableAttachments && (
                <AgentChatPrimitive.AgentChatAttachmentTrigger
                  // Attachments are staged locally and ride the next send, so — like
                  // typing — they stay open while the agent runs. Only readiness gates
                  // them; the primitive's own default would also lock them mid-run.
                  disabled={!isAgentReady || isFetchingMessages}
                  render={
                    <Button
                      size={iconSize}
                      variant="outline"
                      className={cn(
                        iconButtonClassName,
                        attachmentButtonClassName,
                      )}
                    >
                      <Paperclip />
                      <span className="sr-only">Attach file</span>
                    </Button>
                  }
                />
              )}

              {/* {withVoice && (
                  <Button size={iconSize} variant="outline" onClick={startVoiceCall}>
                    <Mic />
                    <span className="sr-only">Start voice mode</span>
                  </Button>
                )} */}

              <AgentChatPrimitive.AgentChatSendTrigger
                render={
                  <Button
                    size={iconSize}
                    variant="default"
                    className={cn(iconButtonClassName, sendButtonClassName)}
                  >
                    {stops ? <Square className="fill-current" /> : <ArrowUp />}
                    <span className="sr-only">
                      {stops ? 'Stop' : 'Send message'}
                    </span>
                  </Button>
                }
              />
            </div>
          </div>
        </>
      )}

      {children}
    </div>
  );
}

export function AgentChatSimple({
  agentChat,
  chatId,
  defaultThreadId,
  noPersistency,
  chatContext,
  chatContextFiles,
  useAgentBlockDirectChat,
  withVoice = false,
  hideAvatar = false,
  placeholder,
  messagesContainerClassName,
  messageClassName,
  footerVariant,
  footerClassName,
  inputClassName,
  sendButtonClassName,
  attachmentButtonClassName,
  emptyState,
  suggestions,
  focusRunId,
  onUserMessageSent,
  disableInitialPrompt,
  ...props
}: AgentChatSimpleProps) {
  return (
    <AgentChat
      agentChat={agentChat}
      chatId={chatId}
      defaultThreadId={defaultThreadId}
      noPersistency={noPersistency}
      chatContext={chatContext}
      chatContextFiles={chatContextFiles}
      useAgentBlockDirectChat={useAgentBlockDirectChat}
      onUserMessageSent={onUserMessageSent}
      disableInitialPrompt={disableInitialPrompt}
    >
      <AgentChatContent {...props}>
        <AgentChatMessagesOrEmpty
          emptyState={emptyState}
          suggestions={suggestions}
          focusRunId={focusRunId}
          size={props.size}
          hideAvatar={hideAvatar}
          className={messagesContainerClassName}
          messageClassName={messageClassName}
        />
        <AgentChatFooter
          size={props.size}
          variant={footerVariant}
          withVoice={withVoice}
          placeholder={placeholder}
          className={footerClassName}
          inputClassName={inputClassName}
          sendButtonClassName={sendButtonClassName}
          attachmentButtonClassName={attachmentButtonClassName}
        />
        <AgentChatFetching size={props.size} />
      </AgentChatContent>
    </AgentChat>
  );
}

export type AgentChatSimpleProps = AgentChatProps & {
  withVoice?: boolean;
  hideAvatar?: boolean;
  placeholder?: string;
  messagesContainerClassName?: string;
  messageClassName?: string;
  /**
   * The composer's surface (see `agentChatFooterVariants`): `divider` (default) for a
   * chat inside a card or dialog, `filled` or `outline` for one standing on a page.
   */
  footerVariant?: VariantProps<typeof agentChatFooterVariants>['variant'];
  footerClassName?: string;
  inputClassName?: string;
  sendButtonClassName?: string;
  attachmentButtonClassName?: string;
  /**
   * Shown instead of the (empty) transcript until the conversation has messages.
   * Pass it only when the conversation is known to be new (see AgentChatMessagesOrEmpty).
   */
  emptyState?: React.ReactNode;
  /**
   * Starter prompts for a conversation with no messages yet: turns on the built-in
   * welcome (agent avatar + greeting) with these chips, each sending as the first
   * message. Real prompts for this app, never placeholder copy.
   */
  suggestions?: string[];
  /**
   * Open the conversation (`defaultThreadId`) at an agent run: see
   * AgentChatMessages' `focusRunId`.
   */
  focusRunId?: string;
} & VariantProps<typeof agentChatContentVariants> &
  React.ComponentProps<'div'>;

export const useAgentChat = AgentChatPrimitive.useAgentChat;

export { AgentChatPrimitive };

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line