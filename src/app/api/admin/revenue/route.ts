import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import {
  filterBookingsByDateRange,
  normalizeDateRange,
  parseIsoDateParam,
} from "@/lib/revenue-filters";
import { aggregateRevenueByCourt } from "@/lib/revenue-aggregate";
import type { RevenueByAccountRow, Venue } from "@/lib/types/courtly";

function attachVenueNames(
  rows: ReturnType<typeof aggregateRevenueByCourt>,
): ReturnType<typeof aggregateRevenueByCourt> {
  return rows.map((row) => {
    const name = row.venue_id
      ? mockDb.venues.find((venue) => venue.id === row.venue_id)?.name ?? null
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

  if (mockDb.courts.some((court) => !court.venue_id)) {
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
    !mockDb.venues.some((venue) => venue.id === venueFilter)
  ) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  let courts = [...mockDb.courts];
  if (user.role === "admin") {
    const ids = new Set(
      manageableCourtIds(user, mockDb.courts, mockDb.venueAdminAssignments),
    );
    courts = courts.filter((court) => ids.has(court.id));
  }

  if (venueFilter === "unassigned") {
    courts = courts.filter((court) => !court.venue_id);
  } else if (venueFilter) {
    courts = courts.filter((court) => court.venue_id === venueFilter);
  }

  const courtIds = new Set(courts.map((court) => court.id));
  let bookings = mockDb.bookings.filter((booking) =>
    courtIds.has(booking.court_id),
  );
  bookings = filterBookingsByDateRange(bookings, dateFrom, dateTo);

  const byCourt = attachVenueNames(aggregateRevenueByCourt(bookings, courts));

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
    byAccount = platformVenueRows(mockDb.venues, byCourt);
    byAccount.sort((a, b) => b.customer_total - a.customer_total);
  }

  let focus_venue: { id: string; name: string } | null | undefined;
  if (venueFilter === "unassigned") {
    focus_venue = { id: "unassigned", name: "Unassigned venue" };
  } else if (venueFilter) {
    const venue = mockDb.venues.find((row) => row.id === venueFilter);
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
