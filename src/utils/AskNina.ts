import { createContext } from 'react';

/**
 * What the current screen is about — sent to the "שאל את…" agent as chat context, never inside the
 * message: a customer, and on the receipts screen the bank file and the record on screen.
 */
export interface NinaFocus {
  customerCode?: string | null;
  customerName?: string | null;
  importBatchId?: string | null;
  bankLineId?: string | null;
}

export interface AskNinaValue {
  focus: NinaFocus | null;
  setFocus: (focus: NinaFocus | null) => void;
}

export const AskNinaContext = createContext<AskNinaValue | null>(null);

/** Hebrew screen names by route, for the chat context and the sheet's context line. */
const SCREENS: { prefix: string; name: string; exact?: boolean }[] = [
  { prefix: '/collections', name: 'היום', exact: true },
  { prefix: '/collections/receipts', name: 'תקבולים' },
  { prefix: '/collections/inbox', name: 'פניות' },
  { prefix: '/collections/aging', name: 'דוח גיול' },
  { prefix: '/collections/customers/', name: 'כרטיס לקוח' },
  { prefix: '/collections/customers', name: 'לקוחות', exact: true },
  { prefix: '/collections/settings/imports', name: 'ייבוא קבצים' },
  { prefix: '/collections/settings', name: 'הגדרות' },
  { prefix: '/collections/disputes', name: 'מקרה מסמכים או מחיר' },
  { prefix: '/collections/briefings', name: 'תדריכי הבוקר' },
];

export function screenNameOf(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  const hit = SCREENS.find((s) => (s.exact ? path === s.prefix : path === s.prefix || path.startsWith(s.prefix.endsWith('/') ? s.prefix : `${s.prefix}/`)));
  return hit?.name ?? 'מרחב הגבייה';
}

/** The receipts screen is Nina's: the only screen with "שאל את…" in the top bar. */
export function isReceiptsPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  return path === '/collections/receipts' || path.startsWith('/collections/receipts/');
}