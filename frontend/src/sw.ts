/// <reference lib="webworker" />
// The service worker: a script the browser keeps and can wake even when the
// app is closed. This ticket only makes the app installable and fast to open.
// Stage 6 (push notifications) will add its "push" handler to this same file.
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
