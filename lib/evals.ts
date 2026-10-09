import type { UpcomingEval } from "../data.ts";

const CACHE_KEY = "ft_pwa_evals";
const DONE_KEY = "ft_pwa_evals_done";

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

/** Evals the user has marked done (removed from the upcoming list). */
export function getDoneEvals(): number[] {
  return read<number[]>(DONE_KEY, []);
}

/**
 * Merge the freshly-fetched (future-only) evals into the persisted cache so
 * already-started evals stay visible across refetches. Done evals are dropped.
 */
export function mergeEvals(fresh: UpcomingEval[]): UpcomingEval[] {
  const done = new Set(getDoneEvals());
  const byId = new Map<number, UpcomingEval>();
  for (const e of read<UpcomingEval[]>(CACHE_KEY, [])) {
    if (!done.has(e.id)) byId.set(e.id, e);
  }
  for (const e of fresh) {
    if (!done.has(e.id)) byId.set(e.id, e);
  }
  const merged = [...byId.values()].sort(
    (a, b) => new Date(a.beginAt).getTime() - new Date(b.beginAt).getTime(),
  );
  write(CACHE_KEY, merged);
  return merged;
}

export function markEvalDone(id: number): void {
  const done = getDoneEvals();
  if (!done.includes(id)) {
    done.push(id);
    write(DONE_KEY, done);
  }
  write(
    CACHE_KEY,
    read<UpcomingEval[]>(CACHE_KEY, []).filter((e) => e.id !== id),
  );
}
