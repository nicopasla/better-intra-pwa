import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import {
  logtimeHistory,
  profileStatsFor,
  userProfile,
  type ProfileStats,
  type UserProfile,
  type UserRecentProject,
} from "../data.ts";
import { refresh } from "../refresh.ts";
import { userLoginFromHash } from "../shell.ts";
import { isRetryableError, friendlyError, Retrier } from "../lib/retry.ts";
import { dateTime } from "../lib/format.ts";
import { activeLabelBadge, logtimeSection } from "./logtime-feature/index.ts";
import { accentFor, profileHero } from "./profile-hero.ts";
import CHEVRON_DOWN_SVG from "../assets/chevron-down.svg?raw";

const CACHE_TTL = 5 * 60_000;

interface ProfileState {
  login: string;
  profile: UserProfile | null;
  stats: ProfileStats | null;
  days: Record<string, number> | null;
  loading: boolean;
  error: string;
  stale: boolean;
  logtimeLoading: boolean;
  logtimeError: string;
  logtimePartial: boolean;
  logtimeOpen: boolean;
  /** Signature of the last layout we jumped to the most recent month for. */
  logtimeScrollKey: string | null;
  showOriginalAvatar: boolean;
  avatarFailed: boolean;
}

let state: ProfileState | null = null;

const cache = new Map<
  string,
  { at: number; profile: UserProfile; stats: ProfileStats | null }
>();

const retrier = new Retrier(
  () => {
    const login = state?.login;
    if (login) void loadUserProfile(login, true);
  },
  () => userLoginFromHash() !== null && document.visibilityState === "visible",
);

/** Renders the profile route; kicks a load when the login changes. */
export function userProfileView(login: string): unknown {
  const target = login.trim().toLowerCase();
  if (!state || state.login !== target) {
    const hit = cache.get(target);
    const fresh = Boolean(hit && Date.now() - hit.at < CACHE_TTL);
    state = {
      login: target,
      profile: hit?.profile ?? null,
      stats: hit?.stats ?? null,
      days: null,
      loading: !hit,
      error: "",
      stale: false,
      logtimeLoading: false,
      logtimeError: "",
      logtimePartial: false,
      logtimeOpen: false,
      logtimeScrollKey: null,
      showOriginalAvatar: false,
      avatarFailed: false,
    };
    if (!fresh) void loadUserProfile(target, true);
  }
  const s = state;
  return html`
    <div class="ft-user-profile flex flex-col">
      ${s.profile
        ? html`
            ${s.stale ? staleBanner() : ""}
            ${profileHero(s.profile, {
              showOriginalAvatar: s.showOriginalAvatar,
              avatarFailed: s.avatarFailed,
              onToggleAvatar: () => {
                if (!state) return;
                state.showOriginalAvatar = !state.showOriginalAvatar;
                refresh();
              },
              onAvatarError: () => {
                if (!state || state.avatarFailed) return;
                state.avatarFailed = true;
                refresh();
              },
            })}
            ${logtimeCard(s.profile)} ${projectsSection(s.profile)}
            ${evaluationsSection(s.stats)}
          `
        : s.loading
          ? html`<div class="flex justify-center py-16">
              <span class="loading loading-spinner loading-lg"></span>
            </div>`
          : errorCard(s.error)}
    </div>
  `;
}

export async function loadUserProfile(
  login: string,
  force = false,
): Promise<void> {
  const target = login.trim().toLowerCase();
  if (!force && state?.login === target && state.profile) return;

  if (state?.login === target) {
    if (!state.profile) state.loading = true;
    state.error = "";
    refresh();
  }

  try {
    const [profile, stats] = await Promise.all([
      userProfile(target),
      profileStatsFor(target).catch(() => null),
    ]);
    if (!state || state.login !== target) return;
    state.profile = profile;
    state.stats = stats;
    state.stale = false;
    retrier.reset();
    cache.set(target, { at: Date.now(), profile, stats });
    writeCache();
  } catch (e) {
    if (!state || state.login !== target) return;
    if (state.profile) {
      state.stale = true;
      state.error = "";
    } else {
      state.error = friendlyError(e);
    }
    if (isRetryableError(e)) retrier.schedule();
  } finally {
    if (state && state.login === target) {
      state.loading = false;
      refresh();
    }
  }
}

/** Kept in the session cache so the profile can be restored instantly. */
const SESSION_KEY = "ft_pwa_user_profile";

