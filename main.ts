import "./style.css";
import { html, render } from "lit-html";
import {
  exchangeCode,
  forgetSession,
  getSession,
  loginUrl,
  setSession,
  setSessionExpiredHandler,
} from "./api.ts";
import { initTheme } from "./theme.ts";
import {
  currentTab,
  renderScreen,
  renderShell,
  Tab,
  setRouteRenderer,
} from "./shell.ts";
import { setRefresh } from "./refresh.ts";
import { dashboardView, loadDashboard } from "./views/dashboard.ts";
import {
  profileView,
  loadProfile,
  profileAttachObservers,
} from "./views/profile.ts";
import { friendsView, loadFriends } from "./views/friends.ts";
import {
  studentsView,
  loadStudents,
  studentsAttachObservers,
} from "./views/students.ts";
import { settingsView, loadSettings } from "./views/settings.ts";
import {
  ensurePushSubscription,
  onPushSubscriptionChange,
  registerServiceWorker,
  syncPushSubscription,
} from "./push.ts";
import { initConnectivityBanner } from "./lib/connectivity.ts";
import {
  canInstall,
  initInstall,
  isIOS,
  isMobileOS,
  isStandalone,
  onInstallAvailability,
  promptInstall,
} from "./lib/install.ts";
import { initRouter } from "./lib/router.ts";
import { mockMode } from "./mock.ts";
import { initPullRefresh } from "./pull-refresh.ts";
import { initSwipe } from "./swipe.ts";
import { setTabHidden } from "./shell.ts";
import { me } from "./data.ts";
import { requestPersistentStorage } from "./lib/persist.ts";

const app = () => document.getElementById("app")!;

function loadingScreen() {
  return html`
    <div class="flex-1 flex items-center justify-center">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  `;
}

function installCallout() {
  if (isStandalone()) return "";
  if (canInstall()) {
    return html`
      <button
        class="btn btn-outline w-full"
        @click=${() => void promptInstall()}
      >
        Install app
      </button>
      <p class="text-xs opacity-60">
        Install Better Intra as an app to enable notifications and a full-screen
        experience.
      </p>
    `;
  }
  const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    return html`<p class="text-xs opacity-60">
      Add to Home Screen (Share → Add to Home Screen) to install and enable
      notifications.
    </p>`;
  }
  return "";
}

function signInScreen(expired = false) {
  return html`
    <div class="flex-1 flex items-center justify-center p-4">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body items-center text-center gap-4">
          <img src="/icons/icon-192.png" alt="" class="w-16 h-16 rounded-2xl" />
          <h1 class="text-2xl font-bold">Better Intra</h1>
          ${expired
            ? html`<p class="text-sm text-warning">
                Your session expired — sign in again.
              </p>`
            : ""}
          <a class="btn btn-primary w-full" href=${loginUrl()}
            >Sign in with 42</a
          >
          ${installCallout()}
        </div>
      </div>
    </div>
  `;
}

function renderSignIn(expired = false): void {
  render(signInScreen(expired), app());
}

function installGateScreen() {
  const ios = isIOS();
  return html`
    <div class="flex-1 flex items-center justify-center p-4">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body items-center text-center gap-4">
          <img src="/icons/icon-192.png" alt="" class="w-16 h-16 rounded-2xl" />
          <h1 class="text-2xl font-bold">Install Better Intra</h1>
          <p class="text-sm opacity-70">
            ${ios
              ? "Better Intra only works as an installed app on iPhone and iPad. Tap the Share button, then choose “Add to Home Screen”."
              : "Better Intra only works as an installed app on Android. Open your browser menu and choose “Install app” or “Add to Home Screen”."}
          </p>
          ${canInstall()
            ? html`<button
                class="btn btn-primary w-full"
                @click=${() => void promptInstall()}
              >
                Install app
              </button>`
            : ""}
          <p class="text-xs opacity-60">
            Then open Better Intra from your Home Screen.
          </p>
        </div>
      </div>
    </div>
  `;
}

function renderGate(): void {
  render(installGateScreen(), app());
}

/** The last pre-app screen shown (gate/sign-in), so install availability can
 *  repaint it. Cleared once the app itself is running. */
let preAppScreen: (() => void) | null = null;

function refreshPreApp(): void {
  if (preAppScreen) preAppScreen();
}

