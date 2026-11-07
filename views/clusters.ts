import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import USER_GROUP_SVG from "../assets/user-round-group.svg?raw";
import FRIEND_SVG from "../assets/face-slightly-smiling-plus.svg?raw";
import MAXIMIZE_SVG from "../assets/maximize.svg?raw";
import MINIMIZE_SVG from "../assets/minimize.svg?raw";
import BUG_SVG from "../assets/bug.svg?raw";
import USBC_SVG from "../assets/usbc.svg?raw";
import WARNING_SVG from "../assets/triangle-exclamation.svg?raw";
import { currentTab } from "../shell.ts";
import { getSession } from "../api.ts";
import { refresh } from "../refresh.ts";
import {
  avatarLoaded,
  customAvatarUrl,
  initialAvatarDataUrl,
  showCustomAvatars,
} from "../lib/avatar.ts";
import { mockMode } from "../mock.ts";
import { rowSkeleton } from "../lib/skeletons.ts";
import { getFriendsList } from "./friends-feature/friends.ts";
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
  CLUSTER_PLAN,
  findClusterMap,
  isMapStale,
  loadClusterMap,
  preloadClusterMaps,
} from "./clusters-feature/maps.ts";
import { formatTimeAgo, sortActiveUsers } from "./clusters-feature/render.ts";
import {
  getComponentStatus,
  getMinorSeatIssues,
  getSeatSeverity,
  loadSeatReports,
} from "./clusters-feature/reports.ts";
import { seatIssueTooltipHtml } from "./clusters-feature/seat-icons.ts";
import { openSeatReportDialog } from "./seat-report-dialog.ts";
import {
  activeSortIcon,
  activeSortLabel,
  cycleActiveSort,
  loadActiveSort,
} from "./clusters-feature/sort.ts";
import type { ClusterMapDef } from "./clusters-feature/maps.ts";
import type { OccupancyEntry } from "./clusters-feature/types.ts";

const POLL_INTERVAL = 60_000;

let entries: OccupancyEntry[] = [];
let loading = true;
let error = "";
let started = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * The selected bottom tab: "plan" for the campus floor plan, a cluster map id,
 * or "active" for the online list.
 */
let activeTab = "plan";
/** Last seat focused from a location link; kept while the map is shown. */
let focusSeat: string | null = null;
/** The bug button arms the next seat tap for a report. */
let reportMode = false;
/** Logins of the user's friends, used to highlight their seats. */
let friends: Set<string> = new Set();

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
  const match = CLUSTER_MAPS.filter((m) => seat.startsWith(`${m.id}-`)).sort(
    (a, b) => b.id.length - a.id.length,
  )[0];
  return match?.id ?? null;
}

function switchTab(id: string): void {
  if (id === activeTab) return;
  if (id !== "active" && id !== "plan" && !findClusterMap(id)) return;
  // Switching rooms drops any seat focus and returns the map to the fit view.
  const currentMap = document.getElementById("ft-cluster-map");
  if (currentMap) resetMapZoom(currentMap);
  focusSeat = null;
  reportMode = false;
  mapExpanded = false;
  listExpanded = false;
  activeTab = id;
  refresh();
}

/** First tap opens the online list, later taps cycle its sort order. */
function onActiveTab(): void {
  if (activeTab === "active") {
    cycleActiveSort(sortState);
    refresh();
    return;
  }
  switchTab("active");
}

async function loadOccupancy(): Promise<void> {
  try {
    const [occupancy] = await Promise.all([
      fetchOccupancy(),
      loadSeatReports(),
    ]);
    entries = [...occupancy.values()];
    error = "";
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
  }
  refresh();
}

function startTimers(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.hidden || currentTab() !== "clusters") return;
    void loadOccupancy();
  }, POLL_INTERVAL);
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
  if (activeTab === "plan") return planView();
  if (activeTab !== "active") {
    const map = findClusterMap(activeTab);
    if (map) return mapView(map);
  }
  mapExpanded = false;
  listExpanded = false;
  return html`
    <div class="flex flex-col bg-base-100 rounded-b-xl mb-4">
      ${activeList()}
    </div>
  `;
}

