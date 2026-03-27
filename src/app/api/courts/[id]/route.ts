import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import { withVenueHydration } from "@/lib/court-response";
import type { Court } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function withReviewSummary(court: Court) {
  return withVenueHydration(court);
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
  if (!user || !canMutateCourt(user, court, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch = (await req.json()) as Partial<Court>;
  delete (patch as { review_summary?: unknown }).review_summary;
  if ("venue_id" in patch) {
    delete patch.venue_id;
  }
  mockDb.courts[idx] = {
    ...mockDb.courts[idx],
    ...(typeof patch.name === "string" && patch.name.trim()
      ? { name: patch.name.trim() }
      : {}),
    ...(patch.status === "active" || patch.status === "closed"
      ? { status: patch.status }
      : {}),
  };
  return NextResponse.json(withReviewSummary(mockDb.courts[idx]!));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const idx = mockDb.courts.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const court = mockDb.courts[idx];
  if (!user || !canMutateCourt(user, court, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hasActiveBookings = mockDb.bookings.some(
    (b) => b.court_id === court.id && b.status === "confirmed",
  );
  if (hasActiveBookings) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this court while it has active bookings. Cancel or complete those bookings first.",
      },
      { status: 409 },
    );
  }

  mockDb.courts.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