function writeCache(): void {
  if (!state?.profile) return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        login: state.login,
        profile: state.profile,
        stats: state.stats,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

/** Restores the last viewed profile before the first paint. */
export function hydrateUserProfileCache(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      login?: string;
      profile?: UserProfile;
      stats?: ProfileStats | null;
    };
    if (!parsed.login || !parsed.profile) return;
    cache.set(parsed.login.toLowerCase(), {
      at: 0,
      profile: parsed.profile,
      stats: parsed.stats ?? null,
    });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Header / hero
// ---------------------------------------------------------------------------

function staleBanner() {
  return html`<div class="alert alert-warning alert-soft mb-3 py-2 text-sm">
    <span class="flex-1">Couldn't refresh — showing saved data.</span>
    <button
      class="btn btn-xs btn-outline"
      @click=${() => void loadUserProfile(state!.login, true)}
    >
      Retry
    </button>
  </div>`;
}

function errorCard(message: string) {
  return html`<div class="card bg-base-100 shadow-xl">
    <div class="card-body items-center gap-3">
      <p class="text-sm opacity-70">Couldn't load this profile.</p>
      ${message ? html`<p class="text-xs text-error">${message}</p>` : ""}
      <button
        class="btn btn-sm btn-outline"
        @click=${() => void loadUserProfile(state!.login, true)}
      >
        Retry
      </button>
    </div>
  </div>`;
}

function card(content: unknown, title?: string) {
  return html`<div class="card bg-base-100 shadow-xl mb-4">
    <div class="card-body">
      ${title ? html`<h2 class="card-title text-base">${title}</h2>` : ""}
      ${content}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Logtime (ported from the extension's profile feature)
// ---------------------------------------------------------------------------

async function loadLogtime(): Promise<void> {
  const s = state;
  if (!s || s.logtimeLoading) return;
  const target = s.login;
  s.logtimeLoading = true;
  s.logtimeError = "";
  refresh();
  try {
    const { days, partial } = await logtimeHistory(target);
    if (!state || state.login !== target) return;
    state.days = { ...(state.days ?? {}), ...(days ?? {}) };
    state.logtimePartial = Boolean(partial);
  } catch (e) {
    if (!state || state.login !== target) return;
    state.logtimeError = friendlyError(e);
  } finally {
    if (state && state.login === target) {
      state.logtimeLoading = false;
      refresh();
    }
  }
}

function toggleLogtime(): void {
  const s = state;
  if (!s) return;
  s.logtimeOpen = !s.logtimeOpen;
  if (s.logtimeOpen && !s.days && !s.logtimeLoading && !s.logtimeError) {
    void loadLogtime();
  }
  refresh();
}

function logtimeCard(p: UserProfile) {
  const s = state!;
  return html`<div class="card bg-base-100 shadow-xl mb-4">
    <div class="card-body py-3 gap-1">
      <button
        type="button"
        class="flex items-center gap-2 w-full text-left"
        aria-expanded="${s.logtimeOpen ? "true" : "false"}"
        @click=${toggleLogtime}
      >
        <h2 class="text-base font-semibold m-0">Logtime</h2>
        <span class="ml-auto flex items-center gap-2">
          ${activeLabelBadge(
            s.days,
            p.logtime,
            Boolean(p.location),
            p.location,
          )}
          <span
            class="size-5 flex items-center justify-center opacity-60 transition-transform ${s.logtimeOpen
              ? "rotate-180"
              : ""}"
            >${svg18(CHEVRON_DOWN_SVG)}</span
          >
        </span>
      </button>
      ${s.logtimeOpen ? html`<div class="mt-2">${logtimeContent(p)}</div>` : ""}
    </div>
  </div>`;
}

function logtimeContent(p: UserProfile) {
  const s = state!;
  if (s.logtimeError) {
    return html`<div class="flex flex-col items-center gap-3 py-2">
      <p class="text-sm opacity-70">Couldn't load the logtime.</p>
      <p class="text-xs text-error">${s.logtimeError}</p>
      <button
        class="btn btn-sm btn-outline"
        @click=${() => {
          if (state) state.logtimeError = "";
          void loadLogtime();
        }}
      >
        Retry
      </button>
    </div>`;
  }
  if (!s.days) {
    return html`<div class="flex flex-col items-center gap-2 py-6">
      <span class="loading loading-spinner loading-md"></span>
      <p class="text-xs opacity-60 text-center">
        Fetching locations… the first load of a profile can take a few seconds.
      </p>
    </div>`;
  }
  return logtimeSection({
    days: s.days,
    settings: p.logtime,
    partial: s.logtimePartial,
    syncing: s.logtimeLoading,
    showHeader: false,
    onSyncMore: () => void loadLogtime(),
    onSliderRendered: scrollLogtimeToLatest,
  });
}

/** Jumps the calendar to the current month whenever its layout changes. */
function scrollLogtimeToLatest(el: HTMLElement): void {
  const s = state;
  if (!s) return;
  const key = `${s.login}:${Object.keys(s.days ?? {}).length}:${s.logtimePartial}`;
  if (s.logtimeScrollKey === key) return;
  s.logtimeScrollKey = key;
  requestAnimationFrame(() => {
    el.scrollLeft = el.scrollWidth;
  });
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

function projectsSection(p: UserProfile) {
  const projects = p.projects;
  const accent = accentFor(p);
  return html`
    ${card(
      html`<h2 class="card-title text-base">Projects</h2>
        <div class="flex gap-2">
          ${projectStat("Validated", projects.validated, accent)}
          ${projectStat("In progress", projects.inProgress, accent)}
          ${projectStat("Total", projects.total, accent)}
        </div>`,
    )}
    ${projects.active.length
      ? card(
          html`<ul class="flex flex-col divide-y divide-base-300">
            ${projects.active.map((proj) => {
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
          `Ongoing (${projects.active.length})`,
        )
      : ""}
    ${projects.recent.length
      ? card(
          html`<ul class="flex flex-col divide-y divide-base-300">
            ${projects.recent.map((proj) => recentProjectRow(proj))}
          </ul>`,
          `Completed (${projects.recent.length})`,
        )
      : ""}
  `;
}

function recentProjectRow(proj: UserRecentProject) {
  const href = projectUrl(proj.slug);
  const row = html`<div class="min-w-0">
      <div class="font-medium truncate">${proj.name}</div>
      <div class="flex items-center gap-1.5 text-xs opacity-60">
        <span>${proj.markedAt ? dateTime(proj.markedAt) : ""}</span>
        ${occurrenceBadge(proj.occurrence)}
      </div>
    </div>
    <span
      class="badge badge-lg font-bold shrink-0 ${proj.validated
        ? "badge-success"
        : "badge-error"}"
      >${proj.finalMark ?? "—"}</span
    >`;
  return html`<li class="py-2">
    ${href
      ? html`<a
          href="${href}"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center justify-between gap-3 no-underline text-base-content"
          >${row}</a
        >`
      : html`<div class="flex items-center justify-between gap-3">${row}</div>`}
  </li>`;
}

function projectStat(label: string, value: number, accent: string) {
  return html`<div
    class="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-lg py-2"
    style="border:2px solid ${accent};background:color-mix(in oklab, ${accent} 12%, transparent);"
  >
    <span class="text-xs font-medium opacity-70">${label}</span>
    <span class="text-lg font-bold leading-none">${value}</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  return `${month}/${year.slice(2)}`;
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

function evaluationsSection(stats: ProfileStats | null) {
  const g = stats?.evalStats.global;
  const months = Object.entries(stats?.evalStats.byMonth ?? {}).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );
  const ok = g?.successPercentage != null && g.successPercentage >= 67;
  const successColor = ok ? "rgb(34,197,94)" : "rgb(239,68,68)";

  if (!g || g.total === 0) {
    return card(
      html`<p class="text-sm opacity-60">No evaluations recorded yet.</p>`,
      "Evaluations",
    );
  }

  return card(
    html`
      <div class="flex items-stretch justify-center gap-2">
        ${g.successPercentage != null
          ? html`<span
              class="inline-flex items-center text-xl font-bold px-3 py-1 rounded-xl"
              style="color:${successColor};background:${successColor
                .replace(/^rgb\(/, "rgba(")
                .replace(/\)$/, ",0.1)")};"
              >${g.successPercentage}%</span
            >`
          : ""}
        ${pill("total", String(g.total), "rgb(59,130,246)", "flex-1")}
        ${pill("failed", String(g.failed), "rgb(239,68,68)", "flex-1")}
      </div>
      <div class="overflow-auto max-h-[55vh] mt-2 pr-1">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left">
              <th class="py-1 font-semibold text-base-content/60">Month</th>
              <th class="py-1 text-right font-semibold text-base-content/60">
                Total
              </th>
              <th class="py-1 text-right font-semibold text-base-content/60">
                Failed
              </th>
              <th class="py-1 text-right font-semibold text-base-content/60">
                Success
              </th>
            </tr>
          </thead>
          <tbody>
            ${months.map(
              ([month, s]) =>
                html`<tr class="border-t border-base-300">
                  <td class="py-1.5">${formatMonth(month)}</td>
                  <td class="py-1.5 text-right font-mono">${s.total}</td>
                  <td class="py-1.5 text-right font-mono">${s.failed}</td>
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
        </table>
      </div>
    `,
    "Evaluations",
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function svg18(raw: string) {
  return unsafeHTML(raw.replace("<svg", '<svg width="18" height="18"'));
}
