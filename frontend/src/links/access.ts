import type { Role } from "@ttapp/shared";

// Who sees the add form and the Remove buttons. This mirrors the backend permission
// driveLinks.manage (officers, and admins who inherit it). It only decides what to show;
// the backend is what refuses everyone else.
export function canManageLinks(roles: Role[]): boolean {
  return roles.includes("officer") || roles.includes("admin");
}
