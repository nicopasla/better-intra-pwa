import { html, type TemplateResult } from "lit-html";
import { mockMode } from "../mock.ts";

/**
 * Real 42 avatars are not used: the CDN sits behind a bot challenge and must
 * not be scraped. Production renders initials, or a Better Intra custom avatar
 * uploaded to our own R2 storage. Mock mode keeps fixture images.
 */
export const AVATARS_ENABLED: boolean = mockMode;

/** Renders a circular initials placeholder. `className` controls the sizing. */
export function initialsAvatar(
  login: string,
  className: string,
): TemplateResult {
  const letter = (login || "?").trim().charAt(0).toUpperCase() || "?";
  return html`<div
    class="${className} rounded-full bg-base-300 flex items-center justify-center font-bold select-none"
    aria-hidden="true"
  >
    ${letter}
  </div>`;
}

/** Accepts normal http(s) links; broken/hotlink-blocked images fall back to initials. */
export function customAvatarUrl(value?: string | null): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Fully local avatar for the cluster map: deterministic colour + initial,
 * emitted as an SVG data URI. No network request and no 42 CDN access.
 */
export function initialAvatarDataUrl(login: string): string {
  const normalized = (login || "?").trim() || "?";
  let hash = 7;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  const letter = normalized.charAt(0).toUpperCase() || "?";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" fill="hsl(${hue} 45% 42%)"/>` +
    `<text x="20" y="27" text-anchor="middle" font-family="system-ui,sans-serif" ` +
    `font-size="20" font-weight="700" fill="#fff">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Swaps a broken <img> for a letter placeholder, keeping its sizing classes. */
function letterFallback(img: HTMLImageElement): void {
  const parent = img.parentElement;
  if (!parent) return;
  const letter = (img.alt || "?").trim().charAt(0).toUpperCase() || "?";
  const span = document.createElement("span");
  span.className =
    `${img.className} flex items-center justify-center font-bold select-none`.trim();
  span.textContent = letter;
  span.setAttribute("aria-hidden", "true");
  parent.replaceChild(span, img);
}

/** Replaces a failed avatar with a letter placeholder. No proxy retry. */
export function avatarErrorFallback(e: Event): void {
  const img = e.target as HTMLImageElement;
  if (img.isConnected) letterFallback(img);
}
