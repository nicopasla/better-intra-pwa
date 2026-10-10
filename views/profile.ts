import { html } from "lit-html";
import { Me, ProfileStats, me, outstandingIds, profileStats } from "../data.ts";
import { refresh } from "../refresh.ts";
import {
  SEGMENTED_TABS_CSS,
  observeTabsOverflow,
  segmentedTabs,
} from "../lib/segmented-tabs.ts";
import { dateTime } from "../lib/format.ts";

type SubTab = "evaluations" | "projects" | "achievements";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "evaluations", label: "Evaluations" },
  { id: "projects", label: "Projects" },
  { id: "achievements", label: "Achievements" },
];

let meData: Me | null = null;
let stats: ProfileStats | null = null;
let loading = true;
let error = "";
let started = false;
let tabsOverflowing = false;
let tabsObserver: ResizeObserver | null = null;

const storedSub = (): SubTab => {
  const v = localStorage.getItem(PROFILE_SUB_TAB_KEY);
  return SUB_TABS.some((t) => t.id === v) ? (v as SubTab) : "evaluations";
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
    <div class="profile-feature flex flex-col pb-14">
      <div>
        ${subTab === "evaluations"
          ? evaluationsTab()
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

function pill(label: string, value: string, color: string, extra = "") {
  return html`<span
    class="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-xl ${extra}"
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
  return card(
    html`<ul class="list">
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
    </ul>`,
    `Achievements (${m.achievementsCount})`,
  );
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  return `${month}/${year.slice(2)}`;
}

function evaluationsTab() {
  const g = stats?.evalStats.global;
  const entries = stats?.roulette.entries ?? [];
  const months = Object.entries(stats?.evalStats.byMonth ?? {}).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );
  const ok = g?.successPercentage != null && g.successPercentage >= 67;
  const successColor = ok ? "rgb(34,197,94)" : "rgb(239,68,68)";
  return html`
    <div
      class="fixed left-0 right-0 z-10 flex flex-col gap-3 px-4"
      style="top: calc(env(safe-area-inset-top) + 1rem); bottom: calc(8.5rem + env(safe-area-inset-bottom));"
    >
      <div
        class="flex-65 min-h-0 flex flex-col card bg-base-100 shadow-xl overflow-hidden"
      >
        <div class="card-body min-h-0">
          <h2 class="card-title text-base">Evaluations</h2>
          <div class="flex items-stretch justify-center gap-2">
            ${g?.successPercentage != null
              ? html`<span
                  class="inline-flex items-center text-xl font-bold px-3 py-1 rounded-xl"
                  style="color:${successColor};background:${successColor
                    .replace(/^rgb\(/, "rgba(")
                    .replace(/\)$/, ",0.1)")};"
                  >${g.successPercentage}%</span
                >`
              : ""}
            ${pill("total", String(g?.total ?? 0), "rgb(59,130,246)", "flex-1")}
            ${pill("failed", String(g?.failed ?? 0), "rgb(239,68,68)", "flex-1")}
          </div>
          <div
            class="overflow-auto min-h-0 flex-1 pr-2"
            style="scrollbar-gutter:stable;"
          >
            ${months.length
              ? html`<table class="w-full text-sm">
                  <thead>
                    <tr class="text-left">
                      <th
                        class="sticky top-0 z-10 bg-base-100 py-1 font-semibold text-base-content/60"
                      >
                        Month
                      </th>
                      <th
                        class="sticky top-0 z-10 bg-base-100 py-1 font-semibold text-right text-base-content/60"
                      >
                        Total
                      </th>
                      <th
                        class="sticky top-0 z-10 bg-base-100 py-1 font-semibold text-right text-base-content/60"
                      >
                        Failed
                      </th>
                      <th
                        class="sticky top-0 z-10 bg-base-100 py-1 font-semibold text-right text-base-content/60"
                      >
                        Success
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${months.map(
                      ([month, s]) =>
                        html`<tr class="border-t border-base-300">
                          <td class="py-1.5">${formatMonth(month)}</td>
                          <td class="py-1.5 text-right font-mono">
                            ${s.total}
                          </td>
                          <td class="py-1.5 text-right font-mono">
                            ${s.failed}
                          </td>
                          <td
                            class="py-1.5 text-right font-mono font-semibold"
                            style="color:${(s.successPercentage ?? 0) >= 67
                              ? "rgb(34,197,94)"
                              : "rgb(239,68,68)"}"
                          >
                            ${s.successPercentage ?? 0}%
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>`
              : html`<p class="text-sm opacity-60">No history yet.</p>`}
          </div>
        </div>
      </div>

      <div
        class="flex-35 min-h-0 flex flex-col card bg-base-100 shadow-xl overflow-hidden"
      >
        <div class="card-body min-h-0">
          <h2 class="card-title text-base">Roulette history</h2>
          <div class="flex items-stretch justify-center gap-2">
            ${pill("wins", String(entries.length), "rgb(59,130,246)", "flex-1")}
            ${pill(
              "points",
              String(entries.reduce((a, e) => a + e.sum, 0)),
              "rgb(34,197,94)",
              "flex-1",
            )}
          </div>
          <div
            class="overflow-auto min-h-0 flex-1 pr-2"
            style="scrollbar-gutter:stable;"
          >
            ${entries.length
              ? html`<table class="w-full text-sm">
                  <thead>
                    <tr class="text-left">
                      <th
                        class="sticky top-0 z-10 bg-base-100 py-1 font-semibold text-base-content/60"
                      >
                        Date
                      </th>
                      <th
                        class="sticky top-0 z-10 bg-base-100 py-1 font-semibold text-right text-base-content/60"
                      >
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${entries.slice(0, 40).map((e) => {
                      const date = new Date(e.created_at).toLocaleDateString(
                        "en-GB",
                        { day: "2-digit", month: "2-digit", year: "2-digit" },
                      );
                      return html`<tr class="border-t border-base-300">
                        <td class="py-1.5">${date}</td>
                        <td class="py-1.5 text-right">
                          <span
                            class="badge badge-lg font-mono font-bold"
                            style="border:2px solid rgb(34,197,94);color:rgb(34,197,94);"
                            >+${e.sum}</span
                          >
                        </td>
                      </tr>`;
                    })}
                  </tbody>
                </table>`
              : html`<p class="text-sm opacity-60">
                  No roulette history yet.
                </p>`}
          </div>
        </div>
      </div>
    </div>
  `;
}
