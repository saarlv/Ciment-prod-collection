import { Navigate, useParams } from 'react-router';
import { AgentConversation } from '@/components/ui/agent-layout';

export default function MayaThread() {
  const { threadId } = useParams();
  if (!threadId) return <Navigate to="/maya/new" replace />;
  return <AgentConversation threadId={threadId} />;
}