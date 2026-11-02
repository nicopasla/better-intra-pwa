import { html, type TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { until } from "lit-html/directives/until.js";
import { clearSession, getDeviceName, getSession, WORKER_URL } from "../api.ts";
import {
  SessionItem,
  createCalendarToken,
  getBlob,
  getCalendarToken,
  logout,
  revokeSession,
  sessionsList,
  setCalendarToken,
  updateBlob,
} from "../data.ts";
import {
  disablePush,
  enablePushWithTest,
  evalTrackingStatus,
  getExistingSubscription,
  pushSupported,
  sendTest,
} from "../push.ts";
import { refresh } from "../refresh.ts";
import { mockMode } from "../mock.ts";
import { hasPersistentStorage } from "../lib/persist.ts";
import {
  canInstall,
  isStandalone,
  onInstallAvailability,
  promptInstall,
} from "../lib/install.ts";
import { dateTime, relativeTime } from "../lib/format.ts";
import {
  fetchCommunityStats,
  getFollowerCount,
  getRepoStars,
  PROFILE_URL,
  PWA_REPO_URL,
} from "../lib/community.ts";
import { clearCache, resetData } from "../lib/app-data.ts";
import {
  readNotifyTypes,
  readPushState,
  writeNotifyTypes,
  writePushState,
} from "../lib/push-state.ts";
import {
  applyThemeSettings,
  currentThemeLabel,
  extensionTheme,
  getThemePreference,
  setThemePreference,
  ThemeMode,
} from "../theme.ts";
import { presetLabel } from "../lib/theme-presets.ts";
import { setShowCustomAvatars, showCustomAvatars } from "../lib/avatar.ts";
import BELL_SVG from "../assets/bell.svg?raw";
import CALENDAR_PLUS_SVG from "../assets/calendar-plus.svg?raw";
import CALENDAR_SVG from "../assets/calendar.svg?raw";
import CIRCLE_CHECK_SVG from "../assets/circle-check.svg?raw";
import GITHUB_SVG from "../assets/github.svg?raw";
import ISSUES_SVG from "../assets/issues.svg?raw";
import PALETTE_SVG from "../assets/palette.svg?raw";
import PLUS_SVG from "../assets/plus.svg?raw";
import PR_SVG from "../assets/pr.svg?raw";
import SETTINGS_GEAR_SVG from "../assets/settings_gear.svg?raw";
import STAR_SVG from "../assets/star.svg?raw";
import USER_SVG from "../assets/user.svg?raw";
import USER_GROUP_SVG from "../assets/user-round-group.svg?raw";
import USERS_SVG from "../assets/users.svg?raw";
import FOLLOW_SVG from "../assets/person-follow.svg?raw";

const REPO_URL = "https://github.com/nicopasla/better-intra";

const svgIcon = (raw: string, size = 16) =>
  unsafeHTML(raw.replace("<svg", `<svg width="${size}" height="${size}"`));

/** Decorative icon in front of a settings section title. */
const sectionIcon = (raw: string) =>
  unsafeHTML(
    raw.replace(
      "<svg",
      '<svg width="18" height="18" class="shrink-0 opacity-60" aria-hidden="true"',
    ),
  );

const QUICK_LINKS = [
  { href: REPO_URL, svg: GITHUB_SVG, label: "GitHub", color: "btn-primary" },
  {
    href: `${REPO_URL}/issues`,
    svg: ISSUES_SVG,
    label: "Issues",
    color: "btn-secondary",
  },
  { href: `${REPO_URL}/pulls`, svg: PR_SVG, label: "PRs", color: "btn-accent" },
];

function format24h(ts: number): string {
  return dateTime(ts);
}

interface SessionGroup {
  key: string;
  sessions: SessionItem[];
  primary: SessionItem;
  current: boolean;
}

function sessionRecency(s: SessionItem): number {
  return s.lastUsedAt ?? s.createdAt ?? 0;
}

/** Collapses sessions from the same device into one row. */
function groupSessions(items: SessionItem[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();
  for (const s of items) {
    const key = (s.name || s.label || "").trim().toLowerCase() || `id:${s.id}`;
    let group = map.get(key);
    if (!group) {
      group = { key, sessions: [], primary: s, current: false };
      map.set(key, group);
    }
    group.sessions.push(s);
    if (s.current) group.current = true;
    if (sessionRecency(s) > sessionRecency(group.primary)) group.primary = s;
  }
  return [...map.values()].sort(
    (a, b) => sessionRecency(b.primary) - sessionRecency(a.primary),
  );
}

let sessions: SessionItem[] = [];
let loaded = false;
let busy = false;
let testing = false;
let logmeError = "";
/** Cached so the switch paints in its real position before the async check. */
let pushEnabled: boolean | null = readPushState();
let pushMessage: { ok: boolean; text: string } | null = null;
const NOTIFY_GROUPS: {
  title: string;
  rows: { key: string; label: string; hint: string }[];
}[] = [
  {
    title: "Evaluations you give",
    rows: [
      {
        key: "EVAL_NOTIFY_EVALUATOR_BOOKED",
        label: "Evaluation booked",
        hint: "A slot was booked for you to evaluate someone.",
      },
      {
        key: "EVAL_NOTIFY_EVALUATOR_REVEALED",
        label: "Starts in 15 minutes",
        hint: "Reminder with the project and who you're correcting.",
      },
    ],
  },
  {
    title: "Evaluations you receive",
    rows: [
      {
        key: "EVAL_NOTIFY_CORRECTED_REVEALED",
        label: "Evaluation in 15 minutes",
        hint: "Reminder with the login of who's evaluating you.",
      },
    ],
  },
  {
    title: "42 events",
    rows: [
      {
        key: "EVENT_NOTIFY_SOON",
        label: "Event in 15 minutes",
        hint: "One reminder for each event you subscribed to.",
      },
    ],
  },
];
const DEFAULT_NOTIFY_TYPES: Record<string, boolean> = {
  EVAL_NOTIFY_EVALUATOR_BOOKED: true,
  EVAL_NOTIFY_EVALUATOR_REVEALED: true,
  EVAL_NOTIFY_CORRECTED_REVEALED: true,
  EVENT_NOTIFY_SOON: true,
};
let notifyTypes: Record<string, boolean> = {
  ...DEFAULT_NOTIFY_TYPES,
  ...readNotifyTypes(),
};
let themeMode: ThemeMode = getThemePreference();
let storageUsed: number | null = null;
let storageQuota: number | null = null;

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function storageLabel(): string {
  if (storageUsed == null) return "—";
  return storageQuota != null
    ? `${formatBytes(storageUsed)} / ${formatBytes(storageQuota)}`
    : formatBytes(storageUsed);
}

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "extension", label: "Extension" },
];

