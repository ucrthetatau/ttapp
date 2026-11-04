import type { Role } from "@ttapp/shared";

// Who sees the Regent's controls. This mirrors the backend (votes.open, votes.close and
// votes.delete in backend/src/common/permissions.ts: the president, and admins who inherit
// them). It only decides what to show; the backend is what actually refuses everyone else.
export function canRunVotes(roles: Role[]): boolean {
  return roles.includes("president") || roles.includes("admin");
}

// Who sees how each member voted. The backend gives votes.viewDetails to the president role
// only, not even admins (assertVotePrivacy), so the screen mirrors that.
export function canSeeVoteDetails(roles: Role[]): boolean {
  return roles.includes("president");
}
