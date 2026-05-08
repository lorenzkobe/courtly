import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { generateBookingNumber } from "@/lib/bookings/booking-number";
import { holdExpiresAtFrom } from "@/lib/bookings/payment-hold";
import { splitBookingAmounts, bookingFeeForCourt } from "@/lib/platform-fee";
import { hourFromTime } from "@/lib/booking-range";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getPlatformDefaultBookingFeeAmount,
  hasBlockingBookingConflictForCourt,
  listCourts,
  listVenues,
} from "@/lib/data/courtly-db";
import type { Booking, BookingCheckoutResponse } from "@/lib/types/courtly";
import { venuePaymentMethodsForCheckout } from "@/lib/venue-payment-methods";

function toBookingPayloadList(body: unknown): Partial<Booking>[] {
  if (Array.isArray(body)) return body as Partial<Booking>[];
  if (body && typeof body === "object" && Array.isArray((body as { items?: unknown[] }).items)) {
    return (body as { items: Partial<Booking>[] }).items;
  }
  return [body as Partial<Booking>];
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

  const [courts, venues, defaultFeeSetting] = await Promise.all([
    listCourts(),
    listVenues(),
    getPlatformDefaultBookingFeeAmount(),
  ]);
  const holdExpiresAt = holdExpiresAtFrom();
  const bookingGroupId = crypto.randomUUID();
  let bookingNumber = generateBookingNumber(payloads[0]?.date ?? null);
  const rows: Array<Record<string, unknown>> = [];
  let checkoutPaymentMethods: BookingCheckoutResponse["payment_methods"] = [];
  let totalDue = 0;

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
    const methods = venuePaymentMethodsForCheckout(venue);
    if (methods.length === 0) {
      return NextResponse.json(
        { error: "This venue has no enabled payment methods yet." },
        { status: 409 },
      );
    }
    if (checkoutPaymentMethods.length === 0) {
      checkoutPaymentMethods = methods;
    }

    let courtSubtotal = body.court_subtotal;
    let bookingFee = body.booking_fee;
    let itemTotal = body.total_cost;
    const venueOverride = Number(
      (venue as { booking_fee_override?: unknown }).booking_fee_override ?? Number.NaN,
    );
    const bookingFeeForVenue = Number.isFinite(venueOverride)
      ? venueOverride
      : defaultFeeSetting;
    const hasFullSplit =
      typeof courtSubtotal === "number" &&
      typeof bookingFee === "number" &&
      typeof itemTotal === "number";
    if (!hasFullSplit) {
      const numHours = Math.max(1,
        hourFromTime(body.end_time) - hourFromTime(body.start_time)
      );
      if (typeof courtSubtotal === "number") {
        const split = splitBookingAmounts(courtSubtotal, bookingFeeForVenue, numHours);
        bookingFee = split.booking_fee;
        itemTotal = split.total_cost;
      } else if (typeof itemTotal === "number") {
        const feeRate = bookingFeeForCourt(bookingFeeForVenue);
        const subtotalFromTotal = Math.max(0, itemTotal - feeRate * numHours);
        const split = splitBookingAmounts(subtotalFromTotal, bookingFeeForVenue, numHours);
        courtSubtotal = split.court_subtotal;
        bookingFee = split.booking_fee;
        itemTotal = split.total_cost;
      } else {
        return NextResponse.json({ error: "Missing booking amount." }, { status: 400 });
      }
    }
    rows.push({
      user_id: sessionUser.id,
      booking_number: bookingNumber,
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
      payment_provider: "manual",
      payment_attempt_count: 1,
    });
    totalDue += Number(itemTotal ?? 0);
  }

  const supabase = createSupabaseAdminClient();
  let insertedRows: Array<{ id: string; booking_group_id: string }> | null = null;
  let inserted = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const tryRows =
      attempt === 0
        ? rows
        : rows.map((row) => ({ ...row, booking_number: generateBookingNumber(payloads[0]?.date ?? null) }));
    const { data, error } = await supabase
      .from("bookings")
      .insert(tryRows as never[])
      .select("id, booking_group_id");
    if (!error && data && data.length > 0) {
      insertedRows = data as Array<{ id: string; booking_group_id: string }>;
      bookingNumber = String((tryRows[0] as { booking_number?: string }).booking_number ?? bookingNumber);
      inserted = true;
      break;
    }
    if (error?.code !== "23505") {
      break;
    }
  }
  if (!inserted || !insertedRows || insertedRows.length === 0) {
    return NextResponse.json({ error: "Failed to create booking hold." }, { status: 500 });
  }

  const bookingId = (insertedRows[0] as { id: string }).id;

  const body: BookingCheckoutResponse = {
    booking_id: bookingId,
    booking_group_id: bookingGroupId,
    hold_expires_at: holdExpiresAt.toISOString(),
    total_due: totalDue,
    payment_methods: checkoutPaymentMethods,
  };

  return NextResponse.json(body);
}
