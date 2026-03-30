import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  listBookingsFilteredPage,
  listTournamentRegistrationsByPlayerPage,
} from "@/lib/data/courtly-db";
import { logApiMetrics, payloadBytesOf } from "@/lib/observability/api-metrics";
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from "@/lib/pagination/cursor";
import type { CourtSport, MyBookingsOverviewResponse } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") as CourtSport | null;
  const limit = parseLimit(searchParams.get("limit"));
  const bookingsOffset = decodeOffsetCursor(searchParams.get("bookings_cursor"));
  const registrationsOffset = decodeOffsetCursor(
    searchParams.get("registrations_cursor"),
  );

  const [bookings, registrations] = await Promise.all([
    listBookingsFilteredPage({
      playerEmail: user.email,
      offset: bookingsOffset,
      limit,
    }),
    listTournamentRegistrationsByPlayerPage(user.email, {
      offset: registrationsOffset,
      limit,
    }),
  ]);

  const filteredBookings = sport
    ? bookings.items.filter((booking) => booking.sport === sport)
    : bookings.items;
  const body: MyBookingsOverviewResponse = {
    bookings: {
      items: filteredBookings,
      has_more: bookings.hasMore,
      next_cursor: bookings.hasMore
        ? encodeOffsetCursor(bookingsOffset + bookings.items.length)
        : null,
    },
    registrations: {
      items: registrations.items,
      has_more: registrations.hasMore,
      next_cursor: registrations.hasMore
        ? encodeOffsetCursor(registrationsOffset + registrations.items.length)
        : null,
    },
  };
  logApiMetrics({
    route: "/api/me/bookings-overview",
    duration_ms: Date.now() - startedAt,
    limit,
    cursor: searchParams.get("bookings_cursor") ?? searchParams.get("registrations_cursor"),
    payload_bytes: payloadBytesOf(body),
    row_counts: {
      bookings: body.bookings.items.length,
      registrations: body.registrations.items.length,
    },
  });
  return NextResponse.json(body);
}
