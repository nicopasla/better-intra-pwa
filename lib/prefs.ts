/** Local (per-device) home dashboard preferences. */

export type HomeCardId =
  | "logtime"
  | "upcoming"
  | "live"
  | "projects"
  | "events";

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
  "logtime",
  "upcoming",
  "live",
  "projects",
  "events",
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

/** Badges kept out of the home hero until the user turns them on. */
const HIDDEN_BY_DEFAULT = new Set<string>(["pool", "blackhole"]);

const defaults = (ids: readonly string[]): HomeLayoutItem[] =>
  ids.map((id) => ({ id, hidden: HIDDEN_BY_DEFAULT.has(id) }));

/** Keeps the saved order, drops unknown ids and appends new ones. */
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
  for (const id of ids) {
    if (!seen.has(id)) items.push({ id, hidden: HIDDEN_BY_DEFAULT.has(id) });
  }
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
