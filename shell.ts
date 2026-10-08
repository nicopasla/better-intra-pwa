import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import HOME_SVG from "./assets/home.svg?raw";
import USER_SVG from "./assets/user.svg?raw";
import USERS_SVG from "./assets/users.svg?raw";
import GRADUATION_SVG from "./assets/graduation-cap.svg?raw";
import GEAR_SVG from "./assets/settings_gear.svg?raw";

export type Tab = "dashboard" | "profile" | "friends" | "students" | "settings";

interface TabDef {
  id: Tab;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "dashboard", label: "Home", icon: HOME_SVG },
  { id: "profile", label: "Profile", icon: USER_SVG },
  { id: "friends", label: "Friends", icon: USERS_SVG },
  { id: "students", label: "Students", icon: GRADUATION_SVG },
  { id: "settings", label: "Settings", icon: GEAR_SVG },
];

const hidden = new Set<Tab>();

export function setTabHidden(tab: Tab, isHidden: boolean): void {
  if (isHidden) hidden.add(tab);
  else hidden.delete(tab);
}

export function currentTab(): Tab {
  const hash = location.hash.replace(/^#\/?/, "");
  if (
    hash === "dashboard" ||
    hash === "profile" ||
    hash === "friends" ||
    hash === "students" ||
    hash === "settings"
  ) {
    return hash as Tab;
  }
  return "dashboard";
}

const ORDER: Tab[] = TABS.map((t) => t.id);

type RouteRenderer = () => void;
let routeRenderer: RouteRenderer = () => {};

/** main.ts registers its render pipeline so navigate() can render inside the
 *  view-transition callback (the DOM swap must happen synchronously for
 *  `startViewTransition` to capture old/new snapshots). */
export function setRouteRenderer(fn: RouteRenderer): void {
  routeRenderer = fn;
}

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const supportsViewTransition =
  typeof document !== "undefined" &&
  typeof document.startViewTransition === "function";

const supportsViewTransitionTypes =
  supportsViewTransition &&
  typeof (globalThis as { ViewTransition?: { prototype: object } }).ViewTransition !==
    "undefined" &&
  "types" in
    (globalThis as { ViewTransition: { prototype: object } }).ViewTransition
      .prototype;

type StartViewTransition = (
  arg: (() => void) | { update: () => void; types?: string[] },
) => ViewTransition;

export function navigate(tab: Tab, animate = false): void {
  if (currentTab() === tab) return;

  // Dock/tab clicks pass `animate=false` (instant switch); swipe passes true
  // so the slide direction (derived from tab order) matches the gesture.
  const from = ORDER.indexOf(currentTab());
  const to = ORDER.indexOf(tab);
  const dir = to > from ? "next" : "prev";

  if (!animate || REDUCED || !supportsViewTransition) {
    location.hash = `/${tab}`;
    routeRenderer();
    return;
  }

  const update = () => {
    location.hash = `/${tab}`;
    routeRenderer();
  };
  const start = document.startViewTransition.bind(
    document,
  ) as unknown as StartViewTransition;

  // Set the direction before starting; it only affects ::view-transition-*
  // pseudo-elements (which exist only during a transition) so it is safe to
  // leave in place and simply overwrite on the next navigation. Clearing it on
  // `finished` would race with a newer transition started by a rapid swipe.
  document.documentElement.dataset.ftDir = dir;

  if (supportsViewTransitionTypes) {
    try {
      start({ update, types: [dir === "next" ? "ft-next" : "ft-prev"] });
      return;
    } catch {
      /* fall through to the untyped form */
    }
  }

  start(update);
}

export function prevTab(): Tab | null {
  const i = ORDER.indexOf(currentTab());
  return i > 0 ? ORDER[i - 1] : null;
}

export function nextTab(): Tab | null {
  const i = ORDER.indexOf(currentTab());
  return i < ORDER.length - 1 ? ORDER[i + 1] : null;
}

const icon24 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="24" height="24"'));

const app = () => document.getElementById("app")!;

export function renderShell(active: Tab, body: unknown): void {
  render(
    html`
      <div class="min-h-[100dvh] flex flex-col">
        <main class="flex-1 px-4 pt-4 pb-24">${body}</main>
        <nav
          class="dock dock-md z-20 bg-base-100 border-t border-base-300"
          style="padding-bottom: env(safe-area-inset-bottom);"
        >
          ${TABS.filter((t) => !hidden.has(t.id)).map(
            (t) => html`
              <button
                class="${active === t.id ? "dock-active" : ""}"
                @click=${() => navigate(t.id)}
              >
                ${icon24(t.icon)}
                <span class="dock-label text-xs font-medium">${t.label}</span>
              </button>
            `,
          )}
        </nav>
      </div>
    `,
    app(),
  );
}

export function redirectToDashboard(): void {
  location.hash = "/dashboard";
}

export function renderScreen(content: unknown): void {
  render(content, app());
}
