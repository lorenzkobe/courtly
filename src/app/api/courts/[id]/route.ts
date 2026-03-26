import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import { normalizeBookingFee } from "@/lib/platform-fee";
import { reviewSummaryForCourt } from "@/lib/review-summary";
import type { Court } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function withReviewSummary(court: Court) {
  return {
    ...court,
    establishment_name: court.court_account_id
      ? mockDb.courtAccounts.find((a) => a.id === court.court_account_id)?.name
      : undefined,
    review_summary: reviewSummaryForCourt(court.id, mockDb.courtReviews),
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const court = mockDb.courts.find((c) => c.id === id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(withReviewSummary(court));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const idx = mockDb.courts.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const court = mockDb.courts[idx];
  if (!user || !canMutateCourt(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch = (await req.json()) as Partial<Court>;
  delete (patch as { review_summary?: unknown }).review_summary;
  if (user.role !== "superadmin" && "managed_by_user_id" in patch) {
    delete patch.managed_by_user_id;
  }
  if (user.role !== "superadmin" && "court_account_id" in patch) {
    delete patch.court_account_id;
  }
  if (user.role !== "superadmin" && "booking_fee" in patch) {
    delete patch.booking_fee;
  }
  if (user.role === "superadmin" && "booking_fee" in patch) {
    patch.booking_fee = normalizeBookingFee(patch.booking_fee);
  }

  mockDb.courts[idx] = { ...mockDb.courts[idx], ...patch };
  return NextResponse.json(withReviewSummary(mockDb.courts[idx]!));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const idx = mockDb.courts.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const court = mockDb.courts[idx];
  if (!user || !canMutateCourt(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  mockDb.courts.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
