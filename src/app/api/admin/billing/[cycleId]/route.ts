import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getBillingCycleById,
  getVenueById,
  listVenueAdminAssignmentsByAdminUser,
  listCourtIdsByVenueIds,
  listRevenueBookings,
} from "@/lib/data/courtly-db";
import type { BillingCycleDetailResponse, BillingCycleBookingRow } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ cycleId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { cycleId } = await ctx.params;
  const cycle = await getBillingCycleById(cycleId);
  if (!cycle) {
    return NextResponse.json({ error: "Billing cycle not found." }, { status: 404 });
  }

  const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
  if (!assignments.some((a) => a.venue_id === cycle.venue_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const venue = await getVenueById(cycle.venue_id);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  const courtIds = await listCourtIdsByVenueIds([cycle.venue_id]);
  const bookings = courtIds.length > 0
    ? await listRevenueBookings({
        courtIds,
        dateFrom: cycle.period_start,
        dateTo: cycle.period_end,
      })
    : [];

  const bookingRows: BillingCycleBookingRow[] = bookings.map((b) => ({
    booking_id: b.id,
    booking_number: b.booking_number ?? null,
    court_id: b.court_id,
    court_name: b.court_name ?? "",
    date: b.date,
    start_time: b.start_time,
    end_time: b.end_time,
    player_name: b.player_name ?? null,
    booking_fee: Number(b.booking_fee ?? 0),
  }));

  const response: BillingCycleDetailResponse = {
    cycle,
    venue: { id: venue.id, name: venue.name },
    bookings: bookingRows,
  };

  return NextResponse.json(response);
}
