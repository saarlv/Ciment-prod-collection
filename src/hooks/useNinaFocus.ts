import { useContext, useEffect } from 'react';
import { AskNinaContext } from '@/utils/AskNina';

/**
 * Tells the "שאל את…" sheet what this screen (or its selected row) is about: a customer, and on the
 * receipts screen also the bank file and the record on screen. Cleared when the screen unmounts or
 * everything becomes empty.
 */
export function useNinaFocus(
  customerCode?: string | null,
  customerName?: string | null,
  receipt?: { importBatchId?: string | null; bankLineId?: string | null },
) {
  const setFocus = useContext(AskNinaContext)?.setFocus;
  const importBatchId = receipt?.importBatchId ?? null;
  const bankLineId = receipt?.bankLineId ?? null;
  useEffect(() => {
    if (!setFocus) return;
    setFocus(
      customerCode || importBatchId || bankLineId
        ? { customerCode: customerCode ?? null, customerName: customerName ?? null, importBatchId, bankLineId }
        : null,
    );
    return () => setFocus(null);
  }, [setFocus, customerCode, customerName, importBatchId, bankLineId]);
}