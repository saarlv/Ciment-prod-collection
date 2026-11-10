import type { AgentChat as SDKAgentChat } from '@blocksdiy/blocks-client-sdk';
import { useUser } from '@blocksdiy/blocks-client-sdk/reactSdk';
import {
  AgentConversationProvider,
  type AgentThreadItem,
  isAgentAdmin,
  useAgentConversationContext,
  useAgentConversationSelection,
  useMediaQuery,
} from '@blocksdiy/react-common/agent-threads';
import { PanelLeftIcon } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate, useResolvedPath } from 'react-router';

import {
  AgentChat,
  AgentChatLoadError,
  type AgentChatUserMessageSentHandler,
  agentDisplayName,
  agentInitials,
  focusAgentChatInput,
  useAgentChat,
  useUserMessageSentSeam,
} from '@/components/ui/agent-chat';
import {
  AgentConversation,
  type AgentConversationProps,
} from '@/components/ui/agent-conversation';
import {
  type AgentAdminRoles,
  type AgentConversationPick,
  type AgentConversationRef,
  AgentLayoutContext,
  type AgentLayoutContextValue,
  type AgentLayoutSize,
  type AgentPageLink,
  type AgentPersona,
  conversationHref,
  floatingAgentChatReturnTo,
  isConversationRoute,
  layoutIsAdmin,
  minimizeConversationHref,
  NEW_CHAT_SEGMENT,
  newChatHref,
  pickConversationAction,
  threadHref,
  threadIdFromPathname,
  THREADS_SEGMENT,
  useAgentLayout,
} from '@/components/ui/agent-layout-context';
import {
  AgentLayoutConversations,
  AgentLayoutConversationSkeleton,
  type AgentLayoutConversationsProps,
  AgentLayoutNav,
  AgentLayoutNavLink,
  type AgentLayoutNavLinkProps,
  type AgentLayoutNavProps,
  AgentLayoutNewChat,
  type AgentLayoutNewChatProps,
  AgentLayoutPersona,
  type AgentLayoutPersonaProps,
  AgentLayoutSidebar,
  type AgentLayoutSidebarProps,
  AgentLayoutSidebarSkeleton,
  AgentLayoutThreadFilter,
  type AgentLayoutThreadFilterProps,
  AgentLayoutUserMenu,
  type AgentLayoutUserMenuProps,
} from '@/components/ui/agent-layout-sidebar';
import {
  THREADS_EMPTY_NOTICE,
  THREADS_FILTERED_EMPTY_NOTICE,
  THREADS_LOAD_ERROR_NOTICE,
} from '@/components/ui/agent-layout-threads';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  type FloatingAgentChatExpandHref,
  isFloatingAgentChatDraft,
  useFloatingAgentChatOptional,
} from '@/components/ui/floating-agent-chat';
import { cn } from '@/lib/utils';

/*
 * Agent mini-app shell: sidebar + routes; chat root mounted once and re-pointed by URL.
 * Signed-in only; lists every conversation for the agent. Compose via AgentLayoutRoot when needed.
 * The behaviour is react-common's — useAgentConversationSelection for which conversation is
 * open, AgentConversationProvider for the index and the index ↔ chat bridge; this file arranges it.
 * Over one of the mini-app's pages, a sidebar pick opens the conversation in the app's floating
 * agent chat (floating-agent-chat) instead of leaving the page — this layout is one of its
 * triggers, not its owner.
 */

// Compiled apps take react-common from app-render (window globals), which deploys independently
// of the compiler, so an installed copy of this item can predate these hooks. A stand-in in the
// hook's place keeps hook order and names the gap instead of "is not a function".
const needsNewerReactCommon = (name: string) => (): never => {
  throw new Error(
    `AgentLayout needs a newer @blocksdiy/react-common than this app-render serves (${name} is missing). Deploy app-render first.`,
  );
};
const useConversationSelection: typeof useAgentConversationSelection =
  useAgentConversationSelection ??
  needsNewerReactCommon('useAgentConversationSelection');
const ConversationProvider: typeof AgentConversationProvider =
  AgentConversationProvider ??
  needsNewerReactCommon('AgentConversationProvider');
// An app-render that predates `isAgentAdmin` also predates `agent.adminRoles`, so it cannot
// restrict admins by role: keep that app's behavior (every signed-in user). The server decides.
const callerIsAgentAdmin: typeof isAgentAdmin =
  isAgentAdmin ?? ((user) => user?.isAuthenticated === true);

export type AgentViewportProps = React.ComponentProps<'div'>;

