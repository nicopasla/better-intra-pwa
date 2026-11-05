import { mockMode } from "../../mock.ts";

/** Shared cluster maps, served from the repo through the worker. */
const MAP_BASE = "https://api.betterintra.com/gh/campuses/maps/belgium";

export interface ClusterMapDef {
  /** Matches the cluster name in campuses/belgium.json. */
  id: string;
  label: string;
  /** Map file URL (campuses/maps/…), loaded at runtime. */
  url: string;
  svg?: string;
  /** Seat hostnames parsed from the map's avatar <image> elements. */
  seatIds: Set<string>;
  /** When the current `svg` was fetched (0 = never). */
  loadedAt: number;
  /** Backoff after a failed refresh: no retry before this timestamp. */
  retryAt?: number;
  loading?: boolean;
  failed?: boolean;
}

/** Revalidate maps at most this often; the worker serves them with max-age=3600. */
const MAP_TTL_MS = 10 * 60_000;
/** After a failed refresh, keep the last map and retry at most once a minute. */
const MAP_RETRY_MS = 60_000;

/** True when the map should be (re)fetched: missing, expired, or past backoff. */
export function isMapStale(map: ClusterMapDef): boolean {
  if (map.retryAt && Date.now() < map.retryAt) return false;
  if (!map.svg) return true;
  return Date.now() - map.loadedAt >= MAP_TTL_MS;
}

/** The maps carry their own <style>; the app scopes those rules in style.css. */
const stripStyle = (svg: string): string =>
  svg.replace(/<style[^>]*>[\s\S]*?<\/style>/i, "");

/** Drop the builder's hand-maintained crossed seats; reports handle breakage. */
const stripStaticCrosses = (svg: string): string =>
  svg
    .replace(/<g class="crosses">[\s\S]*?<\/g>/i, "")
    .replace(/<path[^>]*class="cross"[^>]*\/>/gi, "");

