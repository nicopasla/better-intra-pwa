import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import USER_GROUP_SVG from "../assets/user-round-group.svg?raw";
import FRIEND_SVG from "../assets/face-slightly-smiling-plus.svg?raw";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import SHARE_SVG from "../assets/share.svg?raw";
import MAXIMIZE_SVG from "../assets/maximize.svg?raw";
import MINIMIZE_SVG from "../assets/minimize.svg?raw";
import { currentTab } from "../shell.ts";
import { getSession } from "../api.ts";
import { refresh } from "../refresh.ts";
import { getBlob } from "../data.ts";
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
  findClusterMap,
  findDefaultClusterMap,
  isMapStale,
  loadClusterMap,
  preloadClusterMaps,
} from "./clusters-feature/maps.ts";
import { formatTimeAgo, sortActiveUsers } from "./clusters-feature/render.ts";
import {
  activeSortIcon,
  activeSortLabel,
  cycleActiveSort,
  loadActiveSort,
} from "./clusters-feature/sort.ts";
import type { ClusterMapDef } from "./clusters-feature/maps.ts";
import type { OccupancyEntry } from "./clusters-feature/types.ts";

const POLL_INTERVAL = 60_000;

/** Long-press state for connection rows (opens the seat sheet). */
let rowPressTimer: ReturnType<typeof setTimeout> | null = null;
let rowPressStart: { x: number; y: number } | null = null;
let suppressRowClick = false;

function clearRowPress(): void {
  if (rowPressTimer != null) {
    clearTimeout(rowPressTimer);
    rowPressTimer = null;
  }
  rowPressStart = null;
}

function startRowPress(ev: PointerEvent, host: string): void {
  if (ev.pointerType === "mouse" && ev.button !== 0) return;
  clearRowPress();
  rowPressStart = { x: ev.clientX, y: ev.clientY };
  rowPressTimer = setTimeout(() => {
    rowPressTimer = null;
    rowPressStart = null;
    suppressRowClick = true;
    // If no click follows (e.g. the sheet took over), don't swallow the next one.
    window.setTimeout(() => {
      suppressRowClick = false;
    }, 800);
    navigator.vibrate?.(12);
    openSeatSheet(host);
  }, 450);
}

function moveRowPress(ev: PointerEvent): void {
  if (!rowPressStart || rowPressTimer == null) return;
  if (
    Math.hypot(ev.clientX - rowPressStart.x, ev.clientY - rowPressStart.y) > 8
  ) {
    clearRowPress();
  }
}

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
  if (id !== "active" && !findClusterMap(id)) return;
  // Switching rooms drops any seat focus and returns the map to the fit view.
  const currentMap = document.getElementById("ft-cluster-map");
  if (currentMap) resetMapZoom(currentMap);
  focusSeat = null;
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

