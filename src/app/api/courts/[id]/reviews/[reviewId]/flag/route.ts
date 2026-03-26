import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canCourtVenueAdminFlagReview } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";

type Ctx = { params: Promise<{ id: string; reviewId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id: courtId, reviewId } = await ctx.params;
  const court = mockDb.courts.find((c) => c.id === courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canCourtVenueAdminFlagReview(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const idx = mockDb.courtReviews.findIndex(
    (r) => r.id === reviewId && r.court_id === courtId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const review = mockDb.courtReviews[idx]!;
  if (review.user_id === user.id) {
    return NextResponse.json(
      { error: "You cannot flag your own review" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  mockDb.courtReviews[idx] = {
    ...review,
    flagged: true,
    flagged_at: new Date().toISOString(),
    flagged_by_user_id: user.id,
    flag_reason: reason || undefined,
    updated_at: new Date().toISOString(),
  };
  // TODO(notifications): emit placeholder event hooks for "review under review"
  // (author) and "review flagged" (superadmin) when Supabase is wired.
  return NextResponse.json(mockDb.courtReviews[idx]);
}
