import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import {
  deleteRow,
  getCourtById,
  getCourtWithReviewSummary,
  hasAnyBookingsForCourt,
  listCourtsByVenue,
  listVenueAdminAssignmentsByVenue,
  updateRow,
} from "@/lib/data/courtly-db";
import type { Court } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function withReviewSummary(court: Court) {
  return court;
}

export async function GET(req: Request, ctx: Ctx) {
  const { searchParams } = new URL(req.url);
  const includeContext = searchParams.get("include_context") === "true";
  const { id } = await ctx.params;
  const court = await getCourtWithReviewSummary(id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!includeContext) {
    return NextResponse.json(withReviewSummary(court));
  }

  const siblingCourts = (await listCourtsByVenue(court.venue_id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({
    court: withReviewSummary(court),
    sibling_courts: siblingCourts,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const court = await getCourtById(id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const assignments = await listVenueAdminAssignmentsByVenue(court.venue_id);

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
  const hydrated = await getCourtWithReviewSummary((updated as { id: string }).id);
  return NextResponse.json(withReviewSummary((hydrated ?? updated) as Court));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const court = await getCourtById(id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const assignments = await listVenueAdminAssignmentsByVenue(court.venue_id);
  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hasBookings = await hasAnyBookingsForCourt(court.id);
  if (hasBookings) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this court while it has active bookings (pending, confirmed, or refund in progress). Mark the court inactive instead.",
      },
      { status: 409 },
    );
  }

  await deleteRow("courts", court.id);
  return NextResponse.json({ ok: true });
}
