import { useSearchParams } from 'react-router';
import { RouteMoved } from '@/components/RouteMoved';
import { casesFolderUrl } from '@/utils/Disputes';

/** /collections/disputes moved into פניות: documents → folder 3, ?tab=prices → folder 4. The case page /collections/disputes/:id stays. */
export default function DisputesMoved() {
  const [params] = useSearchParams();
  return <RouteMoved to={casesFolderUrl(params.get('tab') === 'prices' ? 'prices' : 'docs')} title="מסך המסמכים והמחירים" />;
}