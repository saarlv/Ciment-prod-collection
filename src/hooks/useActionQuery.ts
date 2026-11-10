import { useEffect, useId, useRef, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { formatTime } from '@/utils/Format';

interface State<O> {
  key: string | null;
  version: number;
  data?: O;
  error?: Error;
}

interface CacheEntry<O> {
  v: number;
  key: string;
  savedAt: string;
  data: O;
}

export interface ActionQueryOptions {
  enabled?: boolean;
  /**
   * Opt-in stale-while-revalidate: the last result for the same input is kept in localStorage under
   * this name and shown at once while the fresh call runs in the background.
   */
  cache?: string;
  /**
   * Shape check for a cached result. A remembered value that fails it (e.g. written by an older
   * version of the app) is dropped and never rendered.
   */
  validate?: (data: unknown) => boolean;
  /**
   * Names the action for sharing inside the tab: every screen that asks the same named action for the
   * same input shares one call and one result. Defaults to `cache`.
   */
  name?: string;
}

/**
 * Bump when an action's output shape changes: every entry written under another version is ignored
 * and removed, so a tab never renders a result shaped for an older screen.
 */
const CACHE_VERSION = 6;
const ROOT = 'ciment.aq.';
const PREFIX = `${ROOT}v${CACHE_VERSION}.`;
/** Results larger than this are not cached (localStorage holds ~5 MB per origin). */
const MAX_CHARS = 1_500_000;
/** Inputs remembered per cache name (e.g. the last few customers opened). */
const MAX_ENTRIES = 8;

const memory = new Map<string, CacheEntry<unknown>>();

const entryKey = (cache: string, key: string) => `${PREFIX}${cache}:${key}`;
const indexKey = (cache: string) => `${PREFIX}${cache}#index`;

let purged = false;
/** Once per page load: remove cache entries of other versions (the pre-v2 ones had no version at all). */
function purgeOldVersions() {
  if (purged) return;
  purged = true;
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(ROOT) && !k.startsWith(PREFIX)) stale.push(k);
    }
    for (const k of stale) window.localStorage.removeItem(k);
  } catch {
    // Storage unavailable: nothing to purge.
  }
}

function dropEntry(cache: string, key: string) {
  const id = entryKey(cache, key);
  memory.delete(id);
  try {
    window.localStorage.removeItem(id);
  } catch {
    // ignore
  }
}

function isEntry(value: unknown, key: string): value is CacheEntry<unknown> {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<CacheEntry<unknown>>;
  return (
    e.v === CACHE_VERSION &&
    e.key === key &&
    typeof e.savedAt === 'string' &&
    !Number.isNaN(new Date(e.savedAt).getTime()) &&
    !!e.data &&
    typeof e.data === 'object'
  );
}

function readCache<O>(cache: string, key: string, validate?: (data: unknown) => boolean): CacheEntry<O> | null {
  purgeOldVersions();
  const id = entryKey(cache, key);
  const hit = memory.get(id);
  if (hit) return hit as CacheEntry<O>;
  try {
    const raw = window.localStorage.getItem(id);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isEntry(parsed, key) || (validate && !safeValidate(validate, parsed.data))) {
      dropEntry(cache, key);
      return null;
    }
    memory.set(id, parsed);
    return parsed as CacheEntry<O>;
  } catch {
    dropEntry(cache, key);
    return null;
  }
}

function safeValidate(validate: (data: unknown) => boolean, data: unknown) {
  try {
    return validate(data);
  } catch {
    return false;
  }
}

function readIndex(cache: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(indexKey(cache)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeCache<O>(cache: string, key: string, data: O) {
  if (!data || typeof data !== 'object') return;
  const entry: CacheEntry<O> = { v: CACHE_VERSION, key, savedAt: new Date().toISOString(), data };
  const id = entryKey(cache, key);
  memory.set(id, entry);
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > MAX_CHARS) return;
    const index = readIndex(cache).filter((k) => k !== key);
    index.unshift(key);
    for (const old of index.splice(MAX_ENTRIES)) {
      window.localStorage.removeItem(entryKey(cache, old));
      memory.delete(entryKey(cache, old));
    }
    window.localStorage.setItem(indexKey(cache), JSON.stringify(index));
    window.localStorage.setItem(id, raw);
  } catch {
    // Storage full or unavailable (private mode): the result simply isn't remembered.
  }
}

/*
 * In-tab sharing. The SDK's useExecuteAction allows at most 5 executions of one action with the same
 * input per 20 s per tab; the 6th throws a FatalAppError from the hook during render, which crashes the
 * route (and a host that remounts after a crash re-fires the call on every remount — a crash loop).
 * Screens that run an action on load (Today, the price case, aging, the customer card) therefore must
 * not call it again on every mount: a result younger than FRESH_MS is reused, a call already in flight
 * is joined, and no more than MAX_CALLS identical calls start inside the SDK's window.
 */
