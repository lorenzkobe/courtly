import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  insertRow,
  listBookings,
  listCourtReviews,
  listCourts,
  listVenues,
} from "@/lib/data/courtly-db";
import { withVenueHydration } from "@/lib/court-response";
import type { CourtReview } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const [venues, courts, reviews] = await Promise.all([
    listVenues(),
    listCourts(),
    listCourtReviews(),
  ]);
  const venue = venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const courtsAtVenue = courts.filter((court) => court.venue_id === venueId);
  const displayCourt = courtsAtVenue[0];
  if (!displayCourt) {
    return NextResponse.json({
      court: null,
      reviews: [] as CourtReview[],
    });
  }

  const list = reviews
    .filter((review) => review.venue_id === venueId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  return NextResponse.json({
    court: withVenueHydration(displayCourt, venues, reviews),
    reviews: list,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { venueId } = await ctx.params;
  const [venues, bookings, courts, reviews] = await Promise.all([
    listVenues(),
    listBookings(),
    listCourts(),
    listCourtReviews(),
  ]);
  const venue = venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    booking_id?: string;
    rating?: number;
    comment?: string;
  };
  const bookingId = typeof body.booking_id === "string" ? body.booking_id.trim() : "";
  const rating = body.rating;
  const comment =
    typeof body.comment === "string" ? body.comment.trim() : "";

  if (!bookingId) {
    return NextResponse.json({ error: "booking_id required" }, { status: 400 });
  }
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
  }

  const booking = bookings.find((row) => row.id === bookingId);
  const bookingCourt = booking
    ? courts.find((row) => row.id === booking.court_id)
    : undefined;
  if (!booking || !bookingCourt || bookingCourt.venue_id !== venueId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status !== "completed") {
    return NextResponse.json(
      { error: "You can only review completed visits" },
      { status: 400 },
    );
  }
  const email = user.email.toLowerCase();
  const playerEmail = (booking.player_email ?? "").toLowerCase();
  if (!playerEmail || playerEmail !== email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (reviews.some((review) => review.booking_id === bookingId)) {
    return NextResponse.json(
      { error: "This booking already has a review" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const row = {
    venue_id: venueId,
    user_id: user.id,
    user_name: user.full_name?.trim() || user.email,
    booking_id: bookingId,
    rating: rating as CourtReview["rating"],
    comment: comment || null,
  };
  const inserted = await insertRow("court_reviews", row);
  return NextResponse.json({ ...(inserted as CourtReview), created_at: now, updated_at: now });
}
