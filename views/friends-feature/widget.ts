import { html, render } from "lit-html";
import type { TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import {
  FriendData,
  addFriend,
  clearFriendsCache,
  fetchFriendsData,
  getFriendsList,
  isFriend,
  removeFriend,
} from "./friends.ts";
import { loginUrl, getSession } from "../../api.ts";
import { saveData } from "../../lib/network.ts";
import { relativeTime } from "../../lib/format.ts";
import FRIENDS_SVG from "../../assets/friends.svg?raw";
import GHOST_SVG from "../../assets/ghost.svg?raw";
import WARNING_SVG from "../../assets/triangle-exclamation.svg?raw";
import FORTY_TWO_SVG from "../../assets/42_Logo.svg?raw";
import GLOBE_SVG from "../../assets/globe-lucide.svg?raw";
import SORT_AZ_SVG from "../../assets/sort-az.svg?raw";
import SORT_ZA_SVG from "../../assets/sort-za.svg?raw";
import RANKING_SVG from "../../assets/ranking.svg?raw";
import WALLET_SVG from "../../assets/wallet.svg?raw";
import EVAL_SVG from "../../assets/eval.svg?raw";
import TRASH_SVG from "../../assets/trash.svg?raw";
import PLUS_SVG from "../../assets/plus.svg?raw";
import ARROW_SHARE_SVG from "../../assets/arrow_share.svg?raw";

const MEDALS = ["medal-glow-gold", "medal-glow-silver", "medal-glow-bronze"];

const showingOriginalAvatars = new Map<string, boolean>();

function levelFraction(level: number): number {
  return level % 1;
}

function renderLevelBar(level: number) {
  const pct = Math.round(levelFraction(level) * 100);
  const whole = Math.floor(level);
  return html`
    <div class="flex items-center gap-1.5 w-full">
      <progress
        class="progress progress-primary flex-1"
        value="${pct}"
        max="100"
        style="height:1rem"
        aria-label="Level progress to level ${whole + 1}"
      ></progress>
      <span class="text-lg font-bold font-mono opacity-60 w-8 shrink-0"
        >${whole + 1}</span
      >
    </div>
  `;
}

function renderFriendRow(
  friend: FriendData,
  rank = -1,
  showCustomAvatars = true,
  deleteMode = false,
  selected = false,
  onToggleSelect?: (login: string) => void,
) {
  const medalClass = rank >= 0 && rank < MEDALS.length ? MEDALS[rank] : "";
  const hasCustom = !!(
    !saveData &&
    showCustomAvatars &&
    friend.customAvatar &&
    friend.customAvatar !== friend.avatar
  );
  const showingOriginal = showingOriginalAvatars.get(friend.login) ?? false;
  const showCustom = hasCustom && !showingOriginal;
  const currentSrc = saveData
    ? null
    : hasCustom && !showingOriginal
      ? friend.customAvatar
      : friend.avatar;
  const toggleTitle = hasCustom
    ? showingOriginal
      ? "Click to view custom avatar"
      : "Click to view original avatar"
    : "";

  const toggleCustom = hasCustom
    ? (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        const isOrig = showingOriginalAvatars.get(friend.login) ?? false;
        showingOriginalAvatars.set(friend.login, !isOrig);
        renderWidgetUI();
      }
    : undefined;

  const accentStyle =
    "border:3px solid color-mix(in oklab, var(--color-accent) 40%, transparent);background-color:color-mix(in oklab, var(--color-accent) 10%, transparent);border-radius:0.75rem;height:auto;padding-block:0.15rem;";

  return html`
    <!-- Avatar -->
    <div class="shrink-0 flex items-center" data-ft-avatar-col>
      <a
        href="https://profile-v3.intra.42.fr/users/${friend.login}"
        target="_blank"
        rel="noopener noreferrer"
        class="flex"
        @click="${(e: Event) => e.stopPropagation()}"
      >
        ${currentSrc
          ? html`<div class="avatar ${friend.isOnline ? "avatar-online" : ""}">
              ${showCustom
                ? html`<div
                    class="w-14 h-14 rounded-full cursor-pointer ${medalClass}"
                    style="background-image:url(${currentSrc});background-size:${friend.avatarScale ??
                    100}%;background-position:${friend.avatarPosX ??
                    50}% ${friend.avatarPosY ??
                    50}%;background-color:${friend.avatarBg ||
                    "transparent"};background-repeat:no-repeat;"
                    data-tip="${toggleTitle}"
                    @click="${toggleCustom}"
                  ></div>`
                : html`<div class="w-14 h-14 rounded-full ${medalClass}">
                    <img
                      src="${currentSrc}"
                      alt="${friend.login}"
                      loading="lazy"
                      data-tip="${toggleTitle}"
                      @click="${toggleCustom}"
                      @error="${(e: Event) => {
                        const img = e.target as HTMLImageElement;
                        if (img.dataset.fallback === "letter") return;
                        if (
                          hasCustom &&
                          !img.dataset.fallback &&
                          friend.avatar
                        ) {
                          img.dataset.fallback = "42";
                          img.src = friend.avatar;
                          return;
                        }
                        img.dataset.fallback = "letter";
                        const container = img.closest(".avatar");
                        if (!container) return;
                        const wrapper =
                          container.querySelector<HTMLElement>(".w-14");
                        if (!wrapper) return;
                        render(
                          html`<span class="text-base font-bold"
                            >${friend.login[0].toUpperCase()}</span
                          >`,
                          wrapper,
                        );
                        container.classList.add("avatar-placeholder");
                        container.classList.remove("avatar-online");
                        img.remove();
                      }}"
                    />
                  </div>`}
            </div>`
          : html`<div
              class="avatar avatar-placeholder ${friend.isOnline
                ? "avatar-online"
                : ""}"
            >
              <div class="w-14 h-14 rounded-full ${medalClass}">
                <span class="text-base font-bold"
                  >${friend.login[0].toUpperCase()}</span
                >
              </div>
            </div>`}
      </a>
    </div>

    <!-- Level badge -->
    <div
      class="badge badge-md badge-primary gap-1 px-2 ${medalClass}"
      data-ft-level-badge
      style="border-radius:0.75rem;height:auto;padding-block:0.15rem;font-weight:600;"
    >
      <span class="text-sm font-bold font-mono"
        >${friend.level.toFixed(2)}</span
      >
    </div>

    <!-- Main info -->
    <a
      href="https://profile-v3.intra.42.fr/users/${friend.login}"
      target="_blank"
      rel="noopener noreferrer"
      class="no-underline text-base-content"
      data-ft-info
      @click="${(e: Event) => e.stopPropagation()}"
    >
      <!-- Login + display name -->
      <div
        class="flex items-center gap-1.5 flex-wrap min-w-0"
        data-ft-row="name"
      >
        <span class="font-bold text-lg text-primary">${friend.login}</span>
        ${friend.displayName && friend.displayName !== friend.login
          ? html`<span class="text-sm opacity-80 truncate"
              >${friend.displayName}</span
            >`
          : ""}
      </div>

      <!-- Grade + pool -->
      ${friend.grade || friend.poolLabel
        ? html` <div
            class="flex items-center gap-1 flex-wrap min-w-0"
            data-ft-row="meta"
          >
            ${[
              friend.grade
                ? html`<span
                    class="badge badge-md gap-1 px-2"
                    style="${accentStyle}"
                    >${friend.grade}</span
                  >`
                : "",
              friend.poolLabel
                ? html`<span
                    class="badge badge-md gap-1 px-2"
                    style="${accentStyle}"
                    >${friend.poolLabel}</span
                  >`
                : "",
            ].filter((p) => p)}
          </div>`
        : ""}

      <!-- Evaluation points + wallet + location -->
      <div
        class="flex items-center gap-1 flex-wrap min-w-0"
        data-ft-row="stats"
      >
        ${[
          html`<span class="badge badge-md gap-1 px-2" style="${accentStyle}"
            >${unsafeHTML(svgIcon(EVAL_SVG))}<span class="text-sm font-semibold"
              >${friend.correctionPoints}</span
            ></span
          >`,
          html`<span class="badge badge-md gap-1 px-2" style="${accentStyle}"
            >${unsafeHTML(svgIcon(WALLET_SVG))}<span class="text-sm font-semibold"
              >${friend.wallet}</span
            ></span
          >`,
          friend.isOnline && friend.lastSeen
            ? html`<a
                href="${clusterUrl(friend.lastSeen)}"
                target="_blank"
                rel="noopener noreferrer"
                class="badge badge-success badge-md gap-1 px-2 hover:brightness-110 transition-all cursor-pointer no-underline"
                style="border:3px solid color-mix(in oklab, var(--color-success) 55%, transparent);border-radius:0.75rem;height:auto;padding-block:0.15rem;font-weight:600;"
                data-tip="View ${friend.lastSeen} on cluster map"
              >
                <span class="text-sm font-semibold">${friend.lastSeen}</span>
                <span
                  class="size-2.5 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  >${unsafeHTML(ARROW_SHARE_SVG)}</span
                >
              </a>`
            : !friend.isOnline && friend.lastOnlineTimestamp
              ? html`<span
                  class="badge badge-md gap-1 px-2 font-mono"
                  style="${accentStyle}"
                  >${relativeTime(friend.lastOnlineTimestamp)}</span
                >`
              : "",
        ].filter((p) => p)}
      </div>

      <!-- Level bar -->
      <div
        class="overflow-hidden w-full"
        style="border-radius:0.75rem;"
        data-ft-row="level"
      >
        ${renderLevelBar(friend.level)}
      </div>
    </a>

    ${deleteMode
      ? html`<label
          class="list-col shrink-0 self-center flex items-center cursor-pointer"
          data-ft-delete-col
          @click="${(e: Event) => e.stopPropagation()}"
        >
          <input
            type="checkbox"
            class="checkbox checkbox-error checkbox-sm"
            .checked="${selected}"
            @change="${() => onToggleSelect?.(friend.login)}"
            aria-label="Select ${friend.login} for deletion"
          />
        </label>`
      : ""}
  `;
}

