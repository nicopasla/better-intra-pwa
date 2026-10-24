/** Local (per-device) home dashboard preferences. */

const HIDE_BLACKHOLE_KEY = "ft_hide_home_blackhole";

/** Whether the Home dashboard hides the blackhole date badge. */
export function hideHomeBlackhole(): boolean {
  try {
    return localStorage.getItem(HIDE_BLACKHOLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHideHomeBlackhole(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDE_BLACKHOLE_KEY, "1");
    else localStorage.removeItem(HIDE_BLACKHOLE_KEY);
  } catch {
    /* quota / private mode */
  }
}
