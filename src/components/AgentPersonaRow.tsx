import { useLocation, useNavigate } from 'react-router';
import {
  agentLayoutPersonaAvatarVariants,
  agentLayoutPersonaButtonVariants,
  agentLayoutTopRowVariants,
  newChatHref,
  normalizePathname,
  useAgentLayout,
} from '@/components/ui/agent-layout-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * The persona row of an agent mini-app's sidebar, as the stock AgentLayoutPersona renders it, but with
 * the Hebrew display name (the persona titles are the catalog's Latin "Nina" / "Maya").
 */
export function AgentPersonaRow({ name, jobTitle, photo }: { name: string; jobTitle: string; photo?: string }) {
  const { basePath, setSidebarOpen, size } = useAgentLayout();
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