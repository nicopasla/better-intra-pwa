/**
 * Observes the API responses the app already makes — no health probe, no extra
 * request. When the worker reports a 5xx (42 unreachable) the app shows the
 * "down" screen; the next successful `/me` response clears it.
 *
 * Recovery rides on the existing retry/refresh paths: the dashboard's Retrier
 * keeps calling `loadDashboard` (and therefore `me()`) while visible, and the
 * Retry button reloads the app.
 */

const FAILURE_WINDOW_MS = 10_000;
const FAILURES_TO_TRIP = 2;
const HEALTH_PATH = "/api/v1/private/me";

let down = false;
let failures: number[] = [];
/** Last 5xx seen, used to pick the matching http.cat image. */
let lastStatus = 503;
const listeners: Array<(down: boolean) => void> = [];

export function isWorkerDown(): boolean {
  return down;
}

export function downStatus(): number {
  return lastStatus;
}

/** Notified only on state changes. */
export function onWorkerHealthChange(fn: (down: boolean) => void): void {
  listeners.push(fn);
}

function setDown(next: boolean): void {
  if (down === next) return;
  down = next;
  if (next) failures = [];
  for (const fn of listeners) fn(next);
}

function recordFailure(): void {
  const now = Date.now();
  failures = failures.filter((at) => now - at < FAILURE_WINDOW_MS);
  failures.push(now);
  if (failures.length >= FAILURES_TO_TRIP) setDown(true);
}

/** Called for every worker response. Never throws. */
export function noteWorkerResponse(path: string, status: number): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  if (status >= 500) {
    lastStatus = status;
    recordFailure();
    return;
  }

  // Only the `me` endpoint clears the state: D1/KV-backed routes keep
  // succeeding while 42 itself is down, so they must not mask the outage.
  const pathname = path.split("?")[0];
  if (pathname === HEALTH_PATH && status < 400) {
    failures = [];
    setDown(false);
  }
}

/** Called when the request never reached the worker (DNS, network, TLS). */
export function noteNetworkError(): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  lastStatus = 503;
  recordFailure();
}