function clusterUrl(location: string): string {
  return `https://meta.intra.42.fr/clusters?seat=${location}`;
}

function renderEmpty() {
  return html`
    <div class="flex flex-col items-center gap-2 py-16 opacity-40">
      <span
        class="w-16 h-16 [&>svg]:w-full [&>svg]:h-full [&>svg]:stroke-current"
        >${unsafeHTML(GHOST_SVG)}</span
      >
      <p class="text-sm font-bold">No friends yet</p>
      <p class="text-xs">Add one using the input below</p>
    </div>
  `;
}

function renderLoadError(onRefresh: () => void) {
  return html`
    <div class="flex flex-col items-center gap-2 py-16 px-6 text-center">
      <span
        class="w-16 h-16 opacity-40 [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
        >${unsafeHTML(FRIENDS_SVG)}</span
      >
      <p class="text-sm font-bold">Couldn't load your friends</p>
      <p class="text-xs opacity-60">
        Your list is saved — the server didn't answer.
      </p>
      <button
        type="button"
        class="btn btn-primary btn-sm font-bold mt-2"
        @click="${onRefresh}"
      >
        Retry
      </button>
    </div>
  `;
}

type SortMode = "name" | "level" | "wallet" | "correction";
type SortDir = "asc" | "desc";

const SORT_DEFAULTS: Record<SortMode, SortDir> = {
  name: "asc",
  level: "desc",
  wallet: "desc",
  correction: "desc",
};

