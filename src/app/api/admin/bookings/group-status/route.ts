import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getBookingByIdAdmin,
  getCourtById,
  listBookingsByGroupIdAdmin,
  listVenueAdminAssignmentsByAdminUser,
  updateRow,
} from "@/lib/data/courtly-db";
import { emitBulkBookingLifecycleNotifications } from "@/lib/notifications/emit-from-server";
import type { Booking } from "@/lib/types/courtly";

export async function PATCH(req: Request) {
  const user = await readSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { booking_id?: string; status?: Booking["status"] };
  const bookingId = body.booking_id?.trim();
  const nextStatus = body.status;
  if (!bookingId || !nextStatus) {
    return NextResponse.json(
      { error: "booking_id and status are required" },
      { status: 400 },
    );
  }

  const booking = await getBookingByIdAdmin(bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const court = await getCourtById(booking.court_id);
  if (!court) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  if (user.role === "admin") {
    const adminVenueIds = new Set(
      (await listVenueAdminAssignmentsByAdminUser(user.id)).map((a) => a.venue_id),
    );
    if (!adminVenueIds.has(court.venue_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const segments = booking.booking_group_id
    ? await listBookingsByGroupIdAdmin(booking.booking_group_id)
    : [booking];

  const nowIso = new Date().toISOString();
  const actorName = user.full_name || user.email || "Unknown";
  const results: Booking[] = [];
  const lifecycleItems: Array<{
    prev: Booking;
    nextRow: Record<string, unknown>;
    bookingId: string;
  }> = [];

  for (const segment of segments) {
    const updated = await updateRow("bookings", segment.id, {
      status: nextStatus,
      status_updated_by_user_id: user.id,
      status_updated_by_name: actorName,
      status_updated_at: nowIso,
    });
    lifecycleItems.push({
      prev: segment,
      nextRow: updated as Record<string, unknown>,
      bookingId: segment.id,
    });
    results.push(updated as Booking);
  }

  await emitBulkBookingLifecycleNotifications(lifecycleItems);

  return NextResponse.json({ updates: results });
}
