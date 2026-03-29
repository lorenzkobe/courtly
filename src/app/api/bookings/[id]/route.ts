import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import {
  listBookings,
  listCourts,
  listVenueAdminAssignments,
  updateRow,
} from "@/lib/data/courtly-db";
import { emitBookingLifecycleNotifications } from "@/lib/notifications/emit-from-server";
import type { Booking } from "@/lib/types/courtly";

function hydrateBooking(booking: Booking): Booking {
  return booking;
}

type Ctx = { params: Promise<{ id: string }> };

function canReadBooking(
  user: Awaited<ReturnType<typeof readSessionUser>>,
  booking: Booking,
  assignments: Awaited<ReturnType<typeof listVenueAdminAssignments>>,
  courts: Awaited<ReturnType<typeof listCourts>>,
): boolean {
  if (!user) return false;
  if (user.email) {
    const userEmailNormalized = user.email.trim().toLowerCase();
    const playerEmailNormalized = (booking.player_email ?? "").trim().toLowerCase();
    if (
      userEmailNormalized &&
      playerEmailNormalized &&
      userEmailNormalized === playerEmailNormalized
    ) {
      return true;
    }
  }
  const court = courts.find((row) => row.id === booking.court_id);
  if (court && canMutateCourt(user, court, assignments)) return true;
  return false;
}

export async function GET(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { searchParams } = new URL(req.url);
  const includeGroup = searchParams.get("include_group") === "true";
  const { id } = await ctx.params;
  const [bookings, assignments, courts] = await Promise.all([
    listBookings(),
    listVenueAdminAssignments(),
    listCourts(),
  ]);
  const booking = bookings.find((row) => row.id === id);
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canReadBooking(user, booking, assignments, courts)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!includeGroup) {
    return NextResponse.json(hydrateBooking(booking));
  }

  const groupSegments = booking.booking_group_id
    ? bookings
      .filter((row) => row.booking_group_id === booking.booking_group_id)
      .filter((row) => canReadBooking(user, row, assignments, courts))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map(hydrateBooking)
    : [hydrateBooking(booking)];

  return NextResponse.json({
    booking: hydrateBooking(booking),
    group_segments: groupSegments,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const [bookings, courts, assignments] = await Promise.all([
    listBookings(),
    listCourts(),
    listVenueAdminAssignments(),
  ]);
  const booking = bookings.find((row) => row.id === id);
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const court = courts.find((row) => row.id === booking.court_id);
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
    return NextResponse.json(
      { error: "This booking is paid. Please contact the venue to request cancellation." },
      { status: 403 },
    );
  }

  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    return NextResponse.json(
      { error: "Booking note can only be set during booking creation" },
      { status: 400 },
    );
  }

  if (!court || !canMutateCourt(user, court, assignments)) {
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

  const updated = await updateRow("bookings", id, {
    ...patch,
    admin_note: patch.admin_note ?? null,
    admin_note_updated_by_user_id: patch.admin_note_updated_by_user_id ?? null,
    admin_note_updated_by_name: patch.admin_note_updated_by_name ?? null,
    admin_note_updated_at: patch.admin_note_updated_at ?? null,
  });
  await emitBookingLifecycleNotifications({
    prev: booking,
    nextRow: updated as Record<string, unknown>,
    bookingId: id,
  });
  return NextResponse.json(hydrateBooking(updated as Booking));
}
