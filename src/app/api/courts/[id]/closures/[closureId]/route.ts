import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import {
  deleteRow,
  listCourtClosures,
  listCourts,
  listVenueAdminAssignments,
  updateRow,
} from "@/lib/data/courtly-db";
import type { CourtClosure } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string; closureId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id: courtId, closureId } = await ctx.params;
  const [courts, closures, assignments] = await Promise.all([
    listCourts(),
    listCourtClosures(),
    listVenueAdminAssignments(),
  ]);
  const court = courts.find((row) => row.id === courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cur = closures.find(
    (closure) => closure.id === closureId && closure.court_id === courtId,
  );
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Partial<CourtClosure>;
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

  const updated = await updateRow("court_closures", closureId, {
    date,
    start_time,
    end_time,
    reason,
    note: note ?? null,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id: courtId, closureId } = await ctx.params;
  const [courts, closures, assignments] = await Promise.all([
    listCourts(),
    listCourtClosures(),
    listVenueAdminAssignments(),
  ]);
  const court = courts.find((row) => row.id === courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const idx = closures.findIndex(
    (closure) => closure.id === closureId && closure.court_id === courtId,
  );
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteRow("court_closures", closureId);
  return NextResponse.json({ ok: true });
}
