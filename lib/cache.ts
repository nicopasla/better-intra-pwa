import { getSession } from "../api.ts";

const PREFIX = "ft_pwa_cache_";

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function readScopedCache<T extends { login: string }>(
  key: string,
): T | null {
  const session = getSession();
  if (!session) return null;
  const cached = readCache<T>(key);
  return cached && cached.login === session.login ? cached : null;
}

export function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}
