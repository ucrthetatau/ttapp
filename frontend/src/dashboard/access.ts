import type { Role } from "@ttapp/shared";

// Who sees the dashboard setup page. This mirrors the backend permission dashboard.manage
// (officers, and admins who inherit it). It only decides what to show; the backend is what
// refuses everyone else.
export function canManageDashboard(roles: Role[]): boolean {
  return roles.includes("officer") || roles.includes("admin");
}
