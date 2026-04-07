import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  listCourtsDirectory,
  listRevenueBookings,
  listVenueAdminAssignmentsByAdminUser,
  listVenues,
} from "@/lib/data/courtly-db";
import { formatHourToken, hourFromTime } from "@/lib/booking-range";
import { hourlyRateForHourStart } from "@/lib/court-pricing";
import {
  normalizeDateRange,
  parseIsoDateParam,
} from "@/lib/revenue-filters";
import { aggregateRevenueByCourt } from "@/lib/revenue-aggregate";
import type { Booking, Court, RevenueByAccountRow, RevenueRateBreakdownRow, Venue } from "@/lib/types/courtly";

function attachVenueNames(
  rows: ReturnType<typeof aggregateRevenueByCourt>,
  venues: Venue[],
): ReturnType<typeof aggregateRevenueByCourt> {
  return rows.map((row) => {
    const name = row.venue_id
      ? venues.find((venue) => venue.id === row.venue_id)?.name ?? null
      : null;
    return { ...row, venue_name: name };
  });
}

type Roll = {
  court_net: number;
  booking_fees: number;
  customer_total: number;
  booking_count: number;
};

function buildCourtRateBreakdownMap(
  bookings: Booking[],
  courts: Court[],
): Map<string, RevenueRateBreakdownRow[]> {
  const courtMap = new Map(courts.map((court) => [court.id, court] as const));
  const byCourtRate = new Map<string, Map<number, { hours_booked: number; court_subtotal: number }>>();

  for (const booking of bookings) {
    if (booking.status !== "confirmed" && booking.status !== "completed") continue;
    const court = courtMap.get(booking.court_id);
    if (!court) continue;
    const startHour = hourFromTime(booking.start_time);
    const endHour = hourFromTime(booking.end_time);
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || endHour <= startHour) continue;
    const rateMap =
      byCourtRate.get(booking.court_id) ??
      new Map<number, { hours_booked: number; court_subtotal: number }>();
    for (let hour = startHour; hour < endHour; hour += 1) {
      const hourlyRate = hourlyRateForHourStart(court, formatHourToken(hour));
      const current = rateMap.get(hourlyRate) ?? { hours_booked: 0, court_subtotal: 0 };
      current.hours_booked += 1;
      current.court_subtotal += hourlyRate;
      rateMap.set(hourlyRate, current);
    }
    byCourtRate.set(booking.court_id, rateMap);
  }

  const out = new Map<string, RevenueRateBreakdownRow[]>();
  for (const [courtId, rateMap] of byCourtRate) {
    const rows = [...rateMap.entries()]
      .map(([hourly_rate, agg]) => ({
        hourly_rate,
        hours_booked: agg.hours_booked,
        court_subtotal: agg.court_subtotal,
      }))
      .sort((a, b) => b.hourly_rate - a.hourly_rate);
    out.set(courtId, rows);
  }
  return out;
}

function platformVenueRows(
  venues: Venue[],
  byCourt: ReturnType<typeof attachVenueNames>,
): RevenueByAccountRow[] {
  const agg = new Map<string, Roll>();
  for (const row of byCourt) {
    const key = row.venue_id ?? "";
    const cur = agg.get(key) ?? {
      court_net: 0,
      booking_fees: 0,
      customer_total: 0,
      booking_count: 0,
    };
    cur.court_net += row.court_net;
    cur.booking_fees += row.booking_fees;
    cur.customer_total += row.customer_total;
    cur.booking_count += row.booking_count;
    agg.set(key, cur);
  }

  const out: RevenueByAccountRow[] = venues.map((venue) => {
    const hit = agg.get(venue.id);
    return {
      venue_id: venue.id,
      venue_name: venue.name,
      court_net: hit?.court_net ?? 0,
      booking_fees: hit?.booking_fees ?? 0,
      customer_total: hit?.customer_total ?? 0,
      booking_count: hit?.booking_count ?? 0,
    };
  });

  if (byCourt.some((court) => !court.venue_id)) {
    const hit = agg.get("");
    out.push({
      venue_id: "",
      venue_name: "Unassigned venue",
      court_net: hit?.court_net ?? 0,
      booking_fees: hit?.booking_fees ?? 0,
      customer_total: hit?.customer_total ?? 0,
      booking_count: hit?.booking_count ?? 0,
    });
  }

  return out;
}

export async function GET(req: Request) {
  const user = await readSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const allVenues = await listVenues();
  let dateFrom = parseIsoDateParam(searchParams.get("from"));
  let dateTo = parseIsoDateParam(searchParams.get("to"));
  ({ from: dateFrom, to: dateTo } = normalizeDateRange(dateFrom, dateTo));

  const venueParamRaw = searchParams.get("venue_id");
  const venueFilter =
    user.role === "superadmin" && venueParamRaw === "unassigned"
      ? "unassigned"
      : user.role === "superadmin" && venueParamRaw
        ? venueParamRaw
        : null;

  if (user.role === "admin" && venueParamRaw) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    venueFilter &&
    venueFilter !== "unassigned" &&
    !allVenues.some((venue) => venue.id === venueFilter)
  ) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  let courts: Court[] = [];
  if (user.role === "admin") {
    const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
    const venueIds = [...new Set(assignments.map((row) => row.venue_id))];
    courts = await listCourtsDirectory({ venueIds });
  } else {
    courts = await listCourtsDirectory({});
  }

  if (venueFilter === "unassigned") {
    courts = courts.filter((court) => !court.venue_id);
  } else if (venueFilter) {
    courts = courts.filter((court) => court.venue_id === venueFilter);
  }

  const courtIds = new Set(courts.map((court) => court.id));
  let bookings = await listRevenueBookings({
    courtIds: [...courtIds],
    dateFrom,
    dateTo,
  });
  bookings = bookings.filter((booking) => courtIds.has(booking.court_id));

  const byCourtBase = attachVenueNames(aggregateRevenueByCourt(bookings, courts), allVenues);
  const rateBreakdownMap = buildCourtRateBreakdownMap(bookings, courts);
  const byCourt = byCourtBase.map((row) => ({
    ...row,
    rate_breakdown: rateBreakdownMap.get(row.court_id) ?? [],
  }));

  const totals = byCourt.reduce(
    (acc, row) => ({
      court_net: acc.court_net + row.court_net,
      booking_fees: acc.booking_fees + row.booking_fees,
      customer_total: acc.customer_total + row.customer_total,
      booking_count: acc.booking_count + row.booking_count,
    }),
    { court_net: 0, booking_fees: 0, customer_total: 0, booking_count: 0 },
  );

  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    venue_id: venueFilter,
  };

  let byAccount: RevenueByAccountRow[] | undefined;
  if (user.role === "superadmin" && !venueFilter) {
    byAccount = platformVenueRows(allVenues, byCourt);
    byAccount.sort((a, b) => b.customer_total - a.customer_total);
  }

  let focus_venue: { id: string; name: string } | null | undefined;
  if (venueFilter === "unassigned") {
    focus_venue = { id: "unassigned", name: "Unassigned venue" };
  } else if (venueFilter) {
    const venue = allVenues.find((row) => row.id === venueFilter);
    focus_venue = venue ? { id: venue.id, name: venue.name } : null;
  }

  const body: import("@/lib/types/courtly").RevenueSummaryResponse = {
    scope: user.role === "superadmin" ? "platform" : "venue",
    totals,
    by_court: byCourt,
    filters,
    ...(byAccount ? { by_account: byAccount } : {}),
    ...(venueFilter ? { focus_venue } : {}),
  };

  return NextResponse.json(body);
}
