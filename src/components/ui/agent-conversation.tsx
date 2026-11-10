import {
  agentThreadDisplayTitle,
  type AgentThreadItem,
  useAgentConversationContext,
} from '@blocksdiy/react-common/agent-threads';
import { Minimize2Icon, PenLineIcon } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';

import {
  agentChatColumnInsetVariants,
  NEW_CHAT_TITLE,
} from '@/components/ui/agent-chat';
import {
  AgentChatConversation,
  type AgentChatConversationProps,
} from '@/components/ui/agent-chat-conversation';
import {
  type AgentFeedbackLinks,
  AgentFeedbackLinksContext,
} from '@/components/ui/agent-feedback';
import {
  type AgentLayoutSize,
  agentLayoutTopRowVariants,
  conversationHref,
  runIdFromSearch,
  useAgentLayout,
} from '@/components/ui/agent-layout-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * Conversation page for `new.tsx` (draft + suggestions) and `threads/[threadId].tsx`.
 * Renders inside the chat runtime on conversation routes; use AgentChatSimple elsewhere.
 * The conversation itself is the agent-chat family's `AgentChatConversation` — the same one
 * the floating agent chat renders over a page — framed here in a reading column under a title
 * bar, with the feedback notes leading to the layout's own routes.
 */

const READING_COLUMN_CLASS_NAME = 'mx-auto w-full max-w-5xl px-3';

export interface AgentConversationProps extends React.ComponentProps<'div'> {
  /** The conversation to show (the `threads/[threadId]` route param). Omit on `new.tsx` — the empty new chat. */
  threadId?: string;
  /**
   * Starter prompts for a conversation with no messages yet — shown as chips on the
   * welcome hero, each sending as the first message. Real prompts for this app. For the
   * new chat; a thread page has messages, so it has no use for them.
   */
  suggestions?: string[];
  /** Composer placeholder. */
  placeholder?: string;
  /**
   * Chat density; defaults to the layout's `size`, so the transcript, the composer and the
   * header stay on the same scale as the sidebar's persona row. Set it here only to make
   * ONE conversation page denser or airier than its layout.
   */
  size?: AgentLayoutSize;
  /**
   * The agent run (turn) to open the conversation at — scrolled to and tinted briefly
   * once the transcript replays. Defaults to the URL's `?runId=` on a thread page; leave
   * it unset so the URL stays the source of truth.
   */
  focusRunId?: string;
  /**
   * Extra context handed to the agent on every turn of THIS conversation, replacing the
   * layout's `chatContext` while this page is mounted.
   */
  chatContext?: unknown;
}

export function AgentConversation({
  threadId,
  suggestions,
  placeholder,
  size: sizeProp,
  chatContext,
  focusRunId,
  className,
  ...props
}: AgentConversationProps) {
  const {
    basePath,
    setConversationChatContext,
    size: layoutSize,
    isAdmin,
    openRename,
    minimize,
  } = useAgentLayout();
  const size = sizeProp ?? layoutSize;
  const { search } = useLocation();
  const navigate = useNavigate();
  // A run focus addresses an existing conversation: the new chat has none to open at.
  const resolvedFocusRunId = threadId
    ? (focusRunId ?? runIdFromSearch(search))
    : undefined;
  const { conversation, row, isStandIn, isDraft } =
    useAgentConversationContext();

  // The feedback notes lead to this layout's own routes — the full page of the reply thread,
  // or of the conversation a feedback thread rates.
  const feedbackLinks = React.useMemo<AgentFeedbackLinks>(
    () => ({
      openThread: (feedbackThreadId) =>
        navigate(
          conversationHref(basePath, { chatThreadId: feedbackThreadId }),
        ),
    }),
    [navigate, basePath],
  );

  const serializedChatContext =
    chatContext === undefined ? undefined : JSON.stringify(chatContext);
  const stableChatContext = React.useMemo(
    () => chatContext,
    [serializedChatContext],
  );
  React.useEffect(() => {
    if (stableChatContext === undefined) {
      return;
    }
    setConversationChatContext(stableChatContext);
    return () => setConversationChatContext(undefined);
  }, [stableChatContext, setConversationChatContext]);

  return (
    <div
      data-slot="agent-conversation"
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
      {...props}
    >
      <AgentConversationHeader
        thread={row}
        isDraft={isDraft}
        canRename={!isDraft && !isStandIn}
        onRename={openRename}
        onMinimize={minimize}
        size={size}
      />
      <div
        className={cn(
          READING_COLUMN_CLASS_NAME,
          'flex min-h-0 flex-1 flex-col py-3',
        )}
      >
        <AgentFeedbackLinksContext.Provider value={feedbackLinks}>
          <AgentChatConversation
            size={size}
            isDraft={isDraft}
            isAdmin={isAdmin}
            threadId={threadId}
            suggestions={suggestions}
            placeholder={placeholder}
            focusRunId={resolvedFocusRunId}
          />
        </AgentFeedbackLinksContext.Provider>
      </div>
    </div>
  );
}

export type { AgentChatConversationProps };

/**
 * Conversation title bar: rename, and minimize — the conversation into the floating chat, back
 * on the page it came from (the layout's `minimize`; absent where there is no floating chat).
 */
function AgentConversationHeader({
  thread,
  isDraft,
  canRename,
  onRename,
  onMinimize,
  size,
}: {
  thread: AgentThreadItem;
  isDraft: boolean;
  canRename: boolean;
  onRename: (thread: AgentThreadItem) => void;
  onMinimize: (() => void) | null;
  size: AgentLayoutSize;
}) {
  const title = isDraft ? NEW_CHAT_TITLE : agentThreadDisplayTitle(thread);
  return (
    <header
      data-slot="agent-conversation-header"
      data-size={size}
      className={cn(
        agentLayoutTopRowVariants({ size }),
        'flex shrink-0 border-b',
      )}
    >
      <div className={cn(READING_COLUMN_CLASS_NAME, 'flex items-center')}>
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2',
            agentChatColumnInsetVariants({ size }),
          )}
        >
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </h2>
          {canRename && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Rename conversation"
              title="Rename conversation"
              onClick={() => onRename(thread)}
            >
              <PenLineIcon />
            </Button>
          )}
          {onMinimize && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Minimize to the floating chat"
              title="Minimize to the floating chat"
              data-slot="agent-conversation-minimize"
              onClick={onMinimize}
            >
              <Minimize2Icon />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

// @blocks-registry agent-layout@1.3.1 — registry version, never edit this line