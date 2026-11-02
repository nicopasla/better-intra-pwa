import { html, render } from "lit-html";
import { lockScroll, unlockScroll } from "./scroll-lock.ts";

const DIALOG_ID = "ft-image-viewer";

export interface ViewerImage {
  src: string;
  /** Short name used on the button that switches to the other picture. */
  label: string;
}

export interface ImageViewerOptions {
  /** Pictures to show; when there are two, the dialog can swap between them. */
  images: ViewerImage[];
  alt?: string;
}

/**
 * Enlarges a profile picture in a centred dialog: big, but with the page
 * still visible around it. The Close button, the backdrop, or Esc dismisses
 * it; with two sources (custom and original) a button switches between them.
 */
export function openImageViewer(opts: ImageViewerOptions): void {
  const images = opts.images.filter((img) => img.src);
  if (images.length === 0) return;

  document.getElementById(DIALOG_ID)?.remove();

  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "ft-image-viewer";
  dialog.setAttribute(
    "aria-label",
    opts.alt ? `${opts.alt}'s picture` : "Picture",
  );

  let index = 0;
  const draw = (): void => {
    const current = images[index];
    const next = images.length > 1 ? images[(index + 1) % images.length] : null;
    render(
      html`<div class="flex flex-col items-center gap-2.5">
        <img
          class="ft-image-viewer-img"
          src="${current.src}"
          alt="${opts.alt ?? current.label}"
          referrerpolicy="no-referrer"
          draggable="false"
          @dragstart=${(ev: Event) => ev.preventDefault()}
        />
        <div class="flex w-full gap-2">
          ${next
            ? html`<button
                type="button"
                class="btn btn-sm flex-1"
                @click=${() => {
                  index = (index + 1) % images.length;
                  draw();
                }}
              >
                Show ${next.label.toLowerCase()}
              </button>`
            : ""}
          <form method="dialog" class="flex-1">
            <button class="btn btn-error btn-sm w-full">Close</button>
          </form>
        </div>
      </div>`,
      dialog,
    );
  };
  draw();

  // The dialog is sized to the picture, so backdrop clicks land on it.
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog && dialog.open) dialog.close();
  });
  dialog.addEventListener("close", () => {
    unlockScroll();
    dialog.remove();
  });

  document.body.appendChild(dialog);
  lockScroll();
  dialog.showModal();
}
