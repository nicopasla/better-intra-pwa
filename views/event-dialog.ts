import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import X_SVG from "../assets/x.svg?raw";
import { dateTime } from "../lib/format.ts";
import type { CalendarEvent } from "../data.ts";

const DIALOG_ID = "ft-event-dialog";

function formatDuration(start: Date, end: Date): string {
  const min = Math.round((end.getTime() - start.getTime()) / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

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
  const subs =
    e.subscribers != null
      ? e.maxSubscribers != null
        ? `${e.subscribers}/${e.maxSubscribers}`
        : String(e.subscribers)
      : null;

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  render(
    html`
      <div
        class="bg-base-100 text-base-content rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
      >
        <div
          class="flex items-start justify-between gap-3 px-4 py-3 border-b border-base-300"
        >
          <div class="min-w-0">
            <div class="font-bold leading-snug ${isExam ? "text-error" : ""}">
              ${e.name}
            </div>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm shrink-0"
            aria-label="Close"
            @click=${close}
          >
            ${unsafeHTML(X_SVG.replace("<svg", '<svg width="18" height="18"'))}
          </button>
        </div>
        <div class="px-4 py-3 flex flex-col gap-3 overflow-y-auto">
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge badge-accent badge-outline"
              >${dateTime(e.beginAt)}</span
            >
            <span class="badge badge-accent badge-outline"
              >${formatDuration(start, end)}</span
            >
            ${subs
              ? html`<span class="badge badge-accent badge-outline"
                  >${subs} subscribed</span
                >`
              : ""}
            ${e.location
              ? html`<span class="badge badge-accent badge-outline"
                  >${e.location}</span
                >`
              : ""}
          </div>
          ${e.description
            ? html`<p
                class="text-sm whitespace-pre-wrap break-words opacity-90"
              >
                ${e.description}
              </p>`
            : html`<p class="text-sm opacity-60">No description.</p>`}
          ${href
            ? html`<a
                class="btn btn-primary btn-sm self-center px-6"
                href=${href}
                target="_blank"
                rel="noopener noreferrer"
                >Open on Intra</a
              >`
            : ""}
        </div>
      </div>
    `,
    dialog,
  );

  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}
