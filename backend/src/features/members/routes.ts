import type {
  AddMemberResponse,
  MemberSummary,
  MembersResponse,
  Role,
} from "@ttapp/shared";
import {
  TransactionRollbackError,
  and,
  count,
  eq,
  isNotNull,
  isNull,
  ne,
} from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import {
  memberRoles,
  members,
  posts,
  pushTokens,
  roles,
  rsvps,
  sessions,
  voteResponses,
} from "../../common/db/schema.ts";
import { ERASED_DOMAIN, isErased } from "../../common/erased.ts";
import { can, requirePermission } from "../../common/permissions.ts";
import { deleteSessionsForMember } from "../../common/sessions.ts";
import { validateBody } from "../../common/validate.ts";

export const membersRouter = Router();

// GET /api/members: everyone ever added, active and removed, with their roles.
// Removed members are included (removedAt is set) so the page can show and restore them.
membersRouter.get(
  "/",
  requireLogin,
  requirePermission("members.manage"),
  async (_req, res) => {
    // Two small queries instead of one join, so a member with no roles still gets a row.
    const [memberRows, roleRows] = await Promise.all([
      db.select().from(members).orderBy(members.email),
      db
        .select({ memberId: memberRoles.memberId, name: roles.name })
        .from(memberRoles)
        .innerJoin(roles, eq(memberRoles.roleId, roles.id)),
    ]);

    // member_id -> the roles granted to that person (officer, president, admin).
    const grantedByMember = new Map<string, Role[]>();
    for (const row of roleRows) {
      if (row.name === "member") continue; // "member" is implicit, not stored per person
      const granted = grantedByMember.get(row.memberId) ?? [];
      granted.push(row.name as Role);
      grantedByMember.set(row.memberId, granted);
    }

    const body: MembersResponse = {
      members: memberRows.map((member): MemberSummary => {
        const granted = grantedByMember.get(member.id) ?? [];
        return {
          id: member.id,
          email: member.email,
          name: member.name,
          roles: member.removedAt ? granted : ["member", ...granted],
          removedAt: member.removedAt?.toISOString() ?? null,
          canVote: member.canVote,
          erased: isErased(member.email),
        };
      }),
    };
    res.json(body);
  },
);

// The email is trimmed and lowercased first because the database only accepts that form
// (members_email_normalized), then checked for a valid address like "name@example.com".
const addMemberBody = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
});

// POST /api/members: adds an email to the allowlist so that person can sign in.
// Adding someone who was removed brings them back (that is how restore works).
membersRouter.post(
  "/",
  requireLogin,
  requirePermission("members.manage"),
  validateBody(addMemberBody),
  async (req, res) => {
    const { email } = req.body as z.infer<typeof addMemberBody>;

    // Insert first and let the unique email decide, so two officers adding the same
    // address at the same moment can't both succeed.
    const [created] = await db
      .insert(members)
      .values({ email })
      .onConflictDoNothing()
      .returning();
    if (created) {
      const body: AddMemberResponse = {
        id: created.id,
        email: created.email,
        restored: false,
      };
      res.status(201).json(body);
      return;
    }

    // The email already exists. If that person was removed, bring them back.
    const [restored] = await db
      .update(members)
      .set({ removedAt: null })
      .where(and(eq(members.email, email), isNotNull(members.removedAt)))
      .returning();
    if (restored) {
      const body: AddMemberResponse = {
        id: restored.id,
        email: restored.email,
        restored: true,
      };
      res.status(200).json(body);
      return;
    }

    res.status(409).json({ error: "That person is already a member" });
  },
);

// What a change needs from the database: db itself, or the transaction handed to a callback.
type Writer = Pick<typeof db, "update" | "delete">;

// Runs a change that may take an admin away, and undoes it if no active admin would be left.
// Returns false when it was undone. Locking the admin role row makes two such changes take
// turns, so each one counts the admins correctly (two admins can't both step aside).
async function changeKeepingAnAdmin(
  change: (writer: Writer) => PromiseLike<unknown>,
): Promise<boolean> {
  const adminRoleId = await findRoleId("admin");
  try {
    await db.transaction(async (tx) => {
      await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.id, adminRoleId))
        .for("update");
      await change(tx);
      const [{ admins }] = await tx
        .select({ admins: count() })
        .from(memberRoles)
        .innerJoin(members, eq(memberRoles.memberId, members.id))
        .where(
          and(eq(memberRoles.roleId, adminRoleId), isNull(members.removedAt)),
        );
      if (admins === 0) tx.rollback(); // undoes the change above
    });
    return true;
  } catch (err) {
    if (err instanceof TransactionRollbackError) return false;
    throw err;
  }
}

