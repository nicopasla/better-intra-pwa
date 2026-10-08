import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { ref } from "lit-html/directives/ref.js";
import { Friend, friendsData, getBlob, updateBlob } from "../data.ts";
import { refresh } from "../refresh.ts";
import SORT_AZ_SVG from "../assets/sort-az.svg?raw";
import SORT_ZA_SVG from "../assets/sort-za.svg?raw";
import RANKING_SVG from "../assets/ranking.svg?raw";
import WALLET_SVG from "../assets/wallet.svg?raw";
import EVAL_SVG from "../assets/eval.svg?raw";
import GLOBE_SVG from "../assets/globe-lucide.svg?raw";
import RELOAD_SVG from "../assets/reload.svg?raw";
import PLUS_SVG from "../assets/plus.svg?raw";
import X_SVG from "../assets/x.svg?raw";

type SortMode = "name" | "level" | "wallet" | "correction";
type SortDir = "asc" | "desc";

const DEFAULTS: Record<SortMode, SortDir> = {
  name: "asc",
  level: "desc",
  wallet: "desc",
  correction: "desc",
};

const MODES: SortMode[] = ["name", "level", "wallet", "correction"];
const LABELS: Record<SortMode, string> = {
  name: "Name",
  level: "Level",
  wallet: "Wallet",
  correction: "Eval points",
};

let sortMode: SortMode = "level";
let sortDir: SortDir = "desc";
let onlineOnly = false;
let customAvatars = true;

function loadPrefs() {
  sortMode = (localStorage.getItem("ft_pwa_friends_mode") as SortMode) || "level";
  sortDir = (localStorage.getItem("ft_pwa_friends_dir") as SortDir) || "desc";
  onlineOnly = localStorage.getItem("ft_pwa_friends_online") === "true";
  customAvatars = localStorage.getItem("ft_pwa_friends_custom") !== "false";
}

loadPrefs();

let friends: Friend[] = [];
let logins: string[] = [];
let loading = true;
let error = "";
let addValue = "";
let loaded = false;
const originalSet = new Set<string>();

const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

function savePreference() {
  localStorage.setItem("ft_pwa_friends_mode", sortMode);
  localStorage.setItem("ft_pwa_friends_dir", sortDir);
  localStorage.setItem("ft_pwa_friends_online", String(onlineOnly));
  localStorage.setItem("ft_pwa_friends_custom", String(customAvatars));
}

function sorted(): Friend[] {
  const arr = onlineOnly ? friends.filter((f) => f.isOnline) : [...friends];
  const mul = sortDir === "desc" ? 1 : -1;
  switch (sortMode) {
    case "name":
      arr.sort((a, b) => a.login.localeCompare(b.login) * (sortDir === "desc" ? -1 : 1));
      break;
    case "level":
      arr.sort((a, b) => (b.level - a.level) * mul);
      break;
    case "wallet":
      arr.sort((a, b) => (b.wallet - a.wallet) * mul);
      break;
    case "correction":
      arr.sort((a, b) => (b.correctionPoints - a.correctionPoints) * mul);
      break;
  }
  return arr;
}

