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

const loads = new Map<string, Promise<void>>();

/** Fetches a map once and keeps it in memory (the worker caches it for an hour). */
export function loadClusterMap(map: ClusterMapDef): Promise<void> {
  if (map.svg || !map.url) return Promise.resolve();
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
