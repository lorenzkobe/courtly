import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createNotificationRepository } from "@/lib/notifications/repository-factory";

const repo = createNotificationRepository();

export async function GET() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await repo.listForUser(user.id);
  return NextResponse.json(data);
}

export async function PATCH() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await repo.markAllRead(user.id);
  return NextResponse.json({ ok: true });
}