export function friendsView(): unknown {
  const onlineCount = friends.filter((f) => f.isOnline).length;
  return html`
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body gap-3">
        <h2 class="card-title text-base">Friends${friends.length ? html`<span class="badge badge-primary badge-sm">${friends.length}</span>` : ""}</h2>
        ${loading
          ? html`<div class="flex justify-center py-8"><span class="loading loading-spinner loading-md"></span></div>`
          : error
            ? html`<div class="flex flex-col items-center gap-2 py-6">
                <p class="text-sm opacity-70">Couldn't load friends.</p>
                <p class="text-xs text-error">${error}</p>
                <button class="btn btn-sm btn-outline" @click=${() => loadFriends(true)}>Retry</button>
              </div>`
            : sorted().length === 0
              ? html`<p class="text-sm opacity-60 text-center py-6">No friends${onlineOnly ? " online" : ""}.${logins.length === 0 ? " Tap + to add one." : ""}</p>`
              : html`<ul class="flex flex-col gap-3">
                  ${sorted().map((f, i) => renderRow(f, i))}
                </ul>`}
        <div class="h-24"></div>
      </div>
    </div>

    <div
      class="fixed inset-x-0 z-10 border-t border-base-300 bg-base-100 px-3 py-2 flex items-center gap-2"
      style="bottom: calc(4rem + env(safe-area-inset-bottom));"
    >
      <button class="btn btn-sm btn-circle btn-primary" title="Add friend" @click=${openAdd}>${svg16(PLUS_SVG)}</button>
      <div class="join join-horizontal flex-1">
        ${MODES.map((m) => {
          const active = m === sortMode;
          const icon =
            m === "name"
              ? (active ? sortDir : DEFAULTS.name) === "asc"
                ? SORT_AZ_SVG
                : SORT_ZA_SVG
              : m === "level"
                ? RANKING_SVG
                : m === "wallet"
                  ? WALLET_SVG
                  : EVAL_SVG;
          return html`<button
            class="btn btn-sm join-item px-2 flex-1 ${active ? "btn-primary" : ""}"
            title="${LABELS[m]}${active ? ` (${sortDir})` : ""}"
            @click=${() => {
              if (active) sortDir = sortDir === "asc" ? "desc" : "asc";
              else {
                sortMode = m;
                sortDir = DEFAULTS[m];
              }
              savePreference();
              refresh();
            }}
          >${svg16(icon)}</button>`;
        })}
      </div>
      <button
        class="btn btn-sm ${onlineOnly ? "btn-primary" : "btn-outline"} gap-1"
        title="Online only"
        @click=${() => {
          onlineOnly = !onlineOnly;
          savePreference();
          refresh();
        }}
      >${svg16(GLOBE_SVG)} ${onlineCount}</button>
      <button class="btn btn-sm btn-ghost" title="Refresh" @click=${() => loadFriends(true)}>${svg16(RELOAD_SVG)}</button>
    </div>
  `;
}

