import { html, type TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import type { UserProfile, UserVisuals } from "../data.ts";
import { mockMode } from "../mock.ts";
import { customAvatarUrl, initialsAvatar } from "../lib/avatar.ts";
import { saveData } from "../lib/network.ts";
import {
  alumniBadge,
  blackholeBadge,
  evalBadge,
  frozenBadge,
  isFrozen,
  levelBadge,
  locationBadge,
  locationBadgePlaceholder,
  poolBadge,
  walletBadge,
} from "./user-badges.ts";
import { contrastText } from "./logtime-feature/color.ts";
import ARROW_SHARE_SVG from "../assets/arrow_share.svg?raw";
import PENCIL_SVG from "../assets/pencil.svg?raw";
import CHECK_SVG from "../assets/check.svg?raw";

const DEFAULT_ACCENT = "#00BABC";

const svg18 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="18" height="18"'));

/** Order + visibility of the hero badges (home dashboard editor). */
export interface HeroBadges {
  order?: string[];
  hidden?: string[];
}

export interface ProfileHeroOptions {
  showOriginalAvatar?: boolean;
  avatarFailed?: boolean;
  /** Show the "open on intra" link (disabled on the home dashboard). */
  showShare?: boolean;
  /** Show the pool badge (disabled on the home dashboard). */
  showPool?: boolean;
  /** Show the blackhole date badge. */
  showBlackhole?: boolean;
  /** Custom order / visibility for the identity and status badges. */
  badges?: HeroBadges;
  /** Shows an edit button at the top-right of the banner. */
  onEdit?: () => void;
  /** Shows a reset button at the top-left of the banner (edit mode). */
  onReset?: () => void;
  /** Edit mode is on: show a check instead of the pencil. */
  editActive?: boolean;
  /** Toggle a badge by tapping it (home edit mode). */
  onBadgeToggle?: (id: string) => void;
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
  const groups = (p.groups ?? []).map((g) => {
    const name = typeof g === "string" ? g : g.name;
    const color =
      (typeof g === "string" ? null : g.color) ?? v.groupColors?.[name] ?? null;
    return { name, color };
  });

  const hidden = new Set(opts.badges?.hidden ?? []);
  if (opts.showPool === false) hidden.add("pool");
  if (opts.showBlackhole === false) hidden.add("blackhole");
  const order = opts.badges?.order ?? [];
  /** Saved order first, then any id it doesn't mention. */
  const orderedIds = (all: string[]): string[] => {
    const out: string[] = [];
    for (const id of order)
      if (all.includes(id) && !out.includes(id)) out.push(id);
    for (const id of all) if (!out.includes(id)) out.push(id);
    return out;
  };

  /** In edit mode every badge is tappable; hidden ones stay visible but greyed. */
  const badgeToggle = opts.onBadgeToggle;
  const BADGE_TITLES: Record<string, string> = {
    level: "level",
    wallet: "wallet",
    eval: "eval points",
    pool: "pool",
    blackhole: "blackhole date",
    frozen: "frozen",
    alumni: "alumni",
  };
  const badge = (id: string, node: TemplateResult | "") => {
    let content = node;
    // The home editor still shows the location toggle when you're offline.
    if (content === "" && badgeToggle && id === "location")
      content = locationBadgePlaceholder();
    if (content === "") return "";
    if (!badgeToggle) return content;
    const off = hidden.has(id);
    return html`<button
      type="button"
      class="ft-badge-toggle ${off ? "opacity-40 grayscale" : ""}"
      data-badge-id="${id}"
      aria-pressed=${!off}
      title="${off ? "Show" : "Hide"} ${BADGE_TITLES[id] ?? id}"
      @click=${() => badgeToggle(id)}
    >
      ${content}
    </button>`;
  };

  const statParts: Record<string, TemplateResult> = {
    level: levelBadge(p.level),
    wallet: walletBadge(p.wallet),
    eval: evalBadge(p.correctionPoints),
  };
  const stats = orderedIds(["level", "wallet", "eval"])
    .filter((id) => badgeToggle || !hidden.has(id))
    .map((id) => badge(id, statParts[id]))
    .filter((part) => part !== "");
  const statusParts: Record<string, TemplateResult | ""> = {
    pool: poolBadge(poolLabel, poolFull),
    blackhole: blackholeBadge(p.blackholedAt),
    frozen: isFrozen(p) ? frozenBadge() : "",
    alumni: p.alumni ? alumniBadge(p.alumnizedAt) : "",
    location: locationBadge(p.location),
  };
  const status = orderedIds([
    "pool",
    "blackhole",
    "frozen",
    "alumni",
    "location",
  ])
    .filter((id) => badgeToggle || !hidden.has(id))
    .map((id) => badge(id, statusParts[id]))
    .filter((part) => part !== "");
  return html`
    <div
      class="profile-hero card bg-base-100 shadow-xl mb-4 overflow-hidden relative"
    >
      <div class="h-28 w-full" style="${heroStyle(v, accent)}"></div>
      ${opts.onReset
        ? html`<button
            class="btn btn-sm absolute top-2 left-2 bg-base-100/90 hover:bg-base-100 border-none shadow-md text-error"
            type="button"
            aria-label="Reset home layout"
            title="Reset home layout"
            @click=${opts.onReset}
          >
            Reset
          </button>`
        : ""}
      ${opts.onEdit
        ? html`<button
            class="btn btn-circle absolute top-2 right-2 size-11 bg-base-100/90 hover:bg-base-100 border-none shadow-md ${opts.editActive
              ? "text-success"
              : ""}"
            type="button"
            aria-label=${opts.editActive ? "Done editing" : "Edit home"}
            title=${opts.editActive ? "Done editing" : "Edit home"}
            @click=${opts.onEdit}
          >
            ${svg18(opts.editActive ? CHECK_SVG : PENCIL_SVG)}
          </button>`
        : ""}
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
              <span class="font-bold text-2xl leading-tight truncate"
                >${p.displayName}</span
              >
              <span
                class="status ${p.location
                  ? "status-success"
                  : "status-error"} shrink-0"
                title="${p.location ? `Online · ${p.location}` : "Offline"}"
              ></span>
            </div>
            <div class="text-lg opacity-60 truncate">${p.login}</div>
          </div>
        </div>

        ${stats.length
          ? html`<div class="hero-stats" data-badge-row="stats">${stats}</div>`
          : ""}
        ${groups.length
          ? html`<div
              class="flex flex-wrap justify-center gap-2 pb-1"
              data-no-swipe
            >
              ${groups.map((g) =>
                g.color
                  ? html`<span
                      class="badge badge-lg font-semibold flex-none whitespace-nowrap"
                      style="background-color:${g.color};border-color:${g.color};color:${contrastText(
                        g.color,
                      )};"
                      >${g.name}</span
                    >`
                  : html`<span
                      class="badge badge-lg badge-primary font-semibold flex-none whitespace-nowrap"
                      >${g.name}</span
                    >`,
              )}
            </div>`
          : ""}
        ${status.length
          ? html`<div
              class="flex items-center justify-center gap-1.5 flex-wrap"
              data-badge-row="status"
            >
              ${status}
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
