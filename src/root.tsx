import { useEffect } from 'react';
import { Outlet } from 'react-router';
import {
  CollectionsAgentAgent,
  CollectionsInboxAgentAgent,
  MayaChatAgentChat,
  NinaChatAgentChat,
} from '@/product-types';
import { DirectionProvider } from '@/components/ui/direction';
import { FloatingAgentChatProvider } from '@/components/ui/floating-agent-chat';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

/** One entry per agent mini-app: the floating prompt and the agent sidebars' picks use it. */
const FLOATING_AGENTS = [
  { agent: CollectionsAgentAgent, agentChat: NinaChatAgentChat, entryRoute: '/nina' },
  { agent: CollectionsInboxAgentAgent, agentChat: MayaChatAgentChat, entryRoute: '/maya' },
];

/**
 * App root shared by every mini-app: Hebrew RTL, tooltips, the floating agent chat and toasts.
 * Each mini-app brings its own shell (routes/collections/layout.tsx, routes/nina/layout.tsx, routes/maya/layout.tsx).
 */
export default function Root() {
  useEffect(() => {
    document.documentElement.lang = 'he';
  }, []);

  return (
    <DirectionProvider direction="rtl">
      <TooltipProvider>
        <FloatingAgentChatProvider agents={FLOATING_AGENTS}>
          <Outlet />
        </FloatingAgentChatProvider>
        <Toaster />
      </TooltipProvider>
    </DirectionProvider>
  );
}