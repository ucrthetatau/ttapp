import type { HeadcountResponse } from "@ttapp/shared";
import { quorumNeeded } from "@ttapp/shared";
import { and, count, eq, isNull, max } from "drizzle-orm";
import { db } from "../../common/db/client.ts";
import { meetingHeadcount, members, votes } from "../../common/db/schema.ts";

// "Who is present" is set once by the president and lasts for the meeting. Nothing deletes
// it: it just stops counting once 90 minutes pass with no activity. Activity means the count
// being set, or a vote opening or closing. The check happens each time it is read, so no
// scheduled job is needed.
const EXPIRY_MS = 90 * 60 * 1000;

// Members who can answer a vote: active, and switched on by an officer.
async function countEligible(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(members)
    .where(and(isNull(members.removedAt), eq(members.canVote, true)));
  return row.n;
}

export async function countActiveMembers(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(members)
    .where(isNull(members.removedAt));
  return row.n;
}

// The live headcount, or null if it was never set or has expired.
export async function readHeadcount(): Promise<HeadcountResponse> {
  const [row] = await db.select().from(meetingHeadcount);
  if (!row) return null;

  const [recent] = await db
    .select({ opened: max(votes.createdAt), closed: max(votes.closedAt) })
    .from(votes);
  const lastActivity = Math.max(
    row.updatedAt.getTime(),
    recent.opened?.getTime() ?? 0,
    recent.closed?.getTime() ?? 0,
  );
  const expiresAt = lastActivity + EXPIRY_MS;
  if (Date.now() >= expiresAt) return null;

  return {
    presentCount: row.presentCount,
    expiresAt: new Date(expiresAt).toISOString(),
    quorumMet: row.presentCount >= quorumNeeded(await countEligible()),
  };
}
