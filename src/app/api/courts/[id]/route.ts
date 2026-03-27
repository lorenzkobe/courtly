import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import {
  deleteRow,
  listBookings,
  listCourtReviews,
  listCourts,
  listVenueAdminAssignments,
  listVenues,
  updateRow,
} from "@/lib/data/courtly-db";
import { withVenueHydration } from "@/lib/court-response";
import type { Court } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function withReviewSummary(court: Court) {
  return court;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [courts, venues, reviews] = await Promise.all([
    listCourts(),
    listVenues(),
    listCourtReviews(),
  ]);
  const court = courts.find((row) => row.id === id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(withVenueHydration(withReviewSummary(court), venues, reviews));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const [courts, assignments, venues, reviews] = await Promise.all([
    listCourts(),
    listVenueAdminAssignments(),
    listVenues(),
    listCourtReviews(),
  ]);
  const court = courts.find((row) => row.id === id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch = (await req.json()) as Partial<Court>;
  delete (patch as { review_summary?: unknown }).review_summary;
  if ("venue_id" in patch) {
    delete patch.venue_id;
  }
  const updated = await updateRow("courts", id, {
    ...(typeof patch.name === "string" && patch.name.trim()
      ? { name: patch.name.trim() }
      : {}),
    ...(patch.status ? { status: patch.status } : {}),
  });
  return NextResponse.json(
    withVenueHydration(withReviewSummary(updated as Court), venues, reviews),
  );
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const [courts, assignments, bookings] = await Promise.all([
    listCourts(),
    listVenueAdminAssignments(),
    listBookings(),
  ]);
  const court = courts.find((row) => row.id === id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hasActiveBookings = bookings.some(
    (booking) => booking.court_id === court.id && booking.status === "confirmed",
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

  await deleteRow("courts", court.id);
  return NextResponse.json({ ok: true });
}
