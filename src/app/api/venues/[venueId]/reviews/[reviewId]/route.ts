import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { isSuperadmin } from "@/lib/auth/management";
import { deleteRow, listCourtReviews, listVenues, updateRow } from "@/lib/data/courtly-db";
import {
  emitReviewDeletedByModerationToAuthor,
  emitReviewFlagCleared,
} from "@/lib/notifications/emit-from-server";
import type { CourtReview } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string; reviewId: string }> };
const REVIEW_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWithinReviewEditWindow(review: CourtReview, nowMs = Date.now()): boolean {
  const createdAtMs = Date.parse(review.created_at);
  if (Number.isNaN(createdAtMs)) return false;
  return nowMs - createdAtMs <= REVIEW_EDIT_WINDOW_MS;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { venueId, reviewId } = await ctx.params;
  const [venues, reviews] = await Promise.all([listVenues(), listCourtReviews()]);
  const venue = venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const review = reviews.find((row) => row.id === reviewId && row.venue_id === venueId);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as {
    rating?: number;
    comment?: string;
    clear_flag?: boolean;
  };

  if (isSuperadmin(user) && body.clear_flag === true) {
    const before = { ...review };
    const updated = await updateRow("court_reviews", reviewId, {
      ...review,
      flagged: false,
      flagged_at: null,
      flagged_by_user_id: null,
      flag_reason: null,
      updated_at: new Date().toISOString(),
    });
    void emitReviewFlagCleared({ review: before, venueName: venue.name });
    return NextResponse.json(updated);
  }

  if (isSuperadmin(user)) {
    return NextResponse.json(
      { error: "Superadmin may delete reviews or clear flags only" },
      { status: 403 },
    );
  }

  if (review.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isWithinReviewEditWindow(review)) {
    return NextResponse.json(
      { error: "You can only edit your review within 24 hours of posting." },
      { status: 403 },
    );
  }

  const rating =
    body.rating !== undefined ? body.rating : review.rating;
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
  }

  const comment =
    body.comment !== undefined
      ? typeof body.comment === "string"
        ? body.comment.trim() || undefined
        : review.comment
      : review.comment;

  const updated = await updateRow("court_reviews", reviewId, {
    ...review,
    rating: rating as CourtReview["rating"],
    comment,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { venueId, reviewId } = await ctx.params;
  const [venues, reviews] = await Promise.all([listVenues(), listCourtReviews()]);
  const venue = venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const review = reviews.find((row) => row.id === reviewId && row.venue_id === venueId);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isAuthor = review.user_id === user.id;
  const isPlatform = isSuperadmin(user);

  if (!isAuthor && !isPlatform) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isAuthor && !isWithinReviewEditWindow(review)) {
    return NextResponse.json(
      { error: "You can only delete your review within 24 hours of posting." },
      { status: 403 },
    );
  }

  await deleteRow("court_reviews", reviewId);
  if (isPlatform && !isAuthor) {
    void emitReviewDeletedByModerationToAuthor({
      review: { id: review.id, user_id: review.user_id },
      venueName: venue.name,
      reason: review.flag_reason ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}
