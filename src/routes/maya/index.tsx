import { Navigate } from 'react-router';

/** /maya opens on a new chat with Maya. */
export default function MayaIndex() {
  return <Navigate to="/maya/new" replace />;
}