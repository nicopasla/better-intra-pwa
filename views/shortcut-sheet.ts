import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { badgeUrlFor } from "../lib/campus-badges.ts";
import { lockScroll, unlockScroll } from "../lib/scroll-lock.ts";
import CALENDAR_PLUS_SVG from "../assets/calendar-plus.svg?raw";

const DIALOG_ID = "ft-shortcut-sheet";

const svg20 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="20" height="20"'));

/**
 * Quick actions opened by long-pressing the Home dock button: the campus
 * Slots app, mirroring the app-icon shortcut iOS does not support for PWAs.
 */
export function openShortcutSheet(): void {
  const slotsUrl = badgeUrlFor("SLOTS");
  if (!slotsUrl) return;

  document.getElementById(DIALOG_ID)?.remove();

  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "modal modal-bottom";

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    unlockScroll();
    dialog.remove();
  };

  render(
    html`
      <div class="modal-box pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h3 class="mb-2 text-base font-bold">Shortcuts</h3>
        <div class="flex flex-col gap-1">
          <a
            class="btn btn-ghost h-auto justify-start gap-3 py-3 text-base font-semibold"
            href="${slotsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            @click=${() => close()}
          >
            ${svg20(CALENDAR_PLUS_SVG)}
            <span class="flex-1 text-left">Slots</span>
          </a>
        </div>
        <form method="dialog" class="modal-action mt-3">
          <button class="btn w-full">Close</button>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    `,
    dialog,
  );

  dialog.addEventListener("close", close);
  document.body.appendChild(dialog);
  lockScroll();
  dialog.showModal();
}