export function settingsView(): TemplateResult {
  const session = getSession();
  return html`
    ${card(aboutSection())}
    ${section("Notifications", BELL_SVG, notificationsSection())}
    ${isStandalone() ? "" : section("Install", PLUS_SVG, installSection())}
    ${section("Theme", PALETTE_SVG, themeSection())}
    ${section("Avatars", USER_GROUP_SVG, avatarsSection())}
    ${section("Calendar", CALENDAR_SVG, calendarSection())}
    ${section("Account", USER_SVG, accountSection(session?.login ?? ""))}
    ${section("Community", USERS_SVG, communitySection())} ${debugSection()}
    ${logmeError
      ? html`<p class="text-xs text-error text-center">${logmeError}</p>`
      : ""}
  `;
}

function installSection() {
  if (canInstall())
    return html`
      <p class="text-sm opacity-70">
        Add Better Intra to your home screen for a full-screen, app-like
        experience.
      </p>
      <button class="btn btn-primary btn-sm self-start" @click=${onInstall}>
        Install app
      </button>
    `;
  const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
  return html`<p class="text-sm opacity-70">
    ${isMobile
      ? "To install, open your browser menu and choose Share → Add to Home Screen."
      : "Use your browser's install option to add this app."}
  </p>`;
}

async function onInstall() {
  const accepted = await promptInstall();
  if (accepted) refresh();
}

function card(content: unknown) {
  return html`
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body gap-3">${content}</div>
    </div>
  `;
}

function section(title: string, icon: string, content: unknown) {
  return card(
    html`<h2 class="card-title text-base">${sectionIcon(icon)}${title}</h2>
      ${content}`,
  );
}

