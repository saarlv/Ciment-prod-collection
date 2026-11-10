import * as React from 'react';

import {
  AgentChatContent,
  AgentChatFooter,
  type AgentChatMessageSlotArgs,
  AgentChatMessagesOrEmpty,
  type AgentChatSize,
  focusAgentChatInput,
  isFeedbackMessage,
  useAgentChat,
} from '@/components/ui/agent-chat';
import {
  AgentFeedbackChip,
  AgentFeedbackPill,
  AgentFeedbackSourceBanner,
  feedbackMessage,
  feedbackPlaceholder,
  turnFeedbackOfDraft,
} from '@/components/ui/agent-feedback';
import {
  feedbackRefComposerMeta,
  type FeedbackRefDraft,
  feedbackRefDraftOf,
} from '@/components/ui/agent-feedback-ref';
import { cn } from '@/lib/utils';

/*
 * The conversation itself: the transcript (or the welcome while a new chat has no messages)
 * over the composer, with the admin chat's feedback built in — thumbs under each assistant
 * turn, a thumb's comment sent as an ordinary message (the agent answers it here and may propose a change to itself), the sent-feedback chip, the source banner on a
 * feedback thread. One rendering for the two frames that show a conversation: the agent
 * layout's full page (a reading column under a title bar) and the floating agent chat (a box
 * over a page). Renders inside the chat runtime and, for feedback, inside react-common's
 * conversation Root; the host frames it and, via `AgentFeedbackLinksContext`, says where the
 * feedback notes lead.
 */

export interface AgentChatConversationProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  /** Chat density — the transcript, the composer and the feedback controls share it. */
  size?: AgentChatSize;
  /**
   * The conversation is the new chat, nothing sent on it yet: the welcome shows at once and
   * the composer offers no feedback (there is no turn to rate).
   */
  isDraft: boolean;
  /**
   * The host's block is the agent's admin chat and the person is an admin of the agent
   * (react-common's `isAgentAdmin`): feedback UI shows only then. Also needs react-common's
   * conversation Root above (the host's).
   */
  isAdmin?: boolean;
  /** The open thread's id, or none for the new chat (the transcript resets per id). */
  threadId?: string;
  /** Starter prompts on the welcome hero (new chat only). Omitted: the welcome without chips. */
  suggestions?: string[];
  /** Composer placeholder. */
  placeholder?: string;
  /** The agent run (turn) to open the conversation at — a thread page's `?runId=`. */
  focusRunId?: string;
  /**
   * The composer's box: a pill standing in from the host's column (`filled`, the page's), an
   * outlined pill, or a plain row under a rule (`divider` — the floating chat's, where a pill
   * inside a narrow box would nest a box in a box).
   */
  composerVariant?: 'filled' | 'outline' | 'divider';
}

/** The text of the reply a thumb rates, or undefined when it is not (or no longer) in the transcript. */
const ratedReplyText = (
  messageById: ReturnType<typeof useAgentChat>['messageById'],
  messageId: string | undefined,
): string | undefined => {
  const content = messageId ? messageById.get(messageId)?.content : undefined;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join(' ');
};

export function AgentChatConversation({
  size = 'md',
  isDraft,
  isAdmin = false,
  threadId,
  suggestions,
  placeholder,
  focusRunId,
  composerVariant = 'filled',
  className,
  ...props
}: AgentChatConversationProps) {
  const {
    composerMessageMeta,
    setComposerMessageMeta,
    sendMessage,
    messageById,
  } = useAgentChat();

  // Admin chat only. `setComposerMessageMeta` is optional on the runtime's context (a context a
  // host builds by hand may omit it), and without it there is nothing to arm.
  const showFeedback = isAdmin && typeof setComposerMessageMeta === 'function';
  const draft = showFeedback ? feedbackRefDraftOf(composerMessageMeta) : null;
  const contentRef = React.useRef<HTMLDivElement>(null);
  const applyDraft = (next: FeedbackRefDraft | null) => {
    setComposerMessageMeta?.(
      next
        ? feedbackRefComposerMeta(
            next,
            ratedReplyText(messageById, next.messageId),
          )
        : null,
    );
    if (next) {
      focusAgentChatInput(contentRef.current);
    }
  };

  const renderMessage = ({ message, role }: AgentChatMessageSlotArgs) =>
    showFeedback && role === 'user' && isFeedbackMessage(message) ? (
      <AgentFeedbackChip message={message} size={size} />
    ) : undefined;

  return (
    <AgentChatContent
      ref={contentRef}
      data-slot="agent-chat-conversation"
      size={size}
      className={cn('min-h-0 flex-1', className)}
      {...props}
    >
      {showFeedback && <AgentFeedbackSourceBanner size={size} />}
      <AgentChatMessagesOrEmpty
        key={threadId ?? 'new-chat'}
        size={size}
        suggestions={threadId ? undefined : (suggestions ?? [])}
        focusRunId={threadId ? focusRunId : undefined}
        assumeEmpty={isDraft}
        renderMessage={renderMessage}
        feedback={turnFeedbackOfDraft(draft)}
        onFeedbackChange={showFeedback ? applyDraft : undefined}
        onFeedbackSend={
          // A thumb's Send: the rating as it is, through the one send pipeline.
          showFeedback
            ? (rating) => sendMessage(feedbackMessage(rating))
            : undefined
        }
      />
      <AgentChatFooter
        size={size}
        placeholder={draft ? feedbackPlaceholder(draft.rate) : placeholder}
        variant={composerVariant}
        inputEndAdornment={
          showFeedback && !isDraft && draft ? (
            <AgentFeedbackPill
              rate={draft.rate}
              size={size}
              onClear={() => applyDraft(null)}
            />
          ) : undefined
        }
      />
    </AgentChatContent>
  );
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line