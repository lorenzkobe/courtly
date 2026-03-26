import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import { normalizeBookingFee } from "@/lib/platform-fee";

export async function PATCH(req: Request) {
  const user = await readSessionUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { booking_fee?: number };
  const bookingFee = normalizeBookingFee(body.booking_fee);

  for (const court of mockDb.courts) {
    court.booking_fee = bookingFee;
  }

  return NextResponse.json({
    ok: true,
    booking_fee: bookingFee,
    updated_count: mockDb.courts.length,
  });
}
