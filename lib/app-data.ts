import { forgetSession } from "../api.ts";

const IDB_NAME = "bi-store";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function unregisterServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* ignore */
  }
}

async function clearCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
}

/** Purges cached assets / service-worker caches, then reloads a fresh copy. */
export async function clearCache(): Promise<void> {
  await clearCaches();
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* ignore */
  }
  location.reload();
}

/**
 * Local-only factory reset: drops the push subscription and every piece of
 * on-device state (caches, IndexedDB, localStorage), then returns to sign-in.
 * Nothing is sent to the worker — the server session stays until revoked or
 * signed out elsewhere.
 */
export async function resetData(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* ignore */
  }
  await unregisterServiceWorkers();
  await clearCaches();
  await deleteDatabase(IDB_NAME);
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  forgetSession();
  location.reload();
}
