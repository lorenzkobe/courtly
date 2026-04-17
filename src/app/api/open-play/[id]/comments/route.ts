import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  createOpenPlayComment,
  getOpenPlayById,
  getOpenPlayJoinRequestByUser,
} from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const session = await getOpenPlayById(id);
  if (!session) {
    return NextResponse.json({ error: "Open play not found" }, { status: 404 });
  }
  const isHost = session.host_user_id === user.id;
  if (!isHost) {
    const myRequest = await getOpenPlayJoinRequestByUser(id, user.id);
    const allowedStatuses = new Set(["pending_approval", "approved", "payment_locked"]);
    if (!myRequest || !allowedStatuses.has(myRequest.status)) {
      return NextResponse.json(
        { error: "Only requested or accepted players can comment" },
        { status: 403 },
      );
    }
  }
  const body = (await req.json()) as { comment?: string };
  const commentText = body.comment?.trim();
  if (!commentText) {
    return NextResponse.json({ error: "Comment is required" }, { status: 400 });
  }
  if (commentText.length > 600) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }
  const comment = await createOpenPlayComment({
    sessionId: id,
    userId: user.id,
    comment: commentText,
  });
  return NextResponse.json({ comment }, { status: 201 });
}