const SORT_ICONS: Record<Exclude<SortMode, "name">, string> = {
  level: RANKING_SVG,
  wallet: WALLET_SVG,
  correction: EVAL_SVG,
};

function sortModeIcon(mode: SortMode, dir: SortDir): string {
  if (mode === "name") {
    return dir === "asc" ? SORT_AZ_SVG : SORT_ZA_SVG;
  }
  return SORT_ICONS[mode];
}

function sortFriends(
  friends: FriendData[],
  mode: SortMode,
  dir: SortDir = "desc",
): FriendData[] {
  const sorted = [...friends];
  const dirMul = dir === "desc" ? 1 : -1;
  switch (mode) {
    case "name":
      sorted.sort(
        (a, b) => a.login.localeCompare(b.login) * (dir === "desc" ? -1 : 1),
      );
      break;
    case "level":
      sorted.sort((a, b) => (b.level - a.level) * dirMul);
      break;
    case "wallet":
      sorted.sort((a, b) => (b.wallet - a.wallet) * dirMul);
      break;
    case "correction":
      sorted.sort((a, b) => (b.correctionPoints - a.correctionPoints) * dirMul);
      break;
  }
  return sorted;
}

interface WidgetState {
  open: boolean;
  loading: boolean;
  loadError: boolean;
  friends: FriendData[];
  sortBy: SortMode;
  sortDir: SortDir;
  onlineOnly: boolean;
  addInput: string;
  addLoading: boolean;
  addError: string;
  addOpen: boolean;
  lastFetch: number | null;
  theme: string;
  needsReconnect: boolean;
  notConnected: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onSortChange: (mode: SortMode, dir: SortDir) => void;
  onToggleOnline: () => void;
  deleteMode: boolean;
  selected: string[];
  onDeleteMode: () => void;
  onToggleSelect: (login: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onInputChange: (val: string) => void;
  onAdd: () => void;
  onToggleAdd: () => void;
  onConnect: () => void;
  showCustomAvatars: boolean;
}

const SORT_LABELS: Record<SortMode, string> = {
  name: "Name",
  level: "Level",
  wallet: "Wallet",
  correction: "Evaluation",
};

const SORT_MODES: SortMode[] = ["name", "level", "wallet", "correction"];

const svgIcon = (raw: string, size = 16) =>
  raw.replace("<svg", `<svg width="${size}" height="${size}"`);

function renderSortControl(
  current: SortMode,
  dir: SortDir,
  primaryColor: string,
  primaryContent: string,
  onChange: (mode: SortMode, dir: SortDir) => void,
) {
  return html`
    <div class="join join-horizontal" data-tip="Sort by">
      ${SORT_MODES.map(
        (m) => html`
          <button
            type="button"
            class="btn btn-md join-item px-0 w-11"
            style="height:2.5rem;${current === m
              ? `background-color:${primaryColor};border-color:${primaryColor};color:${primaryContent};`
              : ""}"
            data-tip="${SORT_LABELS[m]}${current === m
              ? ` (${dir === "asc" ? "ascending" : "descending"})`
              : ""}"
            @click="${() =>
              onChange(
                m,
                current === m
                  ? dir === "asc"
                    ? "desc"
                    : "asc"
                  : SORT_DEFAULTS[m],
              )}"
          >
            <span
              class="w-5 h-5 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              >${unsafeHTML(
                svgIcon(
                  sortModeIcon(m, current === m ? dir : SORT_DEFAULTS[m]),
                ),
              )}</span
            >
          </button>
        `,
      )}
    </div>
  `;
}

