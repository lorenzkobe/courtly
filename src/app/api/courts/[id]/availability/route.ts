import { NextResponse } from "next/server";
import {
  getCourtById,
  listBlockingBookingsByCourtOnDate,
  listCourtClosuresByCourt,
  listVenueClosuresByVenue,
} from "@/lib/data/courtly-db";
import type { CourtDayAvailability } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id: courtId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const court = await getCourtById(courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [bookings, courtClosures, venueClosures] = await Promise.all([
    listBlockingBookingsByCourtOnDate(courtId, date),
    listCourtClosuresByCourt(courtId, date),
    court.venue_id ? listVenueClosuresByVenue(court.venue_id, date) : Promise.resolve([]),
  ]);

  const body: CourtDayAvailability = {
    bookings,
    court_closures: courtClosures,
    venue_closures: venueClosures,
  };
  return NextResponse.json(body);
}