function refreshLabel(): void {
  const el = document.getElementById("ft-clusters-countdown");
  if (!el) return;
  if (!lastUpdated) {
    el.textContent = "…";
    return;
  }
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
          @pointerdown=${(ev: PointerEvent) => startRowPress(ev, e.host)}
          @pointermove=${moveRowPress}
          @pointerup=${clearRowPress}
          @pointercancel=${clearRowPress}
          @pointerleave=${clearRowPress}
          @contextmenu=${(ev: Event) => ev.preventDefault()}
          @click=${(ev: Event) => {
            if (!suppressRowClick) return;
            suppressRowClick = false;
            ev.preventDefault();
          }}
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
        <span class="flex shrink-0 items-center gap-1.5">
          <span class="badge badge-success badge-lg">${e.host}</span>
          ${e.begin_at
            ? html`<span
                class="badge badge-success badge-lg tabular-nums"
                title="${tooltip}"
                >${time}</span
              >`
            : ""}
        </span>
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

/** Bottom sheet opened by long-pressing a seat on the map. */
function openSeatSheet(seat: string): void {
  document.getElementById("ft-seat-sheet")?.remove();

  const entry = entries.find(
    (e) => (e.host || "").trim().toLowerCase() === seat.trim().toLowerCase(),
  );
  const avatar = entry
    ? ((showCustomAvatars() ? customAvatarUrl(entry.custom_avatar) : null) ??
      entry.avatar_url ??
      (mockMode ? entry.cdn_uri : null) ??
      initialAvatarDataUrl(entry.login))
    : null;
  const dialog = document.createElement("dialog");
  dialog.id = "ft-seat-sheet";
  dialog.className = "modal modal-bottom";

  render(
    html`
      <div class="modal-box">
        <div class="flex items-center gap-3">
          ${avatar
            ? html`<img
                class="size-11 shrink-0 rounded-full bg-base-200 object-cover"
                src="${avatar}"
                alt=""
                referrerpolicy="no-referrer"
              />`
            : html`<span
                class="flex size-11 shrink-0 items-center justify-center rounded-full bg-base-200 opacity-60"
                aria-hidden="true"
                >${unsafeHTML(
                  MAP_PIN_SVG.replace("<svg", '<svg width="20" height="20"'),
                )}</span
              >`}
          <h3 class="min-w-0 flex-1 truncate font-semibold">
            ${entry ? entry.name || entry.login : "Empty seat"}
          </h3>
          <span
            class="badge badge-info badge-md shrink-0 font-semibold tabular-nums"
            >${seat}</span
          >
        </div>

        <div class="modal-action mt-4 flex-nowrap gap-2">
          <form method="dialog" class="flex-[1]">
            <button class="btn btn-error w-full">Close</button>
          </form>
          <button
            type="button"
            class="btn btn-primary flex-[2] gap-1.5"
            @click=${() => {
              void shareSeat(seat).finally(() => dialog.close());
            }}
          >
            ${unsafeHTML(
              SHARE_SVG.replace("<svg", '<svg width="18" height="18"'),
            )}
            Share
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    `,
    dialog,
  );
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

async function shareSeat(host: string): Promise<void> {
  const url = seatLink(host);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${host} on the cluster map`, url });
      return;
    } catch {
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    /* clipboard unavailable */
  }
}

function seatLink(host: string): string {
  return `https://mobile.betterintra.com/#/clusters?seat=${encodeURIComponent(
    host,
  )}`;
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
        @pointerdown=${(ev: PointerEvent) => startRowPress(ev, entry.host)}
        @pointermove=${moveRowPress}
        @pointerup=${clearRowPress}
        @pointercancel=${clearRowPress}
        @pointerleave=${clearRowPress}
        @contextmenu=${(ev: Event) => ev.preventDefault()}
        @click=${(ev: Event) => {
          if (!suppressRowClick) return;
          suppressRowClick = false;
          ev.preventDefault();
        }}
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

function mapView(map: ClusterMapDef): unknown {
  ensureMap(map);
  const seated = seatedEntries(map);
  const connections = connectionList(seated);
  const taken = seated.length;
  const svg = map.svg;
  const usable = usableSeats(map);
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
        class="${listExpanded
          ? "hidden"
          : mapExpanded
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
                <span class="badge badge-info tabular-nums" title="${deadNote}">
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
  return Math.max(0, map.seatIds.size - map.crossed);
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
            class="clusters-tabs flex flex-1 gap-1 rounded-lg bg-base-200 p-1"
            style="border-radius:var(--radius-field)"
            role="tablist"
            aria-label="Clusters"
          >
            ${CLUSTER_MAPS.map((m) => {
              const seats = usableSeats(m);
              const seated = seats > 0 ? seatedEntries(m).length : 0;
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
                  ${m.label}
                  ${seated > 0
                    ? html`<span class="tab-count">${seated}/${seats}</span>`
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
              <span class="tab-icon"
                >${unsafeHTML(
                  activeIcon.replace("<svg", '<svg width="14" height="14"'),
                )}</span
              >
              ${online > 0
                ? html`<span class="tab-count">${online}</span>`
                : ""}
            </button>
          </div>
        </div>
      </div>
      <div class="flex shrink-0 rounded-xl bg-base-100 p-1.5 shadow-lg">
        <span
          id="ft-clusters-countdown"
          class="clusters-refresh"
          title="Auto-refreshes every minute"
        ></span>
      </div>
    </div>
  `;
}

export async function loadClusters(force = false): Promise<void> {
  preloadClusterMaps(force && !document.hidden);
  if (!started) {
    started = true;
    startTimers();
    void loadFriendLogins();
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
  if (!map) return;
  activeTab = map.id;
  refresh();
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

  attachMapGestures(mapEl);
}

/** Called by the app after it re-renders the tab. */
export function clustersAttachObservers(): void {
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
