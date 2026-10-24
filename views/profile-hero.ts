import { html, type TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import type { UserProfile, UserVisuals } from "../data.ts";
import { mockMode } from "../mock.ts";
import { customAvatarUrl, initialsAvatar } from "../lib/avatar.ts";
import { saveData } from "../lib/network.ts";
import {
  blackholeBadge,
  evalBadge,
  levelBadge,
  locationBadge,
  poolBadge,
  statusBadges,
  walletBadge,
} from "./user-badges.ts";
import ARROW_SHARE_SVG from "../assets/arrow_share.svg?raw";

const DEFAULT_ACCENT = "#00BABC";

const svg18 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="18" height="18"'));

export interface ProfileHeroOptions {
  showOriginalAvatar?: boolean;
  avatarFailed?: boolean;
  /** Show the "open on intra" link (disabled on the home dashboard). */
  showShare?: boolean;
  /** Show the pool badge (disabled on the home dashboard). */
  showPool?: boolean;
  /** Show the blackhole date badge. */
  showBlackhole?: boolean;
  onToggleAvatar?: () => void;
  onAvatarError?: () => void;
}

/**
 * The shared profile header: banner, overlapping avatar, name, and badges.
 * Used by both another user's profile and the home dashboard.
 */
export function profileHero(
  p: UserProfile,
  opts: ProfileHeroOptions = {},
): TemplateResult {
  const v = p.visuals;
  const accent = accentFor(p);
  const poolFull =
    p.poolMonth && p.poolYear
      ? `${p.poolMonth.charAt(0).toUpperCase()}${p.poolMonth.slice(1)} ${p.poolYear}`
      : null;
  const poolLabel = poolFull ?? p.poolLabel ?? "";
  const poolPart =
    opts.showPool === false ? "" : poolBadge(poolLabel, poolFull);
  const blackholePart =
    opts.showBlackhole === false ? "" : blackholeBadge(p.blackholedAt);
  const statusPart = statusBadges(p);
  const hasBottomRow =
    poolPart !== "" || blackholePart !== "" || statusPart !== "";
  return html`
    <div
      class="profile-hero card bg-base-100 shadow-xl mb-4 overflow-hidden relative"
    >
      <div class="h-28 w-full" style="${heroStyle(v, accent)}"></div>
      ${opts.showShare === false
        ? ""
        : html`<a
            class="btn btn-sm btn-circle absolute top-2 right-2 bg-base-100/90 hover:bg-base-100 border-none shadow-md"
            href="https://profile-v3.intra.42.fr/users/${p.login}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open ${p.login} on intra"
            title="Open on intra"
            >${svg18(ARROW_SHARE_SVG)}</a
          >`}
      <div class="card-body pt-0 gap-3">
        <div class="flex items-end gap-3 -mt-12">
          ${avatarBlock(p, opts)}
          <div class="min-w-0 pb-1 flex-1">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-bold text-lg truncate">${p.displayName}</span>
              <span
                class="status ${p.location
                  ? "status-success"
                  : "status-error"} shrink-0"
                title="${p.location ? `Online · ${p.location}` : "Offline"}"
              ></span>
            </div>
            <div class="text-sm opacity-60 truncate">${p.login}</div>
          </div>
        </div>

        ${(p.groups ?? []).length
          ? html`<div
              class="flex flex-wrap justify-center gap-2 pb-1"
              data-no-swipe
            >
              ${(p.groups ?? []).map(
                (g) =>
                  html`<span
                    class="badge badge-lg badge-primary font-semibold flex-none whitespace-nowrap"
                    >${g}</span
                  >`,
              )}
            </div>`
          : ""}

        <div class="flex items-center justify-center gap-1.5 flex-wrap">
          ${levelBadge(p.level)} ${walletBadge(p.wallet)}
          ${evalBadge(p.correctionPoints)} ${locationBadge(p.location)}
        </div>
        ${hasBottomRow
          ? html`<div class="flex items-center justify-center gap-1.5 flex-wrap">
              ${poolPart} ${blackholePart} ${statusPart}
            </div>`
          : ""}
      </div>
    </div>
  `;
}

function avatarBlock(p: UserProfile, opts: ProfileHeroOptions): TemplateResult {
  const v = p.visuals;
  const size = "w-24 h-24 rounded-full shadow-lg flex-none text-3xl";
  const customSrc = customAvatarUrl(v.customAvatar);
  const hasCustom = Boolean(customSrc);
  const showCustom = hasCustom && !opts.showOriginalAvatar;
  // 42's CDN is behind a bot challenge; only custom R2 avatars or initials.
  const src = mockMode ? p.avatar : null;
  const toggleable = hasCustom && !saveData;
  const toggle = () => opts.onToggleAvatar?.();
  const failAvatar = () => opts.onAvatarError?.();

  const inner = (() => {
    if (saveData)
      return initialsAvatar(p.login, `${size} ring-4 ring-base-100`);
    if (showCustom) {
      return html`<div
        class="${size} ring-4 ring-base-100"
        style="border-radius:${v.avatarShape === "square"
          ? "0"
          : "9999px"};background-image:url('${customSrc ??
        ""}');background-size:${v.avatarScale}%;background-position:${v.avatarPosX}% ${v.avatarPosY}%;background-color:${v.avatarBg};background-repeat:no-repeat;"
      ></div>`;
    }
    if (opts.avatarFailed || !src) {
      return initialsAvatar(p.login, `${size} ring-4 ring-base-100`);
    }
    return html`<img
      class="${size} ring-4 ring-base-100 object-cover"
      src="${src}"
      alt="${p.login}"
      referrerpolicy="no-referrer"
      @error=${failAvatar}
    />`;
  })();

  if (!toggleable) return inner;
  return html`<div
    class="flex-none cursor-pointer rounded-full"
    style="border-radius:${v.avatarShape === "square" ? "0" : "9999px"}"
    role="button"
    tabindex="0"
    title="${opts.showOriginalAvatar ? "Show custom avatar" : "Show initials"}"
    @click=${toggle}
    @keydown=${(e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") toggle();
    }}
  >
    ${inner}
  </div>`;
}

export function accentFor(p: UserProfile | null): string {
  const color = p?.visuals.profileColor ?? "";
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ACCENT;
}

function safeUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/['"()\\]/g, "");
}

function heroStyle(v: UserVisuals, accent: string): string {
  const background = safeUrl(v.background);
  const banner = safeUrl(v.banner);
  const url = background ?? banner;
  if (url) {
    const mode = background ? v.backgroundMode : v.bannerMode;
    const color = (background ? v.backgroundColor : v.bannerColor) ?? "";
    const size =
      mode === "fit"
        ? "contain"
        : mode === "stretch"
          ? "100% 100%"
          : mode === "center" || mode === "tile"
            ? "auto"
            : "cover";
    const repeat = mode === "tile" ? "repeat" : "no-repeat";
    const position = mode === "tile" ? "top left" : "center";
    return `background-image:url('${url}');background-size:${size};background-repeat:${repeat};background-position:${position};${color ? `background-color:${color};` : ""}`;
  }
  return `background-color:color-mix(in oklab, ${accent} 18%, var(--color-base-200));background-image:linear-gradient(135deg, color-mix(in oklab, ${accent} 45%, transparent), transparent);`;
}
