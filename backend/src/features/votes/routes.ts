import type { OpenVoteResponse } from "@ttapp/shared";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { votes } from "../../common/db/schema.ts";
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
