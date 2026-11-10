import { Link, useLocation, useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';

export type InboxTab = 'inbox' | 'outbox' | 'automations';

export const INBOX_TABS: { key: InboxTab; label: string }[] = [
  { key: 'inbox', label: 'דואר נכנס' },
  { key: 'outbox', label: 'דואר יוצא' },
  { key: 'automations', label: 'אוטומציות' },
];

export function isInboxTab(v: string | null): v is InboxTab {
  return INBOX_TABS.some((t) => t.key === v);
}

/** The glass segmented control of the פניות page: דואר נכנס / דואר יוצא / אוטומציות (?tab=). */
export function InboxTabs({ counts }: { counts?: Partial<Record<InboxTab, number>> }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onPage = pathname.replace(/\/+$/, '') === '/collections/inbox';
  const raw = params.get('tab');
  const current: InboxTab | null = onPage ? (isInboxTab(raw) ? raw : 'inbox') : null;
  return (
    <nav aria-label="פניות" className="flex flex-wrap gap-0.5 self-start rounded-[22px] bg-glass-soft p-1">
      {INBOX_TABS.map((t) => {
        const active = current === t.key;
        const n = counts?.[t.key];
        return (
          <Link
            key={t.key}
            to={t.key === 'inbox' ? '/collections/inbox' : `/collections/inbox?tab=${t.key}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-[34px] items-center gap-1.5 rounded-[17px] px-4 text-sm text-ink-2 hover:bg-glass-inner',
              active && 'bg-glass-strong font-semibold text-link shadow-glass-pill hover:bg-glass-strong',
            )}
          >
            {t.label}
            {n ? <span className="rounded-full bg-glass-inner px-1.5 text-xs font-semibold tabular-nums">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}