import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { updateOpenPlayComment } from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: sessionId, commentId } = await ctx.params;
  const body = (await req.json()) as { comment?: string };
  const commentText = body.comment?.trim();
  if (!commentText) {
    return NextResponse.json({ error: "Comment is required" }, { status: 400 });
  }
  if (commentText.length > 600) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }

  const result = await updateOpenPlayComment({
    sessionId,
    commentId,
    userId: user.id,
    comment: commentText,
  });
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (result.error === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "You can only edit a comment within 15 minutes of posting." },
      { status: 403 },
    );
  }
  return NextResponse.json({ comment: result.comment });
}
