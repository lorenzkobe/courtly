import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { deleteRow, getVenueRequestById } from "@/lib/data/courtly-db";
import { emitVenueRequestDecisionToRequester } from "@/lib/notifications/emit-from-server";
import { deleteVenuePhotos } from "@/lib/supabase/storage";

type Ctx = { params: Promise<{ requestId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  void req;
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
      { error: "Only pending requests can be rejected." },
      { status: 409 },
    );
  }
  if (current.photo_urls?.length) {
    void deleteVenuePhotos(current.photo_urls);
  }
  await deleteRow("venue_requests", requestId);
  void emitVenueRequestDecisionToRequester({
    userId: current.requested_by,
    requestId: current.id,
    venueName: current.name,
    decision: "rejected",
  });
  return NextResponse.json({ ok: true });
}
