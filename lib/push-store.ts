/**
 * Tiny IndexedDB KV used to hand a re-subscribed push subscription from the
 * service worker (which has no access to localStorage / the session token) to
 * the page, which can authenticate against the worker.
 */

const DB_NAME = "bi-store";
const STORE = "kv";
const PENDING_KEY = "pendingPushSubscription";

export interface StoredPushSubscription {
  endpoint: string;
  keys?: { p256dh: string; auth: string };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function writePendingPush(sub: StoredPushSubscription): Promise<void> {
  return run("readwrite", (s) => s.put(sub, PENDING_KEY)).then(() => undefined);
}

export async function readPendingPush(): Promise<StoredPushSubscription | null> {
  const val = await run<StoredPushSubscription>("readonly", (s) =>
    s.get(PENDING_KEY),
  );
  return val ?? null;
}

export function clearPendingPush(): Promise<void> {
  return run("readwrite", (s) => s.delete(PENDING_KEY)).then(() => undefined);
}
