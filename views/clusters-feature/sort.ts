import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
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

export function persistActiveSort(state: ActiveSortState): void {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function toggleActiveSort(
  state: ActiveSortState,
  mode: ActiveSortMode,
): void {
  if (state.mode === mode) {
    if (mode === "name")
      state.nameDir = state.nameDir === "asc" ? "desc" : "asc";
    else state.sinceDir = state.sinceDir === "desc" ? "asc" : "desc";
  } else {
    state.mode = mode;
  }
  persistActiveSort(state);
}

const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

export function activeSortControl(
  state: ActiveSortState,
  onChange: (mode: ActiveSortMode) => void,
): unknown {
  const { mode, nameDir, sinceDir } = state;
  return html`
    <div class="join shrink-0">
      <button
        type="button"
        class="btn btn-md join-item ${mode === "name"
          ? "btn-primary"
          : "btn-outline border-base-content/20"}"
        style="height:2.5rem"
        data-tip="${nameDir === "asc"
          ? "Name A → Z (click to invert)"
          : "Name Z → A (click to invert)"}"
        @click=${() => onChange("name")}
      >
        ${svg16(nameDir === "asc" ? SORT_AZ_SVG : SORT_ZA_SVG)}
      </button>
      <button
        type="button"
        class="btn btn-md join-item ${mode === "since"
          ? "btn-primary"
          : "btn-outline border-base-content/20"}"
        style="height:2.5rem"
        data-tip="${sinceDir === "desc"
          ? "Date (newest first)"
          : "Date (oldest first)"}"
        @click=${() => onChange("since")}
      >
        ${svg16(sinceDir === "desc" ? CAL_DOWN_SVG : CAL_UP_SVG)}
      </button>
    </div>
  `;
}
