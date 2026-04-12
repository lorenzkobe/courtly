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
    existing.host_user_id === user.id
      ? listOpenPlayJoinRequestsBySession(id)
      : Promise.resolve([]),
    listOpenPlayCommentsBySession(id),
    countOpenPlayJoinRequestsBySession(id),
    existing.court_id ? getCourtById(existing.court_id) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    session: existing,
    court: court ?? null,
    my_request: myRequest,
    pending_requests: requests.filter((request) =>
      ["pending_approval", "payment_locked", "waitlisted"].includes(request.status),
    ),
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
  if (isHost && user.role !== "superadmin") {
    return NextResponse.json(
      { error: "Organizers cannot update an open play session" },
      { status: 403 },
    );
  }

  const patch = (await req.json()) as Partial<OpenPlaySession>;
  const forbiddenKeys = ["host_user_id", "booking_group_id", "court_id", "sport", "date", "start_time", "end_time"];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      return NextResponse.json({ error: `${key} cannot be changed` }, { status: 400 });
    }
  }
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
