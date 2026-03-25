import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";
import type { Tournament } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const t = mockDb.tournaments.find((x) => x.id === id);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idx = mockDb.tournaments.findIndex((x) => x.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = (await req.json()) as Partial<Tournament>;
  mockDb.tournaments[idx] = { ...mockDb.tournaments[idx], ...patch };
  return NextResponse.json(mockDb.tournaments[idx]);
}
