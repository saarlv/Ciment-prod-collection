import { Outlet, useNavigate } from 'react-router';
import { useAgentChat } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { LandmarkIcon, ReceiptTextIcon } from 'lucide-react';
import { NinaChatAgentChat } from '@/product-types';
import { AgentPersonaRow } from '@/components/AgentPersonaRow';
import { useCollectionsAgent } from '@/hooks/useCollectionsAgent';
import { AgentLayoutRoot } from '@/components/ui/agent-layout';
import {
  AgentLayoutConversations,
  AgentLayoutNav,
  AgentLayoutNewChat,
  AgentLayoutSidebar,
  AgentLayoutThreadFilter,
  AgentLayoutUserMenu,
} from '@/components/ui/agent-layout-sidebar';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { todayISO } from '@/utils/Format';

/** /nina — Nina's agent mini-app for the whole bookkeeping team: her conversations about receipts. */
export default function NinaLayout() {
  const agentChat = useAgentChat(NinaChatAgentChat);
  const nina = useCollectionsAgent();
  const navigate = useNavigate();
  return (
    <AgentLayoutRoot
      agentChat={agentChat}
      chatContext={{ app: 'nina', today: todayISO(), timeZone: 'Asia/Jerusalem' }}
      sidebar={
        <AgentLayoutSidebar>
          <AgentPersonaRow name={nina.name} jobTitle={nina.jobTitle} photo={nina.photo} />
          <AgentLayoutNav>
            <AgentLayoutNewChat>שיחה חדשה</AgentLayoutNewChat>
          </AgentLayoutNav>
          <AgentLayoutConversations action={<AgentLayoutThreadFilter />} />
          <AgentLayoutUserMenu>
            <DropdownMenuItem onClick={() => navigate('/collections/receipts')}>
              <ReceiptTextIcon />
              מסך התקבולים
            </DropdownMenuItem>
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