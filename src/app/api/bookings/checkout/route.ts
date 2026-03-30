import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { holdExpiresAtFrom } from "@/lib/bookings/payment-hold";
import { splitBookingAmounts } from "@/lib/platform-fee";
import { createPaymongoPaymentLink } from "@/lib/paymongo/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  hasBlockingBookingConflictForCourt,
  listCourts,
  listVenues,
} from "@/lib/data/courtly-db";
import type { Booking, BookingCheckoutResponse } from "@/lib/types/courtly";

function toBookingPayloadList(body: unknown): Partial<Booking>[] {
  if (Array.isArray(body)) return body as Partial<Booking>[];
  if (body && typeof body === "object" && Array.isArray((body as { items?: unknown[] }).items)) {
    return (body as { items: Partial<Booking>[] }).items;
  }
  return [body as Partial<Booking>];
}

function toCentavos(value: number): number {
  return Math.round(value * 100);
}

export async function POST(req: Request) {
  const sessionUser = await readSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestBody = await req.json();
  const payloads = toBookingPayloadList(requestBody);
  if (payloads.length === 0) {
    return NextResponse.json({ error: "At least one booking is required." }, { status: 400 });
  }

  const [courts, venues] = await Promise.all([listCourts(), listVenues()]);
  const holdExpiresAt = holdExpiresAtFrom();
  const bookingGroupId = crypto.randomUUID();
  const rows: Array<Record<string, unknown>> = [];
  let totalCost = 0;

  for (const body of payloads) {
    const court = courts.find((row) => row.id === body.court_id);
    const venue = court ? venues.find((row) => row.id === court.venue_id) : null;
    if (!court || !venue) {
      return NextResponse.json({ error: "Court not found" }, { status: 404 });
    }
    if (court.status !== "active" || venue.status !== "active") {
      return NextResponse.json(
        { error: "This venue/court is inactive and cannot be booked." },
        { status: 409 },
      );
    }
    if (!body.date || !body.start_time || !body.end_time) {
      return NextResponse.json({ error: "Missing booking date/time." }, { status: 400 });
    }
    const hasConflict = await hasBlockingBookingConflictForCourt(
      court.id,
      body.date,
      body.start_time,
      body.end_time,
    );
    if (hasConflict) {
      return NextResponse.json(
        { error: "One or more selected times are no longer available." },
        { status: 409 },
      );
    }

    let courtSubtotal = body.court_subtotal;
    let bookingFee = body.booking_fee;
    let itemTotal = body.total_cost;
    const hasFullSplit =
      typeof courtSubtotal === "number" &&
      typeof bookingFee === "number" &&
      typeof itemTotal === "number";
    if (!hasFullSplit) {
      if (typeof courtSubtotal === "number") {
        const split = splitBookingAmounts(courtSubtotal, undefined);
        bookingFee = split.booking_fee;
        itemTotal = split.total_cost;
      } else if (typeof itemTotal === "number") {
        const subtotalFromTotal = Math.max(0, itemTotal);
        const split = splitBookingAmounts(subtotalFromTotal, undefined);
        courtSubtotal = split.court_subtotal;
        bookingFee = split.booking_fee;
        itemTotal = split.total_cost;
      } else {
        return NextResponse.json({ error: "Missing booking amount." }, { status: 400 });
      }
    }
    totalCost += Number(itemTotal ?? 0);
    rows.push({
      user_id: sessionUser.id,
      court_id: court.id,
      booking_group_id: bookingGroupId,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      player_name: body.player_name ?? sessionUser.full_name ?? sessionUser.email,
      player_email: body.player_email ?? sessionUser.email,
      players_count: body.players_count ?? null,
      court_subtotal: courtSubtotal ?? null,
      booking_fee: bookingFee ?? null,
      total_cost: itemTotal ?? null,
      status: "pending_payment",
      hold_expires_at: holdExpiresAt.toISOString(),
      notes: body.notes ?? null,
      payment_provider: "paymongo",
      payment_attempt_count: 1,
    });
  }

  const supabase = createSupabaseAdminClient();
  const { data: insertedRows, error: insertError } = await supabase
    .from("bookings")
    .insert(rows)
    .select("id, booking_group_id");
  if (insertError || !insertedRows || insertedRows.length === 0) {
    return NextResponse.json({ error: "Failed to create booking hold." }, { status: 500 });
  }
  const bookingId = (insertedRows[0] as { id: string }).id;
  const link = await createPaymongoPaymentLink({
    amount: toCentavos(totalCost),
    description: `Courtly booking ${bookingGroupId}`,
    metadata: {
      booking_group_id: bookingGroupId,
      booking_id: bookingId,
      user_id: sessionUser.id,
      user_email: sessionUser.email,
    },
  });
  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      payment_link_id: link.id,
      payment_link_url: link.checkout_url,
      payment_link_created_at: new Date().toISOString(),
    })
    .eq("booking_group_id", bookingGroupId);
  if (updateError) {
    return NextResponse.json({ error: "Failed to save payment link." }, { status: 500 });
  }

  const body: BookingCheckoutResponse = {
    booking_id: bookingId,
    booking_group_id: bookingGroupId,
    payment_link_url: link.checkout_url,
    hold_expires_at: holdExpiresAt.toISOString(),
  };
  return NextResponse.json(body);
}
