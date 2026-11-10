import { Navigate } from 'react-router';

/** A thread URL without a thread is a new chat. */
export default function NinaThreadsIndex() {
  return <Navigate to="/nina/new" replace />;
}