import type { UpcomingEval } from "../data.ts";

const CACHE_KEY = "ft_pwa_evals";
const DONE_KEY = "ft_pwa_evals_done";
/** Same window the worker returns for the "Past" section. */
const HISTORY_DAYS = 30;
const HISTORY_MS = HISTORY_DAYS * 86_400_000;

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Evals the user dismissed. Dismissing only removes an eval from the active
 * list: it stays in the cache (and therefore in the "Past" history).
 */
export function getDoneEvals(): number[] {
  return read<number[]>(DONE_KEY, []);
}

/**
 * Merge freshly-fetched evals (upcoming plus the worker's 30-day history) into
 * the persisted cache. Dismissed evals are kept so the history stays complete;
 * entries older than the history window are dropped.
 */
export function mergeEvals(fresh: UpcomingEval[]): UpcomingEval[] {
  const byId = new Map<number, UpcomingEval>();
  for (const e of [...read<UpcomingEval[]>(CACHE_KEY, []), ...fresh]) {
    if (e && Number.isFinite(e.id)) byId.set(e.id, e);
  }
  const cutoff = Date.now() - HISTORY_MS;
  const merged = [...byId.values()]
    .filter((e) => new Date(e.beginAt).getTime() >= cutoff)
    .sort(
      (a, b) => new Date(a.beginAt).getTime() - new Date(b.beginAt).getTime(),
    );
  write(CACHE_KEY, merged);

  // Dismissals whose eval has aged out of the window are pointless.
  const done = getDoneEvals();
  const live = new Set(merged.map((e) => e.id));
  const kept = done.filter((id) => live.has(id));
  if (kept.length !== done.length) write(DONE_KEY, kept);

  return merged;
}

/** Marks an eval as handled: it leaves the active list, but stays in the history. */
export function markEvalDone(id: number): void {
  const done = getDoneEvals();
  if (done.includes(id)) return;
  write(DONE_KEY, [...done, id]);
}
