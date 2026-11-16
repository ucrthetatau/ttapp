import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../common/db/client.ts";
import { members } from "../../common/db/schema.ts";
import { safePictureUrl } from "./picture.ts";

// A removed member counts as not on the list. `email` must already be normalized.
export async function findActiveMemberByEmail(email: string) {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.email, email), isNull(members.removedAt)));
  return member;
}

// The name and first-login time stay empty until someone signs in for the first time.
export async function recordFirstLogin(
  memberId: string,
  name: string | undefined,
) {
  await db
    .update(members)
    .set({ name: name ?? null, firstLoginAt: new Date() })
    .where(and(eq(members.id, memberId), isNull(members.firstLoginAt)));
}

// Saves the Google photo link at every sign-in, so a photo changed in Google follows the member.
// An address that is missing or not a safe Google photo link clears it, and the member shows
// initials. It never throws into the sign-in: a photo problem must not stop anyone signing in.
export async function recordPicture(
  memberId: string,
  picture: string | undefined,
) {
  try {
    await db
      .update(members)
      .set({ pictureUrl: safePictureUrl(picture) })
      .where(eq(members.id, memberId));
  } catch (error) {
    console.error(
      "Could not save the profile photo:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