function activeList(): unknown {
  if (loading && entries.length === 0) return rowSkeleton(7);
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
    hour12: false,
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
            <div class="font-semibold line-clamp-2 break-words">
              ${e.name || e.login}
            </div>
            <div class="text-xs text-base-content/80 truncate">${e.login}</div>
          </div>
        </a>
        <span
          class="badge badge-success badge-lg shrink-0"
          data-tip="${tooltip}"
          >${e.host}</span
        >
      </div>
    </li>
  `;
}

function seatedEntries(map: ClusterMapDef): OccupancyEntry[] {
  return entries.filter((entry) =>
    map.seatIds.has((entry.host || "").trim().toLowerCase()),
  );
}

function sessionLogin(): string {
  return (getSession()?.login ?? "").trim().toLowerCase();
}

async function loadFriendLogins(): Promise<void> {
  try {
    const list = await getFriendsList();
    friends = new Set(list.map((l) => l.trim().toLowerCase()));
    refresh();
  } catch {
    /* offline: no friend highlights */
  }
}

/** Entries ordered by connection time, newest first. */
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
    ? since.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
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
          <div class="text-sm font-semibold line-clamp-2 break-words">
            ${entry.name || entry.login}
          </div>
          <div class="text-xs opacity-60 truncate">${entry.login}</div>
        </div>
        ${friends.has(entry.login.trim().toLowerCase()) &&
        entry.login.trim().toLowerCase() !== sessionLogin()
          ? html`<span
              class="size-4 shrink-0 flex items-center justify-center text-info"
              title="Friend"
              aria-label="Friend"
              >${unsafeHTML(
                FRIEND_SVG.replace("<svg", '<svg width="16" height="16"'),
              )}</span
            >`
          : ""}
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
let listExpanded = false;

function toggleMapExpanded(): void {
  mapExpanded = !mapExpanded;
  if (mapExpanded) listExpanded = false;
  refresh();
}

function toggleListExpanded(): void {
  listExpanded = !listExpanded;
  if (listExpanded) mapExpanded = false;
  refresh();
}

/** Arms the map so the next seat tap (avatar or empty) opens the report sheet. */
function toggleReportMode(): void {
  reportMode = !reportMode;
  refresh();
}

const PLAN_CLUSTER_IDS = new Set(CLUSTER_MAPS.map((m) => m.id));

/** Cluster id under a plan tap/keypress, if any. */
function planClusterFrom(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const region = target.closest("[data-cluster]");
  const id = region?.getAttribute("data-cluster") ?? "";
  return PLAN_CLUSTER_IDS.has(id) ? id : null;
}

function onPlanClick(e: Event): void {
  const id = planClusterFrom(e.target);
  if (!id) return;
  e.preventDefault();
  switchTab(id);
}

function onPlanKeydown(e: KeyboardEvent): void {
  if (e.key !== "Enter" && e.key !== " ") return;
  const id = planClusterFrom(e.target);
  if (!id) return;
  e.preventDefault();
  switchTab(id);
}

/** Campus floor plan: a room picker that opens the matching cluster map. */
function planView(): unknown {
  const plan = CLUSTER_PLAN;
  ensureMap(plan);
  return html`
    <div
      class="fixed left-0 right-0 z-10 flex flex-col gap-3 px-4"
      style="top: calc(env(safe-area-inset-top) + 1rem); bottom: calc(8.5rem + env(safe-area-inset-bottom));"
      data-no-swipe
    >
      <div
        class="relative flex-1 min-h-0 flex flex-col rounded-xl bg-base-100 p-2 shadow-lg"
        data-no-swipe
      >
        ${plan.svg
          ? html`<div
              id="ft-cluster-map"
              class="cluster-map plan-map flex-1 min-h-0"
              data-no-swipe
              aria-label="Campus floor plan"
              @click=${onPlanClick}
              @keydown=${onPlanKeydown}
            >
              ${unsafeHTML(plan.svg)}
            </div>`
          : plan.failed
            ? mapFailed(plan)
            : mapLoading()}
      </div>
    </div>
  `;
}

function mapView(map: ClusterMapDef): unknown {
  ensureMap(map);
  const seated = seatedEntries(map);
  const connections = connectionList(seated);
  const taken = seated.length;
  const svg = map.svg;
  const usable = usableSeats(map);
  return html`
    <div
      class="fixed left-0 right-0 z-10 flex flex-col gap-3 px-4"
      style="top: calc(env(safe-area-inset-top) + 1rem); bottom: calc(8.5rem + env(safe-area-inset-bottom));"
      data-no-swipe
    >
      <div
        class="${listExpanded
          ? "hidden"
          : mapExpanded
            ? "absolute inset-0 flex flex-col bg-base-100 p-2"
            : "relative flex-70 min-h-0 flex flex-col rounded-xl bg-base-100 p-2 shadow-lg"}"
        data-no-swipe
      >
        <button
          type="button"
          class="btn btn-circle size-9 absolute bottom-3 right-3 z-10 border border-base-300/60 bg-base-100/80 text-base-content/80 shadow-lg shadow-base-content/5 backdrop-blur-md hover:bg-base-100/95 active:scale-95"
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
        <button
          type="button"
          class="btn btn-circle size-9 absolute bottom-3 left-3 z-10 ${reportMode
            ? "border border-primary bg-primary text-primary-content shadow-lg shadow-primary/30"
            : "border border-base-300/60 bg-base-100/80 text-base-content/80 shadow-lg shadow-base-content/5 backdrop-blur-md hover:bg-base-100/95 active:scale-95"}"
          aria-label=${reportMode
            ? "Cancel reporting"
            : "Report a computer issue"}
          title=${reportMode
            ? "Tap a seat to report an issue"
            : "Report a computer issue"}
          aria-pressed=${reportMode}
          @click=${toggleReportMode}
        >
          ${unsafeHTML(BUG_SVG.replace("<svg", '<svg width="18" height="18"'))}
        </button>
        ${reportMode
          ? html`<div
              class="absolute bottom-[3.25rem] left-3 z-10 rounded-full bg-base-100/90 px-2.5 py-1 text-[11px] font-medium shadow-md backdrop-blur-md"
            >
              Tap a seat to report
            </div>`
          : ""}
        ${svg
          ? html`<div
              id="ft-cluster-map"
              class="cluster-map flex-1 min-h-0"
              data-no-swipe
              aria-label="${map.label} cluster map"
            >
              ${unsafeHTML(svg)}
            </div>`
          : map.failed
            ? mapFailed(map)
            : mapLoading()}
      </div>

      ${mapExpanded
        ? ""
        : html`<div
            class="${listExpanded
              ? "absolute inset-0 flex flex-col bg-base-100 p-3"
              : "flex-30 min-h-0 flex flex-col rounded-xl bg-base-100 p-3 shadow-lg"}"
          >
            <div class="flex shrink-0 items-center justify-between gap-2 pb-1">
              <h2 class="font-semibold">Connections</h2>
              <div class="flex items-center gap-1.5">
                ${listExpanded
                  ? ""
                  : html`<button
                      type="button"
                      class="btn btn-square btn-xs border border-base-300 bg-base-100"
                      aria-label="Expand the connections list"
                      title="Expand the list"
                      @click=${toggleListExpanded}
                    >
                      ${unsafeHTML(
                        MAXIMIZE_SVG.replace(
                          "<svg",
                          '<svg width="16" height="16"',
                        ),
                      )}
                    </button>`}
                <span class="badge badge-info tabular-nums">
                  ${svg ? `${taken} / ${usable}` : "…"}
                </span>
              </div>
            </div>
            ${svg
              ? connections.length
                ? html`<div
                    class="min-h-0 flex-1 overflow-y-auto -mr-3 pr-3 ${listExpanded
                      ? "pb-10"
                      : ""}"
                    style="scrollbar-gutter:stable"
                  >
                    <ul class="flex flex-col divide-y divide-base-300">
                      ${connections.map((entry) => connectionRow(entry))}
                    </ul>
                  </div>`
                : html`<p class="py-3 text-center text-sm opacity-60">
                    No one is seated in this cluster right now.
                  </p>`
              : map.failed
                ? html`<p class="py-3 text-center text-sm opacity-60">
                    No one is seated in this cluster right now.
                  </p>`
                : rowSkeleton(3, "size-8", "")}
            ${listExpanded
              ? html`<button
                  type="button"
                  class="btn btn-square btn-sm absolute bottom-2 right-2 z-10 border border-base-300 bg-base-100/80 backdrop-blur"
                  aria-label="Restore the cluster map"
                  title="Show the map"
                  @click=${toggleListExpanded}
                >
                  ${unsafeHTML(
                    MINIMIZE_SVG.replace("<svg", '<svg width="18" height="18"'),
                  )}
                </button>`
              : ""}
          </div>`}
    </div>
  `;
}

/** Fetches the map when its tab is shown (or finishes a preload already running). */
function ensureMap(map: ClusterMapDef): void {
  if (map.failed || !isMapStale(map)) return;
  void loadClusterMap(map).then(() => refresh());
}

function mapLoading(): unknown {
  return html`<div
    class="flex min-h-0 flex-1 flex-col"
    role="status"
    aria-label="Loading the cluster map"
  >
    <div class="skeleton w-full flex-1 rounded-box"></div>
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

