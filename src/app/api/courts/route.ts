import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import { normalizeBookingFee } from "@/lib/platform-fee";
import { reviewSummaryForCourt } from "@/lib/review-summary";
import type { Court, CourtRateWindow, CourtSport } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const manageable = searchParams.get("manageable") === "true";
  const sport = searchParams.get("sport") as CourtSport | null;

  let list = [...mockDb.courts];

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ids = new Set(manageableCourtIds(user, list));
    list = list.filter((c) => ids.has(c.id));
  }

  if (status) {
    list = list.filter((c) => c.status === status);
  }

  if (sport) {
    list = list.filter((c) => c.sport === sport);
  }

  return NextResponse.json(
    list.map((c) => ({
      ...c,
      establishment_name: c.court_account_id
        ? mockDb.courtAccounts.find((a) => a.id === c.court_account_id)?.name
        : undefined,
      review_summary: reviewSummaryForCourt(c.id, mockDb.courtReviews),
    })),
  );
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Court>;
  const id = `court-${crypto.randomUUID().slice(0, 8)}`;
  const managed_by_user_id = user.id;
  const mu = mockDb.managedUsers.find((m) => m.id === user.id);
  const court_account_id = mu?.court_account_id ?? null;
  if (!court_account_id) {
    return NextResponse.json(
      { error: "Admin must be linked to an establishment before creating courts" },
      { status: 400 },
    );
  }

  const court: Court = {
    id,
    name: body.name ?? "New court",
    location: body.location ?? "",
    sport: (body.sport as Court["sport"]) ?? "pickleball",
    type: (body.type as Court["type"]) ?? "indoor",
    surface: (body.surface as Court["surface"]) ?? "sport_court",
    image_url: body.image_url ?? "",
    hourly_rate: Number(body.hourly_rate) || 0,
    booking_fee: normalizeBookingFee(body.booking_fee),
    amenities: Array.isArray(body.amenities) ? body.amenities : [],
    available_hours: body.available_hours ?? { open: "07:00", close: "22:00" },
    status: (body.status as Court["status"]) ?? "active",
    managed_by_user_id,
    court_account_id,
  };
  if (Array.isArray(body.hourly_rate_windows)) {
    court.hourly_rate_windows = body.hourly_rate_windows.filter(
      (w): w is CourtRateWindow =>
        w != null &&
        typeof w === "object" &&
        typeof (w as { start?: string }).start === "string" &&
        typeof (w as { end?: string }).end === "string" &&
        typeof (w as { hourly_rate?: number }).hourly_rate === "number",
    );
  }
  if (typeof body.description === "string") {
    court.description = body.description;
  }
  if (Array.isArray(body.gallery_urls)) {
    court.gallery_urls = body.gallery_urls.filter(
      (u): u is string => typeof u === "string",
    );
  }
  if (typeof body.map_latitude === "number" && Number.isFinite(body.map_latitude)) {
    court.map_latitude = body.map_latitude;
  }
  if (typeof body.map_longitude === "number" && Number.isFinite(body.map_longitude)) {
    court.map_longitude = body.map_longitude;
  }
  mockDb.courts.push(court);
  // TODO(notifications): emit placeholder event hook for "court created"
  // to superadmin recipients when Supabase notifications are wired.
  return NextResponse.json({
    ...court,
    review_summary: reviewSummaryForCourt(court.id, mockDb.courtReviews),
  });
}
