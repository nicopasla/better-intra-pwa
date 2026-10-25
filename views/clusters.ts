import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import { currentTab } from "../shell.ts";
import { refresh } from "../refresh.ts";
import { headerBadge, pageHeader } from "../lib/page-header.ts";
import { customAvatarUrl, initialAvatarDataUrl } from "../lib/avatar.ts";
import { mockMode } from "../mock.ts";
import { fetchOccupancy } from "./clusters-feature/data.ts";
import {
  attachMapGestures,
  focusMapSeat,
  resetMapZoom,
} from "./clusters-feature/map-gestures.ts";
import {
  CLUSTER_MAPS,
  findClusterMap,
  loadClusterMap,
  preloadClusterMaps,
} from "./clusters-feature/maps.ts";
import { formatTimeAgo, sortActiveUsers } from "./clusters-feature/render.ts";
import {
  activeSortControl,
  loadActiveSort,
  toggleActiveSort,
} from "./clusters-feature/sort.ts";
import type { ClusterMapDef } from "./clusters-feature/maps.ts";
import type {
  ActiveSortMode,
  OccupancyEntry,
} from "./clusters-feature/types.ts";

const POLL_INTERVAL = 60_000;
const LATEST_LIMIT = 5;

const SEP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`;

let entries: OccupancyEntry[] = [];
let loading = true;
let error = "";
let started = false;
let lastUpdated = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

/**
 * The selected bottom tab: a cluster map id, or "active" for the online list.
 */
let activeTab = "active";
/** Seat route (`#/clusters?seat=…`), applied once per change. */
let focusedSeat: string | null = null;

const sortState = loadActiveSort();

