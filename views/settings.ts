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
  applyThemeSettings,
  currentResolvedTheme,
  currentThemeLabel,
  getThemePreference,
  setThemePreference,
  ThemeMode,
} from "../theme.ts";
import { presetLabel } from "../lib/theme-presets.ts";
import BELL_SVG from "../assets/bell.svg?raw";
import BELL_SLASH_SVG from "../assets/bell-slash.svg?raw";
import CALENDAR_PLUS_SVG from "../assets/calendar-plus.svg?raw";
import GITHUB_SVG from "../assets/github.svg?raw";
import ISSUES_SVG from "../assets/issues.svg?raw";
import PR_SVG from "../assets/pr.svg?raw";
import STAR_SVG from "../assets/star.svg?raw";
import FOLLOW_SVG from "../assets/person-follow.svg?raw";

const REPO_URL = "https://github.com/nicopasla/better-intra";

const svgIcon = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

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
let pushEnabled = false;
let pushMessage = "";
const NOTIFY_GROUPS: {
  title: string;
  hint: string;
  types: { key: string; label: string }[];
}[] = [
  {
    title: "Evaluations you give",
    hint: "When you're booked to evaluate someone.",
    types: [
      { key: "EVAL_NOTIFY_EVALUATOR_BOOKED", label: "Booked to evaluate" },
      { key: "EVAL_NOTIFY_EVALUATOR_REVEALED", label: "In 15 min" },
    ],
  },
  {
    title: "Evaluations you receive",
    hint: "When someone is assigned to evaluate you.",
    types: [{ key: "EVAL_NOTIFY_CORRECTED_REVEALED", label: "Your evaluator" }],
  },
  {
    title: "Events",
    hint: "15 minutes before a 42 event you're subscribed to.",
    types: [{ key: "EVENT_NOTIFY_SOON", label: "Starting in 15 min" }],
  },
];
let notifyTypes: Record<string, boolean> = {
  EVAL_NOTIFY_EVALUATOR_BOOKED: true,
  EVAL_NOTIFY_EVALUATOR_REVEALED: true,
  EVAL_NOTIFY_CORRECTED_REVEALED: true,
  EVENT_NOTIFY_SOON: true,
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
    ${section("About", aboutSection())}
    ${section("Notifications", notificationsSection())}
    ${isStandalone() ? "" : section("Install", installSection())}
    ${section("Theme", themeSection())}
    ${section("Calendar", calendarSection())}
    ${section("Account", accountSection(session?.login ?? ""))}
    ${section("Community", communitySection())}
    ${debugSection()}
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

function section(title: string, content: unknown) {
  return html`
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body gap-3">
        <h2 class="card-title text-base">${title}</h2>
        ${content}
      </div>
    </div>
  `;
}

function themeSection() {
  const resolved = currentResolvedTheme();
  return html`
    <div class="grid grid-cols-2 gap-2">
      ${THEME_OPTIONS.map(
        (o) =>
          html`<button
            type="button"
            class="btn btn-sm ${themeMode === o.id ? "btn-primary" : "btn-outline"}"
            @click="${() => {
              themeMode = o.id;
              setThemePreference(o.id);
              refresh();
            }}"
          >
            ${o.label}
          </button>`,
      )}
    </div>
    ${themeMode === "extension"
      ? html`<p class="text-center text-xs opacity-60">
          ${presetLabel(resolved.preset)}
        </p>`
      : ""}
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
        class="btn btn-primary btn-sm self-start gap-1.5"
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
      Your 42 events on your phone's calendar. The Better Intra extension
      keeps the events up to date.
    </p>
    <button
      type="button"
      class="btn btn-primary btn-sm self-start gap-1.5 ${calendarBusy
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
    return html`<p class="text-sm opacity-70">
      This browser does not support push notifications.
    </p>`;

  // iOS and Android deliver push most reliably to installed (standalone) apps.
  const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as { standalone?: boolean }).standalone);
  if (isMobile && !standalone) {
    return html`<div class="flex flex-col gap-2">
      <p class="text-sm opacity-70">
        Add this app to your Home Screen (Share → Add to Home Screen), then open
        it and enable notifications here.
      </p>
      <p class="text-xs opacity-60">
        iOS and Android deliver push notifications most reliably to installed
        (standalone) web apps.
      </p>
    </div>`;
  }

  return html`
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <span>Evaluation push</span>
      <input
        type="checkbox"
        class="toggle toggle-primary"
        .checked=${pushEnabled}
        ?disabled=${busy}
        @change=${onTogglePush}
      />
    </label>
    <div class="flex flex-wrap gap-2 self-start">
      <button
        class="btn btn-sm btn-outline ${testing ? "loading" : ""}"
        ?disabled=${!pushEnabled || testing}
        @click=${() => onTest()}
      >
        Send test
      </button>
    </div>
    ${pushMessage
      ? html`<p
          class="text-xs ${pushMessage.startsWith("Delivered")
            ? "text-success"
            : "text-warning"}"
        >
          ${pushMessage}
        </p>`
      : ""}
    ${NOTIFY_GROUPS.map(
      (g, i) => html`
        ${i > 0 ? html`<div class="divider my-0"></div>` : ""}
        <div class="flex flex-col gap-1.5 mt-1">
          <span class="text-sm font-semibold">${g.title}</span>
          <span class="text-xs opacity-60">${g.hint}</span>
          <div class="flex flex-wrap gap-2 mt-0.5">
            ${g.types.map(
              (t) =>
                html`<button
                  type="button"
                  class="btn btn-sm gap-1.5 ${notifyTypes[t.key]
                    ? "btn-primary"
                    : "btn-outline"}"
                  @click=${() => void toggleNotifyType(t.key)}
                >
                  <span class="size-4 flex items-center justify-center">
                    ${svgIcon(notifyTypes[t.key] ? BELL_SVG : BELL_SLASH_SVG)}
                  </span>
                  ${t.label}
                </button>`,
            )}
          </div>
        </div>
      `,
    )}
  `;
}

function accountSection(login: string) {
  const groups = groupSessions(sessions);
  return html`
    <div class="flex items-center justify-between gap-2">
      <span class="badge badge-lg badge-primary font-mono font-semibold"
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
              <span class="truncate">${g.primary.name ?? g.primary.label}</span>
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
            <span class="text-2xl font-bold font-mono leading-none"
              >${s.total}</span
            >
            <span class="text-xs opacity-60">users</span>
          </div>
          <div class="flex flex-wrap justify-end gap-1.5">
            ${windows.map(
              (w) =>
                html`<span
                  class="badge badge-lg gap-1 bg-base-100 font-mono"
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
    <div class="text-right font-mono text-sm opacity-70">${value}</div>
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
            class="badge badge-ghost font-mono"
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
              ? html`<span class="badge badge-sm font-mono">${c}</span>`
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
              ? html`<span class="badge badge-sm font-mono">${c}</span>`
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
      <summary class="collapse-title text-base font-semibold">Debug</summary>
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
  busy = true;
  pushMessage = "";
  refresh();
  try {
    const on = (e.target as HTMLInputElement).checked;
    if (on) {
      const res = await enablePushWithTest();
      pushEnabled = res.subscribed;
      pushMessage = res.delivered
        ? `Delivered by ${res.host} (${res.status}).${
            res.tracked ? "" : " Eval tracking is unavailable."
          }`
        : `Couldn't deliver a test notification${
            res.host ? ` via ${res.host}` : ""
          }${res.reason ? ` (${res.reason})` : ""}.${
            res.subscribed
              ? " Push remains enabled."
              : " Notifications stay off."
          }`;
    } else {
      await disablePush();
      pushEnabled = false;
    }
  } catch (err) {
    pushMessage =
      err instanceof Error && err.message === "permission_denied"
        ? "Notifications permission was denied."
        : "Could not update notifications.";
  } finally {
    busy = false;
    refresh();
  }
}

async function onTest() {
  testing = true;
  pushMessage = "";
  refresh();
  try {
    const res = await sendTest();
    pushMessage = res.ok
      ? `Delivered by ${res.host} (${res.status}).`
      : `Rejected (${res.status})${res.host ? ` by ${res.host}` : ""}${res.reason ? ` — ${res.reason}` : ""}.`;
  } catch {
    pushMessage = "Failed to reach the push service.";
  } finally {
    testing = false;
    refresh();
  }
}

async function toggleNotifyType(key: string) {
  notifyTypes = { ...notifyTypes, [key]: !notifyTypes[key] };
  refresh();
  try {
    await updateBlob({ [key]: notifyTypes[key] });
  } catch {
    /* ignore */
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
  } catch {
    /* ignore */
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
