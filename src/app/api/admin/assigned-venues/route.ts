import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import type { AdminAssignedVenueSummary } from "@/lib/api/courtly-client";
import {
  listCourtsDirectory,
  listVenueAdminAssignmentsByAdminUser,
  listVenuesByIds,
} from "@/lib/data/courtly-db";

/**
 * Venues the current court admin is assigned to, including those with zero courts.
 * (My venues was previously derived only from manageable courts, so empty venues disappeared.)
 */
export async function GET() {
  const user = await readSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
  const assignedVenueIds = [...new Set(assignments.map((row) => row.venue_id))];
  const [venues, courts] = await Promise.all([
    listVenuesByIds(assignedVenueIds),
    listCourtsDirectory({ venueIds: assignedVenueIds }),
  ]);
  const countsByVenue = new Map<string, number>();
  for (const court of courts) {
    countsByVenue.set(court.venue_id, (countsByVenue.get(court.venue_id) ?? 0) + 1);
  }

  const payload: AdminAssignedVenueSummary[] = venues
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      location: venue.location,
      image_url: venue.photo_urls?.[0] ?? "",
      court_count: countsByVenue.get(venue.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(payload);
}
