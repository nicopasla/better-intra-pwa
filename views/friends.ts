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
import TRASH_SVG from "../assets/trash.svg?raw";

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
  sortMode =
    (localStorage.getItem("ft_pwa_friends_mode") as SortMode) || "level";
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
let deleteMode = false;
const selected = new Set<string>();
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
      arr.sort(
        (a, b) =>
          a.login.localeCompare(b.login) * (sortDir === "desc" ? -1 : 1),
      );
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
        <div class="flex items-center justify-between gap-2">
          <h2 class="card-title text-base">
            Friends${friends.length
              ? html`<span class="badge badge-primary badge-sm"
                  >${friends.length}</span
                >`
              : ""}
          </h2>
          <div class="flex items-center gap-1">
            ${deleteMode
              ? html` <button
                    class="btn btn-error btn-sm"
                    ?disabled=${selected.size === 0}
                    @click=${() => void confirmDelete()}
                  >
                    Delete (${selected.size})
                  </button>
                  <button class="btn btn-ghost btn-sm" @click=${exitDeleteMode}>
                    Cancel
                  </button>`
              : html`<button
                  class="btn btn-ghost btn-sm"
                  title="Delete friends"
                  @click=${enterDeleteMode}
                >
                  ${svg16(TRASH_SVG)}
                </button>`}
          </div>
        </div>
        ${loading
          ? html`<div class="flex justify-center py-8">
              <span class="loading loading-spinner loading-md"></span>
            </div>`
          : error
            ? html`<div class="flex flex-col items-center gap-2 py-6">
                <p class="text-sm opacity-70">Couldn't load friends.</p>
                <p class="text-xs text-error">${error}</p>
                <button
                  class="btn btn-sm btn-outline"
                  @click=${() => loadFriends(true)}
                >
                  Retry
                </button>
              </div>`
            : sorted().length === 0
              ? html`<p class="text-sm opacity-60 text-center py-6">
                  No
                  friends${onlineOnly ? " online" : ""}.${logins.length === 0
                    ? " Tap + to add one."
                    : ""}
                </p>`
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
      <button
        class="btn btn-sm btn-primary"
        title="Add friend"
        @click=${openAdd}
      >
        ${svg16(PLUS_SVG)}
      </button>
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
            class="btn btn-sm join-item px-2 flex-1 ${active
              ? "btn-primary"
              : ""}"
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
          >
            ${svg16(icon)}
          </button>`;
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
      >
        ${svg16(GLOBE_SVG)} ${onlineCount}
      </button>
      <button
        class="btn btn-sm btn-ghost"
        title="Refresh"
        @click=${() => loadFriends(true)}
      >
        ${svg16(RELOAD_SVG)}
      </button>
    </div>
  `;
}

function renderRow(f: Friend, idx: number) {
  const showOriginal = originalSet.has(f.login);
  const hasCustom = !!customAvatars && !!f.customAvatar;
  const showCustom = hasCustom && !showOriginal;
  const medal =
    sortMode === "level" &&
    sortDir === "desc" &&
    (idx === 0 || idx === 1 || idx === 2)
      ? [
          "0 0 18px rgba(255,215,0,.55)",
          "0 0 18px rgba(192,192,192,.5)",
          "0 0 18px rgba(205,127,50,.5)",
        ][idx]
      : "";
  const whole = Math.floor(f.level);
  const pct = Math.round((f.level % 1) * 100);
  const profile = `https://profile-v3.intra.42.fr/users/${encodeURIComponent(f.login)}`;

  return html`<li
    class="card bg-base-100 border border-base-300 shadow-sm p-3"
    style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:repeat(3,auto);column-gap:0.75rem;row-gap:0.25rem;align-items:stretch;"
  >
    <!-- Avatar (rows 1-2) -->
    <a
      href="${profile}"
      target="_blank"
      rel="noopener noreferrer"
      class="flex"
      style="grid-column:1;grid-row:1 / 3;align-self:center;"
    >
      <div class="avatar ${f.isOnline ? "avatar-online" : ""}">
        ${showCustom
          ? html`<button
              class="w-14 h-14 rounded-full ${medal}"
              style="background-image:url('${f.customAvatar}');background-size:${f.avatarScale ??
              100}%;background-position:${f.avatarPosX ?? 50}% ${f.avatarPosY ??
              50}%;background-color:${f.avatarBg ??
              "transparent"};background-repeat:no-repeat;"
              title="Show original avatar"
              @click=${() => {
                originalSet.add(f.login);
                refresh();
              }}
            ></button>`
          : html`<div class="w-14 h-14 rounded-full ${medal}">
              <img
                src="${f.avatar ?? "/icons/icon-192.png"}"
                onerror="this.onerror=null;this.src='/icons/icon-192.png'"
                class="w-full h-full rounded-full object-cover cursor-pointer"
                title="${hasCustom
                  ? showOriginal
                    ? "Show custom avatar"
                    : "Show original avatar"
                  : ""}"
                @click=${() => {
                  originalSet.delete(f.login);
                  refresh();
                }}
                alt="${f.login}"
              />
            </div>`}
      </div>
    </a>

    <!-- Level badge (row 3, under the avatar) -->
    <span
      class="badge badge-md badge-primary gap-1 px-2 ${medal}"
      style="border-radius:0.75rem;height:auto;padding-block:0.15rem;font-weight:600;grid-column:1;grid-row:3;justify-self:center;align-self:center;white-space:nowrap;"
    >
      <span class="text-sm font-bold font-mono">${f.level.toFixed(2)}</span>
    </span>

    <!-- Info columns -->
    <div style="display:contents;">
      <div
        class="flex items-center gap-1.5 flex-wrap min-w-0"
        style="grid-column:2;grid-row:1;"
      >
        <span class="font-bold text-lg text-primary truncate">${f.login}</span>
        ${f.displayName && f.displayName !== f.login
          ? html`<span class="text-sm opacity-80 truncate"
              >${f.displayName}</span
            >`
          : ""}
      </div>
      <div style="grid-column:2;grid-row:2;" class="min-w-0 overflow-hidden">
        ${metaBadges(f)}
      </div>
      <div
        class="overflow-hidden w-full"
        style="border-radius:0.75rem;grid-column:2;grid-row:3;align-self:center;"
      >
        <div class="flex items-center gap-1.5 w-full">
          <progress
            class="progress progress-primary flex-1"
            value="${pct}"
            max="100"
            style="height:1rem"
          ></progress>
          <span
            class="text-lg font-bold font-mono opacity-60 shrink-0 text-right"
            style="width:2rem;"
            >${whole + 1}</span
          >
        </div>
      </div>
    </div>

    <!-- Delete checkbox -->
    ${deleteMode
      ? html`<div
          class="shrink-0 self-center"
          style="grid-column:3;grid-row:1 / 4;align-self:center;"
        >
          <input
            type="checkbox"
            class="checkbox checkbox-error checkbox-sm"
            .checked=${selected.has(f.login)}
            aria-label="Select ${f.login} for deletion"
            @change=${() => toggleSelect(f.login)}
          />
        </div>`
      : ""}
  </li>`;
}

