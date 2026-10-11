import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import { currentTab } from "../shell.ts";
import { refresh } from "../refresh.ts";
import { headerBadge, pageHeader } from "../lib/page-header.ts";
import { fetchOccupancy } from "./clusters-feature/data.ts";
import { formatTimeAgo, sortActiveUsers } from "./clusters-feature/render.ts";
import type { OccupancyEntry } from "./clusters-feature/types.ts";

type SubTab = "active" | "map";

const POLL_INTERVAL = 60_000;

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
        trailing: html`<button
          type="button"
          class="btn btn-md px-3 shrink-0 gap-1.5"
          @click=${() => loadClusters(true)}
        >
          <span class="font-semibold">Refresh</span>
          <span
            id="ft-clusters-countdown"
            class="text-xs opacity-60 tabular-nums"
            >${Math.max(
              0,
              Math.ceil((POLL_INTERVAL - (Date.now() - lastUpdated)) / 1000),
            )}s</span
          >
        </button>`,
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
  const sorted = sortActiveUsers(entries, "name", "asc", "desc");
  return html`
    <ul class="flex flex-col divide-y divide-base-300 px-4">
      ${sorted.map((e) => row(e))}
    </ul>
  `;
}

function row(e: OccupancyEntry): unknown {
  const since = new Date(e.begin_at);
  const time = since.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const ago = e.begin_at ? formatTimeAgo(since.getTime()) : "";
  return html`
    <li>
      <a
        href="https://profile.intra.42.fr/users/${e.login}"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 py-2 no-underline text-base-content"
      >
        <img
          class="size-10 rounded-full object-cover shrink-0 bg-base-200"
          src="${e.cdn_uri}"
          alt=""
          loading="lazy"
          onerror="this.style.visibility='hidden'"
        />
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">${e.login}</div>
          <div class="text-xs opacity-60 truncate">
            ${e.begin_at ? `since ${time} · ${ago}` : ""}
          </div>
        </div>
      </a>
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
              Map · Soon
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

/** Called by the app after it re-renders the tab. */
export function clustersAttachObservers(): void {
  refreshLabel();
}
