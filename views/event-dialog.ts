import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import X_SVG from "../assets/x.svg?raw";
import CALENDAR_SVG from "../assets/calendar.svg?raw";
import CLOCK_SVG from "../assets/clock.svg?raw";
import USERS_SVG from "../assets/users.svg?raw";
import MAP_PIN_SVG from "../assets/map-pin.svg?raw";
import CHEVRON_DOWN_SVG from "../assets/chevron-down.svg?raw";
import EXTERNAL_SVG from "../assets/arrow_share.svg?raw";
import { lockScroll, unlockScroll } from "../lib/scroll-lock.ts";
import { openSubscribersDialog } from "./subscribers-dialog.ts";
import {
  eventSubscribers,
  type CalendarEvent,
  type EventSubscribersPage,
} from "../data.ts";

const DIALOG_ID = "ft-event-dialog";

function formatDuration(start: Date, end: Date): string {
  const min = Math.round((end.getTime() - start.getTime()) / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

const badgeStyle = (color: string) =>
  `border:2px solid color-mix(in oklab, ${color} 50%, transparent);background-color:color-mix(in oklab, ${color} 12%, transparent);color:${color};border-radius:var(--badge-radius);height:auto;`;

const badgeContent = (svg: string, label: unknown) =>
  html`<span
      class="size-[1.1em] shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      >${unsafeHTML(svg)}</span
    ><span class="truncate">${label}</span>`;

const badgeBase = "badge badge-lg gap-1.5 px-2.5 text-sm font-semibold w-full justify-center min-w-0";

const detailBadge = (color: string, svg: string, label: unknown) =>
  html`<span class="${badgeBase}" style="${badgeStyle(color)}"
    >${badgeContent(svg, label)}</span
  >`;

const detailBadgeButton = (
  color: string,
  svg: string,
  label: unknown,
  onClick: () => void,
) =>
  html`<button
    type="button"
    class="${badgeBase} cursor-pointer transition-all hover:brightness-110 active:scale-95"
    style="${badgeStyle(color)}"
    @click=${onClick}
  >
    ${badgeContent(svg, label)}
    <span
      class="size-[1em] shrink-0 -rotate-90 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      >${unsafeHTML(CHEVRON_DOWN_SVG)}</span
    >
  </button>`;

/** Opens a small dialog with the event's title, description and details. */
export function openEventDialog(e: CalendarEvent): void {
  document.getElementById(DIALOG_ID)?.remove();

  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "bg-transparent backdrop:bg-black/50";
  dialog.style.cssText =
    "margin:auto;padding:0;border:none;outline:none;max-width:26rem;width:calc(100dvw - 2rem);";

  const start = new Date(e.beginAt);
  const end = new Date(e.endAt);
  const isExam = (e.url ?? "").includes("/exams/") || /^exam/i.test(e.name);
  const href =
    e.url ?? (e.id ? `https://events.intra.42.fr/events/${e.id}` : undefined);
  const canList = Boolean(e.id) && !isExam;
  const dayLabel = start.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const when = `${dayLabel} · ${pad2(start.getHours())}:${pad2(
    start.getMinutes(),
  )}`;

  // The ICS snapshot only carries the count from the last extension sync, which
  // can be stale. Prefer the live API list (same source as the subscribers
  // dialog) and keep the snapshot as the initial/fallback value.
  let live: EventSubscribersPage | null = null;

  const countLabel = (count: number, truncated: boolean): string =>
    `${count}${truncated ? "+" : ""}${
      e.maxSubscribers != null ? `/${e.maxSubscribers}` : ""
    }`;

  const subscribersLabel = (): string | null => {
    if (live) return countLabel(live.users.length, live.truncated);
    if (e.subscribers == null) return null;
    return countLabel(e.subscribers, false);
  };

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  const draw = () => {
    const subs = subscribersLabel();
    render(
      html`
        <div
          class="bg-base-100 text-base-content rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        >
          <div class="flex-none flex items-start gap-2 px-4 pt-4">
            <h2
              class="flex-1 min-w-0 text-lg font-bold leading-snug ${isExam
                ? "text-error"
                : ""}"
            >
              ${e.name}
            </h2>
            <button
              type="button"
              class="btn btn-ghost btn-sm shrink-0"
              aria-label="Close"
              @click=${close}
            >
              ${unsafeHTML(X_SVG.replace("<svg", '<svg width="18" height="18"'))}
            </button>
          </div>
          <div class="flex-none px-4 pt-2 pb-3 flex flex-col gap-2">
            <div class="flex flex-col gap-2">
              <div class="grid grid-cols-[3fr_2fr] gap-2">
                ${detailBadge("var(--color-info)", CALENDAR_SVG, when)}
                ${detailBadge(
                  "var(--color-primary)",
                  CLOCK_SVG,
                  formatDuration(start, end),
                )}
              </div>
              ${subs || e.location
                ? html`<div class="grid grid-cols-[2fr_3fr] gap-2">
                    ${subs
                      ? canList
                        ? detailBadgeButton(
                            "var(--color-accent)",
                            USERS_SVG,
                            subs,
                            () => openSubscribersDialog(e.id!, e.name, live),
                          )
                        : detailBadge("var(--color-accent)", USERS_SVG, subs)
                      : ""}
                    ${e.location
                      ? detailBadge(
                          "var(--color-success)",
                          MAP_PIN_SVG,
                          e.location,
                        )
                      : ""}
                  </div>`
                : ""}
            </div>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto px-4 pb-3 pt-1">
            ${e.description
              ? html`<p class="text-sm whitespace-pre-wrap wrap-break-word opacity-90">${e.description.trim()}</p>`
              : html`<p class="text-sm opacity-60">No description.</p>`}
          </div>
          ${href
            ? html`<div class="border-t border-base-300 px-4 py-3">
                <a
                  class="btn btn-primary btn-sm w-full gap-2"
                  href=${href}
                  target="_blank"
                  rel="noopener noreferrer"
                  >Open on Intra${unsafeHTML(
                    EXTERNAL_SVG.replace("<svg", '<svg width="16" height="16"'),
                  )}</a
                >
              </div>`
            : ""}
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

  if (!canList) return;

  eventSubscribers(e.id!)
    .then((res) => {
      live = res;
      if (dialog.isConnected) draw();
    })
    .catch(() => {
      // Keep the ICS count as the fallback.
    });
}
