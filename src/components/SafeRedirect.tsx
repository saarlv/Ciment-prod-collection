import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isRedirectLoop, recordRedirect } from '@/utils/RedirectGuard';

/**
 * A `<Navigate replace>` that refuses to loop: it never redirects to the address it is on, and stops
 * after the same target was hit a few times in a row (see RedirectGuard). Then it renders `fallback`.
 */
export function SafeRedirect({ to, fallback }: { to: string; fallback: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [blocked] = useState(() => isRedirectLoop(to, `${pathname}${search}`));

  useEffect(() => {
    if (blocked) return;
    recordRedirect(to);
    navigate(to, { replace: true });
  }, [blocked, to, navigate]);

  return blocked ? fallback : null;
}