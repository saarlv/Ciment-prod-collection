import {
  logOut,
  useThemeMode,
  useUser,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import {
  agentThreadDisplayTitle,
  type AgentThreadItem,
  agentThreadKey,
  type AgentThreadSource,
  type AgentThreadStatus,
  RENAME_TITLE_MAX_CHARS,
  useAgentConversationContext,
  type UseAgentThreadsResult,
} from '@blocksdiy/react-common/agent-threads';
import { cva } from 'class-variance-authority';
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SunIcon,
} from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';

import { agentChatColumnInsetVariants } from '@/components/ui/agent-chat';
import {
  agentDisplayName,
  agentInitials,
  NEW_CHAT_TITLE,
  userInitials,
} from '@/components/ui/agent-chat';
import {
  agentLayoutPersonaAvatarVariants,
  agentLayoutPersonaButtonVariants,
  agentLayoutTopRowVariants,
  isLinkActive,
  newChatHref,
  normalizePathname,
  useAgentLayout,
} from '@/components/ui/agent-layout-context';
import { AgentLayoutThreadList } from '@/components/ui/agent-layout-threads';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/*
 * Sidebar parts for AgentLayout: persona, nav, conversation index, user menu.
 * In-flow rail on md+; same tree in a Sheet below md.
 */

const SIDEBAR_WIDTH_STYLE = {
  '--sidebar-width': '18rem',
} as React.CSSProperties;

/* ------------------------------------------------------------------------------------ */
/* Sidebar                                                                               */
/* ------------------------------------------------------------------------------------ */

export type AgentLayoutSidebarProps = React.ComponentProps<'div'>;

/**
 * The conversations sidebar: an in-flow rail on md+ and a Sheet below md, both rendering
 * the same parts. Pass it as the root's `sidebar` — its index lists threads under the
 * agent the chat runtime resolves.
 */
