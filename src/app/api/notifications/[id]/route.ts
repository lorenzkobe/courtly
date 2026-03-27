import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createNotificationRepository } from "@/lib/notifications/repository-factory";

type Ctx = { params: Promise<{ id: string }> };

const repo = createNotificationRepository();

export async function PATCH(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  await repo.markRead(id, user.id);

  return NextResponse.json({
    ok: true,
    status: "placeholder",
    message: "Read state persistence will be enabled when Supabase notifications are implemented.",
  });
}