function avatarsSection() {
  return html`
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <span class="flex flex-col">
        <span>Show custom avatars in clusters</span>
        <span class="text-xs opacity-60"
          >Clusters show original 42 photos when this is off.</span
        >
      </span>
      <input
        type="checkbox"
        class="toggle toggle-primary"
        .checked=${showCustomAvatars()}
        @change=${(e: Event) => {
          setShowCustomAvatars((e.target as HTMLInputElement).checked);
          refresh();
        }}
      />
    </label>
  `;
}

function themeSection() {
  // Report the extension's own theme, whatever mode this device is using.
  const extension = extensionTheme();
  const preset = extension ? presetLabel(extension.preset) : "";
  return html`
    <div class="grid grid-cols-2 gap-2">
      ${THEME_OPTIONS.map((o) => {
        const selected = themeMode === o.id;
        return html`
          <button
            type="button"
            class="relative flex min-h-[3.5rem] items-center justify-center rounded-box border px-8 py-3 text-center ${selected
              ? "border-primary bg-primary/10"
              : "border-base-300 bg-base-100"}"
            aria-pressed=${selected}
            @click=${() => {
              themeMode = o.id;
              setThemePreference(o.id);
              refresh();
            }}
          >
            <span class="flex flex-col items-center gap-0.5 leading-tight">
              <span class="text-sm font-semibold">${o.label}</span>
              ${o.id === "extension" && preset
                ? html`<span class="text-xs opacity-60">${preset}</span>`
                : ""}
            </span>
            ${selected
              ? html`<span
                  class="absolute right-3 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center text-primary"
                  aria-hidden="true"
                  >${svgIcon(CIRCLE_CHECK_SVG, 20)}</span
                >`
              : ""}
          </button>
        `;
      })}
    </div>
  `;
}

const calendarWebcalUrl = (token: string) =>
  `webcal://${WORKER_URL.replace(/^https?:\/\//, "")}/calendar/${token}.ics`;

function calendarSection() {
  if (calendarToken) {
    return html`
      <p class="text-sm opacity-70">
        Your 42 events on your phone's calendar. The Better Intra extension
        keeps the events up to date.
      </p>
      <a
        class="btn btn-primary btn-sm self-center gap-1.5"
        href=${calendarWebcalUrl(calendarToken)}
      >
        <span class="size-4 flex items-center justify-center fill-current">
          ${svgIcon(CALENDAR_PLUS_SVG)}
        </span>
        Add to phone calendar
      </a>
    `;
  }

  return html`
    <p class="text-sm opacity-70">
      Your 42 events on your phone's calendar. The Better Intra extension keeps
      the events up to date.
    </p>
    <button
      type="button"
      class="btn btn-primary btn-sm self-center gap-1.5 ${calendarBusy
        ? "loading"
        : ""}"
      ?disabled=${calendarBusy}
      @click=${() => void onAddToCalendar()}
    >
      <span class="size-4 flex items-center justify-center fill-current">
        ${svgIcon(CALENDAR_PLUS_SVG)}
      </span>
      Add to phone calendar
    </button>
    ${calendarMessage
      ? html`<p class="text-xs text-warning">${calendarMessage}</p>`
      : ""}
  `;
}

let calendarToken: string | null = getCalendarToken();
let calendarBusy = false;
let calendarMessage = "";

/** Creates the subscription token, then hands straight off to the calendar app. */
async function onAddToCalendar() {
  calendarBusy = true;
  calendarMessage = "";
  refresh();
  try {
    const token = crypto.randomUUID();
    await createCalendarToken(token);
    setCalendarToken(token);
    calendarToken = token;
    window.location.href = calendarWebcalUrl(token);
  } catch {
    calendarMessage = "Couldn't create the calendar link. Try again.";
  } finally {
    calendarBusy = false;
    refresh();
  }
}

