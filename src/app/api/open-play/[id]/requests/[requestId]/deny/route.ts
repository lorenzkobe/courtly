import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getOpenPlayById,
  setOpenPlayJoinRequestDecision,
} from "@/lib/data/courtly-db";
import { isOpenPlayTerminalDbStatus } from "@/lib/open-play/lifecycle";
import { emitOpenPlayDecisionToUser } from "@/lib/notifications/emit-from-server";

type Ctx = { params: Promise<{ id: string; requestId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, requestId } = await ctx.params;
  const session = await getOpenPlayById(id);
  if (!session) {
    return NextResponse.json({ error: "Open play not found" }, { status: 404 });
  }
  if (isOpenPlayTerminalDbStatus(session.status)) {
    return NextResponse.json({ error: "Open play is closed" }, { status: 409 });
  }
  const canDeny = user.role === "superadmin" || session.host_user_id === user.id;
  if (!canDeny) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { organizer_note?: string };
  const requestRecord = await setOpenPlayJoinRequestDecision({
    sessionId: id,
    requestId,
    status: "denied",
    decidedByUserId: user.id,
    organizerNote: body.organizer_note?.trim(),
  });
  if (!requestRecord) {
    return NextResponse.json({ error: "Request is not deniable" }, { status: 409 });
  }
  await emitOpenPlayDecisionToUser({
    userId: requestRecord.user_id,
    sessionId: id,
    sessionTitle: session.title,
    decision: "denied",
  });
  return NextResponse.json({ request: requestRecord });
}
