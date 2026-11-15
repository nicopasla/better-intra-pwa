import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import {
  me,
  upcomingEvals,
  events,
  getBlob,
  logtimeHistory,
  logtimeWeek,
  userProfile,
  Me,
  UpcomingEval,
  UpcomingResponse,
  CalendarEvent,
  type LogtimeSettings,
  type UserProfile,
} from "../data.ts";
import { refresh } from "../refresh.ts";
import { currentTab, isTabHidden, navigate } from "../shell.ts";
import { getSession } from "../api.ts";
import { readScopedCache, writeCache } from "../lib/cache.ts";
import { isRetryableError, friendlyError, Retrier } from "../lib/retry.ts";
import { switchSubTab } from "./profile.ts";
import {
  disablePush,
  enablePushWithTest,
  getExistingSubscription,
  pushSupported,
} from "../push.ts";
import { clearAppBadge, setAppBadge } from "../lib/badge.ts";
import { dashboardSkeleton, heroSkeleton } from "../lib/skeletons.ts";
import { dateTimeShort, evalCountdown, relativeTime } from "../lib/format.ts";
import { activeLabelBadge, logtimeSection } from "./logtime-feature/index.ts";
import { logtimeSettingsFromBlob } from "./logtime-feature/config.ts";
import { weekCard as weekCardView, weekKey } from "./week-card.ts";
import { getDoneEvals, markEvalDone, mergeEvals } from "../lib/evals.ts";
import { openEvalDialog } from "./eval-dialog.ts";
import { openEventDialog } from "./event-dialog.ts";
import {
  BADGE_ROWS,
  getHomeLayout,
  getWeekStart,
  resetHomeLayout,
  setHomeLayout,
  setWeekStart,
} from "../lib/prefs.ts";
import type { HomeLayoutItem } from "../lib/prefs.ts";
import { setPullRefreshEnabled } from "../pull-refresh.ts";
import { createSortable, moveItem } from "../lib/sortable.ts";
import { readPushState, writePushState } from "../lib/push-state.ts";
import type Sortable from "sortablejs";
import { profileHero } from "./profile-hero.ts";
import {
  startTransitPoll,
  stopTransitPoll,
  transitCard,
} from "./transit-feature/index.ts";
import { BELGIUM_CAMPUS } from "../lib/campus.ts";
import CALENDAR_CLOCK_SVG from "../assets/calendar-clock.svg?raw";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import CHECK_SVG from "../assets/check.svg?raw";
import INFO_SVG from "../assets/info.svg?raw";
import CHEVRON_DOWN_SVG from "../assets/chevron-down.svg?raw";
import GRIP_SVG from "../assets/grip.svg?raw";
import EYE_SVG from "../assets/eye.svg?raw";
import EYE_SLASH_SVG from "../assets/eye-slash.svg?raw";

const CARD_LABELS: Record<string, string> = {
  logtime: "Logtime",
  week: "This week",
  upcoming: "Evaluations",
  projects: "Projects",
  events: "Events",
  transit: "Transit",
};

const CARD_BUILDERS: Record<
  string,
  (options?: { preview?: boolean }) => unknown
> = {
  logtime: logtimeCard,
  week: weekCard,
  upcoming: upcomingCard,
  projects: projectsCard,
  events: eventsCard,
  transit: transitCard,
};

let meData: Me | null = null;
let upcoming: UpcomingResponse = { items: [], tracked: false };
let allEvents: CalendarEvent[] = [];
let loading = true;
let error = "";
let stale = false;
let pushBusy = false;
let pushError = "";
let pushSubscribed: boolean | null = readPushState();
/** User's profile color (synced custom color), used for the project stats. */
let profileColor = "#00BABC";
/** Full profile payload: the home header reuses the profile page's hero. */
let myProfile: UserProfile | null = null;
let showOriginalAvatar = false;
let avatarFailed = false;

