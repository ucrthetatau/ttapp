import type {
  CurrentVote,
  CurrentVoteResponse,
  HeadcountResponse,
  OpenVoteResponse,
} from "@ttapp/shared";
import { VOTE_KIND_INFO, VOTE_KINDS, yesNeeded } from "@ttapp/shared";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import {
  meetingHeadcount,
  memberRoles,
  members,
  roles,
  voteResponses,
  votes,
} from "../../common/db/schema.ts";
import { requirePermission } from "../../common/permissions.ts";
import { validateBody } from "../../common/validate.ts";
import { countActiveMembers, readHeadcount } from "./headcount.ts";

export const votesRouter = Router();

const openVoteBody = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(VOTE_KINDS),
});

const headcountBody = z.object({
  presentCount: z.number().int().min(1),
});

// Postgres reports "this row breaks a unique index" with code 23505. Drizzle wraps the
// driver's error, so the code can sit on the error itself or on its cause.
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return (
    code(error) === "23505" ||
    code((error as { cause?: unknown }).cause) === "23505"
  );
}

// POST /api/votes: the president (and admins) open a vote of a given kind. The kind picks
// the bylaw rule that will decide it; the president never types a percentage.
// Only one vote can be open at a time. We do not check first and then insert, because two
// requests could both pass the check. Instead we just insert and let the database's
// "votes_one_open" index refuse the second one; that refusal becomes the 409 below.
votesRouter.post(
  "/",
  requireLogin,
  requirePermission("votes.open"),
  validateBody(openVoteBody),
  async (req, res) => {
    const { title, kind } = req.body as z.infer<typeof openVoteBody>;

    // The bylaws measure every vote against who is present, so the president must have said
    // how many are present. The vote keeps its own copy, so its result can always be
    // explained later even after the headcount changes.
    const headcount = await readHeadcount();
    if (!headcount) {
      res.status(409).json({ error: "Set who is present first" });
      return;
    }

    try {
      const [created] = await db
        .insert(votes)
        .values({
          title,
          kind,
          thresholdPercent: VOTE_KIND_INFO[kind].percent,
          presentCount: headcount.presentCount,
        })
        .returning({ id: votes.id });
      const response: OpenVoteResponse = created;
      res.status(201).json(response);
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "A vote is already open" });
        return;
      }
      throw error;
    }
  },
);

// The bylaws decide who may answer a vote, and two places need the same answer: the answer
// route (which refuses) and the current-vote route (which tells the screen whether to show the
// Yes and No buttons). So the rule lives here once, and both ask it.
//   - The Regent does not vote; they count the votes and only break ties (Art IV II.1.c).
//   - Members an officer has switched off cannot vote (Art VII III.2).
// Returns the reason a member cannot answer, or null if they can.
function whyCannotAnswer(auth: {
  member: { canVote: boolean };
  roles: string[];
}): string | null {
  if (auth.roles.includes("president")) return "The Regent does not vote";
  if (!auth.member.canVote) return "You are not eligible to vote";
  return null;
}

const answerBody = z.object({ answer: z.boolean() });

// PUT /api/votes/current/answer: a member says yes (true) or no (false) on the open vote.
// PUT because it means "make my answer be this": the first call creates it, later calls
// replace it. A member has one answer per vote (the vote_responses_once index), so changing
// your mind never adds a second one.
// The vote is read with FOR SHARE, which holds a lock on its row until this transaction
// ends. Closing a vote (a later ticket) has to change that same row, so it waits for any
// answer in progress and counts it. And once the vote is closed, the read below finds no
// open vote, so nothing can be written to it.
votesRouter.put(
  "/current/answer",
  requireLogin,
  requirePermission("votes.answer"),
  validateBody(answerBody),
  async (req, res) => {
    const { answer } = req.body as z.infer<typeof answerBody>;
    const memberId = req.auth!.member.id;

    const blocked = whyCannotAnswer(req.auth!);
    if (blocked) {
      res.status(403).json({ error: blocked });
      return;
    }

    const saved = await db.transaction(async (tx) => {
      const [open] = await tx
        .select({ id: votes.id })
        .from(votes)
        .where(eq(votes.status, "open"))
        .for("share");
      if (!open) return false;

      await tx
        .insert(voteResponses)
        .values({ voteId: open.id, memberId, answer })
        .onConflictDoUpdate({
          target: [voteResponses.voteId, voteResponses.memberId],
          set: { answer },
        });
      return true;
    });

    if (!saved) {
      res.status(409).json({ error: "No vote is open" });
      return;
    }
    res.status(204).end();
  },
);

