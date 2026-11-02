import type { CreatePostResponse } from "@ttapp/shared";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { posts } from "../../common/db/schema.ts";
import { requirePermission } from "../../common/permissions.ts";
import { validateBody } from "../../common/validate.ts";

export const postsRouter = Router();

// The text is trimmed first, so a post of only spaces counts as empty. The 2,000 limit
// matches the database rule, which is the last line of defence if this check is bypassed.
const createPostBody = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something to post")
    .max(2000, "Keep the post to 2,000 characters or fewer"),
  hasRsvp: z.boolean().default(false),
});

// POST /api/posts: writes a post to the chapter feed. Every member can post (posts.create).
// The author comes from the session, never from the request, so nobody can post as someone else.
postsRouter.post(
  "/",
  requireLogin,
  requirePermission("posts.create"),
  validateBody(createPostBody),
  async (req, res) => {
    const { body, hasRsvp } = req.body as z.infer<typeof createPostBody>;
    const [created] = await db
      .insert(posts)
      .values({ authorId: req.auth!.member.id, body, hasRsvp })
      .returning({ id: posts.id });
    const response: CreatePostResponse = created;
    res.status(201).json(response);
  },
);
