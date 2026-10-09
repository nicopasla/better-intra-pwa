/**
 * Routing listener abstraction.
 *
 * Uses the Navigation API (`window.navigation`) when available — it centralizes
 * back/forward and programmatic navigations — and falls back to `hashchange`
 * everywhere else (older Firefox/Safari). Hash URLs are preserved either way.
 */

interface NavigateEventLike extends Event {
  canIntercept: boolean;
  hashChange: boolean;
  destination: { sameDocument?: boolean };
  intercept(options: { handler: () => void | Promise<void> }): void;
}

interface NavigationLike extends EventTarget {
  currentEntry?: { url: string | null } | null;
}

function nav(): NavigationLike | undefined {
  return (window as unknown as { navigation?: NavigationLike }).navigation;
}

export function initRouter(onRoute: () => void): void {
  const n = nav();
  if (n) {
    n.addEventListener("navigate", (event) => {
      const e = event as NavigateEventLike;
      // Only same-document (tab/hash) navigations belong to the SPA router.
      if (!e.canIntercept || e.destination.sameDocument === false) return;
      e.intercept({ handler: () => onRoute() });
    });
    return;
  }
  window.addEventListener("hashchange", onRoute);
}
