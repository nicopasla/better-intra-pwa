import { html, render } from "lit-html";

/** A fixed offline banner, created once so it lives outside the route's
 *  View Transition DOM. */
export function initConnectivityBanner(): void {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:70;pointer-events:none;";
  document.body.appendChild(host);

  const update = () => {
    if (navigator.onLine) {
      render(html``, host);
      return;
    }
    render(
      html`<div
        class="alert alert-warning rounded-none py-1.5 text-sm"
        style="padding-top:calc(env(safe-area-inset-top) + 0.375rem);"
      >
        <span>Offline — showing cached data.</span>
      </div>`,
      host,
    );
  };

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}
