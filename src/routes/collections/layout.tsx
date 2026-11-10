import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { logOut, useEntityGetAll, useThemeMode, useUser } from '@blocksdiy/blocks-client-sdk/reactSdk';
import {
  CalendarRangeIcon,
  ChevronsUpDownIcon,
  ClipboardCheckIcon,
  InboxIcon,
  LandmarkIcon,
  ListTodoIcon,
  LogOutIcon,
  MoonIcon,
  PaletteIcon,
  SearchIcon,
  Settings2Icon,
  SunIcon,
  SunriseIcon,
  UsersIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { InboundEmailsEntity, OpenTasksEntity } from '@/product-types';
import { AskNinaProvider } from '@/components/AskNinaProvider';
import { AskAgentSheet } from '@/components/AskAgentSheet';
import { CimentLogo } from '@/components/CimentLogo';
import { DiamondBand } from '@/components/DiamondBand';
import { OwnerScopeProvider } from '@/components/OwnerScopeProvider';
import { useOpenProposals } from '@/hooks/useOpenProposals';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { HANDLED, handlingOf } from '@/utils/Inbox';
import type { InboundEmail } from '@/utils/Inbox';
import { capitalizeName, formatHebrewCalendarToday, formatShortHebrewToday } from '@/utils/Format';
import { BUILD_PAGE_PATHS, SHOW_BUILD_PAGES } from '@/utils/buildPages';

const BASE = '/collections';

/** The OpenTasks view also returns its group-by columns, which the generated type leaves out. */
type OpenTasksRow = (typeof OpenTasksEntity)['instanceType'] & { assignedBookkeeperName?: string | null };

/** Build-stage pages, shown next to הגדרות only while SHOW_BUILD_PAGES is on (hidden in production). */
const BUILD_NAV: NavItem[] = SHOW_BUILD_PAGES
  ? [
      { to: BUILD_PAGE_PATHS.gaps, label: 'פערים', icon: ListTodoIcon },
      { to: BUILD_PAGE_PATHS.design, label: 'Design', icon: PaletteIcon },
    ]
  : [];

type NavItem = { label: string; icon: LucideIcon; to?: string; end?: boolean; badge?: 'receipts' | 'inbox' | 'tasks' };

/** Plan order. Items without `to` are built in later iterations: shown disabled with "בקרוב", never linked. */
const WORK_NAV: NavItem[] = [
  { to: BASE, label: 'היום', icon: SunriseIcon, end: true },
  { to: `${BASE}/tasks`, label: 'משימות', icon: ClipboardCheckIcon, badge: 'tasks' },
  { to: `${BASE}/receipts`, label: 'תקבולים', icon: LandmarkIcon, badge: 'receipts' },
  { to: `${BASE}/inbox`, label: 'פניות', icon: InboxIcon, badge: 'inbox' },
  { to: `${BASE}/aging`, label: 'דוח גיול', icon: CalendarRangeIcon },
  { to: `${BASE}/customers`, label: 'לקוחות', icon: UsersIcon },
];

/** 44px rows, 14px radius; the active row is a white glass pill with accent text — never a solid blue fill. */
const NAV_BUTTON =
  'h-11 gap-[13px] rounded-[14px] px-[13px] text-sm text-ink-2 hover:bg-glass-inner hover:text-foreground data-active:bg-sidebar-accent data-active:font-bold data-active:text-sidebar-accent-foreground data-active:shadow-glass-pill data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-accent-foreground has-[>svg:first-child]:ps-[13px] [&_svg]:size-[18px]';

function isActivePath(pathname: string, to: string, end?: boolean) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return end ? path === to : path === to || path.startsWith(`${to}/`);
}

function displayName(user: ReturnType<typeof useUser>) {
  const full = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full ? capitalizeName(full) : user.email || 'משתמש';
}

/**
 * The blue Ciment block, one row like the product packaging: the wordmark standing on its side at the
 * outer edge (reads bottom-to-top), a thin divider, then the Gregorian date, the greeting and the space name.
 */
function BrandCard() {
  const user = useUser();
  const first = capitalizeName(user.firstName || user.name?.split(' ')[0]);
  return (
    <Link
      to={BASE}
      className="brand-card -mx-[5px] -mt-2 flex items-center gap-[13px] p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      <CimentLogo orientation="vertical" className="block h-[96px] w-auto shrink-0" />
      <Separator orientation="vertical" className="self-stretch bg-current/35" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs leading-tight font-medium text-current/85 tabular-nums">{formatShortHebrewToday()}</span>
        <span className="text-xl leading-tight font-extrabold break-words">{first ? `שלום, ${first}` : 'שלום'}</span>
        <span className="text-xs leading-tight text-current/85">מרחב הגבייה של סימנט</span>
      </div>
    </Link>
  );
}

