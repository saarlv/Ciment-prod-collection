import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEntityGetAll, useUser } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CustomerOwnersEntity, CustomersEntity, TeamMembersEntity } from '@/product-types';
import { OwnerScopeContext, SCOPE_STORAGE_KEY, VIEW_AS_STORAGE_KEY } from '@/utils/OwnerScope';
import type { OwnerScopeValue, ScopeMode } from '@/utils/OwnerScope';
import { capitalizeName } from '@/utils/Format';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode) — the choice simply lasts for this session.
  }
}

/** The saved mode, only if it is exactly one of the two values; anything else is dropped. */
function readMode(): ScopeMode {
  const raw = readStorage(SCOPE_STORAGE_KEY);
  if (raw === 'mine' || raw === 'all') return raw;
  if (raw !== null) writeStorage(SCOPE_STORAGE_KEY, null);
  return 'all';
}

/** The saved "view as" name: a plain short name only (older builds may have left JSON or junk). */
function readViewAs(): string | null {
  const raw = readStorage(VIEW_AS_STORAGE_KEY);
  if (raw === null) return null;
  const name = raw.trim();
  if (!name || name.length > 80 || /^["[{]/.test(name) || name === 'null' || name === 'undefined') {
    writeStorage(VIEW_AS_STORAGE_KEY, null);
    return null;
  }
  return name;
}

/**
 * Holds the global "שלי / של כולם" filter. Owner rule: CustomerOwners.bookkeeperName for the
 * customer if present, else Customers.assignedBookkeeperName. "Mine" is the TeamMembers row whose
 * email is the signed-in user's; without one, the user picks whom they view as (stored locally).
 */
export function OwnerScopeProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const team = useEntityGetAll(TeamMembersEntity);
  const owners = useEntityGetAll(CustomerOwnersEntity, { orderBy: [{ column: 'id', direction: 'asc' }] });
  const customers = useEntityGetAll(CustomersEntity);

  const [mode, setModeState] = useState<ScopeMode>(() => readMode());
  const [viewAs, setViewAsState] = useState<string | null>(() => readViewAs());

  const email = user.email?.trim().toLowerCase();
  const matched = email
    ? (team.data ?? []).find((m) => m.active !== false && m.email?.trim().toLowerCase() === email)
    : undefined;
  const matchedMemberName = matched?.name?.trim() || null;

  const ownerByCode = new Map<string, string>();
  for (const c of customers.data ?? []) {
    if (c.customerCode && c.assignedBookkeeperName) ownerByCode.set(c.customerCode, c.assignedBookkeeperName);
  }
  for (const o of owners.data ?? []) {
    if (o.customerCode && o.bookkeeperName) ownerByCode.set(o.customerCode, o.bookkeeperName);
  }

  const names = new Set<string>();
  for (const c of customers.data ?? []) if (c.assignedBookkeeperName) names.add(c.assignedBookkeeperName);
  for (const o of owners.data ?? []) if (o.bookkeeperName) names.add(o.bookkeeperName);
  for (const m of team.data ?? []) if (m.name) names.add(m.name);
  const bookkeepers = [...names].sort((a, b) => a.localeCompare(b, 'he'));

  const isLoading = team.isLoading || owners.isLoading || customers.isLoading;
  // While the owner tables load, trust the locally saved "view as" so screens can start their calls at once.
  const myName = matchedMemberName ?? (viewAs && (isLoading || bookkeepers.includes(viewAs)) ? viewAs : null);

  const fullName = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ');
  const actorName = matchedMemberName ?? (fullName ? capitalizeName(fullName) : user.email || 'משתמש');

  function ownerOf(customerCode?: string | null, fallback?: string | null) {
    return (customerCode ? ownerByCode.get(customerCode) : undefined) ?? fallback ?? null;
  }

  function isVisible(customerCode?: string | null, fallback?: string | null) {
    if (mode === 'all' || !myName) return true;
    const owner = ownerOf(customerCode, fallback);
    return !owner || owner === myName;
  }

  const value: OwnerScopeValue = {
    mode,
    setMode: (next) => {
      setModeState(next);
      writeStorage(SCOPE_STORAGE_KEY, next);
    },
    myName,
    matchedMemberName,
    viewAs,
    setViewAs: (name) => {
      setViewAsState(name);
      writeStorage(VIEW_AS_STORAGE_KEY, name);
    },
    bookkeepers,
    actorName,
    isLoading,
    ownerOf,
    isVisible,
    bookkeeperFilter: mode === 'mine' && myName ? myName : undefined,
  };

  return <OwnerScopeContext.Provider value={value}>{children}</OwnerScopeContext.Provider>;
}