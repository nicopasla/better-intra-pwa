/**
 * Debounced-free tooltip / popover for `[data-tip]` elements, matching the
 * Clusters active list popovers: hover on desktop, tap on touch, and a tapped
 * tooltip stays open until you tap somewhere else (it no longer times out).
 *
 * The bubble is mounted in the topmost open <dialog> when there is one, so it
 * also shows inside modals.
 */

const OFFSET = 8;

let tip: HTMLDivElement | null = null;
let active: HTMLElement | null = null;
/** Opened by a tap: stays until an outside tap (hover bubbles still auto-hide). */
let sticky = false;
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
    "max-width:18rem",
    "padding:0.6rem 0.75rem",
    "border-radius:var(--radius-box,1rem)",
    "background:var(--color-base-100)",
    "color:var(--color-base-content)",
    "border:1px solid var(--color-base-300)",
    "font-size:0.875rem",
    "font-weight:500",
    "line-height:1.3",
    "white-space:normal",
    "text-align:center",
    "box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1)",
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

function place(target: HTMLElement): void {
  const el = element();
  const rect = target.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - width - 6));
  let top = rect.top - height - OFFSET;
  if (top < 6) top = rect.bottom + OFFSET;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function show(target: HTMLElement, keep = false): void {
  const text = target.dataset.tip?.trim();
  if (!text) return;

  const el = element();
  const host = container();
  if (el.parentElement !== host) host.appendChild(el);

  el.textContent = text;
  el.style.visibility = "hidden";
  el.style.opacity = "0";
  place(target);
  el.style.visibility = "visible";
  el.style.opacity = "1";

  active = target;
  sticky = keep;
}

function hide(): void {
  active = null;
  sticky = false;
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
    show(target);
  });

  document.addEventListener("pointerout", (e) => {
    if (sticky) return;
    const target = targetOf(e.target);
    if (target && target === active) hide();
  });

  document.addEventListener("pointerdown", (e) => {
    const target = targetOf(e.target);
    if (e.pointerType === "touch") {
      if (target) {
        // Tap: open, or close when tapping the same element again.
        if (target === active) hide();
        else show(target, true);
        return;
      }
      hide();
      return;
    }
    // Mouse/trackpad: a click elsewhere closes a tapped-open bubble.
    if (!target && sticky) hide();
  });

  document.addEventListener("focusin", (e) => {
    const target = targetOf(e.target);
    if (target && e.target !== active) show(target);
  });
  document.addEventListener("focusout", () => {
    if (!sticky) hide();
  });

  // A fixed bubble would drift away from its cell: drop it when scrolling.
  document.addEventListener(
    "scroll",
    () => {
      if (active) hide();
    },
    true,
  );
  window.addEventListener(
    "resize",
    () => {
      if (active) hide();
    },
    { passive: true },
  );
}
