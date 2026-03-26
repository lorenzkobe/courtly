import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { CourtClosure } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string; closureId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id: courtId, closureId } = await ctx.params;
  const court = mockDb.courts.find((c) => c.id === courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateCourt(user, court, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const idx = mockDb.courtClosures.findIndex(
    (c) => c.id === closureId && c.court_id === courtId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Partial<CourtClosure>;
  const cur = mockDb.courtClosures[idx]!;
  const date =
    typeof body.date === "string" ? body.date.trim() : cur.date;
  const start_time =
    typeof body.start_time === "string" ? body.start_time.trim() : cur.start_time;
  const end_time =
    typeof body.end_time === "string" ? body.end_time.trim() : cur.end_time;
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : cur.reason;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
    return NextResponse.json({ error: "Invalid times" }, { status: 400 });
  }
  if (start_time >= end_time) {
    return NextResponse.json(
      { error: "End time must be after start time" },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  const note =
    body.note !== undefined
      ? typeof body.note === "string"
        ? body.note.trim() || undefined
        : cur.note
      : cur.note;

  mockDb.courtClosures[idx] = {
    ...cur,
    date,
    start_time,
    end_time,
    reason,
    note,
  };
  return NextResponse.json(mockDb.courtClosures[idx]);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id: courtId, closureId } = await ctx.params;
  const court = mockDb.courts.find((c) => c.id === courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateCourt(user, court, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const idx = mockDb.courtClosures.findIndex(
    (c) => c.id === closureId && c.court_id === courtId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  mockDb.courtClosures.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
