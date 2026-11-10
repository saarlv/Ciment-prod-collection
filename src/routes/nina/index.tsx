import { Navigate } from 'react-router';

/** /nina opens on a new chat with Nina. */
export default function NinaIndex() {
  return <Navigate to="/nina/new" replace />;
}