const FRESH_MS = 30_000;
const GUARD_WINDOW_MS = 20_000;
const MAX_CALLS = 3;
const MAX_SHARED = 60;

interface Shared {
  data?: unknown;
  at: number;
  inflight?: Promise<unknown>;
  /** Start times of the calls inside the SDK's window. */
  calls: number[];
}

const shared = new Map<string, Shared>();

function sharedOf(id: string): Shared {
  let entry = shared.get(id);
  if (!entry) {
    entry = { at: 0, calls: [] };
    shared.set(id, entry);
    if (shared.size > MAX_SHARED) {
      const oldest = shared.keys().next().value;
      if (oldest !== undefined && oldest !== id) shared.delete(oldest);
    }
  }
  return entry;
}

/**
 * Runs a read-only action (e.g. BuildAgingReport) for the given input and keeps its result.
 * A new input starts a fresh load (isLoading → skeletons); `refresh()` re-runs it while the
 * current result stays on screen (isRefreshing), e.g. right after a note or promise was saved.
 * With `cache`, the last result for that input renders instantly (isStale) while the fresh call
 * runs; a failed refresh keeps the cached result and says so in a toast. Cached values are
 * versioned and shape-checked (`validate`), so a value left by an older build is dropped.
 * Mounting again with the same input inside FRESH_MS reuses the tab's last result instead of calling
 * the action again (see "In-tab sharing" above). `run` is the action hook's executeFunction.
 */
export function useActionQuery<I, O>(run: (input: I) => Promise<O>, input: I, options: boolean | ActionQueryOptions = true) {
  const { enabled = true, cache, validate, name } = typeof options === 'boolean' ? { enabled: options } : options;
  const key = JSON.stringify(input ?? null);
  const instance = useId();
  const id = `${name ?? cache ?? instance}:${key}`;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<State<O>>({ key: null, version: 0 });
  const handledVersion = useRef(version);

  useEffect(() => {
    if (!enabled) return;
    const forced = version !== handledVersion.current;
    handledVersion.current = version;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const done = (data: unknown) => {
      if (!cancelled) setState({ key, version, data: data as O });
    };
    const fail = (error: unknown) => {
      if (cancelled) return;
      const err = error instanceof Error ? error : new Error(String(error));
      const cached = cache ? readCache<O>(cache, key, validate) : null;
      if (cached)
        toast.add({
          title: 'לא הצלחנו לרענן את הנתונים',
          description: `מוצגים הנתונים מ־${formatTime(cached.savedAt)}. נסו שוב בעוד רגע.`,
          type: 'error',
        });
      setState({ key, version, error: err });
    };

    const attempt = () => {
      if (cancelled) return;
      const entry = sharedOf(id);
      const now = Date.now();
      if (!forced && entry.data !== undefined && now - entry.at < FRESH_MS) return done(entry.data);
      if (entry.inflight) {
        entry.inflight.then(done, fail);
        return;
      }
      entry.calls = entry.calls.filter((t) => now - t < GUARD_WINDOW_MS);
      if (entry.calls.length >= MAX_CALLS) {
        // At the limit: show what the tab already has; a refresh waits until the window frees up.
        if (!forced && entry.data !== undefined) return done(entry.data);
        timer = setTimeout(attempt, GUARD_WINDOW_MS - (now - entry.calls[0]) + 50);
        return;
      }
      entry.calls.push(now);
      const call = run(JSON.parse(key) as I);
      entry.inflight = call;
      call.then(
        (data) => {
          if (entry.inflight === call) entry.inflight = undefined;
          entry.data = data;
          entry.at = Date.now();
          if (cache) writeCache(cache, key, data);
        },
        () => {
          if (entry.inflight === call) entry.inflight = undefined;
        },
      );
      call.then(done, fail);
    };

    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `run` is a stable mutateAsync and `validate` only reads; the serialized input is the dependency.
  }, [key, version, enabled]);

  const current = state.key === key ? state : null;
  const fresh = current && !current.error ? current : null;
  // Another screen's result for the same input, already in this tab: shown at once, no skeleton.
  const sharedData = !fresh && enabled ? (shared.get(id)?.data as O | undefined) : undefined;
  const cached = cache && !fresh && sharedData === undefined ? readCache<O>(cache, key, validate) : null;
  const pending = enabled && (!current || current.version !== version);
  const shown = fresh ? fresh.data : (sharedData ?? cached?.data);

  return {
    data: shown,
    error: current?.error,
    isLoading: enabled && !current && shown === undefined,
    /** Only when there is nothing to show; with a cached result the failure is a toast. */
    isError: !!current?.error && !cached && sharedData === undefined,
    /** Showing the remembered result while the fresh one loads (or after it failed). */
    isStale: !fresh && shown !== undefined,
    cachedAt: cached?.savedAt,
    isRefreshing: pending && shown !== undefined,
    refresh: () => setVersion((v) => v + 1),
  };
}