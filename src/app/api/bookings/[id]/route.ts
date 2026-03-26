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
  if (user.email) {
    const a = user.email.trim().toLowerCase();
    const b = (booking.player_email ?? "").trim().toLowerCase();
    if (a && b && a === b) return true;
  }
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
  const body = (await req.json()) as Partial<Booking> & {
    admin_note?: string;
    clear_admin_note?: boolean;
  };
  const patch: Partial<Booking> = { ...body };
  delete (patch as { admin_note?: unknown }).admin_note;
  delete (patch as { clear_admin_note?: unknown }).clear_admin_note;
  delete (patch as { admin_notes?: unknown }).admin_notes;
  const ownerEmail = (user?.email ?? "").trim().toLowerCase();
  const bookingEmail = (booking.player_email ?? "").trim().toLowerCase();
  const ownerMatches = !!ownerEmail && ownerEmail === bookingEmail;

  const onlyStatusCancel =
    patch.status === "cancelled" && Object.keys(patch).length === 1;
  if (ownerMatches && onlyStatusCancel) {
    // Idempotent for repeated clicks/retries.
    if (booking.status === "cancelled") {
      return NextResponse.json(booking);
    }
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "Only confirmed bookings can be cancelled" },
        { status: 400 },
      );
    }
    mockDb.bookings[idx] = { ...booking, status: "cancelled" };
    // TODO(notifications): emit placeholder event hook for player/admin cancellation
    // when Supabase notifications are wired.
    return NextResponse.json(mockDb.bookings[idx]);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    return NextResponse.json(
      { error: "Booking note can only be set during booking creation" },
      { status: 400 },
    );
  }

  if (!court || !canMutateCourt(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (user) {
    const wantsAdminNoteUpdate =
      typeof body.admin_note === "string" || body.clear_admin_note === true;
    if (wantsAdminNoteUpdate) {
      if (body.clear_admin_note === true) {
        patch.admin_note = undefined;
        patch.admin_note_updated_by_user_id = undefined;
        patch.admin_note_updated_by_name = undefined;
        patch.admin_note_updated_at = undefined;
      } else {
        const text = body.admin_note?.trim() ?? "";
        patch.admin_note = text || undefined;
        patch.admin_note_updated_by_user_id = text ? user.id : undefined;
        patch.admin_note_updated_by_name = text
          ? (user.full_name || user.email)
          : undefined;
        patch.admin_note_updated_at = text ? new Date().toISOString() : undefined;
      }
    }
  }

  mockDb.bookings[idx] = { ...mockDb.bookings[idx], ...patch };
  // TODO(notifications): emit placeholder event hook for booking changes/completion
  // when Supabase notifications are wired.
  return NextResponse.json(mockDb.bookings[idx]);
}
