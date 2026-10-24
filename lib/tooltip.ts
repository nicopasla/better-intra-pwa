/**
 * Lightweight tooltip for `[data-tip]` elements (the extension's tooltip, minus
 * floating-ui). Hover/focus on desktop, tap on touch. The tooltip is mounted in
 * the topmost open <dialog> when there is one, so it also shows inside modals.
 */

const OFFSET = 8;
const TOUCH_HIDE_MS = 2200;

let tip: HTMLDivElement | null = null;
let active: HTMLElement | null = null;
let touchTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function container(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] : document.body;
}

function element(): HTMLDivElement {
  if (tip) return tip;
  const el = document.createElement("div");
  el.id = "ft-tooltip";
  el.setAttribute("role", "tooltip");
  el.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "pointer-events:none",
    "max-width:16rem",
    "padding:0.35rem 0.55rem",
    "border-radius:0.5rem",
    "font-size:12px",
    "font-weight:500",
    "line-height:1.25",
    "white-space:normal",
    "text-align:center",
    "box-shadow:0 4px 14px rgba(0,0,0,.25)",
    "opacity:0",
    "visibility:hidden",
  ].join(";");
  tip = el;
  return el;
}

function targetOf(node: EventTarget | null): HTMLElement | null {
  const el = node as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return null;
  return el.closest<HTMLElement>("[data-tip]");
}

function show(target: HTMLElement): void {
  const text = target.dataset.tip?.trim();
  if (!text) return;

  const el = element();
  const host = container();
  if (el.parentElement !== host) host.appendChild(el);

  const dark = document.documentElement.dataset.theme === "dark";
  el.style.background = dark ? "#181b23" : "#ffffff";
  el.style.color = dark ? "#e8eaf0" : "#1a1d24";
  el.style.border = `1px solid ${
    dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"
  }`;
  el.textContent = text;

  // Measure invisibly, then place above the target (below if there's no room).
  el.style.visibility = "hidden";
  el.style.opacity = "0";
  const rect = target.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - width - 6));
  let top = rect.top - height - OFFSET;
  if (top < 6) top = rect.bottom + OFFSET;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.visibility = "visible";
  el.style.opacity = "1";
  active = target;
}

function hide(): void {
  active = null;
  if (touchTimer) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
  if (!tip) return;
  tip.style.opacity = "0";
  tip.style.visibility = "hidden";
}

/** Installs the delegated listeners once. */
export function initTooltips(): void {
  if (initialized) return;
  initialized = true;

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const target = targetOf(e.target);
    if (!target || target === active) return;
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    show(target);
  });

  document.addEventListener("pointerout", (e) => {
    const target = targetOf(e.target);
    if (target && target === active) hide();
  });

  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const target = targetOf(e.target);
    if (!target) return;
    show(target);
    if (touchTimer) clearTimeout(touchTimer);
    touchTimer = setTimeout(() => {
      if (active === target) hide();
    }, TOUCH_HIDE_MS);
  });

  document.addEventListener("focusin", (e) => {
    const target = targetOf(e.target);
    if (target) show(target);
  });
  document.addEventListener("focusout", () => hide());

  document.addEventListener("scroll", () => hide(), true);
  window.addEventListener("resize", () => hide(), { passive: true });
}