/** Fills the container or measures to the viewport bottom; consumer `className` still wins on height. */
export function AgentViewport({
  className,
  style,
  children,
  ref: forwardedRef,
  ...props
}: AgentViewportProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [topOffset, setTopOffset] = React.useState(0);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      setTopOffset((prev) =>
        Math.abs(prev - top) < 1 ? prev : Math.max(0, top),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div
      ref={setRef}
      data-slot="agent-viewport"
      className={cn(
        'flex h-[calc(100dvh-var(--agent-viewport-top))] min-h-0 min-w-0 overflow-hidden bg-background',
        className,
      )}
      style={
        {
          '--agent-viewport-top': `${topOffset}px`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </div>
  );
}

export interface AgentLayoutRootProps extends React.ComponentProps<'div'> {
  agentChat: SDKAgentChat;
  chatContext?: unknown;
  size?: AgentLayoutSize;
  /**
   * Show only the current user's threads — a filter, not access control. By default the list
   * holds every user's conversations with the agent.
   */
  private?: boolean;
  /**
   * Where a full conversation page's minimize goes when the floating chat's expand did not bring
   * the person there (a link, a pick in the sidebar): one of the mini-app's pages.
   * AgentLayout passes its first link; without it such a page offers no minimize.
   */
  minimizeTo?: string;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

// Tailwind's `md` — where the sidebar is an in-flow rail and a page has room for the floating chat.
const MD_UP_QUERY = '(min-width: 48rem)';
// On an app-render older than the floating chat there is no panel to open: never "room for it",
// so picks navigate and the mini-app keeps working through the deploy window.
const useMdUp: typeof useMediaQuery = useMediaQuery ?? (() => false);

/**
 * Layout viewport, contexts, and a single chat root; URL drives the open conversation.
 * The app's top-level layout mounts the floating agent chat's provider; without it, sidebar picks navigate.
 */
export function AgentLayoutRoot({
  agentChat,
  chatContext,
  size = 'md',
  private: privateOnly,
  minimizeTo,
  sidebar,
  className,
  children,
  ...props
}: AgentLayoutRootProps) {
  const user = useUser();
  const handle = agentChat.getAgentChatComponentProps();
  const { pathname, state: locationState } = useLocation();
  const navigate = useNavigate();
  const basePath = useResolvedPath('.').pathname;
  const conversationRoute = isConversationRoute(pathname, basePath);

  // An old link's `?chatId=` is ignored: the thread id alone names the conversation.
  const urlThreadId = threadIdFromPathname(pathname, basePath);
  const { conversation, isDraft, markDraftSent } = useConversationSelection({
    urlTarget: urlThreadId
      ? { chatThreadId: urlThreadId }
      : conversationRoute
        ? 'new'
        : null,
  });

  // The app's floating agent chat, as this layout sees it: open on one of THIS agent's
  // conversations, over a page (md+ — below md a pick navigates, and the floating chat is a
  // bottom sheet other openers may still use). No provider above means there is no panel:
  // picks navigate.
  const floating = useFloatingAgentChatOptional();
  const isMdUp = useMdUp(MD_UP_QUERY);
  const floatingAvailable = isMdUp && floating !== null;
  const floatingState =
    floating?.state && floating.state.agentChatId === handle.agentChatId
      ? floating.state
      : null;
  const floatingChat = React.useMemo(
    () =>
      floatingState && !conversationRoute
        ? {
            conversation: floatingState.conversation,
            isDraft: isFloatingAgentChatDraft(floatingState),
          }
        : null,
    [floatingState, conversationRoute],
  );
  // A conversation route puts this agent's full transcript on screen, so this agent's floating
  // chat never stays over it: one up when the route arrives (expand closes it before landing) or
  // opened here — from the platform's rail or a page — folds, and a new chat folds into this
  // page's composer, which takes the cursor (the chat is already up). Another agent's stays — it
  // is the app's, not this layout's. A layout effect: the fold commits before the panel paints
  // (the platform's request arrives outside any DOM event, so nothing else holds the paint back).
  const closeForAgent = floating?.closeForAgent;
  const isFloatingHere = floatingState !== null;
  const isFloatingDraft =
    floatingState !== null && isFloatingAgentChatDraft(floatingState);
  const focusComposerRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!conversationRoute || !isFloatingHere) {
      return;
    }
    focusComposerRef.current = isFloatingDraft;
    closeForAgent?.(handle.agentChatId);
  }, [
    conversationRoute,
    isFloatingHere,
    isFloatingDraft,
    closeForAgent,
    handle.agentChatId,
  ]);
  const isFloatingOpen = floating?.isOpen ?? false;
  React.useEffect(() => {
    if (!focusComposerRef.current || isFloatingOpen) {
      return;
    }
    focusComposerRef.current = false;
    // Once the close has committed, this page's composer is the one left on screen. A frame
    // later, so the controller's own focus return (to what opened it), which runs in this same
    // commit after the layout's effects, cannot take the focus back.
    const frame = window.requestAnimationFrame(() => {
      focusAgentChatInput(document, { preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isFloatingOpen]);

  // The floating chat's way to the full conversation: this layout's own routes.
  const expandHref = React.useCallback<FloatingAgentChatExpandHref>(
    (target) => conversationHref(basePath, target),
    [basePath],
  );
  const openFloating = React.useCallback(
    (target: AgentConversationPick) =>
      floating?.open({
        agentChat,
        target,
        expandHref,
        newChatHref: newChatHref(basePath),
        chatContext,
      }),
    [floating, agentChat, expandHref, basePath, chatContext],
  );
  const openConversation = React.useCallback(
    (pick: AgentConversationPick) => {
      const action = pickConversationAction({
        pick,
        basePath,
        isConversationRoute: conversationRoute,
        open: conversationRoute ? { conversation, isDraft } : floatingChat,
        isFloatingAvailable: floatingAvailable,
      });
      if (action.type === 'navigate') {
        // Re-picking what is open replaces this entry: its history state (where minimize goes
        // back to) stays.
        navigate(action.href, {
          replace: action.replace,
          state: action.replace ? locationState : undefined,
        });
      } else if (action.type === 'close-floating') {
        floating?.close();
      } else {
        openFloating(action.target);
      }
    },
    [
      basePath,
      conversationRoute,
      conversation,
      isDraft,
      floatingChat,
      floatingAvailable,
      navigate,
      locationState,
      floating,
      openFloating,
    ],
  );

  // The full page's way back to the floating chat (AgentConversation's minimize): this
  // conversation in the panel, over the page the expand came from, else `minimizeTo`. md+ with
  // a provider only, as a pick; null where there is nowhere to go. The open and the route change
  // commit together (one transition), so this page never shows the panel — the fold would close it.
  const minimizeHref =
    conversationRoute && floatingAvailable
      ? minimizeConversationHref({
          returnTo: floatingAgentChatReturnTo(locationState),
          fallback: minimizeTo,
          basePath,
        })
      : null;
  const minimize = React.useMemo(
    () =>
      minimizeHref === null
        ? null
        : () =>
            React.startTransition(() => {
              openFloating(isDraft ? 'new' : conversation);
              navigate(minimizeHref);
            }),
    [minimizeHref, openFloating, isDraft, conversation, navigate],
  );

  const { notifyRef, onUserMessageSent } = useUserMessageSentSeam();

  const [persona, setPersona] = React.useState<AgentPersona | null>(null);
  // `null` until the chat root has loaded the agent (see `layoutIsAdmin`).
  const [agentAdminRoles, setAgentAdminRoles] =
    React.useState<AgentAdminRoles | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const onReady = React.useCallback(() => setIsReady(true), []);
  const [loadError, setLoadError] = React.useState<Error | null>(null);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const retryLoad = React.useCallback(() => {
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);
  const [isSidebarOpen, setSidebarOpen] = React.useState(false);
  const [conversationChatContext, setConversationChatContext] =
    React.useState<unknown>(undefined);
  const [renameTarget, setRenameTarget] =
    React.useState<AgentThreadItem | null>(null);
  const closeRename = React.useCallback(() => setRenameTarget(null), []);

  if (!user.isAuthenticated) {
    throw new Error(
      "AgentLayout lists the agent's conversations and never renders for an anonymous visitor. In a public app, gate it in layout.tsx on useUser().isAuthenticated.",
    );
  }

  const layoutValue: AgentLayoutContextValue = {
    basePath,
    size,
    isAdmin: layoutIsAdmin({
      chatIsAdmin: handle.isAdmin,
      agent: agentAdminRoles,
      user,
      isAgentAdmin: callerIsAgentAdmin,
    }),
    isConversationRoute: conversationRoute,
    persona,
    isReady,
    isSidebarOpen,
    setSidebarOpen,
    floatingChat,
    openConversation,
    minimize,
    setConversationChatContext,
    renameTarget,
    openRename: setRenameTarget,
    closeRename,
  };

  const content = <AgentLayoutContent>{children}</AgentLayoutContent>;

  return (
    <AgentLayoutContext.Provider value={layoutValue}>
      <AgentViewport
        data-slot="agent-layout"
        data-ready={isReady ? '' : undefined}
        className={className}
        {...props}
      >
        {!isReady &&
          (loadError ? (
            <AgentLayoutLoadError
              fill={conversationRoute}
              onRetry={retryLoad}
            />
          ) : (
            <>
              <AgentLayoutSidebarSkeleton />
              {conversationRoute && <AgentLayoutConversationSkeleton />}
            </>
          ))}
        <AgentChat
          key={loadAttempt}
          agentChat={agentChat}
          defaultThreadId={conversation.chatThreadId}
          noPersistency={false}
          chatContext={conversationChatContext ?? chatContext}
          disableInitialPrompt
          onUserMessageSent={onUserMessageSent}
          onLoadError={setLoadError}
        >
          <AgentThreadsProvider
            conversation={conversation}
            isDraft={isDraft}
            markDraftSent={markDraftSent}
            token={handle.token}
            privateOnly={privateOnly}
            // The platform user id; normalized, since a thread's `userId` is its decimal string.
            userId={user.id == null ? undefined : String(user.id)}
            notifyRef={notifyRef}
            onPersona={setPersona}
            onAdminRoles={setAgentAdminRoles}
            onReady={onReady}
          >
            {sidebar}
            {conversationRoute && content}
          </AgentThreadsProvider>
        </AgentChat>
        {!conversationRoute && content}
      </AgentViewport>
    </AgentLayoutContext.Provider>
  );
}

function AgentLayoutLoadError({
  fill,
  onRetry,
}: {
  fill: boolean;
  onRetry: () => void;
}) {
  return (
    <AgentChatLoadError
      data-slot="agent-layout-load-error"
      className={
        fill ? undefined : 'hidden w-72 flex-none border-e border-solid md:flex'
      }
      onRetry={onRetry}
    />
  );
}

interface AgentThreadsProviderProps {
  conversation: AgentConversationRef;
  isDraft: boolean;
  markDraftSent: () => void;
  token?: string;
  privateOnly?: boolean;
  userId?: string;
  notifyRef: React.RefObject<AgentChatUserMessageSentHandler | null>;
  onPersona: (persona: AgentPersona) => void;
  onAdminRoles: (roles: AgentAdminRoles) => void;
  onReady: () => void;
  children: React.ReactNode;
}

/** react-common's conversation Root for the resolved agent, with the layout's glue inside it. */
function AgentThreadsProvider({
  conversation,
  isDraft,
  markDraftSent,
  token,
  privateOnly,
  userId,
  notifyRef,
  onPersona,
  onAdminRoles,
  onReady,
  children,
}: AgentThreadsProviderProps) {
  const { agent, isThinking, reloadMessages, setRunningElsewhere } =
    useAgentChat();
  if (!agent) {
    return null;
  }
  return (
    <ConversationProvider
      agentId={agent.id}
      conversation={conversation}
      isDraft={isDraft}
      token={token}
      private={privateOnly}
      userId={userId}
      chat={{ isThinking, reloadMessages, setRunningElsewhere }}
    >
      <AgentThreadsSync
        agent={agent}
        markDraftSent={markDraftSent}
        notifyRef={notifyRef}
        onPersona={onPersona}
        onAdminRoles={onAdminRoles}
        onReady={onReady}
      />
      {children}
    </ConversationProvider>
  );
}

/** Keeps the layout in step with the conversation: the send seam, the persona, the admin roles, readiness, the live count. */
function AgentThreadsSync({
  agent,
  markDraftSent,
  notifyRef,
  onPersona,
  onAdminRoles,
  onReady,
}: Pick<
  AgentThreadsProviderProps,
  'markDraftSent' | 'notifyRef' | 'onPersona' | 'onAdminRoles' | 'onReady'
> & {
  agent: {
    title?: string;
    jobTitle?: string;
    photoUrl?: string;
    adminRoles?: readonly string[] | null;
  };
}) {
  const { basePath } = useAgentLayout();
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const {
    conversation,
    isDraft,
    threads,
    hasActiveFilters,
    notifyMessageSent,
  } = useAgentConversationContext();

  // The chat root's send seam: tell the index, and turn the draft into a thread (its URL
  // replaces /new, so Back does not return to an empty new chat; the entry's history state —
  // where minimize goes back to — stays).
  React.useEffect(() => {
    notifyRef.current = (text, message) => {
      notifyMessageSent(text, message);
      if (isDraft) {
        markDraftSent();
        navigate(threadHref(basePath, conversation.chatThreadId), {
          replace: true,
          state: locationState,
        });
      }
    };
    return () => {
      notifyRef.current = null;
    };
  }, [
    notifyRef,
    notifyMessageSent,
    isDraft,
    conversation.chatThreadId,
    markDraftSent,
    navigate,
    locationState,
    basePath,
  ]);

  React.useEffect(() => {
    onPersona({
      title: agent.title,
      jobTitle: agent.jobTitle,
      avatarUrl: agent.photoUrl,
    });
  }, [onPersona, agent.title, agent.jobTitle, agent.photoUrl]);

  React.useEffect(() => {
    onAdminRoles({ adminRoles: agent.adminRoles });
  }, [onAdminRoles, agent.adminRoles]);

  React.useLayoutEffect(() => {
    onReady();
  }, [onReady]);

  const loadedCount = threads.threads.length;
  // sr-only list count for the rail and sheet; blank on first load only.
  return (
    <div aria-live="polite" className="sr-only">
      {threads.isLoading && loadedCount === 0
        ? ''
        : threads.error && loadedCount === 0
          ? THREADS_LOAD_ERROR_NOTICE
          : loadedCount === 0
            ? hasActiveFilters
              ? THREADS_FILTERED_EMPTY_NOTICE
              : THREADS_EMPTY_NOTICE
            : loadedCount === 1
              ? `1 conversation${hasActiveFilters ? ' matches the filters' : ''}`
              : `${loadedCount} conversations${hasActiveFilters ? ' match the filters' : ''}`}
    </div>
  );
}

function AgentLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-slot="agent-layout-content"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <AgentLayoutMobileBar />
      {children}
    </section>
  );
}

/** Below md: the sidebar trigger and the agent's name, above whatever the route renders. */
function AgentLayoutMobileBar() {
  const { persona, isReady, setSidebarOpen } = useAgentLayout();
  const name = agentDisplayName(persona);
  return (
    <div
      data-slot="agent-layout-mobile-bar"
      className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Open menu"
        title="Open menu"
        disabled={!isReady}
        onClick={() => setSidebarOpen(true)}
      >
        <PanelLeftIcon />
      </Button>
      <Avatar className="size-7">
        <AvatarImage src={persona?.avatarUrl} alt={name} />
        <AvatarFallback className="text-xs">
          {agentInitials(persona)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-sm font-medium">{name}</span>
    </div>
  );
}

export interface AgentLayoutProps extends Omit<
  AgentLayoutRootProps,
  'children' | 'sidebar'
> {
  links?: AgentPageLink[];
  userMenuItems?: React.ReactNode;
  children: React.ReactNode;
}

/** Default AgentLayout composition; fork parts under AgentLayoutRoot when needed. */
export function AgentLayout({
  links = [],
  userMenuItems,
  children,
  ...props
}: AgentLayoutProps) {
  return (
    <AgentLayoutRoot
      minimizeTo={links[0]?.path}
      {...props}
      sidebar={
        <AgentLayoutSidebar>
          <AgentLayoutPersona />
          <AgentLayoutNav>
            {links.map((link) => (
              <AgentLayoutNavLink
                key={link.path}
                to={link.path}
                icon={link.icon}
              >
                {link.label}
              </AgentLayoutNavLink>
            ))}
            <AgentLayoutNewChat />
          </AgentLayoutNav>
          <AgentLayoutConversations action={<AgentLayoutThreadFilter />} />
          <AgentLayoutUserMenu>{userMenuItems}</AgentLayoutUserMenu>
        </AgentLayoutSidebar>
      }
    >
      {children}
    </AgentLayoutRoot>
  );
}

export {
  AgentConversation,
  AgentLayoutConversations,
  AgentLayoutNav,
  AgentLayoutNavLink,
  AgentLayoutNewChat,
  AgentLayoutPersona,
  AgentLayoutSidebar,
  AgentLayoutThreadFilter,
  AgentLayoutUserMenu,
  NEW_CHAT_SEGMENT,
  THREADS_SEGMENT,
};
export type {
  AgentConversationPick,
  AgentConversationProps,
  AgentLayoutConversationsProps,
  AgentLayoutNavLinkProps,
  AgentLayoutNavProps,
  AgentLayoutNewChatProps,
  AgentLayoutPersonaProps,
  AgentLayoutSidebarProps,
  AgentLayoutSize,
  AgentLayoutThreadFilterProps,
  AgentLayoutUserMenuProps,
  AgentPageLink,
  AgentPersona,
};

// @blocks-registry agent-layout@1.3.1 — registry version, never edit this line