/**
 * Guards client-side redirects against ping-pong loops. A tab still running an older build (or an
 * older platform shell that maps URLs back) can bounce the app between a legacy address and its new
 * one forever, which freezes the browser. Every redirect is recorded in sessionStorage; once the same
 * target was redirected to MAX_HOPS times within WINDOW_MS, the redirect stops and the page shows a
 * plain link instead.
 */

const STORAGE_KEY = 'ciment.redirects.v1';
const WINDOW_MS = 10_000;
const MAX_HOPS = 3;

interface Hop {
  to: string;
  at: number;
}

function readHops(now: number): Hop[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is Hop =>
        !!h && typeof h === 'object' && typeof (h as Hop).to === 'string' && typeof (h as Hop).at === 'number' && now - (h as Hop).at < WINDOW_MS,
    );
  } catch {
    return [];
  }
}

/** Path + search of a URL, without a trailing slash, for comparing "where am I" with "where to". */
export function normalizeTarget(url: string): string {
  const [pathAndSearch] = url.split('#');
  const [path, search = ''] = pathAndSearch.split('?');
  const clean = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  return search ? `${clean}?${search}` : clean;
}

/** True when redirecting to `to` would repeat a loop (or point at the current address). */
export function isRedirectLoop(to: string, current: string): boolean {
  const target = normalizeTarget(to);
  if (target === normalizeTarget(current)) return true;
  const hops = readHops(Date.now()).filter((h) => h.to === target);
  return hops.length >= MAX_HOPS;
}

export function recordRedirect(to: string) {
  const now = Date.now();
  try {
    const hops = readHops(now);
    hops.push({ to: normalizeTarget(to), at: now });
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(hops.slice(-20)));
  } catch {
    // sessionStorage unavailable: the redirect still happens, only the loop guard is off.
  }
}