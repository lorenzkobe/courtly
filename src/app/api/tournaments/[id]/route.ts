import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";
import type { CourtSport, Tournament } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") as CourtSport | null;
  const { id } = await ctx.params;
  const tournament = mockDb.tournaments.find((row) => row.id === id);
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sport && tournament.sport !== sport) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(tournament);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idx = mockDb.tournaments.findIndex((row) => row.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = (await req.json()) as Partial<Tournament>;
  mockDb.tournaments[idx] = { ...mockDb.tournaments[idx], ...patch };
  return NextResponse.json(mockDb.tournaments[idx]);
}
