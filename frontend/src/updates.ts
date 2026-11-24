// Getting a new version of the app onto the screen.
//
// The service worker (src/sw.ts) already takes over the moment a new version is installed. But
// the page that is open keeps running the old code it loaded when it started, so without this
// the new version only appeared on the NEXT launch: one launch to download it, a second to run
// it ("reset the app twice"). Two things fix that:
//   1. When a new service worker takes control of a page that already had one, reload the page
//      right away, so the new code runs now.
//   2. Ask the browser to look for a new version whenever the app is opened or comes back to
//      the front. A phone's installed app is usually just resumed, not reloaded, so the
//      browser's own check on page load would not happen.
//
// The first-ever visit has no service worker yet. The worker taking over then is not an update,
// so it does not reload.

// At most one look for a new version per minute, so switching apps back and forth is cheap.
const CHECK_GAP_MS = 60_000;

export function watchForNewVersion() {
  if (!("serviceWorker" in navigator)) return;

  // Whether a service worker already controls this page. The first takeover on a brand-new
  // install is not an update (it only sets this to true); every later one is.
  let hasWorker = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hasWorker) {
      hasWorker = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  let lastCheck = 0;
  function check() {
    if (Date.now() - lastCheck < CHECK_GAP_MS) return;
    lastCheck = Date.now();
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        // Offline or a hiccup: the next time the app comes to the front tries again.
      });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  check();
}
