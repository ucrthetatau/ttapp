// Adding one email to the member list. Two routes need exactly this (adding one person, and
// adding a pasted list), so it lives here once: they cannot drift apart, and a rule changed
// in one place changes in both.
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { db } from "../../common/db/client.ts";
import { members } from "../../common/db/schema.ts";

// The email is trimmed and lowercased first because the database only accepts that form
// (members_email_normalized), then checked for a valid address like "name@example.com".
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

// What a change can write to: the database itself, or the transaction handed to a callback.
type Writer = Pick<typeof db, "insert" | "update">;

// The longest an email address can be (RFC 5321). Used to refuse absurd input before the database.
export const MAX_EMAIL_LENGTH = 254;

export type AddOutcome =
  | { status: "added" | "restored"; id: string; email: string }
  | { status: "already_member" };

// Adds the email, or brings the person back if they were removed. The email must already be
// normalized (run it through emailField first).
//
// Insert first and let the unique email decide, so two officers adding the same address at
// the same moment can't both succeed.
export async function addOrRestoreMember(
  writer: Writer,
  email: string,
): Promise<AddOutcome> {
  const [created] = await writer
    .insert(members)
    .values({ email })
    .onConflictDoNothing()
    .returning();
  if (created) {
    return { status: "added", id: created.id, email: created.email };
  }

  // The email already exists. If that person was removed, bring them back.
  const [restored] = await writer
    .update(members)
    .set({ removedAt: null })
    .where(and(eq(members.email, email), isNotNull(members.removedAt)))
    .returning();
  if (restored) {
    return { status: "restored", id: restored.id, email: restored.email };
  }

  return { status: "already_member" };
}
