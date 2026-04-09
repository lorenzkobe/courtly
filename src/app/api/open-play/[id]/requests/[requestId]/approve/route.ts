import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getOpenPlayById,
  setOpenPlayJoinRequestDecision,
} from "@/lib/data/courtly-db";

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
  const canApprove = user.role === "superadmin" || session.host_user_id === user.id;
  if (!canApprove) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { organizer_note?: string };
  const requestRecord = await setOpenPlayJoinRequestDecision({
    sessionId: id,
    requestId,
    status: "approved",
    decidedByUserId: user.id,
    organizerNote: body.organizer_note?.trim(),
  });
  if (!requestRecord) {
    return NextResponse.json({ error: "Request is not approvable" }, { status: 409 });
  }
  return NextResponse.json({ request: requestRecord });
}
