import { Navigate, useSearchParams } from 'react-router';

/** The old /collections/invoices screen was removed (plan 04.11 r2): its address opens the aging report, keeping ?customer=. */
export default function InvoicesRedirect() {
  const [params] = useSearchParams();
  const customer = params.get('customer');
  return <Navigate to={customer ? `/collections/aging?customer=${encodeURIComponent(customer)}` : '/collections/aging'} replace />;
}