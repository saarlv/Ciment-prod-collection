import { createContext } from 'react';

export type ScopeMode = 'mine' | 'all';

export interface OwnerScopeValue {
  /** "שלי" or "של כולם". */
  mode: ScopeMode;
  setMode: (mode: ScopeMode) => void;
  /** The bookkeeper name "mine" filters by — the TeamMembers match, else the locally chosen "view as" name. */
  myName: string | null;
  /** The TeamMembers row matched by the signed-in user's email, if any. */
  matchedMemberName: string | null;
  /** Locally chosen bookkeeper when the signed-in user has no TeamMembers row. */
  viewAs: string | null;
  setViewAs: (name: string | null) => void;
  /** Every bookkeeper name known to the app (Customers ∪ CustomerOwners ∪ TeamMembers). */
  bookkeepers: string[];
  /** Name written into recordedBy / authorName / handledBy. */
  actorName: string;
  /** True while owners are still loading (filters wait for them). */
  isLoading: boolean;
  /** The owner of a customer: CustomerOwners override, else Customers.assignedBookkeeperName, else the row's own field. */
  ownerOf: (customerCode?: string | null, fallback?: string | null) => string | null;
  /** Whether a customer's rows are shown under the current scope (customers with no owner are shown to everyone). */
  isVisible: (customerCode?: string | null, fallback?: string | null) => boolean;
  /** bookkeeperName to pass to BuildAgingReport, or undefined for everyone. */
  bookkeeperFilter: string | undefined;
}

export const OwnerScopeContext = createContext<OwnerScopeValue | null>(null);

export const SCOPE_STORAGE_KEY = 'ciment.scope.mode';
export const VIEW_AS_STORAGE_KEY = 'ciment.scope.viewAs';