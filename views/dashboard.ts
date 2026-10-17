import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import {
  me,
  upcomingEvals,
  events,
  getBlob,
  Me,
  UpcomingEval,
  UpcomingResponse,
  CalendarEvent,
} from "../data.ts";
import { refresh } from "../refresh.ts";
import { currentTab, navigate } from "../shell.ts";
import { getSession } from "../api.ts";
import { readScopedCache, writeCache } from "../lib/cache.ts";
import { isRetryableError, friendlyError, Retrier } from "../lib/retry.ts";
import { switchSubTab } from "./profile.ts";
import {
  disablePush,
  enablePushWithTest,
  getExistingSubscription,
  pushSupported,
  syncEvalTracking,
} from "../push.ts";
import { saveData } from "../lib/network.ts";
import { AVATARS_ENABLED, initialsAvatar } from "../lib/avatar.ts";
import { clearAppBadge, setAppBadge } from "../lib/badge.ts";
import { dateTimeShort } from "../lib/format.ts";
import { getDoneEvals, markEvalDone, mergeEvals } from "../lib/evals.ts";
import { openEvalDialog } from "./eval-dialog.ts";
import { openEventDialog } from "./event-dialog.ts";
import WALLET_SVG from "../assets/wallet.svg?raw";
import EVAL_SVG from "../assets/eval.svg?raw";
import STAR_SVG from "../assets/star-lucide.svg?raw";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import CLOCK_SVG from "../assets/clock.svg?raw";
import CHECK_SVG from "../assets/check.svg?raw";
import X_SVG from "../assets/x.svg?raw";
import INFO_SVG from "../assets/info.svg?raw";

let meData: Me | null = null;
let upcoming: UpcomingResponse = { items: [], tracked: false };
let allEvents: CalendarEvent[] = [];
let loading = true;
let error = "";
let stale = false;
let pushBusy = false;
let pushError = "";
let pushSubscribed: boolean | null = null;
/** User's profile color (synced custom color), used for the stat badges. */
let profileColor = "#00BABC";

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function resolveProfileColor(settings: Record<string, unknown>): string {
  const custom =
    typeof settings.LOGTIME_CALENDAR_COLOR === "string"
      ? settings.LOGTIME_CALENDAR_COLOR.trim()
      : "";
  return settings.PROFILE_USE_CUSTOM_COLOR === true && HEX_COLOR.test(custom)
    ? custom
    : "#00BABC";
}

const svg18 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="18" height="18"'));

export function dashboardView(): unknown {
  if (loading)
    return card(
      html`<div class="flex justify-center py-10">
        <span class="loading loading-spinner loading-lg"></span>
      </div>`,
    );
  if (error) {
    return html`
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body items-center gap-3">
          <p class="text-sm opacity-70">Couldn't load your dashboard.</p>
          <p class="text-xs text-error">${error}</p>
          <button
            class="btn btn-sm btn-outline"
            @click=${() => loadDashboard()}
          >
            Retry
          </button>
        </div>
      </div>
    `;
  }
  return html`
    ${stale ? staleBanner() : ""} ${profileCard()} ${upcomingCard()}
    ${liveEventsCard()} ${projectsCard()} ${eventsCard()}
  `;
}

function staleBanner() {
  return html`<div class="alert alert-warning alert-soft mb-4 py-2 text-sm">
    <span class="flex-1">Couldn't refresh — showing saved data.</span>
    <button class="btn btn-xs btn-outline" @click=${() => loadDashboard(true)}>
      Retry
    </button>
  </div>`;
}

function card(content: unknown, title?: string) {
  return html`
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body">
        ${title ? html`<h2 class="card-title text-base">${title}</h2>` : ""}
        ${content}
      </div>
    </div>
  `;
}

function profileCard() {
  const m = meData!;
  return html`
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body">
        <div class="flex items-center gap-4">
          ${avatarBlock()}
          <div class="min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-bold text-lg truncate">${m.displayName}</span>
              <span
                class="status ${m.location
                  ? "status-success"
                  : "status-error"} shrink-0"
                title="${m.location ? `Online · ${m.location}` : "Offline"}"
              ></span>
            </div>
            <div class="text-sm opacity-60 truncate">${m.login}</div>
            ${(m.groups ?? []).length
              ? html`<div
                  class="flex gap-2 mt-2 overflow-x-auto pb-1"
                  data-no-swipe
                >
                  ${(m.groups ?? []).map(
                    (g) =>
                      html`<span
                        class="badge badge-lg badge-primary font-semibold flex-none whitespace-nowrap"
                        >${g}</span
                      >`,
                  )}
                </div>`
              : ""}
          </div>
        </div>
        <div class="flex gap-2 mt-2">
          ${statBadge(m.level.toFixed(2), STAR_SVG)}
          ${statBadge(m.wallet.toLocaleString(), WALLET_SVG)}
          ${statBadge(String(m.correctionPoints), EVAL_SVG)}
        </div>
      </div>
    </div>
  `;
}

