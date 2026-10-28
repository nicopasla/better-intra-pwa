/**
 * Last known push subscription state, cached in localStorage.
 *
 * `getExistingSubscription()` awaits `navigator.serviceWorker.ready`, which can
 * take a second on a cold start. Rendering a toggle before it resolves used to
 * paint "off" and then animate to "on" once the real state arrived. Seeding the
 * switch from this cache removes that flip; `null` means "not known yet" (first
 * visit or cleared storage), which the views render as a disabled switch.
 */

const SUB_KEY = "ft_push_subscribed";
const TYPES_KEY = "ft_notify_types";

export function readPushState(): boolean | null {
  try {
    const raw = localStorage.getItem(SUB_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function writePushState(value: boolean): void {
  try {
    localStorage.setItem(SUB_KEY, value ? "1" : "0");
  } catch {
    /* storage disabled */
  }
}

/** Cached cloud notification preferences, so their buttons don't flash either. */
export function readNotifyTypes(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(TYPES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeNotifyTypes(types: Record<string, boolean>): void {
  try {
    localStorage.setItem(TYPES_KEY, JSON.stringify(types));
  } catch {
    /* storage disabled */
  }
}
