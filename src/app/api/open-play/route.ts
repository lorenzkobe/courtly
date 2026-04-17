import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getCourtById,
  insertRow,
  listBookingsFiltered,
  listOpenPlayJoinRequestsByUser,
  listOpenPlay,
  listOpenPlaySessionsByBookingGroupId,
  listOpenPlaySessionsByHostUserId,
  getOpenPlaySessionByBookingGroupAndCourt,
} from "@/lib/data/courtly-db";
import { bookingSegmentStartMs } from "@/lib/bookings/booking-time-display";
import { isValidPhMobile } from "@/lib/validation/person-fields";
import type { CourtSport } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const user = await readSessionUser();
  const { searchParams } = new URL(req.url);
  const bookingGroupId = searchParams.get("booking_group_id")?.trim();
  const hostedByMe = searchParams.get("hosted_by_me") === "true";
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit")) || undefined;
  const sport = searchParams.get("sport") as CourtSport | null;

  if (bookingGroupId) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const segments = await listBookingsFiltered({ bookingGroupId });
    const owns = segments.some(
      (segment) =>
        segment.user_id === user.id ||
        segment.player_email?.trim().toLowerCase() === user.email.trim().toLowerCase(),
    );
    if (!owns) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const groupSessions = await listOpenPlaySessionsByBookingGroupId(bookingGroupId);
    return NextResponse.json(groupSessions);
  }

  if (hostedByMe) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let list = await listOpenPlaySessionsByHostUserId(user.id);
    if (sport) {
      list = list.filter((session) => session.sport === sport);
    }
    if (status) list = list.filter((session) => session.status === status);
    list.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
    if (limit) list = list.slice(0, limit);
    return NextResponse.json(list);
  }

  let list = await listOpenPlay();
  if (sport) {
    list = list.filter((session) => session.sport === sport);
  }
  if (status) list = list.filter((session) => session.status === status);
  list.sort((a, b) => a.date.localeCompare(b.date));
  if (limit) list = list.slice(0, limit);
  if (user && list.length > 0) {
    const requests = await listOpenPlayJoinRequestsByUser(
      user.id,
      list.map((session) => session.id),
    );
    const latestBySession = new Map<string, (typeof requests)[number]>();
    for (const request of requests) {
      if (!latestBySession.has(request.open_play_session_id)) {
        latestBySession.set(request.open_play_session_id, request);
      }
    }
    list = list.map((session) => ({
      ...session,
      current_user_request_status:
        latestBySession.get(session.id)?.status ?? null,
    }));
  }
  return NextResponse.json(list);
}

