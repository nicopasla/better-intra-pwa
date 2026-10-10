import { html, type TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { until } from "lit-html/directives/until.js";
import { clearSession, getDeviceName, getSession } from "../api.ts";
import {
  BlobSettings,
  SessionItem,
  getBlob,
  logout,
  revokeSession,
  sessionsList,
  updateBlob,
} from "../data.ts";
import {
  disablePush,
  enablePush,
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
  countryFlag,
  countryTooltip,
  fetchCommunityStats,
  getFollowerCount,
  getRepoStars,
  PROFILE_URL,
  PWA_REPO_URL,
} from "../lib/community.ts";
import { clearCache, resetData } from "../lib/app-data.ts";
import {
  getThemePreference,
  setThemePreference,
  ThemePreference,
} from "../theme.ts";
import GITHUB_SVG from "../assets/github.svg?raw";
import ISSUES_SVG from "../assets/issues.svg?raw";
import PR_SVG from "../assets/pr.svg?raw";
import STAR_SVG from "../assets/star.svg?raw";
import FOLLOW_SVG from "../assets/person-follow.svg?raw";

const REPO_URL = "https://github.com/nicopasla/better-intra";

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

let blob: BlobSettings | null = null;
let sessions: SessionItem[] = [];
let loaded = false;
let busy = false;
let testing = false;
let logmeError = "";
let pushEnabled = false;
let pushMessage = "";
let quietEnabled = false;
let quietStart = "22:00";
let quietEnd = "08:00";
let discordEnabled = false;
let themeMode: ThemePreference = getThemePreference();
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

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

export function settingsView(): TemplateResult {
  const session = getSession();
  return html`
    ${section("Notifications", notificationsSection())}
    ${isStandalone() ? "" : section("Install", installSection())}
    ${section("Theme", themeSection())}
    ${section("Account", accountSection(session?.login ?? ""))}
    ${section("Community", communitySection())}
    ${section("About & Debug", aboutSection())}
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
  return html`
    <div class="join">
      ${THEME_OPTIONS.map(
        (o) =>
          html`<button
            type="button"
            class="btn btn-sm join-item ${themeMode === o.id
              ? "btn-primary"
              : ""}"
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
  `;
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
    <div class="divider my-0"></div>
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <span>Quiet hours</span>
      <input
        type="checkbox"
        class="toggle toggle-primary"
        .checked=${quietEnabled}
        @change=${(e: Event) => void setQuietToggle(e)}
      />
    </label>
    <div class="flex gap-2 items-center">
      <input
        type="time"
        class="input input-bordered input-sm"
        .value=${quietStart}
        @change=${(e: Event) =>
          void setQuietTimes({
            DISCORD_QUIET_START: (e.target as HTMLInputElement).value,
          })}
      />
      <span>to</span>
      <input
        type="time"
        class="input input-bordered input-sm"
        .value=${quietEnd}
        @change=${(e: Event) =>
          void setQuietTimes({
            DISCORD_QUIET_END: (e.target as HTMLInputElement).value,
          })}
      />
    </div>
    ${discordEnabled
      ? html`<p class="text-xs opacity-60">Discord DMs are also enabled.</p>`
      : ""}
  `;
}

function accountSection(login: string) {
  const groups = groupSessions(sessions);
  return html`
    <p class="text-sm">Signed in as <span class="font-bold">${login}</span></p>
    <div class="flex flex-col gap-1">
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
    <button
      class="btn btn-sm btn-error self-start"
      ?disabled=${busy}
      @click=${onLogout}
    >
      Sign out
    </button>
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
        ${s.countries.length > 0
          ? html`<div class="flex flex-wrap gap-1.5">
              ${s.countries.map(
                (c) =>
                  html`<span
                    class="badge badge-lg gap-1 bg-base-100"
                    style="border: 2px solid var(--color-info)"
                    title=${countryTooltip(c)}
                  >
                    <span>${countryFlag(c.country)}</span>
                    <span class="font-mono">${c.count}</span>
                  </span>`,
              )}
            </div>`
          : ""}
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

function aboutSection(): TemplateResult {
  const session = getSession();
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
          ${unsafeHTML(STAR_SVG)}
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
          ${unsafeHTML(FOLLOW_SVG)}
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

    ${diagGroup(
      "Connection",
      html`
        ${diagRow("Worker", workerBadge())}
        ${diagRow("Endpoint", endpointHost())}
        ${diagRow("Push permission", pushPermission())}
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
              ${unsafeHTML(link.svg)}
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

    <div class="divider my-0 opacity-20"></div>

    <details class="collapse collapse-arrow bg-base-100 border border-base-300">
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
      await enablePush();
      pushEnabled = true;
      void onTest();
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

function setQuietToggle(e: Event) {
  quietEnabled = (e.target as HTMLInputElement).checked;
  void updateQuiet({ DISCORD_QUIET_ENABLED: quietEnabled });
}

function setQuietTimes(patch: Record<string, string>) {
  void updateQuiet(patch);
}

async function updateQuiet(patch: Record<string, unknown>) {
  try {
    const next = {
      DISCORD_QUIET_ENABLED: quietEnabled,
      DISCORD_QUIET_START: quietStart,
      DISCORD_QUIET_END: quietEnd,
      ...patch,
    };
    quietEnabled = Boolean(next.DISCORD_QUIET_ENABLED);
    quietStart = String(next.DISCORD_QUIET_START || "22:00");
    quietEnd = String(next.DISCORD_QUIET_END || "08:00");
    await updateBlob(next);
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
    blob = b;
    sessions = s.sessions;
    discordEnabled = Boolean(b.discordId);
    quietEnabled = Boolean(b.settings.DISCORD_QUIET_ENABLED);
    quietStart = String(b.settings.DISCORD_QUIET_START || "22:00");
    quietEnd = String(b.settings.DISCORD_QUIET_END || "08:00");
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