function renderWidget(state: WidgetState) {
  const onlineCount = state.friends.filter((f) => f.isOnline).length;
  const visible = state.onlineOnly
    ? state.friends.filter((f) => f.isOnline)
    : state.friends;
  const sorted = sortFriends(visible, state.sortBy, state.sortDir);
  const primaryColor = "var(--color-primary)";
  const primaryContent = "var(--color-primary-content)";

  return html`
    <style>
      .friends-feature {
        display: block;
      }

      @keyframes rainbow-shift {
        from {
          background-position: 200% 0;
        }
        to {
          background-position: 0% 0;
        }
      }

      .badge-rainbow {
        background: linear-gradient(
          90deg,
          #ff0000,
          #ff7f00,
          #ffeb3b,
          #4caf50,
          #00bcd4,
          #2196f3,
          #3f51b5,
          #9c27b0,
          #e91e63,
          #ff0000
        );
        background-size: 200% 100% !important;
        animation: rainbow-shift 5s linear infinite !important;
        border: none !important;
        color: white !important;
        text-shadow: 0px 1px 2px rgba(0, 0, 0, 0.2);
      }

      @media (prefers-reduced-motion: reduce) {
        .badge-rainbow {
          animation: none !important;
        }
      }

      .medal-glow-gold,
      .medal-glow-silver,
      .medal-glow-bronze {
        box-sizing: content-box;
        border-width: 3px;
        border-style: solid;
        border-radius: 9999px;
      }
      .medal-glow-gold {
        --ft-medal-color: #ffd700;
        border-color: #ffd700;
        box-shadow:
          0 0 6px 2px rgba(255, 215, 0, 0.85),
          0 0 22px 8px rgba(255, 215, 0, 0.35);
      }
      .medal-glow-silver {
        --ft-medal-color: #d1d5da;
        border-color: #d1d5da;
        box-shadow:
          0 0 6px 2px rgba(209, 213, 218, 0.85),
          0 0 22px 8px rgba(209, 213, 218, 0.32);
      }
      .medal-glow-bronze {
        --ft-medal-color: #cd7f32;
        border-color: #cd7f32;
        box-shadow:
          0 0 6px 2px rgba(205, 127, 50, 0.85),
          0 0 22px 8px rgba(205, 127, 50, 0.32);
      }

      .friends-list .list-row [data-ft-level-badge] {
        border: 3px solid
          var(
            --ft-medal-color,
            color-mix(in oklab, var(--color-primary) 55%, transparent)
          );
      }

      .no-scrollbar {
        scrollbar-width: none;
      }
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }

      .friends-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
      }

      .friends-fab .btn-circle {
        width: clamp(48px, 6vw, 72px) !important;
        height: clamp(48px, 6vw, 72px) !important;
        min-width: unset !important;
      }

      .friends-fab .swap {
        width: 30px;
        height: 30px;
      }

      .friends-fab .swap > * {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .friends-fab .swap-off svg {
        width: 100%;
        height: 100%;
      }

      .friends-dropdown {
        position: fixed;
        bottom: calc(clamp(48px, 6vw, 72px) + 32px);
        right: 24px;
        z-index: 9998;
        width: min(480px, calc(100vw - 48px));
        max-width: calc(100vw - 48px);
        max-height: min(640px, calc(100dvh - (clamp(48px, 6vw, 72px) + 96px)));
        display: flex;
        flex-direction: column;
        transform-origin: bottom right;
        transition:
          opacity 0.15s ease,
          transform 0.15s ease;
      }

      .friends-dropdown.closed {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.95) translateY(8px);
      }

      .friends-list-wrap {
        position: relative;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }

      .friends-list {
        overflow-y: auto;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-gutter: stable;
        padding-bottom: 4rem;
      }

      .friends-actions {
        position: fixed;
        right: 0.75rem;
        bottom: calc(
          4rem + env(safe-area-inset-bottom) + 0.75rem + var(--kbd-h, 0px)
        );
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.5rem;
        padding: 0.5rem;
        border-radius: 0.75rem;
        background: var(--color-base-100);
        border: 1px solid
          color-mix(in oklab, var(--color-base-content) 10%, transparent);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        pointer-events: none;
        transition: bottom 0.2s ease;
      }

      .friends-actions button,
      .friends-actions input,
      .friends-actions .friends-delete-bar,
      .friends-actions p {
        pointer-events: auto;
      }

      .friends-add-expand {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        transition:
          opacity 0.15s ease,
          transform 0.15s ease;
      }

      .friends-delete-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .friends-list .list-row {
        padding-block: 0.75rem;
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-rows: repeat(4, auto);
        min-width: 0;
        column-gap: 0.75rem;
        row-gap: 0.25rem;
        align-items: stretch;
      }

      .friends-list .list > :not(:last-child).list-row:after {
        border-color: color-mix(
          in oklab,
          var(--color-base-content) 15%,
          transparent
        );
      }

      .friends-list .list-row [data-ft-avatar-col] {
        grid-column: 1;
        grid-row: 1 / 4;
        align-self: center;
      }

      .friends-list .list-row [data-ft-level-badge] {
        grid-column: 1;
        grid-row: 4;
        justify-self: center;
        align-self: center;
      }

      .friends-list .list-row [data-ft-info] {
        display: contents;
      }

      .friends-list .list-row [data-ft-row="name"] {
        grid-column: 2;
        grid-row: 1;
      }

      .friends-list .list-row [data-ft-row="meta"] {
        grid-column: 2;
        grid-row: 2;
      }

      .friends-list .list-row [data-ft-row="stats"] {
        grid-column: 2;
        grid-row: 3;
      }

      .friends-list .list-row [data-ft-row="level"] {
        grid-column: 2;
        grid-row: 4;
        align-self: center;
      }

      .friends-list .list-row [data-ft-delete-col] {
        grid-column: 3;
        grid-row: 1 / 5;
        align-self: center;
      }

      @media (max-width: 520px) {
        .friends-dropdown {
          right: 12px;
          left: 12px;
          width: auto;
          max-width: none;
          bottom: calc(clamp(48px, 6vw, 72px) + 20px);
          max-height: calc(100dvh - (clamp(48px, 6vw, 72px) + 48px));
          border-radius: 1.25rem;
          transform-origin: bottom center;
        }

        .friends-fab {
          right: 16px;
          bottom: 16px;
        }

        .friends-list .list {
          gap: 0;
        }

        .friends-list .list-row {
          grid-template-columns: auto minmax(0, 1fr);
          grid-template-rows: repeat(4, auto);
        }

        .friends-list .list-row:has([data-ft-delete-col]) {
          grid-template-columns: auto minmax(0, 1fr) auto;
        }

        .friends-list .list-row [data-ft-delete-col] {
          grid-column: 3;
          grid-row: 1 / 5;
        }

        .friends-list .list-row [data-ft-avatar-col] .w-14 {
          width: 3rem;
          height: 3rem;
        }
      }

      @media (max-width: 380px) {
        .friends-list .list-row .badge-md {
          font-size: 0.625rem;
          padding: 0.125rem 0.5rem;
        }
      }
    </style>

    <div class="friends-feature flex flex-col min-h-[calc(100dvh-7rem)]">
      <div style="display:none">
        <div class="indicator">
          ${onlineCount > 0 && !state.needsReconnect
            ? html`<span
                class="indicator-item badge badge-success badge-sm font-bold font-mono min-w-6 px-1.5"
                >${onlineCount}</span
              >`
            : ""}
          <button
            type="button"
            class="btn btn-circle btn-lg ${state.needsReconnect
              ? "btn-error"
              : "btn-primary"} shadow-xl"
            @click="${state.needsReconnect ? state.onConnect : state.onToggle}"
            data-tip="${state.needsReconnect
              ? "Token expired — reconnect"
              : state.open
                ? "Close"
                : "Friends"}"
          >
            ${state.needsReconnect
              ? html`<div class="swap">
                  <span
                    class="swap-on flex items-center justify-center w-8 h-8 [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                    >${unsafeHTML(WARNING_SVG)}</span
                  >
                  <span
                    class="swap-off flex items-center justify-center w-8 h-8 [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                    >${unsafeHTML(WARNING_SVG)}</span
                  >
                </div>`
              : html`
                  <div class="swap ${state.open ? "swap-active" : ""}">
                    <span class="swap-on text-3xl">✕</span>
                    <span
                      class="swap-off flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                      >${unsafeHTML(FRIENDS_SVG)}</span
                    >
                  </div>
                `}
          </button>
        </div>
      </div>

      <!-- Dropdown (always open, in-flow, sticky header) -->
      <div
        class="flex-1 flex flex-col bg-base-100 rounded-xl"
        style="position:static;transform:none;inset:auto;width:100%;max-width:none;margin:0;"
      >
        <!-- Header -->
        <div
          class="flex items-center gap-2 px-5 pt-4 pb-4 border-b border-base-300 bg-base-200/50 shrink-0 sticky top-[env(safe-area-inset-top)] z-10"
        >
          <div class="flex items-center gap-2.5 min-w-0 flex-none flex-wrap">
            ${state.friends.length > 0
              ? html`<span
                  class="badge badge-primary font-bold font-mono"
                  style="border:3px solid color-mix(in oklab, var(--color-primary) 55%, transparent);border-radius:var(--radius-field);height:2.5rem;padding-block:0;font-weight:600;min-width:2.5rem;justify-content:center;"
                  >${state.friends.length}</span
                >`
              : ""}
          </div>
          ${state.friends.length > 0
            ? html`<div class="flex items-center gap-2 min-w-0 ml-auto">
                <button
                  type="button"
                  class="btn btn-md px-2 shrink-0 gap-1.5 ${state.onlineOnly
                    ? ""
                    : "btn-success"}"
                  style="height:2.5rem;${state.onlineOnly
                    ? `background-color:${primaryColor};border-color:${primaryColor};color:${primaryContent};`
                    : ""}"
                  data-tip="${state.onlineOnly
                    ? "Showing online users only (click to show all)"
                    : "Show only online users"}"
                  @click="${state.onToggleOnline}"
                  aria-pressed="${state.onlineOnly}"
                >
                  ${onlineCount > 0
                    ? html`<span class="text-sm font-bold font-mono"
                        >${onlineCount}</span
                      >`
                    : ""}
                  <span
                    class="w-4 h-4 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                    >${unsafeHTML(svgIcon(GLOBE_SVG))}</span
                  >
                </button>
                <div class="mx-0.5 h-5 w-px bg-base-content/20 shrink-0"></div>
                <div class="overflow-x-auto no-scrollbar shrink-0">
                  ${renderSortControl(
                    state.sortBy,
                    state.sortDir,
                    primaryColor,
                    primaryContent,
                    state.onSortChange,
                  )}
                </div>
              </div>`
            : ""}
        </div>

        <!-- Friend list + floating actions -->
        <div class="friends-list-wrap">
          <div class="friends-list">
            ${state.notConnected
              ? html`<div
                  class="flex flex-col items-center gap-4 py-12 px-6 text-center"
                >
                  <span
                    class="w-16 h-16 opacity-40 mb-2 [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                    >${unsafeHTML(FRIENDS_SVG)}</span
                  >
                  <p class="opacity-50 max-w-88">
                    See who's online, track levels, wallets, and correction
                    points for your 42 friends at a glance.
                  </p>
                  <button
                    type="button"
                    class="btn bg-[#00babc] text-white border-none hover:bg-[#1fd2d4] flex items-center justify-center gap-3 mt-2"
                    style="height:3rem; min-width:15rem; font-size:1rem;"
                    @click="${state.onConnect}"
                  >
                    <span class="font-bold tracking-wide">Connect with</span>
                    <span
                      class="size-8 flex items-center justify-center [&_polygon]:fill-current"
                    >
                      ${unsafeHTML(FORTY_TWO_SVG)}
                    </span>
                  </button>
                </div>`
              : state.needsReconnect
                ? html`<div
                    class="flex flex-col items-center gap-3 py-12 px-6 text-center"
                  >
                    <span class="text-lg font-bold opacity-60"
                      >Session expired</span
                    >
                    <p class="text-sm opacity-50">Please reconnect.</p>
                    <button
                      type="button"
                      class="btn btn-primary btn-sm font-bold mt-2"
                      @click="${state.onConnect}"
                    >
                      Reconnect
                    </button>
                  </div>`
                : state.loading && state.friends.length === 0
                  ? html`<div class="flex justify-center py-12">
                      <span class="loading loading-spinner loading-md"></span>
                    </div>`
                  : state.loadError && state.friends.length === 0
                    ? renderLoadError(state.onRefresh)
                    : state.friends.length === 0
                      ? renderEmpty()
                      : sorted.length === 0
                        ? html`<div
                            class="flex flex-col items-center gap-2 py-16 opacity-40"
                          >
                            <span
                              class="w-16 h-16 [&>svg]:w-full [&>svg]:h-full [&>svg]:stroke-current"
                              >${unsafeHTML(GHOST_SVG)}</span
                            >
                            <p class="text-sm font-bold">No friends online</p>
                            <p class="text-xs">
                              Turn off the online filter to see everyone
                            </p>
                          </div>`
                        : html`<ul class="list text-base-content">
                            ${sorted.map(
                              (f, i) =>
                                html`<li
                                  class="list-row group ${state.selected.includes(
                                    f.login,
                                  )
                                    ? "bg-base-200/50"
                                    : ""}"
                                >
                                  ${renderFriendRow(
                                    f,
                                    state.sortBy === "level" &&
                                      state.sortDir === "desc"
                                      ? i
                                      : -1,
                                    state.showCustomAvatars,
                                    state.deleteMode,
                                    state.selected.includes(f.login),
                                    state.onToggleSelect,
                                  )}
                                </li>`,
                            )}
                          </ul>`}
          </div>

          <!-- Floating actions (add / delete, only when connected) -->
          ${!state.notConnected && !state.needsReconnect
            ? html`<div class="friends-actions">
                ${state.deleteMode
                  ? html`<div class="friends-delete-bar">
                      <span
                        class="badge badge-error badge-md font-bold font-mono shrink-0"
                        style="border:3px solid color-mix(in oklab, var(--color-error) 55%, transparent);border-radius:0.75rem;height:auto;padding-block:0.15rem;font-weight:600;"
                        >${state.selected.length} selected</span
                      >
                      <button
                        type="button"
                        class="btn btn-sm btn-error flex-1 font-bold"
                        @click="${state.onConfirmDelete}"
                        ?disabled="${state.selected.length === 0}"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        @click="${state.onCancelDelete}"
                      >
                        Cancel
                      </button>
                    </div>`
                  : html`<div class="flex flex-col items-end gap-2">
                      ${state.addError
                        ? html`<p class="text-error text-sm px-0.5">
                            ${state.addError}
                          </p>`
                        : ""}
                      <div
                        class="friends-add-expand ${state.addOpen
                          ? ""
                          : "closed"}"
                      >
                        ${state.addOpen
                          ? html`<button
                              type="button"
                              class="btn btn-circle btn-md btn-error"
                              data-tip="Delete friend"
                              @click="${state.onDeleteMode}"
                              ?disabled="${state.friends.length === 0}"
                              aria-label="Delete friends"
                            >
                              <span
                                class="w-5 h-5 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                                >${unsafeHTML(svgIcon(TRASH_SVG))}</span
                              >
                            </button>`
                          : ""}
                        ${state.addOpen
                          ? html`<input
                              type="text"
                              class="input input-bordered input-primary input-sm"
                              placeholder="Login..."
                              .value="${state.addInput}"
                              @input="${(e: Event) =>
                                state.onInputChange(
                                  (e.target as HTMLInputElement).value,
                                )}"
                              @keydown="${(e: KeyboardEvent) => {
                                if (e.key === "Enter") state.onAdd();
                                if (e.key === "Escape") state.onToggleAdd();
                              }}"
                              ?disabled="${state.addLoading}"
                            />`
                          : ""}
                        ${state.addOpen
                          ? html`<button
                              type="button"
                              class="btn btn-sm btn-primary font-bold ${state.addLoading
                                ? "loading"
                                : ""}"
                              @click="${state.onAdd}"
                              ?disabled="${state.addLoading ||
                              !state.addInput.trim()}"
                            >
                              ${state.addLoading ? "" : "Add"}
                            </button>`
                          : html`<button
                              type="button"
                              class="btn btn-circle btn-md btn-primary"
                              data-tip="Add / delete friend"
                              @click="${state.onToggleAdd}"
                              aria-label="Add friend"
                            >
                              <span
                                class="w-5 h-5 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                                >${unsafeHTML(svgIcon(PLUS_SVG))}</span
                              >
                            </button>`}
                        ${state.addOpen
                          ? html`<button
                              type="button"
                              class="btn btn-circle btn-md btn-ghost"
                              @click="${state.onToggleAdd}"
                              aria-label="Close"
                            >
                              <span class="text-lg leading-none">✕</span>
                            </button>`
                          : ""}
                      </div>
                    </div>`}
              </div>`
            : ""}
        </div>
      </div>
    </div>
  `;
}

