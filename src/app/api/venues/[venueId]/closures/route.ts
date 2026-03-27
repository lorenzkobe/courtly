import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import { timeRangesOverlap } from "@/lib/booking-overlap";
import type { VenueClosure } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const venue = mockDb.venues.find((v) => v.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (date) {
    const list = mockDb.venueClosures.filter(
      (c) => c.venue_id === venueId && c.date === date,
    );
    return NextResponse.json(list);
  }

  const user = await readSessionUser();
  if (!user || !canMutateVenue(user, venueId, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const list = mockDb.venueClosures
    .filter((c) => c.venue_id === venueId)
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.start_time.localeCompare(b.start_time);
    });
  return NextResponse.json(list);
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const venue = mockDb.venues.find((v) => v.id === venueId);
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateVenue(user, venueId, mockDb.venueAdminAssignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<VenueClosure>;
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const start_time = typeof body.start_time === "string" ? body.start_time.trim() : "";
  const end_time = typeof body.end_time === "string" ? body.end_time.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

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

  const courtIds = new Set(
    mockDb.courts.filter((c) => c.venue_id === venueId).map((c) => c.id),
  );
  const conflicts = mockDb.bookings.some(
    (b) =>
      courtIds.has(b.court_id) &&
      b.date === date &&
      b.status === "confirmed" &&
      timeRangesOverlap(b.start_time, b.end_time, start_time, end_time),
  );
  if (conflicts) {
    return NextResponse.json(
      {
        error:
          "Cannot mark this time unavailable — a confirmed booking on one of this venue’s courts overlaps it. Cancel or reschedule the booking first.",
      },
      { status: 409 },
    );
  }

  const row: VenueClosure = {
    id: `vclos-${crypto.randomUUID().slice(0, 8)}`,
    venue_id: venueId,
    date,
    start_time,
    end_time,
    reason,
    note: typeof body.note === "string" ? body.note.trim() || undefined : undefined,
    created_at: new Date().toISOString(),
  };
  mockDb.venueClosures.push(row);
  return NextResponse.json(row);
}
