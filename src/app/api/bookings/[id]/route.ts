import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { Booking } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const idx = mockDb.bookings.findIndex((b) => b.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = mockDb.bookings[idx];
  const court = mockDb.courts.find((c) => c.id === booking.court_id);
  if (!court || !canMutateCourt(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch = (await req.json()) as Partial<Booking>;
  mockDb.bookings[idx] = { ...mockDb.bookings[idx], ...patch };
  return NextResponse.json(mockDb.bookings[idx]);
}
