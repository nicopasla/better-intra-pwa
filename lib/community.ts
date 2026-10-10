import { WORKER_URL } from "../api.ts";

export const PWA_REPO_URL = "https://github.com/nicopasla/better-intra-pwa";
export const PROFILE_URL = "https://github.com/nicopasla";

const GITHUB_API = "https://api.github.com";

let starPromise: Promise<number | null> | null = null;

/** Stargazers of the PWA repo. */
export function getRepoStars(): Promise<number | null> {
  return (starPromise ??= fetch(
    `${GITHUB_API}/repos/nicopasla/better-intra-pwa`,
  )
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.stargazers_count as number) ?? null)
    .catch(() => null));
}

let followerPromise: Promise<number | null> | null = null;

/** Followers of the maintainer's GitHub profile. */
export function getFollowerCount(): Promise<number | null> {
  return (followerPromise ??= fetch(`${GITHUB_API}/users/nicopasla`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.followers as number) ?? null)
    .catch(() => null));
}

export interface CommunityCountry {
  country: string;
  count: number;
  campuses: { name: string; count: number }[];
}

export interface CommunityStats {
  total: number;
  newToday: number;
  newLast7Days: number;
  newLast14Days: number;
  newLast30Days: number;
  countries: CommunityCountry[];
}

let statsPromise: Promise<CommunityStats | null> | null = null;

/** Public community stats (cached for the session). */
export function fetchCommunityStats(): Promise<CommunityStats | null> {
  return (statsPromise ??= fetch(`${WORKER_URL}/api/v1/public/stats`, {
    cache: "no-store",
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d as CommunityStats | null)
    .catch(() => null));
}

export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...[...upper].map((c) => 127397 + c.charCodeAt(0)),
  );
}

let countryNames: Intl.DisplayNames | null = null;
try {
  countryNames = new Intl.DisplayNames(["en"], { type: "region" });
} catch {
  countryNames = null;
}

export function countryName(code: string): string {
  if (!code || code.length !== 2) return "Unknown";
  if (!countryNames) return code;
  try {
    return countryNames.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

const MAX_CAMPUSES = 5;

/** "France · Paris (12), Lyon (4), …" for the badge's native tooltip. */
export function countryTooltip(c: CommunityCountry): string {
  const name = countryName(c.country);
  if (!c.campuses || c.campuses.length === 0) return name;
  const shown = c.campuses
    .slice(0, MAX_CAMPUSES)
    .map((cp) => `${cp.name} (${cp.count})`);
  if (c.campuses.length > MAX_CAMPUSES) shown.push("…");
  return `${name} · ${shown.join(", ")}`;
}
