import type { ActiveSortMode, SortDir } from "./types";
import SORT_AZ_SVG from "../../assets/sort-az.svg?raw";
import SORT_ZA_SVG from "../../assets/sort-za.svg?raw";
import CAL_DOWN_SVG from "../../assets/calendar-arrow-down.svg?raw";
import CAL_UP_SVG from "../../assets/calendar-arrow-up.svg?raw";

const SORT_KEY = "CLUSTERS_SORT";

export interface ActiveSortState {
  mode: ActiveSortMode;
  nameDir: SortDir;
  sinceDir: SortDir;
}

export const ACTIVE_SORT_DEFAULT: ActiveSortState = {
  mode: "since",
  nameDir: "asc",
  sinceDir: "desc",
};

const isDir = (v: unknown): v is SortDir => v === "asc" || v === "desc";

export function loadActiveSort(): ActiveSortState {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (!raw) return { ...ACTIVE_SORT_DEFAULT };
    const saved = JSON.parse(raw) as Partial<ActiveSortState>;
    return {
      mode:
        saved.mode === "name" || saved.mode === "since"
          ? saved.mode
          : ACTIVE_SORT_DEFAULT.mode,
      nameDir: isDir(saved.nameDir)
        ? saved.nameDir
        : ACTIVE_SORT_DEFAULT.nameDir,
      sinceDir: isDir(saved.sinceDir)
        ? saved.sinceDir
        : ACTIVE_SORT_DEFAULT.sinceDir,
    };
  } catch {
    return { ...ACTIVE_SORT_DEFAULT };
  }
}

function persist(state: ActiveSortState): void {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Advances to the next sort, in the order a tap on the Active tab walks them:
 * date newest → date oldest → name A→Z → name Z→A → date newest.
 */
export function cycleActiveSort(state: ActiveSortState): void {
  if (state.mode === "since") {
    if (state.sinceDir === "desc") {
      state.sinceDir = "asc";
    } else {
      state.mode = "name";
      state.nameDir = "asc";
    }
  } else if (state.nameDir === "asc") {
    state.nameDir = "desc";
  } else {
    state.mode = "since";
    state.sinceDir = "desc";
  }
  persist(state);
}

/** Icon matching the current sort, shown on the Active tab. */
export function activeSortIcon(state: ActiveSortState): string {
  if (state.mode === "name") {
    return state.nameDir === "asc" ? SORT_AZ_SVG : SORT_ZA_SVG;
  }
  return state.sinceDir === "desc" ? CAL_DOWN_SVG : CAL_UP_SVG;
}

/** Human-readable sort, used in the Active tab's tooltip. */
export function activeSortLabel(state: ActiveSortState): string {
  if (state.mode === "name") {
    return state.nameDir === "asc" ? "name A → Z" : "name Z → A";
  }
  return state.sinceDir === "desc"
    ? "date, newest first"
    : "date, oldest first";
}
