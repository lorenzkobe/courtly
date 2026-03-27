import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import { withVenueHydration } from "@/lib/court-response";
import type { Court, CourtSport, Venue } from "@/lib/types/courtly";

function venueById(venueId: string): Venue | undefined {
  return mockDb.venues.find((v) => v.id === venueId);
}

function hydrateCourt(court: Court): Court {
  return withVenueHydration(court);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const manageable = searchParams.get("manageable") === "true";
  const sport = searchParams.get("sport") as CourtSport | null;

  let list = [...mockDb.courts];

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ids = new Set(
      manageableCourtIds(user, list, mockDb.venueAdminAssignments),
    );
    list = list.filter((c) => ids.has(c.id));
  } else {
    // Public listings: only active courts under active venues are bookable.
    list = list.filter((c) => c.status === "active" && venueById(c.venue_id)?.status === "active");
  }

  if (status) {
    list = list.filter((c) => c.status === status);
  }

  if (sport) {
    list = list.filter((c) => venueById(c.venue_id)?.sport === sport);
  }

  return NextResponse.json(list.map(hydrateCourt));
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
  const venue = venueById(venue_id);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  const isAssigned = mockDb.venueAdminAssignments.some(
    (a) => a.admin_user_id === user.id && a.venue_id === venue_id,
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
  mockDb.courts.push(court);
  // TODO(notifications): emit placeholder event hook for "court created"
  // to superadmin recipients when Supabase notifications are wired.
  return NextResponse.json(hydrateCourt(court));
}