function notificationsSection() {
  if (!pushSupported())
    return html`<div class="alert alert-warning alert-soft">
      <span>This browser can't receive push notifications.</span>
    </div>`;

  if (Notification.permission === "denied") {
    return html`
      <div class="alert alert-error alert-soft">
        <span>
          Notifications are blocked for this site. Re-enable them in your
          browser settings, then reload this page.
        </span>
      </div>
      ${notifyCategories(false)}
    `;
  }

  // iOS and Android deliver push most reliably to installed (standalone) apps.
  const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as { standalone?: boolean }).standalone);
  if (isMobile && !standalone) return pushInstallNotice();

  return html`
    ${pushMasterRow()} ${notifyCategories(pushEnabled === true)}
    ${pushTestRow()}
  `;
}

function pushMasterRow() {
  const checking = pushEnabled === null;
  return html`
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <span class="flex flex-col">
        <span class="font-medium">Push notifications</span>
        <span class="text-xs opacity-60"
          >Evaluations and 42 events on this device.</span
        >
      </span>
      <input
        type="checkbox"
        class="toggle toggle-primary"
        aria-label="Push notifications on this device"
        .checked=${pushEnabled === true}
        ?disabled=${busy || checking}
        @change=${onTogglePush}
      />
    </label>
    <div
      class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs"
    >
      ${statusChip(
        "This device",
        pushEnabled === null ? "unknown" : pushEnabled ? "on" : "off",
      )}
      ${statusChip(
        "Server",
        evalTracked === null ? "unknown" : evalTracked ? "on" : "off",
      )}
    </div>
  `;
}

function statusChip(label: string, state: "on" | "off" | "unknown") {
  const text = state === "on" ? "On" : state === "off" ? "Off" : "Checking…";
  const tone = state === "on" ? "badge-success" : "badge-error";
  return html`<span
    class="badge ${tone} badge-sm gap-1.5"
    title="${label}: ${text}"
  >
    ${state === "unknown"
      ? html`<span class="loading loading-spinner loading-xs"></span>`
      : ""}
    <span>${label}</span>
    <span class="font-semibold">${text}</span>
  </span>`;
}

function notifyCategories(enabled: boolean) {
  return html`
    <fieldset
      class="flex flex-col gap-3"
      aria-label="Notification preferences"
      ?disabled=${!enabled}
    >
      <div class="flex flex-col gap-3 ${enabled ? "" : "opacity-50"}">
        ${NOTIFY_GROUPS.map((g) => notifyGroup(g))}
      </div>
    </fieldset>
  `;
}

function notifyGroup(group: (typeof NOTIFY_GROUPS)[number]) {
  return html`
    <div class="flex flex-col gap-2 rounded-box bg-base-200/60 p-3">
      <span class="text-sm font-semibold">${group.title}</span>
      <div class="flex flex-col divide-y divide-base-300">
        ${group.rows.map((row) => notifyRow(row))}
      </div>
    </div>
  `;
}

function notifyRow(row: { key: string; label: string; hint: string }) {
  return html`
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <span class="flex flex-col">
        <span class="text-sm">${row.label}</span>
        <span class="text-xs opacity-60">${row.hint}</span>
      </span>
      <input
        type="checkbox"
        class="toggle toggle-sm toggle-primary"
        .checked=${notifyTypes[row.key] !== false}
        @change=${() => void toggleNotifyType(row.key)}
      />
    </label>
  `;
}

function pushTestRow() {
  return html`
    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="btn btn-sm btn-ghost gap-1.5 self-center ${testing
          ? "loading"
          : ""}"
        ?disabled=${pushEnabled !== true || testing}
        @click=${() => void onTest()}
      >
        ${testing
          ? ""
          : html`<span class="size-4 flex items-center justify-center"
              >${svgIcon(BELL_SVG)}</span
            >`}
        Send test notification
      </button>
      ${pushMessage
        ? html`<div
            class="alert ${pushMessage.ok
              ? "alert-success"
              : "alert-error"} alert-soft text-sm"
            role="status"
          >
            <span>${pushMessage.text}</span>
          </div>`
        : ""}
    </div>
  `;
}

function pushInstallNotice() {
  return html`
    <div class="alert alert-info">
      <div class="flex flex-col gap-1">
        <span class="font-semibold">Install the app to get notifications</span>
        <span class="text-sm">
          iOS and Android deliver push most reliably to installed web apps. Open
          your browser menu → Share → Add to Home Screen, then reopen the app
          and enable notifications here.
        </span>
        ${canInstall()
          ? html`<button
              class="btn btn-sm self-start mt-1 bg-base-100 text-base-content border-none"
              @click=${onInstall}
            >
              Install app
            </button>`
          : ""}
      </div>
    </div>
  `;
}

