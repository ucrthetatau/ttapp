// Push notifications: a message to a member's phone or computer even when the app is closed.
// It goes through the browser's own push service (Google, Apple, Mozilla or Microsoft, whoever
// made that browser) using the Web Push standard. We sign each message with our private key,
// and encrypt it so only the target browser can read it. The service worker there shows it.
//
// Like the doorbell (doorbell.ts), sending is best effort: it never throws and callers do not
// wait for it, so a slow or broken push service can never stop a vote from opening or a post
// from saving. It quietly does nothing when the keys are not set, which is what happens on a
// machine without them.
//
// Who is asked is decided here, in the backend, from the database. The browser only ever
// says "send me notifications"; it never chooses what it is sent.
import type { PushPayload } from "@ttapp/shared";
import { and, eq, isNull, ne } from "drizzle-orm";
import webpush from "web-push";
import { db } from "./db/client.ts";
import { members, pushSubscriptions } from "./db/schema.ts";
import { memberCanAnswerVotes } from "./voters.ts";

// A push service that does not answer must not hold our server for long.
const SEND_TIMEOUT_MS = 5000;
// If a phone is off, the push service keeps the message this long, then drops it. An hour:
// "a vote just opened" is useless the next morning.
const KEEP_FOR_SECONDS = 3600;

let configured = false;

// Gives the library our keys the first time it is needed. Returns false (and does nothing)
// when they are missing or invalid.
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  try {
    // The subject is a contact address (mailto: or https:) the push services can reach if our
    // server ever misbehaves.
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("Push: the keys or contact address are not valid", error);
  }
  return configured;
}

/** The public key a browser needs to subscribe, or null when push is not set up here. */
export function pushPublicKey(): string | null {
  return configure() ? process.env.VAPID_PUBLIC_KEY! : null;
}

type Target = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendToTargets(
  targets: Target[],
  payload: PushPayload,
  urgency: "high" | "normal",
): Promise<void> {
  if (targets.length === 0 || !configure()) return;
  const text = JSON.stringify(payload);

  await Promise.allSettled(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          text,
          { TTL: KEEP_FOR_SECONDS, urgency, timeout: SEND_TIMEOUT_MS },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The push service says this browser is gone (app uninstalled, permission taken
          // back). Forget it so we stop trying. The next sign-in on that device re-adds it.
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, target.id));
        } else {
          // Not the endpoint: it is a private address, so only the status is logged.
          console.error(`Push: could not send (status ${status ?? "none"})`);
        }
      }
    }),
  );
}

const targetColumns = {
  id: pushSubscriptions.id,
  endpoint: pushSubscriptions.endpoint,
  p256dh: pushSubscriptions.p256dh,
  auth: pushSubscriptions.auth,
};

/** A vote just opened: tell every member who can answer it. */
export async function pushVoteOpened(
  voteId: string,
  title: string,
): Promise<void> {
  try {
    const targets = await db
      .select(targetColumns)
      .from(pushSubscriptions)
      .innerJoin(members, eq(members.id, pushSubscriptions.memberId))
      .where(memberCanAnswerVotes);
    await sendToTargets(
      targets,
      {
        title: "A vote just opened",
        body: title,
        url: "/votes",
        tag: `vote-${voteId}`,
      },
      // Votes are time-sensitive, so ask the push service to deliver right away.
      "high",
    );
  } catch (error) {
    console.error("Push: could not send the vote notification", error);
  }
}

// A lock screen shows only a few words; the full post is one tap away.
function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

/** A new post: tell every active member except the person who wrote it. */
export async function pushNewPost(
  postId: string,
  authorId: string,
  authorName: string | null,
  body: string,
): Promise<void> {
  try {
    const targets = await db
      .select(targetColumns)
      .from(pushSubscriptions)
      .innerJoin(members, eq(members.id, pushSubscriptions.memberId))
      .where(and(isNull(members.removedAt), ne(members.id, authorId)));
    await sendToTargets(
      targets,
      {
        title: `New post from ${authorName ?? "a member"}`,
        body: snippet(body),
        url: "/posts",
        tag: `post-${postId}`,
      },
      "normal",
    );
  } catch (error) {
    console.error("Push: could not send the post notification", error);
  }
}
