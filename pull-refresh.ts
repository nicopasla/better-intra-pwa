import { currentTab, userLoginFromHash } from "./shell.ts";
import { html, render as renderTemplate } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import LOGO_MONO_SVG from "./assets/logo-mono.svg?raw";
import { loadDashboard } from "./views/dashboard.ts";
import { loadProfile } from "./views/profile.ts";
import { loadFriends } from "./views/friends.ts";
import { loadSettings } from "./views/settings.ts";
import { loadUserProfile } from "./views/user-profile.ts";

const THRESHOLD = 90;
/** How far the page stays pulled while a reload runs. */
const SETTLED = 90;

let startX = 0;
let startY = 0;
let lastDy = 0;
let pulling = false;
let reloading = false;
let blocked = false;
let indicatorEl: HTMLDivElement | null = null;
/** The home editor turns this off while cards are being rearranged. */
let enabled = true;

export function setPullRefreshEnabled(on: boolean): void {
  enabled = on;
  if (!on) {
    pulling = false;
    render(0, false, false);
    settle(0);
  }
}

/** Touches starting on an inner scroll area should scroll it, not pull-refresh. */
function isScrollArea(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return Boolean(
    el?.closest?.(
      "[data-no-swipe], .overflow-auto, .overflow-y-auto, .overflow-scroll",
    ),
  );
}

function mainEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>("main");
}

function indicator(): HTMLDivElement | null {
  if (indicatorEl && indicatorEl.isConnected) return indicatorEl;
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:60;display:flex;justify-content:center;align-items:center;height:0;overflow:visible;pointer-events:none;";
  renderTemplate(
    html`<span class="ft-ptr-logo" aria-hidden="true"
      >${unsafeHTML(LOGO_MONO_SVG)}</span
    >`,
    el,
  );
  document.body.appendChild(el);
  indicatorEl = el;
  return el;
}

/** Sizes the strip to the pull gap and keeps the mark centred inside it. */
function showPulled(offset: number): void {
  const el = indicator();
  if (!el) return;
  el.style.height = `${Math.max(offset, 36)}px`;
  el.style.transform = "none";
}

/** Hides the indicator off the top edge. */
function hideIndicator(): void {
  const el = indicator();
  if (el) el.style.transform = "translateY(-100%)";
}

/** Renders the pulled state: the whole screen slides down, revealing the ring. */
function render(value: number, armed: boolean, spinning: boolean): void {
  const el = indicator();
  const m = mainEl();
  const progress = Math.max(0, Math.min(1, value / THRESHOLD));
  const offset = Math.min(value * 0.6, 90);

  if (el) {
    if (value > 0 || spinning) showPulled(spinning ? SETTLED : offset);
    else hideIndicator();
    const logo = el.firstElementChild as HTMLElement | null;
    if (logo) {
      logo.classList.toggle("pulsing", spinning);
      if (spinning) {
        logo.style.transform = "";
        logo.style.opacity = "1";
      } else {
        logo.style.transform = `scale(${0.65 + 0.35 * progress})`;
        logo.style.opacity = String(0.4 + 0.6 * progress);
      }
    }
  }

  if (m) {
    m.style.transition = "none";
    m.style.transform = `translateY(${offset}px)`;
  }
}

function settle(y: number): void {
  const m = mainEl();
  if (m) {
    m.style.transition = "transform 240ms ease";
    m.style.transform = `translateY(${y}px)`;
    if (y === 0) {
      // Once the pull settles, drop the transform entirely: a non-none
      // transform makes <main> the containing block for `position: fixed`
      // descendants, which unpins the bottom sub-tab bars.
      window.setTimeout(() => {
        if (mainEl() !== m || m.style.transform !== "translateY(0px)") return;
        m.style.transform = "";
        m.style.transition = "";
      }, 260);
    }
  }
}

function reloadCurrent(): void {
  const profileLogin = userLoginFromHash();
  if (profileLogin) {
    void loadUserProfile(profileLogin, true);
    return;
  }
  switch (currentTab()) {
    case "dashboard":
      loadDashboard();
      break;
    case "profile":
      void loadProfile(true);
      break;
    case "friends":
      void loadFriends(true);
      break;
    case "settings":
      void loadSettings(true);
      break;
  }
}

/** Tabs with a reload path; elsewhere the gesture would do nothing. */
function supportsReload(): boolean {
  if (userLoginFromHash()) return true;
  const tab = currentTab();
  return (
    tab === "dashboard" ||
    tab === "profile" ||
    tab === "friends" ||
    tab === "settings"
  );
}

export function initPullRefresh(): void {
  if (!("ontouchstart" in window)) return;

  document.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      lastDy = 0;
      pulling = false;
      blocked = !enabled || !supportsReload() || isScrollArea(e.target);
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (!enabled || reloading || blocked) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      lastDy = dy;
      if (window.scrollY > 0 || Math.abs(dy) <= Math.abs(dx)) return;
      if (!pulling && dy > 12) pulling = true;
      if (!pulling) return;
      e.preventDefault();
      render(dy, dy >= THRESHOLD, false);
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    () => {
      if (reloading) return;
      if (!pulling) return;
      pulling = false;
      if (lastDy >= THRESHOLD) {
        reloading = true;
        render(THRESHOLD, true, true);
        settle(SETTLED);
        reloadCurrent();
        window.setTimeout(() => {
          reloading = false;
          settle(0);
          hideIndicator();
        }, 1100);
      } else {
        render(0, false, false);
        settle(0);
      }
    },
    { passive: true },
  );
}