function accountSection(login: string) {
  const groups = groupSessions(sessions);
  return html`
    <div class="flex items-center justify-between gap-2">
      <span class="badge badge-lg badge-primary tabular-nums font-semibold"
        >${login}</span
      >
      <button
        type="button"
        class="badge badge-lg badge-error cursor-pointer"
        ?disabled=${busy}
        @click=${onLogout}
      >
        Logout
      </button>
    </div>
    <details class="collapse collapse-arrow rounded-box bg-base-200/60">
      <summary class="collapse-title text-sm font-medium">
        Devices (${groups.length})
      </summary>
      <div class="collapse-content">
        <div class="flex flex-col gap-2 pt-1">
          ${groups.map((g) => {
            const others = g.sessions.filter((s) => !s.current);
            const lastUsed = sessionRecency(g.primary);
            return html`<div
              class="flex items-center justify-between gap-2 text-sm"
            >
              <div class="min-w-0">
                <div class="truncate flex items-center gap-2">
                  <span class="truncate"
                    >${g.primary.name ?? g.primary.label}</span
                  >
                  ${g.current
                    ? html`<span class="badge badge-primary badge-sm"
                        >this phone</span
                      >`
                    : ""}
                  ${g.sessions.length > 1
                    ? html`<span class="badge badge-ghost badge-sm"
                        >${g.sessions.length}</span
                      >`
                    : ""}
                </div>
                <div class="text-xs opacity-50">
                  ${lastUsed
                    ? `last used ${relativeTime(lastUsed)}`
                    : format24h(g.primary.createdAt)}
                </div>
              </div>
              ${others.length === 0
                ? ""
                : html`<button
                    class="btn btn-xs btn-ghost text-error"
                    ?disabled=${busy}
                    @click=${() => void doRevokeMany(others.map((s) => s.id))}
                  >
                    Revoke
                  </button>`}
            </div>`;
          })}
        </div>
      </div>
    </details>
  `;
}

function communitySection(): TemplateResult {
  return html`${until(
    fetchCommunityStats().then((s) => {
      if (!s || !s.total) {
        return html`<p class="text-sm opacity-70">
          Community stats unavailable right now.
        </p>`;
      }
      const windows = [
        { label: "today", value: s.newToday ?? 0, color: "#a78bfa" },
        { label: "7d", value: s.newLast7Days, color: "#fb923c" },
        { label: "14d", value: s.newLast14Days, color: "#4ade80" },
        { label: "30d", value: s.newLast30Days, color: "#38bdf8" },
      ];
      return html`
        <div class="flex items-center justify-between gap-3">
          <div
            class="flex flex-col items-center rounded-xl bg-base-100 px-4 py-2"
            style="border: 2px solid #00babc"
          >
            <span class="text-2xl font-bold tabular-nums leading-none"
              >${s.total}</span
            >
            <span class="text-xs opacity-60">users</span>
          </div>
          <div class="flex flex-wrap justify-end gap-1.5">
            ${windows.map(
              (w) =>
                html`<span
                  class="badge badge-lg gap-1 bg-base-100 tabular-nums"
                  style="border: 2px solid ${w.color}"
                  >+${w.value}<span class="opacity-60">${w.label}</span></span
                >`,
            )}
          </div>
        </div>
      `;
    }),
    html`<span class="loading loading-spinner loading-sm"></span>`,
  )}`;
}

function diagRow(label: string, value: unknown): TemplateResult {
  return html`<li class="list-row items-center py-2">
    <div class="list-col-grow text-sm">${label}</div>
    <div class="text-right tabular-nums text-sm opacity-70">${value}</div>
  </li>`;
}

function diagGroup(title: string, rows: unknown): TemplateResult {
  return html`
    <div>
      <div class="mb-1 flex items-center gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide opacity-60">
          ${title}
        </h3>
        <div class="h-px flex-1 bg-base-300"></div>
      </div>
      <ul class="list">
        ${rows}
      </ul>
    </div>
  `;
}

