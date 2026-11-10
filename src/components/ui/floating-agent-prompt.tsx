import type {
  AgentChatConfig,
  AgentConfig,
} from '@blocksdiy/blocks-client-sdk';
import { ArrowUpIcon, ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import {
  AGENT_CHAT_COMPOSER_BUTTON_CLASS_NAME,
  agentChatComposerButtonSize,
  agentDisplayName,
  agentInitials,
} from '@/components/ui/agent-chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

/*
 * The floating agent prompt — RETIRED: a one-line composer at the top of the screen that
 * starts a new chat with one of the app's agents and turns into the floating agent chat on its
 * first send. The platform's rail and `useFloatingAgentChat().openPrompt({ agent })` open the
 * floating chat panel on a new chat instead, so these parts render only for a session in the
 * prompt face, which only an older react-common opens (floating-agent-chat's RETIRED-PROMPT
 * note). They stay so an app's own `prompt={…}` composition still builds; don't build on them.
 * The box they sit in, the engine and the state are floating-agent-chat's. For a composition of
 * your own (`prompt={…}` on the provider):
 *
 *   <FloatingAgentPrompt>
 *     <FloatingAgentPromptAgent />
 *     <FloatingAgentPromptInput placeholder="Ask Theo…" />
 *     <FloatingAgentPromptSend />
 *   </FloatingAgentPrompt>
 */

/* ------------------------------------------------------------------------------------ */
/* What the provider hands the prompt                                                    */
/* ------------------------------------------------------------------------------------ */

/**
 * One agent the prompt can talk to — an agent mini-app, by its generated handles
 * (`@/product-types`) and the route it is mounted at (its `entryRoute` in artifacts/app.json).
 */
export interface FloatingAgentPromptAgent {
  /** `<Name>Agent`: the persona (name, job title, photo). */
  agent: AgentConfig;
  /** `<Name>ChatAgentChat`: the mini-app's own chat, where the new thread goes. */
  agentChat: AgentChatConfig;
  /** The mini-app's entry route (`/theo`): the thread page the full conversation opens on. */
  entryRoute: string;
}

export interface FloatingAgentPromptContextValue {
  /** The agents on offer, in the provider's order. */
  agents: readonly AgentConfig[];
  /** The picked agent's id (`agent.id`, the block name). */
  agentId: string;
  /** Picks another agent: the prompt re-opens for it, the typed text kept. */
  selectAgent: (agentId: string) => void;
  /** How many times the prompt was opened or re-pointed — the message takes focus on each. */
  openCount: number;
  text: string;
  setText: (text: string) => void;
  /** The picked agent's chat is up and free — false while it loads or is busy. */
  canSend: boolean;
  /** Sends through the floating chat's engine: its first send turns the prompt into the panel. */
  send: (content: string) => void;
  close: () => void;
}

/**
 * Provided by FloatingAgentChatProvider while its session wears the prompt face; the parts read
 * it. The pill shows from the open on: the agents are the provider's, and only the send waits
 * for the agent's chat.
 */
export const FloatingAgentPromptContext =
  React.createContext<FloatingAgentPromptContextValue | null>(null);

export function useFloatingAgentPrompt(): FloatingAgentPromptContextValue {
  const context = React.useContext(FloatingAgentPromptContext);
  if (!context) {
    throw new Error(
      "Floating agent prompt parts must render inside the prompt the provider mounts (FloatingAgentChatProvider's `prompt`).",
    );
  }
  return context;
}

/**
 * The composer's send: the typed message, once there is one and the agent's chat can take it.
 * The text is left as it is: a send that went through takes the pill away (the provider
 * starts the next prompt empty), and one the chat refused leaves the message where it was.
 */
const useFloatingAgentPromptSend = () => {
  const {
    text,
    canSend: isChatFree,
    send: sendToChat,
  } = useFloatingAgentPrompt();
  const content = text.trim();
  const canSend = content.length > 0 && isChatFree;
  const send = React.useCallback(() => {
    if (canSend) {
      sendToChat(content);
    }
  }, [canSend, content, sendToChat]);
  return { canSend, send };
};

/* ------------------------------------------------------------------------------------ */
/* Root                                                                                  */
/* ------------------------------------------------------------------------------------ */

/** The pill's surface: the popover's, in the chat composer's round cut. */
const SURFACE_CLASS_NAME =
  'rounded-4xl bg-popover text-popover-foreground shadow-lg';

export type FloatingAgentPromptProps = React.ComponentProps<typeof InputGroup>;

/** The pill: an input group with the agent at its start, the message, the send at its end. */
export function FloatingAgentPrompt({
  className,
  children,
  ...props
}: FloatingAgentPromptProps) {
  return (
    <InputGroup
      data-slot="floating-agent-prompt"
      className={cn(
        SURFACE_CLASS_NAME,
        'has-[textarea]:rounded-4xl',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <FloatingAgentPromptAgent />
          <FloatingAgentPromptInput />
          <FloatingAgentPromptSend />
        </>
      )}
    </InputGroup>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Parts                                                                                 */
/* ------------------------------------------------------------------------------------ */

function FloatingAgentPromptAvatar({
  agent,
  className,
  ...props
}: React.ComponentProps<typeof Avatar> & { agent: AgentConfig }) {
  return (
    <Avatar
      data-slot="floating-agent-prompt-avatar"
      className={cn('size-7', className)}
      {...props}
    >
      <AvatarImage
        src={agent.avatarUrl ?? agent.photoUrl}
        alt={agentDisplayName(agent)}
      />
      <AvatarFallback className="text-xs">
        {agentInitials(agent)}
      </AvatarFallback>
    </Avatar>
  );
}

export type FloatingAgentPromptAgentProps = React.ComponentProps<
  typeof InputGroupAddon
>;

/**
 * Who the message goes to: the picked agent's avatar — a menu of the app's agents when there
 * is more than one, the face alone when there is one.
 */
export function FloatingAgentPromptAgent({
  className,
  ...props
}: FloatingAgentPromptAgentProps) {
  const { agents, agentId, selectAgent } = useFloatingAgentPrompt();
  // A pick closes the menu: the prompt re-opens for that agent and the cursor goes back to
  // the message.
  const [isMenuOpen, setMenuOpen] = React.useState(false);
  const picked = agents.find((agent) => agent.id === agentId) ?? agents[0];
  if (!picked) {
    return null;
  }
  const name = agentDisplayName(picked);
  return (
    <InputGroupAddon
      align="inline-start"
      data-slot="floating-agent-prompt-agent"
      className={cn('ps-1.5', className)}
      {...props}
    >
      {agents.length > 1 ? (
        <DropdownMenu open={isMenuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            aria-label={`Agent: ${name}`}
            title={`Agent: ${name}`}
            className={cn(
              'flex items-center gap-0.5 rounded-full p-0.5 pe-1 outline-hidden transition-colors',
              'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
              '[&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground',
            )}
          >
            <FloatingAgentPromptAvatar agent={picked} />
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          {/* Above the floating chat's layer (z-[60]): the menu is portaled beside it. */}
          <DropdownMenuContent align="start" className="z-[70]">
            <DropdownMenuRadioGroup
              value={picked.id}
              onValueChange={(nextAgentId: string) => {
                setMenuOpen(false);
                selectAgent(nextAgentId);
              }}
            >
              {agents.map((agent) => (
                <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                  <FloatingAgentPromptAvatar agent={agent} />
                  <span className="grid min-w-0 leading-tight">
                    <span className="truncate">{agentDisplayName(agent)}</span>
                    {agent.jobTitle && agent.title && (
                      <span className="truncate text-xs text-muted-foreground">
                        {agent.jobTitle}
                      </span>
                    )}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="p-0.5" title={name}>
          <FloatingAgentPromptAvatar agent={picked} />
          <span className="sr-only">{`Agent: ${name}`}</span>
        </span>
      )}
    </InputGroupAddon>
  );
}

export type FloatingAgentPromptInputProps = Omit<
  React.ComponentProps<typeof InputGroupTextarea>,
  'value' | 'onChange'
>;

/** The message. One line that grows; Enter sends, Shift+Enter breaks the line. */
export function FloatingAgentPromptInput({
  placeholder,
  className,
  onKeyDown,
  ref: forwardedRef,
  ...props
}: FloatingAgentPromptInputProps) {
  const { agents, agentId, text, setText, openCount } =
    useFloatingAgentPrompt();
  const { send } = useFloatingAgentPromptSend();
  const picked = agents.find((candidate) => candidate.id === agentId);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const setRef = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );
  // The message takes focus on every open — the first, the platform's rail pressed again, an
  // agent picked (the same one too) — with the caret after the text. A frame later: the agent
  // menu hands focus back to its trigger as it closes, in its own time, and the message must
  // be where typing goes once that is done.
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openCount, agentId]);

  return (
    <InputGroupTextarea
      ref={setRef}
      rows={1}
      dir="auto"
      autoComplete="off"
      aria-label="Message"
      data-slot="floating-agent-prompt-input"
      placeholder={placeholder ?? `Message ${agentDisplayName(picked)}…`}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          send();
        }
      }}
      className={cn(
        // The chat composer's type scale: 16px on phones whatever the size, or iOS zooms in.
        '[field-sizing:content] max-h-48 min-h-0 px-1 py-2 text-base leading-6 md:text-sm md:leading-5',
        className,
      )}
      {...props}
    />
  );
}

export type FloatingAgentPromptSendProps = Omit<
  React.ComponentProps<typeof Button>,
  'onClick' | 'disabled'
>;

/** Sends the message — once there is one and the agent is ready for it. */
export function FloatingAgentPromptSend({
  className,
  children,
  ...props
}: FloatingAgentPromptSendProps) {
  const { canSend, send } = useFloatingAgentPromptSend();
  return (
    <InputGroupAddon align="inline-end" className="pe-1.5">
      <Button
        type="button"
        size={agentChatComposerButtonSize('sm')}
        variant="default"
        aria-label="Send message"
        title="Send message"
        data-slot="floating-agent-prompt-send"
        disabled={!canSend}
        onClick={send}
        className={cn(AGENT_CHAT_COMPOSER_BUTTON_CLASS_NAME, className)}
        {...props}
      >
        {children ?? <ArrowUpIcon />}
      </Button>
    </InputGroupAddon>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Error — the agent's chat could not load                                               */
/* ------------------------------------------------------------------------------------ */

export interface FloatingAgentPromptLoadErrorProps extends React.ComponentProps<'div'> {
  onRetry: () => void;
  onClose: () => void;
}

/**
 * The prompt could not resolve its agent: what happened, the retry, and the way out — with the
 * agent still at the start, so another one can be picked instead.
 */
export function FloatingAgentPromptLoadError({
  onRetry,
  onClose,
  className,
  children,
  ...props
}: FloatingAgentPromptLoadErrorProps) {
  return (
    <div
      role="alert"
      data-slot="floating-agent-prompt-load-error"
      className={cn(
        SURFACE_CLASS_NAME,
        'flex items-center gap-2 border pe-2 text-sm',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <FloatingAgentPromptAgent />
          <span className="min-w-0 flex-1 truncate">
            Couldn&apos;t load this agent
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      )}
    </div>
  );
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line