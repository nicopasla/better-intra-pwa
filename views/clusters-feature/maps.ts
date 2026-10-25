import { mockMode } from "../../mock.ts";

/** Shared cluster maps, served from the repo through the worker. */
const MAP_BASE = "https://api.betterintra.com/gh/campuses/maps/belgium";

export interface ClusterMapDef {
  /** Matches the cluster name in campuses/belgium.json. */
  id: string;
  label: string;
  available: boolean;
  /** Map file URL (campuses/maps/…), loaded at runtime. */
  url?: string;
  svg?: string;
  /** Seat hostnames parsed from the map's avatar <image> elements. */
  seatIds: Set<string>;
  /** Seats crossed out on the map: no computer, or it is out of order. */
  crossed: number;
  loading?: boolean;
  failed?: boolean;
}

/** The maps carry their own <style>; the app scopes those rules in style.css. */
const stripStyle = (svg: string): string =>
  svg.replace(/<style[^>]*>[\s\S]*?<\/style>/i, "");

function seatIdsFromSvg(svg: string): Set<string> {
  const ids = new Set<string>();
  for (const match of svg.matchAll(/<image\b[^>]*\sid="([^"]+)"/g)) {
    const id = match[1]?.trim();
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

const crossedFromSvg = (svg: string): number =>
  (svg.match(/class="cross"/g) ?? []).length;

/**
 * Cluster names come from campuses/belgium.json. SHI, FU and MI have maps for
 * now; the rest are shown as disabled tabs.
 */
export const CLUSTER_MAPS: ClusterMapDef[] = [
  {
    id: "shi",
    label: "SHI",
    available: true,
    url: `${MAP_BASE}/shi.svg`,
    seatIds: new Set(),
    crossed: 0,
  },
  {
    id: "fu",
    label: "FU",
    available: true,
    url: `${MAP_BASE}/fu.svg`,
    seatIds: new Set(),
    crossed: 0,
  },
  {
    id: "mi",
    label: "MI",
    available: true,
    url: `${MAP_BASE}/mi.svg`,
    seatIds: new Set(),
    crossed: 0,
  },
  {
    id: "a2",
    label: "A2",
    available: false,
    seatIds: new Set(),
    crossed: 0,
  },
  {
    id: "a3",
    label: "A3",
    available: false,
    seatIds: new Set(),
    crossed: 0,
  },
];

/** Self-contained map for `?mock`: mock occupancy hosts must exist offline. */
function mockMapSvg(cluster: string): string {
  const hosts =
    cluster === "fu"
      ? [
          "fu-r1-p1",
          "fu-r1-p2",
          "fu-r2-p3",
          "fu-r5-p5",
          "fu-r10-p1",
          "fu-c1-p1",
          "fu-c2-p2",
          "fu-c3-p1",
          "fu-c4-p1",
        ]
      : ["r1-p1", "r1-p2", "r1-p3", "r2-p1", "r2-p2", "r2-p3"].map(
          (seat) => `${cluster}-${seat}`,
        );
  const cells = hosts
    .map((id, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 40 + col * 70;
      const y = 40 + row * 70;
      return `<g class="posts"><rect id="${id}" x="${x}" y="${y}" width="56" height="56" rx="4"/><image id="${id}" x="${x}" y="${y}" width="56" height="56"/></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect class="zone" x="20" y="20" width="260" height="360" rx="8"/>${cells}</svg>`;
}

const loads = new Map<string, Promise<void>>();

/** Fetches a map once and keeps it in memory (the worker caches it for an hour). */
export function loadClusterMap(map: ClusterMapDef): Promise<void> {
  if (map.svg || !map.url) return Promise.resolve();
  if (mockMode) {
    map.svg = mockMapSvg(map.id);
    map.seatIds = seatIdsFromSvg(map.svg);
    map.crossed = 0;
    return Promise.resolve();
  }
  const running = loads.get(map.id);
  if (running) return running;

  map.loading = true;
  map.failed = false;
  const load = (async () => {
    try {
      const res = await fetch(map.url!, { cache: "force-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const raw = await res.text();
      map.svg = stripStyle(raw);
      map.seatIds = seatIdsFromSvg(raw);
      map.crossed = crossedFromSvg(raw);
    } catch {
      map.failed = true;
    } finally {
      map.loading = false;
      loads.delete(map.id);
    }
  })();
  loads.set(map.id, load);
  return load;
}

/** Warms every available map when the clusters tab opens. */
export function preloadClusterMaps(): void {
  for (const map of CLUSTER_MAPS) {
    if (map.available && !map.svg && !map.loading) void loadClusterMap(map);
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
