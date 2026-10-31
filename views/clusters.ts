import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import MAXIMIZE_SVG from "../assets/maximize.svg?raw";
import MINIMIZE_SVG from "../assets/minimize.svg?raw";
import { currentTab } from "../shell.ts";
import { refresh } from "../refresh.ts";
import { getBlob } from "../data.ts";
import { headerBadge, pageHeader } from "../lib/page-header.ts";
import {
  avatarLoaded,
  customAvatarUrl,
  initialAvatarDataUrl,
  showCustomAvatars,
} from "../lib/avatar.ts";
import { mockMode } from "../mock.ts";
import { fetchOccupancy } from "./clusters-feature/data.ts";
import {
  attachMapGestures,
  focusMapSeat,
  highlightMapSeat,
  mapSeatIndex,
  resetMapZoom,
} from "./clusters-feature/map-gestures.ts";
import {
  CLUSTER_MAPS,
  findClusterMap,
  findDefaultClusterMap,
  isMapStale,
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
/** Cluster picked as default in the extension, applied on first open. */
let initialTabResolved = false;
/** Last seat focused from a location link; kept while the map is shown. */
let focusSeat: string | null = null;

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
  // Switching rooms drops any seat focus and returns the map to the fit view.
  const currentMap = document.getElementById("ft-cluster-map");
  if (currentMap) resetMapZoom(currentMap);
  focusSeat = null;
  mapExpanded = false;
  activeTab = id;
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

/** True when the fixed cluster-map view (not the Active list) is on screen. */
export function clusterMapVisible(): boolean {
  return activeTab !== "active";
}

export function clustersView(): unknown {
  const seat = seatFromHash();
  if (seat) {
    const mapId = mapIdForSeat(seat);
    activeTab = mapId ?? "active";
  }
  if (activeTab !== "active") {
    const map = findClusterMap(activeTab);
    if (map) return mapView(map);
  }
  mapExpanded = false;
  return html`
    <div class="flex flex-col bg-base-100 rounded-b-xl mb-4">
      ${pageHeader({
        leading: headerBadge(entries.length, {
          tip: "online",
          class: "badge-info",
          ring: false,
        }),
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
    (showCustomAvatars() ? customAvatarUrl(e.custom_avatar) : null) ??
    e.avatar_url ??
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
            class="size-10 rounded-full object-cover shrink-0 bg-base-200 skeleton"
            src="${avatar}"
            alt="${e.login}"
            loading="lazy"
            referrerpolicy="no-referrer"
            @load=${avatarLoaded}
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

/** Everyone seated in the cluster, newest connection first. */
function connectionList(seated: OccupancyEntry[]): OccupancyEntry[] {
  return seated.slice().sort((a, b) => {
    const at = Date.parse(a.begin_at || "") || 0;
    const bt = Date.parse(b.begin_at || "") || 0;
    return bt - at || a.login.localeCompare(b.login);
  });
}

function connectionRow(entry: OccupancyEntry): unknown {
  const since = new Date(entry.begin_at);
  const valid = Boolean(entry.begin_at) && !Number.isNaN(since.getTime());
  const time = valid
    ? since.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
  const ago = valid ? formatTimeAgo(since.getTime()) : "—";
  const fallbackAvatar = initialAvatarDataUrl(entry.login);
  const avatar =
    (showCustomAvatars() ? customAvatarUrl(entry.custom_avatar) : null) ??
    entry.avatar_url ??
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
          class="size-8 rounded-full object-cover shrink-0 bg-base-200 skeleton"
          src="${avatar}"
          alt="${entry.login}"
          loading="lazy"
          referrerpolicy="no-referrer"
          @load=${avatarLoaded}
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
          class="badge badge-success badge-sm shrink-0 tabular-nums"
          title="connected at ${time}"
          >${ago}</span
        >
      </a>
    </li>
  `;
}

let mapExpanded = false;

function toggleMapExpanded(): void {
  mapExpanded = !mapExpanded;
  refresh();
}

function mapView(map: ClusterMapDef): unknown {
  ensureMap(map);
  const seated = seatedEntries(map);
  const connections = connectionList(seated);
  const taken = seated.length;
  const svg = map.svg;
  const usable = Math.max(0, map.seatIds.size - map.crossed);
  const deadNote = map.crossed
    ? `${map.crossed} seat${map.crossed === 1 ? "" : "s"} without a working computer`
    : "occupied seats";
  return html`
    <div
      class="fixed left-0 right-0 z-10 flex flex-col gap-3 px-4"
      style="top: calc(env(safe-area-inset-top) + 1rem); bottom: calc(8.5rem + env(safe-area-inset-bottom));"
      data-no-swipe
    >
      <div
        class="${mapExpanded
          ? "absolute inset-0 flex flex-col bg-base-100 p-2"
          : "relative flex-70 min-h-0 flex flex-col rounded-xl bg-base-100 p-2 shadow-lg"}"
        data-no-swipe
      >
        <button
          type="button"
          class="btn btn-square btn-sm absolute bottom-2 right-2 z-10 border border-base-300 bg-base-100/80 backdrop-blur"
          aria-label=${mapExpanded
            ? "Exit full screen"
            : "Open the map full screen"}
          title=${mapExpanded ? "Exit full screen" : "Full screen"}
          @click=${toggleMapExpanded}
        >
          ${mapExpanded
            ? unsafeHTML(
                MINIMIZE_SVG.replace("<svg", '<svg width="18" height="18"'),
              )
            : unsafeHTML(
                MAXIMIZE_SVG.replace("<svg", '<svg width="18" height="18"'),
              )}
        </button>
        ${svg
          ? html`<div
              id="ft-cluster-map"
              class="cluster-map flex-1 min-h-0"
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

      ${mapExpanded
        ? ""
        : html`<div
            class="flex-30 min-h-0 flex flex-col rounded-xl bg-base-100 p-3 shadow-lg"
          >
            <div class="flex shrink-0 items-center justify-between gap-2 pb-1">
              <h2 class="font-semibold">Connections</h2>
              <span
                class="badge badge-info font-mono tabular-nums"
                title="${deadNote}"
              >
                ${svg ? `${taken} / ${usable}` : "…"}
              </span>
            </div>
            ${connections.length
              ? html`<div
                  class="min-h-0 flex-1 overflow-y-auto -mr-3 pr-3"
                  style="scrollbar-gutter:stable"
                >
                  <ul class="flex flex-col divide-y divide-base-300">
                    ${connections.map((entry) => connectionRow(entry))}
                  </ul>
                </div>`
              : html`<p class="py-3 text-center text-sm opacity-60">
                  No one is seated in this cluster right now.
                </p>`}
          </div>`}
    </div>
  `;
}

/** Fetches the map when its tab is shown (or finishes a preload already running). */
function ensureMap(map: ClusterMapDef): void {
  if (!map.available || !map.url || map.failed || !isMapStale(map)) return;
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
        void loadClusterMap(map, true).then(() => refresh());
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
  preloadClusterMaps(force && !document.hidden);
  if (!started) {
    started = true;
    startTimers();
    await applyDefaultCluster();
    await loadOccupancy();
    return;
  }
  if (force && !document.hidden) {
    loading = entries.length === 0;
    await loadOccupancy();
  }
}

/**
 * Opens the cluster the user picked as default in the extension (synced through
 * the cloud settings blob). Seat deep links still win, and the choice is only
 * applied once per session so switching tabs afterwards sticks.
 */
async function applyDefaultCluster(): Promise<void> {
  if (initialTabResolved) return;
  initialTabResolved = true;
  if (seatFromHash() || activeTab !== "active") return;
  let id: unknown;
  try {
    const blob = await getBlob();
    id = blob.settings?.CLUSTERS_DEFAULT_ID;
  } catch {
    return;
  }
  if (typeof id !== "string" || !id) return;
  const map = await findDefaultClusterMap(id);
  if (!map?.available) return;
  activeTab = map.id;
  refresh();
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
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * What is painted in each seat image, per SVG. Re-renders are frequent (poll,
 * tab switch), so unchanged seats are never touched again.
 */
const paintedSeats = new WeakMap<SVGSVGElement, Map<string, string>>();
/** Normalised ids of seats exported with the builder's `seat-newer` class. */
const newerSeats = new WeakMap<SVGSVGElement, Set<string>>();

/** Fills each seat's empty <image> with the avatar of whoever is sitting there. */
function applyMapOccupancy(): void {
  const mapEl = document.getElementById("ft-cluster-map");
  if (!mapEl) return;
  const svg = mapEl.querySelector<SVGSVGElement>("svg");
  if (!svg) return;

  let newer = newerSeats.get(svg);
  if (!newer) {
    newer = new Set<string>();
    const index = mapSeatIndex(svg);
    svg.querySelectorAll<Element>("rect.seat-newer[id]").forEach((rect) => {
      const id = (rect.getAttribute("id") || "").trim().toLowerCase();
      if (!id) return;
      newer!.add(id);
      const img = index.get(id);
      if (!img?.parentNode) return;
      // The seat's own stroke sits under its avatar, so draw the ring above the
      // <image> to keep the newer-seat outline visible when someone is seated.
      const ring = document.createElementNS(SVG_NS, "rect");
      ring.setAttribute("class", "seat-newer-ring");
      for (const name of ["x", "y", "width", "height", "rx", "transform"]) {
        const value = rect.getAttribute(name);
        if (value) ring.setAttribute(name, value);
      }
      img.parentNode.insertBefore(ring, img.nextSibling);
    });
    newerSeats.set(svg, newer);
  }

  const byHost = new Map<string, OccupancyEntry>();
  for (const entry of entries) {
    const host = entry.host?.trim().toLowerCase();
    if (host) byHost.set(host, entry);
  }

  let painted = paintedSeats.get(svg);
  if (!painted) {
    painted = new Map();
    paintedSeats.set(svg, painted);
  }

  for (const [id, img] of mapSeatIndex(svg)) {
    const entry = byHost.get(id);
    if (!entry) {
      if (!painted.has(id)) continue;
      img.removeAttribute("href");
      img.removeAttributeNS(XLINK_NS, "href");
      img.removeAttribute("data-login");
      img.onerror = null;
      painted.delete(id);
      continue;
    }
    const fallback = initialAvatarDataUrl(entry.login);
    const src =
      (showCustomAvatars() ? customAvatarUrl(entry.custom_avatar) : null) ??
      entry.avatar_url ??
      (mockMode ? entry.cdn_uri : fallback);
    const signature = `${entry.login}\n${src}\n${fallback}`;
    if (painted.get(id) === signature) continue;
    img.setAttribute("href", src);
    img.setAttributeNS(XLINK_NS, "xlink:href", src);
    img.setAttribute("data-login", entry.login);
    img.onerror = () => {
      img.onerror = null;
      img.setAttribute("href", fallback);
      img.setAttributeNS(XLINK_NS, "xlink:href", fallback);
    };
    painted.set(id, signature);
  }

  attachMapGestures(mapEl);
}

/** Called by the app after it re-renders the tab. */
export function clustersAttachObservers(): void {
  ensureOutsideClose();
  refreshLabel();
  applyMapOccupancy();
  const seat = seatFromHash();
  const mapEl = document.getElementById("ft-cluster-map");
  if (seat) {
    // The map SVG is rebuilt on every render, so draw the ring again and keep
    // it highlighted until the room changes.
    focusSeat = seat;
    if (activeTab !== "active" && mapEl) focusMapSeat(mapEl, seat);
  } else if (focusSeat && activeTab !== "active" && mapEl) {
    highlightMapSeat(mapEl, focusSeat);
  }
  if (!seat) return;
  // Consume the route once handled, so switching tabs afterwards doesn't snap
  // back to the seat's map on every render.
  const clean = location.hash.replace(/\?.*$/, "");
  if (clean !== location.hash) history.replaceState(null, "", clean);
}
