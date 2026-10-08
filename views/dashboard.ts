import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { me, upcomingEvals, profileStats, events, Me, UpcomingResponse, EvalStats, CalendarEvent } from "../data.ts";
import { refresh } from "../refresh.ts";
import { saveData } from "../lib/network.ts";
import { clearAppBadge, setAppBadge } from "../lib/badge.ts";
import { clockTime, fullDate } from "../lib/format.ts";
import WALLET_SVG from "../assets/wallet.svg?raw";
import EVAL_SVG from "../assets/eval.svg?raw";
import ARROW_SHARE_SVG from "../assets/arrow_share.svg?raw";

let meData: Me | null = null;
let upcoming: UpcomingResponse = { items: [], tracked: false };
let evalStats: EvalStats | null = null;
let soonEvents: CalendarEvent[] = [];
let loading = true;
let error = "";

const svg18 = (raw: string) => unsafeHTML(raw.replace("<svg", '<svg width="18" height="18"'));

export function dashboardView(): unknown {
  if (loading) return card(html`<div class="flex justify-center py-10"><span class="loading loading-spinner loading-lg"></span></div>`);
  if (error) {
    return html`
      <div class="card bg-base-100 shadow-xl"><div class="card-body items-center gap-3">
        <p class="text-sm opacity-70">Couldn't load your dashboard.</p>
        <p class="text-xs text-error">${error}</p>
        <button class="btn btn-sm btn-outline" @click=${() => loadDashboard()}>Retry</button>
      </div></div>
    `;
  }
  return html`
    ${profileCard()}
    ${upcomingCard()}
    ${evalCard()}
  `;
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
      <div class="card-body gap-4">
        <div class="flex items-center gap-4">
          ${avatarBlock()}
          <div class="min-w-0">
            <div class="font-bold text-lg truncate">${m.displayName}</div>
            <div class="text-sm opacity-60 truncate">@${m.login}</div>
          </div>
        </div>
        <div class="flex items-end gap-5">
          <h1
            class="text-5xl font-bold drop-shadow-md leading-none shrink-0"
            style="transform: scale(1.2); transform-origin: left center; color: var(--color-accent);"
          >
            ${whole}
          </h1>
          <div class="w-full flex flex-col justify-between gap-1">
            <div class="flex items-center justify-between font-bold text-sm">
              <span style="color: var(--color-accent);">${pct}%</span>
              <span class="opacity-70 truncate">${m.grade ?? "42cursus"}</span>
            </div>
            <div class="w-full h-2.5 rounded overflow-hidden bg-base-300">
              <div
                class="h-full rounded transition-all duration-1000 ease-out"
                style="width:${pct}%;background-color:var(--color-accent);"
              ></div>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
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
    <span class="font-semibold font-mono">${location}</span
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
      class="w-16 h-16 rounded-2xl shadow-lg flex-none bg-base-300 flex items-center justify-center text-xl font-bold"
    >
      ${m.login[0]?.toUpperCase() ?? "?"}
    </div>`;
  }
  if (m.customAvatar) {
    return html`<div
      class="w-16 h-16 rounded-2xl shadow-lg flex-none"
      style="background-image:url('${m.customAvatar}');background-size:${m.avatarScale}%;background-position:${m.avatarPosX}% ${m.avatarPosY}%;background-color:${m.avatarBg};background-repeat:no-repeat;"
    ></div>`;
  }
  return html`<img
    src="${m.image ?? "/icons/icon-192.png"}"
    onerror="this.onerror=null;this.src='/icons/icon-192.png'"
    class="w-16 h-16 rounded-2xl shadow-lg object-cover flex-none"
    alt=""
  />`;
}

function evalCard() {
  const g = evalStats!.global;
  const ok = g.successPercentage !== null && g.successPercentage >= 67;
  const successColor = ok ? "rgb(34,197,94)" : "rgb(239,68,68)";
  return card(html`
    <div class="flex items-center justify-end gap-2">
      ${g.successPercentage !== null
        ? html`<span
            class="text-xl font-bold px-5 py-2 rounded-xl"
            style="color:${successColor};background:${tint(successColor)};"
            >${g.successPercentage}%</span
          >`
        : ""}
      ${pill("total", String(g.total), "rgb(59,130,246)", true)}
      ${pill("failed", String(g.failed), "rgb(239,68,68)", true)}
    </div>
  `, "Evaluations");
}

function tint(rgb: string): string {
  return rgb.replace(/^rgb\(/, "rgba(").replace(/\)$/, ",0.1)");
}

function pill(label: string, value: string, color: string, compact = false) {
  return html`<span
    class="inline-flex items-center gap-1.5 ${compact ? "px-3 py-1.5" : "px-4 py-2"} rounded-xl"
    style="color:${color};background:${tint(color)};"
  >
    <span class="text-sm font-semibold opacity-70 uppercase tracking-wide">${label}</span>
    <span class="text-xl font-bold">${value}</span>
  </span>`;
}

function upcomingCard() {
  const items = upcoming.items;
  const evalPart =
    items.length === 0
      ? html`<p class="text-sm opacity-60">
          ${upcoming.tracked
            ? "Nothing planned right now."
            : "Enable notifications to start tracking evaluations."}
        </p>`
      : html`<ul class="flex flex-col divide-y divide-base-300">
          ${items.map(
            (e) => html`<li class="flex items-center justify-between gap-3 py-2">
              <div class="min-w-0">
                <div class="font-medium truncate">${e.project ?? "Evaluation"}</div>
                <div class="text-xs opacity-60">
                  ${e.state === "revealed" ? "Correctors revealed" : "Booked"} · ${clockTime(e.beginAt)}
                </div>
              </div>
              <span
                class="badge badge-lg whitespace-nowrap ${e.state === "revealed" ? "badge-success" : "badge-warning"}"
              >${countdown(e.beginAt)}</span>
            </li>`,
          )}
        </ul>`;
  const soon = soonEvents
    .filter((e) => {
      const diff = new Date(e.beginAt).getTime() - Date.now();
      return diff >= 0 && diff <= 48 * 3600 * 1000;
    })
    .sort((a, b) => a.beginAt.localeCompare(b.beginAt));
  const eventsPart = soon.length
    ? html`
        <div class="divider my-1"></div>
        <div class="flex items-center gap-1.5 mb-1">
          <span style="width:0.6rem;height:0.6rem;border-radius:9999px;background-color:rgb(0,186,188);"></span>
          <span class="font-semibold text-sm" style="color:rgb(0,186,188);">Events</span>
        </div>
        <ul class="flex flex-col gap-2">
          ${soon.slice(0, 3).map((e) => {
            const href =
              e.url ??
              (e.id ? `https://events.intra.42.fr/events/${e.id}` : undefined);
            const row = html`<span class="truncate font-medium">${e.name}</span>
              <span class="text-xs opacity-60 whitespace-nowrap">${eventWhen(e.beginAt)}</span>`;
            return html`<li class="flex items-center justify-between gap-2 text-sm">
              ${href
                ? html`<a href="${href}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between gap-2 w-full min-w-0 no-underline">${row}</a>`
                : row}
            </li>`;
          })}
        </ul>`
    : "";
  return card(html`${evalPart}${eventsPart}`, "Upcoming");
}

function eventWhen(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return clockTime(d);
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return fullDate(d);
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "starting now";
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
  void Promise.allSettled([me(), upcomingEvals(), profileStats(), events()]).then(
    ([m, u, s, ev]) => {
      if (m.status === "fulfilled") meData = m.value;
      else if (!silent) error = friendly(m.reason);
      if (u.status === "fulfilled") {
        upcoming = u.value;
        const booked = u.value.items.filter((i) => i.state === "booked").length;
        if (booked > 0) setAppBadge(booked);
        else clearAppBadge();
      } else if (!silent) error ||= friendly(u.reason);
      if (s.status === "fulfilled") evalStats = s.value.evalStats;
      else if (!silent) error ||= friendly(s.reason);
      if (ev.status === "fulfilled") soonEvents = ev.value;
      else if (!silent) error ||= friendly(ev.reason);
      loading = false;
      refresh();
    },
  );
}

function friendly(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}