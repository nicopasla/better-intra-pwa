import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import {
  clearSession,
  getSession,
} from "../api.ts";
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
import GITHUB_SVG from "../assets/github.svg?raw";

const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

function format24h(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let blob: BlobSettings | null = null;
let sessions: SessionItem[] = [];
let loaded = false;
let busy = false;
let logmeError = "";
let pushEnabled = false;
let pushMessage = "";
let quietEnabled = false;
let quietStart = "22:00";
let quietEnd = "08:00";
let discordEnabled = false;
let customAvatars = localStorage.getItem("ft_pwa_friends_custom") !== "false";

export function settingsView(): unknown {
  const session = getSession();
  return html`
    ${section("Notifications", notificationsSection())}

    ${section("Friends", html`
      <label class="flex items-center justify-between gap-3 cursor-pointer">
        <span>Custom avatars</span>
        <input type="checkbox" class="toggle toggle-primary" .checked=${customAvatars} @change=${(e: Event) => {
          customAvatars = (e.target as HTMLInputElement).checked;
          localStorage.setItem("ft_pwa_friends_custom", String(customAvatars));
          void updateBlob({ SHOW_CUSTOM_AVATARS_IN_FRIENDS: customAvatars }).catch(() => undefined);
          refresh();
        }} />
      </label>
      <p class="text-xs opacity-60">Friend avatars and their look come from each person's Better Intra settings.</p>
    `)}

    ${section("Account", accountSection(session?.login ?? ""))}
    ${section("About & Debug", aboutSection())}

    ${logmeError ? html`<p class="text-xs text-error text-center">${logmeError}</p>` : ""}
  `;
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

function notificationsSection() {
  if (!pushSupported()) return html`<p class="text-sm opacity-70">This browser does not support push notifications.</p>`;
  return html`
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <span>Evaluation push</span>
      <input type="checkbox" class="toggle toggle-primary" .checked=${pushEnabled} ?disabled=${busy} @change=${onTogglePush} />
    </label>
    <button class="btn btn-sm btn-outline self-start" ?disabled=${busy || !pushEnabled} @click=${onTest}>Send test</button>
    ${pushMessage ? html`<p class="text-xs ${pushMessage.startsWith("Delivered") ? "text-success" : "text-warning"}">${pushMessage}</p>` : ""}
    <div class="divider my-0"></div>
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <span>Quiet hours</span>
      <input type="checkbox" class="toggle toggle-primary" .checked=${quietEnabled} @change=${(e: Event) => void setQuietToggle(e)} />
    </label>
    <div class="flex gap-2 items-center">
      <input type="time" class="input input-bordered input-sm" .value=${quietStart} @change=${(e: Event) => void setQuietTimes({ DISCORD_QUIET_START: (e.target as HTMLInputElement).value })} />
      <span>to</span>
      <input type="time" class="input input-bordered input-sm" .value=${quietEnd} @change=${(e: Event) => void setQuietTimes({ DISCORD_QUIET_END: (e.target as HTMLInputElement).value })} />
    </div>
    ${discordEnabled
      ? html`<p class="text-xs opacity-60">Discord DMs are also enabled${blob?.discordUsername ? ` for ${blob.discordUsername}` : ""}.</p>`
      : ""}
  `;
}

function accountSection(login: string) {
  return html`
    <p class="text-sm">Signed in as <span class="font-bold">${login}</span></p>
    <div class="flex flex-col gap-1">
      ${sessions.map(
        (s) => html`<div class="flex items-center justify-between gap-2 text-sm">
          <div class="min-w-0">
            <div class="truncate">${s.name ?? s.label}${s.current ? html` <span class="badge badge-primary badge-sm">this phone</span>` : ""}</div>
            ${s.createdAt ? html`<div class="text-xs opacity-50">${format24h(s.createdAt)}</div>` : ""}
          </div>
          ${s.current ? "" : html`<button class="btn btn-xs btn-ghost text-error" @click=${() => void doRevoke(s.id)}>Revoke</button>`}
        </div>`,
      )}
    </div>
    <button class="btn btn-sm btn-error self-start" ?disabled=${busy} @click=${onLogout}>Sign out</button>
  `;
}

function aboutSection() {
  const session = getSession();
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  return html`
    <a class="link text-sm inline-flex items-center gap-1" href="https://github.com/nicopasla/better-intra" target="_blank" rel="noopener noreferrer">
      ${svg16(GITHUB_SVG)} github.com/nicopasla/better-intra
    </a>
    <dl class="text-sm flex flex-col gap-1 opacity-80">
      <div class="flex justify-between"><dt>App version</dt><dd class="font-mono">${version}</dd></div>
      <div class="flex justify-between"><dt>Worker</dt><dd class="font-mono">${workerStatus()}</dd></div>
      <div class="flex justify-between"><dt>Push permission</dt><dd class="font-mono">${Notification.permission}</dd></div>
      <div class="flex justify-between"><dt>Endpoint</dt><dd class="font-mono">${endpointHost()}</dd></div>
      <div class="flex justify-between"><dt>Standalone</dt><dd class="font-mono">${(navigator as { standalone?: boolean }).standalone ? "yes" : "no"}</dd></div>
      <div class="flex justify-between"><dt>Service worker</dt><dd class="font-mono">${navigator.serviceWorker.controller ? "controlling" : "idle"}</dd></div>
      <div class="flex justify-between"><dt>Login</dt><dd class="font-mono">${session?.login ?? "—"}</dd></div>
    </dl>
    <p class="text-xs opacity-50">MIT License · by <span class="italic">nicopasla</span></p>
  `;
}

let workerOk: boolean | null = null;
let workerOkChecked = false;
let subHost = "";

function workerStatus(): string {
  if (!workerOkChecked) return "checking…";
  return workerOk ? "reachable" : "unreachable";
}

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
  busy = true;
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
    busy = false;
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

async function doRevoke(id: string) {
  busy = true;
  refresh();
  try {
    await revokeSession(id);
    sessions = sessions.filter((s) => s.id !== id);
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
      const res = await fetch("https://api.betterintra.com/api/v1/public/push/key");
      workerOk = res.ok;
    } catch {
      workerOk = false;
    }
  } else {
    workerOk = true;
  }
  workerOkChecked = true;
  refresh();
}