// GET /api/votes/current: the open vote, or null when there is none. Every signed-in member
// can read it. It gives out turnout only: how many answered and how many members can answer.
// The yes/no split and who voted what never leave this route (only the president's details
// route, after a vote closes, shows those), so nothing here can leak by accident.
votesRouter.get("/current", requireLogin, async (req, res) => {
  const memberId = req.auth!.member.id;

  const [open] = await db
    .select({
      id: votes.id,
      title: votes.title,
      kind: votes.kind,
      thresholdPercent: votes.thresholdPercent,
      presentCount: votes.presentCount,
    })
    .from(votes)
    .where(eq(votes.status, "open"));
  if (!open) {
    const none: CurrentVoteResponse = null;
    res.json(none);
    return;
  }

  // The caller's own answer is theirs to see. Everyone else's stays unread: the other rows
  // are only counted, never selected.
  const [mine] = await db
    .select({ answer: voteResponses.answer })
    .from(voteResponses)
    .where(
      and(
        eq(voteResponses.voteId, open.id),
        eq(voteResponses.memberId, memberId),
      ),
    );
  const [{ answered }] = await db
    .select({ answered: count() })
    .from(voteResponses)
    .where(eq(voteResponses.voteId, open.id));
  // The "out of" number: members who can answer today. Removed members, members an officer
  // switched off, and the Regent (who does not vote) are not in it. A removed member who
  // already answered stays in `answered`, so the history still adds up.
  const [{ totalMembers }] = await db
    .select({ totalMembers: count() })
    .from(members)
    .where(
      and(
        isNull(members.removedAt),
        eq(members.canVote, true),
        sql`not exists (
          select 1 from ${memberRoles}
          join ${roles} on ${roles.id} = ${memberRoles.roleId}
          where ${memberRoles.memberId} = ${members.id} and ${roles.name} = 'president'
        )`,
      ),
    );

  const response: CurrentVoteResponse = {
    id: open.id,
    title: open.title,
    kind: open.kind as CurrentVote["kind"],
    thresholdPercent: open.thresholdPercent,
    presentCount: open.presentCount,
    // Worked out by the shared rule from the vote's own saved headcount, not recomputed here.
    yesNeeded: yesNeeded(open.kind as CurrentVote["kind"], open.presentCount),
    myAnswer: mine ? (mine.answer ? "yes" : "no") : "none",
    // Only a hint so the screen can hide the buttons; the answer route is what enforces it.
    canAnswer: whyCannotAnswer(req.auth!) === null,
    answered,
    totalMembers,
  };
  res.json(response);
});

// GET /api/votes/headcount: how many are present, or null if unset or expired.
votesRouter.get("/headcount", requireLogin, async (_req, res) => {
  const response: HeadcountResponse = await readHeadcount();
  res.json(response);
});

// PUT /api/votes/headcount: the president says how many members are present, once for the
// meeting. Can be called again any time (someone leaves mid-deliberation). Votes that are
// already open keep the count they were opened with.
votesRouter.put(
  "/headcount",
  requireLogin,
  requirePermission("votes.open"),
  validateBody(headcountBody),
  async (req, res) => {
    const { presentCount } = req.body as z.infer<typeof headcountBody>;

    const total = await countActiveMembers();
    if (presentCount > total) {
      res.status(400).json({
        error: `Present can't be more than the ${total} members`,
      });
      return;
    }

    // One row, always id 1: insert it the first time, update it after that.
    await db
      .insert(meetingHeadcount)
      .values({ id: 1, presentCount })
      .onConflictDoUpdate({
        target: meetingHeadcount.id,
        set: { presentCount, updatedAt: new Date() },
      });

    const response: HeadcountResponse = await readHeadcount();
    res.json(response);
  },
);
