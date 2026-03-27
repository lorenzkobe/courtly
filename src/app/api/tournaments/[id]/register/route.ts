import { NextResponse } from "next/server";
import {
  insertRow,
  listTournaments,
  updateRow,
} from "@/lib/data/courtly-db";
import type { TournamentRegistration } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: tournamentId } = await ctx.params;
  const tournaments = await listTournaments();
  const tournament = tournaments.find((row) => row.id === tournamentId);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    player_name: string;
    player_email: string;
    partner_name?: string;
    skill_level: TournamentRegistration["skill_level"];
  };

  const reg = {
    tournament_id: tournamentId,
    player_name: body.player_name,
    player_email: body.player_email,
    partner_name: body.partner_name,
    skill_level: body.skill_level ?? "intermediate",
    status: "registered",
  };
  const inserted = await insertRow("tournament_registrations", reg);
  await updateRow("tournaments", tournamentId, {
    current_participants: (tournament.current_participants ?? 0) + 1,
  });
  const response: TournamentRegistration = {
    ...(inserted as TournamentRegistration),
    tournament_name: tournament.name,
    created_date: new Date().toISOString(),
  };
  return NextResponse.json(response);
}
