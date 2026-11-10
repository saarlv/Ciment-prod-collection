import { Navigate, useParams } from 'react-router';
import { AgentConversation } from '@/components/ui/agent-layout';

export default function NinaThread() {
  const { threadId } = useParams();
  if (!threadId) return <Navigate to="/nina/new" replace />;
  return <AgentConversation threadId={threadId} />;
}