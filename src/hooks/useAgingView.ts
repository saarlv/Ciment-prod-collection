import { useEffect, useState } from 'react';
import { DEFAULT_VIEW, parseView } from '@/utils/AgingPanel';
import type { AgingView } from '@/utils/AgingPanel';

export const AGING_VIEW_STORAGE_KEY = 'ciment.aging.view.v1';

function readView(): AgingView {
  try {
    return parseView(JSON.parse(window.localStorage.getItem(AGING_VIEW_STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_VIEW;
  }
}

/** The aging table's view controls (customers, month focus, columns, filters, sort, zoom), kept in this browser. */
export function useAgingView() {
  const [view, setView] = useState<AgingView>(readView);

  useEffect(() => {
    try {
      window.localStorage.setItem(AGING_VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // Storage unavailable (private mode): the view simply isn't remembered.
    }
  }, [view]);

  return {
    view,
    update: (patch: Partial<AgingView>) => setView((v) => ({ ...v, ...patch })),
    /** Back to all rows; the zoom settings are kept. */
    reset: () => setView((v) => ({ ...DEFAULT_VIEW, zoom: v.zoom, fullZoom: v.fullZoom })),
  };
}