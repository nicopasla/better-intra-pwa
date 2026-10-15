import { html, type TemplateResult } from "lit-html";
import { WORKER_URL } from "../api.ts";

const LOGIN_RE = /^[a-z0-9_-]{1,32}$/;

/**
 * Temporary switch: 42's CDN (`cdn.intra.42.fr`) returns 403 to any off-origin
 * request, so avatars can't load in the PWA. While false, avatar render sites
 * show initials instead. Flip back to true once a working image source lands.
 */
export const AVATARS_ENABLED = false;

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

/**
 * On an avatar load error, retry once through the worker proxy (which fetches
 * the image server-side and bypasses the browser-side CDN rate/bot issues),
 * then fall back to a letter placeholder.
 */
export function avatarErrorFallback(e: Event): void {
  const img = e.target as HTMLImageElement;
  if (!img.isConnected) return;

  if (img.dataset.proxy !== "1") {
    const login = (img.alt || "").trim().toLowerCase();
    if (LOGIN_RE.test(login)) {
      img.dataset.proxy = "1";
      img.src = `${WORKER_URL}/api/v1/public/avatar/${login}`;
      return;
    }
  }

  letterFallback(img);
}
