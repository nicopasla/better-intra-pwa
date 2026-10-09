import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { Me, ProfileStats, me, outstandingIds, profileStats } from "../data.ts";
import { refresh } from "../refresh.ts";
import {
  SEGMENTED_TABS_CSS,
  observeTabsOverflow,
  segmentedTabs,
} from "../lib/segmented-tabs.ts";
import { dateTime, fullDate } from "../lib/format.ts";
import { saveData } from "../lib/network.ts";
import WALLET_SVG from "../assets/wallet.svg?raw";
import EVAL_SVG from "../assets/eval.svg?raw";
import ARROW_SHARE_SVG from "../assets/arrow_share.svg?raw";

type SubTab = "overview" | "projects" | "achievements";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "achievements", label: "Achievements" },
];

const svg18 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="18" height="18"'));

let meData: Me | null = null;
let stats: ProfileStats | null = null;
let loading = true;
let error = "";
let started = false;
let tabsOverflowing = false;
let tabsObserver: ResizeObserver | null = null;

const storedSub = (): SubTab => {
  const v = localStorage.getItem(PROFILE_SUB_TAB_KEY);
  return SUB_TABS.some((t) => t.id === v) ? (v as SubTab) : "overview";
};
const PROFILE_SUB_TAB_KEY = "PROFILE_SUB_TAB";
let subTab: SubTab = storedSub();

function switchSubTab(tab: SubTab): void {
  subTab = tab;
  localStorage.setItem(PROFILE_SUB_TAB_KEY, tab);
  refresh();
}

export function profileView(): unknown {
  if (loading && !meData) {
    return html`<div class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg"></span>
    </div>`;
  }
  if (!meData) {
    return html`<div class="card bg-base-100 shadow-xl">
      <div class="card-body items-center gap-3">
        <p class="text-sm opacity-70">Couldn't load your profile.</p>
        <p class="text-xs text-error">${error}</p>
        <button
          class="btn btn-sm btn-outline"
          @click=${() => loadProfile(true)}
        >
          Retry
        </button>
      </div>
    </div>`;
  }
  const m = meData;
  return html`
    <style>
      ${SEGMENTED_TABS_CSS}
    </style>
    <div class="profile-feature flex flex-col pb-24">
      <div class="pt-1">
        ${subTab === "overview"
          ? overviewTab(m)
          : subTab === "projects"
            ? projectsTab(m)
            : achievementsTab(m)}
      </div>
      <div
        class="fixed left-0 right-0 z-40 px-4"
        style="bottom: calc(4rem + env(safe-area-inset-bottom) + 0.5rem);"
      >
        <div class="rounded-xl bg-base-100 p-1.5 shadow-lg">
          ${segmentedTabs({
            tabs: SUB_TABS,
            active: subTab,
            overflowing: tabsOverflowing,
            onSwitch: switchSubTab,
          })}
        </div>
      </div>
    </div>
  `;
}

/** Re-attach the tab-overflow observer after each render. */
export function profileAttachObservers(): void {
  if (tabsObserver) {
    tabsObserver.disconnect();
    tabsObserver = null;
  }
  tabsObserver = observeTabsOverflow(
    ".profile-feature .segmented-tabs-host",
    SUB_TABS.map((t) => t.label),
    (overflowing) => {
      if (overflowing === tabsOverflowing) return;
      tabsOverflowing = overflowing;
      refresh();
    },
  );
}

