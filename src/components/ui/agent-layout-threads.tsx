import {
  agentThreadDisplayTitle,
  type AgentThreadItem,
  agentThreadKey,
  groupAgentThreads,
  type UseAgentThreadsResult,
} from '@blocksdiy/react-common/agent-threads';
import { formatDistanceToNowStrict, isValid } from 'date-fns';
import { MoreHorizontalIcon, PenLineIcon } from 'lucide-react';
import * as React from 'react';

import { AgentThreadStatusMark } from '@/components/ui/agent-chat';
import { threadGroupLabel } from '@/components/ui/agent-layout-context';
import { statusMark } from '@/components/ui/agent-thread-status';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/** Relative time for a row, or null; under one minute reads "just now". */
const ago = (iso: string | null | undefined): string | null => {
  const date = iso ? new Date(iso) : null;
  if (!date || !isValid(date)) {
    return null;
  }
  const elapsed = Date.now() - date.getTime();
  return elapsed < 60_000
    ? 'just now'
    : formatDistanceToNowStrict(date, { addSuffix: true });
};

/** The list's notices — also what the layout announces, so the two never differ. */
export const THREADS_LOAD_ERROR_NOTICE =
  "Couldn't load conversations. Check your connection and try again.";
export const THREADS_EMPTY_NOTICE =
  'No conversations yet. Send a message to start one.';
export const THREADS_FILTERED_EMPTY_NOTICE =
  'No conversations match these filters.';

/** Quiet inline notice for the list's empty and error states (a full Empty is outsized here). */
function ThreadsNotice({ children }: { children: string }) {
  return (
    <div
      data-slot="agent-layout-threads-notice"
      className="px-4 py-8 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

export interface AgentLayoutThreadListProps {
  /** The layout's useAgentThreads result — the hook owns the rows; the selection is the layout's (`activeThreadKey`). */
  threadsState: UseAgentThreadsResult;
  /** The row to mark active (its `agentThreadKey`), or null — a draft, or a page route. */
  activeThreadKey: string | null;
  /** Words the empty state right when a filter (not reality) is hiding rows. */
  hasActiveFilters: boolean;
  /** A row was chosen — the layout navigates to it and (on small screens) closes the sheet. */
  onSelectThread: (thread: AgentThreadItem) => void;
  /** Opens the layout's rename dialog for a row (shared with the conversation header). */
  onRenameThread: (thread: AgentThreadItem) => void;
  /** Filter control; mounted once above groups so it does not remount when the first group changes. */
  action?: React.ReactNode;
}

/** Conversation index as sidebar groups; shared by the rail and the sheet. */
export function AgentLayoutThreadList({
  threadsState,
  activeThreadKey,
  hasActiveFilters,
  onSelectThread,
  onRenameThread,
  action,
}: AgentLayoutThreadListProps) {
  const { threads, isLoading, isLoadingMore, hasMore, error, loadMore } =
    threadsState;
  const groups = groupAgentThreads(threads);
  const groupIdPrefix = React.useId(); // the rail and the mobile sheet both mount this list

  return (
    <div data-slot="agent-layout-thread-groups">
      <div className="relative z-10">{action}</div>
      {groups.length === 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent
            className={cn(isLoading && 'flex flex-col gap-1')}
          >
            {isLoading ? (
              Array.from({ length: 5 }, (_, index) => (
                <SidebarMenuSkeleton key={index} />
              ))
            ) : error ? (
              <ThreadsNotice>{THREADS_LOAD_ERROR_NOTICE}</ThreadsNotice>
            ) : (
              <ThreadsNotice>
                {hasActiveFilters
                  ? THREADS_FILTERED_EMPTY_NOTICE
                  : THREADS_EMPTY_NOTICE}
              </ThreadsNotice>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      ) : (
        <>
          {groups.map(({ group, rows }) => {
            return (
              <SidebarGroup key={group}>
                <SidebarGroupLabel id={`${groupIdPrefix}-${group}`}>
                  {threadGroupLabel(group)}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu aria-labelledby={`${groupIdPrefix}-${group}`}>
                    {rows.map((thread) => {
                      const key = agentThreadKey(thread);
                      const rowTitle = agentThreadDisplayTitle(thread);
                      const { shape, srLabel } = statusMark(thread.status);
                      const turns = `${thread.turnCount} ${thread.turnCount === 1 ? 'turn' : 'turns'}`;
                      const startedAgo =
                        shape === 'spinner' ? ago(thread.runningSince) : null;
                      const detail = [
                        srLabel,
                        ...(startedAgo
                          ? [`started ${startedAgo}`]
                          : [ago(thread.lastActivityAt), turns]),
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      const isOpenable = thread.chatThreadId !== '_';
                      const isActive = activeThreadKey === key;
                      return (
                        <SidebarMenuItem
                          key={key}
                          data-slot="agent-layout-thread"
                          data-thread-status={thread.status}
                        >
                          <SidebarMenuButton
                            isActive={isActive}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={
                              isOpenable
                                ? () => onSelectThread(thread)
                                : undefined
                            }
                            disabled={!isOpenable}
                            title={
                              isOpenable
                                ? `${rowTitle} — ${detail}`
                                : `${rowTitle} — ${detail} · can't be opened here`
                            }
                          >
                            <AgentThreadStatusMark status={thread.status} />
                            <span>{rowTitle}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              data-sidebar="menu-action"
                              aria-label={`Actions for ${rowTitle}`}
                              className={cn(
                                'absolute end-1 top-1 flex size-7 items-center justify-center rounded-full p-1.5 text-sidebar-foreground outline-hidden transition-opacity',
                                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                                'md:opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100',
                                '[&>svg]:size-4 [&>svg]:shrink-0',
                              )}
                            >
                              <MoreHorizontalIcon />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => onRenameThread(thread)}
                              >
                                <PenLineIcon />
                                Rename
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
          {hasMore && (
            <SidebarGroup>
              <SidebarGroupContent>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => void loadMore()}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </>
      )}
    </div>
  );
}

// @blocks-registry agent-layout@1.3.1 — registry version, never edit this line