/** Seats on the map that have a working computer. */
function usableSeats(map: ClusterMapDef): number {
  let reportedUnusable = 0;
  for (const seat of map.seatIds) {
    if (getSeatSeverity(seat) === "blocking") reportedUnusable++;
  }
  return Math.max(0, map.seatIds.size - reportedUnusable);
}

/** The plan's exact wall drawing, scaled down to a tab icon. */
function planTabIcon(): string {
  const svg = CLUSTER_PLAN.svg;
  if (!svg) return "";
  const walls = svg.match(/<path[^>]*class="plan-wall"[^>]*\bd="([^"]+)"/);
  const viewBox = svg.match(/\bviewBox="([^"]+)"/);
  if (!walls || !viewBox) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox[1]}" width="32" height="20" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet"><path d="${walls[1]}"/></svg>`;
}

/** The Clusters bottom tab bar, rendered by the shell above the dock. */
export function clustersBottomBar(): unknown {
  const isActive = activeTab === "active";
  const online = entries.length;
  const activeTitle = isActive
    ? `Sorted by ${activeSortLabel(sortState)}${
        online ? ` · ${online} online` : ""
      } — tap to change sorting`
    : online
      ? `Active — ${online} online`
      : "Active";
  const activeIcon = isActive ? activeSortIcon(sortState) : USER_GROUP_SVG;
  return html`
    <div class="ft-subtabs flex gap-2 px-4 pb-2">
      <div class="min-w-0 flex-1 rounded-xl bg-base-100 p-1.5 shadow-lg">
        <div class="segmented-tabs-host">
          <div
            class="count-tabs flex flex-1 gap-1 rounded-lg bg-base-200 p-1"
            style="border-radius:var(--radius-field)"
            role="tablist"
            aria-label="Clusters"
          >
            <button
              role="tab"
              aria-selected=${activeTab === "plan" ? "true" : "false"}
              class="tab-btn ${activeTab === "plan" ? "active" : ""}"
              title="Campus floor plan"
              aria-label="Campus floor plan"
              @click=${() => switchTab("plan")}
            >
              <span class="tab-count tab-count-icon"
                >${unsafeHTML(planTabIcon())}</span
              >
            </button>
            ${CLUSTER_MAPS.map((m) => {
              const { seated, seats } = clusterCounts(m);
              return html`
                <button
                  role="tab"
                  aria-selected=${activeTab === m.id ? "true" : "false"}
                  class="tab-btn ${activeTab === m.id ? "active" : ""}"
                  title=${seated > 0
                    ? `${m.label} — ${seated} of ${seats} seats taken`
                    : m.label}
                  @click=${() => switchTab(m.id)}
                >
                  ${html`<span class="tab-count">${m.label}</span>`}
                  ${seated > 0
                    ? html`<span class="tab-total">${seated}/${seats}</span>`
                    : ""}
                </button>
              `;
            })}
            <button
              role="tab"
              aria-selected=${isActive ? "true" : "false"}
              class="tab-btn ${isActive ? "active" : ""}"
              title=${activeTitle}
              aria-label=${activeTitle}
              @click=${onActiveTab}
            >
              <span class="tab-count tab-count-icon"
                >${unsafeHTML(
                  activeIcon.replace("<svg", '<svg width="14" height="14"'),
                )}</span
              >
              ${online > 0
                ? html`<span class="tab-total">${online}</span>`
                : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function loadClusters(force = false): Promise<void> {
  preloadClusterMaps(force && !document.hidden, refresh);
  if (!started) {
    started = true;
    startTimers();
    void loadFriendLogins();
    await loadOccupancy();
    return;
  }
  if (force && !document.hidden) {
    loading = entries.length === 0;
    await loadOccupancy();
  }
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
/** Green rings marking friends' seats, per SVG. */
const friendRings = new WeakMap<SVGSVGElement, Map<string, SVGRectElement>>();
/** Red crosses marking seats with any broken component, per SVG. */
const brokenCrosses = new WeakMap<SVGSVGElement, Map<string, SVGPathElement>>();
/** USB-C glyphs on empty seats that reported a port, per SVG. */
const usbcBadges = new WeakMap<SVGSVGElement, Map<string, SVGGElement>>();
/** Warning triangles on seats with non-blocking defects, per SVG. */
const warningBadges = new WeakMap<SVGSVGElement, Map<string, SVGGElement>>();
/** Dashed report-mode targets over every seat, per SVG. */
const reportModeTargets = new WeakMap<
  SVGSVGElement,
  Map<string, SVGRectElement>
>();

function seatBox(img: SVGImageElement): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const read = (name: string) => Number(img.getAttribute(name));
  const x = read("x");
  const y = read("y");
  const w = read("width");
  const h = read("height");
  if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
    return { x, y, w, h };
  }
  const box = img.getBBox();
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

/** Big red cross over seats whose power/network is reported broken. */
function applyBrokenSeats(svg: SVGSVGElement): void {
  let crosses = brokenCrosses.get(svg);
  if (!crosses) {
    crosses = new Map();
    brokenCrosses.set(svg, crosses);
  }
  for (const [id, img] of mapSeatIndex(svg)) {
    // Only blocking components (power/network) cross out a seat; peripherals
    // like a sticky scroll wheel leave the computer usable.
    const broken = getSeatSeverity(id) === "blocking";
    const existing = crosses.get(id);
    if (!broken) {
      if (existing) {
        existing.remove();
        crosses.delete(id);
      }
      continue;
    }
    if (existing || !img.parentNode) continue;

    const { x, y, w, h } = seatBox(img);
    // Same inset and stroke as the builder's static `.cross` paths.
    const inset = Math.min(w, h) * 0.18;
    const x1 = x + inset;
    const y1 = y + inset;
    const x2 = x + w - inset;
    const y2 = y + h - inset;

    const cross = document.createElementNS(SVG_NS, "path");
    cross.setAttribute("class", "cross seat-report-cross");
    cross.setAttribute("data-seat", id);
    cross.setAttribute("stroke-width", "2.2");
    cross.setAttribute(
      "d",
      `M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y1} L ${x1} ${y2}`,
    );
    const transform = img.getAttribute("transform");
    if (transform) cross.setAttribute("transform", transform);

    img.parentNode.appendChild(cross);
    crosses.set(id, cross);
  }
}

let usbcTemplate: Element | null = null;

/** One shared parse of the USB-C asset, cloned per seat. */
function usbcGlyph(size: number): SVGSVGElement {
  usbcTemplate ??= new DOMParser().parseFromString(
    USBC_SVG,
    "image/svg+xml",
  ).documentElement;
  const glyph = document.importNode(
    usbcTemplate,
    true,
  ) as unknown as SVGSVGElement;
  glyph.setAttribute("width", String(size));
  glyph.setAttribute("height", String(size / 2));
  return glyph;
}

/** Little USB-C glyph on empty seats reported to have a port. */
function applyUsbcSeats(
  svg: SVGSVGElement,
  occupied: Map<string, OccupancyEntry>,
): void {
  let badges = usbcBadges.get(svg);
  if (!badges) {
    badges = new Map();
    usbcBadges.set(svg, badges);
  }
  for (const [id, img] of mapSeatIndex(svg)) {
    const show =
      !occupied.has(id) && getComponentStatus(id, "usbc")?.status === "works";
    const existing = badges.get(id);
    if (!show) {
      if (existing) {
        existing.remove();
        badges.delete(id);
      }
      continue;
    }
    if (existing || !img.parentNode) continue;

    const { x, y, w, h } = seatBox(img);
    // Both bottom badges (USB-C and warning) share the seat width: keep each
    // glyph at 35% so 2 × size + 2 × inset stays under the seat.
    const size = Math.max(8, Math.min(16, Math.min(w, h) * 0.35));
    const inset = Math.max(1, Math.min(w, h) * 0.1);

    const badge = document.createElementNS(SVG_NS, "g");
    badge.setAttribute("class", "seat-usbc-badge");
    const imageTransform = img.getAttribute("transform");
    badge.setAttribute(
      "transform",
      `${imageTransform ? `${imageTransform} ` : ""}translate(${
        x + w - size - inset
      } ${y + h - size / 2 - inset})`,
    );
    badge.appendChild(usbcGlyph(size));

    img.parentNode.insertBefore(badge, img.nextSibling);
    badges.set(id, badge);
  }
}

let warningTemplate: Element | null = null;

/** One shared parse of the warning asset, cloned per seat. */
function warningGlyph(size: number): SVGSVGElement {
  warningTemplate ??= new DOMParser().parseFromString(
    WARNING_SVG,
    "image/svg+xml",
  ).documentElement;
  const glyph = document.importNode(
    warningTemplate,
    true,
  ) as unknown as SVGSVGElement;
  glyph.setAttribute("width", String(size));
  glyph.setAttribute("height", String(size));
  return glyph;
}

/**
 * Warning triangle on seats with a reported non-blocking defect (keyboard,
 * mouse scroll, audio). Crossed seats only show the cross.
 */
function applyWarningSeats(svg: SVGSVGElement): void {
  let badges = warningBadges.get(svg);
  if (!badges) {
    badges = new Map();
    warningBadges.set(svg, badges);
  }
  for (const [id, img] of mapSeatIndex(svg)) {
    const issues =
      getSeatSeverity(id) === "blocking" ? [] : getMinorSeatIssues(id);
    const existing = badges.get(id);
    if (issues.length === 0) {
      if (existing) {
        existing.remove();
        badges.delete(id);
      }
      continue;
    }

    const tip = seatIssueTooltipHtml(issues);
    if (existing) {
      if (existing.getAttribute("data-tip-html") !== tip) {
        existing.removeAttribute("data-tip");
        existing.setAttribute("data-tip-html", tip);
      }
      continue;
    }
    if (!img.parentNode) continue;

    const { x, y, w, h } = seatBox(img);
    // Both bottom badges (USB-C and warning) share the seat width: keep each
    // glyph at 35% so 2 × size + 2 × inset stays under the seat.
    const size = Math.max(8, Math.min(16, Math.min(w, h) * 0.35));
    const inset = Math.max(1, Math.min(w, h) * 0.1);

    const badge = document.createElementNS(SVG_NS, "g");
    badge.setAttribute("class", "seat-warning-badge");
    badge.setAttribute("data-tip-html", tip);
    const imageTransform = img.getAttribute("transform");
    // The triangle asset has ~15% empty space below the glyph; drop it so its
    // visible bottom matches the USB-C badge's bottom.
    const bottom = y + h - size - inset + size * 0.15;
    badge.setAttribute(
      "transform",
      `${imageTransform ? `${imageTransform} ` : ""}translate(${x + inset} ${bottom})`,
    );
    badge.appendChild(warningGlyph(size));

    img.parentNode.insertBefore(badge, img.nextSibling);
    badges.set(id, badge);
  }
}

/** Dashed outline over every seat while the bug button is armed. */
function applyReportModeTargets(svg: SVGSVGElement): void {
  let targets = reportModeTargets.get(svg);
  if (!targets) {
    targets = new Map();
    reportModeTargets.set(svg, targets);
  }
  if (!reportMode) {
    for (const target of targets.values()) target.remove();
    targets.clear();
    return;
  }

  const seats = mapSeatIndex(svg);
  for (const [id, img] of seats) {
    if (targets.has(id) || !img.parentNode) continue;
    const { x, y, w, h } = seatBox(img);
    const target = document.createElementNS(SVG_NS, "rect");
    target.setAttribute("class", "seat-report-target");
    target.setAttribute("data-seat", id);
    target.setAttribute("x", String(x));
    target.setAttribute("y", String(y));
    target.setAttribute("width", String(w));
    target.setAttribute("height", String(h));

    const rx = img.getAttribute("rx");
    if (rx) {
      target.setAttribute("rx", rx);
    } else if ((img.getAttribute("clip-path") || "").includes("circle")) {
      target.setAttribute("rx", String(Math.min(w, h) / 2));
    }
    const transform = img.getAttribute("transform");
    if (transform) target.setAttribute("transform", transform);

    img.parentNode.insertBefore(target, img.nextSibling);
    targets.set(id, target);
  }

  for (const [id, target] of [...targets]) {
    if (seats.has(id)) continue;
    target.remove();
    targets.delete(id);
  }
}

/** Opens the component sheet for a seat long-pressed or armed by the bug button. */
function openSeatReports(seat: string): void {
  const map = findClusterMap(activeTab);
  if (!map) return;
  const entry = entries.find(
    (item) => item.host?.trim().toLowerCase() === seat,
  );
  reportMode = false;
  openSeatReportDialog({
    seat,
    cluster: map.id,
    occupant: entry?.login ?? null,
  });
  refresh();
}

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

  // Green ring around seats where a friend is sitting.
  let rings = friendRings.get(svg);
  if (!rings) {
    rings = new Map();
    friendRings.set(svg, rings);
  }
  const me = sessionLogin();
  for (const [id, img] of mapSeatIndex(svg)) {
    const entry = byHost.get(id);
    const login = entry?.login.trim().toLowerCase() ?? "";
    const isFriend = Boolean(login && login !== me && friends.has(login));
    const ring = rings.get(id);
    if (isFriend && !ring && img.parentNode) {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "seat-friend-ring");
      rect.setAttribute("data-seat", id);
      for (const name of ["x", "y", "width", "height", "rx", "transform"]) {
        const value = img.getAttribute(name);
        if (value) rect.setAttribute(name, value);
      }
      img.parentNode.insertBefore(rect, img.nextSibling);
      rings.set(id, rect);
    } else if (!isFriend && ring) {
      ring.remove();
      rings.delete(id);
    }
  }

  // USB-C glyph on empty seats that reported a port.
  applyUsbcSeats(svg, byHost);

  // Red rings for seats with a reported broken component.
  applyBrokenSeats(svg);

  // Warning triangle for non-blocking issues (keyboard, scroll, audio).
  applyWarningSeats(svg);

  // Dashed targets over every seat while report mode is armed.
  applyReportModeTargets(svg);

  attachMapGestures(mapEl, {
    onSeatTap: openSeatReports,
    interceptSeatTap: () => reportMode,
  });
}

