// Everything that talks to the browser about notifications: is it possible here, ask
// permission, subscribe, unsubscribe, and keep the browser and the backend in agreement.
// The calls to our own backend are in pushApi.ts.
import {
  fetchPublicKey,
  removeSubscription,
  saveSubscription,
} from "./pushApi.ts";

// Remembers which member turned notifications on in THIS browser (by email). The browser
// keeps its subscription even after sign-out, so without this a second member signing in on
// the same phone would silently inherit the first one's "on". See syncPush.
const MARKER_KEY = "ttapp.push.member";

export type PushSupport = "ok" | "unsupported" | "needs-install";

/** Can this device receive notifications at all, and if not, why. */
export function pushSupport(): PushSupport {
  // iPhones only allow web notifications for an app installed to the Home Screen, and a plain
  // Safari tab has no push at all, so tell them what to do instead of "unsupported".
  const onIphone =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (onIphone && !installed) return "needs-install";

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return "ok";
}

// The service worker registers when the page finishes loading, so on the very first visit it
// may not be ready yet. Wait a little, then give up with a message instead of hanging.
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error("Notifications aren't ready yet. Reload and try again."),
        ),
      5000,
    ),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

// The browser wants the key as raw bytes, but our server sends it as text.
function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function subscribeWithKey(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription> {
  const publicKey = await fetchPublicKey();
  return registration.pushManager.subscribe({
    // Browsers insist every push shows a notification the member can see.
    userVisibleOnly: true,
    applicationServerKey: keyToBytes(publicKey),
  });
}

/**
 * The member flipped the switch on. Returns "on", "blocked" (they said no, or the browser
 * already blocks this site) or "dismissed" (they closed the prompt without answering).
 * Throws with a plain message if the backend refuses or cannot be reached.
 */
export async function enablePush(
  email: string,
): Promise<"on" | "blocked" | "dismissed"> {
  // Asked first, straight after the tap: Safari only allows the prompt as the direct result
  // of one, and the network calls below would use up that moment.
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "dismissed";

  const registration = await readyRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await subscribeWithKey(registration));
  try {
    await saveSubscription(subscription);
  } catch (error) {
    // The backend never heard about it, so do not leave the browser thinking it is on.
    await subscription.unsubscribe();
    throw error;
  }
  localStorage.setItem(MARKER_KEY, email);
  return "on";
}

/** The member flipped the switch off (or is signing out): forget this device everywhere. */
export async function disablePush(): Promise<void> {
  localStorage.removeItem(MARKER_KEY);
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await removeSubscription(subscription.endpoint);
  } catch {
    // Offline or the backend is down: the row stays, but the browser forgets the address
    // below, so the push service answers "gone" next time and the backend deletes the row.
  }
  await subscription.unsubscribe();
}

/** Signing out: turn this device's notifications off first, and never block the sign-out. */
export async function forgetThisDevice(): Promise<void> {
  try {
    await disablePush();
  } catch {
    // Not worth stopping a sign-out for.
  }
}

/**
 * Runs when the app opens. Decides what the switch should show and quietly repairs drift, so
 * a member who turned it on does not silently lose notifications.
 */
export async function syncPush(
  email: string,
): Promise<"on" | "off" | "blocked"> {
  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (Notification.permission === "denied") {
    localStorage.removeItem(MARKER_KEY);
    return "blocked";
  }

  if (localStorage.getItem(MARKER_KEY) !== email) {
    // Not this member's choice: left behind by someone else, or by a sign-out that could not
    // finish. Drop the browser's subscription so they never get that person's messages.
    localStorage.removeItem(MARKER_KEY);
    await subscription?.unsubscribe();
    return "off";
  }

  if (Notification.permission !== "granted") {
    localStorage.removeItem(MARKER_KEY);
    return "off";
  }

  // The member turned it on and the browser still allows it. Make sure both sides still
  // have the address: the backend deletes a row when the push service reports it gone, and
  // the browser can replace its address. No prompt appears: permission is already granted.
  try {
    await saveSubscription(
      subscription ?? (await subscribeWithKey(registration)),
    );
  } catch {
    // A network hiccup is not a reason to show "off". Keep what we know; the next open retries.
    if (!subscription) return "off";
  }
  return "on";
}

// The sign-in banner is shown once per member per device. One flag per member (by email), so a
// second member signing in on the same phone still sees it once. Storage can be blocked
// (private windows): then we say "seen", because a banner that came back on every page load
// would be worse than one that never shows.
const bannerKey = (email: string) => `ttapp.push.bannerSeen.${email}`;

export function bannerSeen(email: string): boolean {
  try {
    return localStorage.getItem(bannerKey(email)) !== null;
  } catch {
    return true;
  }
}

export function markBannerSeen(email: string): void {
  try {
    localStorage.setItem(bannerKey(email), "1");
  } catch {
    // Nothing to do: see above.
  }
}
