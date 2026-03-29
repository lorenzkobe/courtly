import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import {
  insertRow,
  listCourtReviews,
  listCourts,
  listVenueAdminAssignments,
  listVenues,
} from "@/lib/data/courtly-db";
import { emitCourtCreatedToSuperadmins } from "@/lib/notifications/emit-from-server";
import { withVenueHydration } from "@/lib/court-response";
import { pricingSpanFromRanges } from "@/lib/venue-price-ranges";
import type { Court, CourtSport } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const manageable = searchParams.get("manageable") === "true";
  const sport = searchParams.get("sport") as CourtSport | null;

  const [allCourts, venues, assignments, reviews] = await Promise.all([
    listCourts(),
    listVenues(),
    listVenueAdminAssignments(),
    listCourtReviews(),
  ]);
  let list = [...allCourts];

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ids = new Set(
      manageableCourtIds(user, list, assignments),
    );
    list = list.filter((court) => ids.has(court.id));
  } else {
    // Public listings: only active courts under active venues are bookable.
    list = list.filter(
      (court) =>
        court.status === "active" &&
        venues.find((venue) => venue.id === court.venue_id)?.status === "active",
    );
  }

  if (status) {
    list = list.filter((court) => court.status === status);
  }

  if (sport) {
    list = list.filter(
      (court) => venues.find((venue) => venue.id === court.venue_id)?.sport === sport,
    );
  }

  return NextResponse.json(
    list.map((court) => withVenueHydration(court, venues, reviews)),
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
  const [venues, assignments, reviews] = await Promise.all([
    listVenues(),
    listVenueAdminAssignments(),
    listCourtReviews(),
  ]);
  const venue = venues.find((row) => row.id === venue_id);
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
  return NextResponse.json(withVenueHydration(persisted, venues, reviews));
}
