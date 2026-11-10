import { Link, useLocation, useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'rules', to: '/collections/settings', label: 'כללים' },
  { key: 'roles', to: '/collections/settings?tab=roles', label: 'תפקידים' },
  { key: 'imports', to: '/collections/settings/imports', label: 'ייבוא קבצים' },
] as const;

/** The glass segmented control of the settings pages: כללים / תפקידים (?tab=roles) / ייבוא קבצים. */
export function SettingsTabs() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const path = pathname.replace(/\/+$/, '');
  const current = path === '/collections/settings/imports' ? 'imports' : params.get('tab') === 'roles' ? 'roles' : 'rules';
  return (
    <nav aria-label="הגדרות" className="flex gap-0.5 rounded-[22px] bg-glass-soft p-1">
      {TABS.map((t) => {
        const active = current === t.key;
        return (
          <Link
            key={t.key}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-[34px] items-center rounded-[17px] px-4 text-sm text-ink-2 hover:bg-glass-inner',
              active && 'bg-glass-strong font-semibold text-link shadow-glass-pill hover:bg-glass-strong',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}