function seatFromHash(): string | null {
  const raw = location.hash.replace(/^#\/?/, "");
  const query = raw.indexOf("?");
  if (query === -1) return null;
  const seat = new URLSearchParams(raw.slice(query + 1))
    .get("seat")
    ?.trim()
    .toLowerCase();
  return seat || null;
}

/** Longest available map id that prefixes the seat (`shi-r1-p1` → `shi`). */
function mapIdForSeat(seat: string): string | null {
  const match = CLUSTER_MAPS.filter(
    (m) => m.available && seat.startsWith(`${m.id}-`),
  ).sort((a, b) => b.id.length - a.id.length)[0];
  return match?.id ?? null;
}

function setSort(mode: ActiveSortMode): void {
  toggleActiveSort(sortState, mode);
  refresh();
}

function switchTab(id: string): void {
  if (id === activeTab) return;
  if (id !== "active" && !findClusterMap(id)?.available) return;
  activeTab = id;
  focusedSeat = null;
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
  const seat = seatFromHash();
  if (seat) {
    const mapId = mapIdForSeat(seat);
    activeTab = mapId ?? "active";
  } else {
    focusedSeat = null;
  }
  if (activeTab !== "active") {
    const map = findClusterMap(activeTab);
    if (map) return mapView(map);
  }
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
  const fallbackAvatar = initialAvatarDataUrl(e.login);
  const avatar =
    customAvatarUrl(e.custom_avatar) ??
    (mockMode ? e.cdn_uri : null) ??
    fallbackAvatar;
  return html`
    <li>
      <div class="flex items-center gap-3 py-2">
        <a
          href="#/u/${e.login}"
          class="flex items-center gap-3 flex-1 min-w-0 no-underline text-base-content"
        >
          <img
            class="size-10 rounded-full object-cover shrink-0 bg-base-200"
            src="${avatar}"
            alt="${e.login}"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error=${(ev: Event) => {
              const img = ev.target as HTMLImageElement;
              if (!img.isConnected || img.dataset.fallbackSet) return;
              img.dataset.fallbackSet = "1";
              img.src = fallbackAvatar;
            }}
          />
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
                class="absolute right-0 top-full z-40 mt-1 flex w-max items-center gap-2 rounded-box bg-base-100 p-3 text-base shadow-xl"
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

function seatedEntries(map: ClusterMapDef): OccupancyEntry[] {
  return entries.filter((entry) =>
    map.seatIds.has((entry.host || "").trim().toLowerCase()),
  );
}

function latestConnections(seated: OccupancyEntry[]): OccupancyEntry[] {
  return seated
    .slice()
    .sort((a, b) => {
      const at = Date.parse(a.begin_at || "") || 0;
      const bt = Date.parse(b.begin_at || "") || 0;
      return bt - at || a.login.localeCompare(b.login);
    })
    .slice(0, LATEST_LIMIT);
}

function latestRow(entry: OccupancyEntry): unknown {
  const since = new Date(entry.begin_at);
  const valid = Boolean(entry.begin_at) && !Number.isNaN(since.getTime());
  const time = valid
    ? since.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
  const ago = valid ? formatTimeAgo(since.getTime()) : "—";
  const fallbackAvatar = initialAvatarDataUrl(entry.login);
  const avatar =
    customAvatarUrl(entry.custom_avatar) ??
    (mockMode ? entry.cdn_uri : null) ??
    fallbackAvatar;
  return html`
    <li>
      <a
        href="#/u/${entry.login}"
        class="flex items-center gap-2.5 py-1.5 min-w-0 text-base-content no-underline"
        title="${entry.host} · since ${time}"
      >
        <img
          class="size-8 rounded-full object-cover shrink-0 bg-base-200"
          src="${avatar}"
          alt="${entry.login}"
          loading="lazy"
          referrerpolicy="no-referrer"
          @error=${(ev: Event) => {
            const img = ev.target as HTMLImageElement;
            if (!img.isConnected || img.dataset.fallbackSet) return;
            img.dataset.fallbackSet = "1";
            img.src = fallbackAvatar;
          }}
        />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold truncate">
            ${entry.name || entry.login}
          </div>
          <div class="text-xs opacity-60 truncate">${entry.login}</div>
        </div>
        <span
          class="badge badge-ghost badge-sm shrink-0 tabular-nums"
          title="connected at ${time}"
          >${ago}</span
        >
      </a>
    </li>
  `;
}

function mapView(map: ClusterMapDef): unknown {
  ensureMap(map);
  const seated = seatedEntries(map);
  const latest = latestConnections(seated);
  const taken = seated.length;
  const svg = map.svg;
  const usable = Math.max(0, map.seatIds.size - map.crossed);
  const deadNote = map.crossed
    ? `${map.crossed} seat${map.crossed === 1 ? "" : "s"} without a working computer`
    : "occupied seats";
  return html`
    <div class="flex flex-col gap-3 mb-4">
      <div class="rounded-xl bg-base-100 p-2 shadow-lg" data-no-swipe>
        <div
          class="flex flex-wrap items-center justify-between gap-2 px-1 pb-2"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="badge badge-outline font-mono tabular-nums"
              style="height:2.5rem;min-width:2.5rem;justify-content:center"
              title="${deadNote}"
            >
              ${svg ? `${taken} / ${usable}` : "…"}
            </span>
          </div>
          <span
            id="ft-clusters-countdown"
            class="badge badge-outline tabular-nums opacity-70"
            style="height:2.5rem;min-width:2.5rem;justify-content:center"
            title="Auto-refreshes every minute"
          ></span>
        </div>
        ${svg
          ? html`<div
              id="ft-cluster-map"
              class="cluster-map"
              data-no-swipe
              aria-label="${map.label} cluster map"
            >
              ${unsafeHTML(svg)}
            </div>`
          : !map.available
            ? mapComingSoon(map.label)
            : map.failed
              ? mapFailed(map)
              : mapLoading()}
      </div>

      <div class="rounded-xl bg-base-100 p-3 shadow-lg">
        <div class="flex items-center justify-between gap-2 pb-1">
          <h2 class="font-semibold">Latest connections</h2>
          ${seated.length > latest.length
            ? html`<span class="text-xs opacity-60 tabular-nums"
                >latest ${latest.length} of ${seated.length}</span
              >`
            : ""}
        </div>
        ${latest.length
          ? html`<ul class="flex flex-col divide-y divide-base-300">
              ${latest.map((entry) => latestRow(entry))}
            </ul>`
          : html`<p class="py-3 text-center text-sm opacity-60">
              No one is seated in this cluster right now.
            </p>`}
      </div>
    </div>
  `;
}

/** Fetches the map when its tab is shown (or finishes a preload already running). */
function ensureMap(map: ClusterMapDef): void {
  if (!map.available || !map.url || map.svg || map.failed) return;
  void loadClusterMap(map).then(() => refresh());
}

function mapLoading(): unknown {
  return html`<div class="flex items-center justify-center py-16">
    <span class="loading loading-spinner loading-lg"></span>
  </div>`;
}

function mapFailed(map: ClusterMapDef): unknown {
  return html`<div
    class="flex flex-col items-center justify-center gap-2 py-16 text-center"
  >
    <p class="text-sm opacity-60">Could not load the ${map.label} map.</p>
    <button
      class="btn btn-sm"
      @click=${() => {
        map.failed = false;
        void loadClusterMap(map).then(() => refresh());
      }}
    >
      Retry
    </button>
  </div>`;
}

function mapComingSoon(label = "Map"): unknown {
  return html`
    <div
      class="flex flex-col items-center justify-center gap-2 py-16 text-center"
    >
      <span class="opacity-40"
        >${unsafeHTML(
          MAP_PIN_SVG.replace("<svg", '<svg width="40" height="40"'),
        )}</span
      >
      <h2 class="text-lg font-bold">${label} coming soon</h2>
      <p class="text-sm opacity-60 max-w-xs">
        This cluster map isn't available yet. Check back later.
      </p>
    </div>
  `;
}

/** The Clusters bottom tab bar, rendered by the shell above the dock. */
export function clustersBottomBar(): unknown {
  return html`
    <div class="ft-subtabs px-4 pb-2">
      <div class="rounded-xl bg-base-100 p-1.5 shadow-lg">
        <div class="segmented-tabs-host">
          <div
            class="clusters-tabs flex flex-1 gap-1 rounded-lg bg-base-200 p-1"
            style="border-radius:var(--radius-field)"
            role="tablist"
            aria-label="Clusters"
          >
            ${CLUSTER_MAPS.map(
              (m) => html`
                <button
                  role="tab"
                  aria-selected=${activeTab === m.id ? "true" : "false"}
                  class="tab-btn ${activeTab === m.id ? "active" : ""}"
                  style="${m.available ? "" : "opacity:.45;cursor:not-allowed"}"
                  ?disabled=${!m.available}
                  title=${m.available ? m.label : `${m.label} — coming soon`}
                  @click=${() => switchTab(m.id)}
                >
                  ${m.label}
                </button>
              `,
            )}
            <button
              role="tab"
              aria-selected=${activeTab === "active" ? "true" : "false"}
              class="tab-btn ${activeTab === "active" ? "active" : ""}"
              @click=${() => switchTab("active")}
            >
              Active
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function loadClusters(force = false): Promise<void> {
  preloadClusterMaps();
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

const XLINK_NS = "http://www.w3.org/1999/xlink";

/** Fills each seat's empty <image> with the avatar of whoever is sitting there. */
function applyMapOccupancy(): void {
  const mapEl = document.getElementById("ft-cluster-map");
  if (!mapEl) return;
  const svg = mapEl.querySelector("svg");
  if (!svg) return;

  const byHost = new Map<string, OccupancyEntry>();
  for (const entry of entries) {
    const host = entry.host?.trim().toLowerCase();
    if (host) byHost.set(host, entry);
  }

  svg.querySelectorAll<SVGImageElement>("image[id]").forEach((img) => {
    const entry = byHost.get(img.id.toLowerCase());
    if (entry) {
      const fallback = initialAvatarDataUrl(entry.login);
      const src =
        customAvatarUrl(entry.custom_avatar) ??
        (mockMode ? entry.cdn_uri : fallback);
      img.setAttribute("href", src);
      img.setAttributeNS(XLINK_NS, "xlink:href", src);
      img.setAttribute("data-login", entry.login);
      img.onerror = () => {
        img.onerror = null;
        img.setAttribute("href", fallback);
        img.setAttributeNS(XLINK_NS, "xlink:href", fallback);
      };
    } else {
      img.removeAttribute("href");
      img.removeAttributeNS(XLINK_NS, "href");
      img.removeAttribute("data-login");
      img.onerror = null;
    }
  });

  attachMapGestures(mapEl);
}

/** Called by the app after it re-renders the tab. */
export function clustersAttachObservers(): void {
  ensureOutsideClose();
  refreshLabel();
  applyMapOccupancy();
  const seat = seatFromHash();
  const mapEl = document.getElementById("ft-cluster-map");
  if (!seat) {
    // Leaving the seat route (or coming back to the tab) resets the zoom.
    if (focusedSeat) {
      focusedSeat = null;
      if (mapEl) resetMapZoom(mapEl);
    }
    return;
  }
  if (activeTab !== "active" && mapEl && focusedSeat !== seat) {
    if (focusMapSeat(mapEl, seat)) focusedSeat = seat;
  }
  // Consume the route once handled, so switching tabs afterwards doesn't snap
  // back to the seat's map on every render.
  const clean = location.hash.replace(/\?.*$/, "");
  if (clean !== location.hash) history.replaceState(null, "", clean);
}
