import { navigate, nextTab, prevTab, Tab } from "./shell.ts";

const MIN_DIST = 70;

let startX = 0;
let startY = 0;
let engaged = false;
let dx = 0;
let direction = 0; // -1 = left (next), +1 = right (prev)
let animating = false;

function mainEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>("main");
}

function clamped(value: number): number {
  const width = window.innerWidth;
  const limit = width / 3;
  const abs = Math.abs(value);
  const damped = abs > limit ? limit + (abs - limit) * 0.25 : abs;
  return Math.sign(value) * damped;
}

function release(target: Tab): void {
  const m = mainEl();
  if (m) {
    // Snap the drag preview back; the view transition (or direct navigation)
    // handles the actual swap without a leftover translate.
    m.style.transition = "none";
    m.style.transform = "";
  }
  animating = false;
  navigate(target, true);
}

function cancel(): void {
  const m = mainEl();
  if (m) {
    m.style.transition = "transform 180ms ease";
    m.style.transform = "translateX(0)";
  }
  animating = false;
}

export function initSwipe(): void {
  if (!("ontouchstart" in window)) return;

  document.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      engaged = false;
      dx = 0;
      direction = 0;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (animating) return;
      const t = e.touches[0];
      const curX = t.clientX - startX;
      const curY = t.clientY - startY;
      if (!engaged && Math.abs(curX) > Math.abs(curY) && Math.abs(curX) > 10) {
        engaged = true;
      }
      if (!engaged) return;
      e.preventDefault();
      dx = curX;
      direction = dx < 0 ? -1 : 1;
      const m = mainEl();
      if (m) {
        m.style.transition = "none";
        m.style.transform = `translateX(${clamped(dx)}px)`;
      }
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    () => {
      if (!engaged || animating) return;
      engaged = false;
      animating = true;
      const target = direction < 0 ? nextTab() : prevTab();
      if (Math.abs(dx) >= MIN_DIST && target) {
        release(target);
      } else {
        cancel();
      }
    },
    { passive: true },
  );
}