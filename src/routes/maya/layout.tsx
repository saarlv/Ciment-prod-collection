import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAgentChat } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { InboxIcon, LandmarkIcon } from 'lucide-react';
import { MayaChatAgentChat } from '@/product-types';
import { useInboxAgent } from '@/hooks/useInboxAgent';
import { AgentLayoutRoot } from '@/components/ui/agent-layout';
import {
  agentLayoutPersonaAvatarVariants,
  agentLayoutPersonaButtonVariants,
  agentLayoutTopRowVariants,
  newChatHref,
  normalizePathname,
  useAgentLayout,
} from '@/components/ui/agent-layout-context';
import {
  AgentLayoutConversations,
  AgentLayoutNav,
  AgentLayoutNavLink,
  AgentLayoutNewChat,
  AgentLayoutSidebar,
  AgentLayoutThreadFilter,
  AgentLayoutUserMenu,
} from '@/components/ui/agent-layout-sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { todayISO } from '@/utils/Format';

/**
 * The persona row, as the stock AgentLayoutPersona renders it, but with the Hebrew display name
 * (the persona title is the catalog's "Maya"; the Hebrew UI shows "מאיה").
 */
function MayaPersona() {
  const { basePath, setSidebarOpen, size } = useAgentLayout();
  const { name, jobTitle, photo } = useInboxAgent();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isOnHome = normalizePathname(pathname) === normalizePathname(newChatHref(basePath));
  return (
    <SidebarHeader data-slot="agent-layout-persona" data-size={size} className={cn(agentLayoutTopRowVariants({ size }), 'flex-row items-center px-2 py-0')}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className={agentLayoutPersonaButtonVariants({ size })}
            aria-label={`${name} — דף הבית`}
            title={`${name} — דף הבית`}
            onClick={() => {
              navigate(basePath, { replace: isOnHome });
              setSidebarOpen(false);
            }}
          >
            <Avatar className={agentLayoutPersonaAvatarVariants({ size })}>
              {photo && <AvatarImage src={photo} alt="" className="object-cover object-top" />}
              <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{jobTitle}</span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}

/** /maya — Maya's agent mini-app for the whole bookkeeping team: her conversations and the emails she handled. */
export default function MayaLayout() {
  const agentChat = useAgentChat(MayaChatAgentChat);
  const navigate = useNavigate();
  return (
    <AgentLayoutRoot
      agentChat={agentChat}
      chatContext={{ app: 'maya', today: todayISO(), timeZone: 'Asia/Jerusalem' }}
      sidebar={
        <AgentLayoutSidebar>
          <MayaPersona />
          <AgentLayoutNav>
            <AgentLayoutNavLink to="/maya/inbox" icon={InboxIcon}>
              פניות
            </AgentLayoutNavLink>
            <AgentLayoutNewChat>שיחה חדשה</AgentLayoutNewChat>
          </AgentLayoutNav>
          <AgentLayoutConversations action={<AgentLayoutThreadFilter />} />
          <AgentLayoutUserMenu>
            <DropdownMenuItem onClick={() => navigate('/collections')}>
              <LandmarkIcon />
              מרחב הגבייה
            </DropdownMenuItem>
          </AgentLayoutUserMenu>
        </AgentLayoutSidebar>
      }
    >
      <Outlet />
    </AgentLayoutRoot>
  );
}