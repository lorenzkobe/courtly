import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";
import type { OpenPlaySession } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idx = mockDb.openPlay.findIndex((session) => session.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = (await req.json()) as Partial<OpenPlaySession>;
  mockDb.openPlay[idx] = { ...mockDb.openPlay[idx], ...patch };
  return NextResponse.json(mockDb.openPlay[idx]);
}
