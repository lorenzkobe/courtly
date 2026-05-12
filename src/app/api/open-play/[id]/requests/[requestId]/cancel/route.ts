import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { cancelOpenPlayJoinRequest } from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ id: string; requestId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, requestId } = await ctx.params;
  const request = await cancelOpenPlayJoinRequest({
    sessionId: id,
    requestId,
    userId: user.id,
  });
  if (!request) {
    return NextResponse.json({ error: "Request is not cancellable" }, { status: 409 });
  }
  return NextResponse.json({ request });
}
