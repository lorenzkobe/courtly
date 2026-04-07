import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getVenueById,
  insertRow,
  listCourtsDirectory,
  listReviewSummaryByVenueIds,
  listVenueAdminAssignmentsByAdminUser,
  listVenueAdminAssignmentsByVenue,
} from "@/lib/data/courtly-db";
import { emitCourtCreatedToSuperadmins } from "@/lib/notifications/emit-from-server";
import { pricingSpanFromRanges } from "@/lib/venue-price-ranges";
import type { Court, CourtSport } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const manageable = searchParams.get("manageable") === "true";
  const sportRaw = searchParams.get("sport");
  const sport = sportRaw ? (sportRaw as CourtSport) : undefined;

  let venueIdsForScope: string[] | undefined;
  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (user.role === "admin") {
      const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
      venueIdsForScope = assignments.map((row) => row.venue_id);
    }
  }

  const list = await listCourtsDirectory({
    status: (status as Court["status"] | null) ?? (manageable ? undefined : "active"),
    sport,
    venueStatus: manageable ? undefined : "active",
    venueIds: venueIdsForScope,
  });
  const summaries = await listReviewSummaryByVenueIds(
    [...new Set(list.map((court) => court.venue_id))],
  );
  return NextResponse.json(
    list.map((court) => ({
      ...court,
      review_summary:
        summaries.get(court.venue_id) ?? {
          average_rating: 0,
          review_count: 0,
        },
    })),
  );
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Court>;
  const venue_id =
    typeof body.venue_id === "string" ? body.venue_id.trim() : "";
  if (!venue_id) {
    return NextResponse.json(
      { error: "Venue is required when creating a court" },
      { status: 400 },
    );
  }
  const [venue, assignments] = await Promise.all([
    getVenueById(venue_id),
    listVenueAdminAssignmentsByVenue(venue_id),
  ]);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  const isAssigned = assignments.some(
    (assignment) =>
      assignment.admin_user_id === user.id && assignment.venue_id === venue_id,
  );
  if (!isAssigned) {
    return NextResponse.json(
      { error: "You can only create courts for your assigned venues" },
      { status: 403 },
    );
  }

  const windows = venue.hourly_rate_windows ?? [];
  const span = pricingSpanFromRanges(windows);
  const courtName =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New court";
  const court: Court = {
    id: "",
    venue_id,
    name: courtName,
    location: venue.location,
    sport: venue.sport,
    image_url: venue.image_url,
    hourly_rate_windows: windows,
    amenities: venue.amenities,
    available_hours: span ?? { open: "07:00", close: "22:00" },
    type: "indoor",
    surface: "sport_court",
    status: "active",
  };
  const inserted = (await insertRow("courts", {
    venue_id: court.venue_id,
    name: court.name,
    status: court.status,
    type: court.type,
    surface: court.surface,
  })) as { id: string };
  const persisted: Court = { ...court, id: inserted.id };
  void emitCourtCreatedToSuperadmins({
    courtId: inserted.id,
    courtName: court.name,
    venueName: venue.name,
  });
  return NextResponse.json({
    ...persisted,
    establishment_name: venue.name,
    contact_phone: venue.contact_phone,
    facebook_url: venue.facebook_url,
    instagram_url: venue.instagram_url,
    map_latitude: venue.map_latitude,
    map_longitude: venue.map_longitude,
    review_summary: { average_rating: 0, review_count: 0 },
  });
}