function workerBadge(): TemplateResult {
  if (!workerOkChecked)
    return html`<span class="badge badge-ghost badge-sm">checking…</span>`;
  return workerOk
    ? html`<span class="badge badge-success badge-sm">reachable</span>`
    : html`<span class="badge badge-error badge-sm">unreachable</span>`;
}

function pushPermission(): string {
  if (!pushSupported() || typeof Notification === "undefined")
    return "unsupported";
  return Notification.permission;
}

function evalTrackingBadge(): TemplateResult {
  if (evalTracked === null)
    return html`<span class="badge badge-ghost badge-sm">unknown</span>`;
  return evalTracked
    ? html`<span class="badge badge-success badge-sm">tracked</span>`
    : html`<span class="badge badge-warning badge-sm">not tracked</span>`;
}

function aboutSection(): TemplateResult {
  const version =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  return html`
    <div class="flex items-center gap-3">
      <img src="/icons/icon-192.png" alt="" class="h-12 w-12 rounded-2xl" />
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold">Better Intra PWA</span>
          <a
            class="badge badge-ghost tabular-nums"
            href=${PWA_REPO_URL + "/releases"}
            target="_blank"
            rel="noopener noreferrer"
            >v${version}</a
          >
        </div>
        <p class="text-xs opacity-60">
          Mobile dashboard for 42 Intra, from Better Intra.
        </p>
      </div>
    </div>

    <div class="flex flex-wrap justify-center gap-2">
      <a
        class="btn btn-sm gap-1.5"
        href=${PWA_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="size-4 flex items-center justify-center fill-current">
          ${svgIcon(STAR_SVG)}
        </span>
        <span>Star</span>
        ${until(
          getRepoStars().then((c) =>
            c != null
              ? html`<span class="badge badge-sm tabular-nums">${c}</span>`
              : "",
          ),
          html`<span class="loading loading-spinner loading-xs"></span>`,
        )}
      </a>
      <a
        class="btn btn-sm gap-1.5"
        href=${PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="size-4 flex items-center justify-center fill-current">
          ${svgIcon(FOLLOW_SVG)}
        </span>
        <span>Follow</span>
        ${until(
          getFollowerCount().then((c) =>
            c != null
              ? html`<span class="badge badge-sm tabular-nums">${c}</span>`
              : "",
          ),
          html`<span class="loading loading-spinner loading-xs"></span>`,
        )}
      </a>
    </div>

    <div class="divider my-0 opacity-20"></div>

    <div class="join w-full">
      ${QUICK_LINKS.map(
        (link) =>
          html`<a
            href=${link.href}
            target="_blank"
            rel="noopener noreferrer"
            class="join-item btn btn-sm flex-1 gap-1.5 ${link.color}"
          >
            <span class="size-4 flex items-center justify-center fill-current">
              ${svgIcon(link.svg)}
            </span>
            <span class="text-sm font-semibold">${link.label}</span>
          </a>`,
      )}
    </div>
    <p class="text-center text-xs opacity-50">
      <a
        class="link"
        href=${PWA_REPO_URL + "/blob/main/LICENSE"}
        target="_blank"
        rel="noopener noreferrer"
        >MIT License</a
      >
    </p>
  `;
}

