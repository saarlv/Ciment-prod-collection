import { Link, useLocation } from 'react-router';
import { SafeRedirect } from '@/components/SafeRedirect';
import { Button } from '@/components/ui/button';

/** Pre-iteration-5 URLs: every collections page lived at the root. They keep working by moving under /collections. */
const LEGACY_PREFIXES = [
  '/receipts',
  '/aging',
  '/promises',
  '/customers',
  '/invoices',
  '/approvals',
  '/settings',
  '/disputes',
  '/inbox',
];

function NotFoundPage() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-[13px] p-[21px] text-center">
      <h1 className="text-[34px] font-bold">הדף לא נמצא</h1>
      <p className="text-muted-foreground">הדף שחיפשתם לא קיים או שהועבר.</p>
      <Button render={<Link to="/collections" />}>למרחב הגבייה</Button>
    </main>
  );
}

/** The legacy address in a loop: say where the page lives now instead of redirecting again. */
function MovedPage({ to }: { to: string }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-[13px] p-[21px] text-center">
      <h1 className="text-[34px] font-bold">הדף עבר למרחב הגבייה</h1>
      <p className="text-muted-foreground">ייתכן שהלשונית פתוחה על גרסה קודמת של האפליקציה. רעננו את הדף או פתחו את הכתובת החדשה.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button render={<a href={to} />}>פתיחת הדף</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          רענון הלשונית
        </Button>
      </div>
    </main>
  );
}

export default function NotFound() {
  const { pathname, search, hash } = useLocation();
  const path = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  // Only a root-level legacy address moves; anything already under /collections never reaches this
  // page (collections/not-found.tsx catches it), so the target can never be the address itself.
  if (!path.startsWith('/collections') && LEGACY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    const to = `/collections${path}${search}${hash}`;
    return <SafeRedirect to={to} fallback={<MovedPage to={to} />} />;
  }
  return <NotFoundPage />;
}