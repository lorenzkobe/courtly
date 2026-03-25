import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { Court } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const court = mockDb.courts.find((c) => c.id === id);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(court);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const idx = mockDb.courts.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const court = mockDb.courts[idx];
  if (!user || !canMutateCourt(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch = (await req.json()) as Partial<Court>;
  if (user.role !== "superadmin" && "managed_by_user_id" in patch) {
    delete patch.managed_by_user_id;
  }

  mockDb.courts[idx] = { ...mockDb.courts[idx], ...patch };
  return NextResponse.json(mockDb.courts[idx]);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const idx = mockDb.courts.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const court = mockDb.courts[idx];
  if (!user || !canMutateCourt(user, court)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  mockDb.courts.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
