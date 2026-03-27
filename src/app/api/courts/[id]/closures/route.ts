import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateCourt } from "@/lib/auth/management";
import {
  insertRow,
  listBookings,
  listCourtClosures,
  listCourts,
  listVenueAdminAssignments,
} from "@/lib/data/courtly-db";
import { timeRangesOverlap } from "@/lib/booking-overlap";
import type { CourtClosure } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

/** Public: `?date=yyyy-MM-dd` for that day. Authenticated venue/superadmin: all blocks for the court. */
export async function GET(req: Request, ctx: Ctx) {
  const { id: courtId } = await ctx.params;
  const [courts, closures, assignments] = await Promise.all([
    listCourts(),
    listCourtClosures(),
    listVenueAdminAssignments(),
  ]);
  const court = courts.find((row) => row.id === courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (date) {
    const list = closures.filter(
      (closure) => closure.court_id === courtId && closure.date === date,
    );
    return NextResponse.json(list);
  }

  const user = await readSessionUser();
  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const list = closures
    .filter((closure) => closure.court_id === courtId)
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.start_time.localeCompare(b.start_time);
    });
  return NextResponse.json(list);
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id: courtId } = await ctx.params;
  const [courts, assignments, bookings] = await Promise.all([
    listCourts(),
    listVenueAdminAssignments(),
    listBookings(),
  ]);
  const court = courts.find((row) => row.id === courtId);
  if (!court) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user || !canMutateCourt(user, court, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<CourtClosure>;
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

  const conflicts = bookings.some(
    (booking) =>
      booking.court_id === courtId &&
      booking.date === date &&
      booking.status === "confirmed" &&
      timeRangesOverlap(
        booking.start_time,
        booking.end_time,
        start_time,
        end_time,
      ),
  );
  if (conflicts) {
    return NextResponse.json(
      {
        error:
          "Cannot mark this time unavailable — a confirmed booking overlaps it. Cancel or reschedule the booking first.",
      },
      { status: 409 },
    );
  }

  const row = {
    court_id: courtId,
    date,
    start_time,
    end_time,
    reason,
    note: typeof body.note === "string" ? body.note.trim() || null : null,
  };
  const inserted = await insertRow("court_closures", row);
  return NextResponse.json(inserted as CourtClosure);
}
