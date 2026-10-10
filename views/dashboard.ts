import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import {
  me,
  upcomingEvals,
  events,
  Me,
  UpcomingEval,
  UpcomingResponse,
  CalendarEvent,
} from "../data.ts";
import { refresh } from "../refresh.ts";
import {
  disablePush,
  enablePush,
  getExistingSubscription,
  pushSupported,
} from "../push.ts";
import { saveData } from "../lib/network.ts";
import { clearAppBadge, setAppBadge } from "../lib/badge.ts";
import { dateTimeShort } from "../lib/format.ts";
import { cursusLabel } from "../lib/cursus.ts";
import { getDoneEvals, markEvalDone, mergeEvals } from "../lib/evals.ts";
import WALLET_SVG from "../assets/wallet.svg?raw";
import EVAL_SVG from "../assets/eval.svg?raw";
import ARROW_SHARE_SVG from "../assets/arrow_share.svg?raw";
import CALENDAR_SVG from "../assets/calendar.svg?raw";
import CLOCK_SVG from "../assets/clock.svg?raw";
import CHECK_SVG from "../assets/check.svg?raw";

let meData: Me | null = null;
let upcoming: UpcomingResponse = { items: [], tracked: false };
let allEvents: CalendarEvent[] = [];
let loading = true;
let error = "";
let pushBusy = false;
let pushError = "";
let pushSubscribed: boolean | null = null;

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
  return html` ${profileCard()} ${upcomingCard()} ${eventsCard()} `;
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
  const whole = Math.floor(m.level);
  const pct = Math.round((m.level % 1) * 100);
  return html`
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body">
        <div class="flex items-center gap-4">
          ${avatarBlock()}
          <div class="min-w-0">
            <div class="font-bold text-lg truncate">${m.displayName}</div>
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
        <div class="flex items-end gap-5 mt-2">
          <h1
            class="text-5xl font-bold leading-none shrink-0"
            style="transform: scale(1.2); transform-origin: left center; color: var(--color-accent);"
          >
            ${whole}
          </h1>
          <div class="w-full flex flex-col justify-between gap-1">
            <div class="flex items-center justify-between font-bold text-sm">
              <span style="color: var(--color-accent);">${pct}%</span>
              <span class="opacity-70 truncate">${cursusLabel(m)}</span>
            </div>
            <div class="w-full h-2.5 rounded overflow-hidden bg-base-300">
              <div
                class="h-full rounded transition-all duration-1000 ease-out"
                style="width:${pct}%;background-color:var(--color-accent);"
              ></div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-1">
          ${statBadge(m.wallet.toLocaleString(), WALLET_SVG)}
          ${statBadge(String(m.correctionPoints), EVAL_SVG)}
          ${locationBadge(m.location)}
        </div>
      </div>
    </div>
  `;
}

const clusterUrl = (seat: string) =>
  `https://meta.intra.42.fr/clusters?seat=${encodeURIComponent(seat)}`;

function locationBadge(location: string | null) {
  const base =
    "badge badge-lg h-auto flex-1 justify-center gap-2 py-2 no-underline";
  if (!location) {
    return html`<div
      class="${base}"
      style="border:2px solid color-mix(in oklab, var(--color-base-content) 20%, transparent);"
    >
      <span class="font-semibold opacity-60">unavailable</span>
    </div>`;
  }
  return html`<a
    href="${clusterUrl(location)}"
    target="_blank"
    rel="noopener noreferrer"
    class="${base} text-success"
    style="border:2px solid var(--color-success);"
    data-tip="View on cluster map"
  >
    <span class="font-semibold font-mono whitespace-nowrap">${location}</span
    >${svg18(ARROW_SHARE_SVG)}
  </a>`;
}

