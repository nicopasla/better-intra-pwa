/* Better Intra PWA service worker — Web Push + offline app shell. */

const SHELL_CACHE = "bi-shell-v3";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.svg",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful same-origin responses (hashed assets, manifest, …).
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const clone = res.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(req, clone))
            .catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ||
            // Offline fallback: serve the cached app shell for navigations.
            caches.match(self.registration.scope + (req.mode === "navigate" ? "index.html" : "")),
        ),
      ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Notification", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Notification";
  let body = data.body || "";
  // Render the eval time in the device's local timezone when provided.
  if (
    data.beginAt &&
    (data.kind === "booked" ||
      data.kind === "revealed" ||
      data.kind === "corrected")
  ) {
    try {
      const d = new Date(data.beginAt);
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      const p = (n) => String(n).padStart(2, "0");
      const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
      const stamp = sameDay
        ? time
        : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(
            d.getFullYear(),
          ).slice(2)} ${time}`;
      const names = Array.isArray(data.correcteds) ? data.correcteds : [];
      const detail = [];
      if (data.kind === "corrected") {
        detail.push(`Your evaluator: ${data.corrector || "someone"}`);
      } else if (data.kind === "revealed") {
        if (names.length) detail.push(`Correcting ${names.join(", ")}`);
        if (data.project) detail.push(data.project);
      } else {
        detail.push("Evaluating someone");
      }
      if (stamp) detail.push(`at ${stamp}`);
      title =
        data.kind === "booked" ? "Evaluation Booked" : "Evaluation in 15 min";
      body = detail.join(" ");
    } catch {
      /* keep the fallback body */
    }
  }
  const options = {
    body,
    tag: data.tag,
    renotify: Boolean(data.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* --- Push subscription self-heal -----------------------------------------
   iOS/Safari can rotate or expire push endpoints while the app is closed. When
   that happens the server keeps pushing to a dead endpoint and notifications
   silently stop. We re-subscribe here and hand the new subscription to the page
   (via IndexedDB) so it can re-register it with auth. The SW has no access to
   the session token (localStorage), hence the hand-off. */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function openStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bi-store", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) {
        req.result.createObjectStore("kv");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storePendingSubscription(sub) {
  const db = await openStore();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(sub, "pendingPushSubscription");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        let key = event.oldSubscription?.options?.applicationServerKey;
        if (!key) {
          const res = await fetch(
            "https://api.betterintra.com/api/v1/public/push/key",
          );
          const { publicKey } = await res.json();
          if (!publicKey) return;
          key = urlBase64ToUint8Array(publicKey);
        }
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await storePendingSubscription(sub.toJSON());
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clients) {
          client.postMessage({ type: "push-subscription-changed" });
        }
      } catch {
        /* best effort — the page also heals on next load */
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.preventDefault(); // required for notificationclick to fire on iOS
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(target);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      }),
  );
});