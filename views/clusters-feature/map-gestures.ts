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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function apply(container: HTMLElement, state: MapState): void {
  const svg = container.querySelector<SVGSVGElement>("svg");
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!svg || width <= 0 || height <= 0) return;

  state.scale = clamp(state.scale, MIN_SCALE, MAX_SCALE);
  state.x = clamp(state.x, width - width * state.scale, 0);
  state.y = clamp(state.y, height - height * state.scale, 0);

  svg.style.transformOrigin = "0 0";
  svg.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
  svg.style.willChange = "transform";
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
    const el = direct ? null : document.elementFromPoint(ev.clientX, ev.clientY);
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

  new ResizeObserver(() => apply(container, state)).observe(container);
  apply(container, state);
}

export function zoomMapBy(container: HTMLElement | null, factor: number): void {
  if (!container) return;
  const state = states.get(container);
  if (!state) return;
  const rect = container.getBoundingClientRect();
  zoomAt(
    container,
    state,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
    factor,
  );
}

export function resetMapZoom(container: HTMLElement | null): void {
  if (!container) return;
  const state = states.get(container);
  if (!state) return;
  state.scale = 1;
  state.x = 0;
  state.y = 0;
  apply(container, state);
}
