// "Who can answer a vote today", as a database condition. Two places need exactly the same
// answer, so it lives here once:
//   - the Votes page's "out of N" number (features/votes/routes.ts), and
//   - who gets a push when a vote opens (common/push.ts).
// If they ever disagreed, members would be told to vote on something they cannot answer, or
// the turnout number would count people who were never asked.
//
// It mirrors whyCannotAnswer in the votes routes, which checks the same rule for one person:
//   - removed members cannot answer,
//   - members an officer switched off cannot answer (Art VII III.2),
//   - the Regent (president role) does not vote (Art IV II.1.c).
import { and, eq, isNull, sql } from "drizzle-orm";
import { memberRoles, members, roles } from "./db/schema.ts";

export const memberCanAnswerVotes = and(
  isNull(members.removedAt),
  eq(members.canVote, true),
  sql`not exists (
    select 1 from ${memberRoles}
    join ${roles} on ${roles.id} = ${memberRoles.roleId}
    where ${memberRoles.memberId} = ${members.id} and ${roles.name} = 'president'
  )`,
);
