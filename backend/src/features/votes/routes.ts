import type {
  CloseVoteResponse,
  CurrentVote,
  CurrentVoteResponse,
  HeadcountResponse,
  OpenVoteResponse,
  PastVote,
  PastVotesResponse,
  VoteDetailsResponse,
} from "@ttapp/shared";
import {
  VOTE_KIND_INFO,
  VOTE_KINDS,
  decide,
  isVoteKind,
  yesNeeded,
} from "@ttapp/shared";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
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
import { ringVotes } from "../../common/doorbell.ts";
import { isErased } from "../../common/erased.ts";
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
      // After the answer is sent, so the Regent never waits on it. ringVotes never throws.
      void ringVotes("vote-opened");
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
    // The counts everyone sees just moved. The ring says nothing about who answered or how;
    // pages ask the backend for the counts, which are turnout only.
    void ringVotes("vote-answered");
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
// meeting. Can be called again any time (someone leaves mid-deliberation); a vote that is
// open at that moment follows the new number.
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
    // An open vote follows the room: if someone leaves in the middle of deliberation, the
    // president lowers the count and the vote now waits for, and is measured against, the
    // new number. A closed vote is never touched, so its result stays explainable.
    const changedVotes = await db.transaction(async (tx) => {
      await tx
        .insert(meetingHeadcount)
        .values({ id: 1, presentCount })
        .onConflictDoUpdate({
          target: meetingHeadcount.id,
          set: { presentCount, updatedAt: new Date() },
        });
      return tx
        .update(votes)
        .set({ presentCount })
        .where(eq(votes.status, "open"))
        .returning({ id: votes.id });
    });

    const response: HeadcountResponse = await readHeadcount();
    res.json(response);
    // Only when an open vote's numbers just changed (someone left, say): members on that page
    // would otherwise keep seeing the old "needs N yes". A headcount with no vote open changes
    // nothing for them, so it stays quiet.
    if (changedVotes.length > 0) void ringVotes("vote-changed");
  },
);

const closeBody = z
  .object({ tiebreak: z.enum(["yes", "no"]).optional() })
  .default({});

// POST /api/votes/:id/close: the Regent (president) closes the vote by hand and the result is
// stored. This is the one place votes are counted.
//
// 1. It waits for everyone: there is no abstaining (bylaws Art V Section II.2), so the vote
//    cannot close until the answers equal the number present. If someone left, the president
//    lowers the headcount first, and the open vote follows it.
// 2. The result comes from decide() in the shared rules, measured against the number present.
// 3. A tie only happens on a majority vote. The Regent breaks it (Art V Section II.3): the
//    first close answers 409 "Tie", and the Regent closes again saying yes or no. The Regent
//    decides; they do not add a vote.
//
// Everything runs in one transaction that starts by locking the vote's row (FOR UPDATE). An
// answer in progress holds a shared lock on that row (see the answer route), so an answer
// that already got in is finished first and counted, and one that arrives after waits, finds
// the vote closed, and is refused. The counts read below cannot change before the result is
// written.
votesRouter.post(
  "/:id/close",
  requireLogin,
  requirePermission("votes.close"),
  validateBody(closeBody),
  async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }
    const { tiebreak } = req.body as z.infer<typeof closeBody>;

    const outcome = await db.transaction(async (tx) => {
      const [vote] = await tx
        .select({
          status: votes.status,
          kind: votes.kind,
          presentCount: votes.presentCount,
        })
        .from(votes)
        .where(eq(votes.id, id.data))
        .for("update");
      if (!vote) return { type: "not-found" } as const;
      if (vote.status === "closed") return { type: "already-closed" } as const;
      if (!isVoteKind(vote.kind))
        throw new Error(`Unknown vote kind ${vote.kind}`);

      const [tally] = await tx
        .select({
          cast: count(),
          yes: sql<number>`count(*) filter (where ${voteResponses.answer})::int`,
        })
        .from(voteResponses)
        .where(eq(voteResponses.voteId, id.data));

      if (tally.cast !== vote.presentCount) {
        return {
          type: "count-mismatch",
          cast: tally.cast,
          present: vote.presentCount,
        } as const;
      }

      const decision = decide(vote.kind, tally.yes, vote.presentCount);
      if (decision === "tie" && !tiebreak) return { type: "tie" } as const;
      if (decision !== "tie" && tiebreak) return { type: "not-a-tie" } as const;

      const result =
        decision === "tie" ? (tiebreak === "yes" ? "pass" : "fail") : decision;
      await tx
        .update(votes)
        .set({
          status: "closed",
          result,
          tiebreak: decision === "tie",
          closedAt: new Date(),
        })
        .where(eq(votes.id, id.data));
      return { type: "closed", result } as const;
    });

    switch (outcome.type) {
      case "not-found":
        res.status(404).json({ error: "Vote not found" });
        return;
      case "already-closed":
        res.status(409).json({ error: "Vote is already closed" });
        return;
      case "count-mismatch":
        res.status(409).json({
          error:
            outcome.cast < outcome.present
              ? `${outcome.cast} of ${outcome.present} present have answered`
              : `${outcome.cast} have answered but only ${outcome.present} are present. Fix who is present first`,
        });
        return;
      case "tie":
        // "tie: true" lets the screen know to ask the Regent for yes or no.
        res.status(409).json({ error: "Tie: choose yes or no", tie: true });
        return;
      case "not-a-tie":
        res.status(409).json({
          error: "The count changed and it is no longer a tie. Close again",
        });
        return;
      case "closed": {
        const response: CloseVoteResponse = { result: outcome.result };
        res.json(response);
        void ringVotes("vote-closed");
        return;
      }
    }
  },
);

