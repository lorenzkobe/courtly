import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import { splitBookingAmounts } from "@/lib/platform-fee";
import { mockDb } from "@/lib/mock/db";
import type { Booking, CourtSport } from "@/lib/types/courtly";

function bookingSport(b: Booking): CourtSport | undefined {
  if (b.sport) return b.sport;
  const court = mockDb.courts.find((c) => c.id === b.court_id);
  return court?.sport;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const courtId = searchParams.get("court_id");
  const date = searchParams.get("date");
  const playerEmail = searchParams.get("player_email");
  const manageable = searchParams.get("manageable") === "true";
  const sport = searchParams.get("sport") as CourtSport | null;
  const bookingGroupId = searchParams.get("booking_group_id");

  let list = [...mockDb.bookings];

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ids = new Set(manageableCourtIds(user, mockDb.courts));
    list = list.filter((b) => ids.has(b.court_id));
  }

  if (bookingGroupId) {
    list = list.filter((b) => b.booking_group_id === bookingGroupId);
  }
  if (courtId) list = list.filter((b) => b.court_id === courtId);
  if (date) list = list.filter((b) => b.date === date);
  if (playerEmail) list = list.filter((b) => b.player_email === playerEmail);
  if (sport) list = list.filter((b) => bookingSport(b) === sport);

  list.sort((a, b) =>
    String(b.created_date ?? "").localeCompare(String(a.created_date ?? "")),
  );
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Booking>;
  const id = `book-${crypto.randomUUID().slice(0, 8)}`;
  const court = mockDb.courts.find((c) => c.id === body.court_id);

  let court_subtotal = body.court_subtotal;
  let platform_fee = body.platform_fee;
  let total_cost = body.total_cost;

  const hasFullSplit =
    typeof court_subtotal === "number" &&
    typeof platform_fee === "number" &&
    typeof total_cost === "number";

  if (!hasFullSplit) {
    if (typeof court_subtotal === "number") {
      const split = splitBookingAmounts(court_subtotal);
      platform_fee = split.platform_fee;
      total_cost = split.total_cost;
    } else if (typeof total_cost === "number") {
      const split = splitBookingAmounts(total_cost);
      court_subtotal = split.court_subtotal;
      platform_fee = split.platform_fee;
      total_cost = split.total_cost;
    }
  }

  const booking: Booking = {
    id,
    court_id: body.court_id as string,
    court_name: body.court_name,
    sport: body.sport ?? court?.sport,
    booking_group_id: body.booking_group_id,
    date: body.date as string,
    start_time: body.start_time as string,
    end_time: body.end_time as string,
    player_name: body.player_name,
    player_email: body.player_email,
    players_count: body.players_count,
    court_subtotal,
    platform_fee,
    total_cost,
    status: (body.status as Booking["status"]) ?? "confirmed",
    notes: body.notes,
    created_date: new Date().toISOString(),
  };
  mockDb.bookings.push(booking);
  return NextResponse.json(booking);
}
