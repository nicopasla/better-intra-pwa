/** App icon badging (Chromium only; silently no-ops elsewhere). */

function badgeSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "setAppBadge" in navigator &&
    "clearAppBadge" in navigator
  );
}

export function setAppBadge(count: number): void {
  if (!badgeSupported()) return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
  };
  void nav.setAppBadge?.(count).catch(() => undefined);
}

export function clearAppBadge(): void {
  if (!badgeSupported()) return;
  const nav = navigator as Navigator & {
    clearAppBadge?: () => Promise<void>;
  };
  void nav.clearAppBadge?.().catch(() => undefined);
}