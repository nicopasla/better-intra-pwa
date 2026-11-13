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
import { initTheme, syncThemeFromCloud } from "./theme.ts";
import {
  badgeUrlFor,
  initCampusBadges,
  waitForCampusBadges,
} from "./lib/campus-badges.ts";
import {
  currentTab,
  redirectToDashboard,
  renderScreen,
  renderShell,
  Tab,
  setRouteRenderer,
  setTabHidden,
  userLoginFromHash,
} from "./shell.ts";
import { refresh, setRefresh } from "./refresh.ts";
import {
  dashboardAttachObservers,
  dashboardView,
  hydrateDashboardCache,
  loadDashboard,
} from "./views/dashboard.ts";
import {
  profileView,
  hydrateProfileCache,
  loadProfile,
  profileAttachObservers,
  profileBottomBar,
} from "./views/profile.ts";
import {
  friendsBottomBar,
  friendsListEmpty,
  friendsView,
  loadFriends,
} from "./views/friends.ts";
import {
  studentsView,
  loadStudents,
  studentsAttachObservers,
  studentsBottomBar,
} from "./views/students.ts";
import {
  clustersView,
  clusterMapVisible,
  loadClusters,
  clustersAttachObservers,
  clustersBottomBar,
} from "./views/clusters.ts";
import {
  hydrateUserProfileCache,
  loadUserProfile,
  userProfileView,
} from "./views/user-profile.ts";
import { settingsView, loadSettings } from "./views/settings.ts";
import {
  ensurePushSubscription,
  onPushSubscriptionChange,
  registerServiceWorker,
  syncEvalTrackingIfEnabled,
  syncPushSubscription,
} from "./push.ts";
import { initConnectivityIndicator } from "./lib/connectivity.ts";
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
import { initTooltips } from "./lib/tooltip.ts";
import {
  downStatus,
  isWorkerDown,
  onWorkerHealthChange,
} from "./lib/health.ts";
import { downView } from "./views/down.ts";
import { mockMode } from "./mock.ts";
import { initPullRefresh } from "./pull-refresh.ts";
import { myCampus } from "./data.ts";
import { SHOW_CUSTOM_AVATARS_KEY } from "./lib/avatar.ts";
import { requestPersistentStorage } from "./lib/persist.ts";
import { getLastTab, getRememberLastTab, setLastTab } from "./lib/prefs.ts";
import { BELGIUM_CAMPUS } from "./lib/campus.ts";

const app = () => document.getElementById("app")!;

/** "Show cached data" on the down screen lasts for this tab session. */
let downBypassed = sessionStorage.getItem("ft_pwa_down_bypass") === "1";
/** `?down=1` (or `?down=502`) previews the screen without waiting for 42. */
const downParam = new URLSearchParams(location.search).get("down");
const downPreview = downParam !== null;
const previewStatus = /^\d{3}$/.test(downParam ?? "") ? Number(downParam) : 503;

/** Leaves `?down=1` and boots the app normally (QA only). */
function leaveDownPreview(): void {
  location.replace(location.pathname + location.hash);
}

function showDownScreen(forced: boolean): void {
  closeOpenDialogs();
  const retry = forced ? leaveDownPreview : () => location.reload();
  const bypass = forced
    ? leaveDownPreview
    : () => {
        downBypassed = true;
        try {
          sessionStorage.setItem("ft_pwa_down_bypass", "1");
        } catch {
          /* private mode */
        }
        refresh();
      };
  render(downView(forced ? previewStatus : downStatus(), retry, bypass), app());
}

const BELGIUM_TABS: Tab[] = ["students", "clusters"];

/** Belgium-only features are gated by the caller's primary campus. The worker
 *  enforces the same rule on every students endpoint; this is the UX side. */
let campusAllowed = false;
/** False until the campus check settles, so deep links wait instead of redirecting. */
let campusResolved = false;

// Hidden until the me endpoint confirms the campus, so non-Belgium users never
// see the tabs (and deep links into them are redirected).
for (const tab of BELGIUM_TABS) setTabHidden(tab, true);

