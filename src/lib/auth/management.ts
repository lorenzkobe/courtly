import type { Court, SessionUser } from "@/lib/types/courtly";

export function manageableCourtIds(
  user: SessionUser | null,
  allCourts: Court[],
): string[] {
  if (!user) return [];
  if (user.role === "superadmin") {
    return allCourts.map((c) => c.id);
  }
  if (user.role === "admin") {
    return allCourts
      .filter((c) => c.managed_by_user_id === user.id)
      .map((c) => c.id);
  }
  return [];
}

export function canMutateCourt(
  user: SessionUser | null,
  court: Court,
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role === "admin") return court.managed_by_user_id === user.id;
  return false;
}

export function isCourtStaff(user: SessionUser | null): boolean {
  return user?.role === "admin" || user?.role === "superadmin";
}

export function isSuperadmin(user: SessionUser | null): boolean {
  return user?.role === "superadmin";
}

/** Roles that may access `/admin/*` (scoped data for admin, all data for superadmin). */
export const COURT_ADMIN_ROLES: SessionUser["role"][] = ["admin", "superadmin"];

/** Roles that may access `/superadmin`. */
export const SUPERADMIN_ROLES: SessionUser["role"][] = ["superadmin"];