type CreateOpenPlayPayload = {
  booking_group_id?: string;
  court_ids?: string[];
  title?: string;
  max_players?: number;
  price_per_player?: number;
  dupr_min?: number;
  dupr_max?: number;
  description?: string;
  accepts_gcash?: boolean;
  gcash_account_name?: string;
  gcash_account_number?: string;
  accepts_maya?: boolean;
  maya_account_name?: string;
  maya_account_number?: string;
};

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateOpenPlayPayload;
  const bookingGroupId = body.booking_group_id?.trim();
  const title = body.title?.trim();
  const duprMin = Number(body.dupr_min);
  const duprMax = Number(body.dupr_max);
  const maxPlayers = Number(body.max_players);
  const pricePerPlayer = Number(body.price_per_player ?? 0);
  const acceptsGcash = Boolean(body.accepts_gcash);
  const acceptsMaya = Boolean(body.accepts_maya);
  const gcashAccountName = body.gcash_account_name?.trim() ?? "";
  const gcashAccountNumber = body.gcash_account_number?.trim() ?? "";
  const mayaAccountName = body.maya_account_name?.trim() ?? "";
  const mayaAccountNumber = body.maya_account_number?.trim() ?? "";

  if (!bookingGroupId || !title) {
    return NextResponse.json(
      { error: "booking_group_id and title are required" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2) {
    return NextResponse.json(
      { error: "max_players must be a whole number (minimum 2)" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(pricePerPlayer) || pricePerPlayer < 0) {
    return NextResponse.json(
      { error: "price_per_player must be a whole number (0 or higher)" },
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(duprMin) ||
    !Number.isInteger(duprMax) ||
    duprMin < 2 ||
    duprMax > 8 ||
    duprMin > duprMax
  ) {
    return NextResponse.json(
      { error: "DUPR range must use whole numbers between 2 and 8" },
      { status: 400 },
    );
  }
  if (pricePerPlayer > 0 && !acceptsGcash && !acceptsMaya) {
    return NextResponse.json(
      { error: "At least one payment method is required when price is above 0" },
      { status: 400 },
    );
  }
  if (acceptsGcash && (!gcashAccountName || !gcashAccountNumber)) {
    return NextResponse.json(
      { error: "GCash account name and number are required when enabled" },
      { status: 400 },
    );
  }
  if (acceptsGcash && !isValidPhMobile(gcashAccountNumber)) {
    return NextResponse.json(
      { error: "GCash account number must be a valid PH mobile number" },
      { status: 400 },
    );
  }
  if (acceptsMaya && (!mayaAccountName || !mayaAccountNumber)) {
    return NextResponse.json(
      { error: "Maya account name and number are required when enabled" },
      { status: 400 },
    );
  }
  if (acceptsMaya && !isValidPhMobile(mayaAccountNumber)) {
    return NextResponse.json(
      { error: "Maya account number must be a valid PH mobile number" },
      { status: 400 },
    );
  }

  const segments = (await listBookingsFiltered({ bookingGroupId })).sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  );
  if (segments.length === 0) {
    return NextResponse.json({ error: "Booking group not found" }, { status: 404 });
  }
  if (segments.some((segment) => segment.status !== "confirmed")) {
    return NextResponse.json(
      { error: "Only confirmed booking groups can create open play" },
      { status: 409 },
    );
  }
  const ownsBooking = segments.some(
    (segment) =>
      segment.user_id === user.id ||
      segment.player_email?.trim().toLowerCase() === user.email.trim().toLowerCase(),
  );
  if (!ownsBooking) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const distinctCourtIds = [...new Set(segments.map((s) => s.court_id))];
  const requestedCourtIds =
    Array.isArray(body.court_ids) && body.court_ids.length > 0
      ? [...new Set(body.court_ids.map((id) => id.trim()).filter(Boolean))]
      : distinctCourtIds;

  for (const courtId of requestedCourtIds) {
    if (!distinctCourtIds.includes(courtId)) {
      return NextResponse.json(
        { error: "court_ids must match courts in this booking" },
        { status: 400 },
      );
    }
  }

  for (const courtId of requestedCourtIds) {
    const existing = await getOpenPlaySessionByBookingGroupAndCourt(bookingGroupId, courtId);
    if (existing) {
      return NextResponse.json(
        { error: "Open play already exists for one of the selected courts" },
        { status: 409 },
      );
    }
  }

  const nowMs = Date.now();
  for (const courtId of requestedCourtIds) {
    const courtSegments = segments
      .filter((s) => s.court_id === courtId)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const first = courtSegments[0]!;
    const startMs = bookingSegmentStartMs(first);
    if (!Number.isFinite(startMs) || nowMs >= startMs) {
      return NextResponse.json(
        { error: "Open play can only be created before the booked time begins" },
        { status: 409 },
      );
    }
  }

  const createdSessions: Awaited<ReturnType<typeof insertRow>>[] = [];

  for (const courtId of requestedCourtIds) {
    const courtSegments = segments
      .filter((s) => s.court_id === courtId)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const first = courtSegments[0]!;
    const last = courtSegments[courtSegments.length - 1]!;
    const court = await getCourtById(courtId);

    const row = await insertRow("open_play_sessions", {
      sport: first.sport ?? "pickleball",
      title,
      date: first.date,
      start_time: first.start_time,
      end_time: last.end_time,
      skill_level: "all_levels",
      location: court?.location ?? first.establishment_name ?? "TBD",
      court_id: courtId,
      max_players: maxPlayers,
      current_players: 0,
      host_user_id: user.id,
      host_name: user.full_name,
      host_email: user.email,
      description: body.description?.trim() || null,
      fee: pricePerPlayer,
      price_per_player: pricePerPlayer,
      dupr_min: duprMin,
      dupr_max: duprMax,
      booking_group_id: bookingGroupId,
      accepts_gcash: acceptsGcash,
      gcash_account_name: acceptsGcash ? gcashAccountName : null,
      gcash_account_number: acceptsGcash ? gcashAccountNumber : null,
      accepts_maya: acceptsMaya,
      maya_account_name: acceptsMaya ? mayaAccountName : null,
      maya_account_number: acceptsMaya ? mayaAccountNumber : null,
      status: "open",
    });
    createdSessions.push(row);
  }

  return NextResponse.json({ sessions: createdSessions }, { status: 201 });
}
