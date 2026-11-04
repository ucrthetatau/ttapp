import type { OpenVoteResponse } from "@ttapp/shared";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { voteResponses, votes } from "../../common/db/schema.ts";
import { requirePermission } from "../../common/permissions.ts";
import { validateBody } from "../../common/validate.ts";

export const votesRouter = Router();

const openVoteBody = z.object({
  title: z.string().trim().min(1).max(200),
  thresholdPercent: z.number().int().min(1).max(100),
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

// POST /api/votes: the president (and admins) open a vote.
// Only one vote can be open at a time. We do not check first and then insert, because two
// requests could both pass the check. Instead we just insert and let the database's
// "votes_one_open" index refuse the second one; that refusal becomes the 409 below.
votesRouter.post(
  "/",
  requireLogin,
  requirePermission("votes.open"),
  validateBody(openVoteBody),
  async (req, res) => {
    const { title, thresholdPercent } = req.body as z.infer<
      typeof openVoteBody
    >;
    try {
      const [created] = await db
        .insert(votes)
        .values({ title, thresholdPercent })
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
