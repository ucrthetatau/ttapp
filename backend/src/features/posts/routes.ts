import type {
  CreatePostResponse,
  EditPostResponse,
  Post,
  PostRsvpsResponse,
  PostsResponse,
} from "@ttapp/shared";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { members, posts, rsvps } from "../../common/db/schema.ts";
import { ringFeed } from "../../common/doorbell.ts";
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
      editedAt: posts.editedAt,
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
  const canEditOwn = can(roles, "posts.edit");

  const page: Post[] = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    hasRsvp: row.hasRsvp,
    authorName: isErased(row.authorEmail)
      ? "Former member"
      : (row.authorName ?? row.authorEmail),
    yesCount: row.yesCount,
    noCount: row.noCount,
    myAnswer: row.myAnswer,
    canEdit: canEditOwn && row.authorId === member.id,
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
const postText = z
  .string()
  .trim()
  .min(1, "Write something to post")
  .max(2000, "Keep the post to 2,000 characters or fewer");

const createPostBody = z.object({
  body: postText,
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
    // After the answer is sent, so the author never waits on it. ringFeed never throws.
    void ringFeed("new-post");
  },
);

// DELETE /api/posts/:id: removes a post from the feed. Members can delete their own posts
// (posts.delete); officers and admins can delete anyone's (posts.deleteAny).
// This is a soft delete: deleted_at is set and the row stays, so RSVPs and history survive.
// There is no requirePermission here because the answer depends on whose post it is.
postsRouter.delete("/:id", requireLogin, async (req, res) => {
  const { member, roles } = req.auth!;

  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [post] = await db
    .select({ authorId: posts.authorId })
    .from(posts)
    .where(and(eq(posts.id, id.data), isNull(posts.deletedAt)));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const allowed =
    can(roles, "posts.deleteAny") ||
    (can(roles, "posts.delete") && post.authorId === member.id);
  if (!allowed) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }

  // Only touch the row if it is still not deleted, so two people deleting at the same
  // moment can't both succeed: the second one finds nothing to update.
  const deleted = await db
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(and(eq(posts.id, id.data), isNull(posts.deletedAt)))
    .returning({ id: posts.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.status(204).end();
  void ringFeed("post-changed");
});

// Finds a post that is still in the feed. A malformed id, an unknown id and a deleted post
// all come back as undefined, because to a member they are all "no such post".
async function findLivePost(idParam: string | string[] | undefined) {
  const id = z.uuid().safeParse(idParam);
  if (!id.success) return undefined;
  const [post] = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      body: posts.body,
      editedAt: posts.editedAt,
      hasRsvp: posts.hasRsvp,
    })
    .from(posts)
    .where(and(eq(posts.id, id.data), isNull(posts.deletedAt)));
  return post;
}

const rsvpBody = z.object({ answer: z.boolean() });

// PUT /api/posts/:id/rsvp: answers yes (true) or no (false). Answering again changes the
// answer, so a person always has at most one answer per post.
postsRouter.put(
  "/:id/rsvp",
  requireLogin,
  requirePermission("posts.rsvp"),
  validateBody(rsvpBody),
  async (req, res) => {
    const post = await findLivePost(req.params.id);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    if (!post.hasRsvp) {
      res.status(409).json({ error: "This post does not ask for RSVPs" });
      return;
    }

    const { answer } = req.body as z.infer<typeof rsvpBody>;
    // One statement: insert the answer, or change it if this person already answered.
    // The database's unique (post, member) rule decides, so two taps at once can't
    // leave two rows.
    await db
      .insert(rsvps)
      .values({ postId: post.id, memberId: req.auth!.member.id, answer })
      .onConflictDoUpdate({
        target: [rsvps.postId, rsvps.memberId],
        set: { answer },
      });
    res.status(204).end();
  },
);

// DELETE /api/posts/:id/rsvp: takes back your answer. Fine to call when you have none.
postsRouter.delete("/:id/rsvp", requireLogin, async (req, res) => {
  const post = await findLivePost(req.params.id);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  await db
    .delete(rsvps)
    .where(
      and(eq(rsvps.postId, post.id), eq(rsvps.memberId, req.auth!.member.id)),
    );
  res.status(204).end();
});

// GET /api/posts/:id/rsvps: who answered yes and who answered no, names A to Z.
// Every member can see this (unlike vote answers, RSVPs are public by design).
// People who were removed since still count, and erased members show as "Former member".
postsRouter.get("/:id/rsvps", requireLogin, async (req, res) => {
  const post = await findLivePost(req.params.id);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const rows = await db
    .select({
      answer: rsvps.answer,
      name: members.name,
      email: members.email,
    })
    .from(rsvps)
    .innerJoin(members, eq(rsvps.memberId, members.id))
    .where(eq(rsvps.postId, post.id));

  // Sorted here, after the "Former member" label is chosen, so the order matches what is shown.
  const byName = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base" });
  const namesFor = (answer: boolean) =>
    rows
      .filter((row) => row.answer === answer)
      .map((row) =>
        isErased(row.email) ? "Former member" : (row.name ?? row.email),
      )
      .sort(byName);

  const response: PostRsvpsResponse = {
    yes: namesFor(true),
    no: namesFor(false),
  };
  res.json(response);
});

// Editing changes the words only. Whether the post asks for RSVPs can't change afterwards,
// because turning it off would strand the answers already given.
const editPostBody = z.object({ body: postText });

// PATCH /api/posts/:id: rewrites the text of your own post and marks it as edited.
// Only the author may do this (posts.edit): officers can delete a post but not put new words
// under someone else's name. The old text is overwritten, not kept.
postsRouter.patch(
  "/:id",
  requireLogin,
  validateBody(editPostBody),
  async (req, res) => {
    const { member, roles } = req.auth!;
    const post = await findLivePost(req.params.id);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    if (!can(roles, "posts.edit") || post.authorId !== member.id) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    const { body } = req.body as z.infer<typeof editPostBody>;
    // Saving the same words again is not an edit, so no "(edited)" appears out of nowhere.
    if (body === post.body) {
      const unchanged: EditPostResponse = {
        body: post.body,
        editedAt: post.editedAt?.toISOString() ?? null,
      };
      res.json(unchanged);
      return;
    }

    // Only touch the row if it is still in the feed, so an edit racing a delete can't
    // bring a deleted post back to life.
    const [saved] = await db
      .update(posts)
      .set({ body, editedAt: new Date() })
      .where(and(eq(posts.id, post.id), isNull(posts.deletedAt)))
      .returning({ body: posts.body, editedAt: posts.editedAt });
    if (!saved) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    const response: EditPostResponse = {
      body: saved.body,
      editedAt: saved.editedAt?.toISOString() ?? null,
    };
    res.json(response);
    // Only a real change rings: an unchanged save or a refusal returned earlier.
    void ringFeed("post-changed");
  },
);