export async function loadProfile(force = false): Promise<void> {
  if (started && !force && meData) return;
  started = true;
  if (!meData) {
    loading = true;
    refresh();
  }
  try {
    const [m, s] = await Promise.all([me(), profileStats().catch(() => null)]);
    const outstanding = await outstandingIds(
      m.projects?.recent?.length ?? 0,
    ).catch(() => ({}) as Record<number, number>);
    meData = {
      ...m,
      groups: m.groups ?? [],
      projects: m.projects
        ? {
            ...m.projects,
            active: (m.projects.active ?? []).map((p) => ({
              ...p,
              id: p.id ?? null,
              occurrence: p.occurrence ?? 0,
            })),
            recent: (m.projects.recent ?? []).map((p) => ({
              ...p,
              id: p.id ?? null,
              occurrence: p.occurrence ?? 0,
              outstanding: outstanding[p.id ?? -1] ?? 0,
            })),
          }
        : {
            total: 0,
            validated: 0,
            failed: 0,
            inProgress: 0,
            active: [],
            recent: [],
          },
      achievements: (m.achievements ?? []).map((a) => ({
        ...a,
        image: a.image ?? null,
      })),
      achievementsCount: m.achievementsCount ?? m.achievements?.length ?? 0,
    };
    if (s) stats = s;
    error = "";
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  loading = false;
  refresh();
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

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

function avatarBlock(m: Me) {
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

function statBadge(value: string, icon: string) {
  return html`<div
    class="badge badge-lg h-auto flex-1 justify-center gap-2 py-2"
    style="border:2px solid var(--color-accent);"
  >
    ${svg18(icon)}<span class="font-semibold">${value}</span>
  </div>`;
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
    <span class="font-semibold font-mono">${location}</span>${svg18(
      ARROW_SHARE_SVG,
    )}
  </a>`;
}

function groupBadges(groups: string[]) {
  if (groups.length === 0) return "";
  return html`<div class="flex flex-wrap gap-1.5">
    ${groups.map(
      (g) =>
        html`<span class="badge badge-sm badge-primary font-semibold"
          >${g}</span
        >`,
    )}
  </div>`;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function overviewTab(m: Me) {
  const whole = Math.floor(m.level);
  const pct = Math.round((m.level % 1) * 100);
  const meta: string[] = [];
  if (m.campusName) meta.push(m.campusName);
  if (m.kind) meta.push(m.kind);
  if (m.poolLabel) meta.push(`Pool ${m.poolLabel}`);
  if (m.memberSince) meta.push(`since ${fullDate(new Date(m.memberSince))}`);

  return html`
    ${card(html`
      <div class="flex items-center gap-4">
        ${avatarBlock(m)}
        <div class="min-w-0">
          <div class="font-bold text-lg truncate">${m.displayName}</div>
          <div class="text-sm opacity-60 truncate">
            @${m.login}${m.usualFullName && m.usualFullName !== m.displayName
              ? ` · ${m.usualFullName}`
              : ""}
          </div>
          ${m.groups.length
            ? html`<div class="mt-2">${groupBadges(m.groups)}</div>`
            : ""}
        </div>
      </div>
      <div class="flex items-end gap-5 mt-2">
        <h1
          class="text-5xl font-bold leading-none shrink-0"
          style="transform:scale(1.2);transform-origin:left center;color:var(--color-accent);"
        >
          ${whole}
        </h1>
        <div class="w-full flex flex-col justify-between gap-1">
          <div class="flex items-center justify-between font-bold text-sm">
            <span style="color:var(--color-accent);">${pct}%</span>
            <span class="opacity-70 truncate"
              >${m.cursus?.name ?? m.grade ?? "42cursus"}</span
            >
          </div>
          <div class="w-full h-2.5 rounded overflow-hidden bg-base-300">
            <div
              class="h-full rounded"
              style="width:${pct}%;background-color:var(--color-accent);"
            ></div>
          </div>
        </div>
      </div>
      ${m.grade ? html`<div class="text-sm opacity-70">${m.grade}</div>` : ""}
      ${meta.length
        ? html`<div class="text-xs opacity-60">${meta.join(" · ")}</div>`
        : ""}
      <div class="flex gap-2 mt-1">
        ${statBadge(m.wallet.toLocaleString(), WALLET_SVG)}
        ${statBadge(String(m.correctionPoints), EVAL_SVG)}
        ${locationBadge(m.location)}
      </div>
    `)}
    ${evaluationsTab()}
  `;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const projectUrl = (slug: string | null) =>
  slug ? `https://projects.intra.42.fr/projects/${slug}` : undefined;

const occurrenceBadge = (n: number) =>
  n > 0
    ? html`<span class="badge badge-sm badge-ghost font-mono"
        >${n} ${n === 1 ? "retry" : "retries"}</span
      >`
    : "";

const outstandingBadge = (n: number) =>
  n > 0
    ? html`<span
        class="badge badge-lg badge-outline badge-warning gap-1 font-mono"
        title="Outstanding corrector"
        >⭐ ${n}</span
      >`
    : "";

function projectsTab(m: Me) {
  const p = m.projects;
  return html`
    ${p.active.length
      ? card(
          html`<ul class="flex flex-col divide-y divide-base-300">
            ${p.active.map((proj) => {
              const href = projectUrl(proj.slug);
              const row = html`<span class="font-medium truncate"
                  >${proj.name}</span
                >
                <span class="flex items-center gap-1.5 shrink-0">
                  ${occurrenceBadge(proj.occurrence)}
                  <span class="badge badge-warning badge-sm">in progress</span>
                </span>`;
              return html`<li class="py-2">
                ${href
                  ? html`<a
                      href="${href}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center justify-between gap-2 no-underline text-base-content"
                      >${row}</a
                    >`
                  : html`<div class="flex items-center justify-between gap-2">
                      ${row}
                    </div>`}
              </li>`;
            })}
          </ul>`,
          `Ongoing (${p.active.length})`,
        )
      : ""}
    ${p.recent.length
      ? card(
          html`<ul class="flex flex-col divide-y divide-base-300">
            ${p.recent.map((proj) => {
              const href = projectUrl(proj.slug);
              const row = html`<div class="min-w-0">
                  <div class="font-medium truncate">${proj.name}</div>
                  <div class="flex items-center gap-1.5 text-xs opacity-60">
                    <span>${proj.markedAt ? dateTime(proj.markedAt) : ""}</span>
                    ${occurrenceBadge(proj.occurrence)}
                  </div>
                </div>
                <span class="flex items-center gap-1.5 shrink-0">
                  ${outstandingBadge(proj.outstanding)}
                  <span
                    class="badge badge-lg font-bold ${proj.validated
                      ? "badge-success"
                      : "badge-error"}"
                    >${proj.finalMark ?? "—"}</span
                  >
                </span>`;
              return html`<li class="py-2">
                ${href
                  ? html`<a
                      href="${href}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center justify-between gap-3 no-underline text-base-content"
                      >${row}</a
                    >`
                  : html`<div class="flex items-center justify-between gap-3">
                      ${row}
                    </div>`}
              </li>`;
            })}
          </ul>`,
          `Completed (${p.recent.length})`,
        )
      : ""}
  `;
}

function pill(label: string, value: string, color: string) {
  return html`<span
    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
    style="color:${color};background:${color
      .replace(/^rgb\(/, "rgba(")
      .replace(/\)$/, ",0.1)")};"
  >
    <span class="text-sm font-semibold opacity-70 uppercase tracking-wide"
      >${label}</span
    >
    <span class="text-xl font-bold">${value}</span>
  </span>`;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

function achievementsTab(m: Me) {
  if (m.achievements.length === 0) {
    return card(
      html`<p class="text-sm opacity-60">No achievements yet.</p>`,
      `Achievements`,
    );
  }
  return html`
    <div class="mb-2 text-sm font-semibold opacity-70">
      Achievements (${m.achievementsCount})
    </div>
    <ul class="list bg-base-100 rounded-box shadow-md">
      ${m.achievements.map(
        (a) => html`
          <li class="list-row items-center">
            ${a.image
              ? html`<img
                  class="size-10 rounded-box"
                  src="${a.image}"
                  alt=""
                  loading="lazy"
                  onerror="this.style.visibility='hidden'"
                />`
              : html`<div class="size-10 rounded-box bg-base-200"></div>`}
            <div class="list-col-grow min-w-0">
              <div class="font-semibold">${a.name}</div>
              ${a.description
                ? html`<div class="text-xs opacity-60 line-clamp-2">
                    ${a.description}
                  </div>`
                : ""}
            </div>
          </li>
        `,
      )}
    </ul>
  `;
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

function evaluationsTab() {
  const g = stats?.evalStats.global;
  const entries = stats?.roulette.entries ?? [];
  const ok = g?.successPercentage != null && g.successPercentage >= 67;
  const successColor = ok ? "rgb(34,197,94)" : "rgb(239,68,68)";
  return html`
    ${card(
      html`<div class="flex items-center justify-end gap-2">
        ${g?.successPercentage != null
          ? html`<span
              class="text-xl font-bold px-5 py-2 rounded-xl"
              style="color:${successColor};background:${successColor
                .replace(/^rgb\(/, "rgba(")
                .replace(/\)$/, ",0.1)")};"
              >${g.successPercentage}%</span
            >`
          : ""}
        ${pill("total", String(g?.total ?? 0), "rgb(59,130,246)")}
        ${pill("failed", String(g?.failed ?? 0), "rgb(239,68,68)")}
      </div>`,
      "Evaluations",
    )}
    ${entries.length
      ? card(
          html`<div class="flex flex-wrap gap-2">
            ${entries.slice(0, 40).map((e) => {
              const color =
                e.sum > 0
                  ? "rgb(34,197,94)"
                  : e.sum < 0
                    ? "rgb(239,68,68)"
                    : "rgb(59,130,246)";
              const label = new Date(e.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
              });
              return pill(label, String(e.sum), color);
            })}
          </div>`,
          "Roulette history",
        )
      : ""}
  `;
}