const RECENT_RESULTS = 20;

// GET /api/votes: the most recent closed votes, newest first, so members can see how a vote
// ended. Every signed-in member can read it. It shows turnout and pass or fail, nothing more:
// no yes/no split and no names (the split would let people work out how close a vote was, and
// PRIVACY.md promises members only pass or fail and turnout). Open votes are left out; they
// live on /current. Capped so the list cannot grow forever.
votesRouter.get("/", requireLogin, async (_req, res) => {
  const rows = await db
    .select({
      id: votes.id,
      title: votes.title,
      kind: votes.kind,
      result: votes.result,
      tiebreak: votes.tiebreak,
      closedAt: votes.closedAt,
      presentCount: votes.presentCount,
      answered: count(voteResponses.id),
    })
    .from(votes)
    // A join and a count, not a subquery: in a one-table query Drizzle writes a bare "id",
    // which inside a subquery would mean the answers' own id and quietly count nothing.
    .leftJoin(voteResponses, eq(voteResponses.voteId, votes.id))
    .where(eq(votes.status, "closed"))
    .groupBy(votes.id)
    .orderBy(desc(votes.closedAt), desc(votes.id))
    .limit(RECENT_RESULTS);

  const body: PastVotesResponse = {
    votes: rows.map((row): PastVote => ({
      id: row.id,
      title: row.title,
      // The database CHECKs keep these to the known values; closed rows always have both.
      kind: row.kind as PastVote["kind"],
      result: row.result as PastVote["result"],
      tiebreak: row.tiebreak,
      closedAt: row.closedAt!.toISOString(),
      presentCount: row.presentCount,
      answered: row.answered,
    })),
  };
  res.json(body);
});

// GET /api/votes/:id/details: how a closed vote went, with every member's answer. Only the
// president role (votes.viewDetails). Not even admins have it (see assertVotePrivacy in
// permissions.ts), though an admin can grant themselves president, so for admins privacy is
// by convention. Only after the vote is closed: while it is open this answers 409, so nobody
// can watch answers arrive and sway a vote that can still change.
votesRouter.get(
  "/:id/details",
  requireLogin,
  requirePermission("votes.viewDetails"),
  async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }

    const [vote] = await db.select().from(votes).where(eq(votes.id, id.data));
    if (!vote) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }
    if (vote.status !== "closed") {
      res.status(409).json({ error: "Vote is still open" });
      return;
    }

    const answerRows = await db
      .select({
        email: members.email,
        name: members.name,
        answer: voteResponses.answer,
      })
      .from(voteResponses)
      .innerJoin(members, eq(voteResponses.memberId, members.id))
      .where(eq(voteResponses.voteId, vote.id));

    const answers = answerRows
      .map((row) => ({
        name: isErased(row.email) ? "Former member" : (row.name ?? row.email),
        answer: row.answer,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const yes = answers.filter((a) => a.answer).length;

    const body: VoteDetailsResponse = {
      id: vote.id,
      title: vote.title,
      kind: vote.kind as VoteDetailsResponse["kind"],
      result: vote.result as VoteDetailsResponse["result"],
      tiebreak: vote.tiebreak,
      presentCount: vote.presentCount,
      yes,
      no: answers.length - yes,
      answers,
    };
    res.json(body);
  },
);

// DELETE /api/votes/:id: removes a vote for good. This is how a vote is redone: delete it and
// open a new one. It works on an open vote as well as a closed one. The answers go with it (the
// vote_responses foreign key cascades), so nothing about who answered is left behind. If an
// answer is being saved at that moment, the delete waits for it (the answer holds a lock on the
// vote row) and then removes it too.
votesRouter.delete(
  "/:id",
  requireLogin,
  requirePermission("votes.delete"),
  async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }
    const deleted = await db
      .delete(votes)
      .where(eq(votes.id, id.data))
      .returning({ id: votes.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }
    res.status(204).end();
    // Members may be looking at the vote that was just deleted (a redo).
    void ringVotes("vote-deleted");
  },
);
