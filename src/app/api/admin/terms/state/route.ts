import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { getAdminTermsState } from "@/lib/data/courtly-db";

export async function GET() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ status: "no_terms" });
  }
  const state = await getAdminTermsState(user.id);
  return NextResponse.json(state);
}
