import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import X_SVG from "../assets/x.svg?raw";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import ARROW_SHARE_SVG from "../assets/arrow_share.svg?raw";
import {
  eventSubscribers,
  type EventSubscriber,
  type EventSubscribersPage,
} from "../data.ts";
import { lockScroll, unlockScroll } from "../lib/scroll-lock.ts";
import {
  AVATARS_ENABLED,
  avatarErrorFallback,
  initialsAvatar,
} from "../lib/avatar.ts";
import { navigateToSeat, navigateToUser } from "../shell.ts";

const DIALOG_ID = "ft-subscribers-dialog";

/** Same solid seat chip as the friends list and logtime header. */
const SEAT_STYLE = `border:3px solid color-mix(in oklab, var(--color-success) 55%, transparent);border-radius:0.75rem;height:auto;padding-block:0.15rem;`;

function row(
  u: EventSubscriber,
  onProfile: () => void,
  onSeat: (seat: string) => void,
) {
  return html`
    <div
      class="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors hover:bg-base-200 active:bg-base-200"
    >
      <a
        href="#/u/${u.login}"
        class="flex items-center gap-3 flex-1 min-w-0 no-underline text-base-content"
        @click=${(ev: Event) => {
          ev.preventDefault();
          onProfile();
        }}
      >
        <div class="avatar ${u.location ? "avatar-online" : ""} shrink-0">
          <div class="w-10 h-10 rounded-full bg-base-300">
            ${AVATARS_ENABLED
              ? html`<img
                  class="w-full h-full rounded-full object-cover"
                  src="${u.avatar || "/icons/icon-192.png"}"
                  alt="${u.login}"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  @error=${avatarErrorFallback}
                />`
              : initialsAvatar(u.login, "w-full h-full")}
          </div>
        </div>
        <div class="min-w-0 flex-1 flex flex-col">
          <span class="font-semibold leading-tight truncate">${u.login}</span>
          ${u.displayName && u.displayName !== u.login
            ? html`<span class="text-xs leading-tight opacity-60 truncate"
                >${u.displayName}</span
              >`
            : ""}
        </div>
      </a>
      ${u.location
        ? html`<a
            href="#/clusters?seat=${encodeURIComponent(u.location)}"
            class="badge badge-success badge-md gap-1 px-2 shrink-0 text-sm font-semibold no-underline cursor-pointer hover:brightness-110 transition-all"
            style="${SEAT_STYLE}"
            title="Show ${u.location} on the cluster map"
            @click=${(ev: Event) => {
              ev.preventDefault();
              ev.stopPropagation();
              onSeat(u.location!);
            }}
          >
            <span
              class="size-[1.05em] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              >${unsafeHTML(MAP_PIN_SVG)}</span
            >
            ${u.location}
            <span
              class="size-3 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full opacity-80"
              >${unsafeHTML(ARROW_SHARE_SVG)}</span
            >
          </a>`
        : ""}
    </div>
  `;
}

/** Opens a dialog listing the users subscribed to a 42 event (live API). */
export function openSubscribersDialog(
  eventId: number,
  eventName: string,
  initial?: EventSubscribersPage | null,
): void {
  document.getElementById(DIALOG_ID)?.remove();

  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "bg-transparent backdrop:bg-black/50";
  dialog.style.cssText =
    "margin:auto;padding:0;border:none;outline:none;max-width:26rem;width:calc(100dvw - 2rem);";

  let loaded = Boolean(initial);
  let error = false;
  let users: EventSubscriber[] = initial?.users ?? [];
  let truncated = initial?.truncated ?? false;

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  const openProfile = (login: string) => {
    close();
    navigateToUser(login);
  };

  const openSeat = (seat: string) => {
    close();
    navigateToSeat(seat);
  };

  const body = () => {
    if (!loaded) {
      return html`<div class="flex justify-center py-10">
        <span class="loading loading-spinner loading-md"></span>
      </div>`;
    }
    if (error) {
      return html`<p class="py-8 text-center text-sm opacity-60">
        Couldn't load the subscribers.
      </p>`;
    }
    if (users.length === 0) {
      return html`<p class="py-8 text-center text-sm opacity-60">
        No one has subscribed yet.
      </p>`;
    }
    return html`<div class="flex flex-col gap-0.5">
      ${users.map((u) =>
        row(
          u,
          () => openProfile(u.login),
          () => openSeat(u.location!),
        ),
      )}
      ${truncated
        ? html`<p class="px-3 py-2 text-center text-xs opacity-60">
            Showing the first ${users.length} subscribers.
          </p>`
        : ""}
    </div>`;
  };

  const draw = () => {
    render(
      html`
        <div
          class="bg-base-100 text-base-content rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        >
          <div
            class="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-300"
          >
            <div class="min-w-0">
              <div class="font-bold leading-snug truncate">Subscribers</div>
              <div class="text-xs leading-snug opacity-60 truncate">
                ${eventName}
              </div>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-sm shrink-0"
              aria-label="Close"
              @click=${close}
            >
              ${unsafeHTML(
                X_SVG.replace("<svg", '<svg width="18" height="18"'),
              )}
            </button>
          </div>
          <div class="px-1.5 py-2 overflow-y-auto min-h-0 flex-1">
            ${body()}
          </div>
        </div>
      `,
      dialog,
    );
  };

  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) close();
  });
  dialog.addEventListener("close", () => {
    unlockScroll();
    dialog.remove();
  });

  document.body.appendChild(dialog);
  lockScroll();
  dialog.showModal();
  draw();

  if (initial) return;

  eventSubscribers(eventId)
    .then((res) => {
      users = res.users;
      truncated = res.truncated;
      loaded = true;
      draw();
    })
    .catch(() => {
      error = true;
      loaded = true;
      draw();
    });
}
