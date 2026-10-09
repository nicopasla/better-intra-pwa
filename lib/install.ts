/** Custom PWA install prompt (Chromium `beforeinstallprompt`). */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as { standalone?: boolean }).standalone)
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as "Macintosh" but has touch points.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Mobile platforms where the app requires installation to be usable. */
export function isMobileOS(): boolean {
  return isIOS() || isAndroid();
}

export function canInstall(): boolean {
  return deferred !== null && !installed && !isStandalone();
}

export function onInstallAvailability(cb: () => void): void {
  listeners.add(cb);
}

export function initInstall(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  const res = await ev.prompt();
  emit();
  return res.outcome === "accepted";
}
