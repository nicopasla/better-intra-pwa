import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import GRID_SVG from "./assets/grid.svg?raw";
import CALENDAR_SVG from "./assets/calendar.svg?raw";
import USERS_SVG from "./assets/users.svg?raw";
import GRADUATION_SVG from "./assets/graduation-cap.svg?raw";
import GEAR_SVG from "./assets/settings_gear.svg?raw";

export type Tab = "dashboard" | "events" | "friends" | "students" | "settings";

interface TabDef {
  id: Tab;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard", icon: GRID_SVG },
  { id: "events", label: "Events", icon: CALENDAR_SVG },
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
    hash === "events" ||
    hash === "friends" ||
    hash === "students" ||
    hash === "settings"
  ) {
    return hash as Tab;
  }
  return "dashboard";
}

export function navigate(tab: Tab): void {
  if (currentTab() === tab) return;
  location.hash = `/${tab}`;
}

const ORDER: Tab[] = TABS.map((t) => t.id);

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
