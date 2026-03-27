import { NextResponse } from "next/server";
import { listOpenPlay, updateRow } from "@/lib/data/courtly-db";
import type { OpenPlaySession } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sessions = await listOpenPlay();
  const existing = sessions.find((session) => session.id === id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = (await req.json()) as Partial<OpenPlaySession>;
  const updated = await updateRow<OpenPlaySession>("open_play_sessions", id, patch);
  return NextResponse.json(updated);
}
