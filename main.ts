import "./style.css";
import { html, render } from "lit-html";
import { exchangeCode, getSession, loginUrl, setSession } from "./api.ts";
import { initTheme } from "./theme.ts";
import { currentTab, renderScreen, renderShell, Tab } from "./shell.ts";
import { setRefresh } from "./refresh.ts";
import { dashboardView, loadDashboard } from "./views/dashboard.ts";
import { eventsView, loadEvents } from "./views/events.ts";
import { friendsView, loadFriends } from "./views/friends.ts";
import { studentsView, loadStudents } from "./views/students.ts";
import { settingsView, loadSettings } from "./views/settings.ts";
import { registerServiceWorker } from "./push.ts";
import { mockMode } from "./mock.ts";
import { initPullRefresh } from "./pull-refresh.ts";
import { initSwipe } from "./swipe.ts";
import { setTabHidden } from "./shell.ts";
import { me } from "./data.ts";

const app = () => document.getElementById("app")!;

function loadingScreen() {
  return html`
    <div class="min-h-dvh flex items-center justify-center">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  `;
}

function signInScreen() {
  return html`
    <div class="min-h-dvh flex items-center justify-center p-4">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body items-center text-center gap-4">
          <img src="/icons/icon-192.png" alt="" class="w-16 h-16 rounded-2xl" />
          <h1 class="text-2xl font-bold">Better Intra</h1>
          <a class="btn btn-primary w-full" href=${loginUrl()}
            >Sign in with 42</a
          >
          <a class="btn btn-ghost w-full" href="?mock=1"
            >Preview with demo data</a
          >
        </div>
      </div>
    </div>
  `;
}

function blockedScreen() {
  return html`
    <div class="min-h-dvh flex items-center justify-center p-4">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body items-center text-center gap-3">
          <h1 class="card-title">Not available</h1>
          <p class="text-sm opacity-70">
            This app is only available to people who already use Better Intra.
            Open the extension on intra.42.fr and sign in first.
          </p>
          <button
            class="btn btn-primary mt-2"
            @click=${() => location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  `;
}

const triggered = new Set<Tab>();

function triggerLoad(tab: Tab): void {
  switch (tab) {
    case "dashboard":
      loadDashboard();
      break;
    case "events":
      void loadEvents();
      break;
    case "friends":
      void loadFriends();
      break;
    case "students":
      void loadStudents();
      break;
    case "settings":
      void loadSettings();
      break;
  }
}

function renderBody(): void {
  const tab = currentTab();
  let body: unknown;
  switch (tab) {
    case "dashboard":
      body = dashboardView();
      break;
    case "events":
      body = eventsView();
      break;
    case "friends":
      body = friendsView();
      break;
    case "students":
      body = studentsView();
      break;
    case "settings":
      body = settingsView();
      break;
  }
  renderShell(tab, body);
}

function gateStudents(): void {
  void me()
    .then((m) => {
      setTabHidden("students", Boolean(m && m.campusId !== 12));
      if (m && m.campusId !== 12 && currentTab() === "students") {
        location.hash = "/dashboard";
      }
      renderBody();
    })
    .catch(() => {
      /* campus unknown — keep the tab visible */
    });
}

function renderRoute(): void {
  const tab = currentTab();
  if (!triggered.has(tab)) {
    triggered.add(tab);
    triggerLoad(tab);
  }
  renderBody();
}

async function boot(): Promise<void> {
  render(loadingScreen(), app());
  void registerServiceWorker();
  initTheme();

  // Mock mode: skip auth entirely and render the app with fake data.
  if (mockMode) {
    setRefresh(renderBody);
    window.addEventListener("hashchange", renderRoute);
    initPullRefresh();
    initSwipe();
    gateStudents();
    if (!location.hash) location.hash = "/dashboard";
    renderRoute();
    return;
  }

  const params = new URLSearchParams(location.search);

  if (params.get("error") === "not_registered") {
    history.replaceState(null, "", "/");
    render(blockedScreen(), app());
    return;
  }

  const code = params.get("code");
  if (code) {
    try {
      const { token, login } = await exchangeCode(code);
      setSession(token, login);
    } catch {
      /* fall through to sign-in */
    }
    history.replaceState(null, "", "/");
  }

  if (!getSession()) {
    render(signInScreen(), app());
    return;
  }

  if (!location.hash) location.hash = "/dashboard";

  setRefresh(renderBody);
  window.addEventListener("hashchange", renderRoute);
  initPullRefresh();
  initSwipe();
  gateStudents();
  renderRoute();
}

void boot();
