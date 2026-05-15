import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { resetAdminAcceptance } from "@/lib/data/courtly-db";

export async function POST(
  _req: Request,
  context: { params: Promise<{ adminId: string }> },
) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { adminId } = await context.params;
  if (!adminId) {
    return NextResponse.json({ error: "Missing adminId" }, { status: 400 });
  }
  await resetAdminAcceptance({ adminId });
  return NextResponse.json({ ok: true });
}
