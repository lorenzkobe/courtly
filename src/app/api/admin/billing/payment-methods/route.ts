import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listPlatformPaymentMethods } from "@/lib/data/courtly-db";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const methods = await listPlatformPaymentMethods(true);
  return NextResponse.json({ methods });
}
