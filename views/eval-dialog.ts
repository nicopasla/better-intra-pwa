import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { userLookup, type UpcomingEval, type UserLookup } from "../data.ts";
import { dateTime } from "../lib/format.ts";
import ARROW_SHARE_SVG from "../assets/arrow_share.svg?raw";
import STAR_SVG from "../assets/star-lucide.svg?raw";
import X_SVG from "../assets/x.svg?raw";

const RADIUS = "0.75rem";

const TIME_STYLE = `border:3px solid color-mix(in oklab, var(--color-info) 55%, transparent);background-color:color-mix(in oklab, var(--color-info) 12%, transparent);border-radius:${RADIUS};height:auto;padding-block:0.5rem;`;

const PROJECT_STYLE = `border:3px solid color-mix(in oklab, var(--color-accent) 55%, transparent);background-color:color-mix(in oklab, var(--color-accent) 12%, transparent);border-radius:${RADIUS};height:auto;padding-block:0.5rem;`;

/** Shared style for the user-card badges; only the colour differs. */
const userBadgeStyle = (color: string) =>
  `border:3px solid color-mix(in oklab, ${color} 55%, transparent);border-radius:${RADIUS};color:${color};`;

const DIALOG_ID = "ft-eval-dialog";

const clusterUrl = (seat: string) =>
  `https://meta.intra.42.fr/clusters?seat=${encodeURIComponent(seat)}`;

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 60) return `in ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `in ${h}h${m}` : `in ${h}h`;
}

/** Opens a small dialog with the corrected user's profile. */
export function openEvalDialog(e: UpcomingEval, login: string): void {
  document.getElementById(DIALOG_ID)?.remove();

  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "bg-transparent backdrop:bg-black/50";
  dialog.style.cssText =
    "margin:auto;padding:0;border:none;outline:none;max-width:24rem;width:calc(100dvw - 2rem);";

  let user: UserLookup | null = null;
  let error = false;
  let loaded = false;

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  const body = () => {
    if (!loaded) {
      return html`<div class="flex justify-center py-10">
        <span class="loading loading-spinner loading-md"></span>
      </div>`;
    }
    if (error || !user) {
      return html`<p class="py-6 text-center text-sm opacity-60">
        Couldn't load this user.
      </p>`;
    }
    const u = user;
    return html`
      <div
        class="flex items-center gap-3 rounded-xl border border-base-300 bg-base-200/40 p-3"
      >
        <a
          href="https://profile-v3.intra.42.fr/users/${u.login}"
          target="_blank"
          rel="noopener noreferrer"
          class="avatar ${u.location ? "avatar-online" : ""} shrink-0"
        >
          <div class="w-16 h-16 rounded-full bg-base-300">
            <img
              class="w-full h-full rounded-full object-cover"
              src="${u.avatar ?? "/icons/icon-192.png"}"
              alt="${u.login}"
              onerror="this.onerror=null;this.src='/icons/icon-192.png'"
            />
          </div>
        </a>

        <div class="min-w-0 flex flex-col gap-1.5">
          <div class="flex items-center gap-1.5 flex-wrap min-w-0">
            <span class="font-bold text-xl text-primary">${u.login}</span>
            ${u.displayName && u.displayName !== u.login
              ? html`<span class="text-base opacity-80 truncate"
                  >${u.displayName}</span
                >`
              : ""}
          </div>

          <div class="flex items-center gap-1 flex-wrap min-w-0">
            <span
              class="badge badge-lg gap-1 px-2 text-base font-semibold"
              style="${userBadgeStyle("var(--color-primary)")}"
            >
              <span
                class="size-[1em] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                >${unsafeHTML(STAR_SVG)}</span
              >${u.level.toFixed(2)}</span
            >
            ${u.location
              ? html`<a
                  href="${clusterUrl(u.location)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="badge badge-lg gap-1 px-2 text-base font-semibold no-underline"
                  style="${userBadgeStyle("var(--color-success)")}"
                >
                  <span>${u.location}</span>
                  <span
                    class="size-[1em] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                    >${unsafeHTML(ARROW_SHARE_SVG)}</span
                  >
                </a>`
              : html`<span
                  class="badge badge-lg gap-1 px-2 text-base font-semibold"
                  style="${userBadgeStyle("var(--color-base-content)")}"
                  >unavailable</span
                >`}
          </div>
        </div>
      </div>

      ${e.slug
        ? html`<a
            href="https://projects.intra.42.fr/projects/${e.slug}"
            target="_blank"
            rel="noopener noreferrer"
            class="badge badge-lg w-full justify-center gap-1 mt-3 text-base font-semibold no-underline"
            style="${PROJECT_STYLE}"
          >
            ${e.project ?? "Project"}
            <span
              class="size-[1em] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              >${unsafeHTML(ARROW_SHARE_SVG)}</span
            >
          </a>`
        : ""}

      <div class="flex gap-2 mt-3">
        <span
          class="badge badge-lg flex-[0.8] justify-center text-base font-semibold"
          style="${TIME_STYLE}"
          >${countdown(e.beginAt)}</span
        >
        <span
          class="badge badge-lg flex-1 justify-center text-base font-semibold"
          style="${TIME_STYLE}"
          >${dateTime(e.beginAt)}</span
        >
      </div>
    `;
  };

  const draw = () => {
    render(
      html`
        <div
          class="bg-base-100 text-base-content rounded-2xl shadow-2xl overflow-hidden"
        >
          <div
            class="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-300"
          >
            <div class="min-w-0">
              <div class="font-bold truncate">
                Evaluation ${countdown(e.beginAt)}
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
          <div class="px-4 py-4">${body()}</div>
        </div>
      `,
      dialog,
    );
  };

  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) close();
  });
  dialog.addEventListener("close", () => dialog.remove());

  document.body.appendChild(dialog);
  dialog.showModal();
  draw();

  userLookup(login)
    .then((u) => {
      user = u;
      loaded = true;
      draw();
    })
    .catch(() => {
      error = true;
      loaded = true;
      draw();
    });
}
