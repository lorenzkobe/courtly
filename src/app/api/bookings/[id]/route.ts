import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { Booking } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function canReadBooking(
  user: Awaited<ReturnType<typeof readSessionUser>>,
  booking: Booking,
): boolean {
  if (!user) return false;
  if (user.email && booking.player_email === user.email) return true;
  const court = mockDb.courts.find((c) => c.id === booking.court_id);
  if (court && canMutateCourt(user, court)) return true;
  return false;
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const booking = mockDb.bookings.find((b) => b.id === id);
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canReadBooking(user, booking)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(booking);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const idx = mockDb.bookings.findIndex((b) => b.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = mockDb.bookings[idx];
  const court = mockDb.courts.find((c) => c.id === booking.court_id);
  const patch = (await req.json()) as Partial<Booking>;

  const isOwner =
    !!user?.email &&
    booking.player_email === user.email &&
    booking.status === "confirmed";
  const onlySelfCancel =
    isOwner &&
    patch.status === "cancelled" &&
    Object.keys(patch).length === 1;

  if (onlySelfCancel) {
    mockDb.bookings[idx] = { ...booking, status: "cancelled" };
    return NextResponse.json(mockDb.bookings[idx]);
  }

  if (!court || !canMutateCourt(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  mockDb.bookings[idx] = { ...mockDb.bookings[idx], ...patch };
  return NextResponse.json(mockDb.bookings[idx]);
}
