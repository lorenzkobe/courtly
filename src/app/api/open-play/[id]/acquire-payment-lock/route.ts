import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  acquireOpenPlayPaymentLock,
  getOpenPlayById,
} from "@/lib/data/courtly-db";
import { assertOpenPlayAllowsPaymentFlow } from "@/lib/open-play/lifecycle";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const session = await getOpenPlayById(id);
  if (!session) {
    return NextResponse.json({ error: "Open play not found" }, { status: 404 });
  }
  const gate = assertOpenPlayAllowsPaymentFlow(session, Date.now());
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 409 });
  }
  if (session.host_user_id === user.id) {
    return NextResponse.json({ error: "Host cannot join own open play" }, { status: 400 });
  }

  const payload = await acquireOpenPlayPaymentLock({
    sessionId: id,
    userId: user.id,
    lockMinutes: 5,
  });
  return NextResponse.json(payload);
}
