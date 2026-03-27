import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canVenueAdminFlagReview } from "@/lib/auth/management";
import {
  listCourtReviews,
  listVenueAdminAssignments,
  listVenues,
  updateRow,
} from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ venueId: string; reviewId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId, reviewId } = await ctx.params;
  const [venues, assignments, reviews] = await Promise.all([
    listVenues(),
    listVenueAdminAssignments(),
    listCourtReviews(),
  ]);
  const venue = venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !user ||
    !canVenueAdminFlagReview(user, venueId, assignments)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const review = reviews.find((row) => row.id === reviewId && row.venue_id === venueId);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (review.user_id === user.id) {
    return NextResponse.json(
      { error: "You cannot flag your own review" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const updated = await updateRow("court_reviews", reviewId, {
    ...review,
    flagged: true,
    flagged_at: new Date().toISOString(),
    flagged_by_user_id: user.id,
    flag_reason: reason || null,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json(updated);
}
