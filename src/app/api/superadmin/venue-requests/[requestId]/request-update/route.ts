import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { getVenueRequestById, updateRow } from "@/lib/data/courtly-db";
import { emitVenueRequestDecisionToRequester } from "@/lib/notifications/emit-from-server";
import type { VenueRequest } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ requestId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { requestId } = await ctx.params;
  const current = await getVenueRequestById(requestId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (current.request_status !== "pending") {
    return NextResponse.json(
      { error: "Only pending requests can be marked for update." },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { review_note?: string };
  const reviewNote =
    typeof body.review_note === "string" ? body.review_note.trim() : "";
  if (!reviewNote) {
    return NextResponse.json(
      { error: "Please add a note describing the required updates." },
      { status: 400 },
    );
  }

  const updated = await updateRow<VenueRequest>("venue_requests", requestId, {
    request_status: "needs_update",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote,
    approved_venue_id: null,
  });
  void emitVenueRequestDecisionToRequester({
    userId: current.requested_by,
    requestId: current.id,
    venueName: current.name,
    decision: "needs_update",
    reviewNote,
  });
  return NextResponse.json(updated);
}
