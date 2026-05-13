import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  deletePendingPaymentBookingsByIds,
  getBookingById,
  getBookingByIdAdmin,
  listBookingsByGroupIdAdmin,
  listBookingsFiltered,
} from "@/lib/data/courtly-db";
import type { Booking } from "@/lib/types/courtly";

type CancelPendingBody = {
  booking_id?: string;
  booking_group_id?: string;
  player_email?: string;
};

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  const body = (await req.json()) as CancelPendingBody;
  const bookingId = body.booking_id?.trim();
  const bookingGroupId = body.booking_group_id?.trim();

  if (!user) {
    if (!bookingId) {
      return NextResponse.json({ error: "booking_id is required." }, { status: 400 });
    }
    const callerEmail = normalizeEmail(body.player_email);
    if (!callerEmail) {
      return NextResponse.json({ error: "player_email is required." }, { status: 400 });
    }

    const booking = await getBookingByIdAdmin(bookingId);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (normalizeEmail(booking.player_email) !== callerEmail) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const targetRows = booking.booking_group_id
      ? await listBookingsByGroupIdAdmin(booking.booking_group_id)
      : [booking];
    const cancellable = targetRows.filter(
      (row) => normalizeEmail(row.player_email) === callerEmail && row.status === "pending_payment",
    );
    if (cancellable.length === 0) {
      return NextResponse.json({ ok: true, deleted_booking_ids: [] as string[] });
    }

    const ids = cancellable.map((row) => row.id);
    const deletedIds = await deletePendingPaymentBookingsByIds(ids);
    return NextResponse.json({ ok: true, deleted_booking_ids: deletedIds });
  }

  if (!bookingId && !bookingGroupId) {
    return NextResponse.json(
      { error: "booking_id or booking_group_id is required." },
      { status: 400 },
    );
  }

  let seedBooking: Booking | null = null;
  if (bookingId) {
    seedBooking = await getBookingById(bookingId);
  } else if (bookingGroupId) {
    const group = await listBookingsFiltered({ bookingGroupId });
    seedBooking = group[0] ?? null;
  }

  if (!seedBooking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const actorEmail = normalizeEmail(user.email);
  if (normalizeEmail(seedBooking.player_email) !== actorEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetRows = seedBooking.booking_group_id
    ? await listBookingsFiltered({ bookingGroupId: seedBooking.booking_group_id })
    : [seedBooking];
  const ownerRows = targetRows.filter((row) => normalizeEmail(row.player_email) === actorEmail);
  if (ownerRows.length === 0) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const cancellable = ownerRows.filter((row) => row.status === "pending_payment");
  if (cancellable.length === 0) {
    return NextResponse.json({ ok: true, deleted_booking_ids: [] as string[] });
  }

  const ids = cancellable.map((row) => row.id);
  const deletedIds = await deletePendingPaymentBookingsByIds(ids);
  return NextResponse.json({ ok: true, deleted_booking_ids: deletedIds });
}
