import {
  agentThreadDisplayTitle,
  feedbackSourceThread,
  isFeedbackThread,
  useAgentConversationContext,
} from '@blocksdiy/react-common/agent-threads';
import {
  type FeedbackDraft,
  feedbackThreadId,
  parseFeedbackContent,
} from '@blocksdiy/react-common/new-agent-chat';
import { ChevronRightIcon, CornerUpLeftIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import {
  AGENT_CHAT_COMPOSER_BUTTON_CLASS_NAME,
  agentChatComposerButtonSize,
  type AgentChatSize,
  type AgentChatTurnFeedback,
  FEEDBACK_SENTIMENT,
  type FeedbackRate,
  type Message,
} from '@/components/ui/agent-chat';
import { AgentFeedbackLinksContext } from '@/components/ui/agent-feedback-links';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * Feedback UI for a conversation (the agent layout's page and the floating agent chat alike):
 * the composer pill, the sent-feedback chip, and the source banner on a feedback
 * thread. The wire protocol — the message name, the `<feedback rate="…" messageId="…" />`
 * marker, the `fb-<messageId>` thread key — is react-common's
 * (@blocksdiy/react-common/new-agent-chat); only the rendering lives here. The two notes that
 * lead somewhere ("View" the reply thread, "From" the rated conversation) go wherever the host
 * says through `AgentFeedbackLinksContext`: the page navigates, the floating chat re-points.
 */

/** What AgentConversation arms the composer with, from react-common. */
export {
  type FeedbackDraft,
  feedbackComposerMeta,
  feedbackDraftOf,
  feedbackMessage,
} from '@blocksdiy/react-common/new-agent-chat';

export {
  feedbackRefComposerMeta,
  feedbackRefDraftOf,
} from '@/components/ui/agent-feedback-ref';

export {
  type AgentFeedbackLinks,
  AgentFeedbackLinksContext,
} from '@/components/ui/agent-feedback-links';

/** The feedback is written TO the agent, so the prompt speaks to it in the second person. */
export const feedbackPlaceholder = (rate: FeedbackRate): string => {
  if (rate > 0) {
    return 'What worked — so you keep it up?';
  }
  if (rate < 0) {
    return 'What should you adjust for next time?';
  }
  return 'What should you know?';
};

const buttonSizes = (size: AgentChatSize) =>
  ({
    composer: agentChatComposerButtonSize(size),
    pill: size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'default',
    note: size === 'sm' ? 'xs' : size === 'lg' ? 'default' : 'sm',
  }) as const;

/** Lit thumb in the turn footer when the draft targets that message with a rating. */
export const turnFeedbackOfDraft = (
  draft: FeedbackDraft | null,
): AgentChatTurnFeedback | null =>
  draft?.messageId !== undefined && draft.rate !== 0
    ? { messageId: draft.messageId, rate: draft.rate }
    : null;

export interface AgentFeedbackPillProps extends Omit<
  React.ComponentProps<'button'>,
  'onClick' | 'children'
> {
  rate: FeedbackRate;
  size?: AgentChatSize;
  onClear: () => void;
}

/**
 * Armed feedback mode chip; click disarms. The theme's filled Button: primary for
 * whole-conversation feedback, a rating's seat (FEEDBACK_SENTIMENT: success / destructive)
 * for a thumb.
 */
export function AgentFeedbackPill({
  rate,
  size = 'md',
  onClear,
  className,
  ...props
}: AgentFeedbackPillProps) {
  const { Icon, label, seatClassName } = FEEDBACK_SENTIMENT[rate];
  return (
    <Button
      type="button"
      variant="default"
      size={buttonSizes(size).pill}
      aria-label={`Cancel ${label.toLowerCase()} feedback`}
      title="Cancel feedback"
      data-slot="agent-feedback-pill"
      data-size={size}
      data-rate={rate}
      className={cn(
        AGENT_CHAT_COMPOSER_BUTTON_CLASS_NAME,
        seatClassName,
        className,
      )}
      onClick={onClear}
      {...props}
    >
      <Icon data-icon="inline-start" />
      Feedback
      <XIcon data-icon="inline-end" />
    </Button>
  );
}

function FeedbackNote({
  size,
  variant,
  icon: Icon,
  label,
  detail,
  action,
  title,
  onNavigate,
}: {
  size: AgentChatSize;
  variant: 'secondary' | 'ghost';
  icon: React.ComponentType<{ className?: string }>;
  label: React.ReactNode;
  /** Muted trailing context ("From …"). */
  detail?: string;
  /** The click's promise, trailing with a chevron ("View"), in the detail's tone. */
  action?: string;
  title: string;
  onNavigate?: () => void;
}) {
  const noteClassName = cn(
    buttonVariants({ variant, size: buttonSizes(size).note }),
    'max-w-full min-w-0',
    variant === 'secondary' && 'rounded-4xl',
  );
  const content = (
    <>
      <Icon data-icon="inline-start" />
      <span className="shrink-0">{label}</span>
      {detail && (
        <>
          <span aria-hidden className="shrink-0 text-muted-foreground">
            ·
          </span>
          <span className="min-w-0 truncate font-normal text-muted-foreground">
            {detail}
          </span>
        </>
      )}
      {action && (
        <>
          <span aria-hidden className="shrink-0 text-muted-foreground">
            ·
          </span>
          <span className="shrink-0 font-normal text-muted-foreground">
            {action}
          </span>
          <ChevronRightIcon
            data-icon="inline-end"
            className="text-muted-foreground"
          />
        </>
      )}
    </>
  );
  return onNavigate ? (
    <button
      type="button"
      title={title}
      className={noteClassName}
      onClick={onNavigate}
    >
      {content}
    </button>
  ) : (
    <span className={cn(noteClassName, 'pointer-events-none')}>{content}</span>
  );
}

export interface AgentFeedbackChipProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  message: Message;
  size?: AgentChatSize;
}

/**
 * Sent feedback as a centred chip instead of a user bubble: "Feedback sent" under the rating's
 * icon (the rating itself read out, not written), and **View ›** into the thread it opened — a
 * comment opens one; a rating alone is recorded on the conversation and opens none, so its
 * chip has nothing to open.
 */
export function AgentFeedbackChip({
  message,
  size = 'md',
  className,
  ...props
}: AgentFeedbackChipProps) {
  const links = React.useContext(AgentFeedbackLinksContext);
  const {
    rate,
    messageId: sourceMessageId,
    body,
  } = parseFeedbackContent(message.content);
  const { Icon, label } = FEEDBACK_SENTIMENT[rate];
  const threadId =
    sourceMessageId && body ? feedbackThreadId(sourceMessageId) : undefined;
  return (
    <div
      data-slot="agent-feedback-chip"
      data-size={size}
      data-rate={rate}
      className={cn('flex self-stretch justify-center py-1.5', className)}
      {...props}
    >
      <FeedbackNote
        size={size}
        variant="secondary"
        icon={Icon}
        label={
          <>
            <span className="sr-only">{label} </span>Feedback sent
          </>
        }
        action={threadId ? 'View' : undefined}
        title="Open the feedback thread"
        onNavigate={
          threadId && links ? () => links.openThread(threadId) : undefined
        }
      />
    </div>
  );
}

export interface AgentFeedbackSourceBannerProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  /** The conversation's chat density (defaults to `md`). */
  size?: AgentChatSize;
}

/** On feedback threads: "Feedback · From …" with link to the source conversation. */
export function AgentFeedbackSourceBanner({
  size = 'md',
  className,
  ...props
}: AgentFeedbackSourceBannerProps) {
  const links = React.useContext(AgentFeedbackLinksContext);
  const { row, threads } = useAgentConversationContext();
  if (!isFeedbackThread(row)) {
    return null;
  }
  const sourceThreadId = row.fromSourceChatThreadId ?? undefined;
  const sourceRow = feedbackSourceThread(row, threads.threads);
  return (
    <div
      data-slot="agent-feedback-source-banner"
      data-size={size}
      className={cn(
        'flex shrink-0 justify-center px-4 py-2 text-muted-foreground',
        className,
      )}
      {...props}
    >
      <FeedbackNote
        size={size}
        variant="ghost"
        icon={CornerUpLeftIcon}
        label="Feedback"
        detail={`From ${sourceRow ? agentThreadDisplayTitle(sourceRow) : 'the original conversation'}`}
        title="Open the original conversation"
        onNavigate={
          sourceThreadId && links
            ? () => links.openThread(sourceThreadId)
            : undefined
        }
      />
    </div>
  );
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line