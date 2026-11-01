interface Point {
  x: number;
  y: number;
}

interface MapState {
  scale: number;
  x: number;
  y: number;
  pointers: Map<number, Point>;
  drag: {
    x: number;
    y: number;
    tx: number;
    ty: number;
    moved: boolean;
    pinch: boolean;
    at: number;
    target: Element | null;
  } | null;
  pinch: {
    dist: number;
    midX: number;
    midY: number;
    tx: number;
    ty: number;
    scale: number;
    mapX: number;
    mapY: number;
  } | null;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_SLOP = 6;
const TAP_TIME = 500;

const states = new WeakMap<HTMLElement, MapState>();
/** Container size, kept fresh by the ResizeObserver (avoids layout reads). */
const sizes = new WeakMap<HTMLElement, { w: number; h: number }>();
/** Base `viewBox` per SVG, used to zoom without rasterizing the vector map. */
const baseViewBoxes = new WeakMap<
  SVGSVGElement,
  { x: number; y: number; w: number; h: number } | null
>();
/** `image[id]` lookup per SVG, so seat taps and highlights don't rescan. */
const seatIndexes = new WeakMap<SVGSVGElement, Map<string, SVGImageElement>>();

/** Normalised seat id → avatar `<image>`, built once per SVG. */
export function mapSeatIndex(svg: SVGSVGElement): Map<string, SVGImageElement> {
  let index = seatIndexes.get(svg);
  if (!index) {
    index = new Map();
    for (const img of svg.querySelectorAll<SVGImageElement>("image[id]")) {
      const id = (img.id || "").trim().toLowerCase();
      if (id && !index.has(id)) index.set(id, img);
    }
    seatIndexes.set(svg, index);
  }
  return index;
}

function containerSize(container: HTMLElement): { w: number; h: number } {
  const known = sizes.get(container);
  if (known && known.w > 0 && known.h > 0) return known;
  const measured = { w: container.clientWidth, h: container.clientHeight };
  sizes.set(container, measured);
  return measured;
}

function baseViewBox(svg: SVGSVGElement): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  let base = baseViewBoxes.get(svg);
  if (base === undefined) {
    const parts = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    base =
      parts.length === 4 && parts[2] > 0 && parts[3] > 0
        ? { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
        : null;
    baseViewBoxes.set(svg, base);
  }
  return base;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function apply(container: HTMLElement, state: MapState): void {
  const svg = container.querySelector<SVGSVGElement>("svg");
  const { w: width, h: height } = containerSize(container);
  if (!svg || width <= 0 || height <= 0) return;

  state.scale = clamp(state.scale, MIN_SCALE, MAX_SCALE);
  state.x = clamp(state.x, width - width * state.scale, 0);
  state.y = clamp(state.y, height - height * state.scale, 0);

  const base = baseViewBox(svg);
  if (!base) {
    // No viewBox: fall back to a 2D transform (the old behaviour).
    svg.style.transformOrigin = "0 0";
    svg.style.transform =
      state.scale === 1 && state.x === 0 && state.y === 0
        ? ""
        : `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    return;
  }

  // Replacing the viewBox makes the browser redraw the vector map at the new
  // zoom level instead of scaling a rasterized layer.
  svg.style.transform = "";
  const k0 = Math.min(width / base.w, height / base.h);
  const ox = (width - base.w * k0) / 2;
  const oy = (height - base.h * k0) / 2;
  const k = k0 * state.scale;
  svg.setAttribute(
    "viewBox",
    `${base.x - ox / k0 - state.x / k} ${base.y - oy / k0 - state.y / k} ${width / k} ${height / k}`,
  );
}

function zoomAt(
  container: HTMLElement,
  state: MapState,
  clientX: number,
  clientY: number,
  factor: number,
): void {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const next = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
  const mapX = (px - state.x) / state.scale;
  const mapY = (py - state.y) / state.scale;

  state.scale = next;
  state.x = px - mapX * next;
  state.y = py - mapY * next;
  apply(container, state);
}

/** Wires drag, pinch and wheel zoom on a map container. Safe to call repeatedly. */
/** Back to the fitted view, dropping any seat focus ring. */
export function resetMapZoom(container: HTMLElement): void {
  container.querySelectorAll(".seat-focus").forEach((el) => el.remove());
  const state = states.get(container);
  if (!state) return;
  state.scale = MIN_SCALE;
  state.x = 0;
  state.y = 0;
  apply(container, state);
}

export function attachMapGestures(container: HTMLElement): void {
  const existing = states.get(container);
  if (existing) {
    // The inline SVG can be swapped by a re-render; re-apply the transform.
    apply(container, existing);
    return;
  }

  const state: MapState = {
    scale: 1,
    x: 0,
    y: 0,
    pointers: new Map(),
    drag: null,
    pinch: null,
  };
  states.set(container, state);

  const onDown = (ev: PointerEvent) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    try {
      container.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    state.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    container.classList.add("is-panning");

    if (state.pointers.size === 1) {
      state.drag = {
        x: ev.clientX,
        y: ev.clientY,
        tx: state.x,
        ty: state.y,
        moved: false,
        pinch: false,
        at: performance.now(),
        target: ev.target instanceof Element ? ev.target : null,
      };
      state.pinch = null;
    } else if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      const rect = container.getBoundingClientRect();
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      state.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        midX,
        midY,
        tx: state.x,
        ty: state.y,
        scale: state.scale,
        mapX: (midX - rect.left - state.x) / state.scale,
        mapY: (midY - rect.top - state.y) / state.scale,
      };
      if (state.drag) state.drag.pinch = true;
    }
  };

  const onMove = (ev: PointerEvent) => {
    if (!state.pointers.has(ev.pointerId)) return;
    state.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (state.pointers.size >= 2 && state.pinch) {
      const [a, b] = [...state.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist <= 0 || state.pinch.dist <= 0) return;

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const rect = container.getBoundingClientRect();
      const next = clamp(
        state.pinch.scale * (dist / state.pinch.dist),
        MIN_SCALE,
        MAX_SCALE,
      );

      state.scale = next;
      state.x = midX - rect.left - state.pinch.mapX * next;
      state.y = midY - rect.top - state.pinch.mapY * next;
      apply(container, state);
      if (state.drag) state.drag.moved = true;
    } else if (state.pointers.size === 1 && state.drag && !state.drag.pinch) {
      const dx = ev.clientX - state.drag.x;
      const dy = ev.clientY - state.drag.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) state.drag.moved = true;
      if (state.drag.moved) {
        state.x = state.drag.tx + dx;
        state.y = state.drag.ty + dy;
        apply(container, state);
      }
    }
    ev.preventDefault();
  };

  const finish = (ev: PointerEvent, cancelled: boolean) => {
    const tracked = state.pointers.delete(ev.pointerId);
    try {
      container.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }

    if (state.pointers.size === 1) {
      // One finger left after a pinch: keep panning without a jump.
      const p = [...state.pointers.values()][0];
      state.drag = {
        x: p.x,
        y: p.y,
        tx: state.x,
        ty: state.y,
        moved: true,
        pinch: true,
        at: performance.now(),
        target: null,
      };
      state.pinch = null;
      return;
    }
    if (state.pointers.size > 1) return;

    const drag = state.drag;
    state.drag = null;
    state.pinch = null;
    state.pointers.clear();
    container.classList.remove("is-panning");

    if (cancelled || !tracked || !drag || drag.moved || drag.pinch) return;
    if (performance.now() - drag.at > TAP_TIME) return;

    // A tap, not a drag: open the profile of the avatar under the finger.
    const direct = drag.target?.closest?.("image[data-login]");
    const el = direct
      ? null
      : document.elementFromPoint(ev.clientX, ev.clientY);
    const img = direct ?? el?.closest?.("image[data-login]");
    const login = img?.getAttribute("data-login");
    if (login) location.hash = `#/u/${login}`;
  };

  const onUp = (ev: PointerEvent) => finish(ev, false);
  const onCancel = (ev: PointerEvent) => finish(ev, true);
  const onWheel = (ev: WheelEvent) => {
    // Trackpad pinch and Ctrl/Cmd+wheel zoom; plain scroll still scrolls the page.
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    zoomAt(
      container,
      state,
      ev.clientX,
      ev.clientY,
      Math.exp(-ev.deltaY * 0.0015),
    );
  };

  container.addEventListener("pointerdown", onDown);
  container.addEventListener("pointermove", onMove);
  container.addEventListener("pointerup", onUp);
  container.addEventListener("pointercancel", onCancel);
  container.addEventListener("wheel", onWheel, { passive: false });

  new ResizeObserver(() => {
    sizes.set(container, {
      w: container.clientWidth,
      h: container.clientHeight,
    });
    apply(container, state);
  }).observe(container);
  containerSize(container);
  apply(container, state);
}

const SVG_NS = "http://www.w3.org/2000/svg";

interface SeatRect {
  image: SVGImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

function findSeat(container: HTMLElement, seatId: string): SeatRect | null {
  const svg = container.querySelector<SVGSVGElement>("svg");
  if (!svg) return null;
  const image = mapSeatIndex(svg).get(seatId.trim().toLowerCase());
  if (!image) return null;
  return {
    image,
    x: Number(image.getAttribute("x")) || 0,
    y: Number(image.getAttribute("y")) || 0,
    w: Number(image.getAttribute("width")) || 0,
    h: Number(image.getAttribute("height")) || 0,
  };
}

const seatRingSelector = (seatId: string) =>
  `.seat-focus[data-seat="${seatId.trim().toLowerCase()}"]`;

/** Draws the pulsing ring around a seat, once (re-renders keep the same SVG). */
function drawSeatRing(
  svg: SVGSVGElement,
  seat: SeatRect,
  seatId: string,
): boolean {
  const { image, x, y, w, h } = seat;
  const ring = document.createElementNS(SVG_NS, "rect");
  ring.setAttribute("class", "seat-focus");
  ring.setAttribute("data-seat", seatId.trim().toLowerCase());
  // Outside the seat (not straddling its border) and drawn in the seat's own
  // coordinate space, so rotated/inclined seats get a matching outline.
  // Hug the picture border (the pulse + glow sit on the image edge).
  const pad = Math.min(1.5, Math.max(0.5, Math.min(w, h) * 0.03));
  ring.setAttribute("x", String(x - pad));
  ring.setAttribute("y", String(y - pad));
  ring.setAttribute("width", String(w + pad * 2));
  ring.setAttribute("height", String(h + pad * 2));
  ring.setAttribute("rx", "4");
  const transform = image.getAttribute("transform");
  const parent = image.parentNode;
  if (!parent) return false;
  if (transform) {
    // Keep the rotation on a wrapper so the CSS pulse can scale freely.
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", transform);
    group.appendChild(ring);
    parent.insertBefore(group, image.nextSibling);
  } else {
    parent.insertBefore(ring, image.nextSibling);
  }
  return true;
}

/**
 * Draws the pulsing red ring around a seat (no zoom). Called on every render
 * while a seat stays focused, so it no-ops when the ring is already there.
 */
export function highlightMapSeat(
  container: HTMLElement,
  seatId: string,
): boolean {
  const svg = container.querySelector<SVGSVGElement>("svg");
  if (!svg) return false;
  if (svg.querySelector(seatRingSelector(seatId))) return true;
  const seat = findSeat(container, seatId);
  if (!seat) return false;
  return drawSeatRing(svg, seat, seatId);
}

/** Highlights a seat and zooms the map onto it. */
export function focusMapSeat(container: HTMLElement, seatId: string): boolean {
  const svg = container.querySelector<SVGSVGElement>("svg");
  if (!svg) return false;
  const seat = findSeat(container, seatId);
  if (!seat) return false;
  if (!svg.querySelector(seatRingSelector(seatId))) {
    drawSeatRing(svg, seat, seatId);
  }
  const { x, y, w, h } = seat;

  const base = baseViewBox(svg);
  if (!base) return true;

  attachMapGestures(container);
  const state = states.get(container);
  if (!state) return true;

  const { w: width, h: height } = containerSize(container);
  if (width <= 0 || height <= 0) return true;

  // The SVG is stretched to the container box and letterboxed by
  // preserveAspectRatio, so map units scale by the limiting dimension.
  const k = Math.min(width / base.w, height / base.h);
  const offsetX = (width - base.w * k) / 2;
  const offsetY = (height - base.h * k) / 2;
  const px = offsetX + (x + w / 2 - base.x) * k;
  const py = offsetY + (y + h / 2 - base.y) * k;

  state.scale = clamp(1.6, MIN_SCALE, MAX_SCALE);
  state.x = Math.min(
    0,
    Math.max(width - width * state.scale, width / 2 - px * state.scale),
  );
  state.y = Math.min(
    0,
    Math.max(height - height * state.scale, height / 2 - py * state.scale),
  );
  apply(container, state);
  return true;
}
