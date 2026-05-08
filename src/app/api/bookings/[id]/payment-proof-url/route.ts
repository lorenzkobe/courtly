import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { getBookingById } from "@/lib/data/courtly-db";
import { isCourtStaff } from "@/lib/auth/management";
import { createPaymentProofSignedUrl } from "@/lib/supabase/storage";

type Ctx = { params: Promise<{ id: string }> };

function isOwner(
  user: NonNullable<Awaited<ReturnType<typeof readSessionUser>>>,
  booking: Awaited<ReturnType<typeof getBookingById>>,
): boolean {
  if (!booking) return false;
  if (booking.user_id && booking.user_id === user.id) return true;
  const ownerEmail = user.email.trim().toLowerCase();
  const bookingEmail = (booking.player_email ?? "").trim().toLowerCase();
  return !!ownerEmail && ownerEmail === bookingEmail;
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const booking = await getBookingById(id);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  if (!isOwner(user, booking) && !isCourtStaff(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!booking.payment_proof_url) {
    return NextResponse.json({ error: "No payment proof on file." }, { status: 404 });
  }

  try {
    const signedUrl = await createPaymentProofSignedUrl(booking.payment_proof_url);
    return NextResponse.json({ signedUrl });
  } catch {
    return NextResponse.json({ error: "Could not generate proof URL." }, { status: 500 });
  }
}
