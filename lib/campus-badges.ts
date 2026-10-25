/** Campus badge links (Tutor, PHOENIX, PEGASUS, SLOTS) from the shared data. */
import { refresh } from "../refresh.ts";

const SOURCE = "https://api.betterintra.com/gh/campuses/belgium.json";
const CACHE_KEY = "ft_campus_badges";
const TTL = 24 * 60 * 60 * 1000;

export interface CampusBadges {
  badgeBaseUrl: string;
  badges: Record<string, string>;
}

let config: CampusBadges | null = null;
let started = false;
let loading = false;

function readCache(): CampusBadges | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!raw || typeof raw.at !== "number" || Date.now() - raw.at > TTL)
      return null;
    const c = raw.config as CampusBadges | undefined;
    return c && typeof c.badgeBaseUrl === "string" && c.badges ? c : null;
  } catch {
    return null;
  }
}

function writeCache(next: CampusBadges): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), config: next }),
    );
  } catch {
    /* quota / private mode */
  }
}

async function fetchBadges(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) return;
    const data = (await res.json()) as {
      badgeBaseUrl?: unknown;
      badges?: unknown;
    };
    if (
      typeof data?.badgeBaseUrl !== "string" ||
      !data.badges ||
      typeof data.badges !== "object"
    )
      return;
    config = {
      badgeBaseUrl: data.badgeBaseUrl,
      badges: data.badges as Record<string, string>,
    };
    writeCache(config);
    refresh();
  } catch {
    /* offline: keep the cached config */
  } finally {
    loading = false;
  }
}

/** Hydrates from the cache synchronously, then refreshes from the campus file. */
export function initCampusBadges(): void {
  if (started) return;
  started = true;
  config = readCache();
  void fetchBadges();
}

/** URL of the campus app a role badge opens, if the campus defines one. */
export function badgeUrlFor(name: string): string | null {
  if (!config) return null;
  const upper = name.trim().toUpperCase();
  if (!upper) return null;
  const key = Object.keys(config.badges).find((k) =>
    upper.endsWith(k.toUpperCase()),
  );
  const slug = key ? config.badges[key] : undefined;
  if (!slug) return null;
  return config.badgeBaseUrl.replace("{name}", slug);
}
