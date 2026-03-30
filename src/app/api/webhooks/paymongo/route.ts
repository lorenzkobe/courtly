import { NextResponse } from "next/server";
import { isHoldActive } from "@/lib/bookings/payment-hold";
import {
  getBookingByIdAdmin,
  getBookingByPaymentLinkIdAdmin,
  hasBlockingBookingConflictForCourt,
  listBookingsByGroupIdAdmin,
  markPaymentWebhookEventProcessed,
} from "@/lib/data/courtly-db";
import { emitBookingCreatedToVenueAdmins } from "@/lib/notifications/emit-from-server";
import {
  createPaymongoRefund,
  parsePaymongoWebhookEvent,
  verifyPaymongoWebhookSignature,
} from "@/lib/paymongo/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Booking } from "@/lib/types/courtly";

function isPaymentSuccessType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes("paid") || t.includes("succeeded") || t.includes("success");
}

function isPaymentFailureType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes("failed") || t.includes("expired") || t.includes("cancelled");
}

function extractString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findFirstStringDeep(input: unknown, keyName: string): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (keyName in record) {
    return extractString(record[keyName]);
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findFirstStringDeep(item, keyName);
        if (found) return found;
      }
      continue;
    }
    const found = findFirstStringDeep(value, keyName);
    if (found) return found;
  }
  return null;
}

function findFirstNumberDeep(input: unknown, keyName: string): number | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (keyName in record && typeof record[keyName] === "number") {
    return record[keyName] as number;
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findFirstNumberDeep(item, keyName);
        if (found != null) return found;
      }
      continue;
    }
    const found = findFirstNumberDeep(value, keyName);
    if (found != null) return found;
  }
  return null;
}

async function findRelatedBookings(
  eventAttributes: Record<string, unknown> | undefined,
): Promise<Booking[]> {
  const bookingGroupId = findFirstStringDeep(eventAttributes, "booking_group_id");
  if (bookingGroupId) {
    const rows = await listBookingsByGroupIdAdmin(bookingGroupId);
    if (rows.length > 0) return rows;
  }
  const paymentLinkId =
    findFirstStringDeep(eventAttributes, "payment_link_id") ||
    findFirstStringDeep(eventAttributes, "link_id");
  if (paymentLinkId) {
    const row = await getBookingByPaymentLinkIdAdmin(paymentLinkId);
    if (!row) return [];
    if (row.booking_group_id) {
      const rows = await listBookingsByGroupIdAdmin(row.booking_group_id);
      if (rows.length > 0) return rows;
    }
    return [row];
  }
  const bookingId = findFirstStringDeep(eventAttributes, "booking_id");
  if (!bookingId) return [];
  const fallback = await getBookingByIdAdmin(bookingId);
  return fallback ? [fallback] : [];
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("paymongo-signature");
  if (!verifyPaymongoWebhookSignature({ rawBody, signatureHeader: signature })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = parsePaymongoWebhookEvent(rawBody);
  const firstProcess = await markPaymentWebhookEventProcessed({
    provider: "paymongo",
    providerEventId: event.id,
    eventType: event.type,
    payload: event.raw,
  });
  if (!firstProcess) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  const bookings = await findRelatedBookings(event.attributes);
  if (bookings.length === 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const pending = bookings.filter((row) => row.status === "pending_payment");
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, already_processed: true });
  }

  const nowIso = new Date().toISOString();
  const paymentReferenceId =
    findFirstStringDeep(event.attributes, "payment_id") ||
    findFirstStringDeep(event.attributes, "id");
  const paymentAmount = findFirstNumberDeep(event.attributes, "amount");
  const groupId = pending[0]?.booking_group_id ?? null;
  const supabase = createSupabaseAdminClient();

  if (isPaymentFailureType(event.type)) {
    let failureQuery = supabase
      .from("bookings")
      .update({ payment_failed_at: nowIso })
      .eq("status", "pending_payment");
    failureQuery = groupId
      ? failureQuery.eq("booking_group_id", groupId)
      : failureQuery.eq("id", pending[0]!.id);
    await failureQuery;
    return NextResponse.json({ ok: true });
  }

  if (!isPaymentSuccessType(event.type)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const holdActive = isHoldActive(pending[0]?.hold_expires_at);
  if (!holdActive) {
    let conflict = false;
    for (const row of pending) {
      const hasConflict = await hasBlockingBookingConflictForCourt(
        row.court_id,
        row.date,
        row.start_time,
        row.end_time,
      );
      if (hasConflict) {
        conflict = true;
        break;
      }
    }
    if (conflict) {
      let refundSucceeded = false;
      const paymongoPaymentId = paymentReferenceId;
      if (paymongoPaymentId && typeof paymentAmount === "number" && paymentAmount > 0) {
        try {
          await createPaymongoRefund({
            paymentId: paymongoPaymentId,
            amount: paymentAmount,
            reason: "requested_by_customer",
            metadata: { booking_group_id: groupId ?? "" },
          });
          refundSucceeded = true;
        } catch {
          refundSucceeded = false;
        }
      }
      let refundQuery = supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancel_reason: "payment_timeout",
          refund_required: !refundSucceeded,
          refund_attempted_at: nowIso,
          refunded_at: refundSucceeded ? nowIso : null,
          payment_reference_id: paymentReferenceId,
        })
        .eq("status", "pending_payment");
      refundQuery = groupId
        ? refundQuery.eq("booking_group_id", groupId)
        : refundQuery.eq("id", pending[0]!.id);
      await refundQuery;
      return NextResponse.json({ ok: true, refunded: refundSucceeded });
    }
  }

  let confirmQuery = supabase
    .from("bookings")
    .update({
      status: "confirmed",
      paid_at: nowIso,
      payment_reference_id: paymentReferenceId,
      refund_required: false,
      cancel_reason: null,
    })
    .eq("status", "pending_payment");
  confirmQuery = groupId
    ? confirmQuery.eq("booking_group_id", groupId)
    : confirmQuery.eq("id", pending[0]!.id);
  const { data: confirmedRows } = await confirmQuery.select("id");

  for (const row of pending) {
    const wasUpdated = (confirmedRows ?? []).some((item) => (item as { id: string }).id === row.id);
    if (!wasUpdated) continue;
    if (!row.venue_id) continue;
    void emitBookingCreatedToVenueAdmins({
      venueId: row.venue_id,
      venueName: row.establishment_name ?? "Venue",
      courtName: row.court_name ?? "Court",
      bookingId: row.id,
      bookerLabel: row.player_name?.trim() || row.player_email || "Player",
      bookerUserId: row.user_id ?? "",
    });
  }

  return NextResponse.json({ ok: true, confirmed: (confirmedRows ?? []).length });
}
