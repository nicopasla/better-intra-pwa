import { html, render } from "lit-html";
import { lockScroll, unlockScroll } from "./scroll-lock.ts";

const DIALOG_ID = "ft-image-viewer";
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 32;
const DRAG_SLOP = 8;

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
 * Full-screen profile picture viewer: pinch or wheel to zoom, drag to pan,
 * double-tap to toggle the zoom. The actions bar stays pinned at the bottom;
 * everything above it is the picture.
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
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart: { distance: number; scale: number } | null = null;
  let dragStart: { x: number; y: number; tx: number; ty: number } | null = null;
  let lastTap: { time: number; x: number; y: number } | null = null;

  const stage = (): HTMLElement | null =>
    dialog.querySelector<HTMLElement>(".ft-image-viewer-stage");
  const picture = (): HTMLImageElement | null =>
    dialog.querySelector<HTMLImageElement>(".ft-image-viewer-img");

  const apply = (): void => {
    const img = picture();
    if (img) {
      img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    }
  };

  const clampPan = (): void => {
    const el = stage();
    const img = picture();
    if (!el) return;
    const maxX = ((img?.clientWidth ?? el.clientWidth) * (scale - 1)) / 2;
    const maxY = ((img?.clientHeight ?? el.clientHeight) * (scale - 1)) / 2;
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  };

  const resetZoom = (): void => {
    scale = 1;
    tx = 0;
    ty = 0;
    lastTap = null;
    apply();
  };

  const toggleZoom = (): void => {
    if (scale > 1) {
      resetZoom();
      return;
    }
    scale = DOUBLE_TAP_SCALE;
    tx = 0;
    ty = 0;
    clampPan();
    apply();
  };

  const distance = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number => Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    try {
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      dragStart = { x: ev.clientX, y: ev.clientY, tx, ty };
      pinchStart = null;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: distance(a, b) || 1, scale };
      dragStart = null;
    }
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pinchStart && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const ratio = distance(a, b) / pinchStart.distance;
      scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchStart.scale * ratio),
      );
      if (scale === 1) {
        tx = 0;
        ty = 0;
      }
      clampPan();
      apply();
      return;
    }

    if (dragStart && scale > 1) {
      tx = dragStart.tx + (ev.clientX - dragStart.x);
      ty = dragStart.ty + (ev.clientY - dragStart.y);
      clampPan();
      apply();
      const travel = Math.hypot(
        ev.clientX - dragStart.x,
        ev.clientY - dragStart.y,
      );
      if (travel > DRAG_SLOP) lastTap = null;
    }
  };

  const onPointerUp = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStart = null;

    if (pointers.size === 1) {
      const [point] = [...pointers.values()];
      dragStart = { x: point.x, y: point.y, tx, ty };
      return;
    }

    const moved = dragStart
      ? Math.hypot(ev.clientX - dragStart.x, ev.clientY - dragStart.y)
      : 0;
    dragStart = null;

    // Double-tap (or double-click) toggles the zoom.
    if (moved > DRAG_SLOP) return;
    const now = Date.now();
    if (
      lastTap &&
      now - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) <
        DOUBLE_TAP_SLOP
    ) {
      lastTap = null;
      toggleZoom();
      return;
    }
    lastTap = { time: now, x: ev.clientX, y: ev.clientY };
  };

  const onPointerCancel = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) dragStart = null;
    lastTap = null;
  };

  const onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, scale * Math.exp(-ev.deltaY * 0.002)),
    );
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
    clampPan();
    apply();
  };

  const draw = (): void => {
    const current = images[index];
    const next = images.length > 1 ? images[(index + 1) % images.length] : null;
    render(
      html`<div class="ft-image-viewer-body">
        <div
          class="ft-image-viewer-stage"
          @pointerdown=${onPointerDown}
          @pointermove=${onPointerMove}
          @pointerup=${onPointerUp}
          @pointercancel=${onPointerCancel}
          @wheel=${onWheel}
        >
          <img
            class="ft-image-viewer-img"
            src="${current.src}"
            alt="${opts.alt ?? current.label}"
            referrerpolicy="no-referrer"
            draggable="false"
            @dragstart=${(ev: Event) => ev.preventDefault()}
          />
        </div>
        <div class="ft-image-viewer-actions">
          ${next
            ? html`<button
                type="button"
                class="btn flex-1"
                @click=${() => {
                  index = (index + 1) % images.length;
                  draw();
                  resetZoom();
                }}
              >
                Show ${next.label.toLowerCase()}
              </button>`
            : ""}
          <form method="dialog" class="flex-1">
            <button class="btn btn-error w-full">Close</button>
          </form>
        </div>
      </div>`,
      dialog,
    );
  };
  draw();

  dialog.addEventListener("close", () => {
    unlockScroll();
    dialog.remove();
  });

  document.body.appendChild(dialog);
  lockScroll();
  dialog.showModal();
}
