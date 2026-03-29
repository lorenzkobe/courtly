import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import type { AdminAssignedVenueSummary } from "@/lib/api/courtly-client";
import {
  listCourts,
  listVenueAdminAssignments,
  listVenues,
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

  const [venues, assignments, courts] = await Promise.all([
    listVenues(),
    listVenueAdminAssignments(),
    listCourts(),
  ]);

  const assignedVenueIds = new Set(
    assignments
      .filter((row) => row.admin_user_id === user.id)
      .map((row) => row.venue_id),
  );

  const countsByVenue = new Map<string, number>();
  for (const court of courts) {
    countsByVenue.set(
      court.venue_id,
      (countsByVenue.get(court.venue_id) ?? 0) + 1,
    );
  }

  const payload: AdminAssignedVenueSummary[] = venues
    .filter((venue) => assignedVenueIds.has(venue.id))
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      location: venue.location,
      image_url: venue.image_url,
      court_count: countsByVenue.get(venue.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(payload);
}