function statBadge(value: string, icon?: string) {
  return html`<div
    class="badge badge-lg h-auto flex-1 justify-center gap-2 py-2"
    style="border:2px solid ${profileColor};"
  >
    ${icon ? svg18(icon) : ""}<span class="font-semibold">${value}</span>
  </div>`;
}

function projectsCard() {
  if (!meData) return "";
  const p = meData.projects;
  return html`<div
    class="card bg-base-100 shadow-xl mb-4 cursor-pointer hover:brightness-105 transition-all"
    @click=${() => {
      switchSubTab("projects");
      navigate("profile");
    }}
  >
    <div class="card-body">
      <h2 class="card-title text-base">Projects</h2>
      <div class="flex gap-2">
        ${projectStat("Validated", p.validated)}
        ${projectStat("In progress", p.inProgress)}
        ${projectStat("Total", p.total)}
      </div>
    </div>
  </div>`;
}

function projectStat(label: string, value: number) {
  return html`<div
    class="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-lg py-2"
    style="border:2px solid ${profileColor};background:color-mix(in oklab, ${profileColor} 12%, transparent);"
  >
    <span class="text-xs font-medium opacity-70">${label}</span>
    <span class="text-lg font-bold leading-none">${value}</span>
  </div>`;
}

function avatarBlock() {
  const m = meData!;
  if (saveData) {
    return html`<div
      class="w-20 h-20 rounded-full shadow-lg flex-none bg-base-300 flex items-center justify-center text-2xl font-bold"
    >
      ${m.login[0]?.toUpperCase() ?? "?"}
    </div>`;
  }
  if (m.customAvatar) {
    return html`<div
      class="w-20 h-20 rounded-full shadow-lg flex-none"
      style="background-image:url('${m.customAvatar}');background-size:${m.avatarScale}%;background-position:${m.avatarPosX}% ${m.avatarPosY}%;background-color:${m.avatarBg};background-repeat:no-repeat;"
    ></div>`;
  }
  if (!AVATARS_ENABLED) {
    return initialsAvatar(m.login, "w-20 h-20 shadow-lg flex-none text-2xl");
  }
  return html`<img
    src="${m.image ?? "/icons/icon-192.png"}"
    onerror="this.onerror=null;this.src='/icons/icon-192.png'"
    referrerpolicy="no-referrer"
    class="w-20 h-20 rounded-full shadow-lg object-cover flex-none"
    alt=""
  />`;
}

let upcomingTab: "evaluator" | "corrected" | null = null;

function upcomingCard() {
  const done = new Set(getDoneEvals());
  const items = upcoming.items.filter((e) => !done.has(e.id));
  const needsPush = pushSupported() && pushSubscribed !== true;

  if (items.length === 0) {
    return needsPush
      ? card(
          html`<div class="flex flex-col items-start gap-2 w-full">
            <p class="text-sm opacity-60">
              Enable notifications to start tracking evaluations.
            </p>
            ${enablePushBlock()}
          </div>`,
          "Upcoming",
        )
      : "";
  }

  const evaluating = items.filter((e) => e.role !== "corrected");
  const corrected = items.filter((e) => e.role === "corrected");
  const showTabs = evaluating.length > 0 && corrected.length > 0;
  let active: "evaluator" | "corrected" =
    upcomingTab ?? (evaluating.length > 0 ? "evaluator" : "corrected");
  if (active === "evaluator" && evaluating.length === 0) active = "corrected";
  if (active === "corrected" && corrected.length === 0) active = "evaluator";
  const list = active === "evaluator" ? evaluating : corrected;

  const tab = (id: "evaluator" | "corrected", label: string, count: number) =>
    html`<button
      type="button"
      class="flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors ${active ===
      id
        ? "bg-primary text-primary-content"
        : "text-base-content/70 hover:bg-base-300"}"
      @click=${() => {
        upcomingTab = id;
        refresh();
      }}
    >
      <span>${label}</span>
      <span
        class="min-w-5 rounded-full px-1.5 text-xs font-bold ${active === id
          ? "bg-primary-content/20"
          : "bg-base-300"}"
        >${count}</span
      >
    </button>`;

  const evalPart = html`
    ${showTabs
      ? html`<div class="flex gap-1 rounded-lg bg-base-200 p-1 mb-2">
          ${tab("evaluator", "Evaluating", evaluating.length)}
          ${tab("corrected", "Being evaluated", corrected.length)}
        </div>`
      : ""}
    <ul class="flex flex-col divide-y divide-base-300">
      ${list.map(evalRow)}
    </ul>
  `;
  return card(evalPart, "Upcoming");
}

