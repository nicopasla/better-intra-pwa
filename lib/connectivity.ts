import { html, render } from "lit-html";

/** A fixed red dot shown while the app is offline, created once so it lives
 *  outside the route's View Transition DOM. */
export function initConnectivityIndicator(): void {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:calc(env(safe-area-inset-top) + 0.5rem);right:0.75rem;z-index:70;pointer-events:none;";
  document.body.appendChild(host);

  const update = () => {
    if (navigator.onLine) {
      render(html``, host);
      return;
    }
    render(
      html`<span
        class="status status-error animate-pulse shadow"
        title="Offline — showing cached data."
        aria-label="Offline"
      ></span>`,
      host,
    );
  };

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}