let _state: WidgetState | null = null;
let pendingView: TemplateResult | null = null;
let initialized = false;

export function getFriendsView(): TemplateResult | null {
  return pendingView;
}

/** Re-fetch friends (used by pull-to-refresh). */
export function refreshFriends(): void {
  void _state?.onRefresh();
}

function renderWidgetUI(): void {
  if (_state) pendingView = renderWidget(_state);
}

/** Lift the floating actions above the on-screen keyboard (iOS visual viewport). */
function initKeyboardOffset(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const kbd = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kbd-h", `${kbd}px`);
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}


export async function initFriendsFeature(
  onUpdate: () => void,
): Promise<void> {
  if (initialized) return;
  initialized = true;

  initKeyboardOffset();

  const storedSort = localStorage.getItem("FRIENDS_SORT_MODE");
  const sortBy: SortMode = SORT_MODES.includes(storedSort as SortMode)
    ? (storedSort as SortMode)
    : "level";
  const sortDir: SortDir =
    localStorage.getItem("FRIENDS_SORT_DIR") === "asc" ? "asc" : "desc";

  const emit = () => {
    renderWidgetUI();
    onUpdate();
  };

  _state = {
    open: true,
    loading: false,
    loadError: false,
    friends: [],
    sortBy,
    sortDir,
    onlineOnly: localStorage.getItem("FRIENDS_ONLINE_ONLY") === "true",
    addInput: "",
    addLoading: false,
    addError: "",
    addOpen: false,
    lastFetch: null,
    theme: "",
    needsReconnect: false,
    notConnected: !getSession(),
    deleteMode: false,
    selected: [],
    showCustomAvatars:
      localStorage.getItem("SHOW_CUSTOM_AVATARS_IN_FRIENDS") !== "false",
    onToggle: () => {
      emit();
    },
    onRefresh: async () => {
      if (!_state || _state.notConnected) return;
      _state.loading = true;
      _state.loadError = false;
      emit();
      clearFriendsCache();
      const list = await getFriendsList();
      _state.friends = await fetchFriendsData(list);
      _state.loadError = list.length > 0 && _state.friends.length === 0;
      _state.lastFetch = Date.now();
      _state.loading = false;
      emit();
    },
    onSortChange: (mode, dir) => {
      if (!_state) return;
      _state.sortBy = mode;
      _state.sortDir = dir;
      localStorage.setItem("FRIENDS_SORT_MODE", mode);
      localStorage.setItem("FRIENDS_SORT_DIR", dir);
      emit();
    },
    onToggleOnline: () => {
      if (!_state) return;
      _state.onlineOnly = !_state.onlineOnly;
      localStorage.setItem("FRIENDS_ONLINE_ONLY", String(_state.onlineOnly));
      emit();
    },
    onDeleteMode: () => {
      if (!_state) return;
      _state.deleteMode = !_state.deleteMode;
      _state.selected = [];
      _state.addOpen = false;
      emit();
    },
    onToggleSelect: (login) => {
      if (!_state) return;
      const idx = _state.selected.indexOf(login);
      if (idx >= 0) _state.selected.splice(idx, 1);
      else _state.selected.push(login);
      emit();
    },
    onConfirmDelete: async () => {
      if (!_state || _state.selected.length === 0) return;
      const n = _state.selected.length;
      if (
        !confirm(
          `Remove ${n} friend${n === 1 ? "" : "s"} from your friends list?`,
        )
      )
        return;
      for (const login of _state.selected) {
        await removeFriend(login);
      }
      const removed = new Set(_state.selected);
      _state.friends = _state.friends.filter((f) => !removed.has(f.login));
      _state.loadError = false;
      _state.deleteMode = false;
      _state.selected = [];
      emit();
    },
    onCancelDelete: () => {
      if (!_state) return;
      _state.deleteMode = false;
      _state.selected = [];
      emit();
    },
    onInputChange: (val) => {
      if (!_state) return;
      _state.addInput = val;
      _state.addError = "";
      emit();
    },
    onAdd: async () => {
      if (!_state || _state.notConnected) return;
      const login = _state.addInput.trim().toLowerCase();
      if (!login) return;

      _state.addLoading = true;
      _state.addError = "";
      emit();

      if (await isFriend(login)) {
        _state.addError = "Already in your list.";
        _state.addLoading = false;
        emit();
        return;
      }

      await addFriend(login);

      const fresh = await fetchFriendsData([login]);
      if (fresh.length === 0) {
        await removeFriend(login);
        _state.addError = "User not found.";
        _state.addLoading = false;
        emit();
        return;
      }

      _state.friends = [..._state.friends, ...fresh];
      _state.lastFetch = Date.now();
      _state.addInput = "";
      _state.addLoading = false;
      clearFriendsCache();
      emit();
      document
        .querySelector<HTMLInputElement>('.friends-feature input[type="text"]')
        ?.focus();
    },
    onToggleAdd: () => {
      if (!_state) return;
      _state.addOpen = !_state.addOpen;
      if (_state.addOpen) {
        _state.deleteMode = false;
        _state.addError = "";
      } else {
        _state.addInput = "";
        _state.addError = "";
      }
      emit();
      if (_state.addOpen) {
        document
          .querySelector<HTMLInputElement>(
            '.friends-feature input[type="text"]',
          )
          ?.focus();
      }
    },
    onConnect: () => {
      window.location.href = loginUrl();
    },
  };

  emit();

  if (!_state.notConnected && !_state.needsReconnect) {
    _state.loading = true;
    _state.loadError = false;
    emit();
    const list = await getFriendsList();
    _state.friends = await fetchFriendsData(list);
    _state.loadError = list.length > 0 && _state.friends.length === 0;
    _state.lastFetch = Date.now();
    _state.loading = false;
  }

  emit();
}
