import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { isSuperadmin } from "@/lib/auth/management";
import {
  listBookingsByIds,
  listCourtsByIds,
  listFlaggedCourtReviews,
  listVenuesByIds,
} from "@/lib/data/courtly-db";

export async function GET() {
  const user = await readSessionUser();
  if (!user || !isSuperadmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reviews = await listFlaggedCourtReviews();
  const bookingIds = [...new Set(reviews.map((review) => review.booking_id).filter(Boolean))];
  const bookings = await listBookingsByIds(bookingIds);
  const courtIds = [...new Set(bookings.map((booking) => booking.court_id).filter(Boolean))];
  const [courts, venues] = await Promise.all([
    listCourtsByIds(courtIds),
    listVenuesByIds([...new Set(reviews.map((review) => review.venue_id))]),
  ]);
  const flagged = reviews
    .map((review) => {
      const booking = bookings.find((row) => row.id === review.booking_id);
      const court = booking
        ? courts.find((row) => row.id === booking.court_id)
        : undefined;
      const venue = venues.find((row) => row.id === review.venue_id);
      return {
        ...review,
        court_name: court?.name ?? booking?.court_name ?? "Court",
        venue_name: venue?.name ?? review.venue_id,
      };
    })
    .sort((a, b) =>
      String(b.flagged_at ?? "").localeCompare(String(a.flagged_at ?? "")),
    );

  return NextResponse.json({ reviews: flagged });
}