function UserMenu() {
  const user = useUser();
  const name = displayName(user);
  const { themeMode, setThemeMode } = useThemeMode();
  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className="h-auto gap-[13px] rounded-2xl bg-glass-soft px-[13px] py-2 hover:bg-glass-inner data-open:bg-glass-inner"
          />
        }
      >
        <Avatar className="size-[34px]">
          {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={name} />}
          <AvatarFallback className="bg-glass-strong text-[13px] font-bold text-ink-2">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col text-start leading-tight">
          <span className="truncate text-[13px] font-semibold">{name}</span>
          {user.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
        </div>
        <ChevronsUpDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="glass-menu min-w-56 rounded-[18px] p-1.5 ring-0">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setThemeMode(isDark ? 'light' : 'dark')} className="rounded-[12px]">
            {isDark ? <SunIcon /> : <MoonIcon />}
            {isDark ? 'מצב בהיר' : 'מצב כהה'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => logOut()} className="rounded-[12px]">
            <LogOutIcon />
            התנתקות
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CountPill({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-glass-strong px-[7px] text-xs font-bold text-ink-2 tabular-nums">
      {n}
    </span>
  );
}

function AppSidebar({ pathname }: { pathname: string }) {
  const proposals = useOpenProposals();
  const scope = useOwnerScope();
  // Same read as the inbox tab (shared cache): the פניות badge counts open inbound mails — לא טופל + ממתין — in the current scope.
  const mails = useEntityGetAll(InboundEmailsEntity, { orderBy: [{ column: 'receivedAt', direction: 'desc' }], page: { size: 200 } });
  const openMails = ((mails.data ?? []) as InboundEmail[]).filter(
    (e) => handlingOf(e) !== HANDLED && scope.isVisible(e.customerCode, e.assignedBookkeeperName),
  ).length;
  // Open tasks (ממתין + בטיפול) from the OpenTasks view, grouped by bookkeeper, so the badge follows the scope.
  const openTasks = useEntityGetAll(OpenTasksEntity);
  const taskCount = ((openTasks.data ?? []) as OpenTasksRow[])
    .filter((r) => scope.isVisible(null, r.assignedBookkeeperName))
    .reduce((s, r) => s + (r.openCount ?? 0), 0);
  const counts = { receipts: proposals.data?.length ?? 0, inbox: openMails, tasks: taskCount };

  return (
    <Sidebar side="right" variant="floating" className="p-[13px] [&_[data-slot=sidebar-inner]]:glass">
      <SidebarHeader className="p-[13px] pt-[21px]">
        <BrandCard />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-[13px] py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {WORK_NAV.map((item) =>
                !item.to ? (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      disabled
                      aria-disabled
                      tooltip={`${item.label} · בקרוב`}
                      className={cn(NAV_BUTTON, 'cursor-not-allowed text-muted-foreground opacity-75 hover:bg-transparent hover:text-muted-foreground')}
                    >
                      <item.icon />
                      <span className="flex-1">{item.label}</span>
                      <span className="rounded-full bg-glass-inner px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">בקרוב</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={isActivePath(pathname, item.to, item.end)}
                      tooltip={item.label}
                      className={NAV_BUTTON}
                      render={<Link to={item.to} />}
                    >
                      <item.icon />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && <CountPill n={counts[item.badge]} />}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 p-[13px] pb-[21px]">
        <SidebarMenu className="gap-0.5">
          {BUILD_NAV.map((item) =>
            item.to ? (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={isActivePath(pathname, item.to)}
                  tooltip={`${item.label} · שלב בנייה`}
                  className={NAV_BUTTON}
                  render={<Link to={item.to} />}
                >
                  <item.icon />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded-full border border-dashed border-ink-2/25 px-1.5 py-px text-[10px] font-semibold text-muted-foreground">שלב בנייה</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null,
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActivePath(pathname, `${BASE}/settings`)}
              tooltip="הגדרות"
              className={NAV_BUTTON}
              render={<Link to={`${BASE}/settings`} />}
            >
              <Settings2Icon />
              <span className="flex-1">הגדרות</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="mt-1.5">
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/** "שלי / של כולם" — filters every screen by the customer owner rule; without a TeamMembers match the user picks whom to view as. */
function ScopeToggle() {
  const scope = useOwnerScope();
  const viewAsItems = [
    { label: 'בחירת אחראית', value: null as string | null },
    ...scope.bookkeepers.map((b) => ({ label: b, value: b as string | null })),
  ];
  const needsPick = scope.mode === 'mine' && !scope.myName;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ToggleGroup
        aria-label="סינון לפי אחראית"
        value={[scope.mode]}
        onValueChange={(v) => {
          const next = v[0];
          if (next === 'mine' || next === 'all') scope.setMode(next);
        }}
        className="h-10 gap-0.5 rounded-[20px] bg-glass-card p-1"
      >
        <ToggleGroupItem value="mine" className="h-8 rounded-[16px] px-3.5 text-[13px] font-semibold aria-pressed:bg-glass-strong aria-pressed:text-link aria-pressed:shadow-glass-pill">
          שלי
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="h-8 rounded-[16px] px-3.5 text-[13px] font-semibold aria-pressed:bg-glass-strong aria-pressed:text-link aria-pressed:shadow-glass-pill">
          של כולם
        </ToggleGroupItem>
      </ToggleGroup>
      {scope.matchedMemberName ? (
        scope.mode === 'mine' && <span className="px-1 text-xs text-muted-foreground">{scope.matchedMemberName}</span>
      ) : (
        scope.mode === 'mine' && (
          <div className="flex items-center gap-1.5">
            <label htmlFor="view-as" className="text-xs font-semibold text-muted-foreground">
              צפייה בתור
            </label>
            <Select items={viewAsItems} value={scope.myName} onValueChange={(v) => scope.setViewAs((v as string | null) ?? null)}>
              <SelectTrigger id="view-as" className={cn('h-10 min-w-40 rounded-[20px] bg-glass-card text-[13px]', needsPick && 'ring-2 ring-ring')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {viewAsItems.map((i) => (
                    <SelectItem key={i.value ?? 'none'} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )
      )}
    </div>
  );
}

/** Floating glass "island" above the page: today's Hebrew-calendar date, customer search, the mine/all scope and "שאל את…" (Nina, on the receipts screen only). */
function TopIsland() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `${BASE}/customers?q=${encodeURIComponent(q)}` : `${BASE}/customers`);
  }

  return (
    <div className="glass sticky top-[13px] z-20 flex max-w-full flex-wrap items-center justify-center gap-2 self-center rounded-[28px] border p-1.5">
      <SidebarTrigger className="size-10 rounded-full md:hidden" />
      <span className="inline-flex h-10 items-center px-3.5 text-[13px] font-semibold text-ink-2">{formatHebrewCalendarToday()}</span>
      <form role="search" onSubmit={onSearch} className="relative flex items-center">
        <label htmlFor="island-search" className="sr-only">
          חיפוש לקוח
        </label>
        <SearchIcon className="pointer-events-none absolute start-3.5 size-4 text-muted-foreground" />
        <Input
          id="island-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לקוח לפי שם או קוד"
          className="h-10 w-[280px] max-w-[60vw] rounded-[20px] border-input bg-glass-card ps-10 pe-4 text-[13px]"
        />
      </form>
      <ScopeToggle />
      <AskAgentSheet />
    </div>
  );
}

/**
 * The collections mini-app's shell: floating glass sidebar on the right, the top island, page content.
 * The diamond band is a fixed layer across the full viewport width, at the top, behind both the sidebar
 * and the content: the sidebar (fixed, z-10) and the content (z-[1]) stack above it, and the wrappers
 * between them are transparent, so the sidebar glass and every glass panel blur it. It never scrolls.
 */
export default function CollectionsLayout() {
  const { pathname } = useLocation();
  return (
    <OwnerScopeProvider>
      <AskNinaProvider>
        <SidebarProvider>
          <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0">
            <DiamondBand />
          </div>
          <AppSidebar pathname={pathname} />
          <SidebarInset className="bg-transparent">
            <div className="relative z-[1] mx-auto flex w-full max-w-[1240px] flex-col gap-[21px] px-[13px] pt-[13px] pb-[34px] md:px-[21px] lg:px-[34px]">
              <TopIsland />
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AskNinaProvider>
    </OwnerScopeProvider>
  );
}