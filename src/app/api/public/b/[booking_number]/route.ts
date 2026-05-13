import { NextResponse } from "next/server";
import { getBookingByBookingNumber, getCourtById } from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ booking_number: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { booking_number } = await ctx.params;
  if (!booking_number?.trim()) {
    return NextResponse.json({ error: "Booking number is required." }, { status: 400 });
  }

  const booking = await getBookingByBookingNumber(booking_number.trim().toUpperCase());
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const court = await getCourtById(booking.court_id);

  return NextResponse.json({
    booking_number: booking.booking_number,
    court_name: booking.court_name,
    establishment_name: booking.establishment_name,
    sport: booking.sport,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    status: booking.status,
    player_name: booking.player_name,
    player_email: booking.player_email,
    total_cost: booking.total_cost,
    created_at: booking.created_date,
    location: court?.location ?? null,
    contact_phone: court?.contact_phone ?? null,
    facebook_url: court?.facebook_url ?? null,
    instagram_url: court?.instagram_url ?? null,
    map_latitude: court?.map_latitude ?? null,
    map_longitude: court?.map_longitude ?? null,
  });
}
