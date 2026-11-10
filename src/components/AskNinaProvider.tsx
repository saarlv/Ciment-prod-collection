import { useState } from 'react';
import type { ReactNode } from 'react';
import { AskNinaContext } from '@/utils/AskNina';
import type { NinaFocus } from '@/utils/AskNina';

/** Holds what the current screen is about (customer; on receipts the file and record), for the "שאל את…" chat context. */
export function AskNinaProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<NinaFocus | null>(null);
  return <AskNinaContext.Provider value={{ focus, setFocus }}>{children}</AskNinaContext.Provider>;
}