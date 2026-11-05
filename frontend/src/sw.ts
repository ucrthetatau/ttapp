/// <reference lib="webworker" />
// The service worker: a script the browser keeps and can wake even when the
// app is closed. It does two jobs: it saves the app's files so it opens fast (and updates
// itself), and it shows push notifications, which is why it has to be a separate file that
// runs without any page open.
import type { PushPayload } from "@ttapp/shared";
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

// Automatic updates: a new version takes over as soon as it is installed,
// instead of waiting for every open tab to close.
self.skipWaiting();
clientsClaim();

// Save the built app files (the plugin fills in this list at build time) and
// delete copies left by older versions.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Opening any page address serves the saved index.html (the app is a single
// page). EXCEPT /api: the Google sign-in comes back to /api/auth/... as a
// normal page visit, and that must always reach the server.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  }),
);

// Nothing else is cached: fetch() calls to /api have no route here, so the
// browser sends them straight to the server.

// ---- Push notifications ----
// The browser wakes this file when the backend sends a push (even with the app closed),
// runs the handler below for a moment, and puts it back to sleep.

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event: PushEvent): Promise<void> {
  let message: PushPayload = {
    title: "Theta Tau Hub",
    body: "Something new is waiting.",
    url: "/",
    tag: "general",
  };
  try {
    if (event.data) message = { ...message, ...event.data.json() };
  } catch {
    // Not our JSON: show the plain message above rather than nothing.
  }

  // If the app is open and on screen, the doorbell has already updated the page, so a popup
  // would only repeat it. Anywhere else (closed, minimised, another tab) show it.
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  if (windows.some((window) => window.visibilityState === "visible")) return;

  await self.registration.showNotification(message.title, {
    body: message.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-48.png",
    // Same tag = replaces the earlier notification instead of piling up.
    tag: message.tag,
    data: { url: message.url },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openPage(event.notification.data?.url));
});

// Tapping a notification brings the app forward on the right page, or opens it if closed.
async function openPage(url: unknown): Promise<void> {
  const target = new URL(
    typeof url === "string" ? url : "/",
    self.location.origin,
  );
  // Only ever our own pages, whatever a message says.
  if (target.origin !== self.location.origin) return;

  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const open = windows[0];
  if (open) {
    try {
      await (await open.navigate(target.href))?.focus();
      return;
    } catch {
      // The window could not be steered (for example it is not controlled by this worker).
    }
  }
  await self.clients.openWindow(target.href);
}
