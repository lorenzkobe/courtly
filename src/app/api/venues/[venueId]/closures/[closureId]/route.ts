import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { VenueClosure } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string; closureId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId, closureId } = await ctx.params;
  const venue = mockDb.venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateVenue(user, venueId, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const idx = mockDb.venueClosures.findIndex(
    (closure) => closure.id === closureId && closure.venue_id === venueId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Partial<VenueClosure>;
  const cur = mockDb.venueClosures[idx]!;
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

  mockDb.venueClosures[idx] = {
    ...cur,
    date,
    start_time,
    end_time,
    reason,
    note,
  };
  return NextResponse.json(mockDb.venueClosures[idx]);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId, closureId } = await ctx.params;
  const venue = mockDb.venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateVenue(user, venueId, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const idx = mockDb.venueClosures.findIndex(
    (closure) => closure.id === closureId && closure.venue_id === venueId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  mockDb.venueClosures.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