export function AgentLayoutSidebar({
  className,
  children,
  ...props
}: AgentLayoutSidebarProps) {
  const { isSidebarOpen, setSidebarOpen } = useAgentLayout();
  const side =
    typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
      ? 'right'
      : 'left';
  return (
    <>
      <SidebarProvider
        data-slot="agent-layout-sidebar"
        className={cn(
          'hidden h-full min-h-0 w-auto shrink-0 md:flex',
          className,
        )}
        style={SIDEBAR_WIDTH_STYLE}
        {...props}
      >
        <Sidebar collapsible="none" className="border-e">
          {children}
        </Sidebar>
      </SidebarProvider>
      <Sheet open={isSidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side={side}
          className="p-0"
          data-slot="agent-layout-sidebar-sheet"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>
              The agent&apos;s pages and conversations.
            </SheetDescription>
          </SheetHeader>
          <SidebarProvider className="h-full min-h-0 w-full">
            <Sidebar collapsible="none" className="w-full">
              {children}
            </Sidebar>
          </SidebarProvider>
        </SheetContent>
      </Sheet>
      <AgentLayoutRenameDialog />
    </>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Persona                                                                               */
/* ------------------------------------------------------------------------------------ */

export type AgentLayoutPersonaProps = React.ComponentProps<'div'>;

/**
 * The agent's identity at the top of the sidebar: avatar, title, job title — the
 * mini-app's brand mark, so it navigates to the entry route (whose `index.tsx` redirects
 * wherever the mini-app opens). Never to another mini-app.
 */
export function AgentLayoutPersona({
  className,
  ...props
}: AgentLayoutPersonaProps) {
  const { basePath, persona, setSidebarOpen, size } = useAgentLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const name = agentDisplayName(persona);
  const showJobTitle = Boolean(persona?.title && persona?.jobTitle);
  const isOnHome =
    normalizePathname(pathname) === normalizePathname(newChatHref(basePath));
  return (
    <SidebarHeader
      data-slot="agent-layout-persona"
      data-size={size}
      className={cn(
        agentLayoutTopRowVariants({ size }),
        'flex-row items-center px-2 py-0',
        className,
      )}
      {...props}
    >
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className={agentLayoutPersonaButtonVariants({ size })}
            aria-label={`${name} — home`}
            title={`${name} — home`}
            onClick={() => {
              navigate(basePath, { replace: isOnHome });
              setSidebarOpen(false);
            }}
          >
            <Avatar className={agentLayoutPersonaAvatarVariants({ size })}>
              <AvatarImage src={persona?.avatarUrl} alt="" />
              <AvatarFallback>{agentInitials(persona)}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{name}</span>
              {showJobTitle && (
                <span className="truncate text-xs text-muted-foreground">
                  {persona?.jobTitle}
                </span>
              )}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Nav: the mini-app's pages + New chat                                                  */
/* ------------------------------------------------------------------------------------ */

export type AgentLayoutNavProps = React.ComponentProps<'div'>;

/**
 * The pinned navigation group above the conversations: one <AgentLayoutNavLink /> per page
 * of the mini-app, in the order given, then <AgentLayoutNewChat /> last — starting a chat
 * is about the threads below it, so the row sits right above them. Never scrolls; the
 * conversation index below it does.
 */
export function AgentLayoutNav({
  className,
  children,
  ...props
}: AgentLayoutNavProps) {
  return (
    <SidebarGroup
      data-slot="agent-layout-nav"
      className={cn('shrink-0', className)}
      {...props}
    >
      <SidebarGroupContent>
        <SidebarMenu>{children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export type AgentLayoutNewChatProps = Omit<
  React.ComponentProps<'button'>,
  'onClick'
>;

/**
 * The "New chat" row — the empty new chat: at `<basePath>/new`, or, over one of the
 * mini-app's pages, in the app's floating agent chat (the layout decides; see
 * `openConversation`). Lit on the new-chat route and while the floating chat shows a draft.
 */
export function AgentLayoutNewChat({
  children = NEW_CHAT_TITLE,
  ...props
}: AgentLayoutNewChatProps) {
  const { basePath, floatingChat, openConversation, setSidebarOpen } =
    useAgentLayout();
  const { pathname } = useLocation();
  const to = newChatHref(basePath);
  const isActive =
    isLinkActive(pathname, to, basePath) || (floatingChat?.isDraft ?? false);
  return (
    <SidebarMenuItem data-slot="agent-layout-new-chat">
      <SidebarMenuButton
        isActive={isActive}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => {
          openConversation('new');
          setSidebarOpen(false);
        }}
        {...props}
      >
        <PlusIcon />
        <span>{children}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export interface AgentLayoutNavLinkProps extends Omit<
  React.ComponentProps<'button'>,
  'onClick'
> {
  /** Absolute URL of a route file inside the mini-app folder, e.g. `/support/tickets`. */
  to: string;
  /** A lucide icon (any component taking `className`). */
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * One of the mini-app's pages. Active for the page and everything under it
 * (`/support/tickets` stays lit on `/support/tickets/42`).
 */
export function AgentLayoutNavLink({
  to,
  icon: Icon,
  children,
  ...props
}: AgentLayoutNavLinkProps) {
  const { basePath, setSidebarOpen } = useAgentLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isActive = isLinkActive(pathname, to, basePath);
  return (
    <SidebarMenuItem data-slot="agent-layout-nav-link">
      <SidebarMenuButton
        isActive={isActive}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => {
          navigate(to, {
            replace: normalizePathname(pathname) === normalizePathname(to),
          });
          setSidebarOpen(false);
        }}
        {...props}
      >
        {Icon && <Icon />}
        <span>{children}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Conversations                                                                         */
/* ------------------------------------------------------------------------------------ */

export interface AgentLayoutConversationsProps extends React.ComponentProps<'div'> {
  /** A control on the index's top label — the block passes <AgentLayoutThreadFilter />. */
  action?: React.ReactNode;
}

/**
 * The mini-app's conversation index — the scrolling body of the sidebar. A row opens its
 * conversation: on a conversation route by navigating to its URL, over one of the mini-app's
 * pages in the app's floating agent chat (the layout decides; see `openConversation`). The
 * active row is the URL's on conversation routes, the floating chat's over a page, none
 * otherwise.
 */
export function AgentLayoutConversations({
  action,
  className,
  ...props
}: AgentLayoutConversationsProps) {
  const {
    isConversationRoute,
    floatingChat,
    openConversation,
    setSidebarOpen,
    openRename,
  } = useAgentLayout();
  const { threads, conversation, hasActiveFilters } =
    useAgentConversationContext();
  const activeThreadKey = isConversationRoute
    ? agentThreadKey(conversation)
    : floatingChat
      ? agentThreadKey(floatingChat.conversation)
      : null;
  return (
    <SidebarContent
      data-slot="agent-layout-conversations"
      className={cn('gap-0', className)}
      {...props}
    >
      <AgentLayoutThreadList
        threadsState={threads}
        activeThreadKey={activeThreadKey}
        hasActiveFilters={hasActiveFilters}
        onSelectThread={(thread) => {
          openConversation({ chatThreadId: thread.chatThreadId });
          setSidebarOpen(false);
        }}
        onRenameThread={openRename}
        action={action}
      />
    </SidebarContent>
  );
}

const STATUS_OPTIONS: { value: AgentThreadStatus; label: string }[] = [
  { value: 'interrupted', label: 'Waiting for response' },
  { value: 'busy', label: 'Busy' },
  { value: 'idle', label: 'Idle' },
  { value: 'error', label: 'Error' },
];

const SOURCE_OPTIONS: {
  value: AgentThreadSource;
  label: string;
  /** Offered on the agent's admin chat, to the agent's admins only (see `layoutIsAdmin`). */
  adminOnly?: boolean;
}[] = [
  { value: 'direct_chat', label: 'Chats' },
  { value: 'send_message', label: 'Workflows' },
  { value: 'feedback', label: 'Feedback', adminOnly: true },
];

const ALL = 'all';

export type AgentLayoutThreadFilterProps = Omit<
  React.ComponentProps<'button'>,
  'onClick' | 'children'
>;

/**
 * The conversation index's status/source filter menu, shaped as a sidebar group action
 * (pinned to a group's top-end corner) — pass it as <AgentLayoutConversations action={…} />,
 * which seats it on the index's top label.
 */
export function AgentLayoutThreadFilter({
  className,
  ...props
}: AgentLayoutThreadFilterProps) {
  const { filters, setFilters, hasActiveFilters } =
    useAgentConversationContext();
  const filterLabel = hasActiveFilters
    ? 'Filter conversations (filters on)'
    : 'Filter conversations';
  const { isAdmin } = useAgentLayout();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="agent-layout-thread-filter"
        data-sidebar="group-action"
        aria-label={filterLabel}
        title={filterLabel}
        className={cn(
          'absolute end-3 top-3.5 flex aspect-square w-6 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-hidden',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          'aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground',
          // Touch halo stops at the label edge (trigger sits above the groups).
          'after:absolute after:-inset-x-2 after:-top-3.5 after:-bottom-0.5 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
          hasActiveFilters &&
            'bg-sidebar-accent text-sidebar-accent-foreground',
          className,
        )}
        {...props}
      >
        <SlidersHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuRadioGroup
          value={filters.status ?? ALL}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              status: value === ALL ? undefined : (value as AgentThreadStatus),
            })
          }
        >
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuRadioItem value={ALL}>All</DropdownMenuRadioItem>
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={filters.source ?? ALL}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              source: value === ALL ? undefined : (value as AgentThreadSource),
            })
          }
        >
          <DropdownMenuLabel>Source</DropdownMenuLabel>
          <DropdownMenuRadioItem value={ALL}>All</DropdownMenuRadioItem>
          {SOURCE_OPTIONS.filter((option) => isAdmin || !option.adminOnly).map(
            (option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ),
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------------------------ */
/* User menu (sidebar footer)                                                            */
/* ------------------------------------------------------------------------------------ */

const THEME_OPTIONS: {
  value: 'light' | 'dark' | 'system';
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

export interface AgentLayoutUserMenuProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  /**
   * Extra menu items (`DropdownMenuItem`s) the app adds, in their own group between the
   * theme and sign out.
   */
  children?: React.ReactNode;
}

/**
 * The sidebar footer: the signed-in user (avatar, name, email) opening a menu with the
 * theme mode and sign out — the platform wiring (`useUser`, `useThemeMode`, `logOut`),
 * in shadcn's nav-user shape. Renders nothing for an anonymous visitor.
 */
export function AgentLayoutUserMenu({
  className,
  children,
  ...props
}: AgentLayoutUserMenuProps) {
  const user = useUser();
  const { themeMode, setThemeMode } = useThemeMode();
  if (!user.isAuthenticated) {
    return null;
  }
  const fullName =
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    'Signed in';
  const initials = userInitials(user);
  return (
    <SidebarFooter
      data-slot="agent-layout-user-menu"
      className={className}
      {...props}
    >
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              data-sidebar="menu-button"
              data-size="lg"
              aria-label="Account menu"
              className={cn(
                'flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start text-sm outline-hidden',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                'aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground',
              )}
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={user.profileImageUrl} alt={fullName} />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-medium">{fullName}</span>
                {user.email && (
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                )}
              </span>
              <ChevronsUpDownIcon className="ms-auto size-4 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="min-w-56">
              <DropdownMenuRadioGroup
                value={themeMode}
                onValueChange={(value) =>
                  setThemeMode(value as 'light' | 'dark' | 'system')
                }
              >
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                {THEME_OPTIONS.map(({ value, label, Icon }) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    <Icon />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {children && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>{children}</DropdownMenuGroup>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => logOut()}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Rename dialog                                                                         */
/* ------------------------------------------------------------------------------------ */

function RenameThreadForm({
  thread,
  renameThread,
  onClose,
}: {
  thread: AgentThreadItem;
  renameThread: UseAgentThreadsResult['renameThread'];
  onClose: () => void;
}) {
  const [title, setTitle] = React.useState(thread.title ?? '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed || isSubmitting) {
      return;
    }
    if (trimmed === thread.title) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await renameThread(thread, trimmed);
      onClose();
    } catch {
      // The hook already rolled the optimistic title back; keep the dialog open for a retry.
      setError("Couldn't rename the conversation. Try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename conversation</DialogTitle>
        <DialogDescription className="sr-only">
          Give this conversation a title.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={agentThreadDisplayTitle(thread)}
          maxLength={RENAME_TITLE_MAX_CHARS}
          aria-label="Conversation title"
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed || isSubmitting}>
          Rename
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The rename prompt for one conversation, shared by both triggers (a row's "⋯" menu and
 * the conversation header's pencil). The rename itself is the hook's optimistic
 * renameThread — the row updates instantly and rolls back on failure. Keyed by the
 * target row so the input state resets per conversation.
 */
function AgentLayoutRenameDialog() {
  const { renameTarget, closeRename } = useAgentLayout();
  const { threads } = useAgentConversationContext();
  return (
    <Dialog
      open={renameTarget !== null}
      onOpenChange={(open) => {
        if (!open) {
          closeRename();
        }
      }}
    >
      <DialogContent>
        {renameTarget && (
          <RenameThreadForm
            key={agentThreadKey(renameTarget)}
            thread={renameTarget}
            renameThread={threads.renameThread}
            onClose={closeRename}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Skeleton                                                                              */
/* ------------------------------------------------------------------------------------ */

/**
 * The sidebar's shape while the chat runtime resolves the agent (md+ only — below md the
 * sidebar is a sheet, and the mobile bar renders as soon as the layout does).
 */
export function AgentLayoutSidebarSkeleton() {
  const { size } = useAgentLayout();
  return (
    <div
      data-slot="agent-layout-sidebar-skeleton"
      aria-busy
      aria-label="Loading conversations"
      className="hidden h-full w-72 shrink-0 flex-col gap-3 border-e md:flex"
    >
      <div
        className={cn(
          agentLayoutTopRowVariants({ size }),
          'flex items-center px-2',
        )}
      >
        <div
          className={cn(
            agentLayoutPersonaButtonVariants({ size }),
            'flex w-full items-center',
          )}
        >
          <Skeleton
            className={cn(
              agentLayoutPersonaAvatarVariants({ size }),
              'rounded-full',
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// The composer's one-line height, near enough per density (it varies by Button style).
const conversationSkeletonComposerVariants = cva('w-full rounded-4xl', {
  variants: {
    size: {
      sm: 'h-10',
      md: 'h-12',
      lg: 'h-14',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

/**
 * The conversation column's shape while the chat runtime resolves (header + composer). The
 * same geometry as AgentConversation at the layout's `size` — the top row, a title on the
 * reading column at the transcript's inset, and a pill composer standing in from that column
 * by the same inset — so nothing jumps when the real page lands.
 */
export function AgentLayoutConversationSkeleton() {
  const { size } = useAgentLayout();
  return (
    <div
      data-slot="agent-layout-conversation-skeleton"
      aria-hidden
      className="flex min-w-0 flex-1 flex-col"
    >
      <div
        className={cn(
          agentLayoutTopRowVariants({ size }),
          'flex shrink-0 border-b',
        )}
      >
        <div className="mx-auto flex w-full max-w-5xl items-center px-3">
          <div className={agentChatColumnInsetVariants({ size })}>
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
      <div className="flex-1" />
      <div className="mx-auto w-full max-w-5xl px-3 py-3">
        <div className={agentChatColumnInsetVariants({ size })}>
          <Skeleton
            className={conversationSkeletonComposerVariants({ size })}
          />
        </div>
      </div>
    </div>
  );
}

// @blocks-registry agent-layout@1.3.1 — registry version, never edit this line