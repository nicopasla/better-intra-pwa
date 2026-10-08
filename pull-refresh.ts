import { currentTab } from "./shell.ts";
import { loadDashboard } from "./views/dashboard.ts";
import { loadEvents } from "./views/events.ts";
import { loadFriends } from "./views/friends.ts";
import { loadSettings } from "./views/settings.ts";

const THRESHOLD = 70;

let startX = 0;
let startY = 0;
let lastDy = 0;
let pulling = false;
let indicatorEl: HTMLDivElement | null = null;

function indicator(): HTMLDivElement | null {
  if (indicatorEl && indicatorEl.isConnected) return indicatorEl;
  indicatorEl = document.createElement("div");
  indicatorEl.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:60;display:flex;justify-content:center;pointer-events:none;transform:translateY(-110%);transition:transform .25s ease;";
  indicatorEl.innerHTML =
    '<span class="loading loading-spinner loading-md" style="color:var(--color-accent);"></span>';
  document.body.appendChild(indicatorEl);
  return indicatorEl;
}

function setIndicator(visible: boolean): void {
  const el = indicator();
  if (!el) return;
  el.style.transform = visible ? "translateY(0)" : "translateY(-110%)";
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
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      lastDy = dy;
      if (window.scrollY > 0 || Math.abs(dy) <= Math.abs(dx)) return;
      if (!pulling && dy > 8) pulling = true;
      if (!pulling) return;
      e.preventDefault();
      if (dy >= 20) setIndicator(true);
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    () => {
      if (!pulling) return;
      pulling = false;
      if (lastDy >= THRESHOLD) {
        reloadCurrent();
        setIndicator(true);
        window.setTimeout(() => setIndicator(false), 1000);
      } else {
        setIndicator(false);
      }
    },
    { passive: true },
  );
}