function blockedScreen() {
  return html`
    <div class="flex-1 flex items-center justify-center p-4">
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
const lastLoadedAt: Partial<Record<Tab, number>> = {};
const FRESH_MS = 30_000;

/** Set once when the worker rejects the session, so parallel 401s only reload once. */
let sessionExpired = false;

function triggerLoad(tab: Tab, force = false): void {
  if (!force && triggered.has(tab)) return;
  triggered.add(tab);
  lastLoadedAt[tab] = Date.now();
  switch (tab) {
    case "dashboard":
      loadDashboard();
      break;
    case "profile":
      void loadProfile();
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

/** Re-fetch the active tab's data (used by visibility/storage sync). */
function refreshActiveTab(force = false): void {
  const tab = currentTab();
  if (!force && Date.now() - (lastLoadedAt[tab] ?? 0) < FRESH_MS) return;
  lastLoadedAt[tab] = Date.now();
  switch (tab) {
    case "dashboard":
      loadDashboard(true);
      break;
    case "profile":
      void loadProfile(true);
      break;
    case "friends":
      void loadFriends(true);
      break;
    case "students":
      void loadStudents(true);
      break;
  }
}

function onStorage(e: StorageEvent): void {
  if (!e.key) return;
  if (e.key === "ft_pwa_token" || e.key === "ft_pwa_login") {
    if (!getSession()) location.reload();
    else refreshActiveTab(true);
    return;
  }
  if (
    e.key === "FRIENDS_LIST" ||
    e.key === "SHOW_CUSTOM_AVATARS_IN_FRIENDS" ||
    e.key === "ft_pwa_friends_custom"
  ) {
    refreshActiveTab(true);
  }
}

function initAppListeners(): void {
  if (!mockMode) void requestPersistentStorage();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshActiveTab();
      healPush();
    }
  });
  window.addEventListener("storage", onStorage);
}

/** Re-registers a rotated push subscription with the worker. */
function healPush(): void {
  if (mockMode || !getSession()) return;
  void syncPushSubscription();
  void ensurePushSubscription();
}

function renderBody(): void {
  const tab = currentTab();
  let body: unknown;
  switch (tab) {
    case "dashboard":
      body = dashboardView();
      break;
    case "profile":
      body = profileView();
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
  if (tab === "students") studentsAttachObservers();
  if (tab === "profile") profileAttachObservers();
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
  triggerLoad(currentTab());
  renderBody();
}

async function boot(): Promise<void> {
  render(loadingScreen(), app());
  void registerServiceWorker();
  initTheme();
  initConnectivityBanner();
  initInstall();
  onInstallAvailability(refreshPreApp);
  onPushSubscriptionChange(() => void syncPushSubscription());
  initAppListeners();

  // Mock mode: skip auth entirely and render the app with fake data.
  if (mockMode) {
    setRefresh(renderBody);
    setRouteRenderer(renderRoute);
    initRouter(renderRoute);
    initPullRefresh();
    initSwipe();
    gateStudents();
    if (!location.hash) location.hash = "/dashboard";
    renderRoute();
    return;
  }

  // On phones/tablets the app must be installed (standalone) to be usable —
  // this also avoids signing in twice (browser, then installed app).
  if (isMobileOS() && !isStandalone()) {
    preAppScreen = renderGate;
    renderGate();
    return;
  }

  const params = new URLSearchParams(location.search);

  if (params.get("error") === "not_registered") {
    history.replaceState(null, "", "/");
    preAppScreen = null;
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

  const expired = sessionStorage.getItem("ft_pwa_expired") === "1";
  if (!getSession()) {
    sessionStorage.removeItem("ft_pwa_expired");
    preAppScreen = renderSignIn;
    renderSignIn(expired);
    return;
  }
  sessionStorage.removeItem("ft_pwa_expired");

  preAppScreen = null;
  if (!location.hash) location.hash = "/dashboard";

  // The worker rejecting our session (401) means it's no longer valid: drop it
  // and return to the sign-in screen rather than surfacing an error.
  setSessionExpiredHandler(() => {
    if (sessionExpired) return;
    sessionExpired = true;
    sessionStorage.setItem("ft_pwa_expired", "1");
    forgetSession();
    location.reload();
  });

  setRefresh(renderBody);
  setRouteRenderer(renderRoute);
  initRouter(renderRoute);
  initPullRefresh();
  initSwipe();
  gateStudents();
  healPush();
  renderRoute();
}

void boot();
