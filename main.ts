import "./style.css";
import { html, render } from "lit-html";
import {
  clearSession,
  exchangeCode,
  getSession,
  loginUrl,
  setSession,
} from "./api.ts";
import {
  disablePush,
  enablePush,
  getExistingSubscription,
  pushSupported,
  registerServiceWorker,
  sendTest,
} from "./push.ts";

type Screen = "loading" | "blocked" | "signed_out" | "signed_in";

interface State {
  screen: Screen;
  busy: boolean;
  pushEnabled: boolean;
  message: string;
}

const state: State = {
  screen: "loading",
  busy: false,
  pushEnabled: false,
  message: "",
};

const app = document.getElementById("app")!;

function renderApp() {
  render(view(), app);
}

function view() {
  switch (state.screen) {
    case "loading":
      return shell(html`<span class="loading loading-spinner loading-lg"></span>`);

    case "blocked":
      return shell(html`
        <div class="card w-full max-w-sm bg-base-100 shadow-xl">
          <div class="card-body items-center text-center gap-3">
            <h1 class="card-title">Not available</h1>
            <p class="text-sm opacity-70">
              This app is only available to people who already use Better
              Intra. Open the extension on
              <span class="whitespace-nowrap">intra.42.fr</span> and sign in
              first, then come back here.
            </p>
            <button
              class="btn btn-primary mt-2"
              @click=${() => location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      `);

    case "signed_out":
      return shell(html`
        <div class="card w-full max-w-sm bg-base-100 shadow-xl">
          <div class="card-body items-center text-center gap-4">
            <img src="/icons/icon-192.png" alt="" class="w-16 h-16 rounded-2xl" />
            <h1 class="text-2xl font-bold">Better Intra</h1>
            <p class="text-sm opacity-70">
              Get your 42 evaluation notifications on your phone.
            </p>
            <a class="btn btn-primary w-full" href=${loginUrl()}>Sign in with 42</a>
          </div>
        </div>
      `);

    case "signed_in":
      return shell(signedInView());
  }
}

function shell(content: unknown) {
  return html`
    <div class="min-h-[100dvh] flex items-center justify-center p-4">
      ${content}
    </div>
  `;
}

function signedInView() {
  const session = getSession();
  const supported = pushSupported();
  return html`
    <div class="card w-full max-w-sm bg-base-100 shadow-xl">
      <div class="card-body gap-4">
        <div class="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" class="w-10 h-10 rounded-xl" />
          <div>
            <h1 class="font-bold text-lg leading-tight">Better Intra</h1>
            <p class="text-xs opacity-60">${session?.login ?? ""}</p>
          </div>
        </div>

        <div class="divider my-0"></div>

        ${supported
          ? html`
              <label class="flex items-center justify-between gap-3 cursor-pointer">
                <span class="font-medium">Evaluation notifications</span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary"
                  .checked=${state.pushEnabled}
                  ?disabled=${state.busy}
                  @change=${onTogglePush}
                />
              </label>
              <button
                class="btn btn-sm btn-outline"
                ?disabled=${state.busy || !state.pushEnabled}
                @click=${onTest}
              >
                Send test notification
              </button>
              <p class="text-xs opacity-60">
                On iPhone, add this app to your Home Screen (Share → Add to Home
                Screen) and enable notifications from there.
              </p>
            `
          : html`<p class="text-sm opacity-70">
              This browser does not support push notifications.
            </p>`}
        ${state.message
          ? html`<p class="text-xs text-warning">${state.message}</p>`
          : ""}

        <div class="divider my-0"></div>
        <button class="btn btn-ghost btn-sm" @click=${onLogout}>Sign out</button>
      </div>
    </div>
  `;
}

async function onTogglePush(event: Event) {
  const target = event.target as HTMLInputElement;
  const wantsEnabled = target.checked;
  state.busy = true;
  state.message = "";
  renderApp();
  try {
    if (wantsEnabled) {
      await enablePush();
      state.pushEnabled = true;
    } else {
      await disablePush();
      state.pushEnabled = false;
    }
  } catch (e) {
    state.pushEnabled = !wantsEnabled;
    state.message =
      e instanceof Error && e.message === "permission_denied"
        ? "Notifications permission was denied."
        : "Could not update notifications. Try again.";
  } finally {
    state.busy = false;
    renderApp();
  }
}

async function onTest() {
  state.busy = true;
  state.message = "";
  renderApp();
  try {
    await sendTest();
    state.message = "Test sent — check your notifications.";
  } catch {
    state.message = "Failed to send the test notification.";
  } finally {
    state.busy = false;
    renderApp();
  }
}

function onLogout() {
  clearSession();
  state.screen = "signed_out";
  state.pushEnabled = false;
  renderApp();
}

async function boot() {
  void registerServiceWorker();

  const params = new URLSearchParams(location.search);

  if (params.get("error") === "not_registered") {
    state.screen = "blocked";
    history.replaceState(null, "", "/");
    return renderApp();
  }

  const code = params.get("code");
  if (code) {
    try {
      const { token, login } = await exchangeCode(code);
      setSession(token, login);
    } catch {
      /* fall through to signed_out */
    }
    history.replaceState(null, "", "/");
  }

  const session = getSession();
  if (!session) {
    state.screen = "signed_out";
    return renderApp();
  }

  state.screen = "signed_in";
  renderApp();

  try {
    const sub = await getExistingSubscription();
    state.pushEnabled = Boolean(sub);
    renderApp();
  } catch {
    /* ignore */
  }
}

void boot();
