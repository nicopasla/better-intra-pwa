import { currentTab } from "./shell.ts";
import { loadDashboard } from "./views/dashboard.ts";
import { loadEvents } from "./views/events.ts";
import { loadFriends } from "./views/friends.ts";
import { loadSettings } from "./views/settings.ts";

const THRESHOLD = 90;

let startX = 0;
let startY = 0;
let lastDy = 0;
let pulling = false;
let reloading = false;
let indicatorEl: HTMLDivElement | null = null;

function mainEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>("main");
}

function indicator(): HTMLDivElement | null {
  if (indicatorEl && indicatorEl.isConnected) return indicatorEl;
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:60;display:flex;justify-content:center;align-items:flex-end;height:4rem;pointer-events:none;";
  el.innerHTML = '<span class="loading loading-ring" style="color:var(--color-accent);"></span>';
  document.body.appendChild(el);
  indicatorEl = el;
  return el;
}

/** Shows/hides the fixed indicator container entirely. */
function setVisible(visible: boolean): void {
  const el = indicator();
  if (el) el.style.transform = visible ? "translateY(0)" : "translateY(-150%)";
}

/** Renders the pulled state: the whole screen slides down, revealing the ring. */
function render(value: number, armed: boolean, spinning: boolean): void {
  const el = indicator();
  const m = mainEl();
  const progress = Math.max(0, Math.min(1, value / THRESHOLD));
  const offset = Math.min(value * 0.6, 90);

  // Blend the revealed strip with the card color so the pull looks native.
  document.body.style.background =
    value > 0 ? "var(--color-base-100)" : "";

  if (el) {
    setVisible(value > 0 || spinning);
    const ring = el.firstElementChild as HTMLElement | null;
    if (ring) {
      ring.className = spinning
        ? "loading loading-spinner loading-md"
        : "loading loading-ring loading-md";
      if (!spinning) {
        ring.style.transform = `scale(${0.4 + 0.6 * progress})`;
        ring.style.opacity = String(0.5 + 0.5 * progress);
      } else {
        ring.style.transform = "";
        ring.style.opacity = "1";
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
  }
  if (y === 0) document.body.style.background = "";
}

function reloadCurrent(): void {
  switch (currentTab()) {
    case "dashboard":
      loadDashboard();
      break;
    case "events":
      void loadEvents(true);
      break;
    case "friends":
      void loadFriends(true);
      break;
    case "settings":
      void loadSettings(true);
      break;
  }
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
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (reloading) return;
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
        settle(90);
        reloadCurrent();
        window.setTimeout(() => {
          reloading = false;
          settle(0);
          setVisible(false);
        }, 1100);
      } else {
        render(0, false, false);
        settle(0);
      }
    },
    { passive: true },
  );
}