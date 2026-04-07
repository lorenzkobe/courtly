import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import {
  deleteRow,
  getVenueClosureById,
  listVenueAdminAssignments,
  listVenues,
  updateRow,
} from "@/lib/data/courtly-db";
import type { VenueClosure } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string; closureId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId, closureId } = await ctx.params;
  const [venues, cur, assignments] = await Promise.all([
    listVenues(),
    getVenueClosureById(venueId, closureId),
    listVenueAdminAssignments(),
  ]);
  const venue = venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateVenue(user, venueId, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Partial<VenueClosure>;
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

  const updated = await updateRow("venue_closures", closureId, {
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
  const { venueId, closureId } = await ctx.params;
  const [venues, cur, assignments] = await Promise.all([
    listVenues(),
    getVenueClosureById(venueId, closureId),
    listVenueAdminAssignments(),
  ]);
  const venue = venues.find((row) => row.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateVenue(user, venueId, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteRow("venue_closures", closureId);
  return NextResponse.json({ ok: true });
}
