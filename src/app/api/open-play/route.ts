import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";
import type { CourtSport } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit")) || undefined;
  const sport = searchParams.get("sport") as CourtSport | null;

  let list = [...mockDb.openPlay];
  if (sport) {
    list = list.filter((session) => session.sport === sport);
  }
  if (status) list = list.filter((session) => session.status === status);
  list.sort((a, b) => a.date.localeCompare(b.date));
  if (limit) list = list.slice(0, limit);
  return NextResponse.json(list);
}
