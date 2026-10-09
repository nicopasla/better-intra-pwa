import { WORKER_URL, workerFetch } from "./api.ts";
import { clearPendingPush, readPendingPush } from "./lib/push-store.ts";

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush(): Promise<void> {
  // iOS requires the permission prompt to be requested from the user gesture
  // (Apple docs: "call the push subscription method immediately from the
  // gesture's event handler code"). Ask first, before any other async work.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission_denied");

  const reg = await registerServiceWorker();
  if (!reg) throw new Error("no_service_worker");
  await navigator.serviceWorker.ready;

  const keyRes = await fetch(`${WORKER_URL}/api/v1/public/push/key`);
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) throw new Error("push_not_configured");

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = sub.toJSON();
  await workerFetch("/api/v1/private/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await workerFetch("/api/v1/private/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {
    /* best effort */
  }
  await sub.unsubscribe();
}

async function postSubscription(sub: {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}): Promise<void> {
  await workerFetch("/api/v1/private/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
  });
}

/** Re-registers a subscription the service worker rotated while we were closed. */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  const pending = await readPendingPush();
  if (!pending) return;
  try {
    await postSubscription(pending);
    await clearPendingPush();
  } catch {
    /* keep it pending for the next attempt */
  }
}

/** Idempotently re-registers the current subscription with the worker. */
export async function ensurePushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const sub = await getExistingSubscription();
  if (!sub) return;
  try {
    await postSubscription(sub.toJSON());
  } catch {
    /* best effort */
  }
}

/** Fires when the service worker re-subscribed and the page should re-sync. */
export function onPushSubscriptionChange(cb: () => void): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === "push-subscription-changed") {
      cb();
    }
  });
}

export interface PushTestResult {
  ok: boolean;
  status: number;
  host?: string;
  reason?: string;
}

export async function sendTest(
  variant?: "booked" | "revealed",
): Promise<PushTestResult> {
  // Send to THIS device's own subscription, otherwise the worker would pick
  // the first stored one (e.g. a desktop browser) and the test is meaningless.
  const sub = await getExistingSubscription();
  if (!sub) throw new Error("no_subscription");
  const json = sub.toJSON();

  const res = await workerFetch("/api/v1/private/push/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, variant }),
  });
  let data: Partial<PushTestResult> = {};
  try {
    data = (await res.json()) as Partial<PushTestResult>;
  } catch {
    /* non-JSON response */
  }
  return {
    ok: Boolean(data.ok),
    status: typeof data.status === "number" ? data.status : res.status,
    host: data.host,
    reason: data.reason,
  };
}