let logtimeOpen = false;
let logtimeDays: Record<string, number> | null = null;
let logtimeSettings: LogtimeSettings | null = null;
let logtimePartial = false;
let logtimeLoading = false;
let logtimeError = "";
let logtimeScrollKey: string | null = null;
/** When the logtime shown was last synced by the worker. */
let logtimeFetchedAt: number | null = null;
/** The last refresh failed; `logtimeDays` is the stored snapshot. */
let logtimeStale = false;
/** Re-read the logtime when the card is reopened after this long. */
const LOGTIME_REFRESH_MS = 60_000;

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
  if (loading) return dashboardSkeleton();
  if (error) {
    return html`
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body ft-card-tight items-center gap-3">
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
  const layout = getHomeLayout();
  return html`
    ${stale ? staleBanner() : ""} ${heroCard()}
    <div id="ft-home-cards">
      ${layout.cards
        .filter((item) => Boolean(CARD_BUILDERS[item.id]))
        .filter(
          (item) =>
            item.id !== "transit" ||
            (transitAvailable() &&
              (editing || (transitOnlineAt42() && navigator.onLine && !stale))),
        )
        .filter((item) => editing || item.id !== "logtime")
        .filter((item) => editing || !item.hidden)
        .map((item) =>
          editing
            ? editBlock(item.id, item.hidden)
            : html`<div data-card-id="${item.id}">
                ${CARD_BUILDERS[item.id]()}
              </div>`,
        )}
    </div>
  `;
}

let editing = false;

function toggleEdit(): void {
  setEditing(!editing);
}

/**
 * While editing, swiping down at the top of the page must reorder cards, not
 * reload the app: block the browser's pull-to-refresh gesture.
 */
let editingGuard = false;
let touchStartY = 0;

const rememberTouch = (e: TouchEvent) => {
  touchStartY = e.touches[0]?.clientY ?? 0;
};

const blockPullToRefresh = (e: TouchEvent) => {
  if (e.touches.length !== 1) return;
  const top = (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
  if (top && e.touches[0].clientY > touchStartY) e.preventDefault();
};

function setEditing(on: boolean): void {
  editing = on;
  setPullRefreshEnabled(!on);
  document.documentElement.classList.toggle("ft-editing", on);
  if (on && !editingGuard) {
    editingGuard = true;
    document.addEventListener("touchstart", rememberTouch, { passive: true });
    document.addEventListener("touchmove", blockPullToRefresh, {
      passive: false,
    });
  } else if (!on && editingGuard) {
    editingGuard = false;
    document.removeEventListener("touchstart", rememberTouch);
    document.removeEventListener("touchmove", blockPullToRefresh);
  }
  refresh();
}

function toggleCard(id: string): void {
  const layout = getHomeLayout();
  const item = layout.cards.find((card) => card.id === id);
  if (!item) return;
  item.hidden = !item.hidden;
  setHomeLayout(layout);
  if (id === "week" && !item.hidden && weekDays === null) {
    void loadWeekLogtime(true);
  }
  refresh();
}

function toggleBadge(id: string): void {
  const layout = getHomeLayout();
  const item = layout.badges.find((badge) => badge.id === id);
  if (!item) return;
  item.hidden = !item.hidden;
  setHomeLayout(layout);
  refresh();
}

let cardSortable: Sortable | null = null;
let badgeSortables: Sortable[] = [];

/** Saves a row's new order back into the shared badge list. */
function reorderBadgeRow(group: string[], rowIds: string[]): void {
  const layout = getHomeLayout();
  const items = layout.badges.filter((item) => group.includes(item.id));
  const ordered = [
    ...rowIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is HomeLayoutItem => Boolean(item)),
    ...items.filter((item) => !rowIds.includes(item.id)),
  ];
  let next = 0;
  layout.badges = layout.badges.map((item) =>
    group.includes(item.id) ? ordered[next++] : item,
  );
  setHomeLayout(layout);
}

/** Wires the edit-mode drag & drop after every dashboard render. */
export function dashboardAttachObservers(): void {
  scheduleEvalRefresh();
  scheduleEventsRefresh();
  if (
    transitAvailable() &&
    transitOnlineAt42() &&
    navigator.onLine &&
    homeCardVisible("transit")
  )
    startTransitPoll();
  else stopTransitPoll();
  cardSortable?.destroy();
  cardSortable = null;
  for (const instance of badgeSortables) instance.destroy();
  badgeSortables = [];
  if (!editing) return;

  const container = document.getElementById("ft-home-cards");
  if (container) {
    cardSortable = createSortable(container, {
      draggable: "[data-card-id]",
      // The whole card drags; the inert body lets touches fall through and
      // only the small buttons are excluded.
      filter: ".btn",
      delay: 180,
      delayOnTouchOnly: true,
      onReorder: (from, to) => {
        const layout = getHomeLayout();
        const known = layout.cards.filter((item) => CARD_BUILDERS[item.id]);
        const rest = layout.cards.filter((item) => !CARD_BUILDERS[item.id]);
        layout.cards = [...moveItem(known, from, to), ...rest];
        setHomeLayout(layout);
      },
    });
  }

  // Hero badges: each row drags within itself. A delay keeps a tap a tap.
  for (const row of document.querySelectorAll<HTMLElement>(
    "[data-badge-row]",
  )) {
    const group = BADGE_ROWS[row.dataset.badgeRow ?? ""];
    if (!group) continue;
    badgeSortables.push(
      createSortable(row, {
        draggable: "[data-badge-id]",
        delay: 220,
        delayOnTouchOnly: true,
        onReorder: () => {
          const ids = [
            ...row.querySelectorAll<HTMLElement>("[data-badge-id]"),
          ].map((el) => el.dataset.badgeId ?? "");
          reorderBadgeRow(group, ids);
        },
      }),
    );
  }
}

/**
 * Real cards with sample data: the home editor renders them through the same
 * builders when the account has nothing to show, so the styles match exactly.
 */
const mockIso = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const MOCK_EVALS: UpcomingEval[] = [
  {
    id: -1001,
    beginAt: mockIso(60 * 24 * 365 * 50),
    state: "booked",
    project: "libft",
    slug: "libft",
    role: "evaluator",
    correcteds: ["jdoe"],
  },
  {
    id: -1002,
    beginAt: mockIso(60 * 24 * 365 * 50 + 60 * 24),
    state: "booked",
    project: "born2beroot",
    slug: "born2beroot",
    role: "corrected",
    corrector: "mlane",
  },
];

const MOCK_EVENT: CalendarEvent = {
  id: -2001,
  name: "Piscine kick-off",
  beginAt: mockIso(-30),
  endAt: mockIso(120),
  location: "Cluster 1",
  url: null,
};

function withMockData<T>(id: string, render: () => T): T {
  const savedMe = meData;
  const savedUpcoming = upcoming;
  const savedEvents = allEvents;
  try {
    if (id === "projects" && !meData) {
      meData = {
        projects: {
          total: 15,
          validated: 12,
          failed: 1,
          inProgress: 2,
          active: [],
          recent: [],
        },
      } as unknown as Me;
    }
    if (id === "upcoming" && upcoming.items.length === 0) {
      upcoming = { items: MOCK_EVALS, tracked: true };
    }
    if (id === "events" && allEvents.length === 0) {
      allEvents = [MOCK_EVENT];
    }
    return render();
  } finally {
    meData = savedMe;
    upcoming = savedUpcoming;
    allEvents = savedEvents;
  }
}

function editBlock(id: string, hidden: boolean) {
  const label = CARD_LABELS[id] ?? id;
  const unavailable = id === "logtime";
  const body = unavailable ? "" : CARD_BUILDERS[id]({ preview: true });
  // Empty cards preview themselves; every body is inert while editing so the
  // card controls (expand, dismiss, links…) can't fire mid-layout.
  const content = unavailable
    ? unavailableCard()
    : body === "" ? withMockData(id, () => CARD_BUILDERS[id]()) : body;
  return html`
    <div data-card-id="${id}">
      <div
        class="ft-card-handle mb-1 flex items-center gap-2 px-1"
        data-no-swipe
      >
        <span class="inline-flex opacity-50">${svg18(GRIP_SVG)}</span>
        <span
          class="flex-1 text-xs font-semibold uppercase tracking-wide ${hidden
            ? "opacity-30 line-through"
            : "opacity-60"}"
          >${label}</span
        >
        ${unavailable
          ? ""
          : html`<button
              type="button"
              class="btn btn-ghost btn-xs ${hidden
                ? "text-success"
                : "text-error"}"
              aria-label="${hidden ? "Show" : "Hide"} ${label}"
              @click=${() => toggleCard(id)}
            >
              ${svg18(hidden ? EYE_SVG : EYE_SLASH_SVG)}
            </button>`}
      </div>
      ${id === "week"
        ? html`<label
            class="flex items-center justify-between gap-3 px-1 mb-1 text-sm opacity-70 cursor-pointer"
            data-no-swipe
          >
            <span>Week starts Saturday (Sat → Fri)</span>
            <input
              type="checkbox"
              class="toggle toggle-md toggle-primary"
              .checked=${getWeekStart() === "saturday"}
              @change=${(event: Event) => {
                setWeekStart(
                  (event.target as HTMLInputElement).checked
                    ? "saturday"
                    : "monday",
                );
                void loadWeekLogtime(true);
                refresh();
              }}
            />
          </label>`
        : ""}
      ${id === "transit"
        ? html`<p class="px-1 mb-1 text-xs opacity-60">
            Only visible while you are online at 42.
          </p>`
        : ""}
      <div
        inert
        class="pointer-events-none select-none ${hidden
          ? "opacity-40 grayscale"
          : ""}"
      >
        ${content}
      </div>
    </div>
  `;
}

/** Greyed stand-in for a card that is temporarily disabled. */
function unavailableCard() {
  return html`<div class="card bg-base-100 shadow-xl mb-4 opacity-40 grayscale">
    <div class="card-body ft-card-tight py-4 items-center text-center gap-1">
      <span class="text-sm font-semibold">Logtime</span>
      <span class="text-xs opacity-70">Temporarily unavailable</span>
    </div>
  </div>`;
}

function staleBanner() {
  if (!navigator.onLine) return "";
  return html`<div class="alert alert-warning alert-soft mb-4 py-2 text-sm">
    <span class="flex-1">Couldn't refresh. Showing saved data.</span>
    <button class="btn btn-xs btn-outline" @click=${() => loadDashboard(true)}>
      Retry
    </button>
  </div>`;
}

function card(content: unknown, title?: string) {
  return html`
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body ft-card-tight">
        ${title ? html`<h2 class="card-title text-base">${title}</h2>` : ""}
        ${content}
      </div>
    </div>
  `;
}

function heroCard() {
  if (!myProfile) return heroSkeleton();
  const layout = getHomeLayout();
  return profileHero(myProfile, {
    showShare: false,
    badgeLinks: true,
    onSearch:
      editing || isTabHidden("students")
        ? undefined
        : () => navigate("students"),
    badges: {
      order: layout.badges.map((item) => item.id),
      hidden: layout.badges
        .filter((item) => item.hidden)
        .map((item) => item.id),
    },
    onEdit: toggleEdit,
    editActive: editing,
    onReset: editing
      ? () => {
          resetHomeLayout();
          refresh();
        }
      : undefined,
    onBadgeToggle: editing ? toggleBadge : undefined,
    showOriginalAvatar,
    avatarFailed,
    onToggleAvatar: () => {
      showOriginalAvatar = !showOriginalAvatar;
      refresh();
    },
    onAvatarError: () => {
      if (avatarFailed) return;
      avatarFailed = true;
      refresh();
    },
  });
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
    <div class="card-body ft-card-tight">
      <h2 class="card-title text-base">Projects</h2>
      <div class="flex gap-2">
        ${projectStat("Completed", p.validated)}
        ${projectStat("Ongoing", p.inProgress)} ${projectStat("Total", p.total)}
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

// ---------------------------------------------------------------------------
// Logtime (collapsed by default; the same calendar as the user profile)
// ---------------------------------------------------------------------------

function logtimeCard() {
  return html`<div class="card bg-base-100 shadow-xl mb-4">
    <div class="card-body ft-card-tight py-3 gap-1">
      <div
        class="flex items-center gap-2 w-full text-left cursor-pointer select-none"
        role="button"
        tabindex="0"
        aria-expanded="${logtimeOpen ? "true" : "false"}"
        @click=${toggleLogtime}
        @keydown=${(e: KeyboardEvent) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleLogtime();
          }
        }}
      >
        <h2 class="text-base font-semibold m-0">Logtime</h2>
        <span class="ml-auto flex items-center gap-2">
          ${activeLabelBadge(
            logtimeDays,
            logtimeSettings,
            Boolean(meData?.location),
            meData?.location,
          )}
          <span
            class="size-5 flex items-center justify-center opacity-60 transition-transform ${logtimeOpen
              ? "rotate-180"
              : ""}"
            >${svg18(CHEVRON_DOWN_SVG)}</span
          >
        </span>
      </div>
      ${logtimeOpen ? html`<div class="mt-2">${logtimeContent()}</div>` : ""}
    </div>
  </div>`;
}

function toggleLogtime(): void {
  logtimeOpen = !logtimeOpen;
  const outOfDate =
    logtimeFetchedAt === null ||
    Date.now() - logtimeFetchedAt > LOGTIME_REFRESH_MS;
  if (logtimeOpen && !logtimeLoading && !logtimeError && outOfDate) {
    void loadLogtime();
  }
  refresh();
}

function logtimeContent() {
  if (logtimeError) {
    return html`<div class="flex flex-col items-center gap-3 py-2">
      <p class="text-sm opacity-70">Couldn't load your logtime.</p>
      <p class="text-xs text-error">${logtimeError}</p>
      <button
        class="btn btn-sm btn-outline"
        @click=${() => {
          logtimeError = "";
          void loadLogtime();
        }}
      >
        Retry
      </button>
    </div>`;
  }
  if (!logtimeDays) {
    return html`<div class="flex flex-col items-center gap-2 py-6">
      <span class="loading loading-spinner loading-md"></span>
      <p class="text-xs opacity-60 text-center">
        Fetching your locations… the first load can take a few seconds.
      </p>
    </div>`;
  }
  return html`${logtimeFreshness()}
  ${logtimeSection({
    days: logtimeDays,
    settings: logtimeSettings,
    partial: logtimePartial,
    syncing: logtimeLoading,
    showHeader: false,
    onSyncMore: () => void loadLogtime(),
    onSliderRendered: scrollLogtimeToLatest,
  })}`;
}

/** "Updated 2 minutes ago", or a warning when the last refresh failed. */
function logtimeFreshness() {
  if (logtimeStale && logtimeFetchedAt !== null) {
    return html`<p class="text-xs text-warning mb-1">
      Couldn't refresh · showing data from ${relativeTime(logtimeFetchedAt)}
    </p>`;
  }
  if (logtimeFetchedAt !== null) {
    return html`<p class="text-xs opacity-60 mb-1">
      Updated ${relativeTime(logtimeFetchedAt)}
    </p>`;
  }
  return "";
}

async function loadLogtime(): Promise<void> {
  if (logtimeLoading) return;
  const session = getSession();
  if (!session) return;
  logtimeLoading = true;
  logtimeError = "";
  logtimeStale = false;
  refresh();
  try {
    const { days, partial, updatedAt, stale } = await logtimeHistory(
      session.login,
    );
    logtimeDays = { ...(logtimeDays ?? {}), ...(days ?? {}) };
    logtimePartial = Boolean(partial);
    logtimeFetchedAt = updatedAt ?? Date.now();
    logtimeStale = Boolean(stale);
  } catch (e) {
    // Keep showing what we already have; only replace the card with an error
    // when there is nothing to display.
    if (logtimeDays) logtimeStale = true;
    else logtimeError = friendlyError(e);
  } finally {
    logtimeLoading = false;
    refresh();
  }
}

function scrollLogtimeToLatest(el: HTMLElement): void {
  const key = `${Object.keys(logtimeDays ?? {}).length}:${logtimePartial}`;
  if (logtimeScrollKey === key) return;
  logtimeScrollKey = key;
  requestAnimationFrame(() => {
    el.scrollLeft = el.scrollWidth;
  });
}

let weekStartDate = "";
let weekDays: Record<string, number> | null = null;
let weekTotal = 0;
let weekLoading = false;
let weekError = "";
let weekStale = false;
let weekFetchedAt: number | null = null;
/** Re-read the week when the card is refreshed after this long. */
const WEEK_REFRESH_MS = 60_000;

async function loadWeekLogtime(force = false): Promise<void> {
  if (weekLoading) return;
  const start = weekKey();
  const current = weekDays !== null && weekStartDate === start;
  if (
    !force &&
    current &&
    weekFetchedAt !== null &&
    Date.now() - weekFetchedAt < WEEK_REFRESH_MS
  ) {
    return;
  }
  if (!current) {
    weekStartDate = start;
    weekDays = null;
    weekTotal = 0;
    weekStale = false;
  }
  weekLoading = true;
  weekError = "";
  refresh();
  try {
    const week = await logtimeWeek(start);
    weekStartDate = week.start;
    weekDays = week.days;
    weekTotal = week.total;
    weekStale = Boolean(week.stale);
    weekFetchedAt = week.updatedAt ?? Date.now();
  } catch (e) {
    if (weekDays) weekStale = true;
    else weekError = friendlyError(e);
  } finally {
    weekLoading = false;
    refresh();
  }
}

function weekCard() {
  return weekCardView({
    start: weekStartDate || weekKey(),
    days: weekDays,
    total: weekTotal,
    color: profileColor,
    error: weekError,
    stale: weekStale,
    onRetry: () => void loadWeekLogtime(true),
  });
}

function homeCardVisible(id: string): boolean {
  return getHomeLayout().cards.some((card) => card.id === id && !card.hidden);
}

/** The STIB card is Belgium-only, like the Clusters and Students tabs. */
function transitAvailable(): boolean {
  return meData?.campusId === BELGIUM_CAMPUS;
}

/** 42 "online": an active cluster session. The board is only useful there. */
function transitOnlineAt42(): boolean {
  return Boolean(meData?.location);
}

let upcomingTab: "evaluator" | "corrected" | null = null;

/** How long an unticked eval stays in the active list after it started. Once
 *  that passes it is auto-archived to the "Past" section. */
const EVAL_CHECK_GRACE_MS = 24 * 60 * 60 * 1000;

let evalRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let eventsRefreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Repaints the events list when one starts or ends, so the statuses and the
 *  "now" chip never lag behind the clock. */
function scheduleEventsRefresh(): void {
  if (eventsRefreshTimer !== null) {
    clearTimeout(eventsRefreshTimer);
    eventsRefreshTimer = null;
  }
  const now = Date.now();
  let next = Infinity;
  for (const event of allEvents) {
    for (const iso of [event.beginAt, event.endAt]) {
      const at = Date.parse(iso);
      if (Number.isFinite(at) && at > now && at < next) next = at;
    }
  }
  if (!Number.isFinite(next)) return;
  const delay = Math.min(next - now + 1000, 60_000);
  eventsRefreshTimer = setTimeout(() => {
    eventsRefreshTimer = null;
    if (currentTab() === "dashboard") refresh();
  }, delay);
}

/** Repaints the dashboard when the next evaluation starts, so its "done" check
 *  appears without a manual refresh. */
function scheduleEvalRefresh(): void {
  if (evalRefreshTimer !== null) {
    clearTimeout(evalRefreshTimer);
    evalRefreshTimer = null;
  }
  const done = new Set(getDoneEvals());
  const now = Date.now();
  let next = Infinity;
  for (const e of upcoming.items) {
    if (done.has(e.id)) continue;
    const start = new Date(e.beginAt).getTime();
    if (!Number.isFinite(start) || start <= now) continue;
    if (start < next) next = start;
  }
  if (!Number.isFinite(next)) return;
  const delay = Math.min(next - now + 1000, 2_147_483_647);
  evalRefreshTimer = setTimeout(() => {
    evalRefreshTimer = null;
    if (currentTab() === "dashboard") refresh();
  }, delay);
}

function upcomingCard() {
  const done = new Set(getDoneEvals());
  const now = Date.now();
  const beginAt = (e: UpcomingEval) => new Date(e.beginAt).getTime();
  // Ticked evals leave the active list right away. Unticked ones stay there
  // for a day after they started, so the "done" check is only offered once the
  // evaluation is actually over; after the grace window they auto-archive.
  // Upcoming evals come first (soonest on top); the ones that already started
  // and are still waiting to be checked sink to the bottom.
  const started = (e: UpcomingEval) => (beginAt(e) <= now ? 1 : 0);
  const activeItems = upcoming.items
    .filter((e) => !done.has(e.id) && beginAt(e) > now - EVAL_CHECK_GRACE_MS)
    .sort((a, b) =>
      started(a) !== started(b)
        ? started(a) - started(b)
        : started(a)
          ? beginAt(b) - beginAt(a)
          : beginAt(a) - beginAt(b),
    );
  const pastItems = upcoming.items
    .filter((e) => done.has(e.id) || beginAt(e) <= now - EVAL_CHECK_GRACE_MS)
    .sort((a, b) => beginAt(b) - beginAt(a));
  const needsPush = pushSupported() && pushSubscribed !== true;

  if (activeItems.length === 0 && pastItems.length === 0) {
    return needsPush
      ? card(
          html`<div class="flex flex-col items-start gap-2 w-full">
            <p class="text-sm opacity-60">
              Enable notifications to start tracking evaluations.
            </p>
            ${enablePushBlock()}
          </div>`,
          "Evaluations",
        )
      : "";
  }

  const evaluating = activeItems.filter((e) => e.role !== "corrected");
  const corrected = activeItems.filter((e) => e.role === "corrected");
  const showTabs = evaluating.length > 0 && corrected.length > 0;
  let active: "evaluator" | "corrected" =
    upcomingTab ?? (evaluating.length > 0 ? "evaluator" : "corrected");
  if (active === "evaluator" && evaluating.length === 0) active = "corrected";
  if (active === "corrected" && corrected.length === 0) active = "evaluator";
  const list = active === "evaluator" ? evaluating : corrected;

  const tab = (id: "evaluator" | "corrected", label: string, count: number) =>
    html`<button
      type="button"
      role="tab"
      aria-selected=${active === id ? "true" : "false"}
      class="tab-btn ${active === id ? "active" : ""}"
      @click=${() => {
        upcomingTab = id;
        refresh();
      }}
    >
      <span class="tab-count">${label}</span>
      <span class="tab-total">${count}</span>
    </button>`;

  const activePart =
    activeItems.length === 0
      ? html`<p class="text-sm opacity-60">
            ${needsPush
              ? pastItems.length > 0
                ? "Enable notifications to get evaluation reminders."
                : "Enable notifications to start tracking evaluations."
              : "Nothing scheduled."}
          </p>
          ${needsPush ? enablePushBlock() : ""}`
      : html`
          ${showTabs
            ? html`<div
                class="count-tabs eval-tabs flex flex-1 gap-1 rounded-lg bg-base-200 p-1 mb-2"
                style="border-radius:var(--radius-field)"
                role="tablist"
                aria-label="Evaluations"
              >
                ${tab("evaluator", "Evaluating", evaluating.length)}
                ${tab("corrected", "Being evaluated", corrected.length)}
              </div>`
            : ""}
          <ul class="flex flex-col divide-y divide-base-300">
            ${list.map((e) => evalRow(e))}
          </ul>
        `;

  const pastPart =
    pastItems.length > 0
      ? html`<details
          class="collapse collapse-arrow ft-card-bleed bg-base-200/60 mt-3 border-t border-base-300"
          data-no-swipe
        >
          <summary class="collapse-title text-sm font-medium">
            Past (${pastItems.length})
          </summary>
          <div class="collapse-content">
            <ul
              class="flex max-h-96 flex-col divide-y divide-base-300 overflow-y-auto overscroll-contain pr-3 no-scrollbar"
              style="touch-action: pan-y; -webkit-overflow-scrolling: touch;"
            >
              ${pastItems.map((e) => evalRow(e, true))}
            </ul>
          </div>
        </details>`
      : "";

  // With both tabs on screen their labels already say what the list is, so the
  // card heading would just repeat them.
  return card(
    html`${activePart}${pastPart}`,
    showTabs ? undefined : "Evaluations",
  );
}

function evalRow(e: UpcomingEval, past = false) {
  const isCorrected = e.role === "corrected";
  const person =
    e.state === "revealed"
      ? isCorrected
        ? (e.corrector ?? undefined)
        : e.correcteds?.[0]
      : undefined;
  const label = person ?? (e.state === "revealed" ? "Revealed" : "Booked");
  const countdown = evalCountdown(e.beginAt);
  // Only offer the "done" check once the evaluation has started; before that
  // it would just archive a slot that hasn't happened yet.
  const started = new Date(e.beginAt).getTime() <= Date.now();
  // History reads as a sentence; the active list keeps the time inline.
  const sub = past
    ? isCorrected
      ? `${person ?? "Someone"} evaluated you`
      : `you evaluated ${person ?? "someone"}`
    : countdown
      ? `${label} at ${dateTimeShort(e.beginAt)}`
      : label;
  return html`<li
    class="flex items-center justify-between gap-3 py-2 ${past
      ? "ft-row-inset"
      : person
        ? "-mx-2 px-2 rounded-lg"
        : ""} ${person
      ? "cursor-pointer hover:bg-base-200 transition-colors"
      : ""}"
    @click=${person ? () => openEvalDialog(e, person) : undefined}
  >
    <div class="min-w-0">
      <div class="font-medium truncate">${e.project ?? "Evaluation"}</div>
      <div class="text-xs opacity-60">${sub}</div>
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
        >${past
          ? dateTimeShort(e.beginAt)
          : countdown || dateTimeShort(e.beginAt)}</span
      >
      ${past || !started
        ? ""
        : html`<button
            class="badge badge-lg badge-outline badge-success text-success cursor-pointer"
            title="Mark as done (moves to the past list)"
            @click=${(ev: Event) => {
              ev.stopPropagation();
              markEvalDone(e.id);
              refresh();
            }}
          >
            ${svg18(CHECK_SVG)}
          </button>`}
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
        ?disabled=${pushBusy || pushSubscribed === null}
        @change=${onTogglePush}
      />
    </label>
    ${pushSubscribed === null
      ? html`<p class="text-xs opacity-60">Checking this device…</p>`
      : ""}
    ${pushError ? html`<p class="text-xs text-warning">${pushError}</p>` : ""}
  `;
}

async function onTogglePush(e: Event) {
  const input = e.target as HTMLInputElement;
  // Unknown state: keep the switch where it was instead of acting blindly.
  if (pushSubscribed === null) {
    input.checked = false;
    return;
  }
  const on = input.checked;
  pushBusy = true;
  pushError = "";
  refresh();
  try {
    if (on) {
      const res = await enablePushWithTest();
      pushSubscribed = res.subscribed;
      if (!res.delivered) {
        pushError = `Couldn't deliver a test notification${
          res.host ? ` via ${res.host}` : ""
        }${res.reason ? ` (${res.reason})` : ""}.${
          res.subscribed ? " Push remains enabled." : " Notifications stay off."
        }`;
      } else {
        if (!res.tracked) {
          pushError = "Notifications work, but eval tracking is unavailable.";
        }
        loadDashboard(true);
      }
    } else {
      await disablePush();
      pushSubscribed = false;
    }
    writePushState(pushSubscribed);
  } catch (err) {
    pushError =
      err instanceof Error && err.message === "permission_denied"
        ? "Notifications permission was denied."
        : "Could not update notifications.";
  } finally {
    pushBusy = false;
    // Never leave the switch showing a rejected update.
    input.checked = pushSubscribed === true;
    refresh();
  }
}

async function refreshPushState(): Promise<void> {
  if (!pushSupported()) {
    pushSubscribed = false;
    writePushState(false);
    refresh();
    return;
  }
  try {
    const sub = await getExistingSubscription();
    pushSubscribed = Boolean(sub);
    writePushState(pushSubscribed);
  } catch {
    /* keep the cached value */
  }
  refresh();
}

let eventsExpanded = false;

function toggleEventsExpanded(): void {
  eventsExpanded = !eventsExpanded;
  refresh();
}

const EVENTS_COLLAPSED_ROWS = 5;

const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

/** Live state of an event, shown as a chip on its row. */
function eventStatus(
  start: Date,
  end: Date,
): { text: string; cls: string } | null {
  const now = new Date();
  if (now >= start && now < end) return { text: "now", cls: "badge-success" };
  if (start.toDateString() === now.toDateString()) {
    const mins = Math.max(
      1,
      Math.round((start.getTime() - now.getTime()) / 60000),
    );
    return {
      text: mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)}h`,
      cls: "badge-warning",
    };
  }
  return null;
}

