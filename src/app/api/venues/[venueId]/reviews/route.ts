import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getVenueById,
  getBookingById,
  getReviewByUserForVenue,
  insertRow,
  listCourtReviewsByVenue,
  listCourtsByVenue,
  updateRow,
} from "@/lib/data/courtly-db";
import { emitReviewCreatedToVenueAdmins } from "@/lib/notifications/emit-from-server";
import { reviewSummaryForVenue } from "@/lib/review-summary";
import type { CourtReview } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const [venue, courtsAtVenue, reviews] = await Promise.all([
    getVenueById(venueId),
    listCourtsByVenue(venueId),
    listCourtReviewsByVenue(venueId),
  ]);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const displayCourt = courtsAtVenue[0];
  if (!displayCourt) {
    return NextResponse.json({
      court: null,
      reviews: [] as CourtReview[],
    });
  }

  const list = [...reviews].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );

  return NextResponse.json({
    court: {
      ...displayCourt,
      review_summary: reviewSummaryForVenue(venueId, reviews),
    },
    reviews: list,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { venueId } = await ctx.params;
  const venue = await getVenueById(venueId);
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

  const booking = await getBookingById(bookingId);
  if (!booking || booking.venue_id !== venueId) {
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

  const now = new Date().toISOString();
  const existingReview = await getReviewByUserForVenue(user.id, venueId);
  if (existingReview) {
    const updated = (await updateRow("court_reviews", existingReview.id, {
      ...existingReview,
      booking_id: bookingId,
      rating: rating as CourtReview["rating"],
      comment: comment || null,
      updated_at: now,
    })) as CourtReview;
    return NextResponse.json({
      ...updated,
      created_at: existingReview.created_at,
      updated_at: now,
    });
  }

  const row = {
    venue_id: venueId,
    user_id: user.id,
    user_name: user.full_name?.trim() || user.email,
    booking_id: bookingId,
    rating: rating as CourtReview["rating"],
    comment: comment || null,
  };
  const inserted = (await insertRow("court_reviews", row)) as CourtReview;
  void emitReviewCreatedToVenueAdmins({
    venueId,
    venueName: venue.name,
    reviewId: inserted.id,
    reviewerLabel: user.full_name?.trim() || user.email,
    rating,
  });
  return NextResponse.json({ ...inserted, created_at: now, updated_at: now });
}
