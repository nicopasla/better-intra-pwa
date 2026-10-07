import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { me, upcomingEvals, profileStats, Me, UpcomingResponse, EvalStats } from "../data.ts";
import { refresh } from "../refresh.ts";
import RELOAD_SVG from "../assets/reload.svg?raw";
import WALLET_SVG from "../assets/wallet.svg?raw";
import EVAL_SVG from "../assets/eval.svg?raw";
import POOL_SVG from "../assets/pool.svg?raw";

let meData: Me | null = null;
let upcoming: UpcomingResponse = { items: [], tracked: false };
let evalStats: EvalStats | null = null;
let loading = true;
let error = "";

const svg16 = (raw: string) => unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));
const svg18 = (raw: string) => unsafeHTML(raw.replace("<svg", '<svg width="18" height="18"'));

export function dashboardView(): unknown {
  if (loading) return card(html`<div class="flex justify-center py-10"><span class="loading loading-spinner loading-lg"></span></div>`);
  if (error) {
    return html`
      <div class="card bg-base-100 shadow-xl"><div class="card-body items-center gap-3">
        <p class="text-sm opacity-70">Couldn't load your dashboard.</p>
        <p class="text-xs text-error">${error}</p>
        <button class="btn btn-sm btn-outline" @click=${loadDashboard}>Retry</button>
      </div></div>
    `;
  }
  return html`
    ${profileCard()}
    ${upcomingCard()}
    ${evalCard()}
    <div class="flex justify-center mt-2">
      <button class="btn btn-ghost btn-sm gap-1" @click=${loadDashboard}>
        ${svg16(RELOAD_SVG)} Refresh
      </button>
    </div>
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
            style="transform: scale(1.2); transform-origin: left center; color: rgb(82,255,82);"
          >
            ${whole}
          </h1>
          <div class="w-full flex flex-col justify-between gap-1">
            <div class="flex items-center justify-between font-bold text-sm">
              <span style="color: rgb(82,255,82);">${pct}%</span>
              <span class="opacity-70 truncate">${m.grade ?? "42cursus"}</span>
            </div>
            <div class="w-full h-2.5 rounded overflow-hidden bg-base-300">
              <div
                class="h-full rounded transition-all duration-1000 ease-out"
                style="width:${pct}%;background-color:rgb(82,255,82);"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body">
        <div class="flex gap-2">
          ${statBadge(m.wallet.toLocaleString(), WALLET_SVG)}
          ${statBadge(String(m.correctionPoints), EVAL_SVG)}
          ${statBadge(m.poolLabel ?? "—", POOL_SVG)}
        </div>
      </div>
    </div>
  `;
}

function statBadge(value: string, icon: string) {
  return html`<div
    class="badge badge-lg h-auto flex-1 justify-center gap-2 py-2"
    style="border:2px solid var(--color-primary);"
  >
    ${svg18(icon)}<span class="font-mono font-semibold">${value}</span>
  </div>`;
}

function avatarBlock() {
  const m = meData!;
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
  const months = Object.entries(evalStats!.byMonth).sort((a, b) =>
    a[0] < b[0] ? 1 : -1,
  );
  return card(html`
    <div class="flex items-center gap-2">
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
    <div class="divider my-1"></div>
    <div class="max-h-52 overflow-y-auto overscroll-contain -mx-6">
      <table class="w-full text-xs">
        <thead>
          <tr class="border-b border-base-300">
            <th class="text-left font-medium pb-1 pl-6 text-primary/60 sticky top-0 bg-base-100">Month</th>
            <th class="text-right font-medium pb-1 pr-4 text-primary/60 sticky top-0 bg-base-100">Total</th>
            <th class="text-right font-medium pb-1 pr-4 text-primary/60 sticky top-0 bg-base-100">Failed</th>
            <th class="text-right font-medium pb-1 pr-4 text-primary/60 sticky top-0 bg-base-100">Success</th>
          </tr>
        </thead>
        <tbody>
          ${months.map(([ym, v]) => {
            const pct = v.successPercentage;
            return html`<tr class="border-b border-base-300">
              <td class="py-1 pl-6 text-primary/50">${ym.slice(5)}/${ym.slice(0, 4)}</td>
              <td class="py-1 pr-4 text-right font-medium">${v.total}</td>
              <td class="py-1 pr-4 text-right font-medium ${v.failed > 0 ? "text-error" : ""}">${v.failed}</td>
              <td class="py-1 pr-4 text-right font-medium ${pct === null ? "opacity-40" : pct >= 80 ? "text-success" : "text-error"}">${pct === null ? "—" : pct + "%"}</td>
            </tr>`;
          })}
        </tbody>
      </table>
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
  const body =
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
  return card(body, "Upcoming");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "starting now";
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 60) return `in ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `in ${h}h ${pad(m)}m` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}

export function loadDashboard(): void {
  loading = true;
  error = "";
  refresh();
  void Promise.allSettled([me(), upcomingEvals(), profileStats()]).then(([m, u, s]) => {
    if (m.status === "fulfilled") meData = m.value;
    else error = friendly(m.reason);
    if (u.status === "fulfilled") upcoming = u.value;
    else error ||= friendly(u.reason);
    if (s.status === "fulfilled") evalStats = s.value.evalStats;
    else error ||= friendly(s.reason);
    loading = false;
    refresh();
  });
}

function friendly(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}