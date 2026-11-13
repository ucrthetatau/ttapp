import type { Role } from "@ttapp/shared";
import type { NextFunction, Request, Response } from "express";

// Everything a person can be allowed to do. A typo in the map below is a type error.
export type Action =
  | "dashboard.view"
  | "driveLinks.view"
  | "posts.create"
  | "posts.edit" // your own posts
  | "posts.delete" // your own posts
  | "posts.deleteAny" // anyone's post
  | "posts.rsvp"
  | "votes.answer"
  | "members.manage"
  | "members.setVoting" // switch a member's right to vote on or off
  | "driveLinks.manage"
  | "dashboard.manage" // choose the sheets and calendars the dashboard reads
  | "votes.open"
  | "votes.close"
  | "votes.delete"
  | "votes.viewDetails"
  | "roles.grant";

const memberActions: Action[] = [
  "dashboard.view",
  "driveLinks.view",
  "posts.create",
  "posts.edit",
  "posts.delete",
  "posts.rsvp",
  "votes.answer",
];

const officerActions: Action[] = [
  "members.manage",
  "members.setVoting",
  "driveLinks.manage",
  "dashboard.manage",
  "posts.deleteAny",
];

const presidentActions: Action[] = [
  "votes.open",
  "votes.close",
  "votes.delete",
  "votes.viewDetails",
];

// Admin gets whatever officers and presidents can do, so a new officer or president
// action reaches admin automatically. The one exception is seeing individual votes.
const adminActions: Action[] = [
  ...officerActions,
  ...presidentActions.filter((action) => action !== "votes.viewDetails"),
  "roles.grant",
];

// What each role allows on its own. A person's roles stack (see can()).
// Every active member is a "member", so member actions apply to everyone.
export const rolePermissions: Record<Role, readonly Action[]> = {
  member: memberActions,
  officer: officerActions,
  president: presidentActions,
  admin: adminActions,
};

// True if any one of the person's roles allows the action, so roles stack.
export function can(roles: Role[], action: Action): boolean {
  return roles.some((role) => rolePermissions[role].includes(action));
}

// Put this after requireLogin on any route that needs a specific permission.
export function requirePermission(action: Action) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      // requireLogin did not run first. Refuse rather than let the request through.
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    if (!can(req.auth.roles, action)) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    next();
  };
}

// Only the president role may see individual votes. If any other role ever gets
// "votes.viewDetails", refuse to start. Called once from index.ts.
export function assertVotePrivacy() {
  for (const [role, actions] of Object.entries(rolePermissions)) {
    if (role !== "president" && actions.includes("votes.viewDetails")) {
      throw new Error(`Role "${role}" must not have votes.viewDetails`);
    }
  }
}
