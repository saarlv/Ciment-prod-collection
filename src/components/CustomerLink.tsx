import { Link } from 'react-router';
import { getRouteUrl } from '@/lib/platform';
import { cn } from '@/lib/utils';

/** Every customer name in the app links to its 360 card. */
export function CustomerLink({
  code,
  name,
  showCode = false,
  className,
}: {
  code?: string | null;
  name?: string | null;
  showCode?: boolean;
  className?: string;
}) {
  const label = name || code || '—';
  if (!code) return <span className={className}>{label}</span>;
  return (
    <Link
      to={getRouteUrl('collections/customers/:code', { code })}
      className={cn('inline-flex flex-col font-semibold text-foreground hover:text-link hover:underline', className)}
    >
      <span>{label}</span>
      {showCode && <span className="text-xs font-normal text-muted-foreground">{code}</span>}
    </Link>
  );
}