function eventsCard() {
  const now = Date.now();
  const upcoming = allEvents.filter((event) => {
    const end = Date.parse(event.endAt);
    return !Number.isFinite(end) || end > now;
  });
  if (upcoming.length === 0) return "";
  const rows = eventsExpanded
    ? upcoming
    : upcoming.slice(0, EVENTS_COLLAPSED_ROWS);

  return html`<div class="card bg-base-100 shadow-xl mb-4">
    <div class="card-body ft-card-tight py-3 gap-2">
      <h2 class="card-title text-base">Events</h2>
      <ul class="list flex flex-col">
        ${rows.map(eventRow)}
      </ul>
      ${upcoming.length > EVENTS_COLLAPSED_ROWS
        ? html`<button
            type="button"
            class="btn btn-xs btn-ghost self-start"
            @click=${toggleEventsExpanded}
          >
            ${eventsExpanded ? "Show less" : `Show all ${upcoming.length}`}
          </button>`
        : ""}
    </div>
  </div>`;
}

function eventRow(e: CalendarEvent) {
  const start = new Date(e.beginAt);
  const end = new Date(e.endAt);
  const isExam = (e.url ?? "").includes("/exams/") || /^exam/i.test(e.name);
  const status = eventStatus(start, end);
  const joined =
    e.subscribers != null && e.maxSubscribers != null
      ? `${e.subscribers}/${e.maxSubscribers}`
      : null;

  const weekday = start.toLocaleDateString("en-GB", { weekday: "short" });
  const startTime = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;

  return html`<li
    class="list-row px-0 py-3 cursor-pointer hover:bg-base-200 transition-colors"
    @click=${() => openEventDialog(e)}
  >
    <div
      class="w-11 self-stretch flex-none border-2 flex flex-col items-center justify-center ${isExam
        ? "border-error text-error"
        : "border-primary text-primary"}"
      style="border-radius: var(--badge-radius);"
    >
      <span class="text-[10px] font-semibold uppercase leading-none opacity-70"
        >${weekday}</span
      >
      <span class="text-base font-bold leading-none mt-0.5"
        >${start.getDate()}</span
      >
    </div>
    <div class="min-w-0 flex flex-col justify-center leading-tight">
      <div class="truncate text-lg ${isExam ? "text-error" : ""}">
        ${e.name}
      </div>
      <div class="flex items-center gap-2 text-xs opacity-60 min-w-0">
        <span class="flex-none flex items-center gap-1 tabular-nums"
          >${svg16(CALENDAR_CLOCK_SVG)}${startTime}</span
        >
        ${e.location
          ? html`<span class="flex items-center gap-1 min-w-0"
              >${svg16(MAP_PIN_SVG)}<span class="truncate"
                >${e.location}</span
              ></span
            >`
          : ""}
        ${joined
          ? html`<span class="flex-none tabular-nums">${joined}</span>`
          : ""}
      </div>
    </div>
    ${status
      ? html`<span class="badge ${status.cls} badge-sm self-center flex-none"
          >${status.text}</span
        >`
      : ""}
  </li>`;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

const DASHBOARD_CACHE = "dashboard";
const CACHE_VERSION = 3;

interface CachedWeek {
  start: string;
  days: Record<string, number>;
  total: number;
  updatedAt: number | null;
}

interface DashboardCache {
  v: number;
  login: string;
  me: Me;
  myProfile: UserProfile | null;
  upcoming: UpcomingResponse;
  events: CalendarEvent[];
  profileColor: string;
  week?: CachedWeek;
}

export function hydrateDashboardCache(): void {
  const cached = readScopedCache<DashboardCache>(DASHBOARD_CACHE);
  if (!cached || cached.v !== CACHE_VERSION) return;
  meData = cached.me;
  myProfile = cached.myProfile ?? null;
  upcoming = { ...cached.upcoming, items: mergeEvals(cached.upcoming.items) };
  allEvents = cached.events;
  if (cached.profileColor) profileColor = cached.profileColor;
  // Only reuse the week while it is still the current one.
  if (cached.week && cached.week.start === weekKey()) {
    weekStartDate = cached.week.start;
    weekDays = cached.week.days;
    weekTotal = cached.week.total;
    weekFetchedAt = cached.week.updatedAt;
  }
  loading = false;
}

function writeDashboardCache(): void {
  const session = getSession();
  if (!session || !meData) return;
  writeCache(DASHBOARD_CACHE, {
    v: CACHE_VERSION,
    login: session.login,
    me: {
      ...meData,
      avatarUrl: undefined,
    },
    myProfile: myProfile ? { ...myProfile, avatarUrl: undefined } : null,
    upcoming,
    events: allEvents,
    profileColor,
    week:
      weekDays && weekStartDate
        ? {
            start: weekStartDate,
            days: weekDays,
            total: weekTotal,
            updatedAt: weekFetchedAt,
          }
        : undefined,
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
  const login = getSession()?.login;
  const profileRequest = login
    ? userProfile(login).catch(() => null)
    : Promise.resolve(null);
  void Promise.allSettled([
    me(),
    upcomingEvals(),
    events(),
    getBlob(),
    profileRequest,
  ]).then(([m, u, ev, bl, pr]) => {
    if (bl.status === "fulfilled") {
      profileColor = resolveProfileColor(bl.value.settings ?? {});
      logtimeSettings = logtimeSettingsFromBlob(bl.value.settings);
    }
    if (pr.status === "fulfilled" && pr.value) myProfile = pr.value;
    let failure: unknown = null;
    if (m.status === "fulfilled") meData = m.value;
    else failure = m.reason;
    if (u.status === "fulfilled") {
      upcoming = { ...u.value, items: mergeEvals(u.value.items) };
      const now = Date.now();
      const done = new Set(getDoneEvals());
      const booked = upcoming.items.filter(
        (i) =>
          i.state === "booked" &&
          new Date(i.beginAt).getTime() > now &&
          !done.has(i.id),
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
    if (homeCardVisible("week")) void loadWeekLogtime();
    refresh();
  });
}
