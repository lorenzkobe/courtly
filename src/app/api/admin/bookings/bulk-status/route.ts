import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getBookingById,
  getCourtById,
  listVenueAdminAssignmentsByAdminUser,
  updateRow,
} from "@/lib/data/courtly-db";
import { emitBulkBookingLifecycleNotifications } from "@/lib/notifications/emit-from-server";
import type { Booking } from "@/lib/types/courtly";

type BulkStatusItem = {
  id?: string;
  status?: Booking["status"];
};

export async function PATCH(req: Request) {
  const user = await readSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { updates?: BulkStatusItem[] };
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return NextResponse.json({ error: "updates are required" }, { status: 400 });
  }
  const adminVenueIds =
    user.role === "admin"
      ? new Set(
          (await listVenueAdminAssignmentsByAdminUser(user.id)).map(
            (assignment) => assignment.venue_id,
          ),
        )
      : null;
  const nowIso = new Date().toISOString();
  const actorName = user.full_name || user.email || "Unknown";
  const results: Booking[] = [];
  const lifecycleItems: Array<{
    prev: Booking;
    nextRow: Record<string, unknown>;
    bookingId: string;
  }> = [];

  for (const update of updates) {
    const bookingId = update.id?.trim();
    const nextStatus = update.status;
    if (!bookingId || !nextStatus) {
      return NextResponse.json(
        { error: "Each update requires id and status" },
        { status: 400 },
      );
    }
    const booking = await getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const court = await getCourtById(booking.court_id);
    if (!court) {
      return NextResponse.json({ error: "Court not found" }, { status: 404 });
    }
    if (user.role === "admin" && !adminVenueIds?.has(court.venue_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await updateRow("bookings", bookingId, {
      status: nextStatus,
      status_updated_by_user_id: user.id,
      status_updated_by_name: actorName,
      status_updated_at: nowIso,
    });
    lifecycleItems.push({
      prev: booking,
      nextRow: updated as Record<string, unknown>,
      bookingId,
    });
    results.push(updated as Booking);
  }

  await emitBulkBookingLifecycleNotifications(lifecycleItems);

  return NextResponse.json({ updates: results });
}
