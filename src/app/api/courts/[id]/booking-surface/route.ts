import { NextResponse } from "next/server";
import { effectiveFlatBookingFeePhp } from "@/lib/booking-fee-effective";
import {
  getCourtWithReviewSummary,
  getPlatformDefaultBookingFeeAmount,
  getVenueById,
  listBlockingBookingsByCourtOnDate,
  listCourtClosuresByCourt,
  listCourtReviewsByVenue,
  listCourtsByVenue,
  listVenueClosuresByVenue,
} from "@/lib/data/courtly-db";
import type {
  CourtAvailabilityForDate,
  CourtBookingSurfaceResponse,
} from "@/lib/types/courtly";

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

  const [siblingCourts, venueClosures, reviews, venue, defaultFee] = await Promise.all([
    listCourtsByVenue(court.venue_id),
    listVenueClosuresByVenue(court.venue_id, date),
    listCourtReviewsByVenue(court.venue_id),
    getVenueById(court.venue_id),
    getPlatformDefaultBookingFeeAmount(),
  ]);

  const courtIdsInVenue = new Set<string>([
    court.id,
    ...siblingCourts.map((sibling) => sibling.id),
  ]);
  const courtIdsList = Array.from(courtIdsInVenue);

  const perCourt = await Promise.all(
    courtIdsList.map(async (id) => {
      const [bookings, courtClosures] = await Promise.all([
        listBlockingBookingsByCourtOnDate(id, date),
        listCourtClosuresByCourt(id, date),
      ]);
      return [id, { bookings, court_closures: courtClosures }] as const;
    }),
  );

  const availability_by_court_id: Record<string, CourtAvailabilityForDate> = {};
  for (const [id, value] of perCourt) {
    availability_by_court_id[id] = value;
  }

  const flat_booking_fee = effectiveFlatBookingFeePhp(
    defaultFee,
    venue?.booking_fee_override,
  );

  const body: CourtBookingSurfaceResponse = {
    court,
    sibling_courts: siblingCourts.sort((a, b) => a.name.localeCompare(b.name)),
    flat_booking_fee,
    venue_closures: venueClosures,
    availability_by_court_id,
    reviews,
  };
  return NextResponse.json(body);
}
