import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  listBookingsFiltered,
  listTournamentRegistrationsByPlayer,
} from "@/lib/data/courtly-db";
import type { CourtSport } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") as CourtSport | null;

  const [bookings, registrations] = await Promise.all([
    listBookingsFiltered({ playerEmail: user.email }),
    listTournamentRegistrationsByPlayer(user.email),
  ]);

  return NextResponse.json({
    bookings: sport ? bookings.filter((booking) => booking.sport === sport) : bookings,
    registrations,
  });
}
