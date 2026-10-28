import { html, type TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import STAR_SVG from "../assets/star-lucide.svg?raw";
import POOL_SVG from "../assets/pool.svg?raw";
import EVAL_SVG from "../assets/eval.svg?raw";
import WALLET_SVG from "../assets/wallet.svg?raw";
import SKULL_SVG from "../assets/skull.svg?raw";
import FREEZE_SVG from "../assets/freeze.svg?raw";
import GRADUATION_CAP_SVG from "../assets/graduation-cap.svg?raw";
import { formatShortDate } from "./students-utils.ts";
import { perceptualLuminance } from "./logtime-feature/color.ts";
import type { CustomBadge } from "../data.ts";

const icon = (raw: string, size = 14) =>
  unsafeHTML(raw.replace("<svg", `<svg width="${size}" height="${size}"`));

const clusterUrl = (seat: string) =>
  `https://meta.intra.42.fr/clusters?seat=${encodeURIComponent(seat)}`;

/** Badges shared with the Students list (same markup/classes as there). */

export function levelBadge(level: number): TemplateResult {
  return html`<span class="level-badge" title="Level in 42 cursus"
    >${icon(STAR_SVG, 12)}${level.toFixed(2)}</span
  >`;
}

export function poolBadge(
  label: string,
  full?: string | null,
): TemplateResult | "" {
  if (!label) return "";
  return html`<span class="pool-badge" title="Pool in ${full ?? label}"
    >${icon(POOL_SVG)}${label}</span
  >`;
}

export function evalBadge(points: number): TemplateResult {
  return html`<span class="eval-badge" title="Evaluation points"
    >${icon(EVAL_SVG)}${points}</span
  >`;
}

export function walletBadge(wallet: number): TemplateResult {
  return html`<span class="wallet-badge" title="Wallet"
    >${icon(WALLET_SVG)}${wallet}</span
  >`;
}

export function blackholeBadge(iso: string | null): TemplateResult | "" {
  const label = formatShortDate(iso);
  if (!label) return "";
  return html`<span
    class="blackhole-badge with-text"
    title="Blackhole on ${label}"
    >${icon(SKULL_SVG, 16)}${label}</span
  >`;
}

export function frozenBadge(): TemplateResult {
  return html`<span class="freeze-badge with-text" title="Frozen"
    >${icon(FREEZE_SVG, 16)}Frozen</span
  >`;
}

export function alumniBadge(iso: string | null): TemplateResult {
  const label = formatShortDate(iso);
  return html`<span
    class="alumni-badge ${label ? "with-text" : ""}"
    title="Alumni${label ? ` since ${label}` : ""}"
    >${icon(GRADUATION_CAP_SVG, 16)}${label}</span
  >`;
}

/** Frozen: inactive with a blackhole date still in the future. */
export function isFrozen(profile: {
  active: boolean;
  blackholedAt: string | null;
}): boolean {
  if (profile.active || !profile.blackholedAt) return false;
  const at = new Date(profile.blackholedAt).getTime();
  return Number.isFinite(at) && at >= Date.now();
}

/** Frozen / alumni, matching the Students list rules. */
export function statusBadges(profile: {
  active: boolean;
  alumni: boolean;
  blackholedAt: string | null;
  alumnizedAt: string | null;
}): TemplateResult | "" {
  const frozen = isFrozen(profile);

  if (!frozen && !profile.alumni) return "";
  return html`${frozen ? frozenBadge() : ""}${profile.alumni
    ? alumniBadge(profile.alumnizedAt)
    : ""}`;
}

/** Admin-granted badge (D1 `custom_badges`), styled like the 42 role badges. */
export function customBadgeChip(badge: CustomBadge): TemplateResult | "" {
  const label = badge.label.trim();
  if (!label) return "";

  const color = normalizeHex(badge.color);
  const style = color
    ? `background-color:${color};border-color:${color};color:${badgeText(color)};`
    : "";
  const cls = `badge badge-lg${
    color ? "" : " badge-primary"
  } font-semibold flex-none whitespace-nowrap gap-1`;
  const content = html`${badge.icon
    ? html`<span aria-hidden="true">${badge.icon}</span>`
    : ""}${label}`;

  return html`<span
    class="${cls}"
    style="${style}"
    title="${badge.tooltip ?? label}"
    data-custom-badge="${badge.id}"
    >${content}</span
  >`;
}

/** 3-digit hex → 6 digits; anything unusable (or with alpha) → null. */
function normalizeHex(value: string | null): string | null {
  const raw = (value ?? "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : null;
}

/** Black on light badges, white on dark ones (same rule as the extension). */
function badgeText(color: string): "#000000" | "#ffffff" {
  return perceptualLuminance(color) >= 128 ? "#000000" : "#ffffff";
}