/** Technical diagnostics, collapsed at the very bottom of the settings page. */
function debugSection(): TemplateResult {
  const session = getSession();
  return html`
    <details
      class="collapse collapse-arrow bg-base-100 border border-base-300 shadow-xl mb-4"
    >
      <summary class="collapse-title text-base font-semibold">
        <span class="inline-flex items-center gap-2"
          >${sectionIcon(SETTINGS_GEAR_SVG)}<span>Debug</span></span
        >
      </summary>
      <div class="collapse-content flex flex-col gap-3">
        ${diagGroup(
          "Connection",
          html`
            ${diagRow("Worker", workerBadge())}
            ${diagRow("Endpoint", endpointHost())}
            ${diagRow("Push permission", pushPermission())}
          `,
        )}
        ${diagGroup(
          "Evaluations",
          html`
            ${diagRow("Eval tracking", evalTrackingBadge())}
            ${diagRow(
              "Push tested",
              evalTestedAt == null ? "never" : relativeTime(evalTestedAt),
            )}
            ${diagRow("Subscriptions", evalSubscriptions ?? "—")}
          `,
        )}
        ${diagGroup(
          "App",
          html`
            ${diagRow(
              "Standalone",
              (navigator as { standalone?: boolean }).standalone ? "yes" : "no",
            )}
            ${diagRow(
              "Service worker",
              navigator.serviceWorker?.controller ? "controlling" : "idle",
            )}
            ${diagRow(
              "Storage",
              persistentStorage === null
                ? "—"
                : persistentStorage
                  ? "persistent"
                  : "best-effort",
            )}
            ${diagRow("Storage used", storageLabel())}
            ${diagRow("Theme", currentThemeLabel())}
          `,
        )}
        ${diagGroup(
          "Device",
          html`
            ${diagRow("This device", getDeviceName() || "—")}
            ${diagRow("Login", session?.login ?? "—")}
          `,
        )}

        <div class="divider my-0 opacity-20"></div>

        <details
          class="collapse collapse-arrow bg-base-100 border border-base-300"
        >
          <summary class="collapse-title text-sm font-semibold">
            Maintenance
          </summary>
          <div class="collapse-content flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-outline flex-1"
              @click=${onClearCache}
            >
              Clear cache
            </button>
            <button
              type="button"
              class="btn btn-sm btn-error flex-1"
              @click=${onResetData}
            >
              Reset data
            </button>
          </div>
        </details>
      </div>
    </details>
  `;
}

function onClearCache() {
  if (
    !window.confirm(
      "Clear cached app data? It will be re-downloaded. Your account and settings are kept.",
    )
  )
    return;
  void clearCache();
}

function onResetData() {
  if (
    !window.confirm(
      "Reset all local data on this device? You'll be signed out and the cache, settings, and this device's identity are removed. Your cloud data is not affected.",
    )
  )
    return;
  void resetData();
}

let workerOk: boolean | null = null;
let workerOkChecked = false;
let subHost = "";
let persistentStorage: boolean | null = null;
let evalTracked: boolean | null = null;
let evalTestedAt: number | null = null;
let evalSubscriptions: number | null = null;

function endpointHost(): string {
  return subHost || "—";
}

async function onTogglePush(e: Event) {
  const input = e.target as HTMLInputElement;
  // The real state is still unknown; keep the switch where it was.
  if (pushEnabled === null) {
    input.checked = false;
    return;
  }
  busy = true;
  pushMessage = null;
  refresh();
  try {
    const on = input.checked;
    if (on) {
      const res = await enablePushWithTest();
      pushEnabled = res.subscribed;
      evalTracked = res.tracked;
      pushMessage = res.delivered
        ? { ok: true, text: "Test notification sent to this device." }
        : {
            ok: false,
            text: res.subscribed
              ? "Notifications are on, but the test couldn't be delivered."
              : "Couldn't enable notifications. Check your connection and try again.",
          };
    } else {
      await disablePush();
      pushEnabled = false;
      // Another device may still be subscribed, so ask the worker what it tracks.
      try {
        evalTracked = (await evalTrackingStatus()).tracked;
      } catch {
        /* keep the last known value */
      }
    }
    writePushState(pushEnabled);
  } catch (err) {
    pushMessage = {
      ok: false,
      text:
        err instanceof Error && err.message === "permission_denied"
          ? "Notification permission was denied."
          : "Couldn't update notifications. Try again.",
    };
  } finally {
    busy = false;
    // A rejected update must not leave the switch showing the tapped value.
    input.checked = pushEnabled === true;
    refresh();
  }
}

async function onTest() {
  testing = true;
  pushMessage = null;
  refresh();
  try {
    const res = await sendTest();
    pushMessage = res.ok
      ? { ok: true, text: "Test notification sent to this device." }
      : {
          ok: false,
          text: "The push service rejected the test. Try again in a moment.",
        };
  } catch {
    pushMessage = {
      ok: false,
      text: "Couldn't reach the push service. Check your connection.",
    };
  } finally {
    testing = false;
    refresh();
  }
}