function statBadge(value: string, icon: string) {
  return html`<div
    class="badge badge-lg h-auto flex-1 justify-center gap-2 py-2"
    style="border:2px solid var(--color-accent);"
  >
    ${svg18(icon)}<span class="font-semibold">${value}</span>
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
  return html`<img
    src="${m.image ?? "/icons/icon-192.png"}"
    onerror="this.onerror=null;this.src='/icons/icon-192.png'"
    class="w-20 h-20 rounded-full shadow-lg object-cover flex-none"
    alt=""
  />`;
}

function upcomingCard() {
  const done = new Set(getDoneEvals());
  const items = upcoming.items.filter((e) => !done.has(e.id));
  const needsPush = pushSupported() && pushSubscribed !== true;
  const evalPart =
    items.length === 0
      ? needsPush
        ? html`<div class="flex flex-col items-start gap-2 w-full">
            <p class="text-sm opacity-60">
              Enable notifications to start tracking evaluations.
            </p>
            ${enablePushBlock()}
          </div>`
        : html`<p class="text-sm opacity-60">Nothing planned right now.</p>`
      : html`<ul class="flex flex-col divide-y divide-base-300">
          ${items.map(evalRow)}
        </ul>`;
  return card(evalPart, "Upcoming");
}

function evalRow(e: UpcomingEval) {
  const started = new Date(e.beginAt).getTime() <= Date.now();
  const label =
    e.state === "revealed" && e.correcteds?.length
      ? e.correcteds.join(", ")
      : e.state === "revealed"
        ? "Revealed"
        : "Booked";
  return html`<li class="flex items-center justify-between gap-3 py-2">
    <div class="min-w-0">
      <div class="font-medium truncate">${e.project ?? ""}</div>
      <div class="text-xs opacity-60">
        ${label} · ${dateTimeShort(e.beginAt)}
      </div>
    </div>
    <div class="flex items-center gap-1 flex-none">
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
            @click=${() => {
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
      await enablePush();
      pushSubscribed = true;
      loadDashboard(true);
    } else {
      await disablePush();
      pushSubscribed = false;
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
    html`<div class="flex flex-col gap-3">${allEvents.map(eventCard)}</div>`,
    "Events",
  );
}

const TEAL = "rgb(0,186,188)";
const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

function eventCard(e: CalendarEvent) {
  const start = new Date(e.beginAt);
  const end = new Date(e.endAt);
  const weekday = start.toLocaleDateString("en-GB", { weekday: "short" });
  const day = String(start.getDate());
  const month = start.toLocaleDateString("en-GB", { month: "short" });
  const href =
    e.url ?? (e.id ? `https://events.intra.42.fr/events/${e.id}` : undefined);
  const isExam = (e.url ?? "").includes("/exams/") || /^exam/i.test(e.name);
  const accent = isExam ? "#ed8179" : TEAL;

  const cardEl = html`
    <div
      class="flex w-full h-24 rounded-2xl overflow-hidden border border-base-300 bg-base-100 shadow-sm"
    >
      <div
        class="w-20 flex-none flex flex-col items-center justify-center gap-0.5 text-white font-thin"
        style="background-color:${accent};"
      >
        <span class="text-xs">${weekday}</span>
        <span class="font-bold text-xl leading-none">${day}</span>
        <span class="text-xs">${month}</span>
      </div>
      <div class="flex-1 px-3 py-2 min-w-0 flex flex-col">
        <div
          class="font-bold text-base leading-snug line-clamp-2"
          style="color:${accent};"
        >
          ${e.name}
        </div>
        <div
          class="flex flex-row gap-4 flex-wrap items-center text-sm mt-auto"
          style="color:${accent};"
        >
          <span class="flex items-center gap-0.5"
            >${svg16(CALENDAR_SVG)}${formatDuration(start, end)}</span
          >
          <span class="flex items-center gap-0.5"
            >${svg16(CLOCK_SVG)}${eventRelative(start)}</span
          >
          ${e.location
            ? html`<span class="flex items-center gap-0.5"
                >📍 ${e.location}</span
              >`
            : ""}
        </div>
      </div>
    </div>
  `;

  return href
    ? html`<a
        href="${href}"
        target="_blank"
        rel="noopener noreferrer"
        class="no-underline"
        >${cardEl}</a
      >`
    : cardEl;
}

function formatDuration(start: Date, end: Date): string {
  const min = Math.round((end.getTime() - start.getTime()) / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

function eventRelative(d: Date): string {
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "started";
  const days = Math.floor(diff / 86400000);
  if (days === 0) {
    const h = Math.floor(diff / 3600000);
    if (h === 0) {
      const m = Math.max(1, Math.floor(diff / 60000));
      return `in ${m}m`;
    }
    return `in ${h}h`;
  }
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
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

export function loadDashboard(silent = false): void {
  if (!silent) {
    loading = true;
    error = "";
    refresh();
  }
  void refreshPushState();
  void Promise.allSettled([me(), upcomingEvals(), events()]).then(
    ([m, u, ev]) => {
      if (m.status === "fulfilled") meData = m.value;
      else if (!silent) error = friendly(m.reason);
      if (u.status === "fulfilled") {
        upcoming = { ...u.value, items: mergeEvals(u.value.items) };
        const now = Date.now();
        const booked = upcoming.items.filter(
          (i) => i.state === "booked" && new Date(i.beginAt).getTime() > now,
        ).length;
        if (booked > 0) setAppBadge(booked);
        else clearAppBadge();
      } else if (!silent) error ||= friendly(u.reason);
      if (ev.status === "fulfilled") allEvents = ev.value;
      else if (!silent) error ||= friendly(ev.reason);
      loading = false;
      refresh();
    },
  );
}

function friendly(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
