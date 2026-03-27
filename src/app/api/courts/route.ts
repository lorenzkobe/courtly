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
import { withVenueHydration } from "@/lib/court-response";
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
  const id = `court-${crypto.randomUUID().slice(0, 8)}`;
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

  const court: Court = {
    id,
    venue_id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New court",
    location: venue.location,
    sport: venue.sport,
    image_url: venue.image_url,
    hourly_rate: venue.hourly_rate,
    hourly_rate_windows: venue.hourly_rate_windows ?? [],
    amenities: venue.amenities,
    available_hours: { open: venue.opens_at, close: venue.closes_at },
    type: "indoor",
    surface: "sport_court",
    status: "active",
  };
  await insertRow("courts", {
    venue_id: court.venue_id,
    name: court.name,
    status: court.status,
    type: court.type,
    surface: court.surface,
  });
  // TODO(notifications): emit placeholder event hook for "court created"
  // to superadmin recipients when Supabase notifications are wired.
  return NextResponse.json(withVenueHydration(court, venues, reviews));
}
