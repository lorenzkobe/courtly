import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listBookings, listOpenPlay, listTournaments } from "@/lib/data/courtly-db";
import type { CourtSport, DashboardOverviewResponse } from "@/lib/types/courtly";

function byCreatedDesc<T extends { created_date?: string }>(left: T, right: T) {
  return String(right.created_date ?? "").localeCompare(String(left.created_date ?? ""));
}

export async function GET(req: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") as CourtSport | null;
  const date = searchParams.get("date");

  const nowDate = new Date().toISOString().slice(0, 10);
  const effectiveDate = date || nowDate;

  const [bookings, tournaments, openPlay] = await Promise.all([
    listBookings(),
    listTournaments(),
    listOpenPlay(),
  ]);

  const todayBookings = bookings
    .filter((booking) => booking.player_email === user.email)
    .filter((booking) => booking.date === effectiveDate)
    .filter((booking) => (sport ? booking.sport === sport : true))
    .sort(byCreatedDesc);

  const tournamentsOpen = tournaments
    .filter((tournament) => tournament.status === "registration_open")
    .filter((tournament) => (sport ? tournament.sport === sport : true))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 2);

  const openPlaySessions = openPlay
    .filter((session) => session.status === "open")
    .filter((session) => (sport ? session.sport === sport : true))
    .sort((left, right) => {
      const dateCmp = left.date.localeCompare(right.date);
      if (dateCmp !== 0) return dateCmp;
      return left.start_time.localeCompare(right.start_time);
    })
    .slice(0, 3);

  const payload: DashboardOverviewResponse = {
    today_bookings: todayBookings,
    tournaments_open: tournamentsOpen,
    open_play_sessions: openPlaySessions,
  };

  return NextResponse.json(payload);
}
