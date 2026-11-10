import type {
  AgentConversationRef,
  AgentThreadGroup,
  AgentThreadItem,
  FloatingAgentChatTarget,
} from '@blocksdiy/react-common/agent-threads';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import type { AgentChatSize } from '@/components/ui/agent-chat';

/*
 * The agent layout's shell context (density, routing, the sidebar sheet, the floating agent
 * chat, the rename dialog), its URL contract, and the index's group labels (status marks are
 * the agent-chat family's agent-thread-status, shared with the floating agent chat). The conversation itself — the index under its filters, the open
 * conversation's row, the index ↔ chat bridge — is react-common's `AgentConversationProvider`
 * / `useAgentConversationContext`, which the layout renders inside the chat runtime and the
 * parts read directly. The helpers here are pure and dependency-free on purpose: the
 * compiler's registry specs pin them.
 */

export type {
  AgentConversationRef,
  AgentThreadFilters,
} from '@blocksdiy/react-common/agent-threads';

/** The layout's density is the chat family's one scale. */
export type AgentLayoutSize = AgentChatSize;

export const agentLayoutTopRowVariants = cva('', {
  variants: {
    size: {
      sm: 'h-12',
      md: 'h-14',
      lg: 'h-16',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export const agentLayoutPersonaButtonVariants = cva('gap-2', {
  variants: {
    size: {
      sm: 'h-10 p-1',
      md: 'h-12 p-1.5',
      lg: 'h-14 p-2',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export const agentLayoutPersonaAvatarVariants = cva('shrink-0', {
  variants: {
    size: {
      sm: 'size-8',
      md: 'size-9',
      lg: 'size-10',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export interface AgentPageLink {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
}

export interface AgentPersona {
  title?: string;
  jobTitle?: string;
  avatarUrl?: string;
}

export const NEW_CHAT_SEGMENT = 'new';
export const THREADS_SEGMENT = 'threads';

export const joinPath = (basePath: string, ...segments: string[]): string => {
  const base = basePath.replace(/\/+$/, '');
  const tail = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  if (!tail) {
    return base || '/';
  }
  return `${base}/${tail}`;
};

export const newChatHref = (basePath: string): string =>
  joinPath(basePath, NEW_CHAT_SEGMENT);

export const RUN_ID_PARAM = 'runId';

/** A thread's URL. An old link's `?chatId=` is never written and, when present, ignored. */
export const threadHref = (
  basePath: string,
  threadId: string,
  options?: { runId?: string },
): string => {
  const href = joinPath(
    basePath,
    THREADS_SEGMENT,
    encodeURIComponent(threadId),
  );
  const params = new URLSearchParams();
  if (options?.runId) {
    params.set(RUN_ID_PARAM, options.runId);
  }
  const query = params.toString();
  return query ? `${href}?${query}` : href;
};

const searchParam = (search: string, name: string): string | undefined =>
  new URLSearchParams(search).get(name)?.trim() || undefined;

export const runIdFromSearch = (search: string): string | undefined =>
  searchParam(search, RUN_ID_PARAM);

const trimTrailingSlashes = (pathname: string): string =>
  pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

export const normalizePathname = (pathname: string): string =>
  trimTrailingSlashes(pathname).toLowerCase();

const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const threadIdFromPathname = (
  pathname: string,
  basePath: string,
): string | undefined => {
  const path = trimTrailingSlashes(pathname);
  const threadsPrefix =
    joinPath(trimTrailingSlashes(basePath), THREADS_SEGMENT) + '/';
  if (
    path.slice(0, threadsPrefix.length).toLowerCase() !==
    threadsPrefix.toLowerCase()
  ) {
    return undefined;
  }
  const threadId = path.slice(threadsPrefix.length);
  return threadId && !threadId.includes('/')
    ? decodeSegment(threadId)
    : undefined;
};

export const isConversationRoute = (
  pathname: string,
  basePath: string,
): boolean =>
  normalizePathname(pathname) === newChatHref(normalizePathname(basePath)) ||
  threadIdFromPathname(pathname, basePath) !== undefined;

export const isLinkActive = (
  pathname: string,
  path: string,
  basePath: string,
): boolean => {
  const current = normalizePathname(pathname);
  const target = normalizePathname(path);
  if (target === normalizePathname(basePath)) {
    return current === target;
  }
  return current === target || current.startsWith(`${target}/`);
};

/* ------------------------------------------------------------------------------------ */
/* Picking a conversation: the full route, or the floating agent chat over a page       */
/* ------------------------------------------------------------------------------------ */

/** What a sidebar pick names: a conversation, or the new chat — what the floating chat opens on. */
export type AgentConversationPick = FloatingAgentChatTarget;

/** A conversation of this agent on screen, with whether it is the untouched new chat. */
export interface AgentOpenConversation {
  conversation: AgentConversationRef;
  isDraft: boolean;
}

export const sameConversation = (
  a: AgentConversationRef,
  b: AgentConversationRef,
): boolean => a.chatThreadId === b.chatThreadId;

/** A conversation's URL under this layout (the sidebar's rows and the floating chat's expand build the same href). */
export const conversationHref = (
  basePath: string,
  conversation: AgentConversationRef,
): string => threadHref(basePath, conversation.chatThreadId);

export const conversationPickHref = (
  basePath: string,
  pick: AgentConversationPick,
): string =>
  pick === 'new' ? newChatHref(basePath) : conversationHref(basePath, pick);

export type ConversationPickAction =
  | { type: 'navigate'; href: string; replace: boolean }
  | { type: 'open-floating'; target: AgentConversationPick }
  | { type: 'close-floating' };

export interface ConversationPickInput {
  pick: AgentConversationPick;
  basePath: string;
  isConversationRoute: boolean;
  /**
   * The conversation of this agent on screen where the pick lands — the URL's on a
   * conversation route, the floating chat's over a page — with whether it is the untouched
   * new chat; null when none is.
   */
  open: AgentOpenConversation | null;
  /** The floating chat can show here (md+); below that a pick navigates, as a link would. */
  isFloatingAvailable: boolean;
}

/**
 * What a sidebar pick does. On a conversation route the URL stays the source of truth, so a
 * pick navigates (replacing history when it names what is already open). On a page the pick
 * opens the floating agent chat instead — the page stays — and picking what it already shows
 * folds it. Where the floating chat cannot show (small screens) a page pick navigates too.
 */
export const pickConversationAction = ({
  pick,
  basePath,
  isConversationRoute,
  open,
  isFloatingAvailable,
}: ConversationPickInput): ConversationPickAction => {
  const isOpen =
    open !== null &&
    (pick === 'new' ? open.isDraft : sameConversation(open.conversation, pick));
  if (isConversationRoute || !isFloatingAvailable) {
    return {
      type: 'navigate',
      href: conversationPickHref(basePath, pick),
      replace: isConversationRoute && isOpen,
    };
  }
  if (isOpen) {
    return { type: 'close-floating' };
  }
  return { type: 'open-floating', target: pick };
};

/**
 * The history-state key agent-chat's FloatingAgentChatExpand leaves on the full route: the page
 * the expand came from. Both items spell it the same (agent-layout-minimize.spec pins it).
 */
const RETURN_TO_STATE_KEY = 'floatingAgentChatReturnTo';

/**
 * The page the floating chat's expand came from, read from the full route's history state;
 * undefined when the route was reached any other way (a link, a pick in the sidebar).
 */
export const floatingAgentChatReturnTo = (
  state: unknown,
): string | undefined => {
  const value =
    state !== null && typeof state === 'object'
      ? (state as Record<string, unknown>)[RETURN_TO_STATE_KEY]
      : undefined;
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/** Where a full conversation page's minimize can go, from what the layout knows. */
export interface ConversationMinimizeInput {
  /** The page the floating chat's expand came from (`floatingAgentChatReturnTo`). */
  returnTo: string | undefined;
  /** One of the mini-app's pages (`AgentLayoutRoot`'s `minimizeTo`; AgentLayout's first link). */
  fallback: string | undefined;
  basePath: string;
}

/**
 * Where a full conversation page's minimize goes — the page shown with the conversation moved
 * into the floating chat: back where the floating chat's expand came from, else `fallback`.
 * Never the mini-app's root (it redirects to the new chat) or one of this agent's conversation
 * routes, where the layout folds its floating chat again; null when there is nowhere to go, and
 * the page offers no minimize.
 */
export const minimizeConversationHref = ({
  returnTo,
  fallback,
  basePath,
}: ConversationMinimizeInput): string | null =>
  [returnTo, fallback].find((href): href is string => {
    const path = href?.split(/[?#]/)[0];
    return (
      !!path &&
      normalizePathname(path) !== normalizePathname(basePath) &&
      !isConversationRoute(path, basePath)
    );
  }) ?? null;

/**
 * Labels for react-common's index groups (`groupAgentThreads`). Partial on purpose, like
 * STATUS_MARKS: a group react-common adds later cannot break a frozen copy's type-check, and
 * `threadGroupLabel` names it from its id until the copy is refreshed.
 */
export const THREAD_GROUP_LABELS: Readonly<
  Partial<Record<AgentThreadGroup, string>>
> = {
  chats: 'Chats',
  workflows: 'Workflows',
  feedback: 'Feedback',
};

export const threadGroupLabel = (group: AgentThreadGroup): string =>
  THREAD_GROUP_LABELS[group] ?? group.charAt(0).toUpperCase() + group.slice(1);

/** The loaded agent's admin role names (`undefined` = unset: every signed-in user; `null` =
 * malformed: nobody). */
export interface AgentAdminRoles {
  adminRoles?: readonly string[] | null;
}

/**
 * The layout's `isAdmin`: two facts, both required. The chat has the admin experience on
 * (`chatIsAdmin`, the agent-chat's `isAdmin`), AND the caller is an admin of the agent
 * (`isAgentAdmin`, react-common's rule). `agent` is `null` until the chat root has loaded the
 * agent, which reads as not-admin so no admin UI flashes first. Display-only — the server
 * checks both every turn.
 */
export const layoutIsAdmin = <User>({
  chatIsAdmin,
  agent,
  user,
  isAgentAdmin,
}: {
  chatIsAdmin: boolean | undefined;
  agent: AgentAdminRoles | null;
  user: User;
  isAgentAdmin: (
    user: User,
    adminRoles: readonly string[] | null | undefined,
  ) => boolean;
}): boolean =>
  chatIsAdmin === true &&
  agent !== null &&
  isAgentAdmin(user, agent.adminRoles);

export interface AgentLayoutContextValue {
  basePath: string;
  size: AgentLayoutSize;
  /** Feedback and admin-only filters show: see `layoutIsAdmin`. */
  isAdmin: boolean;
  isConversationRoute: boolean;
  persona: AgentPersona | null;
  isReady: boolean;
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /**
   * The floating agent chat, while it shows one of THIS agent's conversations over one of
   * the mini-app's pages (the sidebar lights that row); null otherwise — closed, another
   * agent's, or a conversation route, where the full transcript is on screen instead.
   */
  floatingChat: AgentOpenConversation | null;
  /**
   * A sidebar pick: a conversation, or `'new'` for the new chat. On a page at md+ it opens
   * in the floating agent chat (the page stays; picking what it shows folds it); on a
   * conversation route or a small screen it navigates, as a link would — see
   * `pickConversationAction`.
   */
  openConversation: (pick: AgentConversationPick) => void;
  /**
   * The full conversation page's way back to the floating chat: moves this conversation into
   * the panel over the page the floating chat's expand came from, else `minimizeTo` (see
   * `minimizeConversationHref`). Null off a conversation route, below md, without a floating
   * chat, or with nowhere to go.
   */
  minimize: (() => void) | null;
  setConversationChatContext: (value: unknown) => void;
  /** The rename dialog's row, shared by a row's "⋯" menu and the conversation header's pencil. */
  renameTarget: AgentThreadItem | null;
  openRename: (thread: AgentThreadItem) => void;
  closeRename: () => void;
}

export const AgentLayoutContext =
  React.createContext<AgentLayoutContextValue | null>(null);

export function useAgentLayout(): AgentLayoutContextValue {
  const context = React.useContext(AgentLayoutContext);
  if (!context) {
    throw new Error(
      'Agent layout parts must render inside <AgentLayout> or <AgentLayoutRoot>.',
    );
  }
  return context;
}

// @blocks-registry agent-layout@1.3.1 — registry version, never edit this line