/** Live occupancy of a cluster, shared by the tabs and the floor plan. */
function clusterCounts(map: ClusterMapDef): { seated: number; seats: number } {
  const seats = usableSeats(map);
  return { seats, seated: seats > 0 ? seatedEntries(map).length : 0 };
}

/** Paints the occupied/total count under each cluster label on the floor plan. */
function applyPlanCounts(): void {
  const mapEl = document.getElementById("ft-cluster-map");
  const svg = mapEl?.querySelector<SVGSVGElement>("svg");
  if (!svg) return;

  for (const group of svg.querySelectorAll<SVGGElement>("[data-cluster]")) {
    const id = group.getAttribute("data-cluster") ?? "";
    const map = findClusterMap(id);
    if (!map) continue;

    const label = group.querySelector<SVGTextElement>(".plan-label");
    const centerY = Number(
      label?.getAttribute("data-center-y") ?? label?.getAttribute("y") ?? 0,
    );

    let count = group.querySelector<SVGTextElement>(".plan-count");
    if (!count) {
      count = document.createElementNS(SVG_NS, "text");
      count.setAttribute("class", "plan-count");
      count.setAttribute("x", label?.getAttribute("x") ?? "0");
      group.appendChild(count);
    }
    count.setAttribute("y", String(centerY + 13));

    const { seated, seats } = clusterCounts(map);
    const visible = seated > 0 && seats > 0;
    // Keep the label itself centered when there is no count under it.
    label?.setAttribute("y", String(visible ? centerY - 13 : centerY));
    count.textContent = visible ? `${seated}/${seats}` : "";
    count.style.display = visible ? "" : "none";
  }
}

/** Called by the app after it re-renders the tab. */
export function clustersAttachObservers(): void {
  // The plan has no seats or gesture layer; only its per-cluster counts change.
  if (activeTab === "plan") {
    applyPlanCounts();
    return;
  }
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
