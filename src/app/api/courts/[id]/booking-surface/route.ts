import { NextResponse } from "next/server";
import {
  getCourtWithReviewSummary,
  listBlockingBookingsByCourtOnDate,
  listCourtClosuresByCourt,
  listCourtReviewsByVenue,
  listCourtsByVenue,
  listVenueClosuresByVenue,
} from "@/lib/data/courtly-db";
import type { CourtBookingSurfaceResponse } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id: courtId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const court = await getCourtWithReviewSummary(courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [siblingCourts, bookings, courtClosures, venueClosures, reviews] =
    await Promise.all([
      listCourtsByVenue(court.venue_id),
      listBlockingBookingsByCourtOnDate(courtId, date),
      listCourtClosuresByCourt(courtId, date),
      listVenueClosuresByVenue(court.venue_id, date),
      listCourtReviewsByVenue(court.venue_id),
    ]);

  const body: CourtBookingSurfaceResponse = {
    court,
    sibling_courts: siblingCourts.sort((a, b) => a.name.localeCompare(b.name)),
    availability: {
      bookings,
      court_closures: courtClosures,
      venue_closures: venueClosures,
    },
    reviews,
  };
  return NextResponse.json(body);
}
