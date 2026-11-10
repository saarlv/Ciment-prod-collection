import { useSearchParams } from 'react-router';
import { RouteMoved } from '@/components/RouteMoved';

/** /collections/approvals moved into פניות → דואר יוצא; batch / draft / component / status carry over. */
export default function ApprovalsMoved() {
  const [params] = useSearchParams();
  const next = new URLSearchParams({ tab: 'outbox' });
  for (const key of ['batch', 'draft', 'component', 'status']) {
    const v = params.get(key);
    if (v) next.set(key, v);
  }
  return <RouteMoved to={`/collections/inbox?${next.toString()}`} title="מסך האישורים" />;
}