import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import {
  insertRows,
  listCourtsByVenue,
  listVenueAdminAssignmentsByVenue,
} from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ venueId: string }> };

type BulkClosurePayload = {
  date?: string;
  reason?: string;
  note?: string;
  court_ids?: string[];
  ranges?: Array<{ start_time: string; end_time: string }>;
};

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const assignments = await listVenueAdminAssignmentsByVenue(venueId);
  if (!user || !canMutateVenue(user, venueId, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as BulkClosurePayload;
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const courtIds = Array.isArray(body.court_ids)
    ? body.court_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const ranges = Array.isArray(body.ranges) ? body.ranges : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }
  if (courtIds.length === 0 || ranges.length === 0) {
    return NextResponse.json(
      { error: "At least one court and one time range are required" },
      { status: 400 },
    );
  }

  const venueCourts = await listCourtsByVenue(venueId);
  const allowedCourtIds = new Set(venueCourts.map((court) => court.id));
  if (courtIds.some((courtId) => !allowedCourtIds.has(courtId))) {
    return NextResponse.json(
      { error: "One or more selected courts do not belong to this venue" },
      { status: 400 },
    );
  }

  const rows = [];
  for (const courtId of courtIds) {
    for (const range of ranges) {
      const startTime =
        typeof range.start_time === "string" ? range.start_time.trim() : "";
      const endTime = typeof range.end_time === "string" ? range.end_time.trim() : "";
      if (!startTime || !endTime) continue;
      rows.push({
        court_id: courtId,
        date,
        start_time: startTime,
        end_time: endTime,
        reason,
        note: note || null,
      });
    }
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid ranges provided" }, { status: 400 });
  }

  await insertRows("court_closures", rows);
  return NextResponse.json({ ok: true });
}
