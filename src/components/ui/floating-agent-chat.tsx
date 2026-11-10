import type { AgentChat as SDKAgentChat } from '@blocksdiy/blocks-client-sdk';
import {
  useAgentContextEntries,
  useClient,
  useUser,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import {
  AgentThreadConversationProvider,
  agentThreadDisplayTitle,
  type AgentThreadStatus,
  type FloatingAgentChatExpandHref,
  type FloatingAgentChatState,
  type FloatingAgentPromptChat,
  type FloatingAgentPromptOpenOptions,
  isAgentAdmin,
  isFloatingAgentChatDraft,
  type PanelResizeAxis,
  type PanelSize,
  useAgentConversationContext,
  useFloatingAgentChatContext,
  useFloatingAgentChatController,
  type UseFloatingAgentChatControllerResult,
  useFloatingAgentChatEngine,
  useFloatingAgentPromptController,
  useResizablePanel,
} from '@blocksdiy/react-common/agent-threads';
import { cva } from 'class-variance-authority';
import { Maximize2Icon, XIcon } from 'lucide-react';
import * as React from 'react';
import {
  useInRouterContext,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';

import {
  AgentChat,
  agentChatColumnInsetVariants,
  AgentChatLoadError,
  type AgentChatSize,
  type AgentChatUserMessageSentHandler,
  agentDisplayName,
  AgentThreadStatusMark,
  focusAgentChatInput,
  NEW_CHAT_TITLE,
  useAgentChat,
  useUserMessageSentSeam,
} from '@/components/ui/agent-chat';
import {
  AgentChatConversation,
  type AgentChatConversationProps,
} from '@/components/ui/agent-chat-conversation';
import {
  type AgentFeedbackLinks,
  AgentFeedbackLinksContext,
} from '@/components/ui/agent-feedback';
import { Button } from '@/components/ui/button';
import {
  FloatingAgentPrompt,
  type FloatingAgentPromptAgent,
  FloatingAgentPromptContext,
  type FloatingAgentPromptContextValue,
  FloatingAgentPromptLoadError,
} from '@/components/ui/floating-agent-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/*
 * The floating agent chat: one conversation with one of the app's agents, floating over
 * whatever page is on screen — picked up from an agent mini-app's sidebar, opened from any
 * page with `useFloatingAgentChat().open(…)`, or opened on a new chat by the platform's rail
 * (the chat bubble on an agent's row). The panel is non-modal (the page stays live), anchored
 * to the viewport's bottom-start corner, resizable from its free edges; below md it is a bottom
 * sheet. One session per app: the provider holds what is open, the surface renders it.
 *
 * With this file in the app, the app's top-level layout (`src/root.tsx`, or a top-level
 * `routes/layout.tsx`) wraps everything it renders in `FloatingAgentChatProvider` (once), with
 * `agents` — one entry per agent mini-app — so the platform's rail knows who it can talk to,
 * and `chatContext` when the app has context for every floating conversation. Every turn also
 * carries `onScreen` (every mounted entity read), what pages share with the SDK's
 * `useAgentContext(…)`, and `urlContext` (the page's route params and query). From anywhere under it:
 *
 *   const floatingAgentChat = useFloatingAgentChat();
 *   floatingAgentChat.open({ agentChat });                                   // the new chat
 *   floatingAgentChat.open({ agentChat, target: { chatThreadId } });         // pick up a thread
 *
 * `agentChat` is `useAgentChat(<Agent>ChatAgentChat)` — the surface's own agent-chat block.
 *
 * This file is the UI. The state (what is open, the face it wears, the draft, focus return),
 * the single-conversation data (one row, live, shared with a mounted index), the resize math
 * and the platform's door (the rail's request for a new chat) are react-common's — `useFloatingAgentChatController`,
 * `AgentThreadConversationProvider`, `useResizablePanel`, `subscribeFloatingAgentPromptRequests`
 * — so every surface that shows them agrees. Parts, for a composition of your own:
 *
 *   <FloatingAgentChat>
 *     <FloatingAgentChatHeader>
 *       <FloatingAgentChatStatus />
 *       <FloatingAgentChatTitle />
 *       <FloatingAgentChatExpand />
 *       <FloatingAgentChatClose />
 *     </FloatingAgentChatHeader>
 *     <FloatingAgentChatBody placeholder="Ask Theo…" />
 *   </FloatingAgentChat>
 *
 * The retired one-line prompt's parts are floating-agent-prompt's (`prompt={…}` on the
 * provider): kept so existing compositions build (RETIRED-PROMPT, below).
 */

export {
  type FloatingAgentChatExpandHref,
  type FloatingAgentChatFace,
  type FloatingAgentChatOpenOptions,
  type FloatingAgentPromptOpenOptions as FloatingAgentChatOpenPromptOptions,
  type FloatingAgentChatState,
  type FloatingAgentChatTarget,
  isFloatingAgentChatDraft,
} from '@blocksdiy/react-common/agent-threads';
export type { FloatingAgentPromptAgent } from '@/components/ui/floating-agent-prompt';

// Compiled apps take react-common from app-render (window globals), which deploys independently
// of the compiler, so an installed copy of this item can predate these exports. The provider
// sits at the top of the app, so it must never be what throws: without its hooks it renders the
// app with no floating chat, and only an opener's `open` names the gap. The panel's own stand-ins
// keep hook order and name the gap instead of "is not a function".
const needsNewerReactCommon = (name: string) => (): never => {
  throw new Error(
    `FloatingAgentChat needs a newer @blocksdiy/react-common than this app-render serves (${name} is missing). Deploy app-render first.`,
  );
};
const useResizable: typeof useResizablePanel =
  useResizablePanel ?? needsNewerReactCommon('useResizablePanel');
const ThreadConversationProvider: typeof AgentThreadConversationProvider =
  AgentThreadConversationProvider ??
  needsNewerReactCommon('AgentThreadConversationProvider');
// The SDK is a window global too: on an app-render from before `useAgentContext`, the pages
// tell the agent nothing, and the chat still works.
const NO_AGENT_CONTEXT_ENTRIES: ReturnType<typeof useAgentContextEntries> = {
  shared: [],
  onScreen: [],
};
const useContextEntries: typeof useAgentContextEntries =
  useAgentContextEntries ?? (() => NO_AGENT_CONTEXT_ENTRIES);

/* ------------------------------------------------------------------------------------ */
/* Provider + hook                                                                       */
/* ------------------------------------------------------------------------------------ */

/** What openers see: the open session and the ways to open and close it. */
export type FloatingAgentChatContextValue = Omit<
  UseFloatingAgentChatControllerResult<SDKAgentChat>,
  'markDraftSent'
> & {
  /**
   * A new chat with one of the provider's `agents`, in the panel — the door the platform's rail
   * comes through; from a page, prefer `open`. True once it opened; nothing happens (false)
   * without `agents`, for an agent not among them, or for an anonymous visitor.
   */
  openPrompt: (options?: FloatingAgentPromptOpenOptions) => boolean;
};

export const FloatingAgentChatContext =
  React.createContext<FloatingAgentChatContextValue | null>(null);

/** The surface's own seam into the provider's state — not for openers. */
const FloatingAgentChatInternalContext = React.createContext<{
  /** The draft's first send made it a thread: the state follows. */
  onDraftSent: () => void;
  /** The provider's `chatContext`: the app's, for every floating conversation. */
  chatContext: unknown;
  /** The retired prompt's composition (the provider's `prompt` slot); rendered for no session. */
  promptSlot: React.ReactNode;
  /** The open agent's chat, once it is up — null while it loads and once the session is gone. */
  setPromptChat: (chat: FloatingAgentPromptChat | null) => void;
  /** False for `panel={null}`: no floating chat to open. */
  hasPanel: boolean;
} | null>(null);

/** The floating chat, to open it from anywhere under `FloatingAgentChatProvider`. */
export function useFloatingAgentChat(): FloatingAgentChatContextValue {
  const context = React.useContext(FloatingAgentChatContext);
  if (!context) {
    throw new Error(
      "useFloatingAgentChat must render under <FloatingAgentChatProvider> — mount it once in the app's top-level layout (src/root.tsx, or a top-level routes/layout.tsx), around everything it renders.",
    );
  }
  return context;
}

/**
 * The floating chat, or null where there is none — no provider mounted, or `panel={null}` on
 * it (a surface that degrades to navigating).
 */
export function useFloatingAgentChatOptional(): FloatingAgentChatContextValue | null {
  const context = React.useContext(FloatingAgentChatContext);
  const internal = React.useContext(FloatingAgentChatInternalContext);
  return internal?.hasPanel === false ? null : context;
}

export interface FloatingAgentChatProviderProps {
  children?: React.ReactNode;
  /**
   * The panel: <FloatingAgentChat /> by default; your own composition of its parts, or `null`
   * for no floating chat at all — the platform's rail then falls back to the agent's new-chat
   * page, and agent-layout's sidebar picks navigate (no minimize).
   */
  panel?: React.ReactNode;
  /**
   * The agents the platform's rail can open a new chat with (`openPrompt` too) — one entry per
   * agent mini-app: its generated handles and its entry route. Without them the rail falls back
   * to the agent's new-chat page.
   */
  agents?: readonly FloatingAgentPromptAgent[];
  /** Retired: the prompt's composition, kept so existing apps build; nothing renders it. */
  prompt?: React.ReactNode;
  /**
   * The app's context for every floating conversation, sent with every turn (an opener's own
   * context goes over it, what components share with `useAgentContext` over both, `onScreen` and
   * `urlContext` beside them).
   */
  chatContext?: unknown;
}

/** What openers see where this app-render has no floating chat yet: closed, and `open` names the gap. */
const UNAVAILABLE_FLOATING_AGENT_CHAT: FloatingAgentChatContextValue = {
  state: null,
  isOpen: false,
  open: needsNewerReactCommon('the floating agent chat'),
  openPrompt: needsNewerReactCommon('the floating agent chat'),
  close: () => undefined,
  closeForAgent: () => undefined,
};

const NO_AGENTS: readonly FloatingAgentPromptAgent[] = [];
// The default faces, made once: a new element per render would re-render the surface for nothing.
const DEFAULT_PANEL = <FloatingAgentChat />;
// RETIRED-PROMPT: the prompt face — DEFAULT_PROMPT, the `prompt` slot, promptValue,
// FloatingAgentPromptChatLink and the surface's `face === 'prompt'` branches — is reachable only
// from a react-common older than the one this item ships with (an app-render not yet deployed
// with it, whose hook opens `face: 'prompt'`). Delete it all, and floating-agent-prompt.tsx,
// once none runs.
const DEFAULT_PROMPT = <FloatingAgentPrompt />;

/** The mini-app's root the panel's expand links build on: its entry route, no trailing slash. */
const miniAppRoot = (entryRoute: string): string =>
  entryRoute.replace(/\/+$/, '');

/** Where the panel's expand goes for a conversation with one of these agents: its thread page. */
const promptExpandHref =
  (entryRoute: string): FloatingAgentChatExpandHref =>
  (conversation) =>
    `${miniAppRoot(entryRoute)}/threads/${encodeURIComponent(conversation.chatThreadId)}`;

/** Where the panel's expand goes for the new chat, nothing sent yet: the mini-app's new-chat page. */
const promptNewChatHref = (entryRoute: string): string =>
  `${miniAppRoot(entryRoute)}/new`;

/**
 * Holds what the floating chat shows and renders the surface after its children — once, at the
 * app's root, so a conversation follows the person across the app's mini-apps and pages. On an
 * app-render older than the floating chat it renders the children alone: every page still
 * works, and an opener's `open` names the missing react-common instead of the whole app failing
 * at its root.
 */
export function FloatingAgentChatProvider(
  props: FloatingAgentChatProviderProps,
) {
  // Module constants decide: they never change while a provider is mounted, so no hook moves.
  if (
    !useFloatingAgentChatController ||
    !useFloatingAgentPromptController ||
    !useFloatingAgentChatEngine ||
    !useFloatingAgentChatContext
  ) {
    return (
      <FloatingAgentChatContext.Provider
        value={UNAVAILABLE_FLOATING_AGENT_CHAT}
      >
        {props.children}
      </FloatingAgentChatContext.Provider>
    );
  }
  return <FloatingAgentChatProviderLive {...props} />;
}

function FloatingAgentChatProviderLive({
  children,
  panel = DEFAULT_PANEL,
  agents = NO_AGENTS,
  prompt = DEFAULT_PROMPT,
  chatContext,
}: FloatingAgentChatProviderProps) {
  // The surface reads the router (the page's URL is part of every turn's context), so the
  // provider belongs inside it — the app's top-level layout — and says so at mount.
  const inRouter = useInRouterContext();
  if (!inRouter) {
    throw new Error(
      "FloatingAgentChatProvider must render inside the router: mount it in the app's top-level layout (src/root.tsx).",
    );
  }
  const session = useFloatingAgentChatController<SDKAgentChat>();
  // `panel={null}` is no floating chat: the doors decline (the platform's rail falls back to the
  // agent's new-chat page), and useFloatingAgentChatOptional reads as no provider.
  const hasPanel = panel !== null && panel !== false;
  const { state, isOpen, open, close, closeForAgent, markDraftSent } = session;
  const client = useClient();
  const user = useUser();

  // The prompt's agents, resolved for the controller: the SDK handle the engine opens (the
  // mini-app's own chat) and the expand links into the mini-app's thread and new-chat pages —
  // and their personas, for the parts. Per `agents` identity — a module-level array resolves once; an
  // inline one re-resolves on every render of the layout and re-renders the prompt's parts and
  // every `useFloatingAgentChat()` reader with it (no request is made either way).
  const promptAgents = React.useMemo(
    () => ({
      entries: agents.map((entry) => ({
        id: entry.agent.id,
        agentChatId: entry.agentChat.agentChatId,
        handle: client.agentChat(entry.agentChat),
        expandHref: promptExpandHref(entry.entryRoute),
        newChatHref: promptNewChatHref(entry.entryRoute),
      })),
      personas: agents.map((entry) => entry.agent),
    }),
    [agents, client],
  );

  const {
    isOpen: isPromptFace,
    agentId: promptAgentId,
    openPrompt,
    text,
    setText,
    openCount,
    canSend,
    send,
    setChat,
  } = useFloatingAgentPromptController({
    session,
    agents: promptAgents.entries,
    canOpen: user.isAuthenticated && hasPanel,
  });

  const value = React.useMemo<FloatingAgentChatContextValue>(
    () => ({ state, isOpen, open, openPrompt, close, closeForAgent }),
    [state, isOpen, open, openPrompt, close, closeForAgent],
  );
  const internal = React.useMemo(
    () => ({
      onDraftSent: markDraftSent,
      chatContext,
      promptSlot: prompt,
      setPromptChat: setChat,
      hasPanel,
    }),
    [markDraftSent, chatContext, prompt, setChat, hasPanel],
  );

  // The prompt's parts read this, under the surface only: what is typed changes it on every
  // keystroke, and nothing else re-renders for that.
  // Re-pointing the prompt keeps the opener's context, as it keeps the text.
  const selectAgent = React.useCallback(
    (agentId: string) =>
      openPrompt({ agent: agentId, chatContext: state?.chatContext }),
    [openPrompt, state?.chatContext],
  );
  const promptValue = React.useMemo<FloatingAgentPromptContextValue | null>(
    () =>
      isPromptFace
        ? {
            agents: promptAgents.personas,
            agentId: promptAgentId ?? '',
            selectAgent,
            openCount,
            text,
            setText,
            canSend,
            send,
            close,
          }
        : null,
    [
      isPromptFace,
      promptAgents.personas,
      promptAgentId,
      selectAgent,
      openCount,
      text,
      setText,
      canSend,
      send,
      close,
    ],
  );
  return (
    <FloatingAgentChatContext.Provider value={value}>
      <FloatingAgentChatInternalContext.Provider value={internal}>
        {children}
        <FloatingAgentPromptContext.Provider value={promptValue}>
          {panel}
        </FloatingAgentPromptContext.Provider>
      </FloatingAgentChatInternalContext.Provider>
    </FloatingAgentChatContext.Provider>
  );
}

/* ------------------------------------------------------------------------------------ */
/* The panel's contexts: its density and title id; the open conversation as parts read it  */
/* ------------------------------------------------------------------------------------ */

interface FloatingAgentChatPanelValue {
  size: AgentChatSize;
  /** The title part's id — the panel's landmark is labelled by it. */
  titleId: string;
}

const FloatingAgentChatPanelContext =
  React.createContext<FloatingAgentChatPanelValue | null>(null);

interface FloatingAgentChatSessionValue {
  title: string;
  /** The conversation's status for the header's mark; null for a new chat (nothing to report yet). */
  status: AgentThreadStatus | null;
  isDraft: boolean;
  /** The open thread's id; none for the new chat. */
  threadId?: string;
  /** The admin chat, for an admin of the agent: feedback UI shows. */
  isAdmin: boolean;
  /** The full route for what the panel shows — for a draft, the full-page new chat. */
  expandHref: string | null;
  /** Where the feedback notes lead: the panel re-points to that thread. */
  feedbackLinks: AgentFeedbackLinks | null;
}

const FloatingAgentChatSessionContext =
  React.createContext<FloatingAgentChatSessionValue | null>(null);

const usePanel = (): FloatingAgentChatPanelValue => {
  const panel = React.useContext(FloatingAgentChatPanelContext);
  if (!panel) {
    throw new Error(
      'Floating agent chat parts must render inside <FloatingAgentChat>.',
    );
  }
  return panel;
};

const useSession = (): FloatingAgentChatSessionValue => {
  const session = React.useContext(FloatingAgentChatSessionContext);
  if (!session) {
    throw new Error(
      'Floating agent chat parts must render inside <FloatingAgentChat>.',
    );
  }
  return session;
};

/* ------------------------------------------------------------------------------------ */
/* Root                                                                                  */
/* ------------------------------------------------------------------------------------ */

/** The box before anyone resizes it: a reading column of chat beside a page (22rem × 36rem). */
const DEFAULT_SIZE: PanelSize = { width: 352, height: 576 };
/** Pixel floor: a usable composer and a few turns of transcript. */
const MIN_SIZE: PanelSize = { width: 288, height: 320 };
/** The gap the panel keeps from the viewport's edges — its `bottom-4 start-4` placement, in px. */
const INSET = 16;
const SIZE_STORAGE_KEY = 'floating-agent-chat:size';
/** A trigger whose popup is open — a menu, dialog or listbox trigger, or a combobox. A disclosure (an expanded tool card) is not one. */
const OPEN_POPUP_TRIGGER_SELECTOR =
  '[aria-expanded="true"]:is([aria-haspopup], [role="combobox"])';

export interface FloatingAgentChatProps extends Omit<
  React.ComponentProps<'aside'>,
  'children'
> {
  /** Chat density inside the panel — compact by default. */
  size?: AgentChatSize;
  /** The parts; the default is the header (status, title, expand, close) over the body. */
  children?: React.ReactNode;
}

/**
 * The surface. Renders only while the provider has a session open; the provider mounts it
 * once, after the app — never render it elsewhere. Escape closes it.
 */
export function FloatingAgentChat({
  size = 'sm',
  children,
  ...props
}: FloatingAgentChatProps) {
  const { state } = useFloatingAgentChat();
  const user = useUser();
  if (!state) {
    return null;
  }
  // Same gate as AgentLayout: never an anonymous visitor. The panel throws only while one is
  // open, so a public page with the provider mounted still renders.
  if (!user.isAuthenticated) {
    throw new Error(
      'Floating agent chat never renders for an anonymous visitor. In a public app, call open() only when useUser().isAuthenticated is true.',
    );
  }
  return (
    <FloatingAgentChatFrame state={state} size={size} {...props}>
      {children ?? (
        <>
          <FloatingAgentChatHeader />
          <FloatingAgentChatBody />
        </>
      )}
    </FloatingAgentChatFrame>
  );
}

type FrameProps = Omit<FloatingAgentChatProps, 'size'> & {
  state: FloatingAgentChatState<SDKAgentChat>;
  size: AgentChatSize;
};

/**
 * The mounted surface — split from FloatingAgentChat so its hooks run only while it shows. The
 * engine is its one stable child per agent, so a change of face (RETIRED-PROMPT) changes the box
 * around it and nothing inside. Another agent is another engine in the same box.
 */
function FloatingAgentChatFrame({
  state,
  size,
  className,
  style,
  children,
  ref: forwardedRef,
  ...props
}: FrameProps) {
  const { close } = useFloatingAgentChat();
  const internal = React.useContext(FloatingAgentChatInternalContext);
  const face = state.face;
  const conversation = state.conversation;
  const isDraft = isFloatingAgentChatDraft(state);

  const panelRef = React.useRef<HTMLElement | null>(null);
  const setRef = React.useCallback(
    (node: HTMLElement | null) => {
      panelRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );
  const {
    size: panelSize,
    isResizing,
    getHandleProps,
  } = useResizable(panelRef, {
    defaultSize: DEFAULT_SIZE,
    minSize: MIN_SIZE,
    inset: INSET,
    storageKey: SIZE_STORAGE_KEY,
  });

  // The engine: one chat runtime per agent (and per retry of a failed load) — another agent is
  // a new runtime, not a re-pointed one — and its phase, react-common's. Until the runtime's
  // parts are up the panel shows its skeleton; a failed load, the retry notice.
  const {
    key: engineKey,
    phase,
    onReady,
    onLoadError,
    retry: retryLoad,
  } = useFloatingAgentChatEngine(state.agentChatId);

  const { notifyRef, onUserMessageSent } = useUserMessageSentSeam();

  const titleId = React.useId();
  const panelValue = React.useMemo(() => ({ size, titleId }), [size, titleId]);

  // What the pages tell the agent (the SDK's `useAgentContext` and what their reads have on
  // screen) and what the URL tells go with every turn, beside the app's context and the
  // opener's — the router's values, read here (react-common knows no router). At the app's root
  // `useParams()` is the deepest route's params: the router shares one params object down the
  // matched branch.
  const routeParams = useParams();
  const [searchParams] = useSearchParams();
  const { shared, onScreen } = useContextEntries();
  const chatContext = useFloatingAgentChatContext({
    provided: internal?.chatContext,
    opener: state.chatContext,
    shared,
    onScreen,
    routeParams,
    searchParams,
  });
  const onDraftSent = internal?.onDraftSent;

  // The engine, made once per what it shows: the box re-renders on every move of a resize
  // (and on each phase), and the conversation inside it must not.
  const engineElement = React.useMemo(
    () => (
      <AgentChat
        key={engineKey}
        agentChat={state.agentChat}
        defaultThreadId={conversation.chatThreadId}
        chatContext={chatContext}
        disableInitialPrompt
        onUserMessageSent={onUserMessageSent}
        onLoadError={onLoadError}
      >
        <FloatingAgentChatSession
          state={state}
          conversation={conversation}
          isDraft={isDraft}
          notifyRef={notifyRef}
          onReady={onReady}
          onDraftSent={onDraftSent}
        >
          {face === 'prompt' ? <FloatingAgentPromptChatLink /> : children}
        </FloatingAgentChatSession>
      </AgentChat>
    ),
    [
      engineKey,
      state,
      conversation,
      isDraft,
      chatContext,
      onUserMessageSent,
      onLoadError,
      notifyRef,
      onReady,
      onDraftSent,
      face,
      children,
    ],
  );

  // The prompt turns into the panel in place — the same box, so its entrance would not play
  // again by itself: restarted, the panel settles in from its corner as on any open (and the
  // prompt from the top, when it replaces the panel).
  const shownFaceRef = React.useRef(face);
  React.useLayoutEffect(() => {
    if (shownFaceRef.current === face) {
      return;
    }
    shownFaceRef.current = face;
    const panel = panelRef.current;
    if (panel) {
      panel.style.animation = 'none';
      void panel.offsetWidth;
      panel.style.animation = '';
    }
  }, [face]);

  // The prompt is transient: a press anywhere else on the page closes it. The agent menu's
  // popup is portaled out of this box, so a press on it must not count as outside.
  React.useEffect(() => {
    if (face !== 'prompt') {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        panelRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest('[data-slot="dropdown-menu-content"]'))
      ) {
        return;
      }
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [face, close]);

  // The composer takes focus once the engine is up (the parts render only then), and again on
  // every open — each commits a new session state: picking a conversation, or pressing the
  // rail's bubble again, is picking up the talk.
  React.useEffect(() => {
    if (phase === 'ready') {
      focusAgentChatInput(panelRef.current, { preventScroll: true });
    }
  }, [state, phase]);

  return (
    <FloatingAgentChatPanelContext.Provider value={panelValue}>
      <aside
        ref={setRef}
        // The prompt takes focus and Escape dismisses it — a non-modal dialog; the panel is a
        // complementary landmark the page keeps working beside.
        role={face === 'prompt' ? 'dialog' : 'complementary'}
        aria-label={face === 'prompt' ? 'Ask an agent' : undefined}
        aria-labelledby={face === 'panel' ? titleId : undefined}
        data-slot="floating-agent-chat"
        data-face={face}
        data-size={size}
        data-state={phase}
        data-resizing={isResizing ? '' : undefined}
        className={cn(
          // The app's topmost layer: over every dialog and sheet (z-50), so a conversation
          // stays in reach whatever the page opens. Its own popups sit above it (z-[70]).
          'fixed z-[60] flex flex-col',
          face === 'prompt'
            ? // The prompt: top centre, over whatever is on screen. Edge to edge below md;
              // from md up a compact pill — wide enough for a
              // line of a message and no wider — that covers as little of the page as it can.
              // Physical left/right: centring is symmetric, so it reads the same in RTL. The
              // pill's surface is the prompt's own.
              'top-4 end-4 start-4 md:end-auto md:start-1/2 md:w-full md:max-w-md md:-translate-x-1/2 rtl:md:translate-x-1/2 animate-in fade-in-0 slide-in-from-top-2 animation-duration-150 ease-out motion-reduce:animate-none'
            : cn(
                // The panel: anchored to the viewport's bottom-start corner.
                'bottom-4 start-4',
                // The popover surface, at the theme's radius.
                'rounded-xl border bg-popover text-popover-foreground shadow-lg',
                // Its box: the remembered size on md+, capped to the viewport; a bottom sheet below md.
                'md:h-(--floating-agent-chat-height) md:w-(--floating-agent-chat-width) md:max-h-[calc(100%-2rem)] md:max-w-[calc(100%-2rem)]',
                'max-md:inset-x-0 max-md:bottom-0 max-md:h-[85dvh] max-md:rounded-b-none max-md:border-b-0',
                // Settles in from the corner; nothing animates out (it unmounts).
                'animate-in fade-in-0 slide-in-from-bottom-2 animation-duration-150 ease-out motion-reduce:animate-none',
                isResizing && 'select-none',
              ),
          className,
        )}
        style={
          {
            '--floating-agent-chat-width': `${panelSize.width}px`,
            '--floating-agent-chat-height': `${panelSize.height}px`,
            ...style,
          } as React.CSSProperties
        }
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) {
            return;
          }
          // Escape closes the surface — not a menu or dialog opened from inside it: a
          // portaled popup's key events bubble through the React tree with a target outside
          // this box, and a popup still open from a trigger in it is that popup's Escape, not ours.
          const panel = panelRef.current;
          if (
            !panel ||
            !(event.target instanceof Node) ||
            !panel.contains(event.target) ||
            panel.querySelector(OPEN_POPUP_TRIGGER_SELECTOR)
          ) {
            return;
          }
          event.preventDefault();
          close();
        }}
        {...props}
      >
        <div
          data-slot="floating-agent-chat-content"
          className={
            face === 'prompt'
              ? undefined
              : 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[inherit]'
          }
        >
          {phase === 'error' &&
            (face === 'prompt' ? (
              <FloatingAgentPromptLoadError
                onRetry={retryLoad}
                onClose={close}
              />
            ) : (
              <FloatingAgentChatLoadError onRetry={retryLoad} />
            ))}
          {phase === 'loading' && face === 'panel' && (
            <FloatingAgentChatSkeleton />
          )}
          {/* The prompt shows from the open on — its agents are the provider's, and only its
                send waits for the engine — so a switch of agent changes the face, not the box. */}
          {face === 'prompt' && phase !== 'error' && internal?.promptSlot}
          {engineElement}
        </div>
        {face === 'panel' && (
          <>
            <FloatingAgentChatResizeHandle
              axis="height"
              {...getHandleProps('height')}
            />
            <FloatingAgentChatResizeHandle
              axis="width"
              {...getHandleProps('width')}
            />
            <FloatingAgentChatResizeHandle
              axis="both"
              {...getHandleProps('both')}
            />
          </>
        )}
      </aside>
    </FloatingAgentChatPanelContext.Provider>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Resize handles: the top edge, the end edge, the corner between them                    */
/* ------------------------------------------------------------------------------------ */

const resizeHandleVariants = cva(
  'absolute z-10 touch-none select-none rounded-full outline-hidden transition-colors hover:bg-border focus-visible:bg-border focus-visible:ring-2 focus-visible:ring-ring max-md:hidden motion-reduce:transition-none',
  {
    variants: {
      axis: {
        height: '-top-1 inset-x-3 h-2 cursor-ns-resize',
        width: '-end-1 inset-y-3 w-2 cursor-ew-resize',
        both: '-top-1 -end-1 size-4 cursor-nesw-resize rtl:cursor-nwse-resize',
      },
    },
  },
);

const RESIZE_HANDLE_LABEL: Record<PanelResizeAxis, string> = {
  height: 'Resize chat panel height',
  width: 'Resize chat panel width',
  both: 'Resize chat panel',
};

const RESIZE_HANDLE_ORIENTATION: Partial<
  Record<PanelResizeAxis, 'horizontal' | 'vertical'>
> = {
  height: 'horizontal',
  width: 'vertical',
};

function FloatingAgentChatResizeHandle({
  axis,
  className,
  ...props
}: React.ComponentProps<'div'> & { axis: PanelResizeAxis }) {
  return (
    <div
      role="separator"
      aria-orientation={RESIZE_HANDLE_ORIENTATION[axis]}
      aria-label={RESIZE_HANDLE_LABEL[axis]}
      title="Drag to resize"
      tabIndex={0}
      data-slot="floating-agent-chat-resize-handle"
      data-axis={axis}
      className={cn(resizeHandleVariants({ axis }), className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------------------------ */
/* Sessions: the open conversation, as the parts read it                                 */
/* ------------------------------------------------------------------------------------ */

interface SessionProps {
  state: FloatingAgentChatState<SDKAgentChat>;
  conversation: FloatingAgentChatState['conversation'];
  isDraft: boolean;
  notifyRef: React.RefObject<AgentChatUserMessageSentHandler | null>;
  onReady: () => void;
  onDraftSent?: () => void;
  children: React.ReactNode;
}

/**
 * A signed-in person's session: react-common's single-conversation Root for the resolved agent
 * (the agent's shared store — no second index, no second subscription), with the surface's
 * wiring inside it.
 */
function FloatingAgentChatSession({
  state,
  conversation,
  isDraft,
  children,
  ...wiring
}: SessionProps) {
  const { agent, isThinking, reloadMessages, setRunningElsewhere } =
    useAgentChat();
  const user = useUser();
  const { token, isAdmin } = state.agentChat.getAgentChatComponentProps();
  if (!agent) {
    return null;
  }
  // The layout's rule: the admin chat, for an admin of this agent. Display-only — the server
  // checks both every turn.
  const showsFeedback =
    isAdmin === true && isAgentAdmin(user, agent.adminRoles);
  return (
    <ThreadConversationProvider
      agentId={agent.id}
      conversation={conversation}
      isDraft={isDraft}
      token={token}
      chat={{ isThinking, reloadMessages, setRunningElsewhere }}
    >
      <FloatingAgentChatConversationSession
        state={state}
        isAdmin={showsFeedback}
        {...wiring}
      >
        {children}
      </FloatingAgentChatConversationSession>
    </ThreadConversationProvider>
  );
}

/**
 * The send seam (the row learns of a send; a draft's first send makes it a thread), readiness,
 * and what the header and body show.
 */
function FloatingAgentChatConversationSession({
  state,
  isAdmin,
  notifyRef,
  onReady,
  onDraftSent,
  children,
}: Omit<SessionProps, 'conversation' | 'isDraft'> & { isAdmin: boolean }) {
  const { row, isDraft, conversation, notifyMessageSent } =
    useAgentConversationContext();
  const { open } = useFloatingAgentChat();

  React.useEffect(() => {
    notifyRef.current = (text, message) => {
      notifyMessageSent(text, message);
      if (isDraft) {
        onDraftSent?.();
      }
    };
    return () => {
      notifyRef.current = null;
    };
  }, [notifyRef, notifyMessageSent, isDraft, onDraftSent]);

  React.useLayoutEffect(() => {
    onReady();
  }, [onReady]);

  const { agentChat, expandHref, newChatHref, chatContext } = state;
  const value = React.useMemo<FloatingAgentChatSessionValue>(
    () => ({
      title: isDraft ? NEW_CHAT_TITLE : agentThreadDisplayTitle(row),
      status: isDraft ? null : row.status,
      isDraft,
      threadId: isDraft ? undefined : conversation.chatThreadId,
      isAdmin,
      // A draft exists nowhere yet: its full version is the full-page new chat.
      expandHref: isDraft ? (newChatHref ?? null) : (expandHref?.(row) ?? null),
      // The feedback notes re-point the panel — stay-on-page is the whole point of it.
      feedbackLinks: {
        openThread: (threadId) =>
          open({
            agentChat,
            target: { chatThreadId: threadId },
            expandHref,
            newChatHref,
            chatContext,
          }),
      },
    }),
    [
      isDraft,
      row,
      conversation.chatThreadId,
      isAdmin,
      expandHref,
      newChatHref,
      agentChat,
      chatContext,
      open,
    ],
  );

  return (
    <FloatingAgentChatSessionContext.Provider value={value}>
      {children}
    </FloatingAgentChatSessionContext.Provider>
  );
}

/**
 * The prompt renders outside the engine (it shows while the agent loads); this, inside it, lends
 * the prompt the engine's send — and takes it back when the engine goes (another agent, the
 * flip to the panel, a close). Item-side glue by necessity: it reads the engine's `useAgentChat`,
 * which lives in react-common's chat entry, not its threads entry.
 */
function FloatingAgentPromptChatLink() {
  const setPromptChat = React.useContext(
    FloatingAgentChatInternalContext,
  )?.setPromptChat;
  const { sendMessage, isAgentReady, isFetchingMessages, isThinking } =
    useAgentChat();
  const canSend = isAgentReady && !isFetchingMessages && !isThinking;
  // The engine's send changes with its state; the prompt calls the current one.
  const sendMessageRef = React.useRef(sendMessage);
  React.useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  React.useEffect(() => {
    setPromptChat?.({
      canSend,
      send: (content) => {
        void sendMessageRef.current({ content }).catch(() => undefined);
      },
    });
    return () => setPromptChat?.(null);
  }, [canSend, setPromptChat]);
  return null;
}

/* ------------------------------------------------------------------------------------ */
/* Header and its parts                                                                  */
/* ------------------------------------------------------------------------------------ */

export const floatingAgentChatHeaderVariants = cva(
  'flex shrink-0 items-center gap-1.5 border-b',
  {
    variants: {
      size: {
        sm: 'h-12',
        md: 'h-14',
        lg: 'h-16',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
);

export type FloatingAgentChatHeaderProps = React.ComponentProps<'header'>;

/** The panel's top row at its density; the default parts are status, title, expand, close. */
export function FloatingAgentChatHeader({
  className,
  children,
  ...props
}: FloatingAgentChatHeaderProps) {
  const { size } = usePanel();
  return (
    <header
      data-slot="floating-agent-chat-header"
      data-size={size}
      className={cn(
        floatingAgentChatHeaderVariants({ size }),
        agentChatColumnInsetVariants({ size }),
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <FloatingAgentChatStatus />
          <FloatingAgentChatTitle />
          <FloatingAgentChatExpand />
          <FloatingAgentChatClose />
        </>
      )}
    </header>
  );
}

export type FloatingAgentChatStatusProps = Omit<
  React.ComponentProps<typeof AgentThreadStatusMark>,
  'status'
>;

/** The conversation's status mark — the sidebar's dot / spinner / ring; nothing for a new chat. */
export function FloatingAgentChatStatus(props: FloatingAgentChatStatusProps) {
  const { status } = useSession();
  if (!status) {
    return null;
  }
  return <AgentThreadStatusMark status={status} {...props} />;
}

export type FloatingAgentChatTitleProps = Omit<
  React.ComponentProps<'h2'>,
  'children'
>;

/** The conversation's title ("New chat" for a draft); labels the panel's landmark. */
export function FloatingAgentChatTitle({
  className,
  ...props
}: FloatingAgentChatTitleProps) {
  const { titleId } = usePanel();
  const { title } = useSession();
  return (
    <h2
      id={titleId}
      data-slot="floating-agent-chat-title"
      className={cn('min-w-0 flex-1 truncate text-sm font-medium', className)}
      {...props}
    >
      {title}
    </h2>
  );
}

export type FloatingAgentChatExpandProps = Omit<
  React.ComponentProps<typeof Button>,
  'onClick'
>;

/**
 * The history-state key the expand leaves on the full route: the page it came from, where the
 * full page's minimize goes back to. agent-layout reads it under the same name.
 */
const RETURN_TO_STATE_KEY = 'floatingAgentChatReturnTo';

/**
 * The way to the full route the opener named for what the panel shows — the conversation's, or
 * the full-page new chat while nothing is sent. Folds the panel, then navigates, leaving the page
 * it came from in the route's history state (RETURN_TO_STATE_KEY).
 */
export function FloatingAgentChatExpand({
  children,
  ...props
}: FloatingAgentChatExpandProps) {
  const { close } = useFloatingAgentChat();
  const { expandHref } = useSession();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  if (!expandHref) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Open the full conversation"
      title="Open the full conversation"
      data-slot="floating-agent-chat-expand"
      onClick={() => {
        close();
        navigate(expandHref, {
          state: { [RETURN_TO_STATE_KEY]: `${pathname}${search}${hash}` },
        });
      }}
      {...props}
    >
      {children ?? <Maximize2Icon />}
    </Button>
  );
}

export type FloatingAgentChatCloseProps = Omit<
  React.ComponentProps<typeof Button>,
  'onClick'
>;

/** Closes the panel; focus returns to what opened it. */
export function FloatingAgentChatClose({
  children,
  ...props
}: FloatingAgentChatCloseProps) {
  const { close } = useFloatingAgentChat();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Close chat panel"
      title="Close chat panel"
      data-slot="floating-agent-chat-close"
      onClick={close}
      {...props}
    >
      {children ?? <XIcon />}
    </Button>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Body: the conversation                                                               */
/* ------------------------------------------------------------------------------------ */

export type FloatingAgentChatBodyProps = Omit<
  AgentChatConversationProps,
  'size' | 'isDraft' | 'isAdmin' | 'threadId'
>;

/**
 * The conversation at the panel's density — the same `AgentChatConversation` the full page
 * renders, feedback included on the admin chat, under a plain-row composer.
 */
export function FloatingAgentChatBody({
  placeholder,
  composerVariant = 'divider',
  className,
  ...props
}: FloatingAgentChatBodyProps) {
  const { size } = usePanel();
  const { agent } = useAgentChat();
  const { isDraft, isAdmin, threadId, feedbackLinks } = useSession();
  return (
    <AgentFeedbackLinksContext.Provider value={feedbackLinks}>
      <AgentChatConversation
        data-slot="floating-agent-chat-body"
        size={size}
        isDraft={isDraft}
        isAdmin={isAdmin}
        threadId={threadId}
        placeholder={placeholder ?? `Message ${agentDisplayName(agent)}…`}
        composerVariant={composerVariant}
        className={cn('min-h-0 flex-1', className)}
        {...props}
      />
    </AgentFeedbackLinksContext.Provider>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Loading and error                                                                     */
/* ------------------------------------------------------------------------------------ */

/** The panel's shape while the chat runtime resolves the agent: a title row, a composer row. */
function FloatingAgentChatSkeleton() {
  const { size } = usePanel();
  return (
    <div
      data-slot="floating-agent-chat-skeleton"
      aria-busy
      aria-label="Loading conversation"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className={cn(
          floatingAgentChatHeaderVariants({ size }),
          agentChatColumnInsetVariants({ size }),
        )}
      >
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex-1" />
      <div
        className={cn(
          'flex h-14 items-center border-t',
          agentChatColumnInsetVariants({ size }),
        )}
      >
        <Skeleton className="h-5 w-40" />
      </div>
    </div>
  );
}

function FloatingAgentChatLoadError({ onRetry }: { onRetry: () => void }) {
  const { close } = useFloatingAgentChat();
  return (
    <AgentChatLoadError
      data-slot="floating-agent-chat-load-error"
      className="min-h-0 flex-1"
      onRetry={onRetry}
      actionsClassName="flex-row justify-center gap-2"
    >
      <Button type="button" variant="ghost" size="sm" onClick={close}>
        Close
      </Button>
    </AgentChatLoadError>
  );
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line