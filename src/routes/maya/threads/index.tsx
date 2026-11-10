import { Navigate } from 'react-router';

/** A thread URL without a thread is a new chat. */
export default function MayaThreadsIndex() {
  return <Navigate to="/maya/new" replace />;
}