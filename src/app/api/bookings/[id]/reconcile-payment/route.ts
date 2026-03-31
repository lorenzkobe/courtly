import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { isHoldActive } from "@/lib/bookings/payment-hold";
import {
  createPaymentTransactionAudit,
  getBookingById,
  hasBlockingBookingConflictForCourt,
  listBookingsByGroupIdAdmin,
} from "@/lib/data/courtly-db";
import { retrievePaymongoLinkStatus } from "@/lib/paymongo/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Booking } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const booking = await getBookingById(id);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const isTimedOutCancelled =
    booking.status === "cancelled" && (booking.cancel_reason || "").toLowerCase() === "payment_timeout";
  if (booking.status !== "pending_payment" && !isTimedOutCancelled) {
    return NextResponse.json({ ok: true, status: booking.status });
  }
  if (!booking.payment_link_id) {
    return NextResponse.json({ ok: true, status: booking.status, reconciled: false });
  }

  const link = await retrievePaymongoLinkStatus({ linkId: booking.payment_link_id });
  const normalizedStatus = (link.status || "").toLowerCase();
  if (normalizedStatus !== "paid") {
    const holdActive = isHoldActive(booking.hold_expires_at);
    if (holdActive) {
      await createPaymentTransactionAudit({
        provider: "paymongo",
        booking_id: booking.id,
        booking_group_id: booking.booking_group_id ?? null,
        payment_link_id: booking.payment_link_id ?? null,
        trace_status: "pending",
        reconciled_by: "manual_reconcile",
        trace_note: "Manual reconcile checked: payment still pending",
      });
      return NextResponse.json({ ok: true, status: "pending_payment", paid: false, reconciled: false });
    }

    if (isTimedOutCancelled) {
      await createPaymentTransactionAudit({
        provider: "paymongo",
        booking_id: booking.id,
        booking_group_id: booking.booking_group_id ?? null,
        payment_link_id: booking.payment_link_id ?? null,
        trace_status: "failed",
        reconciled_by: "manual_reconcile",
        trace_note: "Manual reconcile checked: payment not paid after timeout",
      });
      return NextResponse.json({ ok: true, status: "cancelled", reconciled: true, paid: false });
    }

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("bookings")
      .update(
        {
          status: "cancelled",
          cancel_reason: "payment_timeout",
        } as never,
      )
      .eq("status", "pending_payment");
    query = booking.booking_group_id
      ? query.eq("booking_group_id", booking.booking_group_id)
      : query.eq("id", booking.id);
    await query;
    await createPaymentTransactionAudit({
      provider: "paymongo",
      booking_id: booking.id,
      booking_group_id: booking.booking_group_id ?? null,
      payment_link_id: booking.payment_link_id ?? null,
      trace_status: "failed",
      reconciled_by: "manual_reconcile",
      trace_note: "Manual reconcile set booking to payment_timeout",
    });

    return NextResponse.json({ ok: true, status: "cancelled", reconciled: true, paid: false });
  }

  const groupId = booking.booking_group_id;
  const related: Booking[] = groupId ? await listBookingsByGroupIdAdmin(groupId) : [booking];
  const candidates = related.filter(
    (row) => row.status === "pending_payment" || (row.status === "cancelled" && row.cancel_reason === "payment_timeout"),
  );
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, status: booking.status, reconciled: false });
  }

  const holdActive = isHoldActive(booking.hold_expires_at);
  if (!holdActive) {
    for (const row of candidates) {
      const hasConflict = await hasBlockingBookingConflictForCourt(
        row.court_id,
        row.date,
        row.start_time,
        row.end_time,
      );
      if (hasConflict) {
        const supabase = createSupabaseAdminClient();
        let query = supabase
          .from("bookings")
          .update(
            {
              status: "cancelled",
              cancel_reason: "payment_timeout",
              refund_required: true,
              payment_reference_id: link.paymentId ?? null,
            } as never,
          )
          .or("status.eq.pending_payment,and(status.eq.cancelled,cancel_reason.eq.payment_timeout)");
        query = groupId ? query.eq("booking_group_id", groupId) : query.eq("id", booking.id);
        await query;
        await createPaymentTransactionAudit({
          provider: "paymongo",
          booking_id: booking.id,
          booking_group_id: groupId ?? null,
          payment_link_id: booking.payment_link_id ?? null,
          provider_payment_id: link.paymentId ?? null,
          trace_status: "refund_required",
          reconciled_by: "manual_reconcile",
          trace_note: "Paid after timeout with conflict; refund required",
          paid_at: new Date().toISOString(),
        });
        return NextResponse.json({ ok: true, status: "cancelled", refund_required: true });
      }
    }
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("bookings")
    .update(
      {
        status: "confirmed",
        paid_at: new Date().toISOString(),
        payment_reference_id: link.paymentId ?? null,
        refund_required: false,
        cancel_reason: null,
      } as never,
    )
    .or("status.eq.pending_payment,and(status.eq.cancelled,cancel_reason.eq.payment_timeout)");
  query = groupId ? query.eq("booking_group_id", groupId) : query.eq("id", booking.id);
  await query;
  await createPaymentTransactionAudit({
    provider: "paymongo",
    booking_id: booking.id,
    booking_group_id: groupId ?? null,
    payment_link_id: booking.payment_link_id ?? null,
    provider_payment_id: link.paymentId ?? null,
    trace_status: "paid",
    reconciled_by: "manual_reconcile",
    trace_note: "Manual reconcile confirmed booking as paid",
    paid_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, status: "confirmed", reconciled: true });
}
