// The three calls this device makes to the backend about notifications. Everything that
// touches the browser itself (permission, the push service) is in push.ts.
import type { PushPublicKeyResponse } from "@ttapp/shared";
import { readError } from "../common/readError.ts";

/** The key a browser needs to subscribe. Fails with a plain message if the server has none. */
export async function fetchPublicKey(): Promise<string> {
  const res = await fetch("/api/push/public-key");
  if (!res.ok) {
    throw new Error(
      res.status === 503
        ? "Notifications aren't set up on the server yet."
        : await readError(res),
    );
  }
  return ((await res.json()) as PushPublicKeyResponse).publicKey;
}

/** Tells the backend to remember this device's address. Safe to repeat. */
export async function saveSubscription(
  subscription: PushSubscription,
): Promise<void> {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error("This browser gave an incomplete notification address.");
  }
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, keys }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

/** Tells the backend to forget this device's address. Safe to repeat. */
export async function removeSubscription(endpoint: string): Promise<void> {
  const res = await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
