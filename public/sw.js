/* Better Intra PWA service worker — Web Push + offline app shell. */

const SHELL_CACHE = "bi-shell-v1";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
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
    data = { title: "Better Intra", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Better Intra";
  let body = data.body || "";
  // Render the eval time in the device's local timezone when provided.
  if (data.beginAt) {
    try {
      const time = new Date(data.beginAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const project = data.project || "Evaluation";
      const names = Array.isArray(data.correcteds) ? data.correcteds : [];
      body = names.length
        ? `Correcting ${names.join(", ")} · ${project} · ${time}`
        : `${project} · ${time}`;
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