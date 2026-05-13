import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  countOpenPlayJoinRequestsBySession,
  deleteRow,
  getCourtById,
  getOpenPlayById,
  getOpenPlayJoinRequestByUser,
  listOpenPlayCommentsBySession,
  listOpenPlayJoinRequestsBySession,
  updateRow,
} from "@/lib/data/courtly-db";
import type { OpenPlaySession } from "@/lib/types/courtly";
import { isValidPhMobile } from "@/lib/validation/person-fields";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getOpenPlayById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [myRequest, requests, comments, counts, court] = await Promise.all([
    getOpenPlayJoinRequestByUser(id, user.id),
    listOpenPlayJoinRequestsBySession(id),
    listOpenPlayCommentsBySession(id),
    countOpenPlayJoinRequestsBySession(id),
    existing.court_id ? getCourtById(existing.court_id) : Promise.resolve(null),
  ]);
  const isHost = existing.host_user_id === user.id;

  return NextResponse.json({
    session: existing,
    court: court ?? null,
    my_request: myRequest,
    pending_requests: isHost
      ? requests.filter((request) => request.status === "pending_approval")
      : [],
    approved_players: requests
      .filter((request) => request.status === "approved")
      .map((request) => ({
        id: request.id,
        user_id: request.user_id,
        user_name: request.user_name ?? null,
        user_dupr_rating:
          typeof request.user_dupr_rating === "number" ? request.user_dupr_rating : null,
      })),
    comments,
    counts: {
      approved: counts.approved,
      pending_approval: counts.pending_approval,
      payment_locked: counts.payment_locked,
      waitlisted: counts.waitlisted,
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getOpenPlayById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isHost = existing.host_user_id === user.id;
  const canMutate = user.role === "superadmin" || isHost;
  if (!canMutate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch = (await req.json()) as Partial<OpenPlaySession>;
  const forbiddenKeys = ["host_user_id", "booking_group_id", "court_id", "sport", "date", "start_time", "end_time"];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      return NextResponse.json({ error: `${key} cannot be changed` }, { status: 400 });
    }
  }
  if (isHost && user.role !== "superadmin") {
    const hostEditableKeys: Array<keyof OpenPlaySession> = [
      "title",
      "description",
      "max_players",
      "price_per_player",
      "dupr_min",
      "dupr_max",
      "accepts_gcash",
      "gcash_account_name",
      "gcash_account_number",
      "accepts_maya",
      "maya_account_name",
      "maya_account_number",
    ];
    const disallowed = Object.keys(patch).filter(
      (key) => !hostEditableKeys.includes(key as keyof OpenPlaySession),
    );
    if (disallowed.length > 0) {
      return NextResponse.json(
        { error: `Organizers can only update payment settings (${disallowed.join(", ")} not allowed)` },
        { status: 403 },
      );
    }
  }
  const nextTitle = Object.prototype.hasOwnProperty.call(patch, "title")
    ? String(patch.title ?? "").trim()
    : String(existing.title ?? "").trim();
  const nextDescription = Object.prototype.hasOwnProperty.call(patch, "description")
    ? String(patch.description ?? "").trim()
    : String(existing.description ?? "").trim();
  const nextMaxPlayers = Object.prototype.hasOwnProperty.call(patch, "max_players")
    ? Number(patch.max_players)
    : Number(existing.max_players);
  const nextPricePerPlayer = Object.prototype.hasOwnProperty.call(patch, "price_per_player")
    ? Number(patch.price_per_player)
    : Number(existing.price_per_player ?? 0);
  const nextDuprMin = Object.prototype.hasOwnProperty.call(patch, "dupr_min")
    ? Math.round(Number(patch.dupr_min) * 100) / 100
    : Math.round(Number(existing.dupr_min ?? 2) * 100) / 100;
  const nextDuprMax = Object.prototype.hasOwnProperty.call(patch, "dupr_max")
    ? Math.round(Number(patch.dupr_max) * 100) / 100
    : Math.round(Number(existing.dupr_max ?? 8) * 100) / 100;
  if (!nextTitle) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!Number.isInteger(nextMaxPlayers) || nextMaxPlayers < 2) {
    return NextResponse.json(
      { error: "max_players must be a whole number (minimum 2)" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(nextPricePerPlayer) || nextPricePerPlayer < 0) {
    return NextResponse.json(
      { error: "price_per_player must be a whole number (0 or higher)" },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(nextDuprMin) ||
    !Number.isFinite(nextDuprMax) ||
    nextDuprMin < 2 ||
    nextDuprMax > 8 ||
    nextDuprMin > nextDuprMax
  ) {
    return NextResponse.json(
      { error: "DUPR range must be between 2.00 and 8.00 (decimals allowed)" },
      { status: 400 },
    );
  }
  const nextAcceptsGcash = Object.prototype.hasOwnProperty.call(patch, "accepts_gcash")
    ? Boolean(patch.accepts_gcash)
    : Boolean(existing.accepts_gcash);
  const nextAcceptsMaya = Object.prototype.hasOwnProperty.call(patch, "accepts_maya")
    ? Boolean(patch.accepts_maya)
    : Boolean(existing.accepts_maya);
  const nextGcashAccountName = Object.prototype.hasOwnProperty.call(patch, "gcash_account_name")
    ? String(patch.gcash_account_name ?? "").trim()
    : String(existing.gcash_account_name ?? "").trim();
  const nextGcashAccountNumber = Object.prototype.hasOwnProperty.call(patch, "gcash_account_number")
    ? String(patch.gcash_account_number ?? "").trim()
    : String(existing.gcash_account_number ?? "").trim();
  const nextMayaAccountName = Object.prototype.hasOwnProperty.call(patch, "maya_account_name")
    ? String(patch.maya_account_name ?? "").trim()
    : String(existing.maya_account_name ?? "").trim();
  const nextMayaAccountNumber = Object.prototype.hasOwnProperty.call(patch, "maya_account_number")
    ? String(patch.maya_account_number ?? "").trim()
    : String(existing.maya_account_number ?? "").trim();
  if (nextPricePerPlayer > 0 && !nextAcceptsGcash && !nextAcceptsMaya) {
    return NextResponse.json(
      { error: "At least one payment method is required for paid open play" },
      { status: 400 },
    );
  }
  if (nextAcceptsGcash && (!nextGcashAccountName || !nextGcashAccountNumber)) {
    return NextResponse.json(
      { error: "GCash account name and number are required when enabled" },
      { status: 400 },
    );
  }
  if (nextAcceptsGcash && !isValidPhMobile(nextGcashAccountNumber)) {
    return NextResponse.json(
      { error: "GCash account number must be a valid PH mobile number" },
      { status: 400 },
    );
  }
  if (nextAcceptsMaya && (!nextMayaAccountName || !nextMayaAccountNumber)) {
    return NextResponse.json(
      { error: "Maya account name and number are required when enabled" },
      { status: 400 },
    );
  }
  if (nextAcceptsMaya && !isValidPhMobile(nextMayaAccountNumber)) {
    return NextResponse.json(
      { error: "Maya account number must be a valid PH mobile number" },
      { status: 400 },
    );
  }
  patch.accepts_gcash = nextAcceptsGcash;
  patch.gcash_account_name = nextAcceptsGcash ? nextGcashAccountName : null;
  patch.gcash_account_number = nextAcceptsGcash ? nextGcashAccountNumber : null;
  patch.accepts_maya = nextAcceptsMaya;
  patch.maya_account_name = nextAcceptsMaya ? nextMayaAccountName : null;
  patch.maya_account_number = nextAcceptsMaya ? nextMayaAccountNumber : null;
  patch.title = nextTitle;
  patch.description = nextDescription || undefined;
  patch.max_players = nextMaxPlayers;
  patch.price_per_player = nextPricePerPlayer;
  patch.dupr_min = nextDuprMin;
  patch.dupr_max = nextDuprMax;
  const updated = await updateRow<OpenPlaySession>("open_play_sessions", id, patch);
  return NextResponse.json(updated as OpenPlaySession);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getOpenPlayById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isHost = existing.host_user_id === user.id;
  if (user.role !== "superadmin" && !isHost) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteRow("open_play_sessions", id);
  return NextResponse.json({ ok: true });
}
