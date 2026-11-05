import type {
  AddMemberResponse,
  BulkAddMembersResponse,
  BulkAddResult,
} from "@ttapp/shared";
import { readError } from "../common/readError.ts";

export type AddMemberResult =
  | { ok: true; email: string; restored: boolean }
  | { ok: false; message: string };

// POST /api/members. The backend trims and lowercases the email, and checks it.
export async function addMember(email: string): Promise<AddMemberResult> {
  try {
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    const body = (await res.json()) as AddMemberResponse;
    return { ok: true, email: body.email, restored: body.restored };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

export type AddMembersBulkResult =
  { ok: true; results: BulkAddResult[] } | { ok: false; message: string };

// POST /api/members/bulk. One request for the whole pasted list. The backend cleans up and
// checks each email on its own and answers once per email, in the order sent.
export async function addMembersBulk(
  emails: string[],
): Promise<AddMembersBulkResult> {
  try {
    const res = await fetch("/api/members/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    const body = (await res.json()) as BulkAddMembersResponse;
    return { ok: true, results: body.results };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

export type RemoveMemberResult = { ok: true } | { ok: false; message: string };

// DELETE /api/members/:id. The backend signs them out and keeps their history.
export async function removeMember(id: string): Promise<RemoveMemberResult> {
  try {
    const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// The three roles an admin can hand out. "member" is implicit and never changes.
export type GrantableRole = "officer" | "president" | "admin";
export const grantableRoles: GrantableRole[] = [
  "officer",
  "president",
  "admin",
];

// PUT and DELETE /api/members/:id/roles/:role. Admin only. The backend refuses to leave
// the chapter without an admin and answers 409 with a message.
export async function grantRole(
  id: string,
  role: GrantableRole,
): Promise<RemoveMemberResult> {
  return changeRole("PUT", id, role);
}

export async function revokeRole(
  id: string,
  role: GrantableRole,
): Promise<RemoveMemberResult> {
  return changeRole("DELETE", id, role);
}

async function changeRole(
  method: "PUT" | "DELETE",
  id: string,
  role: GrantableRole,
): Promise<RemoveMemberResult> {
  try {
    const res = await fetch(`/api/members/${id}/roles/${role}`, { method });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// POST /api/members/:id/erase. Permanently clears a removed member's personal data. The
// backend keeps an anonymous row if they have history (posts, RSVPs, votes).
export async function eraseMember(id: string): Promise<RemoveMemberResult> {
  try {
    const res = await fetch(`/api/members/${id}/erase`, { method: "POST" });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// PATCH /api/members/:id/can-vote. Officers and admins. Turning it off stops that member from
// answering votes straight away; their earlier answers stay.
export async function setCanVote(
  id: string,
  canVote: boolean,
): Promise<RemoveMemberResult> {
  try {
    const res = await fetch(`/api/members/${id}/can-vote`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canVote }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}
