import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listAdminAcceptanceStatuses } from "@/lib/data/courtly-db";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await listAdminAcceptanceStatuses();
  return NextResponse.json(result);
}