const accentStyle =
  "border:3px solid color-mix(in oklab, var(--color-accent) 40%, transparent);background-color:color-mix(in oklab, var(--color-accent) 10%, transparent);border-radius:0.75rem;height:auto;padding-block:0.15rem;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

function accentBadge(text: string) {
  return html`<span
    class="badge badge-md gap-1 px-2 font-mono"
    style="${accentStyle}"
    >${text}</span
  >`;
}

function statBadge(icon: string, value: string) {
  return html`<span
    class="badge badge-md gap-1 px-2 font-mono"
    style="${accentStyle}"
  >
    ${svg16(icon)}<span class="text-sm font-bold">${value}</span>
  </span>`;
}

function metaBadges(f: Friend) {
  const parts: unknown[] = [];
  if (f.grade) parts.push(accentBadge(f.grade));
  if (f.poolLabel) parts.push(accentBadge(f.poolLabel));
  if (f.isOnline && f.lastSeen) {
    parts.push(
      html`<a
        class="badge badge-success badge-md gap-1 px-2 hover:brightness-110 transition-all cursor-pointer no-underline"
        href="https://meta.intra.42.fr/clusters?seat=${encodeURIComponent(
          f.lastSeen,
        )}"
        target="_blank"
        rel="noopener noreferrer"
        style="border:3px solid color-mix(in oklab, var(--color-success) 55%, transparent);border-radius:0.75rem;height:auto;padding-block:0.15rem;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
        ><span class="text-sm font-semibold">${f.lastSeen}</span></a
      >`,
    );
  } else if (f.lastOnlineTimestamp) {
    parts.push(accentBadge(fmtAgo(f.lastOnlineTimestamp)));
  }
  parts.push(statBadge(WALLET_SVG, f.wallet.toLocaleString()));
  parts.push(statBadge(EVAL_SVG, String(f.correctionPoints)));
  return html`<div class="flex items-center gap-0 flex-wrap min-w-0">
    ${parts}
  </div>`;
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
            <button
              class="btn"
              type="button"
              @click=${() => addDialog?.close()}
            >
              Cancel
            </button>
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

function toggleSelect(login: string): void {
  if (selected.has(login)) selected.delete(login);
  else selected.add(login);
  refresh();
}

function enterDeleteMode(): void {
  deleteMode = true;
  selected.clear();
  refresh();
}

function exitDeleteMode(): void {
  deleteMode = false;
  selected.clear();
  refresh();
}

async function confirmDelete(): Promise<void> {
  const targets = [...selected];
  if (targets.length === 0) return;
  logins = logins.filter((l) => !targets.includes(l));
  selected.clear();
  deleteMode = false;
  try {
    await updateBlob({ FRIENDS_LIST: logins });
  } catch {
    /* keep local state */
  }
  await loadFriends(true);
}
