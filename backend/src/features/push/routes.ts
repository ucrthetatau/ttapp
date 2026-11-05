// Routes a browser uses to turn notifications on or off for itself. Every signed-in member can
// use them, and each call only ever touches the caller's own rows (the member comes from the
// session, never from the request).
import type { PushPublicKeyResponse } from "@ttapp/shared";
import { and, count, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { pushSubscriptions } from "../../common/db/schema.ts";
import { pushPublicKey } from "../../common/push.ts";
import { validateBody } from "../../common/validate.ts";

export const pushRouter = Router();

// Our server sends a request to whatever address is stored, so a member must not be able to
// store just any address (they could aim our server at someone else's website). Browsers only
// ever hand out addresses on their maker's push service, so we accept those and nothing else.
// If a browser ever uses a new push service, subscribing fails with a clear message and the
// service's host is added here.
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on some devices, Android
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari and installed iPhone apps
  "notify.windows.com", // Edge on Windows
];

function isKnownPushService(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return PUSH_SERVICE_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

// One member rarely has more than a phone, a laptop and a tablet. The cap keeps a signed-in
// member from filling the table with made-up addresses.
const MAX_DEVICES_PER_MEMBER = 10;

const subscribeBody = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine(isKnownPushService, "That is not a known push service"),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});

const unsubscribeBody = z.object({ endpoint: z.string().max(2048) });

// GET /api/push/public-key: the key the browser needs to subscribe. 503 when this server has
// no keys, so the frontend can say push is not available instead of failing later.
pushRouter.get("/public-key", requireLogin, (_req, res) => {
  const publicKey = pushPublicKey();
  if (!publicKey) {
    res.status(503).json({ error: "Notifications are not set up" });
    return;
  }
  const response: PushPublicKeyResponse = { publicKey };
  res.json(response);
});

// POST /api/push/subscribe: this browser wants notifications. "Make it so" semantics, like
// the vote answer: calling it again with the same endpoint refreshes the row instead of
// adding a second one. If the same browser was last used by another member, the row moves to
// whoever is signed in now, so the previous person stops getting notifications on it.
pushRouter.post(
  "/subscribe",
  requireLogin,
  validateBody(subscribeBody),
  async (req, res) => {
    const { endpoint, keys } = req.body as z.infer<typeof subscribeBody>;
    const memberId = req.auth!.member.id;

    const [existing] = await db
      .select({ memberId: pushSubscriptions.memberId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    if (!existing) {
      const [{ devices }] = await db
        .select({ devices: count() })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.memberId, memberId));
      if (devices >= MAX_DEVICES_PER_MEMBER) {
        res.status(409).json({
          error: "Too many devices have notifications on. Turn one off first",
        });
        return;
      }
    }

    await db
      .insert(pushSubscriptions)
      .values({ memberId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { memberId, p256dh: keys.p256dh, auth: keys.auth },
      });
    res.status(204).end();
  },
);

// POST /api/push/unsubscribe: this browser no longer wants notifications. Only the caller's
// own row can be removed (the member is part of the match), and asking twice is fine.
pushRouter.post(
  "/unsubscribe",
  requireLogin,
  validateBody(unsubscribeBody),
  async (req, res) => {
    const { endpoint } = req.body as z.infer<typeof unsubscribeBody>;
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.memberId, req.auth!.member.id),
        ),
      );
    res.status(204).end();
  },
);
