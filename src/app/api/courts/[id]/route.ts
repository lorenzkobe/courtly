import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import {
  deleteRow,
  getCourtById,
  getCourtWithReviewSummary,
  hasActiveConfirmedBookingsForCourt,
  listVenueAdminAssignments,
  updateRow,
} from "@/lib/data/courtly-db";
import type { Court } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function withReviewSummary(court: Court) {
  return court;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const court = await getCourtWithReviewSummary(id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(withReviewSummary(court));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const [court, assignments] = await Promise.all([
    getCourtById(id),
    listVenueAdminAssignments(),
  ]);
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
  const hydrated = await getCourtWithReviewSummary((updated as { id: string }).id);
  return NextResponse.json(withReviewSummary((hydrated ?? updated) as Court));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const [court, assignments] = await Promise.all([
    getCourtById(id),
    listVenueAdminAssignments(),
  ]);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hasActiveBookings = await hasActiveConfirmedBookingsForCourt(court.id);
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
