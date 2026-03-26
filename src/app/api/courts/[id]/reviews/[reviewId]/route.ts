import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { isSuperadmin } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { CourtReview } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string; reviewId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courtId, reviewId } = await ctx.params;
  const idx = mockDb.courtReviews.findIndex(
    (r) => r.id === reviewId && r.court_id === courtId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const review = mockDb.courtReviews[idx]!;
  const body = (await req.json()) as {
    rating?: number;
    comment?: string;
    clear_flag?: boolean;
  };

  if (isSuperadmin(user) && body.clear_flag === true) {
    mockDb.courtReviews[idx] = {
      ...review,
      flagged: false,
      flagged_at: undefined,
      flagged_by_user_id: undefined,
      flag_reason: undefined,
      updated_at: new Date().toISOString(),
    };
    // TODO(notifications): emit placeholder moderation feedback hook for flagger
    // when Supabase notifications are wired.
    return NextResponse.json(mockDb.courtReviews[idx]);
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

  mockDb.courtReviews[idx] = {
    ...review,
    rating: rating as CourtReview["rating"],
    comment,
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(mockDb.courtReviews[idx]);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courtId, reviewId } = await ctx.params;
  const idx = mockDb.courtReviews.findIndex(
    (r) => r.id === reviewId && r.court_id === courtId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const review = mockDb.courtReviews[idx]!;
  const isAuthor = review.user_id === user.id;
  const isPlatform = isSuperadmin(user);

  if (!isAuthor && !isPlatform) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  mockDb.courtReviews.splice(idx, 1);
  // TODO(notifications): emit placeholder moderation feedback hook for flagger
  // when Supabase notifications are wired.
  return NextResponse.json({ ok: true });
}
