import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import { currentTab } from "../shell.ts";
import { refresh } from "../refresh.ts";
import { headerBadge, pageHeader } from "../lib/page-header.ts";
import {
  AVATARS_ENABLED,
  avatarErrorFallback,
  initialsAvatar,
} from "../lib/avatar.ts";
import { fetchOccupancy } from "./clusters-feature/data.ts";
import { sortActiveUsers } from "./clusters-feature/render.ts";
import {
  activeSortControl,
  loadActiveSort,
  toggleActiveSort,
} from "./clusters-feature/sort.ts";
import type {
  ActiveSortMode,
  OccupancyEntry,
} from "./clusters-feature/types.ts";

type SubTab = "active" | "map";

const POLL_INTERVAL = 60_000;

const SEP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`;

let entries: OccupancyEntry[] = [];
let loading = true;
let error = "";
let started = false;
let lastUpdated = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Only the Active tab is reachable for now — the Map tab is disabled. The
 * sub-tab is intentionally not persisted so a locked "map" can never be
 * restored.
 */
let subTab: SubTab = "active";

const sortState = loadActiveSort();

function setSort(mode: ActiveSortMode): void {
  toggleActiveSort(sortState, mode);
  refresh();
}

function switchSubTab(tab: SubTab): void {
  if (tab === "map") return; // locked — "coming soon"
  if (tab === subTab) return;
  subTab = tab;
  refresh();
}

function refreshLabel(): void {
  const el = document.getElementById("ft-clusters-countdown");
  if (!el) return;
  const secs = Math.max(
    0,
    Math.ceil((POLL_INTERVAL - (Date.now() - lastUpdated)) / 1000),
  );
  el.textContent = `${secs}s`;
}

async function loadOccupancy(): Promise<void> {
  try {
    entries = [...(await fetchOccupancy()).values()];
    lastUpdated = Date.now();
    error = "";
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
  }
  refreshLabel();
  refresh();
}

function startTimers(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.hidden || currentTab() !== "clusters") return;
    void loadOccupancy();
  }, POLL_INTERVAL);
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (!document.hidden && currentTab() === "clusters") refreshLabel();
  }, 1000);
}

export function clustersView(): unknown {
  if (subTab === "map") return mapComingSoon();
  return html`
    <div class="flex flex-col bg-base-100 rounded-xl mb-4">
      ${pageHeader({
        leading: headerBadge(entries.length, { tip: "online" }),
        trailing: html`
          ${activeSortControl(sortState, setSort)}
          <span
            id="ft-clusters-countdown"
            class="badge badge-outline tabular-nums opacity-70"
            style="height:2.5rem;min-width:2.5rem;justify-content:center"
            title="Auto-refreshes every minute"
          ></span>
        `,
      })}
      ${activeList()}
    </div>
  `;
}

function activeList(): unknown {
  if (loading && entries.length === 0) {
    return html`<div class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg"></span>
    </div>`;
  }
  if (error && entries.length === 0) {
    return html`<div
      class="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center"
    >
      <p class="text-sm opacity-70">Couldn't load the online list.</p>
      <p class="text-xs text-error">${error}</p>
      <button class="btn btn-sm btn-outline" @click=${() => loadClusters(true)}>
        Retry
      </button>
    </div>`;
  }
  if (entries.length === 0) {
    return html`<div class="flex justify-center py-12 px-6 text-sm opacity-60">
      No one is online right now.
    </div>`;
  }
  const sorted = sortActiveUsers(
    entries,
    sortState.mode,
    sortState.nameDir,
    sortState.sinceDir,
  );
  return html`
    <ul class="flex flex-col divide-y divide-base-300 px-4">
      ${sorted.map((e) => row(e))}
    </ul>
  `;
}

function durationLabel(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}m`;
}

function row(e: OccupancyEntry): unknown {
  const since = new Date(e.begin_at);
  const time = since.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const tooltip = e.begin_at
    ? `since ${time} · ${durationLabel(since.getTime())}`
    : "";
  return html`
    <li>
      <div class="flex items-center gap-3 py-2">
        <a
          href="#/u/${e.login}"
          class="flex items-center gap-3 flex-1 min-w-0 no-underline text-base-content"
        >
          ${AVATARS_ENABLED
            ? html`<img
                class="size-10 rounded-full object-cover shrink-0 bg-base-200"
                src="${e.cdn_uri}"
                alt="${e.login}"
                loading="lazy"
                referrerpolicy="no-referrer"
                @error=${avatarErrorFallback}
              />`
            : initialsAvatar(e.login, "size-10 shrink-0")}
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate">${e.name || e.login}</div>
            <div class="text-xs text-base-content/80 truncate">${e.login}</div>
          </div>
        </a>
        ${e.begin_at
          ? html`<details class="relative shrink-0" data-cluster-time>
              <summary
                class="badge badge-lg badge-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                title="${tooltip}"
              >
                ${e.host}
              </summary>
              <div
                class="absolute right-0 top-full z-50 mt-1 flex w-max items-center gap-2 rounded-box bg-base-100 p-3 text-base shadow-xl"
              >
                <span>since ${time}</span>
                <span class="shrink-0 opacity-50" aria-hidden="true"
                  >${unsafeHTML(SEP_SVG)}</span
                >
                <span>${durationLabel(since.getTime())}</span>
              </div>
            </details>`
          : html`<span class="badge badge-lg badge-secondary shrink-0"
              >${e.host}</span
            >`}
      </div>
    </li>
  `;
}

function mapComingSoon(): unknown {
  return html`
    <div
      class="flex flex-col items-center justify-center gap-2 py-16 text-center"
    >
      <span class="opacity-40"
        >${unsafeHTML(
          MAP_PIN_SVG.replace("<svg", '<svg width="40" height="40"'),
        )}</span
      >
      <h2 class="text-lg font-bold">Map coming soon</h2>
      <p class="text-sm opacity-60 max-w-xs">
        The cluster map isn't available yet. Check back later.
      </p>
    </div>
  `;
}

/** The Clusters sub-tab bar, rendered by the shell above the dock. */
export function clustersBottomBar(): unknown {
  return html`
    <div class="ft-subtabs px-4 pb-2">
      <div class="rounded-xl bg-base-100 p-1.5 shadow-lg">
        <div class="segmented-tabs-host">
          <div
            class="flex flex-1 gap-1 rounded-lg bg-base-200 p-1"
            style="border-radius:var(--radius-field)"
          >
            <button
              class="tab-btn ${subTab === "active" ? "active" : ""}"
              @click=${() => switchSubTab("active")}
            >
              Active
            </button>
            <button
              class="tab-btn"
              disabled
              aria-disabled="true"
              title="Coming soon"
              style="cursor:not-allowed;opacity:.45"
            >
              Map
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function loadClusters(force = false): Promise<void> {
  if (!started) {
    started = true;
    startTimers();
    await loadOccupancy();
    return;
  }
  if (force && !document.hidden) {
    loading = entries.length === 0;
    await loadOccupancy();
  }
}

let outsideCloseAttached = false;

/** Closes any open time popover when tapping outside it. */
function ensureOutsideClose(): void {
  if (outsideCloseAttached) return;
  outsideCloseAttached = true;
  document.addEventListener("click", (ev) => {
    const target = ev.target as Node;
    document
      .querySelectorAll<HTMLDetailsElement>("details[data-cluster-time][open]")
      .forEach((d) => {
        if (!d.contains(target)) d.open = false;
      });
  });
}

/** Called by the app after it re-renders the tab. */
export function clustersAttachObservers(): void {
  ensureOutsideClose();
  refreshLabel();
}
