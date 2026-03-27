import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";
import type { CourtSport } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit")) || undefined;
  const sort = searchParams.get("sort") ?? "date";
  const sport = searchParams.get("sport") as CourtSport | null;

  let list = [...mockDb.tournaments];
  if (sport) {
    list = list.filter((tournament) => tournament.sport === sport);
  }
  if (status) {
    list = list.filter((tournament) => tournament.status === status);
  }
  list.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return sort.startsWith("-") ? -cmp : cmp;
  });
  if (limit) list = list.slice(0, limit);
  return NextResponse.json(list);
}
