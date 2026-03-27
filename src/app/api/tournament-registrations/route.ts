import { NextResponse } from "next/server";
import { listTournamentRegistrations } from "@/lib/data/courtly-db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("player_email");

  let list = await listTournamentRegistrations();
  if (email) {
    list = list.filter((registration) => registration.player_email === email);
  }
  list.sort((a, b) =>
    String(b.created_date ?? "").localeCompare(String(a.created_date ?? "")),
  );
  return NextResponse.json(list);
}
