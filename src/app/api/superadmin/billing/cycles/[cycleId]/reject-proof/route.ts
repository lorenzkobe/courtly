import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getBillingCycleById,
  getVenueById,
  rejectBillingCycleProof,
} from "@/lib/data/courtly-db";
import { emitBillingProofRejectedToVenueAdmins } from "@/lib/notifications/emit-from-server";

type Ctx = { params: Promise<{ cycleId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { cycleId } = await ctx.params;
  const cycle = await getBillingCycleById(cycleId);
  if (!cycle) {
    return NextResponse.json({ error: "Billing cycle not found." }, { status: 404 });
  }
  if (cycle.status === "paid") {
    return NextResponse.json({ error: "Billing cycle is already paid." }, { status: 409 });
  }
  if (!cycle.payment_submitted_at) {
    return NextResponse.json({ error: "No payment proof has been submitted." }, { status: 422 });
  }

  const body = await req.json().catch(() => ({})) as { note?: string };
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  await rejectBillingCycleProof(cycleId, note, user.id);

  const venue = await getVenueById(cycle.venue_id).catch(() => null);
  const periodLabel = new Date(cycle.period_start + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
  });
  await emitBillingProofRejectedToVenueAdmins({
    venueId: cycle.venue_id,
    venueName: venue?.name ?? "Unknown venue",
    cycleId,
    period: periodLabel,
    note,
  });

  return NextResponse.json({ ok: true });
}
