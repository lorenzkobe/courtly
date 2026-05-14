import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  createPaymentTransactionAudit,
  deleteExpiredPendingPaymentBookings,
  getBookingByIdAdmin,
  listBookingsByGroupIdAdmin,
} from "@/lib/data/courtly-db";
import { emitBookingCreatedToVenueAdmins } from "@/lib/notifications/emit-from-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uploadPaymentProof } from "@/lib/supabase/storage";
import { sendGuestBookingStatusUpdate } from "@/lib/email/email-service";
import {
  PAYMENT_PROOF_CANONICAL_MIME_TYPE,
  PAYMENT_PROOF_FINAL_MAX_BYTES,
  PAYMENT_PROOF_MAX_LONG_EDGE_PX,
  PAYMENT_PROOF_MIN_SHORT_EDGE_PX,
} from "@/lib/payments/payment-proof-constraints";

type Ctx = { params: Promise<{ id: string }> };

type SubmitProofBody = {
  player_email?: string;
  payment_method: "gcash" | "maya";
  payment_proof_data_url: string;
  payment_proof_mime_type: string;
  payment_proof_bytes: number;
  payment_proof_width: number;
  payment_proof_height: number;
};

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseBytesFromDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sessionUser = await readSessionUser();
  const body = (await req.json()) as Partial<SubmitProofBody>;

  const booking = await getBookingByIdAdmin(id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (sessionUser) {
    const ownerEmail = normalizeEmail(sessionUser.email);
    const bookingEmail = normalizeEmail(booking.player_email);
    const isOwner =
      (booking.user_id && booking.user_id === sessionUser.id) ||
      (!!ownerEmail && ownerEmail === bookingEmail);
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const callerEmail = normalizeEmail(body.player_email);
    if (!callerEmail) {
      return NextResponse.json({ error: "player_email is required." }, { status: 400 });
    }
    if (normalizeEmail(booking.player_email) !== callerEmail) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

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
    return NextResponse.json(
      { error: "Payment proof dimensions are out of bounds." },
      { status: 400 },
    );
  }
  const computedBytes = parseBytesFromDataUrl(body.payment_proof_data_url);
  const bytes = Math.max(declaredBytes || 0, computedBytes);
  if (bytes > PAYMENT_PROOF_FINAL_MAX_BYTES) {
    return NextResponse.json({ error: "Payment proof file is too large." }, { status: 400 });
  }

  const groupId = booking.booking_group_id ?? booking.id;
  const groupRows = booking.booking_group_id
    ? await listBookingsByGroupIdAdmin(booking.booking_group_id)
    : [booking];
  if (groupRows.length === 0) {
    return NextResponse.json({ error: "Booking group not found." }, { status: 404 });
  }
  const now = Date.now();
  const hasExpired = groupRows.some((row) => {
    if (row.status !== "pending_payment") return true;
    if (!row.hold_expires_at) return true;
    return new Date(row.hold_expires_at).getTime() <= now;
  });
  if (hasExpired) {
    await deleteExpiredPendingPaymentBookings({
      bookingGroupId: booking.booking_group_id ?? undefined,
      bookingId: booking.booking_group_id ? undefined : booking.id,
    });
    return NextResponse.json(
      { error: "Payment hold has expired. Please book again." },
      { status: 409 },
    );
  }

  const storagePath = `bookings/${id}/${Date.now()}.jpg`;
  const savedPath = await uploadPaymentProof(storagePath, body.payment_proof_data_url);

  const supabase = createSupabaseAdminClient();
  const updatePayload = {
    status: "pending_confirmation",
    payment_provider: "manual",
    payment_submitted_method: body.payment_method,
    payment_submitted_at: new Date().toISOString(),
    payment_proof_url: savedPath,
    payment_proof_mime_type: PAYMENT_PROOF_CANONICAL_MIME_TYPE,
    payment_proof_bytes: bytes,
    payment_proof_width: width,
    payment_proof_height: height,
  } as const;
  const query = supabase
    .from("bookings")
    .update(updatePayload as never)
    .eq("status", "pending_payment");
  const { error } = booking.booking_group_id
    ? await query.eq("booking_group_id", groupId)
    : await query.eq("id", booking.id);
  if (error) {
    return NextResponse.json({ error: "Could not submit payment proof." }, { status: 500 });
  }

  await createPaymentTransactionAudit({
    provider: "manual",
    booking_id: booking.id,
    booking_group_id: booking.booking_group_id ?? null,
    trace_status: "proof_submitted",
    reconciled_by: "manual_reconcile",
    trace_note: sessionUser
      ? "Player submitted manual payment proof."
      : "Guest submitted manual payment proof.",
    event_type: "manual.proof_submitted",
    source_type: body.payment_method,
  });

  const playerEmail = booking.player_email?.trim() || normalizeEmail(body.player_email);
  if (playerEmail) {
    const slots = groupRows.map((row) => ({
      date: row.date ?? undefined,
      startTime: row.start_time ?? undefined,
      endTime: row.end_time ?? undefined,
      courtName: row.court_name ?? undefined,
    }));
    void sendGuestBookingStatusUpdate({
      to: playerEmail,
      playerName: booking.player_name ?? "Guest",
      bookingNumber: booking.booking_number ?? "",
      status: "pending_confirmation",
      courtName: booking.court_name ?? "",
      venueName: booking.establishment_name ?? "",
      slots,
    });
  }

  const notifyByVenue = new Map<
    string,
    { venueName: string; courtNames: Set<string>; bookingId: string }
  >();
  for (const row of groupRows) {
    if (!row.venue_id) continue;
    const current = notifyByVenue.get(row.venue_id);
    if (current) {
      current.courtNames.add(row.court_name ?? "Court");
      continue;
    }
    notifyByVenue.set(row.venue_id, {
      venueName: row.establishment_name ?? "Venue",
      courtNames: new Set([row.court_name ?? "Court"]),
      bookingId: row.id,
    });
  }
  for (const [venueId, group] of notifyByVenue.entries()) {
    const names = [...group.courtNames];
    const bookingLabel =
      names.length <= 1 ? (names[0] ?? "Court") : `${names.length} slots`;
    void emitBookingCreatedToVenueAdmins({
      venueId,
      venueName: group.venueName,
      courtName: bookingLabel,
      bookingId: group.bookingId,
      bookerLabel: sessionUser
        ? (sessionUser.full_name?.trim() || sessionUser.email)
        : (booking.player_name ?? normalizeEmail(body.player_email)),
      bookerUserId: sessionUser?.id ?? "",
    });
  }

  return NextResponse.json({
    ok: true,
    status: "pending_confirmation",
    booking_number: booking.booking_number ?? "",
  });
}
