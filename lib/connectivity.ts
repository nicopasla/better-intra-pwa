import { html, render } from "lit-html";

/** A fixed banner shown while the app is offline, created once so it lives
 *  outside the route's View Transition DOM. Explicit colors (base-200 bg,
 *  base-content text) keep it readable on tinted themes like lemonade. */
export function initConnectivityIndicator(): void {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:calc(env(safe-area-inset-top) + 0.5rem);left:0;right:0;z-index:70;display:flex;justify-content:center;padding:0 0.75rem;pointer-events:none;";
  document.body.appendChild(host);

  const update = () => {
    if (navigator.onLine) {
      render(html``, host);
      return;
    }
    render(
      html`<div
        class="alert border border-base-300 px-3 py-1.5 text-xs font-medium shadow-lg"
        role="status"
        aria-label="Offline"
      >
        <span class="status status-error animate-pulse"></span>
        <span>Offline. Showing cached data.</span>
      </div>`,
      host,
    );
  };

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}
