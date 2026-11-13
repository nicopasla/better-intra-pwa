/** Local (per-device) home dashboard preferences. */

export type HomeCardId =
  | "logtime"
  | "week"
  | "upcoming"
  | "live"
  | "projects"
  | "events"
  | "transit";

export type HomeBadgeId =
  | "level"
  | "wallet"
  | "eval"
  | "pool"
  | "blackhole"
  | "frozen"
  | "alumni";

export interface HomeLayoutItem {
  id: string;
  hidden: boolean;
}

export interface HomeLayout {
  cards: HomeLayoutItem[];
  badges: HomeLayoutItem[];
}

const LAYOUT_KEY = "ft_home_layout";

export const HOME_CARDS: HomeCardId[] = [
  "week",
  "logtime",
  "upcoming",
  "live",
  "projects",
  "events",
  "transit",
];

export const HOME_BADGES: HomeBadgeId[] = [
  "level",
  "wallet",
  "eval",
  "pool",
  "blackhole",
  "frozen",
  "alumni",
];

/** The hero has two badge rows; ordering happens inside each one. */
export const BADGE_ROWS: Record<string, string[]> = {
  stats: ["level", "wallet", "eval"],
  status: ["pool", "blackhole", "frozen", "alumni"],
};

/** Badges and cards kept out of the home screen until the user turns them on. */
const HIDDEN_BY_DEFAULT = new Set<string>(["pool", "blackhole", "transit"]);

const defaults = (ids: readonly string[]): HomeLayoutItem[] =>
  ids.map((id) => ({ id, hidden: HIDDEN_BY_DEFAULT.has(id) }));

/** Keeps the saved order, drops unknown ids and inserts new ones at their
 *  default position (so a card added later doesn't always land at the end). */
function merge(saved: unknown, ids: readonly string[]): HomeLayoutItem[] {
  const items: HomeLayoutItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved)) {
    for (const raw of saved as { id?: unknown; hidden?: unknown }[]) {
      const id = typeof raw?.id === "string" ? raw.id : "";
      if (!ids.includes(id) || seen.has(id)) continue;
      seen.add(id);
      items.push({ id, hidden: raw.hidden === true });
    }
  }
  ids.forEach((id, index) => {
    if (seen.has(id)) return;
    items.splice(Math.min(index, items.length), 0, {
      id,
      hidden: HIDDEN_BY_DEFAULT.has(id),
    });
  });
  return items;
}

export function getHomeLayout(): HomeLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
    return {
      cards: merge(raw?.cards, HOME_CARDS),
      badges: merge(raw?.badges, HOME_BADGES),
    };
  } catch {
    return { cards: defaults(HOME_CARDS), badges: defaults(HOME_BADGES) };
  }
}

export function setHomeLayout(layout: HomeLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* quota / private mode */
  }
}

/** Back to the built-in card order and badge visibility. */
export function resetHomeLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_KEY);
  } catch {
    /* quota / private mode */
  }
}

const REMEMBER_TAB_KEY = "ft_remember_last_tab";
const LAST_TAB_KEY = "ft_last_tab";

/** Tabs worth restoring on launch. Settings is left out on purpose: closing the
 *  app there reopens the previous main tab instead. */
const RESTORABLE_TABS = new Set([
  "dashboard",
  "profile",
  "friends",
  "students",
  "clusters",
]);

/** Per-device: reopen on the last main tab instead of Home. Defaults to on. */
export function getRememberLastTab(): boolean {
  try {
    return localStorage.getItem(REMEMBER_TAB_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setRememberLastTab(on: boolean): void {
  try {
    localStorage.setItem(REMEMBER_TAB_KEY, on ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}

/** Last restorable tab visited on this device, or null when there is none. */
export function getLastTab(): string | null {
  try {
    const tab = localStorage.getItem(LAST_TAB_KEY);
    return tab && RESTORABLE_TABS.has(tab) ? tab : null;
  } catch {
    return null;
  }
}

/** Records the tab; Settings and user profiles are not restorable, so they
 *  are ignored and the previous main tab stays remembered. */
export function setLastTab(tab: string): void {
  if (!RESTORABLE_TABS.has(tab)) return;
  try {
    localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    /* quota / private mode */
  }
}

export type WeekStart = "monday" | "saturday";

const WEEK_START_KEY = "ft_week_start";

/** First day of the home heat card's week. Saturday–Friday matches the piscine
 *  schedule; Monday–Sunday is the default. Per device. */
export function getWeekStart(): WeekStart {
  try {
    return localStorage.getItem(WEEK_START_KEY) === "saturday"
      ? "saturday"
      : "monday";
  } catch {
    return "monday";
  }
}

export function setWeekStart(value: WeekStart): void {
  try {
    localStorage.setItem(WEEK_START_KEY, value);
  } catch {
    /* quota / private mode */
  }
}

const OPEN_DEFAULT_CLUSTER_KEY = "ft_open_default_cluster";
const CLUSTERS_DEFAULT_TAB_KEY = "ft_clusters_default_tab";

/** Per-device: open the cluster set as default in the extension on the first
 *  visit to Clusters. Defaults to on. */
export function getOpenDefaultCluster(): boolean {
  try {
    return localStorage.getItem(OPEN_DEFAULT_CLUSTER_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setOpenDefaultCluster(on: boolean): void {
  try {
    localStorage.setItem(OPEN_DEFAULT_CLUSTER_KEY, on ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}

/** Last resolved default tab ("plan", "active" or a map id). Read at startup so
 *  a cold open paints the right tab before the cloud setting arrives. */
export function getClustersDefaultTab(): string | null {
  if (!getOpenDefaultCluster()) return null;
  try {
    return localStorage.getItem(CLUSTERS_DEFAULT_TAB_KEY) || null;
  } catch {
    return null;
  }
}

export function setClustersDefaultTab(tab: string | null): void {
  try {
    if (tab) localStorage.setItem(CLUSTERS_DEFAULT_TAB_KEY, tab);
    else localStorage.removeItem(CLUSTERS_DEFAULT_TAB_KEY);
  } catch {
    /* quota / private mode */
  }
}

// ---------------------------------------------------------------------------
// Transit favourites (per device)
// ---------------------------------------------------------------------------

/** A starred line and direction at a stop of the home transit board. */
export interface TransitFavorite {
  /** Stop name as published by the feed (stable across platform points). */
  stopName: string;
  lineId: string;
  /** Destination as published by the feed: this is what picks a direction. */
  destination: string;
}

const TRANSIT_FAVORITES_KEY = "ft_transit_favorites";
const MAX_TRANSIT_FAVORITES = 30;

export function getTransitFavorites(): TransitFavorite[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem(TRANSIT_FAVORITES_KEY) || "[]",
    ) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item): item is TransitFavorite =>
          typeof (item as TransitFavorite)?.stopName === "string" &&
          typeof (item as TransitFavorite)?.lineId === "string" &&
          typeof (item as TransitFavorite)?.destination === "string",
      )
      .slice(0, MAX_TRANSIT_FAVORITES);
  } catch {
    return [];
  }
}

/** Stars or unstars one direction of a line; the newest favourite pins first. */
export function toggleTransitFavorite(
  stopName: string,
  lineId: string,
  destination: string,
): void {
  const favorites = getTransitFavorites();
  const index = favorites.findIndex(
    (item) =>
      item.stopName === stopName &&
      item.lineId === lineId &&
      item.destination === destination,
  );
  if (index === -1) favorites.unshift({ stopName, lineId, destination });
  else favorites.splice(index, 1);
  try {
    localStorage.setItem(TRANSIT_FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    /* quota / private mode */
  }
}
