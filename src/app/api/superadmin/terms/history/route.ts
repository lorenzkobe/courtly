import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listTermsVersionHistory } from "@/lib/data/courtly-db";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const versions = await listTermsVersionHistory();
  return NextResponse.json({ versions });
}