async function toggleNotifyType(key: string) {
  const previous = notifyTypes[key];
  notifyTypes = { ...notifyTypes, [key]: !previous };
  writeNotifyTypes(notifyTypes);
  refresh();
  try {
    await updateBlob({ [key]: notifyTypes[key] });
  } catch {
    // Revert the optimistic flip so the switch never lies about what's synced.
    notifyTypes = { ...notifyTypes, [key]: previous };
    writeNotifyTypes(notifyTypes);
    pushMessage = {
      ok: false,
      text: "Couldn't save that preference. Try again.",
    };
    refresh();
  }
}

async function doRevokeMany(ids: string[]) {
  if (ids.length === 0) return;
  if (
    !window.confirm(
      ids.length > 1
        ? `Sign out ${ids.length} sessions for this device?`
        : "Sign out this device?",
    )
  )
    return;
  busy = true;
  refresh();
  try {
    await Promise.all(ids.map((id) => revokeSession(id)));
    sessions = sessions.filter((s) => !ids.includes(s.id));
  } catch {
    /* ignore */
  }
  busy = false;
  refresh();
}

async function onLogout() {
  if (!window.confirm("Sign out of Better Intra on this phone?")) return;
  busy = true;
  refresh();
  try {
    await logout();
  } catch {
    /* ignore */
  }
  clearSession();
  location.reload();
}

export async function loadSettings(force = false): Promise<void> {
  if (loaded && !force) return;
  loaded = true;
  try {
    const [b, s] = await Promise.all([getBlob(), sessionsList()]);
    sessions = s.sessions;
    const bs = b.settings as Record<string, unknown>;
    notifyTypes = {
      EVAL_NOTIFY_EVALUATOR_BOOKED: bs.EVAL_NOTIFY_EVALUATOR_BOOKED !== false,
      EVAL_NOTIFY_EVALUATOR_REVEALED:
        bs.EVAL_NOTIFY_EVALUATOR_REVEALED !== false,
      EVAL_NOTIFY_CORRECTED_REVEALED:
        bs.EVAL_NOTIFY_CORRECTED_REVEALED !== false,
      EVENT_NOTIFY_SOON: bs.EVENT_NOTIFY_SOON !== false,
    };
    writeNotifyTypes(notifyTypes);
    themeMode = getThemePreference();
    applyThemeSettings(bs);
    calendarToken = getCalendarToken();
  } catch (e) {
    logmeError = e instanceof Error ? e.message : String(e);
  }
  try {
    if (mockMode) {
      pushEnabled = true;
      subHost = "web.push.apple.com";
    } else {
      const sub = await getExistingSubscription();
      pushEnabled = Boolean(sub);
      if (sub) {
        try {
          subHost = new URL(sub.endpoint).host;
        } catch {
          subHost = "";
        }
      }
    }
    writePushState(pushEnabled);
  } catch {
    // Couldn't read the subscription: keep the cached value, and only settle on
    // "off" when the browser can't deliver notifications at all.
    if (
      pushEnabled === null &&
      typeof Notification !== "undefined" &&
      Notification.permission !== "granted"
    ) {
      pushEnabled = false;
      writePushState(false);
    }
  }
  if (!mockMode) {
    try {
      const res = await fetch(
        "https://api.betterintra.com/api/v1/public/push/key",
      );
      workerOk = res.ok;
    } catch {
      workerOk = false;
    }
  } else {
    workerOk = true;
  }
  workerOkChecked = true;
  if (mockMode) {
    evalTracked = true;
    evalTestedAt = Date.now() - 15 * 60000;
    evalSubscriptions = 1;
  } else {
    try {
      const status = await evalTrackingStatus();
      evalTracked = status.tracked;
      evalTestedAt = status.pushTestedAt;
      evalSubscriptions = status.subscriptions;
    } catch {
      evalTracked = null;
      evalTestedAt = null;
      evalSubscriptions = null;
    }
  }
  if (!mockMode) persistentStorage = await hasPersistentStorage();
  try {
    const est = await navigator.storage?.estimate?.();
    storageUsed = est?.usage ?? null;
    storageQuota = est?.quota ?? null;
  } catch {
    /* ignore */
  }
  onInstallAvailability(refresh);
  refresh();
}
