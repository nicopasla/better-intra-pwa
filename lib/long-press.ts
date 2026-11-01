/**
 * Press-and-hold helper shared by list rows. A press fires `action` after
 * `DELAY` ms of stillness; moving beyond `TOLERANCE` px or lifting cancels it,
 * and the click that follows a fired long press is swallowed so the row's link
 * does not open.
 */

const DELAY = 450;
const TOLERANCE = 8;

let timer: ReturnType<typeof setTimeout> | null = null;
let start: { x: number; y: number } | null = null;
let fired = false;

export function clearLongPress(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  start = null;
}

export function startLongPress(
  ev: PointerEvent,
  action: () => void,
  delay = DELAY,
): void {
  if (ev.pointerType === "mouse" && ev.button !== 0) return;
  clearLongPress();
  start = { x: ev.clientX, y: ev.clientY };
  timer = setTimeout(() => {
    timer = null;
    start = null;
    fired = true;
    // If no click follows, don't swallow the next one.
    setTimeout(() => {
      fired = false;
    }, 800);
    navigator.vibrate?.(12);
    action();
  }, delay);
}

export function moveLongPress(ev: PointerEvent): void {
  if (!start || timer == null) return;
  if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > TOLERANCE) {
    clearLongPress();
  }
}

/** Call from the row's click handler: prevents navigation after a long press. */
export function consumeLongPressClick(ev: Event): void {
  if (!fired) return;
  fired = false;
  ev.preventDefault();
}