function evalRow(e: UpcomingEval) {
  const started = new Date(e.beginAt).getTime() <= Date.now();
  const isCorrected = e.role === "corrected";
  const person =
    e.state === "revealed"
      ? isCorrected
        ? (e.corrector ?? undefined)
        : e.correcteds?.[0]
      : undefined;
  const label = person ?? (e.state === "revealed" ? "Revealed" : "Booked");
  return html`<li
    class="flex items-center justify-between gap-3 py-2 ${person
      ? "cursor-pointer -mx-2 px-2 rounded-lg hover:bg-base-200 transition-colors"
      : ""}"
    @click=${person ? () => openEvalDialog(e, person) : undefined}
  >
    <div class="min-w-0">
      <div class="font-medium truncate">${e.project ?? "Evaluation"}</div>
      <div class="text-xs opacity-60">
        ${label} · ${dateTimeShort(e.beginAt)}
      </div>
    </div>
    <div class="flex items-center gap-1 flex-none">
      ${person
        ? html`<button
            type="button"
            class="btn btn-ghost btn-xs btn-circle text-info"
            title="View details"
            @click=${(ev: Event) => {
              ev.stopPropagation();
              openEvalDialog(e, person);
            }}
          >
            ${svg18(INFO_SVG)}
          </button>`
        : ""}
      <span
        class="badge badge-lg whitespace-nowrap ${e.state === "revealed"
          ? "badge-success"
          : "badge-warning"}"
        >${countdown(e.beginAt)}</span
      >
      ${started
        ? html`<button
            class="badge badge-lg badge-outline badge-success text-success cursor-pointer"
            title="Mark as done"
            @click=${(ev: Event) => {
              ev.stopPropagation();
              markEvalDone(e.id);
              refresh();
            }}
          >
            ${svg18(CHECK_SVG)}
          </button>`
        : ""}
    </div>
  </li>`;
}

function enablePushBlock() {
  if (!pushSupported()) return "";
  return html`
    <label
      class="flex items-center justify-between gap-3 cursor-pointer w-full"
    >
      <span>Enable notifications</span>
      <input
        type="checkbox"
        class="toggle toggle-primary"
        .checked=${pushSubscribed === true}
        ?disabled=${pushBusy}
        @change=${onTogglePush}
      />
    </label>
    ${pushError ? html`<p class="text-xs text-warning">${pushError}</p>` : ""}
  `;
}

async function onTogglePush(e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  pushBusy = true;
  pushError = "";
  refresh();
  try {
    if (on) {
      const res = await enablePushWithTest();
      pushSubscribed = res.delivered;
      if (!res.delivered) {
        pushError = `Couldn't deliver a test notification${
          res.host ? ` via ${res.host}` : ""
        }${res.reason ? ` (${res.reason})` : ""}. Notifications stay off.`;
      } else {
        if (!res.tracked) {
          pushError = "Notifications work, but eval tracking is unavailable.";
        }
        loadDashboard(true);
      }
    } else {
      await disablePush();
      pushSubscribed = false;
      void syncEvalTracking(false);
    }
  } catch (err) {
    pushError =
      err instanceof Error && err.message === "permission_denied"
        ? "Notifications permission was denied."
        : "Could not update notifications.";
  } finally {
    pushBusy = false;
    refresh();
  }
}

async function refreshPushState(): Promise<void> {
  if (!pushSupported()) {
    pushSubscribed = false;
    return;
  }
  const sub = await getExistingSubscription();
  pushSubscribed = Boolean(sub);
  refresh();
}

