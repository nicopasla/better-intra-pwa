# Development

Technical notes for the Better Intra PWA (`better-intra-pwa/`), the installable mobile web app served at [mobile.betterintra.com](https://mobile.betterintra.com).

## Prerequisites

- Node.js
- npm

## Setup

```bash
git clone https://github.com/nicopasla/better-intra-pwa.git
cd better-intra-pwa
npm install
```

## Commands

```bash
npm run dev        # vite dev server
npm run typecheck  # tsc --noEmit
npm run build      # production build to dist/
npm run preview    # build, then vite preview
npm run deploy     # build, then wrangler deploy
```

### Mock mode

Appending `?mock` to the URL (or building with `VITE_MOCK=1`) skips auth entirely and renders the app with fixture data from `mock.ts`. Useful for UI work without a worker session or network access.

Mock mode also flips `AVATARS_ENABLED` on (`lib/avatar.ts`), so the fixture images render instead of initials. Avatar error handling skips the worker proxy in mock mode and falls straight back to the letter placeholder.

## Toolchain

- **Vite 8** + `@tailwindcss/vite`. No framework; views are plain functions returning lit-html templates.
- **lit-html** for all DOM templating (`render`, `until`, `unsafeHTML`).
- **Tailwind v4**: CSS-driven config, no `tailwind.config.js`. `style.css` starts with `@import "tailwindcss" source("./")`, so content detection is scoped to this directory.
- **daisyUI 5**: enabled via `@plugin "daisyui"` in `style.css` with an explicit `include` list of components (button, card, toggle, alert, badge, loading, divider, menu, avatar, dock, progress, indicator, input, select, checkbox, swap, stat, join, list, modal, collapse, status). Adding a daisyUI component to a view requires adding it to that list.
- **TypeScript**: `strict: true`, `moduleResolution: bundler`, `noEmit` (type-check only). Imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- `__APP_VERSION__` is injected at build time from `package.json` by `vite.config.ts` and shown in Settings → About & Debug.
- Prettier is used at the editor level; no committed config and no linter.

## Project structure

```
main.ts              entrypoint: boot, auth gate, tab wiring, cache hydration
shell.ts             bottom dock, Tab type, navigate(), renderShell()
api.ts               worker URL, session storage, loginUrl(), exchangeCode(), workerFetch()
data.ts              typed worker fetchers (me, evals, friends, students, events, settings)
push.ts              Web Push subscribe/unsubscribe/test + eval-tracking sync
mock.ts              mock mode fixtures (mockMode, mock)
refresh.ts           setRefresh()/refresh(), asks the shell to repaint
theme.ts             system/dark/light preference (ft_theme) + meta theme-color
pull-refresh.ts      pull-to-refresh gesture
style.css            Tailwind + daisyUI config and PWA-safe-area styles
index.html           app shell, manifest + icon links, apple-mobile-web-app meta

views/               one module per tab
  dashboard.ts       Home tab
  profile.ts         Profile tab (evaluations / projects / achievements sub-tabs)
  friends.ts         Friends tab (delegates to friends-feature/)
  friends-feature/   friends widget: friends.ts, widget.ts
  students.ts        Students tab (delegates to students-feature/)
  students-feature/  controller.ts, data.ts, template.ts
  clusters.ts        Clusters tab (delegates to clusters-feature/)
  clusters-feature/  data.ts, render.ts, sort.ts, types.ts
  settings.ts        Settings tab
  eval-dialog.ts     evaluation detail dialog
  event-dialog.ts    42 event detail dialog
  subscribers-dialog.ts  event subscriber list dialog
  students-utils.ts  student status/date/level formatting helpers

lib/                 shared utilities
  app-data.ts        clearCache(), resetData() (local factory reset)
  avatar.ts          avatar rendering (initials fallback, AVATARS_ENABLED)
  badge.ts           setAppBadge()/clearAppBadge() (Chromium only)
  cache.ts           readCache/readScopedCache/writeCache (ft_pwa_cache_*)
  campus-flags.ts    campus name to flag emoji
  coming-soon.ts     placeholder view for unavailable features
  community.ts       GitHub stars/followers + repo URLs
  connectivity.ts    fixed offline indicator dot
  crypto.ts          hashLogin(), SHA-256 of the lowercase login
  cursus.ts          cursus label formatting
  evals.ts           persisted upcoming-eval cache + "done" tracking
  format.ts          Intl-based date/time/relative formatting
  install.ts         PWA install prompt, isIOS/isAndroid/isMobileOS/isStandalone
  network.ts         navigator.connection helpers (save-data)
  page-header.ts     sticky page header + count badge
  persist.ts         navigator.storage persist/persisted
  push-store.ts      IndexedDB KV bridge for push hand-off + device timezone
  retry.ts           Retrier, isRetryableError(), friendlyError()
  router.ts          Navigation API with hashchange fallback
  scroll-lock.ts     modal scroll lock
  segmented-tabs.ts  segmented sub-tab control with overflow to dropdown

public/              copied verbatim to dist/
  sw.js              service worker (offline shell + push)
  manifest.webmanifest
  icons/, favicon*, apple-touch-icon.png

assets/              SVG icons imported with ?raw
```

## Boot & auth flow

`boot()` in `main.ts` runs in this order:

1. Render the loading spinner; register the service worker; store the device timezone; `initTheme()`, `initConnectivityIndicator()`, `initInstall()`, `initAppListeners()`.
2. **Mock mode** short-circuits here.
3. **Install gate**: on `isMobileOS() && !isStandalone()` the app renders an "Install Better Intra" screen and stops. This avoids signing in twice (browser, then installed app).
4. **`?error=not_registered`** renders the "Not available" screen (the account doesn't exist in the worker yet).
5. **OAuth callback**: a `?code=` param is exchanged via `POST /api/v1/public/auth/exchange`, the session is stored, and the URL is cleaned with `history.replaceState`.
6. **No session** renders the sign-in screen; `ft_pwa_expired` in `sessionStorage` adds a "your session expired" notice.
7. Otherwise: default the hash to `#/dashboard`, register `setSessionExpiredHandler`, wire `setRefresh`/`setRouteRenderer`, `initRouter`, `initPullRefresh`, `gateCampusTabs`, `healPush`, `hydrateCaches`, `renderRoute`.

Sign-in goes through `loginUrl()`, which points at the worker's full-page OAuth entry (`/login`) with a `redirect_uri` back to the app and an `ft_device` param carrying the stable per-device name from `getDeviceName()` (a random username persisted in `ft_pwa_device`, so repeated phone logins collapse into one server-side session).

`workerFetch(path, init, withAuth)` in `api.ts` attaches `Authorization: Bearer <token>` and appends `?login=<sha256(lowercase login)>`. A 401 fires the session-expired handler registered by the shell, which clears the session and reloads into the sign-in screen (guarded so parallel 401s reload once).

Tab data loading is split between `triggerLoad()` (first visit) and `refreshActiveTab()` (visibility/storage changes, skipped if the tab was loaded less than `FRESH_MS` = 30s ago).

## Routing

Routes are hash-based: `#/dashboard`, `#/profile`, `#/friends`, `#/students`, `#/clusters`, `#/settings`. `lib/router.ts` prefers the Navigation API (`window.navigation` `navigate` event, intercepting same-document navigations) and falls back to `hashchange` elsewhere. `shell.navigate(tab)` sets the hash and calls the renderer registered via `setRouteRenderer()`.

## Data layer & worker endpoints

Base URL: `https://api.betterintra.com` (`WORKER_URL` in `api.ts`).

Private (bearer + hashed login):

| Endpoint                                                       | Used for                                                              |
|----------------------------------------------------------------|-----------------------------------------------------------------------|
| `GET /api/v1/private/me`                                       | profile header, wallet, level, projects, achievements                 |
| `GET /api/v1/private/evaluations?action=upcoming`              | upcoming evaluations                                                  |
| `POST /api/v1/private/evaluations?action=sync`                 | enable/disable eval tracking                                          |
| `GET /api/v1/private/evaluations?action=status`                | debug panel (tracked, `pushTestedAt`, subscriptions)                  |
| `GET /api/v1/private/profile-stats?target=`                    | eval/roulette stats                                                   |
| `GET /api/v1/private/user?target=`                             | minimal user lookup for the eval dialog                               |
| `GET /api/v1/private/outstanding?target=&count=`               | outstanding-corrector star counts                                     |
| `GET /api/v1/private/friends/data?logins=`                     | friend rows                                                           |
| `GET/POST/DELETE /api/v1/private/settings`                     | cloud settings blob (POST is revision-based, returns 409 on conflict) |
| `GET /api/v1/private/sessions`, `DELETE ?id=`                  | session list and revocation                                           |
| `GET /api/v1/private/events`                                   | 42 calendar events                                                    |
| `GET /api/v1/private/event-subscribers?event=`                 | subscribers for an event                                              |
| `POST /api/v1/private/push/subscribe`, `/unsubscribe`, `/test` | push lifecycle                                                        |

Public / unauthenticated:

| Endpoint                                                                           | Used for                                                         |
|------------------------------------------------------------------------------------|------------------------------------------------------------------|
| `GET /login?redirect_uri=&ft_device=`                                              | full-page OAuth entry                                            |
| `POST /api/v1/public/auth/exchange`                                                | `code` to `{ token, login }`                                     |
| `GET /api/v1/public/push/key`                                                      | VAPID public key (also doubles as the worker reachability check) |
| `GET /api/v1/students?limit=&offset=&sort=&dir=&filter=&pool_month=&pool_year=&q=` | Belgium student directory pages                                  |

`data.ts` wraps these in typed fetchers and short-circuits to `mock.ts` when `mockMode` is on. Failures throw `HTTP <status>` (or `not_authenticated`), which `lib/retry.ts` classifies: 5xx/429/`TypeError` are retryable via `Retrier` (3s base, 30s cap), other 4xx are not, and `friendlyError()` maps them to user-facing text.

Dashboard and profile payloads are cached in `localStorage` under a versioned, login-scoped key (`lib/cache.ts`), hydrated on boot so the first paint is instant and marked stale if the refresh fails.

## Push notifications & service worker

`enablePush()` deliberately asks for `Notification.requestPermission()` **first**, before any other async work, because iOS only allows the prompt from a user gesture.

`enablePushWithTest()` is what the Settings toggle calls: subscribe, send a test push **to this device's own endpoint** (not just the first stored one), and if the push service permanently rejects it (403/404/410), unsubscribe and leave notifications off. Transient failures (0/429/5xx) keep the subscription. It then calls `syncEvalTracking(true)`. Tracking is gated server-side on `pushTestedAt`, so enabling only sticks after a delivered test.

`healPush()` runs on boot and whenever the app becomes visible: it re-registers a rotated subscription, re-asserts the current subscription, and re-asserts eval tracking.

The service worker (`public/sw.js`):

- **Offline shell**: installs a precache list into `bi-shell-v4`, network-first for GETs, caches successful same-origin responses, and falls back to the cached `index.html` for navigations. The cache name and `SW_VERSION` are bumped together with the `SHELL` list when the precache changes.
- **Push rendering**: formats the eval timestamp using the device's IANA timezone read from IndexedDB, because push events can be handled by a background worker whose `Date`/`Intl` timezone is UTC on Android. Handles the `booked`, `revealed` and `corrected` payload shapes and builds the notification body from `data.correcteds`, `data.corrector` and `data.project`.
- **Subscription self-heal**: `pushsubscriptionchange` re-subscribes, stores the new subscription in IndexedDB (`bi-store` → `kv` → `pendingPushSubscription`), and posts `push-subscription-changed` to clients. The page picks it up with `syncPushSubscription()` and re-registers it against the worker, since the SW has no access to the session token in `localStorage`.
- **Updates**: the worker is registered with `updateViaCache: "none"` (Android WebAPKs otherwise keep serving a stale `sw.js`), and a newly installed worker is sent `SKIP_WAITING` when there's an active controller.
- **Notification clicks**: `preventDefault()` is required for `notificationclick` to fire on iOS; the app then focuses an existing window and navigates it to `notification.data.url`, or opens a new one.

## Storage & caches

`localStorage`:

| Key                                 | Purpose                                                          |
|-------------------------------------|------------------------------------------------------------------|
| `ft_pwa_token`, `ft_pwa_login`      | session (`api.ts`)                                               |
| `ft_pwa_device`                     | stable per-device name used as the server session label          |
| `ft_theme`                          | theme preference (`system`/`dark`/`light`)                       |
| `PROFILE_SUB_TAB`                   | last selected profile sub-tab                                    |
| `ft_pwa_cache_*`                    | versioned, login-scoped response caches (`dashboard`, `profile`) |
| `ft_pwa_evals`, `ft_pwa_evals_done` | upcoming-eval cache and the set of dismissed evals               |
| `ft_dismissed_events`               | dismissed 42 events                                              |

`sessionStorage`: `ft_pwa_expired` (shown once on the sign-in screen after a 401).

IndexedDB `bi-store` → `kv`: `pendingPushSubscription` (SW to page hand-off) and `deviceTimeZone`.

Cache Storage: `bi-shell-v4`.

The app also listens for cross-tab `storage` events on the session keys (`ft_pwa_token`, `ft_pwa_login`) and the friends keys (`FRIENDS_LIST`, `SHOW_CUSTOM_AVATARS_IN_FRIENDS`, `ft_pwa_friends_custom`), refreshing the active tab, or reloading when the session disappears.

## Campus gating

`BELGIUM_CAMPUS = 12`. After boot, `gateCampusTabs()` calls `me()` and compares `campusId`; when it isn't Belgium, the Students and Clusters tabs render `comingSoonView()` (`lib/coming-soon.ts`) instead. If the campus can't be determined the features stay available.

## Deploying

`wrangler.jsonc` serves the built `dist/` as static assets with `not_found_handling: "single-page-application"`, on the custom domain `mobile.betterintra.com`, with observability enabled. Use `npm run deploy`.

## Versioning

Bump `better-intra-pwa/package.json` (and keep `package-lock.json` in sync) at commit time, following semver: major for breaking changes, minor for new features, patch for fixes. A batch of uncommitted changes shares the current version and gets a single bump when committed. The value is injected as `__APP_VERSION__` and shown in Settings → About & Debug.

The extension's version is separate; don't bump it for PWA changes. Don't bump the `better-intra-pwa` submodule pointer from the parent repo either.

## Debugging

- **Settings → About & Debug** shows worker reachability, endpoint host, push permission, eval tracking state, `pushTestedAt`, subscription count, standalone mode, service worker control state, storage persistence, storage usage/quota, the device name and the signed-in login.
- **Maintenance → Clear cache** purges Cache Storage and re-registers the service worker, then reloads. Data is re-downloaded; the session and settings are kept.
- **Maintenance → Reset data** (`lib/app-data.ts` `resetData()`) is a local-only factory reset: it drops the push subscription, unregisters service workers, clears caches, deletes the `bi-store` IndexedDB database, clears `localStorage`/`sessionStorage`, and returns to sign-in. Nothing is sent to the worker.
- The service worker logs `[sw] push version=<SW_VERSION>` on every push, which helps confirm which `sw.js` a device is actually running.

## Conventions

- **Never use `innerHTML`.** Use `render(unsafeHTML(...))` from `lit-html` (with `lit-html/directives/unsafe-html.js`).
- A new tab needs to be added to `TABS` in `shell.ts`, to the `Tab` union, to the hash check in `currentTab()`, and to `triggerLoad`/`refreshActiveTab`/`renderBody` in `main.ts`. If it lazy-loads sub-features, mirror the `views/*.ts` to `views/*-feature/` split so observers can be re-attached after a re-render.
- Styling is Tailwind utilities plus the daisyUI components listed in `style.css`. Respect safe-area insets (`env(safe-area-inset-*)`) for anything fixed to the bottom or top.
- Content that scrolls horizontally should carry `data-no-swipe` so pull-to-refresh doesn't hijack the gesture.

## License

[MIT](./LICENSE)
