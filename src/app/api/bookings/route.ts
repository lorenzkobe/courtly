import { NextResponse } from "next/server";
import {
  applyPlayerMobileVisibility,
  enrichBookingsWithProfileMobile,
} from "@/lib/booking-player-mobile";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { splitBookingAmounts } from "@/lib/platform-fee";
import {
  listBookingsFiltered,
  listCourtIdsByVenueIds,
  insertRow,
  insertRows,
  listCourts,
  listVenueAdminAssignmentsByAdminUser,
  listVenues,
} from "@/lib/data/courtly-db";
import { emitBookingCreatedToVenueAdmins } from "@/lib/notifications/emit-from-server";
import type { Booking, CourtSport } from "@/lib/types/courtly";

function hydrateBooking(booking: Booking): Booking {
  return booking;
}

function bookingSport(booking: Booking): CourtSport | undefined {
  return booking.sport;
}

function toBookingPayloadList(body: unknown): Partial<Booking>[] {
  if (Array.isArray(body)) return body as Partial<Booking>[];
  if (body && typeof body === "object" && Array.isArray((body as { items?: unknown[] }).items)) {
    return (body as { items: Partial<Booking>[] }).items;
  }
  return [body as Partial<Booking>];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const courtId = searchParams.get("court_id");
  const date = searchParams.get("date");
  const playerEmail = searchParams.get("player_email");
  const manageable = searchParams.get("manageable") === "true";
  const sport = searchParams.get("sport") as CourtSport | null;
  const bookingGroupId = searchParams.get("booking_group_id");

  let allowedCourtIds: string[] | undefined;
  let manageableViewer: Awaited<ReturnType<typeof readSessionUser>> = null;

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    manageableViewer = user;
    if (user.role === "admin") {
      const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
      const venueIds = [...new Set(assignments.map((assignment) => assignment.venue_id))];
      if (venueIds.length === 0) {
        return NextResponse.json([]);
      }
      allowedCourtIds = await listCourtIdsByVenueIds(venueIds);
      if (allowedCourtIds.length === 0) {
        return NextResponse.json([]);
      }
    }
  }

  let list = await listBookingsFiltered({
    courtIds: allowedCourtIds,
    bookingGroupId: bookingGroupId ?? undefined,
    courtId: courtId ?? undefined,
    date: date ?? undefined,
    playerEmail: playerEmail ?? undefined,
  });
  if (sport) list = list.filter((booking) => bookingSport(booking) === sport);

  list.sort((a, b) =>
    String(b.created_date ?? "").localeCompare(String(a.created_date ?? "")),
  );
  const viewerForMobile = manageable ? manageableViewer : null;
  const hydrated = list.map(hydrateBooking);
  const enriched = await enrichBookingsWithProfileMobile(hydrated, viewerForMobile);
  return NextResponse.json(
    enriched.map((b) =>
      applyPlayerMobileVisibility(hydrateBooking(b), viewerForMobile),
    ),
  );
}

export async function POST(req: Request) {
  const sessionUser = await readSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestBody = await req.json();
  const isBulkRequest =
    requestBody && typeof requestBody === "object" && Array.isArray((requestBody as { items?: unknown[] }).items);
  const payloads = toBookingPayloadList(requestBody);
  if (payloads.length === 0) {
    return NextResponse.json({ error: "At least one booking is required." }, { status: 400 });
  }
  const [courts, venues] = await Promise.all([listCourts(), listVenues()]);
  const bookings: Booking[] = [];
  const bookingVenuePairs: Array<{ venueId: string; venueName: string; courtName: string }> = [];

  for (const body of payloads) {
    const court = courts.find((row) => row.id === body.court_id);
    const venue = court ? venues.find((row) => row.id === court.venue_id) : null;
    if (!court || !venue) {
      return NextResponse.json({ error: "Court not found" }, { status: 404 });
    }
    if (court.status !== "active" || venue.status !== "active") {
      return NextResponse.json(
        { error: "This venue/court is inactive and cannot be booked." },
        { status: 409 },
      );
    }
    const courtBookingFee = undefined;

    let court_subtotal = body.court_subtotal;
    let booking_fee = body.booking_fee;
    let total_cost = body.total_cost;

    const hasFullSplit =
      typeof court_subtotal === "number" &&
      typeof booking_fee === "number" &&
      typeof total_cost === "number";

    if (!hasFullSplit) {
      if (typeof court_subtotal === "number") {
        const split = splitBookingAmounts(court_subtotal, courtBookingFee);
        booking_fee = split.booking_fee;
        total_cost = split.total_cost;
      } else if (typeof total_cost === "number") {
        const normalizedFee =
          typeof courtBookingFee === "number" ? Math.max(0, Math.trunc(courtBookingFee)) : 0;
        const subtotalFromTotal = Math.max(0, total_cost - normalizedFee);
        const split = splitBookingAmounts(subtotalFromTotal, courtBookingFee);
        court_subtotal = split.court_subtotal;
        booking_fee = split.booking_fee;
        total_cost = split.total_cost;
      }
    }

    bookings.push({
      id: "",
      court_id: body.court_id as string,
      court_name: body.court_name,
      establishment_name: venue.name,
      sport: body.sport ?? venue.sport,
      booking_group_id: body.booking_group_id,
      date: body.date as string,
      start_time: body.start_time as string,
      end_time: body.end_time as string,
      player_name: body.player_name,
      player_email: body.player_email,
      players_count: body.players_count,
      court_subtotal,
      booking_fee,
      total_cost,
      status: (body.status as Booking["status"]) ?? "confirmed",
      notes: body.notes,
      created_date: "",
    });
    bookingVenuePairs.push({
      venueId: venue.id,
      venueName: venue.name,
      courtName: court.name ?? "Court",
    });
  }

  const rows = bookings.map((booking) => ({
    user_id: sessionUser.id,
    court_id: booking.court_id,
    booking_group_id: booking.booking_group_id ?? null,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    player_name: booking.player_name ?? null,
    player_email: booking.player_email ?? null,
    players_count: booking.players_count ?? null,
    court_subtotal: booking.court_subtotal ?? null,
    booking_fee: booking.booking_fee ?? null,
    total_cost: booking.total_cost ?? null,
    status: booking.status,
    notes: booking.notes ?? null,
  }));

  const insertedRows = (rows.length === 1
    ? [await insertRow("bookings", rows[0])]
    : await insertRows("bookings", rows)) as Array<{ id: string; created_at: string }>;

  const result = bookings.map((booking, index) =>
    hydrateBooking({
      ...booking,
      id: insertedRows[index]?.id ?? "",
      created_date: insertedRows[index]?.created_at ?? "",
    }),
  );

  for (const [index, inserted] of insertedRows.entries()) {
    const meta = bookingVenuePairs[index];
    if (!meta) continue;
    void emitBookingCreatedToVenueAdmins({
      venueId: meta.venueId,
      venueName: meta.venueName,
      courtName: meta.courtName,
      bookingId: inserted.id,
      bookerLabel: sessionUser.full_name?.trim() || sessionUser.email,
      bookerUserId: sessionUser.id,
    });
  }

  return NextResponse.json(isBulkRequest ? result : rows.length === 1 ? result[0] : result);
}