function applyCampusAccess(campusId: number | null): void {
  campusResolved = true;
  campusAllowed = campusId === BELGIUM_CAMPUS;
  for (const tab of BELGIUM_TABS) setTabHidden(tab, !campusAllowed);

  const tab = currentTab();
  if (!campusAllowed && BELGIUM_TABS.includes(tab)) {
    redirectToDashboard();
    return;
  }
  if (campusAllowed && BELGIUM_TABS.includes(tab)) triggerLoad(tab, true);
  renderBody();
}

/** Asks the worker for the campus stored in D1/KV; retries once on failure. */
async function checkCampusAccess(attempt = 0): Promise<void> {
  try {
    const info = await myCampus();
    applyCampusAccess(info?.campusId ?? null);
  } catch {
    if (attempt < 1) {
      window.setTimeout(() => void checkCampusAccess(attempt + 1), 2000);
      return;
    }
    applyCampusAccess(null);
  }
}

function loadingScreen() {
  return html`
    <div
      class="flex flex-col gap-4"
      role="status"
      aria-label="Loading Better Intra"
    >
      <div class="flex items-center gap-3" aria-hidden="true">
        <span class="skeleton size-14 shrink-0 rounded-full"></span>
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <span class="skeleton h-4 w-2/5"></span>
          <span class="skeleton h-3 w-1/4"></span>
        </div>
      </div>
      <div class="flex flex-col gap-3" aria-hidden="true">
        <span class="skeleton h-28 w-full rounded-box"></span>
        <span class="skeleton h-20 w-full rounded-box"></span>
        <span class="skeleton h-20 w-full rounded-box"></span>
      </div>
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
let lastProfileLoadedAt = 0;
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
      if (campusAllowed) void loadStudents();
      break;
    case "clusters":
      if (campusAllowed) void loadClusters();
      break;
    case "settings":
      void loadSettings();
      break;
  }
}

/** Re-fetch the active tab's data (used by visibility/storage sync). */
function refreshActiveTab(force = false): void {
  const profileLogin = userLoginFromHash();
  if (profileLogin) {
    if (!force && Date.now() - lastProfileLoadedAt < FRESH_MS) return;
    lastProfileLoadedAt = Date.now();
    void loadUserProfile(profileLogin, true);
    return;
  }
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
      if (campusAllowed) void loadStudents(true);
      break;
    case "clusters":
      if (campusAllowed) void loadClusters(true);
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
    e.key === SHOW_CUSTOM_AVATARS_KEY ||
    e.key === "ft_pwa_friends_custom"
  ) {
    refreshActiveTab(true);
  }
}

function initAppListeners(): void {
  initTooltips();
  if (!mockMode) void requestPersistentStorage();
  onWorkerHealthChange(() => refresh());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshActiveTab();
      healPush();
      // A theme change made on the desktop should show up when the app is
      // reopened from the home screen.
      void syncThemeFromCloud();
      // Retry a campus check that failed while offline.
      if (!campusAllowed) void checkCampusAccess();
    }
  });
  window.addEventListener("online", () => {
    if (!campusAllowed) void checkCampusAccess();
  });
  window.addEventListener("storage", onStorage);
}

/** Re-registers a rotated push subscription with the worker. */
function healPush(): void {
  if (mockMode || !getSession()) return;
  void syncPushSubscription();
  void ensurePushSubscription();
  void syncEvalTrackingIfEnabled();
}

/** The cluster map is a fixed viewport, so the page must not scroll behind it
 *  (iOS otherwise moves the document scrollbar while nothing moves). */
function setViewportLock(locked: boolean): void {
  document.documentElement.classList.toggle("ft-fixed-view", locked);
}

function renderBody(): void {
  document.documentElement.classList.remove("ft-friends-empty");
  if (!downBypassed && (downPreview || isWorkerDown())) {
    setViewportLock(false);
    showDownScreen(downPreview);
    return;
  }
  const profileLogin = userLoginFromHash();
  if (profileLogin) {
    setViewportLock(false);
    renderShell(null, userProfileView(profileLogin));
    return;
  }
  const tab = currentTab();
  if (BELGIUM_TABS.includes(tab)) {
    if (!campusResolved) {
      renderShell(null, loadingScreen());
      return;
    }
    if (!campusAllowed) {
      redirectToDashboard();
      return;
    }
  }
  let body: unknown;
  let bottomBar: unknown = "";
  switch (tab) {
    case "dashboard":
      body = dashboardView();
      break;
    case "profile":
      body = profileView();
      bottomBar = profileBottomBar();
      break;
    case "friends":
      body = friendsView();
      bottomBar = friendsBottomBar();
      document.documentElement.classList.toggle(
        "ft-friends-empty",
        friendsListEmpty(),
      );
      break;
    case "students":
      body = studentsView();
      bottomBar = studentsBottomBar();
      break;
    case "clusters":
      body = clustersView();
      bottomBar = clustersBottomBar();
      break;
    case "settings":
      body = settingsView();
      break;
  }
  renderShell(tab, body, bottomBar);
  setViewportLock(tab === "clusters" && campusAllowed && clusterMapVisible());
  if (tab === "dashboard") dashboardAttachObservers();
  if (tab === "profile") profileAttachObservers();
  if (campusAllowed) {
    if (tab === "students") studentsAttachObservers();
    if (tab === "clusters") clustersAttachObservers();
  }
}

function gateCampusTabs(): void {
  void checkCampusAccess();
}

/** Dismisses any modal opened on top of the previous route; dialogs are
 *  appended to <body> (outside #app), so a route render won't remove them. */
function closeOpenDialogs(): void {
  document
    .querySelectorAll<HTMLDialogElement>("dialog[open]")
    .forEach((dialog) => dialog.close());
}

function renderRoute(): void {
  closeOpenDialogs();
  if (userLoginFromHash()) lastProfileLoadedAt = Date.now();
  else {
    // Remember where the user left off for the next cold start.
    setLastTab(currentTab());
    triggerLoad(currentTab());
  }
  renderBody();
}

function hydrateCaches(): void {
  hydrateDashboardCache();
  hydrateProfileCache();
  hydrateUserProfileCache();
}

/**
 * Destination of the app-icon "Slots" shortcut. The URL lives in the campus
 * file (`badges.SLOTS` under `badgeBaseUrl`), never hardcoded here; a short
 * wait covers the very first launch before that file is cached.
 */
async function slotsShortcutUrl(): Promise<string | null> {
  const cached = badgeUrlFor("SLOTS");
  if (cached) return cached;
  await Promise.race([
    waitForCampusBadges(),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);
  return badgeUrlFor("SLOTS");
}

/**
 * Cold start on `/` (the manifest's start_url) has no hash. Reopen the last
 * main tab when the setting is on, otherwise Home. Explicit URLs win.
 */
function applyInitialHash(): void {
  if (location.hash) return;
  const last = getRememberLastTab() ? getLastTab() : null;
  location.hash = `/${last ?? "dashboard"}`;
}

async function boot(): Promise<void> {
  render(html`<div class="p-4">${loadingScreen()}</div>`, app());
  void registerServiceWorker();
  initTheme();
  initCampusBadges();
  initConnectivityIndicator();
  initInstall();
  onInstallAvailability(refreshPreApp);
  onPushSubscriptionChange(() => void syncPushSubscription());
  initAppListeners();

  // `?down=1`: preview the outage screen before 42 actually fails.
  if (downPreview) {
    showDownScreen(true);
    return;
  }

  // App-icon "Slots" shortcut: the destination comes from the campus file.
  if (location.hash === "#/slots") {
    const slotsUrl = await slotsShortcutUrl();
    if (slotsUrl) {
      location.replace(slotsUrl);
      return;
    }
    // No campus app defined (non-Belgium / offline first run): boot normally.
    history.replaceState(null, "", location.pathname + location.search);
  }

  // Mock mode: skip auth entirely and render the app with fake data.
  if (mockMode) {
    setRefresh(renderBody);
    setRouteRenderer(renderRoute);
    initRouter(renderRoute);
    initPullRefresh();
    gateCampusTabs();
    void syncThemeFromCloud();
    applyInitialHash();
    hydrateCaches();
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
  applyInitialHash();

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
  gateCampusTabs();
  healPush();
  void syncThemeFromCloud();
  hydrateCaches();
  renderRoute();
}

void boot();
