import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { isHoldActive, retryCooldownActive } from "@/lib/bookings/payment-hold";
import { createPaymongoPaymentLink } from "@/lib/paymongo/client";
import { getPublicAppUrl } from "@/lib/supabase/app-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createPaymentTransactionAudit,
  getBookingById,
  listBookingsByGroupIdAdmin,
} from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ id: string }> };

function toCentavos(value: number): number {
  return Math.round(value * 100);
}

export async function POST(_: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const booking = await getBookingById(id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.status !== "pending_payment") {
    return NextResponse.json(
      { error: "Only pending bookings can retry payment." },
      { status: 409 },
    );
  }
  if (!isHoldActive(booking.hold_expires_at)) {
    return NextResponse.json({ error: "Payment hold expired." }, { status: 409 });
  }
  if (retryCooldownActive(booking.payment_link_created_at)) {
    return NextResponse.json(
      { error: "Please wait a few seconds before retrying." },
      { status: 429 },
    );
  }

  const groupId = booking.booking_group_id;
  const segmentRows = groupId ? await listBookingsByGroupIdAdmin(groupId) : [booking];
  const pendingRows = segmentRows.filter((row) => row.status === "pending_payment");
  if (pendingRows.length === 0) {
    return NextResponse.json({ error: "No pending booking to retry." }, { status: 409 });
  }
  const totalCost = pendingRows.reduce((sum, row) => sum + (row.total_cost ?? 0), 0);
  const appUrl = getPublicAppUrl();
  const link = await createPaymongoPaymentLink({
    amount: toCentavos(totalCost),
    description: `Courtly booking ${groupId ?? booking.id}`,
    metadata: {
      booking_group_id: groupId ?? "",
      booking_id: booking.id,
      user_id: user.id,
      user_email: user.email,
      retry: "true",
    },
    ...(appUrl
      ? {
          successUrl: `${appUrl}/courts/${booking.court_id}/book?payment=success&booking_id=${booking.id}`,
          failedUrl: `${appUrl}/courts/${booking.court_id}/book?payment=failed&booking_id=${booking.id}`,
        }
      : {}),
  });

  const nextAttemptCount =
    pendingRows.reduce((max, row) => Math.max(max, row.payment_attempt_count ?? 0), 0) + 1;
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("bookings")
    .update(
      {
        payment_link_id: link.id,
        payment_link_url: link.checkout_url,
        payment_link_created_at: new Date().toISOString(),
        payment_attempt_count: nextAttemptCount,
        payment_failed_at: null,
      } as never,
    )
    .eq("status", "pending_payment");
  query = groupId ? query.eq("booking_group_id", groupId) : query.eq("id", booking.id);
  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to refresh payment link." }, { status: 500 });
  }
  await createPaymentTransactionAudit({
    provider: "paymongo",
    booking_id: booking.id,
    booking_group_id: groupId ?? null,
    payment_link_id: link.id,
    amount: toCentavos(totalCost),
    currency: "PHP",
    trace_status: "pending",
    reconciled_by: "manual_reconcile",
    trace_note: "Payment link retried",
    provider_created_at: new Date().toISOString(),
  });
  return NextResponse.json({
    booking_id: booking.id,
    booking_group_id: groupId ?? booking.id,
    payment_link_url: link.checkout_url,
    hold_expires_at: booking.hold_expires_at,
  });
}
