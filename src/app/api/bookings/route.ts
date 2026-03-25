import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { Booking } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const courtId = searchParams.get("court_id");
  const date = searchParams.get("date");
  const playerEmail = searchParams.get("player_email");
  const manageable = searchParams.get("manageable") === "true";

  let list = [...mockDb.bookings];

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ids = new Set(manageableCourtIds(user, mockDb.courts));
    list = list.filter((b) => ids.has(b.court_id));
  }

  if (courtId) list = list.filter((b) => b.court_id === courtId);
  if (date) list = list.filter((b) => b.date === date);
  if (playerEmail) list = list.filter((b) => b.player_email === playerEmail);

  list.sort((a, b) =>
    String(b.created_date ?? "").localeCompare(String(a.created_date ?? "")),
  );
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Booking>;
  const id = `book-${crypto.randomUUID().slice(0, 8)}`;
  const booking: Booking = {
    id,
    court_id: body.court_id as string,
    court_name: body.court_name,
    date: body.date as string,
    start_time: body.start_time as string,
    end_time: body.end_time as string,
    player_name: body.player_name,
    player_email: body.player_email,
    players_count: body.players_count,
    total_cost: body.total_cost,
    status: (body.status as Booking["status"]) ?? "confirmed",
    notes: body.notes,
    created_date: new Date().toISOString(),
  };
  mockDb.bookings.push(booking);
  return NextResponse.json(booking);
}
