import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getOpenPlayById,
  submitOpenPlayJoinPaymentProof,
} from "@/lib/data/courtly-db";
import { emitOpenPlayPaymentSubmittedToHost } from "@/lib/notifications/emit-from-server";
import {
  PAYMENT_PROOF_CANONICAL_MIME_TYPE,
  PAYMENT_PROOF_FINAL_MAX_BYTES,
  PAYMENT_PROOF_MAX_LONG_EDGE_PX,
  PAYMENT_PROOF_MIN_SHORT_EDGE_PX,
} from "@/lib/payments/payment-proof-constraints";
import { assertOpenPlayAllowsSubmitProof } from "@/lib/open-play/lifecycle";
import { uploadPaymentProof } from "@/lib/supabase/storage";

type Ctx = { params: Promise<{ id: string }> };

type SubmitProofBody = {
  payment_method: "gcash" | "maya";
  payment_proof_data_url: string;
  payment_proof_mime_type: string;
  payment_proof_bytes: number;
  payment_proof_width: number;
  payment_proof_height: number;
  join_note?: string;
};

function parseBytesFromDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const session = await getOpenPlayById(id);
  if (!session) {
    return NextResponse.json({ error: "Open play not found" }, { status: 404 });
  }
  const proofGate = assertOpenPlayAllowsSubmitProof(session, Date.now());
  if (!proofGate.ok) {
    return NextResponse.json({ error: proofGate.message }, { status: 409 });
  }

  const body = (await req.json()) as Partial<SubmitProofBody>;
  if (body.payment_method !== "gcash" && body.payment_method !== "maya") {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (
    typeof body.payment_proof_data_url !== "string" ||
    !body.payment_proof_data_url.startsWith("data:image/jpeg;base64,")
  ) {
    return NextResponse.json({ error: "Payment proof JPEG is required." }, { status: 400 });
  }
  if (body.payment_proof_mime_type !== PAYMENT_PROOF_CANONICAL_MIME_TYPE) {
    return NextResponse.json({ error: "Payment proof must be a JPEG image." }, { status: 400 });
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

  const storagePath = `open-play/${id}/${Date.now()}.jpg`;
  const savedPath = await uploadPaymentProof(storagePath, body.payment_proof_data_url);

  const request = await submitOpenPlayJoinPaymentProof({
    sessionId: id,
    userId: user.id,
    paymentMethod: body.payment_method,
    paymentProofUrl: savedPath,
    paymentProofMimeType: PAYMENT_PROOF_CANONICAL_MIME_TYPE,
    paymentProofBytes: bytes,
    paymentProofWidth: width,
    paymentProofHeight: height,
    joinNote: body.join_note?.trim(),
  });
  if (!request) {
    return NextResponse.json(
      { error: "Payment lock expired or unavailable. Acquire a lock first." },
      { status: 409 },
    );
  }
  await emitOpenPlayPaymentSubmittedToHost({
    hostUserId: session.host_user_id,
    participantName: user.full_name || "A player",
    sessionId: id,
    sessionTitle: session.title,
  });
  return NextResponse.json({ request });
}
