import { Link } from 'react-router';
import { PageHeader } from '@/components/PageStates';
import { SafeRedirect } from '@/components/SafeRedirect';

/** An old address whose screen moved: redirects (loop-safe) and, if blocked, says where the screen lives now. */
export function RouteMoved({ to, title }: { to: string; title: string }) {
  return (
    <SafeRedirect
      to={to}
      fallback={
        <PageHeader
          title={`${title} עבר לפניות`}
          description="המסך הזה אוחד לתוך פניות."
          actions={
            <Link to={to} className="text-sm font-semibold text-link hover:underline">
              פתיחה בפניות
            </Link>
          }
        />
      }
    />
  );
}