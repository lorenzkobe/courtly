import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { LocalPlaceholderNotificationRepository } from "@/lib/notifications/adapters/local-placeholder";

type Ctx = { params: Promise<{ id: string }> };

const repo = new LocalPlaceholderNotificationRepository();

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