async function findRoleId(name: string) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, name));
  if (!role) throw new Error(`Role "${name}" is missing from the roles table`);
  return role.id;
}

// DELETE /api/members/:id: removes a member. Nothing is deleted: removed_at is set, so they
// can't sign in and their posts and history stay. Their roles are cleared, so someone who
// is restored later starts as a plain member. Safe to repeat: every step can run again.
membersRouter.delete(
  "/:id",
  requireLogin,
  requirePermission("members.manage"),
  async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    const targetId = z.uuid().safeParse(req.params.id);
    if (!targetId.success) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (targetId.data === auth.member.id) {
      res.status(400).json({ error: "You can't remove yourself" });
      return;
    }

    const [target] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, targetId.data));
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Officers can remove plain members. Anyone with a granted role needs an admin.
    const heldRoles = (
      await db
        .select({ name: roles.name })
        .from(memberRoles)
        .innerJoin(roles, eq(memberRoles.roleId, roles.id))
        .where(
          and(eq(memberRoles.memberId, target.id), ne(roles.name, "member")),
        )
    ).map((row) => row.name);
    if (heldRoles.length > 0 && !can(auth.roles, "roles.grant")) {
      res.status(403).json({
        error: "Only an admin can remove an officer, president or admin",
      });
      return;
    }

    // Removing first cuts them off at once: findSession ignores removed members.
    const removeFromList = async (writer: Writer) => {
      await writer
        .update(members)
        .set({ removedAt: new Date() })
        .where(and(eq(members.id, target.id), isNull(members.removedAt)));
      await writer
        .delete(memberRoles)
        .where(eq(memberRoles.memberId, target.id));
    };
    if (heldRoles.includes("admin")) {
      // Two admins removing each other at once must not leave the chapter with none.
      if (!(await changeKeepingAnAdmin(removeFromList))) {
        res.status(409).json({ error: "There must be at least one admin" });
        return;
      }
    } else {
      await removeFromList(db);
    }
    await deleteSessionsForMember(target.id);
    res.status(204).end();
  },
);

// "member" is implicit, so only these three can be granted or revoked.
const grantableRole = z.enum(["officer", "president", "admin"]);

// Reads :id and :role from the URL. On a bad value it sends the error itself and returns
// undefined, so the caller just stops.
function readRoleParams(req: Request, res: Response) {
  const memberId = z.uuid().safeParse(req.params.id);
  if (!memberId.success) {
    res.status(404).json({ error: "Member not found" });
    return undefined;
  }
  const role = grantableRole.safeParse(req.params.role);
  if (!role.success) {
    res.status(400).json({ error: "Role must be officer, president or admin" });
    return undefined;
  }
  return { memberId: memberId.data, role: role.data };
}

// There is one president at a time. Gives the role to this member, unless a different
// active member holds it, and then returns that member (nothing is changed). Locking the
// role row makes two grants at the same moment take turns, so the second one sees the first.
async function grantPresident(memberId: string, roleId: string) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, roleId))
      .for("update");
    const [holder] = await tx
      .select({ id: members.id, name: members.name, email: members.email })
      .from(memberRoles)
      .innerJoin(members, eq(memberRoles.memberId, members.id))
      .where(and(eq(memberRoles.roleId, roleId), isNull(members.removedAt)));
    if (holder && holder.id !== memberId) return holder;
    await tx
      .insert(memberRoles)
      .values({ memberId, roleId })
      .onConflictDoNothing();
    return undefined;
  });
}

