import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  listBookingsByPlayerOnDate,
  listOpenPlayByStatus,
  listOpenTournaments,
} from "@/lib/data/courtly-db";
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

  const [todayBookings, tournamentsOpen, openPlaySessions] = await Promise.all([
    listBookingsByPlayerOnDate(user.email, effectiveDate, sport),
    listOpenTournaments(sport, 2),
    listOpenPlayByStatus("open", sport, 3),
  ]);

  todayBookings.sort(byCreatedDesc);

  const payload: DashboardOverviewResponse = {
    today_bookings: todayBookings,
    tournaments_open: tournamentsOpen,
    open_play_sessions: openPlaySessions,
  };

  return NextResponse.json(payload);
}