function seatIdsFromSvg(svg: string): Set<string> {
  const ids = new Set<string>();
  for (const match of svg.matchAll(/<image\b[^>]*\sid="([^"]+)"/g)) {
    const id = match[1]?.trim();
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

/**
 * Cluster names come from campuses/belgium.json; these are the ones with a map
 * in the repo.
 */
export const CLUSTER_MAPS: ClusterMapDef[] = [
  {
    id: "shi",
    label: "SHI",
    url: `${MAP_BASE}/shi.svg`,
    seatIds: new Set(),
    loadedAt: 0,
  },
  {
    id: "fu",
    label: "FU",
    url: `${MAP_BASE}/fu.svg`,
    seatIds: new Set(),
    loadedAt: 0,
  },
  {
    id: "mi",
    label: "MI",
    url: `${MAP_BASE}/mi.svg`,
    seatIds: new Set(),
    loadedAt: 0,
  },
];

/**
 * Real repo maps for `?mock`, imported lazily so only mock mode pays for them.
 * Read straight from `campuses/maps/belgium`, the same files production serves.
 */
const MOCK_MAP_IMPORTS: Record<string, () => Promise<{ default: string }>> = {
  fu: () => import("../../../campuses/maps/belgium/fu.svg?raw"),
  mi: () => import("../../../campuses/maps/belgium/mi.svg?raw"),
  shi: () => import("../../../campuses/maps/belgium/shi.svg?raw"),
};

const loads = new Map<string, Promise<void>>();

/** Applies a freshly fetched map: cleaned markup, seat ids, and freshness. */
function applyMapSvg(map: ClusterMapDef, raw: string): void {
  const cleaned = stripStaticCrosses(raw);
  map.svg = stripStyle(cleaned);
  map.seatIds = seatIdsFromSvg(cleaned);
  map.loadedAt = Date.now();
  map.retryAt = 0;
  map.failed = false;
}

/**
 * `?mock` renders the real repo map from the bundle, so the demo works with no
 * network at all.
 */
async function loadMockClusterMap(map: ClusterMapDef): Promise<void> {
  const load = MOCK_MAP_IMPORTS[map.id] ?? MOCK_MAP_IMPORTS.fu;
  applyMapSvg(map, (await load()).default);
}

/**
 * Revalidates against the network, falling back to the HTTP cache when offline
 * (or when the network fails) so the last known map still renders.
 */
async function fetchMapSvg(url: string): Promise<Response> {
  try {
    return await fetch(url, { cache: "no-cache" });
  } catch {
    return fetch(url, { cache: "force-cache" });
  }
}

/**
 * Fetches a map, or revalidates it once its copy is older than `MAP_TTL_MS`
 * (pass `force` to refresh regardless, e.g. on pull-to-refresh).
 */
export function loadClusterMap(
  map: ClusterMapDef,
  force = false,
): Promise<void> {
  if (!force && !isMapStale(map)) return Promise.resolve();
  if (mockMode) return loadMockClusterMap(map);
  const running = loads.get(map.id);
  if (running) return running;

  map.loading = true;
  const load = (async () => {
    try {
      const res = await fetchMapSvg(map.url);
      if (!res.ok) throw new Error(String(res.status));
      const raw = await res.text();
      applyMapSvg(map, raw);
    } catch {
      // Keep serving the last map (if any) and retry later, so a flaky network
      // never blanks the map or triggers a request storm.
      map.retryAt = Date.now() + MAP_RETRY_MS;
      if (!map.svg) map.failed = true;
    } finally {
      map.loading = false;
      loads.delete(map.id);
    }
  })();
  loads.set(map.id, load);
  return load;
}

/** Warms every map when the clusters tab opens (refreshing stale ones). */
export function preloadClusterMaps(force = false): void {
  for (const map of CLUSTER_MAPS) {
    if (map.loading) continue;
    if (!force && !isMapStale(map)) continue;
    void loadClusterMap(map, force);
  }
}

export function findClusterMap(id: string): ClusterMapDef | undefined {
  return CLUSTER_MAPS.find((map) => map.id === id);
}

const CAMPUS_DATA_URL = "https://api.betterintra.com/gh/campuses/belgium.json";
const CLUSTER_IDS_KEY = "ft_cluster_map_ids";
const CLUSTER_IDS_TTL = 24 * 60 * 60 * 1000;

let clusterNames: Record<string, string> | null = null;

/** Campus cluster ids ("21") to names ("fu"), as used by the default setting. */
async function clusterNamesById(): Promise<Record<string, string>> {
  if (clusterNames) return clusterNames;
  try {
    const cached = JSON.parse(localStorage.getItem(CLUSTER_IDS_KEY) || "null");
    if (
      cached &&
      typeof cached.at === "number" &&
      Date.now() - cached.at < CLUSTER_IDS_TTL &&
      cached.ids
    ) {
      clusterNames = cached.ids as Record<string, string>;
      return clusterNames;
    }
  } catch {
    /* ignore a broken cache */
  }
  try {
    const res = await fetch(CAMPUS_DATA_URL);
    if (!res.ok) return {};
    const data = (await res.json()) as {
      clusters?: { id?: unknown; name?: unknown }[];
    };
    const ids: Record<string, string> = {};
    for (const cluster of data.clusters ?? []) {
      if (cluster?.id == null || typeof cluster.name !== "string") continue;
      ids[String(cluster.id).toLowerCase()] = cluster.name.toLowerCase();
    }
    clusterNames = ids;
    try {
      localStorage.setItem(
        CLUSTER_IDS_KEY,
        JSON.stringify({ at: Date.now(), ids }),
      );
    } catch {
      /* quota / private mode */
    }
    return ids;
  } catch {
    return {};
  }
}

/**
 * Resolves the cluster set as default in the extension. It stores the campus
 * cluster id ("21"), while maps are keyed by name ("fu"); accept either.
 */
export async function findDefaultClusterMap(
  value: string,
): Promise<ClusterMapDef | undefined> {
  const key = value.trim().toLowerCase();
  if (!key) return undefined;
  const direct = findClusterMap(key);
  if (direct) return direct;
  const names = await clusterNamesById();
  const name = names[key];
  return name ? findClusterMap(name) : undefined;
}
