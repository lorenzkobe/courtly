import type { Court, SessionUser } from "@/lib/types/courtly";

function venueIdsForAdmin(
  adminUserId: string,
  assignments: { venue_id: string; admin_user_id: string }[],
): Set<string> {
  return new Set(
    assignments
      .filter((a) => a.admin_user_id === adminUserId)
      .map((a) => a.venue_id),
  );
}

export function manageableCourtIds(
  user: SessionUser | null,
  allCourts: Court[],
  assignments: { venue_id: string; admin_user_id: string }[] = [],
): string[] {
  if (!user) return [];
  if (user.role === "superadmin") {
    return allCourts.map((c) => c.id);
  }
  if (user.role === "admin") {
    const venueIds = venueIdsForAdmin(user.id, assignments);
    return allCourts
      .filter((c) => venueIds.has(c.venue_id))
      .map((c) => c.id);
  }
  return [];
}

export function canMutateCourt(
  user: SessionUser | null,
  court: Court,
  assignments: { venue_id: string; admin_user_id: string }[] = [],
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role === "admin") {
    const venueIds = venueIdsForAdmin(user.id, assignments);
    return venueIds.has(court.venue_id);
  }
  return false;
}

export function isCourtStaff(user: SessionUser | null): boolean {
  return user?.role === "admin" || user?.role === "superadmin";
}

export function isSuperadmin(user: SessionUser | null): boolean {
  return user?.role === "superadmin";
}

export function homePathForRole(role: SessionUser["role"] | undefined): string {
  switch (role) {
    case "admin":
      return "/admin/venues";
    case "superadmin":
      return "/superadmin";
    case "user":
    default:
      return "/dashboard";
  }
}

/** Venue court admins may flag reviews; platform superadmin handles moderation separately. */
export function canCourtVenueAdminFlagReview(
  user: SessionUser | null,
  court: Court,
): boolean {
  if (!user || user.role !== "admin") return false;
  return canMutateCourt(user, court);
}

export function canMutateVenue(
  user: SessionUser | null,
  venueId: string,
  assignments: { venue_id: string; admin_user_id: string }[] = [],
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role === "admin") {
    return venueIdsForAdmin(user.id, assignments).has(venueId);
  }
  return false;
}

/** Venue admins may flag venue-level reviews (same scope as managing courts at that venue). */
export function canVenueAdminFlagReview(
  user: SessionUser | null,
  venueId: string,
  assignments: { venue_id: string; admin_user_id: string }[] = [],
): boolean {
  if (!user || user.role !== "admin") return false;
  return canMutateVenue(user, venueId, assignments);
}

/** Roles that may access `/admin/*` (scoped data for admin, all data for superadmin). */
export const COURT_ADMIN_ROLES: SessionUser["role"][] = ["admin", "superadmin"];

/** Roles that may access `/superadmin`. */
export const SUPERADMIN_ROLES: SessionUser["role"][] = ["superadmin"];
