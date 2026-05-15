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
import { venuePaymentMethodsForCheckout } from "@/lib/venue-payment-methods";
import type { Booking, BookingCheckoutResponse } from "@/lib/types/courtly";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MANILA_TZ = "Asia/Manila";

function readManilaNowParts(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    time: `${pick("hour")}:${pick("minute")}`,
  };
}

function isSlotInPast(
  date: string,
  startTime: string,
  nowDate: string,
  nowTime: string,
): boolean {
  if (date < nowDate) return true;
  if (date > nowDate) return false;
  return startTime <= nowTime;
}

function toBookingPayloadList(body: unknown): Partial<Booking>[] {
  if (Array.isArray(body)) return body as Partial<Booking>[];
  if (body && typeof body === "object" && Array.isArray((body as { items?: unknown[] }).items)) {
    return (body as { items: Partial<Booking>[] }).items;
  }
  return [body as Partial<Booking>];
}

type GuestFields = {
  guest_first_name?: string;
  guest_last_name?: string;
  guest_email?: string;
  guest_phone?: string;
};

export async function POST(req: Request) {
  const sessionUser = await readSessionUser();
  const requestBody = (await req.json()) as GuestFields & { items?: Partial<Booking>[] };

  let playerName: string;
  let playerEmail: string;
  let userId: string | null;

  if (sessionUser) {
    playerName = sessionUser.full_name ?? sessionUser.email;
    playerEmail = sessionUser.email;
    userId = sessionUser.id;
  } else {
    const firstName = (requestBody.guest_first_name ?? "").trim();
    const lastName = (requestBody.guest_last_name ?? "").trim();
    const email = (requestBody.guest_email ?? "").trim().toLowerCase();
    const phone = (requestBody.guest_phone ?? "").trim();

    if (!firstName) return NextResponse.json({ error: "First name is required." }, { status: 400 });
    if (!lastName) return NextResponse.json({ error: "Last name is required." }, { status: 400 });
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    if (!phone) return NextResponse.json({ error: "Phone number is required." }, { status: 400 });

    playerName = `${firstName} ${lastName}`;
    playerEmail = email;
    userId = null;
  }

  const guestPhone = sessionUser ? null : (requestBody.guest_phone ?? "").trim() || null;

  const payloads = sessionUser
    ? toBookingPayloadList(requestBody)
    : Array.isArray(requestBody.items)
      ? requestBody.items
      : [];

  if (payloads.length === 0) {
    return NextResponse.json({ error: "At least one booking is required." }, { status: 400 });
  }

  const [courts, venues, defaultFeeSetting] = await Promise.all([
    listCourts(),
    listVenues(),
    getPlatformDefaultBookingFeeAmount(),
  ]);
  const holdExpiresAt = holdExpiresAtFrom();
  const { date: nowDate, time: nowTime } = readManilaNowParts();
  const bookingGroupId = crypto.randomUUID();
  let bookingNumber = generateBookingNumber(payloads[0]?.date ?? null);
  const rows: Array<Record<string, unknown>> = [];
  let checkoutPaymentMethods: BookingCheckoutResponse["payment_methods"] = [];
  let totalDue = 0;

  for (const item of payloads) {
    const court = courts.find((row) => row.id === item.court_id);
    const venue = court ? venues.find((row) => row.id === court.venue_id) : null;
    if (!court || !venue) {
      return NextResponse.json({ error: "Court not found." }, { status: 404 });
    }
    if (court.status !== "active" || venue.status !== "active") {
      return NextResponse.json(
        { error: "This venue/court is inactive and cannot be booked." },
        { status: 409 },
      );
    }
    if (!item.date || !item.start_time || !item.end_time) {
      return NextResponse.json({ error: "Missing booking date/time." }, { status: 400 });
    }
    if (isSlotInPast(item.date, item.start_time, nowDate, nowTime)) {
      return NextResponse.json(
        {
          error:
            "One or more selected times have already passed. Please refresh and pick a new time.",
        },
        { status: 409 },
      );
    }
    const hasConflict = await hasBlockingBookingConflictForCourt(
      court.id,
      item.date,
      item.start_time,
      item.end_time,
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

    let courtSubtotal = item.court_subtotal;
    let bookingFee = item.booking_fee;
    let itemTotal = item.total_cost;
    const venueOverride = Number(
      (venue as { booking_fee_override?: unknown }).booking_fee_override ?? Number.NaN,
    );
    const bookingFeeForVenue = Number.isFinite(venueOverride) ? venueOverride : defaultFeeSetting;
    const hasFullSplit =
      typeof courtSubtotal === "number" &&
      typeof bookingFee === "number" &&
      typeof itemTotal === "number";
    if (!hasFullSplit) {
      const numHours = Math.max(1, hourFromTime(item.end_time) - hourFromTime(item.start_time));
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
      user_id: userId,
      booking_number: bookingNumber,
      court_id: court.id,
      booking_group_id: bookingGroupId,
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      player_name: item.player_name ?? playerName,
      player_email: item.player_email ?? playerEmail,
      players_count: item.players_count ?? null,
      court_subtotal: courtSubtotal ?? null,
      booking_fee: bookingFee ?? null,
      total_cost: itemTotal ?? null,
      status: "pending_payment",
      hold_expires_at: holdExpiresAt.toISOString(),
      notes: item.notes ?? null,
      guest_phone: guestPhone,
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
        : rows.map((row) => ({
            ...row,
            booking_number: generateBookingNumber(payloads[0]?.date ?? null),
          }));
    const { data, error } = await supabase
      .from("bookings")
      .insert(tryRows as never[])
      .select("id, booking_group_id");
    if (!error && data && data.length > 0) {
      insertedRows = data as Array<{ id: string; booking_group_id: string }>;
      bookingNumber = String(
        (tryRows[0] as { booking_number?: string }).booking_number ?? bookingNumber,
      );
      inserted = true;
      break;
    }
    if (error?.code !== "23505") break;
  }
  if (!inserted || !insertedRows || insertedRows.length === 0) {
    return NextResponse.json({ error: "Failed to create booking hold." }, { status: 500 });
  }

  const bookingId = insertedRows[0]!.id;

  return NextResponse.json({
    booking_id: bookingId,
    booking_group_id: bookingGroupId,
    booking_number: bookingNumber,
    hold_expires_at: holdExpiresAt.toISOString(),
    total_due: totalDue,
    payment_methods: checkoutPaymentMethods,
  });
}
