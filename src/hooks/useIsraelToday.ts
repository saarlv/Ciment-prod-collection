import { useEffect, useState } from 'react';
import { todayISO } from '@/utils/Format';

/**
 * Today's date in Israel (`YYYY-MM-DD`) and the current time, re-read every minute — so at midnight
 * "today" moves to the next day by itself, with nobody reloading the screen.
 */
export function useIsraelToday() {
  const [clock, setClock] = useState(() => ({ today: todayISO(), now: Date.now() }));
  useEffect(() => {
    const timer = window.setInterval(() => setClock({ today: todayISO(), now: Date.now() }), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return clock;
}