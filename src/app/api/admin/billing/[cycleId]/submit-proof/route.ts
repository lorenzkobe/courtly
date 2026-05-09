import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getBillingCycleById,
  getVenueById,
  listVenueAdminAssignmentsByAdminUser,
  updateBillingCycleProof,
} from "@/lib/data/courtly-db";
import { emitBillingProofSubmittedToSuperadmins } from "@/lib/notifications/emit-from-server";
import { uploadPaymentProof } from "@/lib/supabase/storage";
import {
  PAYMENT_PROOF_CANONICAL_MIME_TYPE,
  PAYMENT_PROOF_FINAL_MAX_BYTES,
  PAYMENT_PROOF_MAX_LONG_EDGE_PX,
  PAYMENT_PROOF_MIN_SHORT_EDGE_PX,
} from "@/lib/payments/payment-proof-constraints";

type Ctx = { params: Promise<{ cycleId: string }> };

type SubmitProofBody = {
  payment_method: "gcash" | "maya";
  payment_proof_data_url: string;
  payment_proof_mime_type: string;
  payment_proof_bytes: number;
  payment_proof_width: number;
  payment_proof_height: number;
};

function parseBytesFromDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { cycleId } = await ctx.params;
  const cycle = await getBillingCycleById(cycleId);
  if (!cycle) {
    return NextResponse.json({ error: "Billing cycle not found." }, { status: 404 });
  }

  const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
  if (!assignments.some((a) => a.venue_id === cycle.venue_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (cycle.status === "paid") {
    return NextResponse.json({ error: "Billing cycle is already paid." }, { status: 409 });
  }

  const body = (await req.json()) as Partial<SubmitProofBody>;
  if (body.payment_method !== "gcash" && body.payment_method !== "maya") {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (typeof body.payment_proof_data_url !== "string" || !body.payment_proof_data_url) {
    return NextResponse.json({ error: "Payment proof image is required." }, { status: 400 });
  }
  if (
    typeof body.payment_proof_mime_type !== "string" ||
    body.payment_proof_mime_type !== PAYMENT_PROOF_CANONICAL_MIME_TYPE
  ) {
    return NextResponse.json({ error: "Payment proof must be a JPEG image." }, { status: 400 });
  }
  if (!body.payment_proof_data_url.startsWith("data:image/jpeg;base64,")) {
    return NextResponse.json({ error: "Invalid payment proof format." }, { status: 400 });
  }

  const width = Number(body.payment_proof_width);
  const height = Number(body.payment_proof_height);
  const declaredBytes = Number(body.payment_proof_bytes);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return NextResponse.json({ error: "Invalid payment proof dimensions." }, { status: 400 });
  }
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  if (shortEdge < PAYMENT_PROOF_MIN_SHORT_EDGE_PX || longEdge > PAYMENT_PROOF_MAX_LONG_EDGE_PX) {
    return NextResponse.json({ error: "Payment proof dimensions are out of bounds." }, { status: 400 });
  }
  const computedBytes = parseBytesFromDataUrl(body.payment_proof_data_url);
  const bytes = Math.max(declaredBytes || 0, computedBytes);
  if (bytes > PAYMENT_PROOF_FINAL_MAX_BYTES) {
    return NextResponse.json({ error: "Payment proof file is too large." }, { status: 400 });
  }

  const storagePath = `billing/${cycleId}/${Date.now()}.jpg`;
  await uploadPaymentProof(storagePath, body.payment_proof_data_url);

  await updateBillingCycleProof(cycleId, {
    payment_method: body.payment_method,
    payment_proof_url: storagePath,
    payment_proof_mime_type: PAYMENT_PROOF_CANONICAL_MIME_TYPE,
    payment_proof_bytes: bytes,
    payment_proof_width: width,
    payment_proof_height: height,
  });

  const venue = await getVenueById(cycle.venue_id).catch(() => null);
  const periodLabel = new Date(cycle.period_start + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
  });
  await emitBillingProofSubmittedToSuperadmins({
    venueId: cycle.venue_id,
    venueName: venue?.name ?? "Unknown venue",
    cycleId,
    period: periodLabel,
  });

  return NextResponse.json({ ok: true });
}
