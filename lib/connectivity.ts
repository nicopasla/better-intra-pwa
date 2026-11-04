import { html, render } from "lit-html";
import { refresh } from "../refresh.ts";

/** A fixed top banner shown while the app is offline, created once so it lives
 *  outside the route's View Transition DOM. Explicit theme colors keep it
 *  readable on tinted themes like lemonade. */
export function initConnectivityIndicator(): void {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:env(safe-area-inset-top);left:0;right:0;z-index:70;pointer-events:none;";
  document.body.appendChild(host);

  const update = () => {
    if (navigator.onLine) {
      render(html``, host);
    } else {
      render(
        html`<div
          class="alert alert-warning flex items-center justify-center gap-2 rounded-none border-0 py-2 text-sm font-semibold shadow-sm"
          role="status"
          aria-label="Offline"
        >
          <span class="status status-md status-error animate-pulse"></span>
          <span>Offline. Showing cached data.</span>
          <button
            class="btn btn-xs pointer-events-auto"
            @click=${() => location.reload()}
          >
            Reload
          </button>
        </div>`,
        host,
      );
    }
    // Per-view "showing saved data" warnings hide while offline (the banner
    // above already says it), so repaint the active view on state changes.
    refresh();
  };

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}
