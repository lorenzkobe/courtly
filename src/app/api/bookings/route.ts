import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import { splitBookingAmounts } from "@/lib/platform-fee";
import { insertRow, listBookings, listCourts, listVenueAdminAssignments, listVenues } from "@/lib/data/courtly-db";
import { emitBookingCreatedToVenueAdmins } from "@/lib/notifications/emit-from-server";
import type { Booking, CourtSport } from "@/lib/types/courtly";

function hydrateBooking(booking: Booking): Booking {
  return booking;
}

function bookingSport(booking: Booking): CourtSport | undefined {
  return booking.sport;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const courtId = searchParams.get("court_id");
  const date = searchParams.get("date");
  const playerEmail = searchParams.get("player_email");
  const manageable = searchParams.get("manageable") === "true";
  const sport = searchParams.get("sport") as CourtSport | null;
  const bookingGroupId = searchParams.get("booking_group_id");

  const [bookings, courts, assignments] = await Promise.all([
    listBookings(),
    listCourts(),
    listVenueAdminAssignments(),
  ]);
  let list = [...bookings];

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ids = new Set(
      manageableCourtIds(user, courts, assignments),
    );
    list = list.filter((booking) => ids.has(booking.court_id));
  }

  if (bookingGroupId) {
    list = list.filter((booking) => booking.booking_group_id === bookingGroupId);
  }
  if (courtId) list = list.filter((booking) => booking.court_id === courtId);
  if (date) list = list.filter((booking) => booking.date === date);
  if (playerEmail) list = list.filter((booking) => booking.player_email === playerEmail);
  if (sport) list = list.filter((booking) => bookingSport(booking) === sport);

  list.sort((a, b) =>
    String(b.created_date ?? "").localeCompare(String(a.created_date ?? "")),
  );
  return NextResponse.json(list.map(hydrateBooking));
}

export async function POST(req: Request) {
  const sessionUser = await readSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<Booking>;
  const [courts, venues] = await Promise.all([listCourts(), listVenues()]);
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

  const booking: Booking = {
    id: "",
    court_id: body.court_id as string,
    court_name: body.court_name,
    establishment_name: court
      ? venue.name
      : undefined,
    sport:
      body.sport ??
      (court ? venue.sport : undefined),
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
  };
  const inserted = (await insertRow("bookings", {
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
  })) as { id: string; created_at: string };

  void emitBookingCreatedToVenueAdmins({
    venueId: venue.id,
    venueName: venue.name,
    courtName: court.name ?? "Court",
    bookingId: inserted.id,
    bookerLabel: sessionUser.full_name?.trim() || sessionUser.email,
    bookerUserId: sessionUser.id,
  });

  return NextResponse.json(
    hydrateBooking({
      ...booking,
      id: inserted.id,
      created_date: inserted.created_at,
    }),
  );
}
