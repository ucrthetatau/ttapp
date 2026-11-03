import type { CreatePostResponse, Post, PostsResponse } from "@ttapp/shared";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { members, posts, rsvps } from "../../common/db/schema.ts";
import { isErased } from "../../common/erased.ts";
import { can, requirePermission } from "../../common/permissions.ts";
import { validateBody } from "../../common/validate.ts";

export const postsRouter = Router();

const PAGE_SIZE = 20;

// GET /api/posts: one page of the feed, newest first. Every member can read it.
// ?before=<ISO time> asks for posts older than that moment, which is how "Load more" works.
// Deleted posts are left out. Counts and "my answer" are worked out inside the same query,
// so the screen gets everything in one round trip instead of one request per post.
postsRouter.get("/", requireLogin, async (req, res) => {
  const { member, roles } = req.auth!;

  let before: Date | undefined;
  if (req.query.before !== undefined) {
    const parsed = z.iso.datetime().safeParse(req.query.before);
    if (!parsed.success) {
      res.status(400).json({ error: "before must be an ISO time" });
      return;
    }
    before = new Date(parsed.data);
  }

  // Ask for one extra row. If it comes back, older posts exist; it is never sent to the client.
  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      createdAt: posts.createdAt,
      hasRsvp: posts.hasRsvp,
      authorId: posts.authorId,
      authorEmail: members.email,
      authorName: members.name,
      yesCount: sql<number>`(select count(*) from ${rsvps} where ${rsvps.postId} = ${posts.id} and ${rsvps.answer})::int`,
      noCount: sql<number>`(select count(*) from ${rsvps} where ${rsvps.postId} = ${posts.id} and not ${rsvps.answer})::int`,
      myAnswer: sql<
        boolean | null
      >`(select ${rsvps.answer} from ${rsvps} where ${rsvps.postId} = ${posts.id} and ${rsvps.memberId} = ${member.id})`,
    })
    .from(posts)
    .innerJoin(members, eq(posts.authorId, members.id))
    .where(
      and(
        isNull(posts.deletedAt),
        before ? lt(posts.createdAt, before) : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(PAGE_SIZE + 1);

  const canDeleteAny = can(roles, "posts.deleteAny");
  const canDeleteOwn = can(roles, "posts.delete");

  const page: Post[] = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    hasRsvp: row.hasRsvp,
    authorName: isErased(row.authorEmail)
      ? "Former member"
      : (row.authorName ?? row.authorEmail),
    yesCount: row.yesCount,
    noCount: row.noCount,
    myAnswer: row.myAnswer,
    canDelete: canDeleteAny || (canDeleteOwn && row.authorId === member.id),
  }));

  const response: PostsResponse = {
    posts: page,
    hasMore: rows.length > PAGE_SIZE,
  };
  res.json(response);
});

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
