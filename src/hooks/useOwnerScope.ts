import { useContext } from 'react';
import { OwnerScopeContext } from '@/utils/OwnerScope';
import type { OwnerScopeValue } from '@/utils/OwnerScope';

/** The global "שלי / של כולם" scope from the top bar. */
export function useOwnerScope(): OwnerScopeValue {
  const value = useContext(OwnerScopeContext);
  if (!value) throw new Error('useOwnerScope must be used inside OwnerScopeProvider');
  return value;
}