function eventsCard() {
  if (allEvents.length === 0) {
    return card(
      html`<div class="flex flex-col items-center text-center gap-2 py-2">
        <p class="font-bold text-lg" style="color:${TEAL};">Calendar</p>
        <p class="text-sm opacity-70">
          No subscribed events yet. Open the extension hub → Calendar to sync
          your events.
        </p>
      </div>`,
      "Events",
    );
  }
  return card(
    html`<ul class="list">
      ${allEvents.map(eventRow)}
    </ul>`,
    "Events",
  );
}

const TEAL = "rgb(0,186,188)";
const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

const DISMISSED_EVENTS_KEY = "ft_dismissed_events";

function getDismissedEvents(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_EVENTS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function dismissEvent(id: number | null): void {
  if (id == null) return;
  const set = getDismissedEvents();
  set.add(String(id));
  try {
    localStorage.setItem(DISMISSED_EVENTS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
  refresh();
}

/** Events that are ongoing, start soon, or happen today/tomorrow. */
function isCloseEvent(e: CalendarEvent): boolean {
  const now = new Date();
  if (new Date(e.endAt).getTime() <= now.getTime()) return false;
  const endOfTomorrow = new Date(now);
  endOfTomorrow.setDate(now.getDate() + 2);
  endOfTomorrow.setHours(0, 0, 0, 0);
  return new Date(e.beginAt).getTime() < endOfTomorrow.getTime();
}

function closeStatus(start: Date, end: Date): { text: string; cls: string } {
  const now = new Date();
  if (now >= start && now < end)
    return { text: "Happening now", cls: "badge-success" };
  if (start.toDateString() === now.toDateString()) {
    const mins = Math.max(
      1,
      Math.round((start.getTime() - now.getTime()) / 60000),
    );
    return {
      text:
        mins < 60
          ? `Starts in ${mins} min`
          : `Starts in ${Math.floor(mins / 60)}h`,
      cls: "badge-warning",
    };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (start.toDateString() === tomorrow.toDateString())
    return { text: "Tomorrow", cls: "badge-info" };
  return { text: "Soon", cls: "badge-info" };
}

/** Highlights events that are ongoing or happening today/tomorrow, above the Upcoming card. */
function liveEventsCard(): unknown {
  const dismissed = getDismissedEvents();
  const live = allEvents.filter(
    (e) => isCloseEvent(e) && !dismissed.has(String(e.id)),
  );
  if (live.length === 0) return "";
  return html`<div class="flex flex-col gap-3 mb-4">
    ${live.map((e) => {
      const start = new Date(e.beginAt);
      const end = new Date(e.endAt);
      const isExam = (e.url ?? "").includes("/exams/") || /^exam/i.test(e.name);
      const status = closeStatus(start, end);
      const inner = html`
        <div class="card-body p-4 gap-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="badge ${status.cls} badge-sm font-semibold"
                >${status.text}</span
              >
            </div>
            <button
              type="button"
              class="badge badge-lg badge-outline badge-error text-error cursor-pointer shrink-0 -mr-1 -mt-1"
              title="Hide this event"
              @click=${(ev: Event) => {
                ev.preventDefault();
                ev.stopPropagation();
                dismissEvent(e.id);
              }}
            >
              ${svg18(X_SVG)}
            </button>
          </div>
          <div class="font-semibold leading-snug ${isExam ? "text-error" : ""}">
            ${e.name}
          </div>
          <div
            class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-60"
          >
            <span class="flex items-center gap-1"
              >${svg16(CLOCK_SVG)}${pad2(start.getHours())}:${pad2(
                start.getMinutes(),
              )}–${pad2(end.getHours())}:${pad2(end.getMinutes())}</span
            >
            ${e.location
              ? html`<span class="flex items-center gap-1"
                  >${svg16(MAP_PIN_SVG)}${e.location}</span
                >`
              : ""}
          </div>
        </div>
      `;
      return html`<div
        class="card bg-base-100 shadow-xl border-2 cursor-pointer hover:brightness-105 transition-all ${isExam
          ? "border-error"
          : "border-primary"}"
        @click=${() => openEventDialog(e)}
      >
        ${inner}
      </div>`;
    })}
  </div>`;
}

function eventRow(e: CalendarEvent) {
  const start = new Date(e.beginAt);
  const end = new Date(e.endAt);
  const isExam = (e.url ?? "").includes("/exams/") || /^exam/i.test(e.name);
  const weekday = start.toLocaleDateString("en-GB", { weekday: "short" });
  const day = String(start.getDate());
  const timeRange = `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;

  const content = html`
    <div
      class="w-12 self-stretch flex-none rounded-box border-2 flex flex-col items-center justify-center ${isExam
        ? "border-error text-error"
        : "border-primary text-primary"}"
    >
      <span class="text-[10px] font-semibold uppercase leading-none opacity-70"
        >${weekday}</span
      >
      <span class="text-lg font-bold leading-none">${day}</span>
    </div>
    <div class="min-w-0 flex flex-col justify-center gap-0.5 min-h-[3.5rem]">
      <div class="font-semibold truncate ${isExam ? "text-error" : ""}">
        ${e.name}
      </div>
      <div class="flex items-center gap-1 text-xs opacity-60 min-w-0">
        ${svg16(CLOCK_SVG)}${timeRange} · ${formatDuration(start, end)}
      </div>
      ${e.location
        ? html`<div class="flex items-center gap-1 text-xs opacity-60 min-w-0">
            ${svg16(MAP_PIN_SVG)}<span class="truncate">${e.location}</span>
          </div>`
        : ""}
    </div>
  `;

  return html`<li
    class="list-row px-0 cursor-pointer hover:bg-base-200 transition-colors"
    @click=${() => openEventDialog(e)}
  >
    ${content}
  </li>`;
}

function formatDuration(start: Date, end: Date): string {
  const min = Math.round((end.getTime() - start.getTime()) / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) {
    const totalMin = Math.floor(-diff / 60000);
    if (totalMin < 1) return "now";
    if (totalMin < 60) return `${totalMin}m ago`;
    const h = Math.floor(totalMin / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 60) return `in ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `in ${h}h ${pad2(m)}m` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}

const DASHBOARD_CACHE = "dashboard";
const CACHE_VERSION = 1;

interface DashboardCache {
  v: number;
  login: string;
  me: Me;
  upcoming: UpcomingResponse;
  events: CalendarEvent[];
  profileColor: string;
}

export function hydrateDashboardCache(): void {
  const cached = readScopedCache<DashboardCache>(DASHBOARD_CACHE);
  if (!cached || cached.v !== CACHE_VERSION) return;
  meData = cached.me;
  upcoming = { ...cached.upcoming, items: mergeEvals(cached.upcoming.items) };
  allEvents = cached.events;
  if (cached.profileColor) profileColor = cached.profileColor;
  loading = false;
}

function writeDashboardCache(): void {
  const session = getSession();
  if (!session || !meData) return;
  writeCache(DASHBOARD_CACHE, {
    v: CACHE_VERSION,
    login: session.login,
    me: meData,
    upcoming,
    events: allEvents,
    profileColor,
  } satisfies DashboardCache);
}

const retrier = new Retrier(
  () => loadDashboard(true),
  () => currentTab() === "dashboard" && document.visibilityState === "visible",
);

export function loadDashboard(silent = false): void {
  if (!silent) {
    if (!meData) loading = true;
    error = "";
    refresh();
  }
  void refreshPushState();
  void Promise.allSettled([me(), upcomingEvals(), events(), getBlob()]).then(
    ([m, u, ev, bl]) => {
      if (bl.status === "fulfilled")
        profileColor = resolveProfileColor(bl.value.settings ?? {});
      let failure: unknown = null;
      if (m.status === "fulfilled") meData = m.value;
      else failure = m.reason;
      if (u.status === "fulfilled") {
        upcoming = { ...u.value, items: mergeEvals(u.value.items) };
        const now = Date.now();
        const booked = upcoming.items.filter(
          (i) => i.state === "booked" && new Date(i.beginAt).getTime() > now,
        ).length;
        if (booked > 0) setAppBadge(booked);
        else clearAppBadge();
      } else failure ||= u.reason;
      if (ev.status === "fulfilled") allEvents = ev.value;
      else failure ||= ev.reason;
      loading = false;

      if (failure && !meData) {
        error = friendlyError(failure);
      } else {
        error = "";
        writeDashboardCache();
      }
      stale = Boolean(failure) && Boolean(meData);

      if (failure && isRetryableError(failure)) retrier.schedule();
      else retrier.reset();
      refresh();
    },
  );
}
