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
import type { CourtAccount, RevenueByAccountRow } from "@/lib/types/courtly";

function attachAccountNames(
  rows: ReturnType<typeof aggregateRevenueByCourt>,
): ReturnType<typeof aggregateRevenueByCourt> {
  return rows.map((row) => {
    const name = row.court_account_id
      ? mockDb.courtAccounts.find((a) => a.id === row.court_account_id)?.name ??
        null
      : null;
    return { ...row, court_account_name: name };
  });
}

type Roll = {
  court_net: number;
  booking_fees: number;
  customer_total: number;
  booking_count: number;
};

function platformAccountRows(
  courtAccounts: CourtAccount[],
  byCourt: ReturnType<typeof attachAccountNames>,
): RevenueByAccountRow[] {
  const agg = new Map<string, Roll>();
  for (const row of byCourt) {
    const key = row.court_account_id ?? "";
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

  const out: RevenueByAccountRow[] = courtAccounts.map((a) => {
    const hit = agg.get(a.id);
    return {
      court_account_id: a.id,
      court_account_name: a.name,
      court_net: hit?.court_net ?? 0,
      booking_fees: hit?.booking_fees ?? 0,
      customer_total: hit?.customer_total ?? 0,
      booking_count: hit?.booking_count ?? 0,
    };
  });

  if (mockDb.courts.some((c) => c.court_account_id == null)) {
    const hit = agg.get("");
    out.push({
      court_account_id: "",
      court_account_name: "Unassigned account",
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

  const accountParamRaw = searchParams.get("court_account_id");
  const courtAccountFilter =
    user.role === "superadmin" && accountParamRaw === "unassigned"
      ? "unassigned"
      : user.role === "superadmin" && accountParamRaw
        ? accountParamRaw
        : null;

  if (user.role === "admin" && accountParamRaw) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    courtAccountFilter &&
    courtAccountFilter !== "unassigned" &&
    !mockDb.courtAccounts.some((a) => a.id === courtAccountFilter)
  ) {
    return NextResponse.json({ error: "Court account not found" }, { status: 404 });
  }

  let courts = [...mockDb.courts];
  if (user.role === "admin") {
    const ids = new Set(manageableCourtIds(user, mockDb.courts));
    courts = courts.filter((c) => ids.has(c.id));
  }

  if (courtAccountFilter === "unassigned") {
    courts = courts.filter((c) => c.court_account_id == null);
  } else if (courtAccountFilter) {
    courts = courts.filter((c) => c.court_account_id === courtAccountFilter);
  }

  const courtIds = new Set(courts.map((c) => c.id));
  let bookings = mockDb.bookings.filter((b) => courtIds.has(b.court_id));
  bookings = filterBookingsByDateRange(bookings, dateFrom, dateTo);

  const byCourt = attachAccountNames(aggregateRevenueByCourt(bookings, courts));

  const totals = byCourt.reduce(
    (acc, r) => ({
      court_net: acc.court_net + r.court_net,
      booking_fees: acc.booking_fees + r.booking_fees,
      customer_total: acc.customer_total + r.customer_total,
      booking_count: acc.booking_count + r.booking_count,
    }),
    { court_net: 0, booking_fees: 0, customer_total: 0, booking_count: 0 },
  );

  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    court_account_id: courtAccountFilter,
  };

  let byAccount: RevenueByAccountRow[] | undefined;
  if (user.role === "superadmin" && !courtAccountFilter) {
    byAccount = platformAccountRows(mockDb.courtAccounts, byCourt);
    byAccount.sort((a, b) => b.customer_total - a.customer_total);
  }

  let focus_account: { id: string; name: string } | null | undefined;
  if (courtAccountFilter === "unassigned") {
    focus_account = { id: "unassigned", name: "Unassigned account" };
  } else if (courtAccountFilter) {
    const a = mockDb.courtAccounts.find((x) => x.id === courtAccountFilter);
    focus_account = a ? { id: a.id, name: a.name } : null;
  }

  const body: import("@/lib/types/courtly").RevenueSummaryResponse = {
    scope: user.role === "superadmin" ? "platform" : "venue",
    totals,
    by_court: byCourt,
    filters,
    ...(byAccount ? { by_account: byAccount } : {}),
    ...(courtAccountFilter ? { focus_account } : {}),
  };

  return NextResponse.json(body);
}
