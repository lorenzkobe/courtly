import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listAllBillingCycles, listVenues } from "@/lib/data/courtly-db";
import type {
  BillingSummaryResponse,
  BillingSummaryVenueRow,
  BillingCycleStatus,
  VenueBillingCycle,
} from "@/lib/types/courtly";

export async function GET(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const venueIdFilter = searchParams.get("venue_id") ?? undefined;

  const [cycles, venues] = await Promise.all([
    listAllBillingCycles(),
    listVenues(),
  ]);

  const venueMap = new Map(venues.map((v) => [v.id, v.name]));

  // Aggregate per venue
  const byVenue = new Map<string, {
    total_cycles: number;
    unsettled_cycles: number;
    paid_cycles: number;
    total_fees_all_time: number;
    total_fees_unsettled: number;
    latest_cycle_status: BillingCycleStatus | null;
    latest_period_start: string;
  }>();

  for (const cycle of cycles) {
    const existing = byVenue.get(cycle.venue_id);
    const isNewer = !existing || cycle.period_start > existing.latest_period_start;
    byVenue.set(cycle.venue_id, {
      total_cycles: (existing?.total_cycles ?? 0) + 1,
      unsettled_cycles: (existing?.unsettled_cycles ?? 0) + (cycle.status === "unsettled" ? 1 : 0),
      paid_cycles: (existing?.paid_cycles ?? 0) + (cycle.status === "paid" ? 1 : 0),
      total_fees_all_time: (existing?.total_fees_all_time ?? 0) + cycle.total_booking_fees,
      total_fees_unsettled:
        (existing?.total_fees_unsettled ?? 0) +
        (cycle.status === "unsettled" ? cycle.total_booking_fees : 0),
      latest_cycle_status: isNewer ? cycle.status : (existing?.latest_cycle_status ?? null),
      latest_period_start: isNewer ? cycle.period_start : (existing?.latest_period_start ?? ""),
    });
  }

  const venueRows: BillingSummaryVenueRow[] = [];
  for (const venue of venues) {
    if (venueIdFilter && venue.id !== venueIdFilter) continue;
    const agg = byVenue.get(venue.id);
    venueRows.push({
      venue_id: venue.id,
      venue_name: venue.name,
      total_cycles: agg?.total_cycles ?? 0,
      unsettled_cycles: agg?.unsettled_cycles ?? 0,
      paid_cycles: agg?.paid_cycles ?? 0,
      total_fees_all_time: agg?.total_fees_all_time ?? 0,
      total_fees_unsettled: agg?.total_fees_unsettled ?? 0,
      latest_cycle_status: agg?.latest_cycle_status ?? null,
    });
  }

  const platform_totals = {
    total_fees_all_time: cycles.reduce((s, c) => s + c.total_booking_fees, 0),
    total_fees_unsettled: cycles
      .filter((c) => c.status === "unsettled")
      .reduce((s, c) => s + c.total_booking_fees, 0),
    total_fees_paid: cycles
      .filter((c) => c.status === "paid")
      .reduce((s, c) => s + c.total_booking_fees, 0),
    unsettled_cycle_count: cycles.filter((c) => c.status === "unsettled").length,
  };

  let venue_cycles: VenueBillingCycle[] | undefined;
  if (venueIdFilter) {
    venue_cycles = cycles
      .filter((c) => c.venue_id === venueIdFilter)
      .sort((a, b) => a.period_start.localeCompare(b.period_start));
  }

  const response: BillingSummaryResponse = {
    venues: venueRows,
    platform_totals,
    ...(venue_cycles ? { venue_cycles } : {}),
  };

  return NextResponse.json(response);
}