function renderRow(f: Friend, idx: number) {
  const showOriginal = originalSet.has(f.login);
  const showCustom = customAvatars && f.customAvatar && !showOriginal;
  const medal =
    sortMode === "level" &&
    sortDir === "desc" &&
    (idx === 0 || idx === 1 || idx === 2)
      ? ["0 0 18px rgba(255,215,0,.55)", "0 0 18px rgba(192,192,192,.5)", "0 0 18px rgba(205,127,50,.5)"][idx]
      : "";
  const whole = Math.floor(f.level);
  const pct = Math.round((f.level % 1) * 100);

  return html`<li class="card bg-base-100 border border-base-300 shadow-sm p-3 flex items-start gap-3">
      <div class="flex-none relative" style="width:2.75rem;height:2.75rem;${medal ? `border-radius:9999px;box-shadow:${medal};` : ""}">
        ${showCustom
          ? html`<button
              class="w-full h-full rounded-full"
              style="background-image:url('${f.customAvatar}');background-size:${f.avatarScale ?? 100}%;background-position:${f.avatarPosX ?? 50}% ${f.avatarPosY ?? 50}%;background-color:${f.avatarBg ?? "transparent"};background-repeat:no-repeat;"
              title="Show original avatar"
              @click=${() => {
                originalSet.add(f.login);
                refresh();
              }}
            ></button>`
          : html`<img
              src="${f.avatar ?? "/icons/icon-192.png"}"
              onerror="this.onerror=null;this.src='/icons/icon-192.png'"
              class="w-full h-full rounded-full object-cover"
              title="Show custom avatar"
              @click=${() => {
                originalSet.delete(f.login);
                refresh();
              }}
              alt=""
            />`}
        ${f.isOnline
          ? html`<span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-base-100"></span>`
          : ""}
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2">
          <span class="font-bold text-sm truncate">${f.login}</span>
          ${f.displayName && f.displayName !== f.login ? html`<span class="text-xs opacity-50 truncate">${f.displayName}</span>` : ""}
          <span class="badge badge-primary badge-sm font-mono ml-auto">${f.level.toFixed(2)}</span>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <progress class="progress progress-primary flex-1" max="100" value="${pct}"></progress>
          <span class="text-xs opacity-50">${whole + 1}</span>
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          ${f.grade ? html`<span class="badge badge-outline badge-sm">${f.grade}</span>` : ""}
          ${f.poolLabel ? html`<span class="badge badge-outline badge-sm">${f.poolLabel}</span>` : ""}
          ${f.isOnline && f.lastSeen
            ? html`<a class="badge badge-success badge-sm gap-1" href="https://meta.intra.42.fr/clusters?seat=${encodeURIComponent(f.lastSeen)}" target="_blank" rel="noopener noreferrer">${f.lastSeen}</a>`
            : f.lastOnlineTimestamp
              ? html`<span class="opacity-50">seen ${fmtAgo(f.lastOnlineTimestamp)}</span>`
              : ""}
          <span class="ml-auto flex gap-2 font-mono">
            ${svg16(WALLET_SVG)}${f.wallet.toLocaleString()}
            ${svg16(EVAL_SVG)}${f.correctionPoints}
          </span>
          <button
            class="btn btn-ghost btn-xs text-error"
            title="Remove friend"
            @click=${() => void removeFriend(f.login)}
          >${unsafeHTML(X_SVG.replace("<svg", '<svg width="14" height="14"'))}</button>
        </div>
      </div>
    </li>`;
}

function fmtAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export async function loadFriends(force = false): Promise<void> {
  if (loaded && !force && !error) return;
  loading = true;
  error = "";
  refresh();
  try {
    const blob = await getBlob();
    const list = blob.settings.FRIENDS_LIST;
    logins = Array.isArray(list) ? list.map((l) => String(l)) : [];
    const data = await friendsData(logins);
    friends = Array.isArray(data) ? data : [];
    loaded = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
    refresh();
  }
}

let addDialog: HTMLDialogElement | null = null;
let addInput: HTMLInputElement | null = null;
let addErrEl: HTMLParagraphElement | null = null;

function ensureAddDialog(): HTMLDialogElement {
  if (addDialog && addDialog.isConnected) return addDialog;
  addDialog = document.createElement("dialog");
  addDialog.className = "modal";
  render(
    html`
      <div class="modal-box">
        <form
          @submit=${(e: Event) => {
            e.preventDefault();
            void submitAdd();
          }}
        >
          <h3 class="font-bold text-lg mb-2">Add a friend</h3>
          <input
            class="input input-bordered w-full"
            placeholder="42 login"
            autocomplete="off"
            ref=${(el: Element | undefined) => {
              addInput = (el as HTMLInputElement | undefined) ?? null;
            }}
            @input=${(e: Event) => {
              addValue = (e.target as HTMLInputElement).value.trim();
              if (addErrEl) addErrEl.hidden = true;
            }}
          />
          <p
            class="text-xs text-error mt-1"
            ref=${(el: Element | undefined) => {
              addErrEl = (el as HTMLParagraphElement | undefined) ?? null;
            }}
            hidden
          ></p>
          <div class="modal-action">
            <button class="btn" type="button" @click=${() => addDialog?.close()}>Cancel</button>
            <button class="btn btn-primary" type="submit">Add</button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    `,
    addDialog,
  );
  document.body.appendChild(addDialog);
  return addDialog;
}

function openAdd(): void {
  const d = ensureAddDialog();
  addValue = "";
  if (addInput) addInput.value = "";
  if (addErrEl) addErrEl.hidden = true;
  d.showModal();
}

async function submitAdd(): Promise<void> {
  const clean = addValue.trim().toLowerCase();
  if (!clean) {
    if (addErrEl) {
      addErrEl.textContent = "Enter a login.";
      addErrEl.hidden = false;
    }
    return;
  }
  if (logins.includes(clean)) {
    addDialog?.close();
    return;
  }
  try {
    const [candidate] = await friendsData([clean]);
    if (!candidate) {
      if (addErrEl) {
        addErrEl.textContent = "User not found.";
        addErrEl.hidden = false;
      }
      return;
    }
    logins = [...logins, clean];
    await updateBlob({ FRIENDS_LIST: logins });
    addValue = "";
    addDialog?.close();
    await loadFriends(true);
  } catch {
    if (addErrEl) {
      addErrEl.textContent = "Couldn't add friend.";
      addErrEl.hidden = false;
    }
  }
}

async function removeFriend(login: string): Promise<void> {
  logins = logins.filter((l) => l !== login);
  try {
    await updateBlob({ FRIENDS_LIST: logins });
    await loadFriends(true);
  } catch {
    /* keep local state */
    refresh();
  }
}