// PUT /api/members/:id/roles/:role: gives someone a role. Admin only (roles.grant).
// Granting a role they already hold is fine. Only one person can be president at a time.
membersRouter.put(
  "/:id/roles/:role",
  requireLogin,
  requirePermission("roles.grant"),
  async (req, res) => {
    const params = readRoleParams(req, res);
    if (!params) return;

    const [member] = await db
      .select({ id: members.id, removedAt: members.removedAt })
      .from(members)
      .where(eq(members.id, params.memberId));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (member.removedAt) {
      res
        .status(409)
        .json({ error: "That member was removed. Add them again first" });
      return;
    }

    const roleId = await findRoleId(params.role);
    if (params.role === "president") {
      const holder = await grantPresident(member.id, roleId);
      if (holder) {
        res.status(409).json({
          error: `${holder.name ?? holder.email} is already president. Remove their president role first`,
        });
        return;
      }
      res.status(204).end();
      return;
    }

    await db
      .insert(memberRoles)
      .values({ memberId: member.id, roleId })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

// DELETE /api/members/:id/roles/:role: takes a role away. Admin only (roles.grant).
// Revoking admin from the last admin is refused, so the chapter can't lock itself out.
membersRouter.delete(
  "/:id/roles/:role",
  requireLogin,
  requirePermission("roles.grant"),
  async (req, res) => {
    const params = readRoleParams(req, res);
    if (!params) return;

    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, params.memberId));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const roleId = await findRoleId(params.role);
    const holdsRole = and(
      eq(memberRoles.memberId, member.id),
      eq(memberRoles.roleId, roleId),
    );
    if (params.role !== "admin") {
      await db.delete(memberRoles).where(holdsRole);
      res.status(204).end();
      return;
    }

    const kept = await changeKeepingAnAdmin((writer) =>
      writer.delete(memberRoles).where(holdsRole),
    );
    if (!kept) {
      res.status(409).json({ error: "There must be at least one admin" });
      return;
    }
    res.status(204).end();
  },
);

// Does anything they did still point at this member?
async function hasHistory(
  tx: Pick<typeof db, "select">,
  memberId: string,
): Promise<boolean> {
  const [post] = await tx
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.authorId, memberId))
    .limit(1);
  const [rsvp] = await tx
    .select({ id: rsvps.id })
    .from(rsvps)
    .where(eq(rsvps.memberId, memberId))
    .limit(1);
  const [vote] = await tx
    .select({ id: voteResponses.id })
    .from(voteResponses)
    .where(eq(voteResponses.memberId, memberId))
    .limit(1);
  return Boolean(post || rsvp || vote);
}

// POST /api/members/:id/erase: clears a REMOVED member's personal data for good. Their
// sessions, push tokens and roles are deleted. With no history the row is deleted too; with
// history it stays as an anonymous "former member" so posts, RSVPs and vote totals still add
// up. Their old email is free afterwards. Safe to repeat.
membersRouter.post(
  "/:id/erase",
  requireLogin,
  requirePermission("members.manage"),
  async (req, res) => {
    const memberId = z.uuid().safeParse(req.params.id);
    if (!memberId.success) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      // Locking the row stops a restore and an erase from both going through.
      const [target] = await tx
        .select({
          id: members.id,
          email: members.email,
          removedAt: members.removedAt,
        })
        .from(members)
        .where(eq(members.id, memberId.data))
        .for("update");
      if (!target) return "missing" as const;
      if (!target.removedAt) return "not_removed" as const;
      if (isErased(target.email)) return "done" as const;

      await tx.delete(sessions).where(eq(sessions.memberId, target.id));
      await tx.delete(pushTokens).where(eq(pushTokens.memberId, target.id));
      await tx.delete(memberRoles).where(eq(memberRoles.memberId, target.id));
      if (await hasHistory(tx, target.id)) {
        await tx
          .update(members)
          .set({
            email: `erased-${target.id}@${ERASED_DOMAIN}`,
            name: null,
            firstLoginAt: null,
          })
          .where(eq(members.id, target.id));
      } else {
        await tx.delete(members).where(eq(members.id, target.id));
      }
      return "done" as const;
    });

    if (outcome === "missing") {
      res.status(404).json({ error: "Member not found" });
    } else if (outcome === "not_removed") {
      res.status(409).json({
        error: "Remove them first. Only removed members can be erased",
      });
    } else {
      res.status(204).end();
    }
  },
);

const canVoteBody = z.object({ canVote: z.boolean() });

// PATCH /api/members/:id/can-vote: an officer (or admin) switches a member's right to vote on
// or off. The bylaws only let members who meet the quarter's voting requirements vote, and
// the chapter's officers are the ones who know who does, so this is a plain switch they
// control. It is checked fresh on every answer (see the votes routes), so turning someone off
// takes effect straight away, even in the middle of a vote. Their earlier answer stays.
membersRouter.patch(
  "/:id/can-vote",
  requireLogin,
  requirePermission("members.setVoting"),
  validateBody(canVoteBody),
  async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    const { canVote } = req.body as z.infer<typeof canVoteBody>;

    const [member] = await db
      .select({ removedAt: members.removedAt })
      .from(members)
      .where(eq(members.id, id.data));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (member.removedAt) {
      res
        .status(409)
        .json({ error: "That member was removed. Add them again first" });
      return;
    }

    await db.update(members).set({ canVote }).where(eq(members.id, id.data));
    res.status(204).end();
  },
);
