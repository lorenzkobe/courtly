import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";
import type { TournamentRegistration } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: tournamentId } = await ctx.params;
  const tournament = mockDb.tournaments.find((t) => t.id === tournamentId);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    player_name: string;
    player_email: string;
    partner_name?: string;
    skill_level: TournamentRegistration["skill_level"];
  };

  const reg: TournamentRegistration = {
    id: `reg-${crypto.randomUUID().slice(0, 8)}`,
    tournament_id: tournamentId,
    tournament_name: tournament.name,
    player_name: body.player_name,
    player_email: body.player_email,
    partner_name: body.partner_name,
    skill_level: body.skill_level ?? "intermediate",
    status: "registered",
    created_date: new Date().toISOString(),
  };
  mockDb.registrations.push(reg);

  const idx = mockDb.tournaments.findIndex((t) => t.id === tournamentId);
  if (idx !== -1) {
    mockDb.tournaments[idx] = {
      ...mockDb.tournaments[idx],
      current_participants: (mockDb.tournaments[idx].current_participants ?? 0) + 1,
    };
  }

  return NextResponse.json(reg);
}
